# Research: How the 7 Version-Negotiation Approaches Fit Flux

> Companion to `research-version-negotiation.md` (which surveyed 7 approaches generically). This doc asks: **what would each approach actually look like inside Flux's real architecture** — build pipeline, Rust host, App.tsx loader, Web Components — and which ones are worth adopting.

**Date:** 2026-08-02
**Context:** Flux builds each plugin Web Component as a self-contained IIFE bundle with React inlined (~200KB each, verified below). Every plugin duplicates React. We want to know which version-negotiation / dependency-sharing strategies from the prior research actually plug into this system.

---

## 1. TL;DR Verdict Table

| # | Approach | Applies to Flux as-is? | Verdict |
|---|----------|------------------------|---------|
| 1 | Module Federation `shared` | No — conflicts with IIFE lib builds; only via `@module-federation/vite` rewrite | **Not worth it now** — enormous complexity for a local-file plugin system |
| 2 | Jupyter `_model_module_version` | No as a loader; **yes as a pattern** | **Worth it (as the manifest pattern)** — declare versions, check passively |
| 3 | NPM semver / `npm-pick-manifest` | No as runtime; **yes as a tool** | **Worth it (as the negotiation engine)** — `semver.intersects` + `maxSatisfying` do the grouping math |
| 4 | Import Maps | Only after switching WC output from IIFE → ESM | **Worth it — the foundation** of the recommended design |
| 5 | SystemJS | No — native ESM + import maps cover everything in Tauri's webview | **Not worth it** — extra runtime, no native-loader sharing (SystemJS says so itself) |
| 6 | FDC3 App Directory | No — app-level versioning, not framework negotiation | **Not worth it** (maybe borrow "registry" idea later) |
| 7 | ES Module Shims | Only as insurance for very old Linux WebKitGTK | **Not worth it today** — this machine's webview supports import maps natively |
| 8 | Flux-specific design (§9 of prior doc) | Yes — it's the shape of the right answer | **Worth it** — with corrections (below) |

**Bottom line:** adopt a combination: (a) Jupyter-style **version declaration in `plugin.json`**, (b) **npm-semver grouping/resolution** at load time, (c) **import maps** as the runtime resolver, which requires (d) switching `build-plugins.ts` from IIFE to **ESM with externals**. Details in §11.

---

## 2. Background: How Flux Loads Plugins Today

There are three stages: **build** (scripts), **host** (Rust + App.tsx), **render** (Web Components).

```
 BUILD  (scripts/build-plugins.ts)              RUNTIME  (Tauri webview)
 ───────────────────────────────────            ──────────────────────────────
 plugin.json  +  plugin .tsx source                App.tsx init()  (src/App.tsx:33-82)
      │                                              │
      │  Vite lib build: formats:["iife"]             │ 1. __pluginRpc("core-manifest.scan")
      │  (build-plugins.ts:177)                       │    ──RPC──► Rust lib.rs ──► discover
      ▼                                              │    plugins/**/plugin.json
 build/plugins/<tag>.js                              │ 2. for each feeds[].card / ui /
      │                                              │    components: loadFrontend(path)
      │  ⚠ React 19.2.7 is INLINED here              │    (App.tsx:84-89)
      │  — the bundle has no imports left             │        core-static.read (RPC)
      ▼                                              │        <script> textContent
 feed-widget.js    ~204 KB                           │        appendChild → runs immediately
 yt-video-card.js  ~197 KB                           │ 3. customElements.whenDefined(tag)
 peertube-card.js  ~198 KB                           │    → createElement(tag) → #feed-container
 player-modal.js   ~195 KB                           │    (App.tsx:69-80)
 flux-player.js    ~10.2 MB  (embeds hls.js etc.)    │ 4. feed-widget mounts; calls feed
                                                      │    hooks via __pluginRpc; creates card
 Every bundle carries its OWN React+ReactDOM.         │    WCs imperatively (feed-widget.tsx:283-305)
 ~4 × 200 KB ≈ 800 KB, mostly duplicated React.       ▼
```

**Verified facts (measured on 2026-08-02):**

- Each WC is a **IIFE** built with `build.lib, formats: ["iife"]` — `scripts/build-plugins.ts:177`. The generated `entry.tsx` (lines 28-49) imports `createRoot` from `react-dom/client` and defines the custom element.
- **React is inlined, not external**: `react`/`react-dom` are NOT in `rollupOptions.external` (there is none; build-plugins.ts:164-183). Evidence in the output bundles: `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` (React 19's internal marker) appears in every WC bundle, and `feed-widget.js` contains `version:"19.2.7",rendererPackageName:"react-dom"` — the reconciler reporting React 19.2.7 (package.json declares `"react": "^19.1.0"`).
- Actual sizes are **~200KB each** (AGENTS.md and `research-plugin-bundling.md` say ~155-160KB — stale; measured: `feed-widget.js` 208,818 B, `yt-video-card.js` 201,546 B, `peertube-card.js` 202,901 B, `player-modal.js` 199,292 B).
- The **host app itself** (`src/main.tsx`) also mounts its own React 19 via `createRoot`. So one page holds at least 5 React instances today.
- Scripts are injected as **`script.textContent`** — a *classic* script (App.tsx:84-89). This matters enormously: import maps and bare specifiers apply **only to ES modules**, never to classic scripts.
- Plugins are discovered recursively by the Rust host (`src-tauri/src/lib.rs:59-82`); only manifests with a `run` field get subprocesses (`lib.rs:281-299`). Frontend-only plugins (feed, player-modal) never touch Rust except through `core-static.read`.
- `tauri.conf.json` sets `"csp": null` — no CSP restrictions today (relevant to §7).

---

## 3. Approach 1 — Module Federation `shared`

### What it is

A webpack-family bundler feature where the *host app* and *remotes* (plugins) declare shared packages (`react`) with optional semver `requiredVersion` and `singleton: true`. At runtime a tiny runtime library negotiates: it scans the share scope, picks the **highest registered version that satisfies every consumer's `requiredVersion`**, and hands it to everyone. If nothing satisfies, it **warns** and serves the highest available version anyway; if the scope has no version at all, the consumer falls back to its own bundled copy.

### How it would plug into Flux

```
 BUILD (build-plugins.ts rewritten)             RUNTIME (App.tsx rewritten)
 ─────────────────────────────────              ─────────────────────────────
 per tag, instead of lib/IIFE:                   1. <script src=".../remoteEntry.js">
   @module-federation/vite plugin                   per plugin (MF runtime included)
   name: "yt-video-card", exposes: Widget        2. MF runtime inits share scope,
   shared: { react: { singleton: true,              each remote registers its React
             requiredVersion: "^19" } }              version + "from" (its URL)
   react/react-dom no longer bundled               3. App loads widget via MF loader,
        │                                            negotiation happens inside
        ▼                                            __webpack_init_sharing__
   remoteEntry.js (MF-spec) + chunks                     │
        │                                            picked = highest satisfying ALL
        ▼                                            ranges, else warn + latest
   build/plugins/yt-video-card/remoteEntry.js     4. one React instance, all plugins
```

### How it would work with this system

- **Which Flux components change:** `scripts/build-plugins.ts` (swap Vite lib mode for the federation plugin), `App.tsx` (load remote entries instead of `core-static` text injection), plus the build step needs a *host* build that initializes the share scope (the host app in `src/` would need the `shared` config too).
- **Manifest:** no change needed — MF reads config files, not `plugin.json`. But you'd need one `module-federation.config.ts` per plugin, or generated ones.
- **Build vs runtime:** build marks `react` external and emits the share-scope registration; runtime does all negotiation.

### Benefits (for Flux)

- The **only** approach with *built-in* range negotiation + singleton enforcement (verified in webpack's runtime source: `findSatisfyingVersion` → highest satisfying; else `warn(...)` + `findLatestVersion`; `ConsumeSharedRuntimeModule.js` in `lib/sharing/`).
- Singleton semantics are exactly what React needs (two Reacts on one page breaks hooks/context).
- Battle-tested at scale (Next.js, countless MFE shops).

### Disadvantages

- **Requires abandoning the IIFE lib build.** The federation plugin builds an entry app with `exposes`, not a `build.lib` bundle. That's a rewrite of the build script and the loading path.
- **A new runtime dependency** (the MF runtime, tens of KB) rides in every remote entry.
- Webpack-family config on top of Vite 7 adds moving parts; the Vite integration is younger than the webpack one.
- Your plugins are *local files on disk*, not independently deployed micro-frontends — MF's whole deployment story is moot here.

### Caveats / gotchas

- Share scope only exists in webpack-family builds — a non-MF plugin (e.g. the 10MB `flux-player.js`, or any hand-written script) can't join the negotiation.
- Subpath trap: `shared: { react-dom: ... }` does NOT intercept `react-dom/client`; you must also declare `react-dom/` with a trailing slash (documented in the official `shared` docs, "Prefix matching with trailing slash" section). Flux's generated entry uses `react-dom/client`, so missing this = silent duplicate ReactDOM.
- The official MF docs say a non-satisfying `requiredVersion` uses "the smallest version available"; webpack's actual runtime code uses `findLatestVersion` (highest). Trust the source: **highest**, with a console warning.
- `singleton: true` still warns (doesn't fail) on mismatch; a React-18-only plugin can silently get React 19 and misbehave.

### Verdict

**Not worth it now.** The one thing it uniquely offers — active range negotiation — you can implement in ~30 lines with `semver` (see §11), and everything else it adds (runtime, config, build rewrite) works against Flux's local-files plugin model. Revisit only if Flux grows to dozens of large plugins with genuinely conflicting framework majors *and* a need for hard singleton guarantees.

---

## 4. Approach 2 — Jupyter Widgets `_model_module_version`

### What it is

Every Jupyter widget declares the version of its JS module as a semver string (`_model_module_version`), synced from the Python kernel to the browser. The frontend *widget manager* treats it as a **requirement**: it checks whether the widget's module version is compatible with what's loaded, and if not, the widget fails — there is **no selection, no fallback, no negotiation**. Just a declaration + a guard.

### How it would plug into Flux

```
 Jupyter world                                Flux mapping
 ─────────────                                ────────────
 Python class:                               plugin.json (new optional field):
   _model_module_version = "0.1.0"             { "name": "yt-feed",
        │ sync via Comm (state)                  "feeds": [...],
        ▼                                        "deps": { "react": "^19.0.0" } }
 frontend WidgetManager:
   reads version from widget state            App.tsx loader:
   checks vs loaded @jupyter-widgets/base       after resolving a shared React,
        │                                       checks each plugin's declared range
        ▼ mismatch → log error,                 │
   widget may not render                       ▼ mismatch → warning banner,
   (no auto-resolution anywhere)               plugin marked incompatible
```

### How it would work with this system

- **Which Flux components change:** only the manifest schema (`plugin.json`) + a small check in the load path (App.tsx or a new resolver module). Nothing in the build script changes.
- **Manifest:** add `"deps": { "<pkg>": "<semver-range>" }` (or the `"frameworks"` array from §9 of the prior doc).
- **Build vs runtime:** build unchanged (React still inlined); runtime just *validates* declarations — passive.

### Benefits (for Flux)

- **Tiny, honest, zero-risk step.** It costs one manifest field + one `semver.satisfies` check.
- Immediately gives you the *information* you need for any future grouping: what each plugin expects.
- Matches Flux's existing "partial" feed state: a failing source already renders a yellow error banner (feed-widget.tsx:233-262) — an incompatible framework could ride the same path instead of silently breaking.

### Disadvantages

- It solves **detection, not sharing** — you still have 5 copies of React; you just know about it.
- A passive check can't fix an incompatible plugin; at best it hides it.

### Caveats / gotchas

- Verified semantics: in `@jupyter-widgets/base`, `model_module_version` is documented in source as the "Semver version requirement for the model module" (`packages/base/src/manager.ts`). There is no negotiation logic — the prior doc's description is correct.
- The exact failure mode (error vs non-render) is managed by the notebook app, not the base library — don't copy Jupyter's behavior exactly; design Flux's (banner + skip is friendlier).

### Verdict

**Worth it — as the declaration pattern.** Adopt the manifest field now; it's the data source every other approach (except MF) needs anyway. Not a solution by itself.

---

## 5. Approach 3 — NPM/Yarn Semver Resolution (`npm-pick-manifest`)

### What it is

npm's install-time algorithm: given a version *range* (`^19.0.0`) and a list of available versions, pick the best concrete version. `npm-pick-manifest` is that algorithm as a standalone function — it prefers non-deprecated, engines-satisfying, then **higher semver precedence**; throws `ETARGET` if nothing matches. The library that does the math is `node-semver` (`semver.intersects`, `semver.maxSatisfying`, `semver.satisfies`).

### How it would plug into Flux

```
 npm world (install time)                     Flux adaptation (load time)
 ───────────────────────────                  ──────────────────────────────
 package.json:                                manifests:
   react: "^19.0.0"      (range)                A: react ^19.0.0
        │                                        B: react ^19.2.0
        ▼                                        C: react ^16.14.0
 npm-pick-manifest(packument, range)                    │
        │  heuristics → best version                    ▼
        ▼                                  semver.intersects(A,B) → true
 node_modules/react@19.2.7                   semver.intersects(A∪B, C) → false
   (dedupe/hoist across the tree)                    │
                                             groups: [A,B] → maxSatisfying → 19.2.7
                                                     [C]    → maxSatisfying → 16.14.0
                                                     │
                                                     ▼
                                             import-map scope per group
```

### How it would work with this system

- **Which Flux components change:** a new small module (e.g. `src/shared/dep-registry.ts` as sketched in `research-plugin-bundling.md` §11.4) that owns: available framework versions (a hard-coded table or files in `build/plugins/_shared/`), plus the grouping function from the prior doc's §9.
- **Manifest:** same `deps` field as Approach 2 — npm semantics are what the ranges mean.
- **Build vs runtime:** build-time: none (it's pure math). Runtime: run once during `App.tsx init()` after `core-manifest.scan`, before loading scripts. Cost is negligible (a few dozen entries).
- **Implementation:** `semver` is already in the dependency universe via `youtubei.js`'s tree, but add it explicitly to `package.json` if adopted; the grouping algorithm is exactly the pseudo-code in `research-version-negotiation.md` §9.

### Benefits (for Flux)

- **This is the negotiation brain.** `intersects` decides who can share; `maxSatisfying` decides which concrete version wins (or `minSatisfying` to maximize compatibility).
- Deterministic, testable, pure JS — no runtime, no webview dependency.
- Reuses the exact semantics npm users already know.

### Disadvantages

- Solves *which version*, not *how to deliver it* — it must be paired with a runtime resolver (import maps, §6).
- The full `npm-pick-manifest` heuristics (dist-tags, deprecation, engines) are overkill; you only need `satisfies`/`intersects`/`maxSatisfying`.

### Caveats / gotchas

- In `npm-pick-manifest`'s documented algorithm, "higher semver precedence" is the **last** heuristic, not first (correcting the prior doc's ordering). For Flux it doesn't matter — you'll call `semver.maxSatisfying` directly.
- "No version satisfies the group" must be handled explicitly (prior doc raises an error). In Flux, better: warn + run that plugin with its own inlined copy — degrade, don't crash (the feed already survives per-source failures).

### Verdict

**Worth it — as the negotiation engine.** Adopt `semver` (+ optionally `npm-pick-manifest` as reference) for the grouping logic. Not a delivery mechanism.

---

## 6. Approach 4 — Import Maps (browser spec)

### What it is

A `<script type="importmap">` JSON blob that tells the browser how to resolve *bare specifiers* (`"react"`) in **ES module** imports to URLs. Two levels: `imports` (global) and `scopes` (per-URL-prefix overrides). It's a WHATWG standard, supported natively in Chromium 89+, Firefox 108+, Safari 16.4+ (WebKitGTK 2.40+).

### How it would plug into Flux

```
 BUILD (build-plugins.ts modified)             RUNTIME (App.tsx modified)
 ─────────────────────────────────             ─────────────────────────────
 formats: ["es"]  (instead of "iife")           1. scan manifests → collect deps
 rollupOptions.external:                         2. group + resolve (semver, §5)
   ["react","react-dom","react/jsx-runtime"]     3. inject import map BEFORE any
        │                                          module loads:
        ▼                                          <script type="importmap">
 feed-widget.js (~few KB ESM)                       imports: { "react":
   import React from "react"       ─────┐              "…/react.19.2.7.mjs" }
   (bare specifier preserved!)        │   scopes: { "/legacy/":
        │                              │              { "react": "…/react.16.14.mjs" } }
        ▼                              ▼   4. <script type="module" src="…">
 build/plugins/_shared/          browser resolves "react" per module URL:
 react.19.2.7.mjs                module at /legacy/… → React 16
 react-dom.19.2.7.mjs            all others        → React 19
 (built once by a build-shared                    (classic scripts IGNORE the map!)
  step, or vendored from esm.sh)
```

### How it would work with this system

- **Which Flux components change:** (1) `scripts/build-plugins.ts` — output ESM + externals (full diff in `research-plugin-bundling.md` §11.1); (2) `App.tsx` `loadFrontend` (lines 84-89) — must stop using `script.textContent`; (3) a new loader that injects the import map + `<script type="module">` tags; (4) plugin JS must be reachable as real URLs.
- **Manifest:** the `deps` field (Approach 2) feeds map generation.
- **Build vs runtime:** build marks React external + produces `_shared/` version files; runtime generates the JSON map (one small object; merging rules are simple — see caveats).
- **The hard part is serving**: ESM must be fetched with a real URL + JS MIME type. Options from `research-plugin-bundling.md` §11.6: Vite dev server path (dev), or a Tauri asset/custom protocol for production. `core-static` currently returns file *text* for classic-script injection — it cannot serve modules as-is.

### Benefits (for Flux)

- **Zero runtime cost** — resolution is native browser behavior; nothing to install or maintain.
- Scopes are exactly the per-group isolation primitive Flux needs (see §10).
- ESM output also shrinks bundles: ~200KB IIFE → a few KB of plugin code + one shared React (~150KB) total.
- Standard, stable, and supported in this machine's webview (WebKitGTK 2.52.5, verified locally).

### Disadvantages

- Requires the IIFE → ESM migration (biggest single change; touches build script, loader, serving, and the CSS-injection plugin).
- Multiple *majors* mean multiple React instances anyway (that's inherent — React can't run two versions in one global).
- Module loading is asynchronous; Flux's current `whenDefined` flow (App.tsx:75) already handles async, so impact is modest.

### Caveats / gotchas (verified against the WHATWG spec)

- **Classic scripts are invisible to import maps.** Today's `script.textContent` loading (App.tsx:84-89) would *silently ignore* any map. This is the single most important gotcha.
- **Merging is first-wins**: when multiple `<script type="importmap">` exist, the *existing* (earlier) entry for a specifier wins and the new one is dropped (spec: "merge module specifier maps" — existing `oldMap` entries win, "conflicting rule" + "impacted already resolved module" cases are not merged). So inject one map, once, before any plugin module loads; later maps can only *add* new specifiers/scopes.
- **Scopes match URL prefixes of the importing module's URL.** Modules loaded from `blob:`/`data:` URLs (the `URL.createObjectURL` trick from `research-plugin-bundling.md` §11.6B) have opaque URLs — they cannot be matched by scopes and generally defeat import maps. Use real paths (`/build/plugins/...`), not blobs.
- WebKitGTK version dependency on Linux (see §7 caveat): import maps need WebKitGTK ≥ 2.40. Fine here (2.52.5); uncertain on old distros.
- Multiple import maps support in *native* engines is new (Chromium 135+, Safari 18.4+, not in Firefox) — design around a single map to be safe.

### Verdict

**Worth it — this is the foundation.** The browser-native resolver + scoped isolation is the runtime half of the recommended design, but only after the ESM migration. Pair with §5 for negotiation and §4 for declaration.

---

## 7. Approach 5 — SystemJS

### What it is

A third-party, hookable module loader (2.8KB `s.js` / 4.2KB `system.js`) that executes `System.register(...)`-format bundles and resolves bare specifiers through its *own* import-map format (`systemjs-importmap`). It predates native import maps and exists to run module-style code in old browsers (IE11).

### How it would plug into Flux

```
 BUILD (build-plugins.ts modified)             RUNTIME (App.tsx modified)
 ─────────────────────────────────             ─────────────────────────────
 Rollup output format: "system"                1. <script src="system.js"> (~4.2KB)
   System.register(["react","react-dom"],      2. <script type="systemjs-importmap">
     function(exports, ctx) { ... })           3. <script type="systemjs-module"
        │                                          src="…/feed-widget.js">
        ▼                                       System.import → resolves via ITS map,
 build/plugins/feed-widget.js                     NOT the browser's
   + react bundled as System.register              │
   (React must be pre-bundled in                    │ custom resolve() hook could
    System.register form too)                      ▼ implement semver logic (DIY)
```

### How it would work with this system

- **Which Flux components change:** build script (Rollup `format: 'system'` — Vite doesn't emit this natively, so more surgery than ESM), App.tsx loader, plus React/ReactDOM themselves must be available as `System.register` bundles (they're not — they ship as CJS/ESM/UMD; the SystemJS docs point to community `esm-bundle` ports).
- **Manifest:** unchanged.
- **Build vs runtime:** build emits `System.register`; runtime loads through SystemJS's registry.

### Benefits (for Flux)

- Deterministic single-registry loading (no duplicate execution once a module is registered).
- Hooks (`resolve`, `fetch`, `instantiate`) *could* host custom semver logic — the only approach here where you can literally write negotiation into the loader.

### Disadvantages

- **Its own README states the killer fact:** "SystemJS does not support direct integration with the native ES module browser loader because there is no way to share dependencies between the module systems." Your React would be a SystemJS-world copy — native ESM plugins (if you ever have them) can't share it.
- Non-standard output format, extra runtime, third dependency to maintain.
- Tauri's webview is modern (WebKitGTK 2.52.5 here; WebView2 on Windows is Chromium); there is no old-browser problem to solve — the entire reason SystemJS exists.

### Caveats / gotchas

- Performance is real but moot: ~1.4× uncached / ~1.65× cached vs native modules (official benchmark: 2334ms vs 1668ms uncached, 81ms vs 49ms cached, 426 modules, Chrome 80). Not a reason to use it.
- Loading React via SystemJS risks "two Reacts" again if *any* script loads React natively (e.g. the host app in `src/main.tsx`).

### Verdict

**Not worth it.** Everything SystemJS provides (import maps + registry sharing) is now native in the Tauri webview, and its isolation from the native loader actively hurts. `research-plugin-bundling.md` §3 reached the same conclusion.

---

## 8. Approach 6 — FDC3 App Directory Versioning

### What it is

A finance-industry standard where a "Desktop Agent" (host) reads an **App Directory** — a registry of *application records* (`appId`, `name`, `version`, `manifest`, `hosts`, …) — and launches apps from it. Each app runs in its **own process/window**; the only shared surface is the FDC3 API itself. `version` is the app's release version for update management, not a framework range.

### How it would plug into Flux

```
 FDC3 world                                   Flux mapping
 ──────────                                   ────────────
 App Directory (HTTP registry):               core-manifest.scan (lib.rs:59-82) is
   { appId, name, version: "1.2.3",             ALREADY a local "app directory":
     manifestType: "web",                      it walks plugins/**/plugin.json.
     manifest: "https://…" }                   plugin.json ALREADY has a top-level
        │                                        "version" field (e.g. "1.0.0").
        ▼                                     What FDC3 does that Flux doesn't:
 Desktop Agent (host):                          • version = plugin's own release
   reads record → launches app                   (update/rollout semantics)
   apps isolated per process                     • no framework negotiation at all
   compat = FDC3 API level (2.x), not            • appD is a network service, Flux's
   framework versions                            is a filesystem scan
```

### How it would work with this system

- **Which Flux components change:** none required. Flux's manifest `version` field (see `plugins/feed/plugin.json:5`) already mirrors FDC3's app-level versioning; nothing uses it for negotiation today.
- If adopted literally: you'd build an HTTP app-directory service and launch plugins in separate windows — a complete architectural detour.

### Benefits (for Flux)

- The *registry idea* is a good mental model: Flux already implements it locally (`core-manifest`).
- App-level `version` is worth surfacing in the UI one day (show plugin versions, update checks).

### Disadvantages

- FDC3's versioning is **app-level**, not framework-level — it doesn't answer "which React do I load?" at all.
- Process-per-app isolation contradicts Flux's single-window WC model (and would be the only way it could actually solve version conflicts).

### Caveats / gotchas

- Verified: FDC3 2.2 docs describe `version` as app-release metadata — "to roll out a new version… update the existing entry… or add a new entry for that version". The prior doc's characterization is accurate; it simply has nothing to transfer to Flux's problem.

### Verdict

**Not worth it** for version negotiation. (Separately: an *app-directory-style* plugin store is a plausible future feature, but that's out of scope here.)

---

## 9. Approach 7 — ES Module Shims

### What it is

A polyfill that makes import maps (and other new module features) work on top of whatever native module support a browser has. Three modes: **pass-through** (browser supports import maps natively → ~5ms init, zero rewriting, covers 94% of users), **polyfill** (rewrites specifiers, executes via Blob URLs, ~1.4–1.5× native speed), and **shim** (custom `module-shim`/`importmap-shim` script types with full `resolve`/`fetch`/`source` hooks).

### How it would plug into Flux

```
 RUNTIME (Tauri webview on Linux = WebKitGTK, version varies by distro)
 ─────────────────────────────────────────────────────────────────────────
 WebKitGTK ≥ 2.40  (Safari 16.4+)          WebKitGTK < 2.40  (old distros)
 native import maps ✓                           ✗ no native import maps
        │                                             │
        ▼                                             ▼
 es-module-shims (14KB, one script tag)     es-module-shims, POLYFILL mode:
 PASS-THROUGH: feature-detects, skips,        rewrites "react" → URL per map,
 plugins run natively (~5ms, ~0 cost)         executes as Blob URLs
        │                                             │  1.4–1.5× slower (still fast)
        ▼                                             ▼   Blob URLs break scope
 plugin ESM loads as if the shim               matching for plugin modules!
 weren't there (import maps native)           (or SHIM mode: module-shim tags,
                                               full hooks — but only shim scripts
                                               are processed, native modules can't
                                               join → duplicate React risk)
```

### How it would work with this system

- **Which Flux components change:** one `<script async src="es-module-shims.js">` before the import map; nothing else if pass-through engages.
- **Manifest / build:** unchanged from Approach 4.
- It would only ever *engage* on machines whose WebKitGTK lacks import maps — i.e. Linux distros with webkit2gtk < 2.40 (roughly pre-2023). Tauri docs warn webkit versions vary wildly across distros; this machine runs 2.52.5 (CachyOS).

### Benefits (for Flux)

- Cheap insurance: one script tag covers old-webview machines so the ESM+import-map design never needs a fallback design.
- Its hooks are there if you ever need custom resolution without SystemJS.

### Disadvantages

- **Polyfill mode executes rewritten modules as Blob URLs** — and as established in §6, import-map *scopes* can't reliably match blob URLs. So on old webviews, per-group version scoping may degrade (worst case: one version for everyone).
- Extra download/processing on exactly the machines where it engages; `import()` inside polyfilled graphs gets rewritten to `importShim` (instance-sharing edge cases documented in its README).

### Caveats / gotchas

- Pass-through is the *default* behavior and is gated on native import-map support — on WebKitGTK ≥ 2.40 it does essentially nothing. Verified in its README: "With import maps now supported by all major browsers, ES Module Shims entirely bypasses processing for over 94% of users."
- Only *static* resolution failures trigger polyfill; dynamic `import()` edge cases won't be fixed by it.
- `"csp": null` in `tauri.conf.json` means no CSP friction today; if a CSP is ever added, use the CSP build.

### Verdict

**Not worth it today** (this webview is native-capable), **keep in your back pocket** as a single-script fallback if Flux ever targets old Linux distros. It's cheap insurance, not a strategy.

---

## 10. The Flux-Specific Design (prior doc §9)

### What it is

The prior research's own sketch: plugins declare `frameworks: [{name, version-range}]` in the manifest; a grouping algorithm merges plugins whose ranges intersect (`semver.intersects`) into **compatibility groups**, picks a concrete version per group (`semver.maxSatisfying`), then isolates each group via **import map scopes** — group A's URL prefix maps `"react"` to React 19, group B's to React 16.

### How it would plug into Flux

```
 BUILD                                   NEGOTIATE (new resolver, load time)
 ─────                                   ────────────────────────────────────
 per plugin:                             manifests  (from core-manifest.scan)
   formats:["es"] + external react           │
   + plugin.json "deps"/"frameworks"         ▼
        │                       1. collect (pkg, range) per plugin
        ▼                       2. semver.intersects → compatibility groups
 feed-widget.js (ESM)           3. semver.maxSatisfying(available, range)
 yt-video-card.js (ESM)             → concrete version per group
 peertube-card.js (ESM)             (A,B→19.2.7 ; C→16.14.0)
        │                       4. build import map:
        │                           imports: { "react": "…/react.19.2.7.mjs" }
        ▼                           scopes:  { "/legacy/": { "react": "…/16.14.mjs" } }
 build/plugins/_shared/                    │
   react.19.2.7.mjs                   5. inject map; load plugins as
   react-dom.19.2.7.mjs                    <script type="module">
                                         6. browser resolves per module URL
                                             module under /legacy/ → React 16
                                             everyone else      → React 19
```

### How it would work with this system (concretely)

- **Manifest:** `research-version-negotiation.md` §9 uses `"frameworks": [{name, version}]`; `research-plugin-bundling.md` §11.3 uses `"deps": {"react": "^19.0.0"}`. Either works; **prefer `deps`** — it's a map (one entry per package, no array ceremony), matches npm naming, and reads naturally as "what this plugin imports".
- **New module:** `src/shared/dep-registry.ts`-style resolver (per `research-plugin-bundling.md` §11.4) holding the available-version table + grouping logic. Runs inside `App.tsx init()` between step 1 (scan) and the load loop.
- **Build:** the `build-shared` step (fetch/vendor React 19 / React 16 ESM from esm.sh into `build/plugins/_shared/`) + ESM output with externals — both fully specified in `research-plugin-bundling.md` §11.1/§11.8.
- **Serving:** the one genuinely new infrastructure piece — plugin JS as real URLs (dev: Vite server; prod: Tauri asset protocol or a new command). `core-static.read` text injection cannot remain.

### Benefits (for Flux)

- Targets Flux's actual shape: local plugins, one window, WCs, manifest-driven loading. No new runtime, no build-tool swap, no third-party loader.
- Grouping = memory savings now (one React for all `^19` plugins instead of 4), compatibility-safe isolation later (a legacy plugin doesn't corrupt the feed).
- Degrades gracefully: a plugin whose range matches nothing keeps its inlined copy and a warning.

### Disadvantages

- Inherits the IIFE→ESM migration cost (same as §6).
- The §9 sketch has rough edges (see below) — it's a design direction, not finished code.

### Caveats / gotchas (corrections to the §9 sketch)

1. **The sketch's algorithm has a merge bug:** after merging plugin B into group A's range via `semver.intersect`, it should re-check C against the *widened* range — the pseudo-code's outer loop can produce overlapping groups. Use the standard greedy interval-merge (sort ranges, merge overlaps) — ~15 lines, testable.
2. **`semver.intersect` is not a public `semver` API** (the doc's own appendix hedges). Compute intersection as `max(lowerBounds) … min(upperBounds)` yourself.
3. **The "isolated frame" idea in §9's `loadFrameworkInstances` is unnecessary** — import-map scopes (not iframes) are the isolation mechanism; drop the iframe machinery.
4. **Blob-URL caveat applies** (§6): scopes need real URL prefixes; `/legacy/` must be an actual path plugins are served from.
5. **No-framework plugins** (e.g. `plugins/feed/plugin.json` has no deps) just take the global `imports` mapping — matches §9's "assumed compatible with host" rule, and matches reality: `feed-widget` only needs React's version the map gives it.
6. Naming: keep the existing manifest field `version` (plugin's own release, FDC3-style) untouched; the new `deps` field is separate.

### Verdict

**Worth it — this is the recommended architecture**, with the corrections above and the `deps`-style manifest. It's the only option that fits Flux's constraints without adding a runtime.

---

## 11. Cross-Cutting Analysis: What Flux Should Actually Do

### Recommended combination

| Layer | Choice | Why |
|-------|--------|-----|
| Declaration | `"deps": { "react": "^19.0.0" }` in `plugin.json` (Jupyter-style, §4) | zero-cost data for everything else |
| Negotiation | `semver.intersects` grouping + `maxSatisfying` resolution (§5) | pure JS, deterministic, no runtime |
| Runtime resolution | Native import maps, `imports` + per-group `scopes` (§6) | browser-native, scoped isolation, zero cost |
| Build | Vite lib mode `formats:["es"]` + `rollupOptions.external` for react/react-dom/jsx-runtime + `build-shared` step (per `research-plugin-bundling.md` §11.1) | shrinks 4×200KB → few KB + one shared React |
| Loading | `<script type="importmap">` + `<script type="module">` via real URLs (dev: Vite; prod: asset protocol) | replaces `script.textContent` classic injection |
| Fallback (optional) | ES Module Shims script tag for old WebKitGTK (§9) | cheap insurance, no design change |
| Explicitly rejected | Module Federation, SystemJS, FDC3 | runtime/complexity with no payoff for local-file plugins |

### Final architecture

```
 BUILD                                    LOAD (App.tsx init, modified)          RENDER
 ─────                                    ─────────────────────────────          ──────
 plugin.json (+deps)                      1. core-manifest.scan ──RPC──► Rust      #feed-container
 plugin.tsx ──► Vite lib ESM               2. resolver: intersects → groups,          │
 external react*, JSX-runtime             3. maxSatisfying → react@19.2.7            ├─ feed-widget
      │                                   4. inject <script type="importmap">         ├─ [card WCs…
      ▼                                       imports:  react → react.19.2.7.mjs      │   created
 build/plugins/                             scopes:   /legacy/ → react.16.14.mjs     │   imperatively]
   feed-widget.js     (few KB)          5. <script type="module"> per tag            │
   yt-video-card.js   (few KB)              (served as real URLs, core-static        │
   peertube-card.js   (few KB)              replaced for module loading)             │
      ▲                                   6. whenDefined → createElement(tag)        │
      │  bare imports resolved by map         el.manifests = all                     │
 build/plugins/_shared/                   7. feed-widget RPCs feeds as today         │
   react.19.2.7.mjs  ────────────┐                                    ▲              │
   react-dom.19.2.7.mjs ─────────┼──── ONE React instance for        │ shared       │
   (react.16.14.mjs, if a group  │     every ^19 plugin (map does    └── via import │
    needs it)                    │     the wiring)                       map      │
   built by build-shared step ───┘
```

### Migration order (beginner checklist)

1. Add `"deps"` to every `plugin.json` (data first — harmless today).
2. Write the resolver module + tests (pure logic, no webview needed): grouping, maxSatisfying, map JSON generation.
3. Flip `build-plugins.ts` to ESM + externals; add `build-shared` to vendor React ESM.
4. Rework serving so plugins are real URLs (dev-server route first; prod protocol second).
5. Swap `loadFrontend` to inject the map + module scripts.
6. Keep IIFE fallback until all plugins migrate (the `needsRebuild` mtime logic in build-plugins.ts:87-90 makes A/B easy).

### Expected effect

- 4 WC bundles ≈ 800KB of duplicated React+ReactDOM → a few KB of plugin code each + **one** shared React 19 (~150KB, loaded once).
- A future React-18-only plugin lands in its own scope: works, isolated, without breaking the feed — with a warning banner if desired.
- No new runtime dependencies; everything is native browser + `semver`.

---

## 12. Sources

### Flux (this repo — verified, not assumed)

| Claim | Where |
|-------|-------|
| IIFE lib build per tag, `formats:["iife"]` | `scripts/build-plugins.ts:177` |
| Generated WC entry imports `react-dom/client`, defines custom element | `scripts/build-plugins.ts:28-49` |
| No `rollupOptions.external` — React inlined | `scripts/build-plugins.ts:164-183` |
| Classic-script loading via `core-static.read` + `script.textContent` | `src/App.tsx:84-89` |
| Init flow: scan → load cards/ui/components → mount WCs | `src/App.tsx:33-82` |
| Manifest discovery + `run`-based subprocess spawning | `src-tauri/src/lib.rs:59-82, 104-162` |
| 15s RPC timeout | `src-tauri/src/lib.rs:206-209` |
| `react: ^19.1.0`, `vite: ^7.0.4` | `package.json:21-22, 34` |
| `"csp": null` | `src-tauri/tauri.conf.json` |
| Manifest shape (`name/version/run/ui/feeds/…`) | `plugins/feed/plugin.json`, `plugins/youtube/plugins/yt-feed/plugin.json`, `plugins/peertube/plugin.json` |
| Per-source error banners / partial feed state | `plugins/feed/feed-widget.tsx:233-262` |
| Bundle sizes ~200KB each; React 19.2.7 marker inlined (`__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` ×3/bundle; `version:"19.2.7",rendererPackageName:"react-dom"`) | measured: `build/plugins/*.js`, 2026-08-02 |

### Primary external sources

| Claim | URL |
|-------|-----|
| MF `shared` config fields (`singleton`, `requiredVersion`, `shareKey`/`request`, trailing-slash subpath matching) | https://module-federation.io/configure/shared.html |
| MF + Vite integration (`@module-federation/vite`, `exposes`/`shared`, `build.target chrome89`) | https://module-federation.io/integrations/build-tool/vite.html |
| Webpack negotiation runtime: `findSatisfyingVersion` → highest satisfying; else `warn(getInvalidVersionMessage)` + `findLatestVersion`; singleton warn; fallback when key absent | https://github.com/webpack/webpack/blob/main/lib/sharing/ConsumeSharedRuntimeModule.js |
| Jupyter widget version traits (`_model_module_version` etc., Python + TS) | https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20Custom.html |
| Jupyter: `model_module_version` documented as "Semver version requirement for the model module" | https://github.com/jupyter-widgets/ipywidgets/blob/main/packages/base/src/manager.ts |
| `npm-pick-manifest` algorithm (tags → version → range; heuristics; `ETARGET`) | https://github.com/npm/npm-pick-manifest/blob/main/README.md |
| `node-semver` (`satisfies`, `intersects`, `maxSatisfying`) | https://github.com/npm/node-semver |
| Import maps spec: per-Window, scope resolution (longest prefix), merge rules (existing wins; conflicting/impacted rules dropped) | https://html.spec.whatwg.org/multipage/webappapis.html#import-maps |
| SystemJS sizes (s.js 2.8KB / system.js 4.2KB), hooks, "no direct integration with the native ES module browser loader", benchmark numbers | https://github.com/systemjs/systemjs |
| FDC3 App Directory overview (app records, `appId`, versioning for updates) | https://fdc3.finos.org/docs/app-directory/overview/ |
| ES Module Shims: pass-through 94% / ~5ms; polyfill 1.4–1.5×; shim mode; polyfill-only static errors; Blob-URL execution | https://github.com/guybedford/es-module-shims |
| Native import-map browser support (Chrome 89+, Firefox 108+, Safari 16.4+) | https://github.com/guybedford/es-module-shims#browser-support (compat table) |
| Tauri v2 webviews: WebView2 (Chromium) / WKWebView (macOS) / webkit2gtk (Linux, distro-dependent) | https://v2.tauri.app/reference/webview-versions/ |

### Uncertain facts flagged

1. **WebKitGTK on end-user Linux distros.** Import maps need WebKitGTK ≥ 2.40 (≈ Safari 16.4). Verified on *this* machine: 2.52.5 (CachyOS). Tauri's own webview-versions table is stale (lists Ubuntu 22.04 at 2.36, which predates distro updates) — **actual versions on other distros are unverified** and vary. This is why ES Module Shims is the optional fallback (§9).
2. **`@module-federation/vite` + lib-mode builds.** The plugin's docs show entry-app builds with `exposes`/`remotes`; I found no evidence it supports Vite's `build.lib` IIFE mode. The "build script must be rewritten" claim follows from the docs, but exact incompatibilities weren't exhaustively tested.
3. **Jupyter failure behavior.** Verified the declaration semantics ("semver requirement") in `@jupyter-widgets/base`; the exact UX of a mismatch (error vs non-render) lives in notebook apps, not the base library — described generally.
4. **MF docs vs webpack source on fallback version.** Official MF docs say "smallest version available"; webpack's runtime source picks the *latest*. Cited the source as authoritative.
5. **Blob-URL + import-map scopes.** That scopes cannot reliably match `blob:`-URL modules is well-established and already documented in `research-plugin-bundling.md` §11.6B; I did not re-derive it from the spec's resolution algorithm.

### Prior related research in this repo

- `reference/research-version-negotiation.md` — the 7 approaches + §9 design this doc evaluates.
- `reference/research-plugin-bundling.md` — IIFE→ESM migration plan, `deps` manifest field, `build-shared`, serving options (§11), which this doc agrees with and builds on.
