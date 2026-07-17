import { useEffect, useRef } from "react"
import { init, command, observeProperties } from "tauri-plugin-libmpv-api"

const OBSERVED = [
  ["pause", "flag"],
  ["time-pos", "double", "none"],
  ["duration", "double", "none"],
] as const

export default function MpvPlayer() {
  const inited = useRef(false)

  useEffect(() => {
    if (inited.current) return
    inited.current = true
    init({
      initialOptions: {
        "osc": "yes",
        "osd-level": "3",
        "vo": "gpu-next",
        "hwdec": "auto-safe",
        "keep-open": "yes",
    },
    observedProperties: OBSERVED,
    }).catch((e: any) => console.error("[mp-player] init failed:", e))
  }, [])

  useEffect(() => {
    const h = async (e: any) => {
      const { url, title } = e.detail
      try {
        await command("loadfile", [url])
        window.dispatchEvent(new CustomEvent("modal-load", { detail: { title } }))
      } catch (e: any) {
        console.error(e.message || "Failed to play")
      }
    }
    window.addEventListener("player-load", h)
    return () => window.removeEventListener("player-load", h)
  }, [])

  useEffect(() => {
    const close = () => { command("stop", []) }
    window.addEventListener("modal-close", close)
    return () => window.removeEventListener("modal-close", close)
  }, [])

  return null
}