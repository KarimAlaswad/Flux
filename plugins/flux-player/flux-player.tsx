import "movi-player"
import { useEffect, useRef } from "react";

export default function MoviPlayer({ item }: { item: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.createElement("movi-player");
    el.style.width = "100%";
    el.style.height = "100%";

    const onLoad = (e: any) => {
      const { url, title, source } = e.detail || {};
      if (!url) return;
      const resolvePromise = source
        ? window.__pluginRpc(source + ".resolve", { url })
        : Promise.resolve({ url })
      resolvePromise.then((result: any) => {
        const streamUrl = result?.url || url
        if (containerRef.current && !el.isConnected) {
          el.setAttribute("src", streamUrl)
          if (title) el.setAttribute("title", title)
          containerRef.current.appendChild(el)
        }
        window.dispatchEvent(new CustomEvent("video.modal.show"))
      }).catch((err: any) => {
        console.error("[flux-player] resolve error:", err?.message ?? err)
        // Fallback: play original URL
        window.dispatchEvent(new CustomEvent("video.modal.show"))
      })
    };

    const onHide = () => {
      el.remove();
      window.dispatchEvent(new CustomEvent("video.modal.hide"));
    };

    window.addEventListener("video.player.load", onLoad);
    window.addEventListener("video.player.hide", onHide);
    return () => {
      window.removeEventListener("video.player.load", onLoad);
      window.removeEventListener("video.player.hide", onHide);
      el.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black flex items-center justify-center"
    />
  );
}
