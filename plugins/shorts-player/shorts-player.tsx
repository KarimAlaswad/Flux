// Shorts use movi-player (same as flux-player): WASM pipeline renders to
// canvas; the core-stream proxy handles CORS for googlevideo URLs.
// Mute preference is shared across all shorts items (module state +
// localStorage) so unmuting once applies to every following video.
import "movi-player";
import { useEffect, useRef, useState } from "react";

// Shared mute state across every shorts-player instance on the page.
// Default: sound ON (no `muted` attr) — movi-player attempts autoplay with
// sound and falls back to muted + its own unmute pill only if blocked.
const MUTE_KEY = "flux.shorts.muted";
let shortsMuted: boolean = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();
function setShortsMuted(m: boolean) {
  shortsMuted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {}
}

// Separate from flux-player: per-item, strict on-screen playback
// - No preload with rootMargin, only when threshold 0.85 intersecting
// - Fetch + play with sound only when scrolled into view
// - Pause + unmount when off-screen (1 active decoder)

export default function ShortsPlayer({ item }: { item: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(shortsMuted);
  const [paused, setPaused] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");
  // keep refs to created element for cleanup
  const elRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const fail = (msg: string) => {
      if (cancelled) return;
      setErrorMsg(msg);
      setStatus("error");
    };

    const io = new IntersectionObserver(
      async ([entry]) => {
        if (cancelled) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.85) {
          // Strict: only now fetch stream URL and create player
          if (elRef.current) return; // already loaded
          try {
            const src = item?.url as string | undefined;
            if (!src) {
              console.warn("[shorts-player] no url on item", item);
              return;
            }
            console.log("[shorts-player] resolving", src);
            // Resolve via yt-shorts (yt-shorts.resolve expects url) — must be deciphered googlevideo.com URL
            let streamUrl = src;
            try {
              const result: any = await (window as any).__pluginRpc?.(
                "yt-shorts.resolve",
                { url: src },
              );
              console.log(
                "[shorts-player] resolve result",
                JSON.stringify(result)?.slice(0, 800),
              );
              const next = result?.url || result?.result?.url || result;
              if (typeof next === "string" && next.startsWith("http"))
                streamUrl = next;
              if (next?.error) {
                console.warn("[shorts-player] resolve error", next.error);
                return;
              }
            } catch (e) {
              console.error("[shorts-player] resolve failed", e);
              return;
            }
            console.log("[shorts-player] streamUrl", streamUrl.slice(0, 120));
            // Guard: if still a youtube watch page, movi will CORS-fail — abort and show error
            if (streamUrl.includes("youtube.com/watch")) {
              console.error(
                "[shorts-player] still watch URL — decipher failed",
                streamUrl,
              );
              return;
            }
            // Route googlevideo through same-origin core-stream proxy (adds CORS + forwards Range).
            // Try live proxy base, fall back to default port 1935 so it works before host restart.
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
              console.log("[shorts-player] proxied", finalUrl.slice(0, 120));
            }
            if (cancelled) return;
            setStatus("loading");
            // movi-player (same pattern as flux-player): WASM pipeline renders
            // to canvas. Route googlevideo through core-stream proxy for CORS.
            const el = document.createElement("movi-player") as any;
            el.style.display = "block";
            el.style.width = "100%";
            el.style.height = "100%";
            el.setAttribute("src", finalUrl);
            el.setAttribute("autoplay", "");
            el.setAttribute("controls", "");
            el.setAttribute("fallback", "native");
            el.setAttribute("preload", "metadata");
            // Sound on by default — only set muted when user muted before.
            // When set, movi-player autoplays muted and shows its unmute pill.
            if (shortsMuted) el.setAttribute("muted", "");
            if (item?.title) el.setAttribute("title", item.title);

            const onState = () => {
              if (cancelled) return;
              // Sync React mute icon with the player's actual state
              setMuted(el.muted ?? el.hasAttribute("muted"));
              // Sync paused state for overlay indicator
              const playing = el.player?.getState?.() === "playing";
              setPaused(!playing);
            };
            el.addEventListener("volumechange", onState);
            el.addEventListener("statechange", onState);

            ref.current!.appendChild(el);
            elRef.current = el;
            videoRef.current =
              el.shadowRoot?.querySelector("video") ??
              el.querySelector("video") ??
              null;
            setLoaded(true);
            setStatus("ready");
            setNeedsTap(false);
            setMuted(shortsMuted);
          } catch (e: any) {
            console.error("[shorts-player] load failed", e);
            fail("load failed: " + (e?.message || e));
          }
        } else {
          // Off-screen: pause and unmount — no background decoders
          const el = elRef.current as any;
          if (el) {
            try {
              el.pause?.();
            } catch {}
            try {
              const inner =
                el.shadowRoot?.querySelector("video") ??
                el.querySelector?.("video");
              inner?.pause?.();
            } catch {}
            el.remove();
            elRef.current = null;
          }
          videoRef.current = null;
          setNeedsTap(false);
          setLoaded(false);
          setStatus("idle");
        }
      },
      { threshold: 0.85, rootMargin: "0px" },
    );

    io.observe(ref.current);
    return () => {
      cancelled = true;
      io.disconnect();
      if (videoRef.current)
        try {
          videoRef.current.pause();
        } catch {}
      if (elRef.current) elRef.current.remove();
    };
  }, [item, retry]);

  const onToggleMute = (e: any) => {
    e.stopPropagation();
    // Flip the shared preference — applies to this and all following videos
    const next = !shortsMuted;
    setShortsMuted(next);
    setMuted(next);
    setNeedsTap(false);
    const el = elRef.current as any;
    if (el) {
      // movi-player exposes muted as attr + property — set both
      if (next) el.setAttribute("muted", "");
      else el.removeAttribute("muted");
      try {
        el.muted = next;
      } catch {}
      // Inner fallback video (if native fallback engaged)
      const inner =
        el.shadowRoot?.querySelector("video") ?? el.querySelector("video");
      if (inner) {
        inner.muted = next;
        if (!next && inner.paused) inner.play().catch(() => {});
      }
    }
  };

  const onTapPlay = () => {
    // Genuine user gesture — unmute everything going forward
    setShortsMuted(false);
    setMuted(false);
    setNeedsTap(false);
    const el = elRef.current as any;
    if (el) {
      el.removeAttribute("muted");
      try {
        el.muted = false;
        el.play?.();
      } catch {}
    }
  };

  const onTogglePlay = () => {
    const el = elRef.current as any;
    if (!el) return;
    try {
      const state = el.player?.getState?.();
      if (state === "playing") {
        el.pause();
        setPaused(true);
      } else {
        el.play?.();
        setPaused(false);
      }
    } catch {
      // Fallback: inner video element
      const inner =
        el.shadowRoot?.querySelector("video") ?? el.querySelector("video");
      if (inner) {
        if (inner.paused) {
          inner.play().catch(() => setNeedsTap(true));
          setPaused(false);
        } else {
          inner.pause();
          setPaused(true);
        }
      }
    }
  };

  const onRetry = () => {
    if (elRef.current) {
      elRef.current.remove();
      elRef.current = null;
    }
    videoRef.current = null;
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white pointer-events-none">
          <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          <span className="text-xs opacity-80">
            {status === "loading" ? "Loading video…" : "Scroll to play"}
          </span>
        </div>
      )}
      {/* Error state with retry */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white p-4 text-center">
          <div className="text-2xl">⚠️</div>
          <div className="text-sm max-w-[260px] break-words">
            {errorMsg || "Couldn't load this video"}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="px-4 py-2 rounded bg-white/20 hover:bg-white/30 text-sm pointer-events-auto"
          >
            Retry
          </button>
        </div>
      )}{" "}
      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white pointer-events-none">
        <div className="text-sm font-medium line-clamp-2">{item?.title}</div>
        <div className="text-xs opacity-80">
          {item?.author} • {item?.viewCount}
        </div>
      </div>
    </div>
  );
}
