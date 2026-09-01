import { useState, useEffect } from "react"
import type { PluginManifest } from "./shared/types"
import { invoke } from "@tauri-apps/api/core"

// WebUi (Experimental)
declare global {
  interface Window {
    webui: {
      call: (name: string, ...args: any[]) => Promise<any>
    }
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
}

window.resolveHook = async (hook: string) => {
  // return await invoke("resolve_hook", { hook })
  // Webui
  const result = await webui.call("resolve_hook", hook)
  return typeof result === "string" ? JSON.parse(result) : result 
}

window.callHook = async (hook: string, methodOrArgs: any, args?: any) => {
  const method = args !== undefined ? methodOrArgs : undefined
  const params = args !== undefined ? args: methodOrArgs
  // return await invoke("call_hook", { hook, method, params })
  // Webui
  const result = await webui.call("call_hook", hook , method || "", JSON.stringify(params))
  return typeof result === "string" ? JSON.parse(result) : result 
}

const loaded = new Set<string>();
const uiPlugins: PluginManifest[] = [];

export default function App() {
  const [manifests, setManifests] = useState<PluginManifest[]>([])
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
    uiPlugins.length = 0;
    console.log("[app] init: fetching manifests...")
    const all: PluginManifest[] = await window.__pluginRpc('core-manifest.scan', {})
    console.log("[app] manifests received:", all.map(m => `${m.name}${m.feeds?.length ? " (feeds)" : ""}${m.ui ? " (ui:"+m.ui+")" : ""}${m.hooks?.length ? " (hooks:"+m.hooks+")" : ""}`))
    setManifests(all)

    for (const m of all) {
      for (const f of (m.feeds || [])) {
        if (f.card && !loaded.has(f.card)) {
          loaded.add(f.card)
          console.log(`[app] loading card: ${f.card}`)
          await loadFrontend(`build/plugins/${f.card}.js`)
        }
      }
      if (m.ui) {
        uiPlugins.push(m)
        if (!loaded.has(m.ui)) {
          loaded.add(m.ui)
          console.log(`[app] loading ui: ${m.ui}`)
          await loadFrontend(`build/plugins/${m.ui}.js`)
        }
      }
    }

    // Load components 
    for (const m of all) {
      for (const tag of (m.components || [])) {
        if (!loaded.has(tag)) {
          loaded.add(tag)
          console.log(`[app] loading component: ${tag}`)
          await loadFrontend(`build/plugins/${tag}.js`)
        }
      }
    }

    // Create WC elements directly, outside React's VDOM
    const container = document.getElementById("feed-container")
    if (container) {
      container.innerHTML = ""
      for (const m of uiPlugins) {
        const tag = m.ui!
        await customElements.whenDefined(tag)
        const el = document.createElement(tag)
        el.manifests = all
        container.appendChild(el)
      }
    }
    console.log("[app] init complete, ui plugins:", uiPlugins.map(p => p.ui).join(", ") || "none")
  }

  async function loadFrontend(path: string) {
    const result = await window.__pluginRpc("core-static.read", { path })
    const script = document.createElement("script")
    script.textContent = result.code
    document.body.appendChild(script)
  }

  return (
    <div id="feed-container" />
  )
}