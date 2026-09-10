import { startStdin } from "../_shared/stdin.ts";

const cache = new Map<string, { data: any; at: number }>();
const TTL = 15 * 60 * 1000;

startStdin(async ({ method, params, id }, send) => {
  if (method === "resolve") {
    const url = params?.url;
    if (!url) {
      send(id, null, "Missing url parameters");
      return;
    }

    const cached = cache.get(url);
    if (cached && Date.now() - cached.at < TTL) {
      send(id, cached.data);
      return;
    }

    try {
      const proc = Bun.spawn([
        "yt-dlp",
        "-J",
        "--no-warnings",
        "--no-call-home",
        url,
      ]);

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0 || !stdout.trim()) {
        send(id, null, "yt-dlp extraction failed");
        return;
      }

      const json = JSON.parse(stdout);
      const rawFormats: any[] = json.formats || [];

      const progressive = rawFormats.filter(
        (f) => 
          f.vcodec &&
          f.vcodec !== "none" &&
          f.acodec &&
          f.acodec !== "none" &&
          f.url &&
          f.height,
      );

      progressive.sort((a, b) => (b.height || 0) - (a.height || 0));

      const seenHeights = new Set<number>();
      const formats: any[] = [];

      for (const f of progressive) {
        if (!seenHeights.has(f.height)) {
          seenHeights.add(f.height);
          formats.push({
            height: f.height,
            label: `${f.height}p`,
            url: f.url,
            ext: f.ext || "mp4",
            mime: `video/${f.ext || "mp4"}`,
          });
        }
      }

      const bestUrl = formats[0]?.url || json.url || null;
      if (!bestUrl) {
        send(id, null, "No direct stream URLs found");
        return;
      }

      const result = {
        title: json.title || "",
        duration: json.duration || 0,
        url: bestUrl,
        formats,
      };

      cache.set(url, { data: result, at: Date.now() });
      send(id, result);
    } catch (e: any) {
      send(id, null, e?.message || String(e));
    }
  } else {
    send(id, null, "Method not found: " + method);
  }
});