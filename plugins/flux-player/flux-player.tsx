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

      if (typeof window.AudioContext !== "undefined") {
        const actx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        actx.resume().then(() => actx.close());
      }

      if (currentEl) {
        currentEl.remove();
      }

      const playerEl = document.createElement("movi-player");
      playerEl.style.width = "100%";
      playerEl.style.height = "100%";
      playerEl.setAttribute("autoplay", "");
      playerEl.setAttribute("controls", "");
      playerEl.setAttribute("fallback", "native");
      if (title) playerEl.setAttribute("title", title);

      currentEl = playerEl;
      containerRef.current?.appendChild(playerEl);
      window.dispatchEvent(new CustomEvent("video.modal.show"));

      const resolvePromise = source
        ? window.__pluginRpc(source + ".resolve", { url })
        : Promise.resolve({ url });

      const result = await resolvePromise.catch(() => ({ url }));
      const streamUrl = result?.url || url;

      if (currentEl === playerEl) {
        playerEl.setAttribute("src", streamUrl);
      }
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
      className="absolute inset-0 bg-black flex items-center justify-center"
    />
  );
}
