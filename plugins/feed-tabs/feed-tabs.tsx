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

  // ---- Create feed-widget instances and toggle visibility ----
  // This effect runs whenever the active tab, manifests, or feed types change.
  useEffect(() => {
    if (!containerRef.current) return;

    // For each feed type, create a wrapper div and a <feed-widget> inside it
    for (const type of feedTypes) {
      // Skip if we already created this wrapper (keep existing instances alive)
      // This is how tab persistence works — we never destroy, just hide.
      if (wrappersRef.current[type]) continue;

      // Filter manifests: keep only the feeds that match this type.
      // e.g. for type "video", keep manifests where feeds[].type === "video"
      // This means each feed-widget only sees its own type's sources.
      const filtered = manifests
        .map((m: any) => ({
          ...m,
          feeds: (m.feeds || []).filter((f: any) => f.type === type),
        }))
        .filter((m: any) => m.feeds.length > 0);

      // Create a wrapper div — this is what we show/hide.
      // Starting hidden so it doesn't flash on screen.
      const wrapper = document.createElement("div");
      wrapper.style.display = "none";

      // Resolve the feed widget dynamically via hook.
      // feed-widget declares hooks: ["feed.widget"] — we find its tag
      // from components[0], so we never hardcode a tag name.
      // Someone can replace feed-widget with a different widget
      // by providing a plugin that also declares hooks: ["feed.widget"].
      const renderer = manifests.find((m: any) =>
        m.hooks?.includes("feed.widget"),
      );
      const rendererTag = renderer?.components?.[0];
      if (rendererTag) {
        customElements.whenDefined(rendererTag).then(() => {
          const el = document.createElement(rendererTag);
          el.manifests = filtered;
          wrapper.appendChild(el);
        });
      }

      // Append wrapper to the container and remember it in our ref map
      containerRef.current!.appendChild(wrapper);
      wrappersRef.current[type] = wrapper;
    }

    // Toggle visibility: show the active tab, hide all others.
    // All instances stay mounted — no refetching when switching back.
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
  return (
    <div>
      {/* Tab bar — horizontal scroll, each button sets the active type */}
      <div className="flex overflow-x-auto border-b border-white/10">
        {feedTypes.map((type) => (
          <button
            key={type}
            onClick={() => setActive(type)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              active === type
                ? "text-white border-b-2 border-white"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            {/* Capitalize first letter: "video" → "Video" */}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>
      {/* Content area — feed-widget wrapper divs are appended here */}
      <div ref={containerRef} />
    </div>
  );
}
