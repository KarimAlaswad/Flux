import { startStdin } from "#shared/stdin.ts";
import { Innertube, Platform, UniversalCache } from "youtubei.js";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// Bun-compatible JS evaluator for YouTube decipher (same as yt-video/main.ts)
const _origEval = Platform.shim.eval;
Platform.shim.eval = (data: any, _env: any) => new Function(data.output)();

let cookieStr: string | null = null;
const cookieFile = join(import.meta.dir, "..", "..", ".youtube-cookie");
let tube: any = null;
// Persist last hashtag feed per continuation token for infinite scroll
const feedCache = new Map<string, any>();
// Resolved stream URLs by videoId — avoids re-resolving when scrolling back up
const resolveCache = new Map<string, { url: string; at: number }>();
const MAX_FEED_CACHE = 5;
const RESOLVE_TTL_MS = 30 * 60 * 1000; // 30 min, well under URL expiry (~6h)
function cacheFeed(token: string, feed: any) {
  feedCache.set(token, feed);
  // Cap: drop oldest tokens first — unbounded Map is a memory leak
  while (feedCache.size > MAX_FEED_CACHE) {
    const oldest = feedCache.keys().next().value;
    if (!oldest) break;
    feedCache.delete(oldest);
  }
}

function loadCookie(): string | null {
  try {
    if (existsSync(cookieFile)) {
      const data = readFileSync(cookieFile, "utf-8").trim();
      if (data) return data;
    }
  } catch {}
  return null;
}

const cached = loadCookie();
if (cached) {
  try {
    tube = await Innertube.create({
      cookie: cached,
      cache: new UniversalCache(true),
    });
    await tube.account.getInfo();
    cookieStr = cached;
  } catch {}
}

function mapHashtagVideos(feed: any): any[] {
  // AGENTS.md: fetch all data even if not all used — map full node
  const raw = feed.videos || [];
  return raw.map((v: any) => ({
    videoId: v.id,
    title: v.title?.text || "Untitled",
    author: v.author?.name || v.author || "",
    authorId: v.author?.id || null,
    thumbnails: v.thumbnails || [],
    thumbnail: v.thumbnails?.[0]?.url || v.thumbnail?.[0]?.url || "",
    viewCount: v.view_count?.text || "",
    published: v.published?.text || "",
    duration: v.duration,
    badges: v.badges || [],
    endpoint: v.endpoint || null,
    description: v.description || "",
    width: v.thumbnails?.[0]?.width || null,
    height: v.thumbnails?.[0]?.height || null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    // Keep raw for future UI fields without re-fetch
    _raw: v,
  }));
}

startStdin(async ({ method, params, id }, send) => {
  try {
    if (method === "feed") {
      const fresh = loadCookie();
      if (fresh) cookieStr = fresh;
      if (!tube) {
        tube = await Innertube.create({
          cookie: cookieStr || undefined,
          cache: new UniversalCache(true),
        });
      }

      // Option A: getHashtag("shorts") — stable, no personalized feed required
      // Visited: https://ytjs.dev/api/classes/Innertube.html — no getShortsFeed exists
      let feed: any;
      if (params.continuation) {
        const prev = feedCache.get(params.continuation);
        if (!prev) {
          send(id, null, "Invalid continuation token");
          return;
        }
        feed = await prev.getContinuation();
      } else {
        feed = await Promise.race([
          tube.getHashtag("shorts"),
          new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 12000),
          ),
        ]);
      }

      const items = mapHashtagVideos(feed);
      // Store feed for continuation; youtubei.js feeds have getContinuation()
      let continuation: string | null = null;
      if (feed.has_continuation || typeof feed.getContinuation === "function") {
        // Use a stable key derived from feed state; cache the feed object
        continuation = `cont_${items[items.length - 1]?.videoId || Date.now()}`;
        cacheFeed(continuation, feed);
      }

      send(id, {
        items: items.slice(0, params.limit || 20),
        continuation,
        hasMore: !!continuation,
      });
    } else if (method === "resolve") {
      const url: string | undefined = params?.url;
      const videoId: string | undefined =
        params?.videoId ||
        (url ? new URL(url).searchParams.get("v") || undefined : undefined);
      if (!videoId) {
        send(id, null, "Missing videoId/url");
        return;
      }
      // Serve cached resolve first — scrolling back up shouldn't re-hit YouTube
      const cached = resolveCache.get(videoId);
      if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) {
        console.log(`[yt-shorts] resolve ${videoId} -> cache hit`);
        send(id, {
          url: cached.url,
          client: "ANDROID",
          sabr: false,
          cached: true,
        });
        return;
      }
      if (cached) resolveCache.delete(videoId);
      if (!tube) {
        tube = await Innertube.create({
          cookie: cookieStr || undefined,
          cache: new UniversalCache(true),
        });
      }

      try {
        const ytdlpRes: any = await (window as any).__pluginRpc?.("core-ytdlp.resolve",
        { url: `https://www.youtube.com/watch?v=${videoId}` },
        );
        if (ytdlpRes?.url || ytdlpRes?.formats?.length) {
          console.log(`[yt-shorts] resolve ${videoId} -> core-ytdlp OK`);
          resolveCache.set(videoId, { url: ytdlpRes.url, at: Date.now() });
          send(id, ytdlpRes);
          return;
        }
      } catch (e) {
        console.log(`[yt-shorts] core-ytdlp skipped/failed, trying youtubei.js`);
      }

      // Direct progressive URLs first (ANDROID client still serves them, no SABR/UMP).
      // SABR URLs ignore Range requests, which fetch-based players (movi) require.
      let streamUrl: string | null = null;
      let lastErr: string | null = null;
      try {
        const basic: any = await tube.getBasicInfo(videoId, {
          client: "ANDROID",
        });
        const fmts: any[] = basic.streaming_data?.formats || [];
        // Prefer muxed mp4 (video+audio) — plain <video>/fetch can play it directly
        const direct =
          fmts.find((f: any) => f.url && f.mime_type?.includes("mp4")) ||
          fmts.find((f: any) => f.url);
        if (direct?.url) streamUrl = direct.url;
        else lastErr = "ANDROID: no direct format url";
      } catch (e: any) {
        lastErr = "ANDROID: " + (e?.message || String(e));
      }
      if (streamUrl) {
        console.log(
          `[yt-shorts] resolve ${videoId} -> ANDROID direct ${streamUrl.slice(0, 60)}...`,
        );
        resolveCache.set(videoId, { url: streamUrl, at: Date.now() });
        send(id, { url: streamUrl, client: "ANDROID", sabr: false });
        return;
      }
      try {
        const info: any = await tube.getInfo(videoId);
        const sd: any = info.streaming_data;
        // Legacy fallback: direct URLs (if YouTube ever restores them)
        if (!streamUrl) {
          const tries: any[] = [
            { type: "video+audio", format: "mp4", quality: "best" },
            { type: "video", format: "mp4", quality: "best" },
            { type: "video+audio", format: "any", quality: "best" },
            { type: "video", format: "any", quality: "best" },
          ];
          for (const opts of tries) {
            try {
              const chosen: any = info.chooseFormat(opts);
              let u: string | null = chosen?.url || null;
              if (!u && chosen?.decipher) {
                try {
                  u = await chosen.decipher(tube.session.player);
                } catch {}
              }
              if (u) {
                streamUrl = u;
                break;
              }
            } catch (e: any) {
              lastErr = e?.message || String(e);
            }
          }
        }
        if (!streamUrl) lastErr = "no SABR url and no direct format url";
      } catch (e: any) {
        lastErr = e?.message || String(e);
        // Ultimate fallback: getStreamingData
        const tries: any[] = [
          { type: "video+audio", format: "mp4", quality: "best" },
          { type: "video", format: "mp4", quality: "best" },
          { type: "video+audio", format: "any", quality: "best" },
        ];
        for (const opts of tries) {
          try {
            const fmt: any = await tube.getStreamingData(videoId, opts);
            let u: string | null = fmt?.url || null;
            if (!u && fmt?.decipher) {
              try {
                u = await fmt.decipher(tube.session.player);
              } catch {}
            }
            if (u) {
              streamUrl = u;
              break;
            }
          } catch (e2: any) {
            lastErr = e2?.message || String(e2);
          }
        }
      }
      console.log(
        `[yt-shorts] resolve ${videoId} -> ${streamUrl ? streamUrl.slice(0, 90) + "..." : "FAILED " + (lastErr || "")}`,
      );
      if (!streamUrl) {
        send(id, null, lastErr || "No matching formats found");
        return;
      }
      // Cache fallback-path URLs too (shorter TTL semantics, same entry)
      if (!streamUrl.includes("googlevideo.com/videoplayback")) {
        resolveCache.set(videoId, { url: streamUrl, at: Date.now() });
      }
      send(id, {
        url: streamUrl,
        sabr: !!streamUrl.includes("googlevideo.com/videoplayback"),
      });
    } else {
      send(id, null, "Method not found: " + method);
    }
  } catch (e: any) {
    send(id, null, e.message || String(e));
  }
});
