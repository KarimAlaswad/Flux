import { startStdin } from "#shared/stdin.ts"
import { Innertube, UniversalCache } from "youtubei.js"
import { join } from "path"
import { existsSync, readFileSync } from "fs"

let cookieStr: string | null = null
const cookieFile = join(import.meta.dir, "..", "..", ".youtube-cookie")

try {
  const data = readFileSync(cookieFile, "utf-8").trim()
  if (data) cookieStr = data 
} catch {}

startStdin(async ({ method, params, id }, send) => {

  try {
    if (method === "search") {
      if (!cookieStr) { send(id, null, "Not authenticated"); return }
      const tube = await Innertube.create({ cookie: cookieStr, cache: new UniversalCache(true) })
      const search = await Promise.race([
        tube.search(params.query),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ])
      const results = (search.videos || []).slice(0, params.limit || 10).map((v: any) => ({
        title: v.title?.text || "Untitled",
        videoId: v.id,
        channel: v.author?.name || "Unknown",
        views: v.views || v.short_view_count?.toString() || "",
        duration: v.duration?.seconds || 0,
        thumbnail: v.thumbnails?.[0]?.url || "",
      }))
      send(id, results)
    } else {
      send(id, null, "Method not found: " + method)
    }
  } catch (e: any) {
    send(id, null, e.message || String(e))
  }
})