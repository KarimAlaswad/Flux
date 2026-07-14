import { join } from "path";
import { existsSync } from "fs";
import { startStdin } from "../_shared/stdin.ts";

const baseDir = process.argv[2] || join(import.meta.dir, "..", "..");
let server: any = null;

startStdin(async ({ method, params, id }, send) => {
  if (method === "start") {
    try {
      await fetch("http://localhost:5173", { method: "HEAD" });
      send(id, { url: "http://localhost:5173", type: "vite" });
      return;
    } catch {}
    const serveDir = join(baseDir, "dist");
    if (!existsSync(serveDir)) {
      send(id, null, "dist/ not found. Run 'vite build' first.");
      return;
    }
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname;
        if (pathname === "/") pathname = "/index.html";
        const file = Bun.file(join(serveDir, pathname));
        if (await file.exists()) return new Response(file);
        return new Response(Bun.file(join(serveDir, "index.html")), {
          status: 200,
        });
      },
    });
    send(id, {
      url: `http://localhost:${server!.port}`,
      type: "bun-serve",
    });
  } else if (method === "stop") {
    server?.stop();
    server = null;
    send(id, { success: true });
  } else {
    send(id, null, "Method not found: " + method);
  }
});
