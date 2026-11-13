import React, { useEffect, useState } from "react";
import { MpvPrismVideo, useMpvPrismPlayer } from "@mpv-prism/react";
import "./player.css";

// Stable configuration outside the component prevents infinite re-render loops
const MPV_CONFIG = {
  options: {
    "keep-open": "yes",
    "hwdec": "auto-safe",
    "user-agent": "Mozilla/5.0"
  },
};

function MpvActiveVideo({
  url,
  title,
  aspectRatio,
}: {
  url: string;
  title?: string;
  aspectRatio: string;
}) {
  const player = useMpvPrismPlayer({
    playerId: "flux-mpv-player",
    mpv: MPV_CONFIG,
  });

  useEffect(() => {
    if (player && url) {
      player.load(url);
    }
  }, [player, url]);

  return (
    <div
      className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-lg shadow-2xl"
      style={{
        aspectRatio: aspectRatio,
        width: "100%",
        height: "100%",
      }}
    >
      <MpvPrismVideo
        player={player}
        className="w-full h-full"
        fit="contain"
        presentationMode="canvas"
        frameTransport="cpu"
      >
        {title && (
          <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded bg-black/60 text-white text-sm backdrop-blur-sm pointer-events-none">
            {title}
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10 flex gap-2">
          <button
            onClick={() => player?.setPaused(!player.paused)}
            className="px-3 py-1.5 rounded-md bg-neutral-900/80 hover:bg-neutral-800 text-white text-xs font-medium backdrop-blur-sm transition-colors border border-neutral-700/50"
          >
            Play / Pause
          </button>
        </div>
      </MpvPrismVideo>
    </div>
  );
}

export default function MpvPlayer({ item }: { item?: any }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<string>("16 / 9");

  useEffect(() => {
    const onLoad = async (e: any) => {
      const { url, title, source, item: srcItem } = e.detail || {};
      if (!url) return;

      const resolvePromise = source
        ? (window as any).__pluginRpc?.(source + ".resolve", { url })
        : Promise.resolve({ url });

      const result = (await resolvePromise?.catch(() => ({ url }))) || { url };
      let streamUrl = result?.url || url;

      if (streamUrl.includes("googlevideo.com")) {
        let base: string | null = null;
        try {
          const proxy: any = await (window as any).__pluginRpc?.(
            "core-stream.getUrl",
            {}
          );
          base = proxy?.base || proxy?.result?.base || null;
        } catch {}
        if (!base) base = "http://127.0.0.1:1935";
        streamUrl = `${base}/stream?u=${encodeURIComponent(streamUrl)}`;
      }

      if (srcItem?.width && srcItem?.height) {
        setAspectRatio(`${srcItem.width} / ${srcItem.height}`);
      } else {
        setAspectRatio("16 / 9");
      }

      setVideoTitle(title || "");
      setActiveUrl(streamUrl);

      window.dispatchEvent(new CustomEvent("video.modal.show"));
    };

    const onHide = () => {
      setActiveUrl(null);
      window.dispatchEvent(new CustomEvent("video.modal.hide"));
    };

    window.addEventListener("video.player.load", onLoad);
    window.addEventListener("video.player.hide", onHide);

    return () => {
      window.removeEventListener("video.player.load", onLoad);
      window.removeEventListener("video.player.hide", onHide);
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden p-2">
      {activeUrl ? (
        <MpvActiveVideo
          url={activeUrl}
          title={videoTitle}
          aspectRatio={aspectRatio}
        />
      ) : null}
    </div>
  );
}
