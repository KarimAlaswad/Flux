import "movi-player";
import { useEffect, useRef, useState } from "react";

// Component: renders a single short item and manages creating / destroying
// the `movi-player` instance when the item enters/exits the viewport.
export default function ShortsPlayer({ item }: { item: any }) {
  // `ref` is the container element where the webcomponent will be attached.
  const ref = useRef<HTMLDivElement>(null);
  // `loaded`: whether the movi-player instance has finished initial setup.
  const [loaded, setLoaded] = useState(false);
  // `retry`: counter to trigger a reload attempt via effect dependency
  const [retry, setRetry] = useState(0);
  // `status`: small enum to drive loading spinner / errors
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  // `errorMsg`: display-friendly error text
  const [errorMsg, setErrorMsg] = useState("");
  // `elRef`: stores the created movi-player element for cleanup and control
  const elRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const initPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const myIdx = Number(item?.index ?? 0);

    const fail = (msg: string) => {
      if (cancelled) return;
      setErrorMsg(msg);
      setStatus("error");
    };

    // Helper: loads stream URL and creates <movi-player> (starts paused)
    const initPlayer = async (): Promise<any> => {
      if (elRef.current) return elRef.current;
      if (initPromiseRef.current) return await initPromiseRef.current;

      const runInit = async () => {
        const src = item?.url as string | undefined;
        if (!src) return null;

        let streamUrl = src;
        let resolveResult: any = null;
        const provider =
          item?.provider ||
          item?.source ||
          (item?.url?.includes("tiktok") ? "tiktok-shorts" : "yt-shorts");

        try {
          resolveResult = await (window as any).__pluginRpc?.(
            `${provider}.resolve`,
            { url: src, videoId: item?.videoId },
          );
          const next =
            resolveResult?.url || resolveResult?.result?.url || resolveResult;
          if (typeof next === "string" && next.startsWith("http"))
            streamUrl = next;
        } catch (e: any) {
          console.error("[shorts-player] resolve failed", e);
          fail(e?.message || "Could not resolve video stream");
          return null;
        }

        if (streamUrl.includes("youtube.com/watch")) {
          fail("Could not find a playable stream for this video");
          return null;
        }

        let finalUrl = streamUrl;
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
          finalUrl = `${base}/stream?u=${encodeURIComponent(streamUrl)}`;
        }

        if (cancelled || !ref.current) return null;

        setStatus("loading");
        const el = document.createElement("movi-player") as any;
        el.style.display = "block";
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.background = "black";
        el.setAttribute("src", finalUrl);
        el.setAttribute("controls", "");
        el.setAttribute("loop", "");
        el.setAttribute("playsinline", "");
        el.setAttribute("hdr", "false");
        el.setAttribute("ambientmode", "false");
        el.setAttribute("fallback", "native");
        el.setAttribute("preload", "auto");
        if (item?.title) el.setAttribute("title", item.title);

        const formatList: any[] = resolveResult?.formats || [];
        if (formatList.length > 0) {
          for (const fmt of formatList) {
            let fmtUrl = fmt.url;
            if (fmtUrl.includes("googlevideo.com")) {
              let base: string | null = null;
              try {
                const proxy: any = await (window as any).__pluginRpc?.(
                  "core-stream.getUrl",
                  {},
                );
                base = proxy?.base || proxy?.result?.base || null;
              } catch {}
              if (!base) base = "http://127.0.0.1:1935";
              fmtUrl = `${base}/stream?u=${encodeURIComponent(fmtUrl)}`;
            }

            const sourceEl = document.createElement("source");
            sourceEl.setAttribute("src", fmtUrl);
            sourceEl.setAttribute("label", fmt.label || `${fmt.height}p`);
            sourceEl.setAttribute("res", String(fmt.height || 720));
            sourceEl.setAttribute("type", fmt.mime || "video/mp4");
            el.appendChild(sourceEl);
          }
        } else {
          el.setAttribute("src", finalUrl);
        }

        ref.current.appendChild(el);
        elRef.current = el;
        setLoaded(true);
        setStatus("ready");
        return el;
      };

      initPromiseRef.current = runInit();
      const res = await initPromiseRef.current;
      initPromiseRef.current = null;
      return res;
    };

    // Evaluates state against active index
    const updatePoolState = async (activeIdx: number) => {
      if (cancelled) return;
      const safeActive = Number.isFinite(activeIdx) ? activeIdx : 0;

      if (myIdx === safeActive) {
        // Active: play immediately
        const player = elRef.current || (await initPlayer());
        if (player && !cancelled) {
          player.play?.().catch?.(() => {});
        }
      } else if (myIdx === safeActive + 1) {
        // Next short: preload & pause so it is buffered and ready
        const player = elRef.current || (await initPlayer());
        if (player && !cancelled) {
          player.pause?.();
        }
      } else {
        // All other shorts (including previous ones): keep mounted, stay paused
        if (elRef.current) {
          elRef.current.pause?.();
        }
      }
    };

    const onSnap = (e: any) => {
      const activeIdx = e.detail?.activeIdx ?? 0;
      updatePoolState(activeIdx);
    };

    // Initial check on mount
    const currentActive = (window as any).__fluxActiveShortIdx ?? 0;
    updatePoolState(currentActive);

    window.addEventListener("flux.shorts.snap", onSnap);

    return () => {
      cancelled = true;
      window.removeEventListener("flux.shorts.snap", onSnap);
      if (elRef.current) {
        elRef.current.remove();
        elRef.current = null;
      }
    };
  }, [item?.videoId, item?.index, retry]);

  const onRetry = () => {
    if (elRef.current) {
      elRef.current.remove();
      elRef.current = null;
    }
    setErrorMsg("");
    setStatus("idle");
    setRetry((r) => r + 1);
  };

  return (
    <div
      ref={ref}
      className="w-full h-full flex items-center justify-center bg-black relative snap-start overflow-hidden pointer-events-none"
    >
      {/* Thumbnail placeholder until first frame */}
      {!loaded && item?.thumbnail && (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-contain opacity-80"
        />
      )}
      {/* Loading spinner while resolving/streaming */}
      {(status === "loading" || status === "idle") && !loaded && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ background: "rgba(12, 12, 15, 0.5)" }}
        >
          <div
            className="h-7 w-7 rounded-full border-2 animate-spin"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--accent)",
            }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {status === "loading" ? "Loading video…" : "Scroll to play"}
          </span>
        </div>
      )}
      {/* Error state with retry */}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
          style={{ background: "rgba(12, 12, 15, 0.8)" }}
        >
          <div className="text-xl" style={{ color: "var(--text-muted)" }}>
            ⚠
          </div>
          <div
            className="text-sm max-w-[260px] break-words"
            style={{ color: "var(--text-muted)" }}
          >
            {errorMsg || "Couldn't load this video"}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="px-4 py-1.5 rounded-md text-sm font-medium pointer-events-auto transition-colors"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            Retry
          </button>
        </div>
      )}
      {/* Info overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(12,12,15,0.85) 0%, transparent 100%)",
          color: "var(--text)",
        }}
      >
        <div className="text-sm font-medium line-clamp-2">{item?.title}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {item?.author} · {item?.viewCount}
        </div>
      </div>
    </div>
  );
}
