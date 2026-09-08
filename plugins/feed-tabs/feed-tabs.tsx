// React hooks we need:
// useState  — track which tab is active
// useEffect — create feed-widget elements and toggle visibility
// useRef    — hold references to DOM elements (container + per-type wrappers)
import { useState, useEffect, useRef } from "react";

// ---- Helpers ----

// Scans all plugin manifests and collects unique feed type names.
// e.g. if yt-feed declares feeds: [{ type: "video" }], this returns ["video"]
// If a shorts plugin later declares feeds: [{ type: "short" }], it returns ["video", "short"]
function getFeedTypes(manifests: any[]): string[] {
  const seen = new Set<string>();
  for (const m of manifests) {
    for (const f of m.feeds || []) {
      if (f.type) seen.add(f.type);
    }
  }
  return Array.from(seen);
}

// ---- Main component ----

export default function FeedTabs({ manifests }: { manifests: any }) {
  // All feed types discovered from manifests (e.g. ["video", "short"])
  const feedTypes = getFeedTypes(manifests);

  // Which tab is currently selected (empty string = not set yet)
  const [active, setActive] = useState<string>("");

  // The container div where all feed-widget wrapper elements live
  const containerRef = useRef<HTMLDivElement>(null);

  // Maps each type to its DOM wrapper div.
  // e.g. { "video": <div>, "short": <div> }
  // We use ref (not state) because we're manipulating DOM directly
  // — React doesn't need to know about these elements.
  const wrappersRef = useRef<Record<string, HTMLDivElement>>({});

  // ---- Set default tab ----
  // When feedTypes first loads (or changes), set active to the first type.
  // This runs only once — on initial mount.
  useEffect(() => {
    if (feedTypes.length > 0 && !active) {
      setActive(feedTypes[0]);
    }
  }, [feedTypes]);

  // ---- Create feed instances and toggle visibility ----
  // video -> <feed-widget> (generic cards), short -> <shorts-feed> (vertical snap inline feed)
  // Discovered via feeds[].type: "short" surfaces as a tab automatically (no host changes)
  useEffect(() => {
    if (!containerRef.current) return;

    for (const type of feedTypes) {
      if (wrappersRef.current[type]) continue;

      const filtered = manifests
        .map((m: any) => ({
          ...m,
          feeds: (m.feeds || []).filter((f: any) => f.type === type),
        }))
        .filter((m: any) => m.feeds.length > 0);

      const wrapper = document.createElement("div");
      wrapper.style.display = "none";
      wrapper.style.height = "100%";

      // For shorts, use the vertical shorts-feed (scroll-snap, inline player)
      // Otherwise use the generic feed-widget.
      const isShort = type === "short";
      const hookName = isShort ? "shorts.feed" : "feed.widget";
      const provider = manifests.find((m: any) => m.hooks?.includes(hookName));
      const fallback = !isShort
        ? manifests.find((m: any) => m.hooks?.includes("feed.widget"))
        : null;
      const target = provider ?? fallback;
      const tag = target?.components?.[0];

      if (tag) {
        customElements.whenDefined(tag).then(() => {
          const el = document.createElement(tag);
          // shorts-feed expects full manifests to resolve feed.short via callHook
          // feed-widget expects filtered per-type (existing contract)
          el.manifests = isShort ? manifests : filtered;
          wrapper.appendChild(el);
        });
      }

      containerRef.current!.appendChild(wrapper);
      wrappersRef.current[type] = wrapper;
    }

    for (const type of feedTypes) {
      if (wrappersRef.current[type]) {
        wrappersRef.current[type].style.display =
          type === active ? "block" : "none";
      }
    }
  }, [active, manifests, feedTypes]);

  // ---- Render ----

  // If only one feed type exists, don't show a tab bar.
  // Just render the container (the single feed-widget lives inside it).
  if (feedTypes.length <= 1) {
    return <div ref={containerRef} />;
  }

  // Multiple types: render a tab bar on top, then the content container.
  // Root is a fixed-height flex column so the tab bar + content never exceed
  // the viewport — this removes the outer body scrollbar (the feed scrolls
  // internally instead).
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Tab bar — accent underline on active tab */}
      <nav className="flex shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
        {feedTypes.map((type) => {
          const isActive = type === active;
          return (
            <button
              key={type}
              onClick={() => setActive(type)}
              className="relative px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: isActive ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              {/* Accent underline */}
              <span
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                style={{
                  background: isActive ? "var(--accent)" : "transparent",
                }}
              />
            </button>
          );
        })}
      </nav>
      {/* Content area — feed-widget wrapper divs are appended here */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
