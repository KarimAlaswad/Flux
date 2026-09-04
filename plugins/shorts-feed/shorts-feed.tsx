import { useEffect, useState, useRef } from "react";

// Inline vertical shorts feed — not a modal
// - Centered column with gutters for arrows/info (like TikTok/Reels)
// - scroll-snap-type y mandatory, each item 100dvh snap-start
// - fetch only via Option A getHashtag("shorts"), infinite scroll via continuation

export default function ShortsFeed({ manifests = [] }: { manifests?: any[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const loadingRef = useRef(false);
  const contRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const load = async (cont?: string | null) => {
    // Ref guard: `loading` state is stale inside observer callbacks
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFeedError("");
    try {
      const params: any = { limit: 20 };
      if (cont) params.continuation = cont;
      // Hook dispatch: feed.short (yt-shorts) via skeleton routing
      const res: any = await (window as any).callHook?.("feed.short", params);
      const nextItems: any[] = res?.items ?? (Array.isArray(res) ? res : []);
      const nextCont: string | null = res?.continuation ?? null;
      // Dedupe by videoId — continuation pages repeat items (baseline showed 3x dupes)
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.videoId).filter(Boolean));
        const fresh = nextItems.filter((i) => {
          if (!i.videoId) return true;
          if (seen.has(i.videoId)) return false;
          seen.add(i.videoId);
          return true;
        });
        return cont ? [...prev, ...fresh] : fresh;
      });
      setContinuation(nextCont);
      contRef.current = nextCont;
    } catch (e: any) {
      console.error("[shorts-feed] load failed", e);
      setFeedError(e?.message || String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const reload = () => {
    setItems([]);
    setContinuation(null);
    contRef.current = null;
    containerRef.current?.scrollTo({ top: 0 });
    load(null);
  };

  const scrollToIdx = (idx: number) => {
    const el = itemRefs.current[idx];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    load(null);
  }, []);

  // Infinite scroll sentinel — generous rootMargin prefetches before the end
  useEffect(() => {
    if (!sentinelRef.current || !continuation) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) load(contRef.current);
      },
      { root: containerRef.current, threshold: 0.1, rootMargin: "800px" },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [continuation, items.length]);

  // Track active item for counter + arrow state
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onScroll = () => {
      const idx = Math.round(root.scrollTop / root.clientHeight);
      setActiveIdx(Math.max(0, Math.min(idx, items.length - 1)));
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [items.length]);

  // Keyboard nav: arrows move one short, Home jumps to top
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToIdx(Math.min(activeIdx + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToIdx(Math.max(activeIdx - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        scrollToIdx(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIdx, items.length]);

  if (items.length === 0 && !loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-sm text-white/60">
        <div>
          {feedError
            ? "Feed failed to load"
            : "No shorts — add yt-shorts source"}
        </div>
        {feedError && (
          <div className="text-xs opacity-70 max-w-[300px] break-words">
            {feedError}
          </div>
        )}
        <button
          onClick={reload}
          className="px-4 py-2 rounded bg-white/15 text-white hover:bg-white/25"
        >
          ↻ Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-y-scroll snap-y snap-mandatory bg-black"
    >
      {items.map((item, idx) => (
        <div
          key={(item.videoId ?? "noid") + "_" + idx}
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          className="relative h-full w-full snap-start flex items-center justify-center bg-black"
        >
          {/* Centered player column with side gutters for arrows/info */}
          <div className="relative h-full w-full max-w-[420px] flex items-center justify-center mx-auto">
            <div
              ref={(el) => {
                if (!el) return;
                const tag = "shorts-player";
                customElements.whenDefined(tag).then(() => {
                  if (!el.isConnected) return;
                  // Reuse existing or create new
                  let wc = el.querySelector(tag) as any;
                  if (!wc) {
                    wc = document.createElement(tag);
                    // Custom elements are inline by default — force block + fill parent
                    wc.style.display = "block";
                    wc.style.width = "100%";
                    wc.style.height = "100%";
                    el.appendChild(wc);
                  }
                  wc.item = item;
                });
              }}
              className="h-full w-full flex items-center justify-center"
            />
            {/* Up/down arrows - jump to exact item, disabled at ends */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
              <button
                onClick={() => scrollToIdx(Math.max(idx - 1, 0))}
                disabled={idx === 0}
                className="h-10 w-10 rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Previous"
              >
                ↑
              </button>
              <button
                onClick={() => scrollToIdx(idx + 1)}
                className="h-10 w-10 rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
                aria-label="Next"
              >
                ↓
              </button>
            </div>
          </div>
        </div>
      ))}
      <div ref={sentinelRef} className="h-1 w-full" />
      {loading && (
        <div className="py-4 text-center text-xs text-white/60">
          <span className="inline-block h-4 w-4 mr-2 align-middle rounded-full border-2 border-white/30 border-t-white animate-spin" />
          Loading more…
        </div>
      )}
      {feedError && items.length > 0 && (
        <div className="py-3 text-center text-xs text-red-300/80">
          Load failed: {feedError}{" "}
          <button onClick={() => load(contRef.current)} className="underline">
            retry
          </button>
        </div>
      )}
      {/* Position counter */}
      {items.length > 0 && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs pointer-events-none">
          {activeIdx + 1} / {items.length}
          {!continuation && " • end"}
        </div>
      )}
    </div>
  );
}

// Ensure WC registration happens via build-plugins.ts wrapping — this file is the React source
// The actual element <shorts-feed> is defined by the generated entry.tsx
