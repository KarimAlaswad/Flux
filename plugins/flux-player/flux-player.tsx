import "movi-player"
import { Logger, LogLevel } from "movi-player"
import { useEffect, useRef } from "react"

// movi-player's Logger routes through globalThis.__movilog
globalThis.__movilog = console
Logger.setLevel(LogLevel.INFO)

export default function MoviPlayer({ item }: { item: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentEl: HTMLElement | null = null;

    const onLoad = async(e: any) => {
      const { url, title, source } = e.detail || {};
      if (!url) return;

      const resolvePromise = source
        ? window.__pluginRpc(source + ".resolve", { url })
        : Promise.resolve({ url });

      const result = await resolvePromise.catch(() => ({ url }));
      const streamUrl = result?.url || url;

      if (currentEl) {
        currentEl.remove();
      }

      currentEl = document.createElement("movi-player");
      currentEl.style.width = "100%";
      currentEl.style.height = "100%";
      currentEl.setAttribute("src", streamUrl);
      currentEl.setAttribute("autoplay", "");
      currentEl.setAttribute("controls", "");
      currentEl.setAttribute("fallback", "native");
      if (title) currentEl.setAttribute("title", title);

      containerRef.current?.appendChild(currentEl);
      window.dispatchEvent(new CustomEvent("video.modal.show"));
    };

    const onHide = () => {
      if (currentEl) {
        currentEl.remove();
        currentEl = null;
      }
      window.dispatchEvent(new CustomEvent("video.modal.hide"));
    };

    window.addEventListener("video.player.load", onLoad);
    window.addEventListener("video.player.hide", onHide);
    return () => {
      window.removeEventListener("video.player.load", onLoad)
      window.removeEventListener("video.player.hide", onHide);
      if (currentEl) currentEl.remove();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-black flex items-center justify-center"
    />
  );
}
