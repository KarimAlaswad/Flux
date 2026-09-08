import { useState, useEffect, useRef } from "react";

// -- What a feed source looks like (derived from PluginManifest.feeds) --
interface FeedSource {
  name: string; // plugin name, e.g. "yt-feed"
  card: string; // WC tag, e.g. "yt-video-card"
  method: string; // bare method name, e.g. "feed"
  methods: string[];
}

// -- One item in the merged feed --
interface FeedItem {
  plugin: FeedSource; // which source this came from
  data: any; // the raw item data (shape is plugin-specific)
}

interface FeedProps {
  manifests: any[]; // received from the WC wrapper's .manifests setter
}

export default function Feed({ manifests }: FeedProps) {
  const [sources, setSources] = useState<FeedSource[]>([]); // plugins with feeds
  const [items, setItems] = useState<FeedItem[]>([]); // merged items
  const [errors, setErrors] = useState<Record<string, string>>({}); // per-plugin errors
  const [loading, setLoading] = useState(true); // loading spinner
  const [systemError, setSystemError] = useState<string | null>(null); // fatal error
  const mountedRef = useRef(true); // cleanup guard

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!manifests || manifests.length === 0) {
      setLoading(false);
      return;
    }
    loadFeed();
  }, [manifests]);

  // Hide feed container when video plays
  useEffect(() => {
    const el = document.querySelector("feed-widget") as HTMLElement;
    if (!el) return;
    const hide = () => {
      el.style.display = "none";
    };
    const show = () => {
      el.style.display = "";
    };
    window.addEventListener("video.modal.show", hide);
    window.addEventListener("video.modal.hide", show);
    return () => {
      window.removeEventListener("video.modal.show", hide);
      window.removeEventListener("video.modal.hide", show);
    };
  }, []);

  async function loadFeed() {
    console.log("[feed] loadFeed: manifests.length =", manifests?.length ?? 0);
    setLoading(true);
    setSystemError(null);
    setErrors({});

    // Step 1: Filter manifests to plugins that have feeds
    const feedSources: FeedSource[] = manifests
      .filter((m: any) => m.feeds && m.feeds.length > 0)
      .flatMap((m: any) =>
        m.feeds.map((f: any) => ({
          name: m.name,
          card: f.card,
          method: f.method || m.methods?.[0],
          methods: m.methods || [],
        })),
      );

    console.log(
      "[feed] sources found:",
      feedSources.map((s) => `${s.name}.${s.method} -> ${s.card}`).join(", ") ||
        "none",
    );
    setSources(feedSources);

    // Step 2: If no sources, stop
    if (feedSources.length === 0) {
      setLoading(false);
      return;
    }

    // -- Safety timer: force-resolve if nothing settles within 20s --
    const safetyTimer = setTimeout(() => {
      console.log("[feed] SAFETY TIMEOUT FIRED at 20s — forcing resolution");
      setLoading(false);
      forceClearLoading();
    }, 20000);

    // Step 3: Call each source's feed method (all at once), with frontend timeout
    const FEED_TIMEOUT = 15000;
    const results = await Promise.allSettled(
      feedSources.map((s) => {
        const rpcMethod = s.name + "." + s.method;
        console.log(`[feed] calling __pluginRpc("${rpcMethod}", {})`);
        console.log(`[feed] __pluginRpc type:`, typeof window.__pluginRpc);
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            console.log(`[feed] per-source timeout fired for ${rpcMethod}`);
            reject(
              new Error(`Frontend timeout (${FEED_TIMEOUT}ms): ${rpcMethod}`),
            );
          }, FEED_TIMEOUT);
          const rpcPromise = window.__pluginRpc(rpcMethod, {});
          console.log(
            `[feed] __pluginRpc returned promise:`,
            typeof rpcPromise?.then,
          );
          rpcPromise.then(
            (data: any) => {
              clearTimeout(timeoutId);
              console.log(
                `[feed] "${rpcMethod}" success: ${Array.isArray(data) ? data.length : typeof data} items`,
              );
              resolve({ name: s.name, items: Array.isArray(data) ? data : [] });
            },
            (err: any) => {
              clearTimeout(timeoutId);
              console.log(
                `[feed] "${rpcMethod}" rejection:`,
                err?.message || err,
              );
              reject(err);
            },
          );
        });
      }),
    );

    clearTimeout(safetyTimer);

    // Step 4: Separate successes and failures, then shuffle
    const newItems: FeedItem[] = [];
    const newErrors: Record<string, string> = {};

    try {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const source = feedSources[i];

        if (result.status === "fulfilled") {
          for (const item of result.value.items) {
            newItems.push({ plugin: source, data: item });
          }
        } else {
          const msg =
            result.reason?.message ?? result.reason ?? "Unknown error";
          console.error(
            `[feed] "${source.name}.${source.method}" failed:`,
            msg,
          );
          newErrors[source.name] = msg;
        }
      }

      // Fisher-Yates shuffle
      for (let i = newItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newItems[i], newItems[j]] = [newItems[j], newItems[i]];
      }

      // Step 5: Update state unconditionally (ignore mountedRef —
      //         if component was unmounted/remounted the new ref
      //         will pick up, and React handles the rest)
      console.log(
        "[feed] setting state: items=",
        newItems.length,
        "errors=",
        Object.keys(newErrors).length,
        "loading=false",
      );
      setItems(newItems);
      setErrors(newErrors);
      setLoading(false);
      console.log("[feed] state set OK");
    } catch (e) {
      console.error("[feed] exception in loadFeed processing:", e);
    }

    // DOM-level kill switch in case React state doesn't take effect
    forceClearLoading();
  }

  function forceClearLoading() {
    const container = document.getElementById("feed-container");
    if (container) {
      const loadingEl = container.querySelector("p");
      if (loadingEl && loadingEl.textContent === "Loading feed...") {
        console.log("[feed] DOM kill switch: removing loading text");
        loadingEl.textContent = "Feed loaded (DOM recovery)";
      }
    }
  }

  // ---- Render per state ----

  // State 1: System error
  if (systemError) {
    return (
      <div className="m-4 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
        <p className="text-red-400 font-medium text-sm">Failed to load feed</p>
        <p className="text-red-400/70 text-xs mt-1">{systemError}</p>
        <button
          onClick={loadFeed}
          className="mt-3 px-4 py-1.5 bg-red-500/20 text-red-300 text-xs rounded-md hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // State 2: Loading (with no existing items)
  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="h-6 w-6 rounded-full border-2 animate-spin"
          style={{
            borderColor: "var(--border)",
            borderTopColor: "var(--accent)",
          }}
        />
        <p className="ml-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Loading feed…
        </p>
      </div>
    );
  }

  // State 3: Empty (no sources, not loading)
  if (!loading && sources.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-medium" style={{ color: "var(--text)" }}>
          No feed sources
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Install plugins to populate your feed.
        </p>
      </div>
    );
  }

  // State 4 + 5: Partial / Loaded - show items with error banners
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* Toolbar */}
      <div
        className="flex justify-between items-center px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {items.length} item{items.length !== 1 ? "s" : ""}
          {hasErrors &&
            ` · ${Object.keys(errors).length} source${Object.keys(errors).length !== 1 ? "s" : ""} failed`}
        </p>
        <button
          onClick={loadFeed}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent)",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error banners per plugin */}
      {Object.entries(errors).map(([name, msg]) => {
        const authPlugin = manifests?.find((m: any) =>
          m.methods?.includes("login"),
        );

        return (
          <div
            key={name}
            className="mx-4 mt-3 px-3 py-2.5 rounded-md border text-xs"
            style={{
              borderColor: "rgba(234, 179, 8, 0.25)",
              background: "rgba(234, 179, 8, 0.06)",
            }}
          >
            <p className="font-medium" style={{ color: "#EAB308" }}>
              {name}
            </p>
            <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>
              {msg}
            </p>
            {authPlugin && (
              <button
                onClick={async () => {
                  try {
                    await window.__pluginRpc(authPlugin.name + ".login", {});
                    loadFeed();
                  } catch (e: any) {
                    alert("Sign in failed: " + e.message);
                  }
                }}
                className="mt-2 px-3 py-1 text-xs rounded-md transition-colors"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                Sign in
              </button>
            )}
          </div>
        );
      })}

      {/* Card items */}
      {items.length === 0 ? (
        <div
          className="text-center py-12"
          style={{ color: "var(--text-muted)" }}
        >
          No items to display
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-2">
          {items.map((item, i) => (
            <CardRenderer
              key={`${item.plugin.name}-${i}`}
              plugin={item.plugin}
              data={item.data}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Helper component: creates a card WC and passes data to it --
function CardRenderer({ plugin, data }: { plugin: FeedSource; data: any }) {
  const ref = useRef<HTMLDivElement>(null);

  // Map plugin name to a source color class
  const sourceClass =
    plugin.name.includes("youtube") || plugin.name.includes("yt")
      ? "source-border-yt"
      : plugin.name.includes("tiktok") || plugin.name.includes("tt")
        ? "source-border-tt"
        : plugin.name.includes("peertube") || plugin.name.includes("pt")
          ? "source-border-pt"
          : "source-border-unknown";

  useEffect(() => {
    if (!ref.current) return;

    const tag = plugin.card;
    const container = ref.current;

    customElements.whenDefined(tag).then(() => {
      if (!container.isConnected) return; // component unmounted while loading
      const card = document.createElement(tag);
      data._plugin = plugin.name;
      card.item = data;
      container.appendChild(card);
    });

    // Cleanup: remove all children on unmount or re-render
    return () => {
      container.innerHTML = "";
    };
  }, [plugin.card, data]);

  return (
    <div
      ref={ref}
      className={`rounded-md cursor-pointer transition-colors hover:bg-[var(--surface-hover)] ${sourceClass}`}
    />
  );
}
