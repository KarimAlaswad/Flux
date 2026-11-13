import { useState, useEffect } from "react";
import type { PluginManifest } from "./shared/types";
import { host } from "./shared/hosts.ts";

window.__pluginRpc = (method: string, params: any) =>
	host().request(method, params);
window.resolveHook = (hook: string) => host().resolveHook(hook);
window.callHook = (hook: string, methodOrArgs: any, args?: any) =>
	args !== undefined
		? host().callHook(hook, methodOrArgs, args)
		: host().callHook(hook, undefined, methodOrArgs);

const loaded = new Set<string>();

export default function App() {
	const [manifests, setManifests] = useState<PluginManifest[]>([]);

	// Bootstrap — skeleton-neutral
	useEffect(() => {
		let cancelled = false;

		async function tryInit(retries = 30) {
			try {
				await init();
			} catch (e: any) {
				if (!cancelled && retries > 0) {
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

		const hooksToMount = ["feed.tabs", "video.player"];

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
