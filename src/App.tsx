import { useState, useEffect } from "react";
import type { PluginManifest } from "./shared/types";
import { invoke } from "@tauri-apps/api/core";

// WebUi (Experimental)
declare global {
  interface Window {
    webui: {
      call: (name: string, ...args: any[]) => Promise<any>;
    };
  }
}

// -- Globals --
window.__pluginRpc = async (method: string, params: any) => {
  // return await invoke("plugin_request", { method, params })
  // Webui
  const result = await webui.call(
    "plugin_request",
    method,
    JSON.stringify(params),
  );
  try {
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    return result;
  }
};

window.resolveHook = async (hook: string) => {
  // return await invoke("resolve_hook", { hook })
  // Webui
  const result = await webui.call("resolve_hook", hook);
  return typeof result === "string" ? JSON.parse(result) : result;
};

window.callHook = async (hook: string, methodOrArgs: any, args?: any) => {
  const method = args !== undefined ? methodOrArgs : undefined;
  const params = args !== undefined ? args : methodOrArgs;
  // return await invoke("call_hook", { hook, method, params })
  // Webui
  const result = await webui.call(
    "call_hook",
    hook,
    method || "",
    JSON.stringify(params),
  );
  return typeof result === "string" ? JSON.parse(result) : result;
};

const loaded = new Set<string>();

export default function App() {
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  // Tauri
  // useEffect(() => {
  //   init().catch(e => {
  //     console.error("[app] init() failed:", e)
  //     const c = document.getElementById("feed-container")
  //     if (c) c.innerHTML = `<p style="color:red;padding:20px;font-family:monospace">Init error: ${e.message}</p>`
  //   })
  // }, [])

  // Webui
  useEffect(() => {
    let cancelled = false;

    async function tryInit(retries = 30) {
      try {
        await init();
      } catch (e: any) {
        if (
          !cancelled &&
          retries > 0 &&
          e.message?.includes("WebSocket is not connected")
        ) {
          await new Promise((r) => setTimeout(r, 200));
          return tryInit(retries - 1);
        }
        throw e;
      }
    }

    tryInit().catch((e) => {
      console.error("[app] init() failed:", e);
      const c = document.getElementById("feed-container");
      if (c)
        c.innerHTML = `<p style="color:red;padding:20px;font-family:monospace">Init error: ${e.message}</p>`;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function init() {
    console.log("[app] init: fetching manifests...");
    const all: PluginManifest[] = await window.__pluginRpc(
      "core-manifest.scan",
      {},
    );
    console.log(
      "[app] manifests received:",
      all.map(
        (m) =>
          `${m.name}${m.feeds?.length ? " (feeds)" : ""}${m.hooks?.length ? " (hooks:" + m.hooks + ")" : ""}${m.components?.length ? " (components:" + m.components + ")" : ""}`,
      ),
    );
    setManifests(all);

    // Step 1: Load card scripts (for feed item rendering)
    for (const m of all) {
      for (const f of m.feeds || []) {
        if (f.card && !loaded.has(f.card)) {
          loaded.add(f.card);
          console.log(`[app] loading card: ${f.card}`);
          await loadFrontend(`build/plugins/${f.card}.js`);
        }
      }
    }

    // Step 2: Load ALL component scripts (registers all WC tags)
    for (const m of all) {
      for (const tag of m.components || []) {
        if (!loaded.has(tag)) {
          loaded.add(tag);
          console.log(`[app] loading component: ${tag}`);
          await loadFrontend(`build/plugins/${tag}.js`);
        }
      }
    }

    // Step 3: Mount components that need to live in the DOM.
    // These are components that listen for global events or provide
    // overlay shells — they must exist before anything else runs.
    // Each one is resolved via its hook.
    const hooksToMount = ["feed.tabs", "video.modal"];

    for (const hookName of hooksToMount) {
      const provider = all.find((m: any) => m.hooks?.includes(hookName));
      const tag = provider?.components?.[0];
      if (!tag) {
        console.log(`[app] no provider for hook: ${hookName}`);
        continue;
      }

      // feed.tabs goes into #feed-container, everything else goes into body
      const target =
        hookName === "feed.tabs"
          ? document.getElementById("feed-container")
          : document.body;

      if (!target) continue;
      if (hookName === "feed.tabs") target.innerHTML = "";

      await customElements.whenDefined(tag);
      const el = document.createElement(tag);
      el.manifests = all;
      target.appendChild(el);
      console.log(`[app] mounted ${hookName}: ${tag}`);
    }

    console.log("[app] init complete");
  }

  async function loadFrontend(path: string) {
    const result = await window.__pluginRpc("core-static.read", { path });
    const script = document.createElement("script");
    script.textContent = result.code;
    document.body.appendChild(script);
  }

  return <div id="feed-container" />;
}
