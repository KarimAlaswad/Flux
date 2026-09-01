# Polyglot Micro-Frontend Architectures

> Research into real systems where plugins/apps built with different frameworks coexist, share state, and communicate. Each claim cites a primary source.

## Table of Contents

1. [Systems Investigated](#systems-investigated)
2. [Comparison Table](#comparison-table)
3. [Deep Dives](#deep-dives)
4. [Flux Architecture Design](#flux-architecture-design)

---

## Systems Investigated

| System | Source | Origin |
|--------|--------|--------|
| single-spa | [single-spa.js.org](https://single-spa.js.org/docs/ecosystem/) | Canopy (community) |
| Podium | [podium-lib.io](https://podium-lib.io/) | FINN.no |
| OpenFin / FDC3 | [fdc3.finos.org](https://fdc3.finos.org/docs/overview/intro) | FINOS consortium |
| qiankun | [qiankun.umijs.org](https://qiankun.umijs.org/guide) | Ant Financial (Alibaba) |
| Garfish | [github.com/bytedance/garfish](https://github.com/bytedance/garfish) | ByteDance |
| ILC (Isomorphic Layout Composer) | [github.com/namecheap/ilc](https://github.com/namecheap/ilc) | Namecheap |
| OpenComponents | [opencomponents.github.io](https://opencomponents.github.io/) | OpenTable / IBM |

---

## Comparison Table

| Criteria | single-spa | Podium | OpenFin/FDC3 | qiankun | Garfish | ILC | OpenComponents |
|----------|-----------|--------|-------------|---------|---------|-----|---------------|
| **Framework support** | All via adapters (React, Vue, Angular, Svelte, Lit, etc.) | All (podlets serve HTML fragments) | All (each app bundles its own) | All via sandbox | All via sandbox | All (via single-spa adapters) | All (HTML fragments) |
| **Share framework instance** | Via import maps (single React for all) | No (each podlet brings its own JS) | No (each app bundles own) | No (each sub-app bundles own) | No (each sub-app bundles own) | Via import maps (inherits from single-spa) | No (each component has own deps) |
| **Version coexistence** | Via import maps (pin per version) | Inherent (independent per podlet) | Inherent (separate processes) | Inherent (sandboxed per app) | Inherent (sandboxed per app) | Via import maps | Inherent (versioned per component) |
| **Communication** | CustomEvents, cross-imports, rxjs | MessageBus (`@podium/browser`), `@podium/store` (nanostores) | FDC3 API (intents, channels, context) | `initGlobalState` (shared state) | Garfish Store | N/A (routed pages) | N/A (rendered fragments) |
| **JS sandbox** | None | None | OS process isolation | Proxy-based (snapshot & restore) | Proxy-based | None | None |
| **CSS isolation** | None | None | OS process | Shadow DOM, style scoping | CSS scoping plugin | None | None |
| **Entry format** | ESM / System.register | HTTP endpoint (HTML) | Any (desktop app) | HTML entry | HTML / JS entry | System.register (via single-spa) | Rendered HTML + client JS |
| **SSR support** | Yes (new in 6.x) | Server-side composition | N/A | No (client-side only) | No | Yes (isomorphic via TailorX) | Yes |
| **Desktop app fit** | Web app | Web app | Targeted at desktop | Web app | Web app | Web app | Web app |
| **Complexity** | Medium | Low-Medium | High | High | High | Medium | Low-Medium |
| **Registry / manifest** | Import map | `manifest.json` per podlet | App Directory (REST) | Config in host code | Config in host code | Registry service (UI + API) | OC Registry (REST API) |

---

## Deep Dives

### 1. single-spa

**Source:** [single-spa.js.org/docs/ecosystem/](https://single-spa.js.org/docs/ecosystem/)

single-spa is a **router-based** micro-frontend framework. It provides lifecycle management (bootstrap, mount, unmount) for applications built with any framework.

#### Framework Support

Official adapters exist for React, Vue, Angular, AngularJS, Svelte, Cycle, Ember, Inferno, Preact, Riot, Backbone, Dojo, AlpineJS, and plain HTML/Web Components. Each adapter wraps framework-specific bootstrapping into the `{bootstrap, mount, unmount}` contract. ([source](https://single-spa.js.org/docs/ecosystem/))

#### Shared Dependencies via Import Maps

single-spa's recommended setup uses **browser-native ES modules + import maps** (or SystemJS for polyfill). Shared libraries like React, Vue, and Angular are loaded once and shared across all applications that declare them as externals. ([source](https://single-spa.js.org/docs/recommended-setup#shared-dependencies))

```json
{
  "imports": {
    "react": "https://cdn.example.com/react@18.2.0.js",
    "react-dom": "https://cdn.example.com/react-dom@18.2.0.js"
  }
}
```

#### Version Coexistence

Import maps can alias different versions under different specifiers:
```json
{
  "imports": {
    "react": "https://cdn.example.com/react@18.2.0.js",
    "react-17": "https://cdn.example.com/react@17.0.2.js"
  }
}
```
App A imports `react` → gets 18; App B imports `react-17` → gets 17. Each app marks the other as external. This works but requires app-level coordination of import names.

#### Communication

single-spa recommends against centralized state management. It suggests:
- **Cross microfrontend imports**: utility modules export shared functions/components (ESM imports between apps).
- **CustomEvents** on `window`: for rare UI state sharing.
- **RxJS Observables**: as a pub/sub mechanism.

([source](https://single-spa.js.org/docs/recommended-setup#inter-app-communication))

#### Sandboxing

None. single-spa provides no JS or CSS sandboxing. Applications run in the global scope. Style isolation is the developer's responsibility.

#### Key Insight for Flux

single-spa's import map approach is the **only system** that actively supports sharing a single framework instance across multiple micro-apps. This is directly relevant to Flux's goal of grouping compatible plugins under shared framework instances.

---

### 2. Podium (FINN.no)

**Source:** [podium-lib.io](https://podium-lib.io/)

Podium is a **server-side composition** system. Podlets (micro-frontends) are standalone HTTP services. A Layout server fetches HTML from podlets and composes a page.

#### Architecture

```
Layout Server → HTTP GET → Podlet A's manifest.json
               → HTTP GET → Podlet A's content endpoint (HTML)
               → HTTP GET → Podlet B's manifest.json
               → HTTP GET → Podlet B's content endpoint (HTML)
               → stitch HTML into page
```

([source](https://podium-lib.io/docs/api/layout))

#### Manifest Format

Each podlet serves a `manifest.json`:
```json
{
  "name": "my-podlet",
  "version": "1.0.0",
  "content": "/",
  "fallback": "/fallback",
  "js": [{ "value": "https://cdn.example.com/my-podlet/client.js", "type": "module" }],
  "css": [{ "value": "https://cdn.example.com/my-podlet/styles.css" }],
  "proxy": { "api": "/api" }
}
```
([source](https://podium-lib.io/docs/api/manifest))

#### Client-Side Communication

Podium provides two libraries for cross-podlet communication:

**`@podium/browser`** — MessageBus with pub/sub:
```js
import { MessageBus } from "@podium/browser";
const bus = new MessageBus();
bus.publish("channel", "topic", payload);
bus.subscribe("channel", "topic", (event) => { /* event.payload */ });
bus.peek("channel", "topic"); // latest event without subscribing
```
([source](https://podium-lib.io/docs/api/browser))

**`@podium/store`** — Reactive state backed by MessageBus, uses [nanostores](https://github.com/nanostores/nanostores):
```js
import { atom } from "@podium/store";
const $counter = atom("my-channel", "counter", 0);
$counter.set($counter.value + 1);
$counter.subscribe((val) => console.log(val));
```
([source](https://podium-lib.io/docs/guides/client-side-communication))

This is the **only system** that offers both a low-level message bus and a reactive store on top, with nanostores integration for minimal UI updates.

#### Framework Support

Podlets can use any framework because they serve HTML. Each podlet bundles its own client JS. There is no shared framework instance.

#### Key Insight for Flux

Podium's dual-layer communication (MessageBus + reactive store) is a clean pattern. The `@podium/store` using nanostores is particularly relevant — lightweight, framework-agnostic, reactive atoms.

---

### 3. OpenFin / FDC3

**Source:** [fdc3.finos.org/docs/overview/intro](https://fdc3.finos.org/docs/overview/intro)

FDC3 (Financial Desktop Connectivity and Collaboration Consortium) is an **open standard for desktop application interoperability**. OpenFin is a commercial implementation.

#### Core Concepts

- **Desktop Agent**: a broker that launches apps and provides the FDC3 API.
- **Intents**: standardized verbs (`ViewChart`, `StartCall`, `SendEmail`) that one app invokes and another resolves.
- **Context**: standardized data format (e.g., `fdc3.instrument`) passed between apps.
- **Channels**: named pub/sub lanes for broadcasting context.
- **App Directory**: REST API for app discovery and metadata.

([source](https://fdc3.finos.org/docs/api/spec))

#### Communication Model

```
App A → fdc3.raiseIntent("ViewChart", context)
       → Desktop Agent resolves to App B
       → App B receives intent + context
```

Or via channels:
```
App A → fdc3.broadcast(context)     // to joined user channel
App B → fdc3.addContextListener(handler)  // receives from channel
```

([source](https://fdc3.finos.org/docs/api/spec))

#### Version Coexistence

Each app bundles its own framework. There is no shared dependency mechanism because apps run in separate processes. Version isolation is inherent at the OS level.

#### Key Insight for Flux

The **intent/context** pattern is the most sophisticated cross-app communication model. Apps describe *what* they want to do, not *who* should do it. The Desktop Agent resolves capability. This is analogous to Flux's hook system — `resolve_hook` / `call_hook` already implements an intent-like pattern.

---

### 4. qiankun (Ant Financial)

**Source:** [qiankun.umijs.org](https://qiankun.umijs.org/guide)

qiankun is a **production micro-frontend framework** built on single-spa. Used in 2000+ apps at Ant Financial.

#### Key Features

- **HTML Entry**: sub-app entry point is a URL. qiankun fetches the HTML, extracts scripts/styles, and loads them into a sandbox.
- **JS Sandbox**: Proxy-based. Intercepts `window` access — reads/writes are aliased to a fake window per app. On unmount, patched globals are restored.
- **CSS Isolation**: `strictStyleIsolation` uses Shadow DOM; `experimentalStyleIsolation` prefixes selectors with `div[data-qiankun-<app>]`.
- **Global State**: `initGlobalState(state)` creates actions (`onGlobalStateChange`, `setGlobalState`, `offGlobalStateChange`).

([source](https://qiankun.umijs.org/api))

#### Communication

```js
// Master
const actions = initGlobalState({ user: null });
actions.setGlobalState({ user: { id: 1 } });

// Sub-app (receives via mount props)
export function mount(props) {
  props.onGlobalStateChange((state, prev) => { /* ... */ });
  props.setGlobalState({ ... });
}
```

#### Key Insight for Flux

qiankun's **Proxy-based sandbox** is the most aggressive isolation approach. Every property access on `window` is intercepted. This allows truly independent code execution without global pollution. However, it breaks shared framework instances — each sub-app gets its own window proxy, so a shared React instance would not work across sandboxes.

---

### 5. Garfish (ByteDance)

**Source:** [github.com/bytedance/garfish](https://github.com/bytedance/garfish)

Garfish is ByteDance's micro-frontend framework, supporting sandbox, router, and store.

#### Key Features

- **Multiple instance support**: run multiple sub-apps simultaneously on the same page.
- **Sandbox**: Proxy-based, similar to qiankun.
- **Store**: built-in communication mechanism.
- **Framework support**: React (16, 17, 18), Vue (2, 3), Angular (13), Vite.
- **Entry types**: both HTML entry (like qiankun) and JS entry (UMD format).

([source](https://www.garfishjs.org/guide/quick-start/start.html))

#### Build Output

Sub-apps must output **UMD format**:
```js
// webpack.config.js
output: {
  libraryTarget: 'umd',
  globalObject: 'window',
}
```

Garfish supports both HTML entry (same as qiankun) and JS entry (direct UMD bundle URL).

#### Key Insight for Flux

Garfish's **dual entry support** (HTML + JS) is pragmatic. HTML entry is more flexible (works with any framework's build output). JS entry (UMD) is more performant (single file). The requirement for UMD output is a constraint that Flux could avoid by using ESM.

---

### 6. Isomorphic Layout Composer (ILC)

**Source:** [github.com/namecheap/ilc](https://github.com/namecheap/ilc)

ILC is a registry-based micro-frontend system with **SSR support**. Built on single-spa + TailorX.

#### Key Features

- **Registry**: central service where apps register themselves with metadata, routes, and slots.
- **SSR + CSR**: pages are rendered server-side on first load, then client-side for navigation.
- **App Wrappers**: shared UI chrome provided by the layout.
- **Internationalization**: built-in i18n support.

#### Architecture

```
Registry → stores app metadata, routes, slots
ILC (layout) → fetches registry data → composes page server-side → hydrates client-side
```

ILC uses single-spa under the hood for client-side routing. It inherits single-spa's entire adapter ecosystem. ([source](https://github.com/namecheap/ilc#key-features))

#### Key Insight for Flux

ILC's **registry pattern** — where apps declare routes, slots, and dependencies — is the closest analogue to Flux's manifest system. The registry is a single source of truth for what apps exist, where they appear, and how they compose.

---

### 7. OpenComponents (OpenTable / IBM)

**Source:** [opencomponents.github.io](https://opencomponents.github.io/)

OpenComponents is a **component-level** micro-frontend system. Components are independently deployable units with HTML, CSS, JS, and optional server-side Node.js logic.

#### Key Features

- **CLI**: `oc dev`, `oc publish` for development and deployment.
- **Registry**: REST API for component catalog and rendering.
- **Immutability**: published components are immutable, semantic-versioned.
- **Language-agnostic consumption**: any backend can consume components via HTTP. The registry can pre-render HTML server-side.

#### Framework Support

Components can use any framework because they produce HTML. "Teams can choose their preferred frontend stack (React, Vue, vanilla JS) while still contributing to the same application." ([source](https://opencomponents.github.io/))

#### Key Insight for Flux

OpenComponents proves that **HTML fragments + client-side JS** is the lowest-common-denominator approach for framework-agnostic composition. The tradeoff: no shared framework instances, no cross-component state without a separate mechanism.

---

## Flux Architecture Design

Based on the research above, here is a complete architecture for Flux that solves the specific requirements: shared framework instances per version group, cross-plugin state without CustomEvents, and manifest-declared framework+version.

### Design Goals

1. **Plugin A (React 18) and Plugin B (React 18) share one React instance.**
2. **Plugin C (React 19) gets its own React instance, isolated from Plugin A/B.**
3. **Vue plugin gets a Vue instance, Lit plugin gets Lit.**
4. **Cross-plugin state sharing via a typed store (not CustomEvents).**
5. **Plugin manifest declares `framework` + `versionRange`.**
6. **Host groups plugins by compatible framework versions, loads shared instances per group.**
7. **IIFE is not required — ESM modules are fine.**

### 1. Plugin Manifest Format

```json
{
  "name": "yt-feed",
  "version": "1.0.0",
  "run": "bun ./main.ts",
  "methods": ["feed"],
  "hooks": ["feed.video"],
  "ui": "yt-feed-widget",
  "components": ["yt-video-card"],
  "feeds": [{ "method": "feed", "card": "yt-video-card" }],
  "slots": ["video.player"],

  "framework": {
    "name": "react",
    "versionRange": "^18.0.0",
    "externals": ["react", "react-dom", "react/jsx-runtime"]
  }
}
```

The `framework` block is new. It declares:
- `name`: the framework family
- `versionRange`: semver range this plugin is compatible with
- `externals`: the ESM module specifiers that should be satisfied by the shared instance

Plugins with **no** `framework` block are treated as vanilla/self-contained (like the current backend-only plugins).

### 2. Host Loader — Grouping Algorithm

The host maintains a **registry of shared framework instances**. The loading algorithm:

```typescript
interface FrameworkGroup {
  key: string;           // e.g., "react@18"
  name: string;          // "react"
  version: string;       // resolved version, e.g., "18.2.0"
  externals: string[];   // module specifiers this group provides
  scriptUrl: string;     // URL to the ESM bundle for this framework
  plugins: PluginManifest[];
}

interface PluginManifest {
  name: string;
  ui?: string;
  components?: string[];
  framework?: {
    name: string;
    versionRange: string;
    externals: string[];
  };
}

// Pseudocode for the loading algorithm
async function loadPlugins(manifests: PluginManifest[]) {
  // 1. Group plugins by framework compatibility
  const groups = new Map<string, FrameworkGroup>();

  for (const plugin of manifests) {
    if (!plugin.framework) {
      // Vanilla/backend-only plugin — no shared framework needed
      groups.set(`vanilla:${plugin.name}`, {
        key: `vanilla:${plugin.name}`,
        name: "vanilla",
        version: "1.0.0",
        externals: [],
        scriptUrl: null,
        plugins: [plugin],
      });
      continue;
    }

    // Find a compatible group or create one
    const compatKey = `${plugin.framework.name}@${plugin.framework.versionRange}`;
    // Actually resolve to the best matching group:
    // semver.satisfies(groupVersion, plugin.framework.versionRange)
    let group = findCompatibleGroup(groups, plugin.framework.name, plugin.framework.versionRange);

    if (!group) {
      // Resolve the best version for this range
      const resolved = await resolveFrameworkVersion(plugin.framework.name, plugin.framework.versionRange);
      group = {
        key: `${resolved.name}@${resolved.version}`,
        name: resolved.name,
        version: resolved.version,
        externals: plugin.framework.externals,
        scriptUrl: resolved.scriptUrl,  // URL to the shared bundle
        plugins: [],
      };
      groups.set(group.key, group);
    }

    group.plugins.push(plugin);
  }

  // 2. Load shared framework instances (in parallel across groups)
  for (const group of groups.values()) {
    if (group.scriptUrl) {
      await loadScript(group.scriptUrl, { type: "module" });
    }
  }

  // 3. Build plugin WC wrappers (externals resolved to shared instances)
  for (const group of groups.values()) {
    for (const plugin of group.plugins) {
      if (plugin.ui || plugin.components) {
        await buildPluginWC(plugin, group.externals);
      }
    }
  }
}
```

#### How Grouping Works

- **React 18 plugins** (`"versionRange": "^18.0.0"`) → grouped together → one React 18 loaded
- **React 19 plugin** (`"versionRange": "^19.0.0"`) → no compatibility with 18 → gets its own React 19
- **Vue plugin** (`"versionRange": "^3.0.0"`) → different framework name → separate group

The `findCompatibleGroup` function checks:
1. Same `name` (react, vue, etc.)
2. Plugin's `versionRange` satisfies the group's resolved version
3. If no group matches, create a new one

### 3. Plugin Output Format (ESM with External Deps)

Plugins are built as **ESM modules** with framework dependencies declared as externals. The build process:

```typescript
// build-plugins.ts logic
import { build } from "vite";

async function buildPlugin(manifest: PluginManifest) {
  const external = manifest.framework?.externals ?? [];

  await build({
    entry: findSourceFile(manifest),
    format: "es",     // ESM output
    external,          // e.g., ["react", "react-dom", "react/jsx-runtime"]
    outDir: `build/plugins/${manifest.name}`,
    rollupOptions: {
      output: {
        entryFileNames: `${manifest.name}.js`,
        chunkFileNames: `${manifest.name}.[hash].js`,
      },
    },
  });
}
```

The output bundle has `import` statements for framework deps:
```js
// build/plugins/yt-feed/yt-feed-widget.js
import React from "react";
import ReactDOM from "react-dom";
// ... actual plugin code, no React bundled
```

These imports are resolved at runtime via the shared framework instance loaded by the host.

### 4. Cross-Plugin Shared State Mechanism

Inspired by Podium's `@podium/store` (MessageBus + nanostores) and FDC3's channels, Flux gets a **typed global state bus**:

```typescript
// flux-runtime.ts — loaded before any plugin
class FluxStore {
  private stores = new Map<string, any>();
  private listeners = new Map<string, Set<(value: any) => void>>();

  // Define a typed store
  define<T>(key: string, initial: T): {
    get: () => T;
    set: (value: T | ((prev: T) => T)) => void;
    subscribe: (fn: (value: T) => void) => () => void;
  } {
    if (!this.stores.has(key)) {
      this.stores.set(key, initial);
      this.listeners.set(key, new Set());
    }
    return {
      get: () => this.stores.get(key) as T,
      set: (value) => {
        const prev = this.stores.get(key);
        const next = typeof value === "function" ? (value as any)(prev) : value;
        this.stores.set(key, next);
        this.listeners.get(key)?.forEach((fn) => fn(next));
      },
      subscribe: (fn) => {
        this.listeners.get(key)?.add(fn);
        return () => this.listeners.get(key)?.delete(fn);
      },
    };
  }
}

// Exposed on window for plugin use
(window as any).__fluxStore = new FluxStore();
```

Plugin usage:
```tsx
// Inside any plugin (React, Vue, Svelte, Lit — same API)
const store = (window as any).__fluxStore;

const playerStore = store.define<{ url: string; title: string } | null>("video.player", null);

// In card plugin
playerStore.set({ url: videoUrl, title: video.title });

// In player plugin
const { get, subscribe } = playerStore;
subscribe((state) => {
  if (state) loadVideo(state.url, state.title);
});
```

This replaces CustomEvents entirely. Benefits:
- **Typed**: TypeScript can type the store keys and values
- **Reactive**: subscribers get called on change
- **Framework-agnostic**: works in React hooks, Vue reactive refs, Svelte stores
- **Single source of truth**: no event name collisions
- **Inspectable**: dev tools can read all store keys + values

Optional: integrate with nanostores (like Podium) for minimal UI bindings.

### 5. Loading Sequence

```
1. Boot Tauri shell (Rust)
2. Host React app renders (main.tsx)
3. Window bridge API set (__pluginRpc, resolveHook, callHook)
4. Host calls core-manifest.scan → get all manifests
5. Host groups manifests by framework compatibility
6. Parallel loading phase:
   ├── For each unique framework group:
   │   └── Load shared framework ESM (e.g., React 18 bundle)
   ├── For each plugin with ui/components:
   │   └── Build WC wrapper with externals resolved
   └── For each backend-only plugin:
       └── Spawn subprocess (current behavior)
7. Activate phase:
   └── Append WC elements to DOM
```

This ensures frameworks are loaded **before** plugins that depend on them.

### 6. Debugging Strategy

```typescript
// Dev mode — exposed on window
(window as any).__fluxDebug = {
  groups: () => {
    // Show all framework groups: { key, name, version, plugins[] }
    return Array.from(frameworkGroups.values());
  },
  store: () => {
    // Show all store keys and current values
    return store.snapshot();
  },
  pluginHealth: () => {
    // Show each plugin's status: loading, loaded, error, mounted
    return pluginRegistry.status();
  },
  frameworkVersions: () => {
    // Show which framework+version each plugin is using
    return pluginRegistry.getFrameworkMap();
  },
};
```

### 7. Shared Framework Bundle Hosting

The host needs URLs for shared framework ESM bundles. Options:

1. **ESM CDN** (like esm.sh, esm.run, jsdelivr +esm):
   ```
   https://esm.sh/react@18.2.0
   https://esm.sh/react-dom@18.2.0
   ```

2. **Self-hosted**: generate bundles via `build-plugins.ts` and serve from `build/frameworks/`.

3. **Import map** (single-spa style): declare mappings in a JSON file:
   ```json
   {
     "imports": {
       "react": "/build/frameworks/react@18.2.0.js",
       "react-dom": "/build/frameworks/react-dom@18.2.0.js"
     }
   }
   ```

The host uses either import maps (native browser support) or dynamic `import()` to load these.

### 8. WC Wrapper Generation

Current WC wrappers embed the entire IIFE. New wrappers use ESM with externals:

```typescript
async function buildPluginWC(plugin: PluginManifest, externals: string[]) {
  const tag = plugin.ui || plugin.components?.[0];
  if (!tag) return;

  // Generate a wrapper that:
  // 1. Loads the plugin ESM bundle via dynamic import
  // 2. Sets up the store bridge
  // 3. Mounts the component in the custom element

  const wrapperCode = `
    import { __fluxStore } from "//flux-runtime";
    import("${plugin.name}.js"); // plugin's ESM bundle

    customElements.define("${tag}", class extends HTMLElement {
      connectedCallback() {
        const shadow = this.attachShadow({ mode: "open" });
        // Mount plugin's root component into shadow
      }
    });
  `;
  // Write wrapper, load via script tag
}
```

### 9. Backward Compatibility

For existing plugins without a `framework` field:
- They are treated as **vanilla** plugins (current behavior)
- They get no shared framework instance
- They bundle all deps themselves (IIFE as before)
- They access stores via `window.__fluxStore` if needed

This means the existing 12 plugins continue working unchanged. The polyglot architecture is opt-in per plugin.

### 10. Summary of Changes

| Aspect | Current Flux | New Flux |
|--------|-------------|----------|
| Plugin output | IIFE (all deps bundled) | ESM (framework deps external) |
| Framework loading | Per-plugin (duplicated) | Per-version-group (shared) |
| Cross-plugin state | CustomEvents | Typed `FluxStore` |
| Manifest | No framework info | `framework` block added |
| WC generation | Vite build → IIFE | Vite build → ESM + externals |
| Debugging | None | `__fluxDebug` API |

---

## Sources

1. single-spa ecosystem — https://single-spa.js.org/docs/ecosystem/
2. single-spa recommended setup — https://single-spa.js.org/docs/recommended-setup
3. Podium concepts — https://podium-lib.io/
4. Podium layout API — https://podium-lib.io/docs/api/layout
5. Podium manifest — https://podium-lib.io/docs/api/manifest
6. Podium browser (MessageBus) — https://podium-lib.io/docs/api/browser
7. Podium client-side communication (store) — https://podium-lib.io/docs/guides/client-side-communication
8. FDC3 introduction — https://fdc3.finos.org/docs/overview/intro
9. FDC3 API spec (2.2) — https://fdc3.finos.org/docs/api/spec
10. qiankun guide — https://qiankun.umijs.org/guide
11. qiankun API — https://qiankun.umijs.org/api
12. Garfish GitHub — https://github.com/bytedance/garfish
13. Garfish quick start — https://www.garfishjs.org/guide/quick-start/start.html
14. ILC GitHub — https://github.com/namecheap/ilc
15. OpenComponents docs — https://opencomponents.github.io/docs/concepts/
