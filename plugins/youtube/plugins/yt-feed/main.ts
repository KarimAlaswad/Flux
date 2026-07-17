import { startStdin } from "#shared/stdin.ts";
import { Innertube, UniversalCache } from "youtubei.js";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

let cookieStr: string | null = null;
const cookieFile = join(import.meta.dir, "..", "..", ".youtube-cookie");

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
    const tube = await Innertube.create({
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
      const tube = await Innertube.create({
        cookie: cookieStr,
        cache: new UniversalCache(true),
      });
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
    } else {
      send(id, null, "Method not found: " + method);
    }
  } catch (e: any) {
    send(id, null, e.message || String(e));
  }
});
