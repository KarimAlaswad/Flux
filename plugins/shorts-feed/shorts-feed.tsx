import { useEffect, useState, useRef } from "react";

// DESCRIPTION: Shorts feed React component.
// This file renders a vertical, scroll-snap feed of short-form video cards.
// The comments below explain the intent of each declaration and major
// operation so you can follow the data flow and lifecycle in-place.

// Component signature: optional `manifests` array (not used by the core
// implementation here, but provided for compatibility with the plugin host).
export default function ShortsFeed({ manifests = [] }: { manifests?: any[] }) {
  // `items`: the canonical list of normalized short items displayed in the UI.
  const [items, setItems] = useState<any[]>([]);
  // `continuation`: pagination token from providers for loading more items.
  const [continuation, setContinuation] = useState<string | null>(null);
  // `loading`: UI flag while a load is in progress.
  const [loading, setLoading] = useState(false);
  // `feedError`: string shown to the user when a load fails.
  const [feedError, setFeedError] = useState("");
  // `activeIdx`: index of the currently centered/active short for counters.
  const [activeIdx, setActiveIdx] = useState(0);
  // `loadingRef`: imperative ref used to avoid duplicate concurrent loads
  // in async callbacks (IntersectionObserver handlers, etc.).
  const loadingRef = useRef(false);
  // `contRef`: imperative holder for continuation to avoid stale closure issues.
  const contRef = useRef<string | null>(null);
  // `sentinelRef`: DOM node observed for infinite scroll (end-of-list sentinel).
  const sentinelRef = useRef<HTMLDivElement>(null);
  // `containerRef`: the scrolling container element for the vertical feed.
  const containerRef = useRef<HTMLDivElement>(null);
  // `itemRefs`: DOM refs to each short item wrapper (used for scrollIntoView).
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // `hasLoadedRef`: gates initial fetch until the tab becomes visible
  const hasLoadedRef = useRef(false);

  // `load(cont)` — fetch a page of items from each configured provider.
  // - `cont` is an optional continuation token used for pagination.
  // Implementation notes:
  //  - We use `loadingRef` to avoid duplicate concurrent loads (common when IO
  //    triggers call `load` multiple times via IO observers).
  //  - We query both the YouTube and TikTok providers in parallel using
  //    `Promise.allSettled` so one failing provider doesn't block the other.
  const load = async (cont?: string | null) => {
    // guard against reentrancy from observer callbacks
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFeedError("");
    try {
      // provider params: limit and optional continuation token
      const params: any = { limit: 20 };
      if (cont) params.continuation = cont;

      // Query both providers concurrently. We call each plugin's `feed`
      // method directly via `__pluginRpc` (pluginName.method). Using the raw
      // plugin RPC lets us bypass the host's single-provider `call_hook`
      // resolution which would otherwise return only one provider.
      const [ytRes, ttRes] = await Promise.allSettled([
        (window as any).__pluginRpc?.("yt-shorts.feed", params),
        (window as any).__pluginRpc?.("tiktok-shorts.feed", params),
      ]);

      // Extract arrays, gracefully handling failures.
      const ytItems: any[] =
        ytRes.status === "fulfilled" ? (ytRes.value?.items ?? []) : [];
      const ttItems: any[] =
        ttRes.status === "fulfilled" ? (ttRes.value?.items ?? []) : [];

      // Normalize and annotate each incoming item with `source` and
      // `provider` fields so downstream UI and the player can choose the
      // correct provider for resolution/playback.
      const nextItems = [...ytItems, ...ttItems].map((item: any) => ({
        ...item,
        source:
          item.source ||
          (item.url?.includes("tiktok.com") ? "tiktok" : "youtube"),
        provider:
          item.provider ||
          (item.url?.includes("tiktok.com") ? "tiktok-shorts" : "yt-shorts"),
      }));

      // Choose a continuation token. This simple strategy prefers YouTube's
      // continuation when both providers return tokens, otherwise falls back
      // to whichever provider succeeded.
      const nextCont =
        ytRes.status === "fulfilled" && ttRes.status === "fulfilled"
          ? (ytRes.value?.continuation ?? ttRes.value?.continuation ?? null)
          : ytRes.status === "fulfilled"
            ? (ytRes.value?.continuation ?? null)
            : ttRes.status === "fulfilled"
              ? (ttRes.value?.continuation ?? null)
              : null;

      // Dedupe heuristically by `videoId` to prevent duplicate cards when
      // pagination or overlap across sources returns the same item.
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
      // Surface errors to the UI while keeping the app running
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

  // Snap-settle conductor: commits active short only when scroll snap settles
  useEffect(() => {
    const root = containerRef.current;
    if (!root || items.length === 0) return;

    let debounceTimer: any = null;

    const commitSnap = () => {
      const h = root.clientHeight;
      if (!h) return; // Do not commit when tab is hidden (h === 0)
      const rawIdx = Math.round(root.scrollTop / h)
      const idx = isNaN(rawIdx)
        ? 0
        : Math.max(0, Math.min(rawIdx, items.length - 1));
      setActiveIdx(idx);
      (window as any).__fluxActiveShortIdx = idx;
      window.dispatchEvent(
        new CustomEvent("flux.shorts.snap", { detail: { activeIdx: idx } }),
      );
    };

    // Watch for tab visibility change (display: none -> display: block)
    const ro  = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        if (!hasLoadedRef.current) {
          hasLoadedRef.current = true;
          load(null);
        }
        commitSnap();
      }
    });
    ro.observe(root);

    const onScroll = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(commitSnap, 120);
    };

    const onScrollEnd = () => {
      clearTimeout(debounceTimer);
      commitSnap();
    };

    commitSnap();

    let wheelTimer: any = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelTimer) return;

      const direction = Math.sign(e.deltaY);
      const current = (window as any).__fluxActiveShortIdx ?? 0;
      if (direction > 0 && current > 0) {
        scrollToIdx(current - 1);
      }

      wheelTimer = setTimeout(() => {
        wheelTimer = null;
      }, 400);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("scrollend", onScrollEnd, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      clearTimeout(debounceTimer);
      ro.disconnect();
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("scrollend", onScrollEnd);
      root.removeEventListener("wheel", onWheel);
    };
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
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-sm">
        <div style={{ color: "var(--text-muted)" }}>
          {feedError ? "Feed failed to load" : "No shorts — install a source"}
        </div>
        {feedError && (
          <div
            className="text-xs max-w-[300px] break-words"
            style={{ color: "var(--text-muted)", opacity: 0.7 }}
          >
            {feedError}
          </div>
        )}
        <button
          onClick={reload}
          className="px-4 py-2 rounded-md text-sm transition-colors"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
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
                  // Guard: only update item if video ID or slot changed 
                  if (wc._currentVideoId !== item.videoId || wc._currentIndex !== idx) {
                    wc._currentVideoId = item.videoId;
                    wc._currentIndex = idx;
                    wc.item = { ...item, index: idx };
                  }
                });
              }}
              className="h-full w-full flex items-center justify-center"
            />
            {/* Up/down arrows - jump to exact item, disabled at ends */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
              <button
                onClick={() => scrollToIdx(Math.max(idx - 1, 0))}
                disabled={idx === 0}
                className="h-9 w-9 rounded-full text-xs font-medium backdrop-blur-sm transition-colors disabled:opacity-20 disabled:pointer-events-none"
                style={{
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
                aria-label="Previous"
              >
                ↑
              </button>
              <button
                onClick={() => scrollToIdx(idx + 1)}
                className="h-9 w-9 rounded-full text-xs font-medium backdrop-blur-sm transition-colors"
                style={{
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
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
        <div
          className="py-4 text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span
            className="inline-block h-4 w-4 mr-2 align-middle rounded-full border-2 animate-spin"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--accent)",
            }}
          />
          Loading more…
        </div>
      )}
      {feedError && items.length > 0 && (
        <div className="py-3 text-center text-xs" style={{ color: "#EF4444" }}>
          Load failed: {feedError}{" "}
          <button
            onClick={() => load(contRef.current)}
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            retry
          </button>
        </div>
      )}
      {/* Position counter */}
      {items.length > 0 && (
        <div
          className="absolute top-3 left-3 px-2 py-1 rounded-md text-xs pointer-events-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {activeIdx + 1} / {items.length}
          {!continuation && " · end"}
        </div>
      )}
    </div>
  );
}

// Ensure WC registration happens via build-plugins.ts wrapping — this file is the React source
// The actual element <shorts-feed> is defined by the generated entry.tsx
