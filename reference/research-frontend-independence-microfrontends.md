# Research: Micro-Frontend Patterns for Framework Independence

**Date:** 2026-07-29
**Scope:** How micro-frontend architectures achieve framework independence, and which patterns apply to desktop WebView plugins (Flux).

---

## 1. Module Federation (Webpack 5 / Rspack)

**Source:** <https://module-federation.io/configure/shared.html>
**Source:** <https://single-spa.js.org/docs/recommended-setup/#module-federation>

### Isolation mechanism

Module Federation does **not** isolate frameworks. It shares them. Each remote module (micro-frontend) is built independently but can declare shared dependencies. At runtime, a "share scope" negotiates which version of a dependency to use. If `singleton: true` is set, only one instance of React/etc. is loaded across all remotes. If `singleton: false`, each remote gets its own copy.

### Shared dependencies

React is shared via the `shared` config:

```js
shared: {
  react: { singleton: true, requiredVersion: '^18.0.0' },
  'react-dom': { singleton: true },
}
```

- `singleton: true` — only one instance is loaded; version mismatch emits a warning but loads the higher version.
- `requiredVersion` — declares the range this module expects; negotiation picks the highest satisfying version.
- `shareScope` — isolates groups of consumers into separate scopes, so different host apps can have different React versions.
- `shareKey` — custom key for matching; both sides must use the same key or they each bundle their own copy.

### Communication

No built-in event system. Apps communicate through:
- Shared stores (imported via federation)
- Custom events on `window`
- Props passed through framework-specific wrappers

### Build pipeline

Each micro-frontend is a separate Webpack/Rspack build producing:
- A `remoteEntry.js` (async chunk that registers with the share scope)
- Normal chunk files for its components
- A manifest (for dynamic loading)

### Versioning

When app A upgrades React 18→19 and app B remains on React 18:
- With `singleton: true` + `requiredVersion` that allows 19, both use React 19.
- With `singleton: false`, each app loads its own React (duplicated in browser).
- **No enforcement exists** — it's cooperative. A host can refuse to load a remote whose requiredVersion is incompatible.

### Plugin applicability

**Does NOT support framework independence for desktop plugins.** Module Federation's entire model is about sharing framework instances. If a plugin bundles React 19 IIFE and the host bundles React 18, federation can't help — it expects runtime module negotiation, not pre-bundled IIFEs. Flux's current IIFE-per-plugin approach is fundamentally incompatible with Module Federation's shared-scope model.

---

## 2. single-spa

**Source:** <https://single-spa.js.org/docs/getting-started-overview>
**Source:** <https://single-spa.js.org/docs/building-applications>
**Source:** <https://single-spa.js.org/docs/recommended-setup/>
**Source:** <https://single-spa.js.org/docs/ecosystem/>

### Isolation mechanism

single-spa uses **lifecycle isolation**. Each app exports `bootstrap`, `mount`, `unmount` functions. The root config controls which app is active based on URL routes. When unmounted, the app removes all DOM elements and cleans up event listeners. Framework conflicts are prevented because:
1. Apps are removed from DOM when inactive.
2. Each app can use any framework (17+ framework helpers exist).
3. CSS is not automatically isolated — left to the developer (Shadow DOM, CSS modules, etc.).

### Shared dependencies

Recommended approach: **Import Maps** (browser-native URL aliasing for ES modules).

```html
<script type="importmap">
{
  "imports": {
    "react": "https://cdn.jsdelivr.net/npm/react@19.0.0/+esm",
    "react-dom": "https://cdn.jsdelivr.net/npm/react-dom@19.0.0/+esm"
  }
}
</script>
```

Bundlers mark shared deps as externals (webpack `externals` or rollup `external`). The import map resolves bare specifiers to URLs. SystemJS can polyfill import maps for older browsers.

Alternative: **Module Federation** (discouraged by single-spa core team for shared deps — they recommend picking one approach, not both).

### Communication

- **Custom props** passed through lifecycle functions from root config.
- **Custom events** on `window.dispatchEvent` / `window.addEventListener`.
- **Cross-microfrontend imports** via in-browser ES modules (utility modules).
- **Shared API data** via in-memory caches exported from utility modules.
- single-spa core team **cautions against** global state management stores (Redux, MobX) across micro-frontends.

### Build pipeline

Output format: `system` register (SystemJS) or ES module format. Each app is a single entry point file. Build tools must:
- Set `libraryTarget: 'system'` (webpack)
- Disable code splitting optimization (or use dynamic imports)
- Set CORS headers for dev server
- Use unique `jsonpFunction`

### Versioning

Shared deps in the import map are versioned by URL. Upgrading React means updating one URL in the import map. All apps use that version. If an app needs a different version, it must be marked as non-shared (bundled into that app only). Full independent deployment is possible.

### Plugin applicability

**Strong match for Flux plugins.** The lifecycle model (bootstrap/mount/unmount) maps cleanly to Web Component lifecycles (`connectedCallback`/`disconnectedCallback`). Each plugin being a separate in-browser module that can be loaded/unloaded on demand is exactly what Flux does with `<script>` tags. However, single-spa's import-map approach for shared deps depends on the bundler *not* bundling those deps — Flux currently bundles everything into IIFEs, which is the opposite approach.

---

## 3. iframe-based micro-frontends

**Source:** <https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage>
**Source:** <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe>

### Isolation mechanism

**Strongest isolation boundary in the browser.** Each iframe has:
- Its own JavaScript global scope (no variable conflicts)
- Its own DOM tree (no querySelector collisions)
- Its own CSS cascade (no style leaks)
- Its own browsing context (separate session history, origin)
- The `sandbox` attribute can further restrict capabilities (no scripts, no forms, no top navigation, etc.)

### Cross-origin communication

```js
// Parent to iframe
iframe.contentWindow.postMessage({ type: 'PLAY_VIDEO', url }, targetOrigin);

// Iframe to parent (listen)
window.addEventListener('message', (event) => {
  if (event.origin !== trustedOrigin) return;
  // handle event.data
});
```

- Uses the structured clone algorithm — complex objects can be passed.
- `targetOrigin` must be specified for security (never `*` for sensitive data).
- The `source` property identifies the sender window.

### Limitations

| Concern | Detail |
|---------|--------|
| Performance | Each iframe is a full document environment — increased memory and CPU. |
| SEO | Content inside iframes is not indexed by search engines. |
| Accessibility | Screen readers have difficulty navigating multiple iframes without proper `title` attributes. |
| Scroll | Nested scroll contexts are confusing. |
| Styling | Impossible to style iframe content from parent. Responsive sizing requires explicit opt-in (`responsive-embedded-sizing` meta tag). |
| URL routing | Each iframe has its own history; coordinating navigation is complex. |
| Input latency | Cross-origin iframes cannot focus without user gesture in some browsers. |

### Plugin applicability

**Excellent isolation for deskotp WebView plugins, but heavy.** Each Flux plugin in its own iframe would guarantee zero framework conflicts — a plugin bundled with React 19 IIFE would never collide with a host using React 18. The cost: multiple iframes increase memory per plugin (~5-15MB each), communication goes through `postMessage` serialization (no direct function calls), and styling plugins requires iframe-aware CSS. Suitable for high-value plugins where isolation is paramount (e.g., video player with its own complex state). Not suitable for many lightweight cards.

---

## 4. Podium (Finn.no)

**Source:** <https://podium-lib.io/>
**Source:** <https://podium-lib.io/docs/introduction/hello-podium>
**Source:** <https://podium-lib.io/docs/guides/client-side-communication>

### Isolation mechanism

**Server-side composition.** Podium has two server types:
- **Podlet** — serves an HTML fragment + manifest (JSON with name, version, CSS/JS assets).
- **Layout** — fetches multiple podlets at request time, assembles them into a full HTML page.

Podlets are completely independent HTTP services. They can be written in any language/framework. Each podlet declares its CSS and JS assets in its manifest; the layout collects and de-duplicates them. CSS isolation is achieved through natural scoping (each podlet's CSS is loaded via its own `<link>` tag, but there is no built-in CSS isolation — style leaks can still happen).

### Shared dependencies

**None.** Each podlet bundles its own JavaScript and CSS. The layout doesn't share framework instances. If two podlets both use React, each serves its own copy. This is by design — Podium prioritizes independent deployment over bundle size optimization.

### Communication

`@podium/browser` — client-side MessageBus for pub/sub:
```js
import { MessageBus } from "@podium/browser";
const bus = new MessageBus();
// Publish
bus.publish("channel", "topic", payload);
// Subscribe
bus.subscribe("channel", "topic", (event) => { /* event.payload */ });
// Peek (initial value check to avoid race conditions)
const val = bus.peek("channel", "topic");
```

`@podium/store` — reactive state on top of nanostores:
```js
import { atom } from "@podium/store";
const $count = atom("app", "count", 0);
$count.set($count.value + 1);
```

### Build pipeline

Each podlet is a standalone HTTP service. No special build output format — just HTML, CSS, and JS served from an HTTP endpoint. The manifest (`/manifest.json`) is the contract:
```json
{
  "name": "my-podlet",
  "version": "1.0.0",
  "content": "/",
  "css": [{"href": "/style.css"}],
  "javascript": [{"value": "/script.js", "type": "esm"}]
}
```

### Versioning

Each podlet has a version in its manifest. Layouts use the manifest URL to discover podlet endpoints. There's no version negotiation — the layout either includes a podlet or doesn't. Upgrading a podlet is a redeploy of that service only.

### Plugin applicability

**Server-side model doesn't apply to desktop.** Podium's architecture assumes HTTP services that compose at request time. In a Tauri WebView, all plugins run in the same process. However, the **podlet manifest pattern** (declaring assets, version, and content endpoint) could translate to a plugin manifest — which Flux already has via `plugin.json`. The **MessageBus** pattern (`@podium/browser`) is directly applicable to Flux's CustomEvent-based communication.

---

## 5. OpenFin / FDC3

**Source:** <https://fdc3.finos.org/docs/overview/intro> (attempted, timed out — synthesized from spec knowledge)

### Isolation mechanism

**Desktop window isolation.** Each application runs in its own OS window (separate process, separate renderer). OpenFin provides a runtime that enables cross-window communication. FDC3 is the interoperability standard on top.

### Key concepts

- **App Directory** — registry of available applications with metadata (name, version, supported intents).
- **Context** — shared semantic data (e.g., `fdc3.instrument` with `{ticker: "AAPL"}`).
- **Intents** — declarative cross-app actions (e.g., `"ViewChart"`, `"StartCall"`).
- **Channels** — pub/sub groups for scoped communication.

### Communication

```js
// Broadcast context
fdc3.broadcast({ type: "fdc3.instrument", id: { ticker: "AAPL" } });
// Raise intent
const result = await fdc3.raiseIntent("ViewChart", context);
// Listen on channel
const channel = await fdc3.joinChannel("group-1");
channel.addContextListener("fdc3.instrument", handler);
```

### Plugin applicability

**Highly relevant conceptual model.** FDC3's App Directory → Intent → Context model maps to: plugin registry → methods/hooks → parameters. The intent-based routing ("I need a video player, who can provide one?") is what Flux's hook resolution system does (`resolve_hook("video.player")`). FDC3 proves that a published contract + runtime discovery is viable for framework-independent plugin architectures.

---

## 6. qiankun (Alibaba)

**Source:** <https://qiankun.umijs.org/guide>
**Source:** <https://qiankun.umijs.org/api>

### Isolation mechanism

qiankun extends single-spa with production-grade isolation:

1. **JS Sandbox** — uses `Proxy` to intercept global variable access. Two modes:
   - **Legacy sandbox** (snapshot/restore): snapshots `window` before mount, restores after unmount.
   - **Proxy sandbox** (modern): each sub-app gets a `Proxy`-based fake `window`. No real globals leak.
2. **CSS Isolation** — two modes:
   - **Strict** (Shadow DOM): wraps container in `attachShadow({mode: 'open'})`. Complete isolation.
   - **Experimental** (prefix rewriting): rewrites selectors to `div[data-qiankun-<appName>] .selector`. Does not handle `@keyframes`, `@font-face`, `@import`, `@page`.

### Shared dependencies

qiankun does **not** provide built-in shared dependency management. It relies on single-spa's module loading. Each sub-app can bundle its own framework. The sandbox prevents global conflicts, not duplication.

### Communication

```js
// Master
import { initGlobalState } from 'qiankun';
const actions = initGlobalState({ user: null });
actions.onGlobalStateChange((state, prev) => {});
actions.setGlobalState({ user: { name: 'Alice' } });

// Sub-app (receives via mount props)
export function mount(props) {
  props.onGlobalStateChange((state, prev) => {});
  props.setGlobalState({ user: { name: 'Bob' } });
}
```

### Build pipeline

Uses **HTML entry** — qiankun fetches the full HTML of each sub-app, parses out `<script>` and `<link>` tags, and loads them in the sandbox. This means existing SPAs can be micro-frontend-ified without changing their build output.

### Prefetch

Uses `requestIdleCallback` to prefetch unopened sub-app assets during browser idle time. Configurable via `prefetch` option in `start()`.

### Versioning

No built-in version negotiation. Each sub-app is independently deployed and loaded by URL. The sandbox ensures they don't conflict even if running different versions of the same framework simultaneously.

### Plugin applicability

**Strong pattern for Flux.** The Proxy-based sandbox approach could theoretically prevent framework conflicts in a WebView context. However, Proxy sandboxes have performance overhead (every property access on `window` goes through the Proxy). qiankun is designed for multiple SPAs on one page — heavier weight than needed for individual plugin components. The **HTML entry** approach (loading a sub-app's entire HTML) is overkill for Flux's card-sized plugins. The **Shadow DOM CSS isolation** mode is directly applicable.

---

## 7. Isomorphic Layout Composer (ILC)

**Source:** <https://github.com/namecheap/ilc>
**Source:** <https://mister-gold.pro/ilc/docs/microfrontend-types/>

### Overview

ILC (Namecheap) is an enterprise micro-frontend framework built on single-spa. Its key innovation: **isomorphic pagination** — layouts are composed both on the server (SSR) and client (SPA).

### Four micro-frontend types

| Type | SSR | Routing | Renders UI | Lifecycles | Use case |
|------|-----|---------|------------|------------|----------|
| Application | Yes | Multi-route | Yes | ILC-managed | Core building block |
| Parcel | No | None | Yes | Custom | Embed part of app into another |
| Global library | Maybe | None | Maybe | None | Shared logic/service |
| Legacy UMD | Maybe | None | Yes | Via compatibility layer | Migration path |

### Key features

- **Registry-based configuration** — apps, routes, templates stored in a central registry (not config files).
- **SSR + hydration** — server renders fragments, client hydrates them.
- **Animation during reroute** — transition animations between micro-frontends.
- **Plugins** — SDK for ILC plugins (hooks into the composition process).
- **App Wrappers** — wrap micro-frontends with shared UI (nav, footer, etc.) without modifying the apps.

### Plugin applicability

ILC's **Parcel** concept (component-level micro-frontends with custom lifecycles) maps well to Flux plugins. However, ILC is designed for SSR'd web pages — not applicable to desktop apps directly. The **registry pattern** (central configuration of what gets composed where) is useful.

---

## 8. Tailor (Zalando)

**Source:** <https://github.com/zalando/tailor>
**Source:** <https://engineering.zalando.com/posts/2016/06/frontend-microservices-tailor.html>

### Overview

Tailor is a **server-side streaming layout service** for frontend microservices. Part of Zalando's Project Mosaic. Inspired by Facebook's BigPipe.

### How it works

1. Template HTML contains `<fragment src="http://...">` tags.
2. Tailor parses the template, fetches all fragments in parallel.
3. Streams the response as fragments arrive (fast TTFB).
4. Each fragment sets `Link` headers for its CSS and JS assets.
5. Primary fragment controls the HTTP response status code.
6. Async fragments are postponed to `</body>`.

### Fragment attributes

| Attribute | Purpose |
|-----------|---------|
| `src` | URL of the fragment server |
| `primary` | Controls response status code |
| `timeout` | Fragment timeout (default 3000ms) |
| `async` | Defer to end of `<body>` |
| `fallback-src` | Fallback URL on timeout/error |
| `public` | Skip request header forwarding |

### Client-side initialization

Each fragment's JS is an AMD module that exports an `init` function:
```js
define([], function() {
  return {
    init: function(element) {
      // element is the fragment's DOM node
    }
  };
});
```

### Plugin applicability

**Server-side only — not applicable to desktop WebView plugins.** But the **streaming composition** model and the **fragment attribute** approach (especially `fallback-src` for error resilience) are notable patterns. The AMD module pattern (each fragment exports `init`) is conceptually similar to Flux's Web Component approach (each card exports a custom element).

---

## Comparison Table

| System | Isolation | Share React? | Comm Pattern | Build Output | Versioning | Desktop Plugin Fit |
|--------|-----------|-------------|-------------|-------------|------------|-------------------|
| **Module Federation** | None (intentionally shares) | Yes (singleton) | Imports | async chunks | Cooperative negotiation | ❌ (anti-pattern) |
| **single-spa** | Lifecycle (mount/unmount) | Via import maps | CustomEvents, props | System.register, ESM | By import map URL | ✅ (lifecycle model) |
| **iframe** | Full document boundary | Each bundles own | postMessage | Any (indep. page) | By URL | ✅ (isolation) ⚠️ (heavy) |
| **Podium** | Server-side (HTTP boundary) | Each bundles own | MessageBus | HTTP service + manifest | By manifest URL | ⚠️ (server model, but MessageBus pattern fits) |
| **FDC3** | OS process boundary | Each bundles own | Channels, Intents, Context | Native app | By app dir entry | ✅ (intent-based discovery) |
| **qiankun** | Proxy sandbox + Shadow DOM | Each bundles own | initGlobalState | HTML entry (any) | Independent by URL | ✅ (sandbox idea) ⚠️ (overhead) |
| **ILC** | Lifecycle (single-spa based) | Via import maps | CustomEvents | System.register | By registry | ⚠️ (SSR focused) |
| **Tailor** | Server-side streaming | Each bundles own | N/A (server) | AMD module with `init()` | Independent by URL | ❌ (server-only) |

---

## Analysis for Flux

Flux bundles React 19 into each plugin's IIFE. The goal: plugins compiled today work on any host version, forever.

### Which patterns support this best?

1. **iframe** — The gold standard for true isolation. Each plugin runs in a separate browsing context. No framework conflicts possible. Cost: memory (~5-15MB per iframe), communication via `postMessage`, no shared DOM.

2. **FDC3 intents** — The conceptual model of "I need capability X, who provides it?" maps to Flux's hook resolution (`resolve_hook("video.player")`). This is already what Flux does. FDC3 proves the pattern at scale.

3. **Podium's MessageBus** — Pub/sub communication between independently-bundled apps. Podium's `@podium/browser` library is essentially what Flux achieves with CustomEvents on `window`. The `peek` pattern (check for initial value before subscribing to avoid race conditions) is a useful addition.

4. **qiankun's Proxy sandbox** — If Flux wanted to eliminate the IIFE approach and instead load plugins as "loose scripts" in a shared scope, a Proxy-based sandbox could prevent global pollution. But this adds overhead and complexity that the IIFE approach already solves.

### Which patterns don't fit?

1. **Module Federation** — Its entire value proposition is sharing framework instances. Flux's goal is the opposite: embed frameworks within each plugin so they can never conflict. These are contradictory.

2. **Tailor / Podium** — Server-side composition models. Podium's client-side MessageBus is useful, but the server-side layout composition doesn't apply to a desktop WebView.

3. **single-spa import maps** — Import maps require bundlers to mark React as external. Flux deliberately bundles React to achieve independence. These are opposite strategies.

### The simplest proven pattern for desktop WebView plugins

**iframe + postMessage** is the simplest pattern that guarantees framework independence. It requires no build-system coordination, no version negotiation, and no shared dependency management. Each plugin is a standalone HTML file that can use any framework version.

However, if the cost of multiple iframes is too high, **Flux's current approach (IIFE + CustomElement + CustomEvent)** is the correct lightweight alternative. It follows the **Podium podlet pattern** (self-contained fragment with declared manifest) applied client-side. The risk is accidental global conflicts — mitigated by:
1. IIFE wrapping all code (no leaked imports).
2. Custom elements for DOM scoping (Shadow DOM for CSS isolation).
3. CustomEvent bridge for communication (not shared state).

### Recommendations for Flux

| Concern | Current approach | Verdict |
|---------|-----------------|---------|
| JS isolation | React bundled into IIFE | ✅ Correct — each plugin is self-contained |
| DOM isolation | Custom elements | ✅ Standard, framework-independent |
| CSS isolation | Tailwind v4 bundled into each WC | ✅ Scoped by Shadow DOM if used |
| Communication | CustomEvent on window | ✅ Matches Podium MessageBus pattern |
| Version negotiation | None needed (bundled) | ✅ Strenght of the approach |
| Memory cost | ~160KB per plugin IIFE | ✅ Much lighter than iframes |

Consider adding: **`postMessage` as an alternative isolation layer** for plugins that need strong guarantees (e.g., third-party plugins you don't trust). The host can detect if a plugin should run in an iframe via a `sandbox` field in `plugin.json`.