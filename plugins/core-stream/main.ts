import { startStdin } from "#shared/stdin.ts";

// core-stream: localhost proxy so fetch()-based players (movi-player)
// can stream from hosts that omit CORS headers (googlevideo.com).
// Same pattern as core-serve/core-static: thin core plugin, all logic here,
// host stays dumb. Auto-discovered on next host restart (run field).

const PORT = Number(process.env.STREAM_PORT || 1935);

// Allowlist: proxy only media hosts, never arbitrary URLs.
const ALLOWED = /(^|\.)(googlevideo\.com|ytimg\.com|youtube\.com|youtu\.be)$/;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        base: `http://127.0.0.1:${server.port}`,
      });
    }
    if (url.pathname === "/stream") {
      const target = url.searchParams.get("u") || "";
      let host = "";
      try {
        host = new URL(target).hostname;
      } catch {
        return new Response("bad u param", { status: 400, headers: cors() });
      }
      if (!target.startsWith("https://") || !ALLOWED.test(host)) {
        return new Response("host not allowed", {
          status: 403,
          headers: cors(),
        });
      }
      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      };
      for (const h of ["range", "if-range"]) {
        const v = req.headers.get(h);
        if (v) headers[h] = v;
      }
      try {
        const upstream = await fetch(target, { headers });
        const out: Record<string, string> = {
          ...cors(),
          "Accept-Ranges": "bytes",
        };
        for (const h of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
        ]) {
          const v = upstream.headers.get(h);
          if (v) out[h] = v;
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: out,
        });
      } catch (e: any) {
        return new Response("upstream failed: " + (e?.message || e), {
          status: 502,
          headers: cors(),
        });
      }
    }
    return new Response(
      "core-stream proxy. Use /stream?u=<encoded https url>",
      {
        headers: cors(),
      },
    );
  },
});

console.log(`[core-stream] proxy on http://127.0.0.1:${server.port}`);

startStdin(async ({ method, id }, send) => {
  if (method === "getUrl") {
    send(id, { base: `http://127.0.0.1:${server.port}` });
    return;
  }
  send(id, null, "Method not found: " + method);
});
