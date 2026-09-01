# Plugin Bundling Strategies Without IIFE

> Research into how Flux can compile frontend plugins as proper modules that share dependencies instead of self-contained IIFEs.

**Date:** 2026-07-29
**Context:** Flux currently compiles each plugin WC to a ~155-160KB IIFE that inlines React 19, ReactDOM, etc. Three plugins = ~470KB of duplicated React. We want both independence AND shared deps.

---

## 1. Native ES Modules (Browser ESM)

### How it works

The browser's native module system (`<script type="module">`) loads ES modules as separate requests. Modules declare imports using `import` statements, and the browser resolves them — either as URLs or via import maps.

### Output format

ESM — `export` / `import` statements preserved in output.

### External dependency declaration

Plugin source has `import React from "react"`. If the bundler marks `react` as external (equivalent to Rollup `external: ['react']` or esbuild `external: ['react']`), the import statement appears verbatim in the output.

### Runtime resolution

Two approaches:

**A) URL imports** — Plugin imports React from a CDN URL directly:
```js
import React from "https://esm.sh/react@19"
```
esm.sh is a CDN that transforms npm packages into ESM, one-file-per-export with tree-shaking. See [esm.sh docs](https://esm.sh/).

**B) Import maps** — Plugin imports bare specifiers, host provides mapping:
```html
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@19.2.0",
    "react-dom": "https://esm.sh/react-dom@19.2.0"
  }
}
</script>
```
Plugin code: `import React from "react"` — browser resolves through the map.

### Versioning

Import maps can map `"react"` to a specific version. Multiple versions? Not natively — an import map key maps to exactly one URL. You'd need different keys for different majors (e.g., `"react18"`, `"react19"`).

### Debugging

Full sourcemap support. Devtools show original import structure. Step-through works because modules are real files.

### Caching

Browser caches ESM modules by URL. Shared deps loaded once, cached, reused across plugins. `?dev` parameter on esm.sh for development mode.

### Browser support

Import maps: Chrome 89+, Firefox 108+, Safari 16.4+, Edge 89+ (Baseline Widely Available 2023). In Tauri (Chromium-based WebView), support is guaranteed.

### Primary sources

- [HTML Standard §8.1.6.7 — Module-related host hooks](https://html.spec.whatwg.org/multipage/webappapis.html#integration-with-the-javascript-module-system)
- [HTML Standard §8.1.5.2 — Import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)
- [MDN JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [esm.sh docs](https://esm.sh/)

### Verdict

**Strong contender.** Native, no runtime overhead, standard API. The catch: loading plugins as `<script type="module">` means they execute asynchronously after all deps load. Requires changing how core-static serves plugin JS (must serve as module, not inject as script textContent).

---

## 2. Import Maps (In-Depth)

### How it works

An import map is a JSON object placed in a `<script type="importmap">` before any module scripts. It tells the browser how to resolve bare specifiers (like `"react"`) to URLs.

### Scope-based versioning

Import maps support **scopes** — different mappings per path prefix:
```json
{
  "imports": {
    "react": "https://esm.sh/react@19.2.0"
  },
  "scopes": {
    "/plugins/yt-video-card/": {
      "react": "https://esm.sh/react@18.3.1"
    }
  }
}
```
Per the [HTML spec §8.1.5.2](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps). This allows Plugin C (React 19) and Plugin A (React 18) in the same page.

### Integrity

Import maps support [integrity metadata](https://html.spec.whatwg.org/multipage/webappapis.html#import-map-integration) — hash verification of mapped modules.

### Multiple import maps

HTML spec allows multiple `<script type="importmap">` elements (added post-merge from WICG). Late import maps only add new mappings; they cannot override existing ones. This enables lazy-loaded plugin-specific maps.

### Primary sources

- [HTML Standard §8.1.5.2 — Import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)
- [WICG/import-maps (archived, now merged into HTML)](https://github.com/WICG/import-maps)

### Verdict

**Core enabling technology.** Import maps are THE way to provide shared deps to native ESM plugins. Combined with Vite/Rollup `external`, this is the ideal runtime resolution layer for Flux.

---

## 3. SystemJS

### How it works

SystemJS is a hookable, standards-based module loader. It loads `System.register` format modules (a CSP-compatible format produced by Rollup when `format: 'system'`). It also supports loading native ESM via an extra.

### Output format

`System.register([deps], function(exports, context) { ... })` — a function-call format, not a standard. Not native ESM.

### External dependency declaration

Dependencies listed in the `System.register` call's array argument:
```js
System.register(['react', 'react-dom'], function(exports, context) { ... })
```

### Runtime resolution

SystemJS has its own import map format (`<script type="systemjs-importmap">`). At runtime, SystemJS checks its registry for already-loaded modules before fetching.

### Versioning

Same as import maps — one mapping per specifier. SystemJS also supports a named-register extra for named bundles.

### Debugging

SystemJS proxies module execution through its own loader. Sourcemaps work but the call stack includes SystemJS wrapper frames. Not as clean as native ESM.

### Caching

SystemJS caches module instances in its internal registry. Shared deps are instantiated once.

### Extra

At 4.2KB (system.js) or 2.8KB (s.js minimal), SystemJS is small but its a runtime dependency Flux doesn't currently have.

### Primary sources

- [SystemJS GitHub](https://github.com/systemjs/systemjs)
- [SystemJS docs — Import Maps](https://github.com/systemjs/systemjs/blob/main/docs/import-maps.md)
- [SystemJS docs — System.register format](https://github.com/systemjs/systemjs/blob/main/docs/system-register.md)

### Verdict

**Overkill for Flux.** SystemJS shines for older browsers (IE11) and SSR. Tauri's Chromium WebView supports native ESM fully. Adding SystemJS as a runtime dependency buys us nothing native ESM + import maps don't already provide. Skip.

---

## 4. Webpack / Rollup / Vite Externals

### How it works

All three bundlers let you mark dependencies as **external** — excluded from the bundle, expected to be present at runtime. The output references them via import/require/global instead of inlining them.

### Webpack `externals`

```js
// webpack.config.js
module.exports = {
  externals: {
    react: 'react',        // externalsType: 'module' → import react from 'react'
    'react-dom': 'react-dom'
  },
  externalsType: 'module',  // emit native import() statements
  experiments: { outputModule: true }
}
```
[Webpack externals docs](https://webpack.js.org/configuration/externals/)

The `externalsType` can be: `'module'` (native ESM import), `'import'` (`import()` expression), `'var'` (global variable), `'commonjs'`, `'amd'`, `'script'` (loads from URL), etc. The `'module'` type requires `experiments.outputModule: true`.

### Rollup `external` + `output.globals`

```js
// rollup.config.js
export default {
  external: ['react', 'react-dom'],
  output: {
    format: 'es',    // or 'iife', 'umd'
    globals: {
      react: 'React',
      'react-dom': 'ReactDOM'
    }
  }
}
```
[Rollup external docs](https://rollupjs.org/configuration-options/#external)
[Rollup output.globals docs](https://rollupjs.org/configuration-options/#output-globals)

When `format: 'es'`, Rollup preserves `import React from 'react'` verbatim — the bare specifier is passed through. The browser then resolves it via import maps.

When `format: 'iife'`, Rollup expects globals. The output becomes `var MyPlugin = (function(React, ReactDOM) { ... })(window.React, window.ReactDOM)`.

### Vite `build.lib` + `rollupOptions.external`

Vite's library mode is a thin wrapper around Rollup for exactly this use case:

```js
// vite.config.js
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.js',
      formats: ['es'],     // or ['es', 'umd']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
})
```
[Vite library mode](https://vite.dev/guide/build#library-mode)
[Vite build.lib config](https://vite.dev/config/build-options#build-lib)

When `formats: ['es']`, Vite builds a pure ESM bundle with external deps as bare import specifiers. Output for a React plugin:

```js
// build/plugins/feed-widget.js
import React from 'react';
import { createRoot } from 'react-dom/client';
// ...plugin code...
```

### Primary sources

- [Webpack externals](https://webpack.js.org/configuration/externals/)
- [Rollup external](https://rollupjs.org/configuration-options/#external)
- [Rollup output.globals](https://rollupjs.org/configuration-options/#output-globals)
- [Vite library mode](https://vite.dev/guide/build#library-mode)
- [Vite build.lib](https://vite.dev/config/build-options#build-lib)

### Verdict

**This is the build-tool half of the solution.** Mark `react`, `react-dom`, etc. as `external` in the Vite config, set `formats: ['es']`, and the output is ESM with bare imports. Import maps handle runtime resolution. This is exactly what `build-plugins.ts` needs to adopt.

---

## 5. Module Federation Shared Libs

### How it works

Webpack 5 Module Federation allows multiple independently-built applications to share dependencies at runtime. The `shared` configuration declares which modules are shared and how version conflicts are handled.

```js
// webpack.config.js
new ModuleFederationPlugin({
  name: 'myPlugin',
  exposes: { './Widget': './src/Widget' },
  shared: {
    react: { singleton: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true }
  }
})
```
[Module Federation shared config](https://module-federation.io/configure/shared.html)

### Runtime mechanism

At runtime, Module Federation overrides `__webpack_require__` to redirect shared module requests. When Plugin A requests `react`, the runtime checks if a compatible version is already loaded. If so, it returns the existing instance. If not, it loads the version from Plugin A's bundle.

### Version negotiation

Module Federation supports version ranges. If Plugin A needs `^18.0.0` and Plugin B needs `^19.0.0`, the runtime picks the highest satisfying version — or loads both if they can't be satisfied by one version (the `singleton: false` case).

### Primary sources

- [Module Federation — shared](https://module-federation.io/configure/shared.html)
- Webpack runtime source: `lib/sharing/`

### Verdict

**Tempting but wrong fit for Flux.** Module Federation is Webpack-only and designed for micro-frontend architectures where each "remote" is a separately-deployed app. Flux plugins are not separately deployed — they're loaded from local files. The version negotiation is attractive but adds enormous complexity. Native ESM + import maps achieves the same with zero runtime code.

---

## 6. esbuild `external`

### How it works

esbuild's `external` option marks module paths that should not be bundled:

```js
require('esbuild').build({
  entryPoints: ['src/plugin.tsx'],
  bundle: true,
  format: 'esm',
  external: ['react', 'react-dom'],
  outfile: 'dist/plugin.js'
})
```
[esbuild external docs](https://esbuild.github.io/api/#external)

### Format support

Supports `format: 'esm'`, `'cjs'`, `'iife'`. When `format: 'esm'`, external imports become `import` statements in output.

### Packages mode

esbuild also supports `packages: 'external'` which automatically externalizes everything in `node_modules`:
```js
require('esbuild').build({
  packages: 'external',
  // ...
})
```
This is useful for library authors — mark all dependencies external by default.

### Primary sources

- [esbuild API — external](https://esbuild.github.io/api/#external)
- [esbuild API — packages](https://esbuild.github.io/api/#packages)

### Verdict

**esbuild could replace Vite entirely** for plugin builds. It's faster, simpler, and supports the critical features (external deps, ESM output, JSX transform). The trade-off: no Tailwind CSS processing (unless you do it separately). For Flux plugins that use Tailwind, Vite's `@tailwindcss/vite` plugin is currently relied on.

---

## 7. AMD / RequireJS

### How it works

AMD modules are defined via `define(id, [dependencies], factory)`. Dependencies are resolved asynchronously by a loader (RequireJS).

```js
define('my-plugin', ['react', 'react-dom'], function(React, ReactDOM) {
  return { render: function() { /* ... */ } };
});
```
[AMD spec](https://github.com/amdjs/amdjs-api/wiki/AMD)

### Output format

AMD `define()` calls. Not a native standard.

### Runtime resolution

RequireJS script-loader fetches each module as a separate script tag. Once all deps load, the factory executes.

### WhyAMD

The RequireJS team makes the case that AMD solves the "script ordering" problem better than CommonJS, and works directly in browsers without a build step. See [Why AMD?](https://requirejs.org/docs/whyamd.html).

### Verdict

**Legacy.** AMD was the best option in 2011. Native ESM + import maps supersede it entirely. Skip.

---

## 8. Microbundle / tsup / unbuild

### How it works

Modern zero-config library bundlers that output multiple formats (ESM + CJS + UMD) with external deps.

### tsup (esbuild-based)

```bash
tsup src/index.ts --format esm,cjs --external react --dts
```

### microbundle (Rollup-based)

```bash
microbundle --external react --format esm
```

### unbuild (Rollup-based)

```js
// build.config.ts
export default {
  entries: ['./src/index'],
  externals: ['react'],
  declaration: true,
}
```

### Primary sources

- [tsup](https://tsup.egoist.dev/)
- [microbundle](https://github.com/developit/microbundle)
- [unbuild](https://github.com/unjs/unbuild)

### Verdict

**Not directly applicable.** These are designed for npm library authors who ship `package.json` with `exports` field. Flux plugins aren't npm packages — they're internal Web Components. But the concept (external deps, ESM output, multiple formats) is the same. The external-deps pattern is universal.

---

## 9. Podium Podlet Build Output

### How it works

Podium is a micro-frontend framework. Each "podlet" is a page fragment server that declares its CSS/JS assets and dependencies. The layout server composes podlets into a full page.

### Dependency model

Podlets declare JS assets with types (`esm`, `default`, `cjs`). The layout server is responsible for deduplication and loading order. Podium's manifest format:

```json
{
  "name": "myPodlet",
  "version": "1.0.0",
  "content": "/",
  "css": [{ "value": "/assets/main.css", "strategy": "beforeInteractive" }],
  "js": [{ "value": "/assets/main.js", "type": "esm" }]
}
```
[Podium podlet docs](https://podium-lib.io/docs/api/podlet)

### Key insight

Podium's approach is architectural, not a bundling technique. The layout (host) manages dependencies centrally. Each podlet describes what it needs; the layout resolves it.

### Primary sources

- [Podium @podium/podlet docs](https://podium-lib.io/docs/api/podlet)
- [Podium manifest.json](https://podium-lib.io/docs/api/manifest)

### Verdict

**Architectural inspiration.** The idea of a manifest declaring dependency needs (framework, version) is exactly what Flux should adopt for its `plugin.json`. The host (App.tsx) reads plugin manifests, builds an import map for shared deps, then loads plugins as ESM.

---

## 10. Comparison Matrix

| System | Output Format | External Decl. | Runtime Resolution | Versioning | Debugging | Caching |
|--------|--------------|----------------|-------------------|------------|-----------|---------|
| Native ESM | `import/export` | Bare import specifiers | Browser module loader | Single version per key | Native devtools | HTTP cache |
| Import Maps | N/A (config) | Map key→URL mapping | Browser module loader | Scopes per path | N/A | N/A |
| SystemJS | `System.register()` | Deps array | SystemJS registry | Single per key | Stack frames +1 level | Internal registry |
| Webpack `externals` | ESM/CJS/UMD/IIFE | `externals` config | Import/require/global | At build time | Sourcemaps | Depends on format |
| Rollup `external` | ESM/CJS/IIFE/UMD | `external` array | Import/require/global | At build time | Sourcemaps | Depends on format |
| Vite library mode | ESM (+ CJS/UMD) | `rollupOptions.external` | Import/require/global | At build time | Sourcemaps | Depends on format |
| Module Federation | Webpack chunks | `shared` config | `__webpack_require__` override | Semver range | Complex | Internal share scope |
| esbuild `external` | ESM/CJS/IIFE | `external` array | Import/require/global | At build time | Sourcemaps | Depends on format |
| AMD/RequireJS | `define()` calls | Deps array | RequireJS loader | At config time | eval-based | Internal registry |
| lib bundlers (tsup) | ESM + CJS + UMD | `--external` | Import/require/global | At build time | Sourcemaps | Depends on format |

---

## 11. Recommended Strategy for Flux

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  host (App.tsx)                                          │
│                                                          │
│  1. Scan manifests → collect deps (framework+version)     │
│  2. Build import map from host's dep registry             │
│  3. Inject <script type="importmap"> into document        │
│  4. For each plugin: <script type="module" src="...">     │
│     (instead of loading via core-static + script.text)    │
└─────────────────────────────────────────────────────────┘
         │                        ▲
         │ loads                   │ provides
         ▼                        │
┌─────────────────────────────────┴──┐
│  build/plugins/                    │
│                                    │
│  feed-widget.js   ← ESM, ext deps │
│  yt-video-card.js ← ESM, ext deps │
│  peertube-card.js ← ESM, ext deps │
│  player-modal.js  ← ESM, ext deps │
│  react.19.2.js    ← shared, from  │
│  react-dom.19.2.js  esm.sh cache  │
└────────────────────────────────────┘
```

### 11.1. Build Tool Changes (`build-plugins.ts`)

**Current:**
```ts
build: {
  lib: { entry, formats: ["iife"], name: "Widget" },
  // no external — everything inlined
}
```

**New:**
```ts
build: {
  lib: {
    entry,
    formats: ["es"],  // ESM, not IIFE
  },
  rollupOptions: {
    external: [
      'react', 'react-dom', 'react-dom/client',
      'react/jsx-runtime',
    ],
    output: {
      // Bare specifiers pass through — import maps resolve them
    }
  }
}
```

Key changes:
- `formats: ["es"]` instead of `["iife"]`
- Add `rollupOptions.external` listing known shared deps
- Remove `vite-plugin-css-injected-by-js` (CSS can be external file, or keep injected)
- Keep `@tailwindcss/vite` for same CSS pipeline

The generated `.vite.config.mjs` becomes:
```js
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import injectCss from "vite-plugin-css-injected-by-js"

export default defineConfig({
  root: "/path/to/plugin",
  plugins: [react(), tailwindcss(), injectCss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: {
      entry: "entry.tsx",
      formats: ["es"],
      fileName: () => "feed-widget.js",
    },
    outDir: "/path/to/build/plugins",
    emptyOutDir: false,
    rollupOptions: {
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
  },
})
```

### 11.2. Plugin Output (ESM)

Instead of a 160KB IIFE, each plugin outputs something like:

```js
// build/plugins/feed-widget.js — ~2KB of actual plugin code
import React from 'react';
import { createRoot } from 'react-dom/client';

var FeedWidget = React.forwardRef(function(props, ref) { /* ... */ });

customElements.define("feed-widget", class extends HTMLElement {
  // ... WC wrapper (the entry.tsx generated code) ...
  connectedCallback() {
    this.root = createRoot(this);
    this.render();
  }
  // ...
});
```

The WC wrapper code (currently inlined in `entry()` per framework) stays the same — it's just the dependency imports that change.

### 11.3. Manifest Format Changes (`plugin.json`)

Add optional `deps` field:

```json
{
  "name": "feed",
  "ui": "feed-widget",
  "feeds": [{ "method": "feed.get", "card": "yt-video-card" }],
  "deps": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

For a no-framework plugin:
```json
{
  "name": "peertube",
  "ui": "peertube-card",
  "deps": {}
}
```

This is how the host knows which versions to serve.

### 11.4. Runtime Loader — Dep Registry + Import Map Generation

A new module `src/shared/dep-registry.ts`:

```typescript
// Maps package name → best version → URL
const SHARED_DEPS: Record<string, Record<string, string>> = {
  "react": {
    "^18.0.0": "build/plugins/_shared/react.18.3.1.mjs",
    "^19.0.0": "build/plugins/_shared/react.19.2.0.mjs",
  },
  "react-dom": {
    "^18.0.0": "build/plugins/_shared/react-dom.18.3.1.mjs",
    "^19.0.0": "build/plugins/_shared/react-dom.19.2.0.mjs",
  },
}
```

These shared dep files can be:
- Pre-built via a `bun run build:shared` step that downloads from esm.sh
- Or served dynamically via `core-shared` plugin

### 11.5. Loading Sequence in `App.tsx`

```typescript
async function init() {
  const all: PluginManifest[] = await window.__pluginRpc('core-manifest.scan', {})
  setManifests(all)

  // 1. Resolve shared dependencies
  const importMap = buildImportMap(all)
  injectImportMap(importMap)

  // 2. Load shared dep files first
  for (const url of Object.values(importMap.imports)) {
    await preloadModule(url)  // <link rel="modulepreload"> or dynamic import
  }

  // 3. Load plugin ESM modules
  for (const m of all) {
    for (const f of (m.feeds || [])) {
      if (f.card && !loaded.has(f.card)) {
        loaded.add(f.card)
        await loadModule(`build/plugins/${f.card}.js`)
      }
    }
    // ... same for ui, components
  }
}

function buildImportMap(manifests: PluginManifest[]): ImportMap {
  const imports: Record<string, string> = {}
  for (const m of manifests) {
    for (const [pkg, versionRange] of Object.entries(m.deps || {})) {
      const url = resolveDep(pkg, versionRange)
      if (url && !imports[pkg]) imports[pkg] = url
    }
  }
  return { imports }
}

function injectImportMap(map: ImportMap) {
  const el = document.createElement('script')
  el.type = 'importmap'
  el.textContent = JSON.stringify(map)
  document.head.prepend(el)  // must be before any module scripts
}

async function loadModule(path: string) {
  // Create a <script type="module"> element
  const script = document.createElement('script')
  script.type = 'module'
  script.src = path  // or `__pluginRpc('core-static.read', {path})` + Blob URL
  document.body.appendChild(script)
}
```

### 11.6. Handling the `core-static` Loading Problem

Currently, Flux reads plugin JS via `core-static.read` (reads the file and injects as `script.textContent`). This won't work for modules — `textContent` doesn't trigger module resolution.

**Options:**

**A) Serve via file URL / custom protocol** — simplest if Tauri can serve `build/plugins/` via `tauri://localhost` or `asset://` protocol. Then `<script type="module" src="asset://build/plugins/feed-widget.js">` works natively.

**B) Blob URL** — read file via core-static, create a Blob URL:
```typescript
async function loadModule(path: string) {
  const result = await window.__pluginRpc("core-static.read", { path })
  const blob = new Blob([result.code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const script = document.createElement('script')
  script.type = 'module'
  script.src = url
  document.body.appendChild(script)
}
```
Import maps won't resolve against blob URLs for bare specifiers — the browser's module resolution treats blob URLs as unique origins. So this approach **doesn't work with import maps**.

**C) Inline data URL** — encode as `data:text/javascript;base64,...`. Same origin issue as blob URLs.

**D) Serve via Vite dev server** — during `tauri dev`, Vite already serves the app. Add a route for `build/plugins/`. This is the cleanest approach:
```typescript
// In Tauri dev: plugin modules loaded from Vite dev server
script.src = `/build/plugins/${tag}.js`
// The Vite dev server proxies or directly serves build/plugins/
```

**E) Write a small Tauri plugin command** — serve the file content with the correct MIME type and let Tauri's webview handle module loading directly via a custom protocol, like `flux://plugins/feed-widget.js`. This requires Rust-side changes.

**F) esm.sh-style dynamic serving** — add a `core-shared` backend plugin that serves shared deps (React, ReactDOM) with correct MIME types from a downloadable cache.

**Recommended: Combine D + E.** Use Vite dev server proxy for development, and a custom Tauri protocol (`flux://plugins/`) for production builds. The `core-static` plugin can be extended to serve via a Tauri command that returns proper module-compatible responses.

### 11.7. Version Resolution Algorithm

When multiple plugins need different React versions:

```
Plugin A needs react ^18.0.0
Plugin B needs react ^18.2.0
  → Both satisfied by react@18.3.1 → one shared copy

Plugin C needs react ^19.0.0
  → Not satisfied by 18.3.1 → separate copy
  → Import map scope: only Plugin C's path gets react@19
  → All other paths get react@18.3.1
```

The `resolveDep` function uses `semver` (or a lightweight `satisfies` check):
```typescript
function resolveDep(pkg: string, range: string): string | null {
  const versions = SHARED_DEPS[pkg]
  if (!versions) return null
  // Find best matching version
  for (const [verRange, url] of Object.entries(versions)) {
    if (semver.satisfies(extractMax(verRange), range))  // simplified
      return url
  }
  return null
}
```

### 11.8. Shared Dep Build Step

Add to `package.json`:
```json
{
  "scripts": {
    "build:shared": "bun scripts/build-shared.ts",
    "build:plugins": "bun scripts/build-plugins.ts",
    "build": "bun run build:shared && bun run build:plugins && tauri build"
  }
}
```

`scripts/build-shared.ts` downloads the specific React versions from esm.sh:
```typescript
// For each version in SHARED_DEPS, download from esm.sh
const deps = [
  { name: 'react', version: '18.3.1' },
  { name: 'react-dom', version: '18.3.1' },
  { name: 'react', version: '19.2.0' },
  { name: 'react-dom', version: '19.2.0' },
]

for (const dep of deps) {
  const url = `https://esm.sh/${dep.name}@${dep.version}?bundle=false`
  const res = await fetch(url)
  const code = await res.text()
  const outPath = `build/plugins/_shared/${dep.name}.${dep.version}.mjs`
  Bun.write(outPath, code)
}
```

### 11.9. Impact Analysis

| Metric | Current (IIFE) | Proposed (ESM + ext) |
|--------|---------------|---------------------|
| Plugin size | ~160KB each | ~2KB each + 130KB shared React |
| 3 React plugins | ~480KB total | ~136KB total (72% reduction) |
| Load time | Sequential script injection | Parallel module loading |
| React version | Single, inlined | Multiple majors possible |
| Debugging | Minified IIFE | Sourcemapped ESM files |
| Build time | ~20s per plugin | Similar (less minification) |
| Runtime deps | None | Import maps (browser native) |

### 11.10. Edge Cases

**Plugin uses no framework** — `deps: {}` in manifest → no external deps → no import map entries needed.

**Plugin uses Preact instead of React** — Preact can be a shared dep too, or the plugin imports `preact/compat` which is a drop-in for React. esm.sh supports aliasing: `https://esm.sh/swr?alias=react:preact/compat`.

**Plugin needs Tailwind CSS** — Inline injection still works. The CSS is part of the ESM bundle (via `vite-plugin-css-injected-by-js`). The external deps are only JS libraries.

**Circular dep loading** — ESM handles circular deps correctly. The WC wrapper pattern (define custom element in module top-level) doesn't create cycles.

**Loading order** — `<script type="module">` is always deferred (executes after DOM parsing). Modules are loaded in document order but each waits for its dependencies first.

### 11.11. Migration Path

1. Add `deps` field to all `plugin.json` manifests
2. Add `build:shared` script to download shared deps
3. Modify `build-plugins.ts` to output ESM with externals
4. Add import map generation + injection to `App.tsx`
5. Change plugin loading from `script.textContent` to `<script type="module" src="...">`
6. Handle module serving (Vite proxy for dev, custom protocol for production)
7. Test each plugin individually
8. Remove IIFE support once all plugins are migrated

### 11.12. Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| SystemJS | Native ESM + import maps do everything needed, no extra runtime |
| Module Federation | Webpack-only, designed for separately-deployed micro-frontends |
| AMD/RequireJS | Legacy, superseded by native ESM |
| tsup/microbundle | Plugin build needs Vite's Tailwind integration |
| Keeping IIFE | Duplicated deps are ~300KB waste |

---

## 12. Summary

The ideal strategy for Flux is:

**Build tool:** Vite library mode with `formats: ["es"]` + `rollupOptions.external` for React/ReactDOM. ESM output with bare import specifiers.

**Runtime resolution:** Browser-native import maps. One `<script type="importmap">` generated by the host after scanning all plugin manifests. Multiple React versions supported via import map scopes.

**Manifest extension:** New `deps` field in `plugin.json` declaring framework name + semver range.

**Loading:** `<script type="module" src="...">` elements, loaded from Vite dev server (dev) or custom Tauri protocol (production). Shared deps pre-downloaded from esm.sh via a `build:shared` script.

**Result:** Plugins are ~2KB of real code instead of 160KB. React is loaded once for all plugins that share the same major version. Multiple React majors can coexist via scoped import maps. Zero additional runtime dependencies — it's all native browser APIs.
