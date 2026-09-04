import { startStdin } from "#shared/stdin.ts";
import { Innertube, Platform, UniversalCache } from "youtubei.js";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// Provide Bun-compatible JS evaluator for YouTube's decipher functions.
// YouTube.js v17 extracts decipher functions from YouTube's player script and
// needs to evaluate them at runtime (signature + nsig transformation). On Node
// this uses the `vm` module, but Bun doesn't have it — so we provide a simple
// eval via `new Function`.
const _origEval = Platform.shim.eval;
Platform.shim.eval = (data: any, _env: any) => new Function(data.output)();

let cookieStr: string | null = null;
const cookieFile = join(import.meta.dir, "..", "..", ".youtube-cookie");
let tube: any = null;

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

startStdin(async ({ method, params, id }, send) => {
  try {
    if (method === "feed") {
      const fresh = loadCookie();
      if (fresh) cookieStr = fresh;
      if (!cookieStr) {
        send(id, null, "Not Authenticated");
        return;
      }
      if (!tube) {
        tube = await Innertube.create({
          cookie: cookieStr,
          cache: new UniversalCache(true),
        });
      }

      const home = await Promise.race([
        tube.getHomeFeed(),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000),
        ),
      ]);
      const grid = home.contents;
      let seenFeedNudge = false;
      const videos: any[] = [];
      for (const section of grid?.contents || []) {
        let items: any[] = [];
        if (
          section.type === "RichItem" &&
          section.content?.type === "LockupView" &&
          section.content?.content_type === "VIDEO"
        )
          items = [section.content];
        else if (
          section.type === "RichSection" &&
          section.content?.type === "RichShelf" &&
          section.content?.contents
        )
          items = section.content.contents
            .filter(
              (i: any) =>
                i.content?.type === "LockupView" &&
                i.content?.content_type === "VIDEO",
            )
            .map((i: any) => i.content);
        else if (
          section.type === "RichSection" &&
          section.content?.type === "FeedNudge"
        )
          seenFeedNudge = true;
        for (const v of items) {
          const md = v.metadata || {};
          const parts = md.metadata?.metadata_rows?.[0]?.metadata_parts || [];
          videos.push({
            title: md.title?.text || "Untitled",
            videoId: v.content_id,
            channel: parts[0]?.text?.text || "",
            views: parts[1]?.text?.text || "",
            published: parts[2]?.text?.text || "",
            thumbnail: v.content_image?.image?.[0]?.url || "",
            url: "https://www.youtube.com/watch?v=" + v.content_id,
          });
        }
      }
      if (videos.length === 0 && seenFeedNudge) {
        send(id, null, "Not Authenticated (cookie expired)");
        return;
      }
      send(id, videos.slice(0, params.limit || 30));
    } else if (method === "resolve") {
      const url = params?.url;
      if (!url) {
        send(id, null, "Missing url");
        return;
      }
      const videoId = new URL(url).searchParams.get("v");
      if (!videoId) {
        send(id, null, "Invalid Youtube URL");
        return;
      }
      if (!tube) {
        tube = await Innertube.create({
          cookie: cookieStr,
          cache: new UniversalCache(true),
        });
      }
      // Direct progressive URLs first (ANDROID client still serves them, no SABR/UMP).
      // SABR URLs ignore Range requests, which fetch-based players (movi) require.
      let streamUrl: string | null = null;
      try {
        const basic: any = await tube.getBasicInfo(videoId, {
          client: "ANDROID",
        });
        const fmts: any[] = basic.streaming_data?.formats || [];
        const direct =
          fmts.find((f: any) => f.url && f.mime_type?.includes("mp4")) ||
          fmts.find((f: any) => f.url);
        if (direct?.url) streamUrl = direct.url;
      } catch {}
      if (streamUrl) {
        send(id, { url: streamUrl, client: "ANDROID", sabr: false });
        return;
      }
      try {
        const info: any = await tube.getInfo(videoId);
        const sd: any = info.streaming_data;
        const sabr: string | null =
          sd?.server_abr_streaming_url || sd?.serverAbrStreamingUrl || null;
        if (sabr && typeof sabr === "string" && sabr.startsWith("http"))
          streamUrl = sabr;
        if (!streamUrl) {
          const chosen: any = info.chooseFormat({
            type: "video+audio",
            format: "mp4",
            quality: "best",
          });
          streamUrl =
            chosen?.url ||
            (chosen?.decipher
              ? await chosen.decipher(tube.session.player)
              : null);
        }
      } catch {}
      if (!streamUrl) {
        const format = await tube.getStreamingData(videoId, {
          type: "video+audio",
          format: "mp4",
          quality: "best",
        });
        streamUrl =
          format?.url ||
          (format?.decipher
            ? await format.decipher(tube.session.player)
            : null) ||
          url;
      }
      send(id, { url: streamUrl || url });
    } else {
      send(id, null, "Method not found: " + method);
    }
  } catch (e: any) {
    send(id, null, e.message || String(e));
  }
});
