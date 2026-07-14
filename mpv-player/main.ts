import { startStdin } from "#shared/stdin.ts"
import { Innertube, UniversalCache } from "youtubei.js"

startStdin(async (request, send) => {
  const method = request.method
  const params = request.params
  const reqId = request.id

  try {
    if (method === "load") {
      const { videoId, service, title } = params
      let streamUrl = ""

      if (service === "youtube") {
        
      }
    }
  }
})