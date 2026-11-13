import "movi-player";
import { Logger, LogLevel } from "movi-player";
import { useEffect, useRef } from "react";

// movi-player's Logger routes through globalThis.__movilog
globalThis.__movilog = console;
Logger.setLevel(LogLevel.INFO);

export default function MoviPlayer({ item }: { item: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentEl: HTMLElement | null = null;

    const onLoad = async (e: any) => {
      const { url, title, source } = e.detail || {};
      if (!url) return;

      const resolvePromise = source
        ? window.__pluginRpc(source + ".resolve", { url })
        : Promise.resolve({ url });

      const result = await resolvePromise.catch(() => ({ url }));
      let streamUrl = result?.url || url;
      // Same-origin proxy for googlevideo (CORS): movi-player uses fetch(),
      // which YouTube blocks cross-origin. Route via core-stream when live.
      if (streamUrl.includes("googlevideo.com")) {
        let base: string | null = null;
        try {
          const proxy: any = await (window as any).__pluginRpc?.(
            "core-stream.getUrl",
            {},
          );
          base = proxy?.base || proxy?.result?.base || null;
        } catch {}
        if (!base) base = "http://127.0.0.1:1935";
        streamUrl = `${base}/stream?u=${encodeURIComponent(streamUrl)}`;
      }

      if (currentEl) {
        currentEl.remove();
      }

      currentEl = document.createElement("movi-player");
      // Fill container but adapt to video's native aspect — 16:9 wide, 9:16 tall centered
      currentEl.style.width = "100%";
      currentEl.style.height = "100%";
      currentEl.style.maxWidth = "100%";
      currentEl.style.maxHeight = "100%";
      currentEl.style.aspectRatio = "16 / 9";
      (currentEl.style as any).objectFit = "contain";
      // Use item-provided dimensions if available for instant sizing
      const srcItem = (e.detail as any)?.item;
      if (srcItem?.width && srcItem?.height) {
        currentEl.style.aspectRatio = `${srcItem.width} / ${srcItem.height}`;
        if (srcItem.height > srcItem.width) {
          currentEl.style.width = "auto";
          currentEl.style.height = "100%";
        }
      }
      currentEl.setAttribute("src", streamUrl);
      currentEl.setAttribute("autoplay", "");
      currentEl.setAttribute("controls", "");
      currentEl.setAttribute("fallback", "native");
      if (title) currentEl.setAttribute("title", title);

      // Update to true video dimensions once metadata loads — no stretch, no crop
      const setRatio = () => {
        const video: HTMLVideoElement | null =
          (currentEl as any)?.shadowRoot?.querySelector("video") ??
          (currentEl as any)?.querySelector("video");
        if (video?.videoWidth && video?.videoHeight) {
          currentEl!.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
          if (video.videoHeight > video.videoWidth) {
            currentEl!.style.width = "auto";
            currentEl!.style.height = "100%";
          } else {
            currentEl!.style.width = "100%";
            currentEl!.style.height = "auto";
          }
        }
      };
      currentEl.addEventListener("loadedmetadata", setRatio, { once: true });
      setTimeout(setRatio, 1000);

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
      window.removeEventListener("video.player.load", onLoad);
      window.removeEventListener("video.player.hide", onHide);
      if (currentEl) currentEl.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden p-2 [&>movi-player]:max-h-full [&>movi-player]:max-w-full"
    />
  );
}
