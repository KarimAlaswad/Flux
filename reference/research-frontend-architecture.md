# Frontend Architecture Patterns for Composable, Plugin-Driven UIs

**Context:** Comparison against Flux's architecture (React IIFE → Web Components via script injection, CustomEvent on window for cross-component communication, React host + plugin components each with their own React copy).

---

## 1. Micro-frontends

### Module Federation (Webpack 5 / Rspack / Vite)

**How it works:** Module Federation lets independent webpack builds expose and consume modules at runtime. Each build produces a `remoteEntry.js` manifest that lists exposed modules. The host loads remote manifests as script tags, then imports exposed components as though they were local modules. A shared dependency system deduplicates libraries (e.g., React) by negotiating versions at runtime via singleton checks.

- Host declares `remotes: { app1: "app1@http://..." }` in `ModuleFederationPlugin`
- Remote declares `exposes: { "./Component": "./src/Component" }`
- `shared: { react: { singleton: true, requiredVersion: "^18" } }` ensures one React copy

**Pros:** Feels like native imports; shared dependency deduplication; independent deploy per remote; strong TypeScript support in MF 2.0.

**Cons:** Requires same bundler (Webpack/Rspack) on all participants; version skew between remotes causes silent runtime crashes; network dependency for loading remotes; complex debugging.

**Flux relevance:** Flux compiles React to IIFE and injects via script tag — conceptually similar to how MF loads remoteEntry.js. But MF uses webpack's module runtime to wire imports, while Flux relies on global custom element registration. MF's `shared` solves the "multiple React copies" problem that Flux currently has (each plugin bundles its own React).

Sources:
- https://webpack.js.org/concepts/module-federation/
- https://module-federation.io/
- https://www.pkgpulse.com/guides/module-federation-2-webpack-rspack-vite-micro-frontends-2026
- https://lapidix.dev/en/posts/module-federation-rspack

### Single-SPA

**How it works:** A shell (root config) registers applications that expose mount/unmount lifecycle functions. A top-level router decides which app to mount based on URL. Each app can use a different framework. SystemJS or import maps externalize shared dependencies.

**Pros:** Framework-agnostic; perfect for strangler-fig legacy migrations; clear lifecycle contract (bootstrap/mount/unmount); mature ecosystem.

**Cons:** Shell becomes a massive SPOF; sharing state between apps is intentionally difficult; complex routing coordination; extra runtime overhead.

**Flux relevance:** Single-SPA's lifecycle hooks (mount/unmount) are analogous to how Flux's Web Components use `connectedCallback`/`disconnectedCallback`. Single-SPA solves multi-framework coexistence — Flux's WC boundary already provides this but lacks the orchestration layer.

Sources:
- https://single-spa.js.org/
- https://imperialis.tech/en/blog/micro-frontends-single-spa-module-federation-alternatives
- https://feature-sliced.design/blog/micro-frontend-architecture

### Piral

**How it works:** An opinionated micro-frontend framework where "pilets" (plugins) are loaded into a central shell. Pilets are npm packages that can be deployed independently. The shell provides a shared API via `pilets` context. Uses React by default but supports other frameworks.

**Pros:** Strong governance model; well-defined plugin API; independent deployment; shared dependency management; debugging tools.

**Cons:** Deep architectural coupling to Piral's conventions; React-centric by default; harder to escape if abandoned; opinionated about how plugins communicate.

Sources:
- https://piral.io/

### qiankun

**How it works:** Based on single-spa, adds strict JS and CSS sandboxing. Uses HTML-entry approach (fetch a full HTML page as an app entry) with Shadow DOM or scoped CSS for style isolation. Provides proxy-based JS sandbox to prevent global variable leakage.

**Pros:** Strong isolation guarantees; HTML-entry is familiar; enterprise-grade sandboxing; good for untrusted internal modules.

**Cons:** Deep coupling to the framework; performance overhead from sandboxing; limited ecosystem outside China.

Sources:
- https://qiankun.umijs.org/

### Isomorphic Layout Compositions (ILC)

**How it works:** A layout service that composes a page from fragment services on both server and client. Server-side renders fragments via SSR, then client-side takes over for SPA navigation. Uses a registry to configure which fragments appear on which routes. Communication via global API and routing events.

**Pros:** SSR support for SEO; isomorphic composition (server + client); independent fragment deployment; built-in error handling per fragment.

**Cons:** Requires SSR infrastructure; complex setup; fragments must implement ILC's app interface; network overhead for composition.

**Flux relevance:** ILC's server+client composition is more sophisticated than Flux's pure client-side script injection. However, ILC assumes a traditional server-rendered architecture while Flux is Tauri-based (no traditional server).

Sources:
- https://github.com/namecheap/ilc
- https://namecheap.github.io/ilc-sdk/

---

## 2. Web Components as Integration Boundary

### YouTube

**How it works:** YouTube rebuilt significant portions of its interface using Web Components. The engineering team uses custom elements with Shadow DOM for style encapsulation across their complex, high-traffic UI. YouTube's adoption contributed to the statistic that Web Components appear in ~18% of Chrome page loads.

**Technical details:** YouTube's custom elements are defined with vanilla JavaScript (no framework wrapper), use Shadow DOM for CSS isolation, and interact with the Polymer-based backend. The player UI, controls overlay, and settings menus are built as custom elements.

**Pitfalls encountered:** Performance optimization for shadow DOM rendering at scale; ensuring accessibility across custom element boundaries; coordinating state between elements without a shared framework.

Sources:
- https://levelup.gitconnected.com/web-components-at-big-tech-companies-youtube-84266bb507fd
- https://www.infoq.com/news/2021/05/github-web-components/

### GitHub

**How it works:** GitHub built Catalyst, a lightweight Web Components library (~2.5KB) that provides decorators for `@controller`, `@target`, and `@action`. Over 17 custom elements are open-sourced and used across the production site. Catalyst uses `data-target` and `data-action` attributes for declarative DOM querying and event binding.

**Technical pattern:** Observe (Custom Elements), Listen (Event binding via `data-action`), Query (DOM querying via `data-target`). Components extend `HTMLElement` directly. ViewComponent (Ruby) pairs with Web Components for server-rendered markup that hydrates on the client.

**Why Web Components:** GitHub's codebase was already structured as component-like behaviors. Web Components offered encapsulation without requiring a full framework migration. Progressive enhancement was key — elements can exist in HTML before their JavaScript definition loads.

**Pitfalls:** Naming conventions must be enforced via linter (`eslint-plugin-custom-elements`); Shadow DOM caused some CSS theming challenges; Safari's lack of support for customized built-in elements.

Sources:
- https://github.blog/engineering/architecture-optimization/how-we-use-web-components-at-github/
- https://github.com/github/catalyst
- https://github.github.io/catalyst/guide/introduction/
- https://www.infoq.com/news/2021/05/github-web-components

### Salesforce (Lightning Web Components)

**How it works:** LWC is Salesforce's framework-own Web Components implementation. It compiles HTML, CSS, and JS files into custom elements with a virtual DOM-like engine for performance. Components use Shadow DOM by default, with opt-out via `lwc:external`. A compiler transforms templates into optimized JavaScript, and a Rollup plugin integrates with the build pipeline.

**Technical architecture:** LWC uses a three-phase compilation: HTML (parse5), CSS (PostCSS), JS (Babel). The runtime engine originally used virtual DOM but has moved toward static content optimization (similar to Lit's approach). Template syntax is similar to Vue with `{binding}` and `@event` handlers.

**Communication pattern:** Components communicate via events (custom DOM events), props (HTML attributes), and the Lightning Message Service (LMS) for cross-component communication across DOM branches.

**Flux relevance:** LWC is the closest parallel to Flux's approach — both compile components into Web Components. LWC does it at the framework level with a dedicated compiler; Flux does it by bundling React components as IIFE + custom element registration. LWC's `lwc:external` concept (opt-out of Shadow DOM) is relevant for cases where Flux wants global styles to pierce component boundaries.

Sources:
- https://github.com/salesforce/lwc/blob/master/ARCHITECTURE.md
- https://developer.salesforce.com/developer-centers/lightning-web-components
- https://www.salesforceben.com/the-ideal-framework-for-architecting-salesforce-lightning-web-components/

---

## 3. React Portal Patterns for Plugin UI

### How it works

**Core mechanism:** `createPortal(children, domNode)` lets React render children into a different DOM node while preserving the React tree context (event bubbling, context providers). The portal node can be anywhere in the DOM — even inside a shadow root or a different React root.

**Plugin component registry pattern:** Plugins register React components with the host via a `HostAPI`:
```typescript
interface HostAPI {
  registerComponent(name: string, component: React.ComponentType<any>): void;
  getComponent(name: string): React.ComponentType<any> | undefined;
}
```
The host stores these in a `componentRegistry` map. When the host renders, it looks up the component from the registry and renders it inside a portal pointing to a target DOM node.

**Slot pattern:** The host defines named slot positions (e.g., "sidebar", "header"). Plugins register their intent to fill a slot. The host renders each plugin's component into the corresponding slot via `createPortal`.

### Pros and Cons

**Pros:**
- Plugin components stay within the host's React tree (access context, events, state)
- No recompilation needed — plugins register at runtime
- Type-safe contracts via TypeScript interfaces
- Can lazy-load plugin bundles via dynamic `import()`

**Cons:**
- All plugin components must use the same React version (or carefully shared instance)
- Plugin bundles cannot use `React.createElement` if React is externalized differently
- `createPortal` doesn't cross React root boundaries — plugins rendered via separate `createRoot` calls are isolated from host context
- Portals still require a shared React instance for context to work

### Flux relevance

Flux does NOT use portals — each plugin Web Component creates its own React root via `createRoot()` inside the WC's constructor. This means plugin components cannot access the host's React context. Portals would not help here because each WC has its own React root. However, if Flux moved to a model where plugins registered React components with the host (rather than self-mounting WCs), portals would be the natural rendering mechanism.

Sources:
- https://react.dev/reference/react-dom/createPortal
- https://www.freecodecamp.org/news/how-to-design-a-type-safe-lazy-and-secure-plugin-architecture-in-react/
- https://stackoverflow.com/questions/44778265/dynamically-loading-react-components

---

## 4. CustomElementRegistry Patterns

### How it works

`window.customElements` is the global registry. Key methods:
- `define(name, constructor, options)` — registers a custom element. Throws `NotSupportedError` if name or constructor is already registered.
- `get(name)` — returns the constructor or `undefined`
- `whenDefined(name)` — returns a Promise that resolves when the element is defined
- `upgrade(root)` — upgrades elements in a disconnected subtree

**Scoped registries (newer):** `new CustomElementRegistry()` creates a scoped registry not tied to `window`. Attached to a shadow root via `attachShadow({ mode: 'open', registry: scopedRegistry })`. This allows different parts of the page to use different versions of the same tag name.

### Tag collision management

**Problem:** `customElements.define('my-button', MyButton)` throws if `my-button` is already defined. Two libraries defining the same tag crash the page.

**Solutions:**
1. **Prefix naming** — `flux-my-button`, `plugin-my-button`. Simple but namespace pollution.
2. **Scoped registries** — each plugin gets its own registry. Avoids collisions but elements cannot be found via `document.querySelector`.
3. **Export class without defining** — plugin authors export the class; host defines it with a unique name.
4. **Try/catch guard** — wrap `define()` in try/catch, skip if already defined (but risk of using wrong version).

### Element upgrades

Custom elements can appear in HTML before their definition is loaded. The browser creates an `HTMLElement` placeholder. When `define()` is called, all placeholders are "upgraded" — their prototype is swapped to the custom class and `connectedCallback` fires. `customElements.whenDefined()` lets code wait for this.

### Lifecycle management

- `constructor` — set up shadow root, initial state. Must call `super()`.
- `connectedCallback` — fires when element is inserted into DOM. Best place for setup.
- `disconnectedCallback` — cleanup (remove event listeners, disconnect observers).
- `attributeChangedCallback` — respond to attribute changes.
- `adoptedCallback` — fires when element is moved to a new document.

### Flux relevance

Flux defines custom elements with unique names from plugin manifests. The potential for collision exists if two plugins define the same WC tag. Current mitigation: plugin names must be unique in the repo. For third-party plugins, scoped registries would be the proper solution. Flux uses `whenDefined()` to wait for WCs before mounting.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry
- https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define
- https://html.spec.whatwg.org/multipage/custom-elements.html
- https://web.dev/articles/custom-elements-v1
- https://gomakethings.com/articles/user-defined-web-components

---

## 5. Module Federation (Webpack 5 / Rspack / Vite)

### Webpack 5 / Rspack

**How it works:** `ModuleFederationPlugin` configures a build as either host, remote, or both. At runtime, the host loads `remoteEntry.js` from each remote via dynamic script injection. The remote entry registers exposed modules in a shared module scope. When the host imports `remote/Component`, the federation runtime resolves it through the remote's module graph, respecting shared dependency singletons.

**Shared dependency resolution:** The `shared` config declares libraries that should be singletons. At runtime, each participant checks if the shared module is already loaded. If versions match, it reuses the existing instance. If not, behavior depends on config (error, use fallback, load both).

**MF 2.0 enhancements** (`@module-federation/enhanced`):
- TypeScript type sharing across remotes
- Manifest-based dynamic host discovery (`mf-manifest.json`)
- Runtime hooks for loading lifecycle
- Programmatic API: `init()` + `loadRemote()`
- Works with Webpack 5, Rspack, and Vite

### Vite Module Federation

Uses `@module-federation/vite` plugin. Emulates MF's runtime on top of Vite's ESM-based dev server. Known limitations: dev-server HMR across remotes is unstable, ESM-only (no CommonJS remotes), less mature than Webpack/Rspack.

### Pros and Cons

**Pros:**
- True runtime composition — deploy independently, compose at runtime
- Efficient shared dependency management (single React instance)
- Type-safe across module boundaries (MF 2.0)
- Mature ecosystem with tools and examples

**Cons:**
- Requires webpack/Rspack on all participants (or the Vite plugin with limitations)
- Version skew between remotes causes subtle bugs
- Network dependency — a failed remote can break the host
- Complex configuration and debugging

### Flux relevance

Flux's script injection approach is similar to how MF loads `remoteEntry.js`. The key difference: MF provides a shared module runtime that deduplicates dependencies. Flux currently has no such runtime — each plugin bundles React independently (~40KB per plugin). Adopting a pattern similar to MF's `shared` config could dramatically reduce bundle size. However, MF requires all participants to use the same bundler; Flux's approach is bundler-agnostic (any tool that can produce an IIFE).

Sources:
- https://webpack.js.org/concepts/module-federation/
- https://rspack.dev/guide/features/module-federation
- https://www.pkgpulse.com/guides/module-federation-2-webpack-rspack-vite-micro-frontends-2026
- https://o3-docs.openmrs.org/en-US/docs/frontend-modules/using-rspack

---

## 6. Vite Plugin System Architecture

### How it works

Vite's plugin system extends Rollup's plugin interface with Vite-specific hooks. Plugins are objects with `name` and hook functions that participate in a directed acyclic graph of transformations.

**Key hooks:**
| Hook | When it fires | Common use |
|------|---------------|------------|
| `config` | Before config resolved | Mutate user config |
| `configResolved` | After config finalized | Read resolved config |
| `configureServer` | Dev server starts | Inject middleware |
| `resolveId` | Module import being resolved | Virtual modules, aliases |
| `load` | Module content being fetched | Return virtual content |
| `transform` | Source code being processed | Transpile, inject code |
| `configureCache` | File change detected | Fine-grained cache invalidation |

**Execution order:**
1. Alias plugins (internal)
2. User plugins with `enforce: 'pre'`
3. Vite core plugins
4. User plugins without `enforce`
5. Vite build plugins
6. User plugins with `enforce: 'post'`
7. Vite post-build plugins (minification)

**Virtual modules convention:** Plugins use `resolveId` to intercept virtual paths (prefixed with `virtual:` ), returning a `\0`-prefixed sentinel. The `load` hook then provides the source code. This pattern is used for build-time code injection.

**Vite 6/8 changes:** Deterministic hook ordering via `dependsOn` field; async hook pipelining with backpressure; multi-environment architecture (each `Environment` gets its own `PluginContainer`).

### Pros and Cons

**Pros:**
- Clean, well-documented API
- Hooks map to clear build lifecycle stages
- Composable — plugins can depend on each other
- Virtual modules enable build-time code generation
- Works for both dev server and production build

**Cons:**
- Some hooks (`transform`) run on every file — performance requires careful optimization
- Rollup compatibility means some Rollup-specific quirks
- Plugin ordering can be fragile without explicit `dependsOn`

### Flux relevance

Flux's build pipeline (`build-plugins.ts`) is conceptually a lightweight plugin system itself — it scans manifests, detects frameworks, generates configs, and compiles. Vite's plugin model provides inspiration for how Flux could make its build pipeline extensible (e.g., custom preprocessors, asset transformers, manifest generators as plugins to the build script).

Sources:
- https://deepwiki.com/vitejs/vite/10-plugin-system
- https://gist.github.com/chengyixu/a61c3a886790fb7ae3fed22f94efcbea
- https://vite.dev/plugins
- https://www.toolsku.com/en/blog/vue3-vite-plugin-development-2026

---

## 7. Iframe-Based Plugin Isolation

### How it works

Iframes create a separate browsing context with full process-level isolation (in Chromium, cross-origin iframes run in separate processes). The `sandbox` attribute restricts capabilities: `allow-scripts`, `allow-same-origin`, `allow-forms`, etc. Communication with the parent uses `postMessage()` with the structured clone algorithm.

**Two-context model (Figma):** Figma plugins use a two-part isolation:
1. **Plugin context (Realms sandbox)** — runs on main thread with access to Figma's document API, cannot access browser APIs.
2. **UI context (iframe)** — renders the plugin's HTML/CSS/JS UI, has browser API access but cannot access Figma's document.
3. Communication via `figma.ui.postMessage()` / `window.parent.postMessage()`.

**Google Workspace Add-ons:** Use Card-based interfaces (JSON-defined UIs rendered in iframe sandboxes). The add-on code runs in a sandboxed iframe within the host app (Gmail, Calendar, Docs). Communication is through Apps Script's `CardService` API or custom HTML service.

### Pros and Cons

**Pros:**
- Full style and JS isolation — no conflicts, no leaks
- Security sandbox (CSP, origin restrictions)
- Separate memory space — plugin crashes don't take down the host
- Can support any framework or no framework
- Well-understood, mature technology

**Cons:**
- Heavy — each iframe loads a new document context (memory, performance)
- Communication overhead — `postMessage` serializes all data (structured clone)
- UX seams — no shared scroll, focus model, or accessible tree across boundaries
- No shared React context or state
- Styling across boundaries is limited (no CSS inheritance)
- Cannot easily share libraries — each iframe loads its own dependencies

### Flux relevance

Flux uses script injection into the main document — the opposite approach from iframes. Iframes would solve the "multiple React copies" problem (each iframe has its own JS heap) and provide true isolation, but at the cost of performance and communication overhead. Flux's CustomEvent communication pattern is conceptually similar to iframe `postMessage` — structured messages on a shared channel. Iframes would be appropriate for untrusted third-party plugins; Flux's current approach is more like Figma's main-thread sandbox (trusted but isolated via scope).

Sources:
- https://ggprompts.com/architecture/figma/index.html
- https://developers.figma.com/docs/plugins/api/properties/figma-ui-postmessage/
- https://www.chromium.org/developers/design-documents/site-isolation/
- https://developers.google.com/workspace/add-ons/concepts/card-interfaces
- https://bromso.github.io/figma-plugin-template/docs/guides/architecture

---

## 8. Tailwind CSS with Shadow DOM

### The fundamental conflict

**Core problem:** Tailwind CSS generates utility classes (`.flex`, `pt-4`) as global CSS rules. Shadow DOM blocks global CSS from penetrating into shadow trees. Therefore, Tailwind classes applied to elements inside a shadow root have no effect.

**Why it happens:**
- `Shadow DOM` encapsulates styles — external CSS rules do not apply to shadow tree elements
- Tailwind CSS generates rules in a **global stylesheet** — these cannot cross the shadow boundary
- This is not a bug — it's the intended behavior of both systems, working at cross-purposes

### Workarounds

1. **Inject Tailwind styles into each shadow root** — either via `<style>` tag or `adoptedStyleSheets`. Using `CSSStyleSheet.replaceSync()` on `AdoptedStyleSheets` is the most performant approach, sharing a single stylesheet across all instances without duplication.

2. **Use `@layer` + `:host` selectors** — wrap Tailwind output in `@layer` and scope to `:host` so it applies within shadow trees. Some build tool plugins can do this automatically.

3. **Use CSS custom properties** — since custom properties pierce shadow DOM, expose theming tokens via `--tw-*` variables on `:root` and consume them inside components using `var()`.

4. **Use Tailwind v4 with `@property` workaround** — Tailwind v4 uses `@property` CSS rules for defaults, which don't work in shadow roots. A workaround is to hoist `@property` declarations to the global scope.

5. **Use Twind or other runtime CSS-in-JS** — libraries like Twind generate styles at runtime and can inject them directly into shadow roots.

6. **Avoid Shadow DOM entirely** — use light DOM custom elements (no `attachShadow`) and rely on naming conventions or CSS Modules for scoping. This sacrifices encapsulation but works with Tailwind.

### GitLab's approach

GitLab used Web Components (with Shadow DOM) to encapsulate Tailwind-based design system components, preventing conflicts with legacy CSS. They injected Tailwind-generated CSS into each shadow root via external stylesheets. The trade-off: each component loads its own copy of the utility styles.

### Pros and Cons

**Pros (when solved):**
- True CSS encapsulation
- No style conflicts between plugins
- Can use Tailwind's utility classes within components

**Cons:**
- No universal solution — every workaround has trade-offs
- `adoptedStyleSheets` requires browser support (Chromium 73+, Firefox 101+, Safari 16.4+)
- Duplicated stylesheets increase memory if not shared via `adoptedStyleSheets`
- Build tooling complexity increases significantly
- Tailwind's preflight (normalize) won't apply inside shadow roots automatically

### Flux relevance

Flux's Web Components use shadow DOM. If plugins want to use Tailwind for styling, they face this exact problem. Current approach: each plugin would need to inject Tailwind styles into its shadow root or use CSS custom properties for theming. The `adoptedStyleSheets` approach is the most efficient — share a single compiled Tailwind stylesheet across all plugin shadow roots. Flux's build tooling could automate this by extracting used Tailwind classes per plugin and injecting them.

Sources:
- https://blog.kinto-technologies.com/posts/2025-07-14-web-components-and-tailwind-css-dont-mix-en/
- https://meefik.dev/2025/03/19/tailwindcss-and-shadow-dom/
- https://about.gitlab.com/blog/using-web-components-to-encapsulate-css-and-resolve-design-system-conflicts/
- https://blog.openreplay.com/style-web-components-shadow-dom-css/
- https://github.com/tailwindlabs/tailwindcss/discussions/1935

---

## 9. React 19 Concurrent Features for Plugin Loading

### How it works

**`React.lazy()` + `Suspense`:** The canonical pattern for component-level code splitting. `React.lazy(() => import('./Component'))` wraps a dynamic import. When rendered inside `<Suspense fallback={...}>`, React suspends rendering and shows the fallback until the chunk loads. This works with any dynamic `import()` — including loading remote plugin bundles from URLs.

**New in React 19:**

**`use()` hook:** Reads a Promise or Context inside render. Combine with Suspense for declarative async data loading:
```tsx
function PluginRenderer({ pluginPromise }) {
  const Plugin = use(pluginPromise);
  return <Plugin />;
}
// Wrap in <Suspense> to show loading state
```
Key difference from `useEffect` + `useState`: `use()` integrates directly with React's Suspense mechanism — no manual loading states, no state management for async results.

**`useTransition` / `startTransition`:** Mark plugin loading as non-urgent. React can interrupt the transition to handle higher-priority updates (e.g., user input).

**Streaming SSR:** When combined with a server, Suspense boundaries let React stream HTML as each async section resolves. For plugin architectures with SSR, this means the main page renders immediately while plugin slots stream in.

### How these apply to plugin loading

**Pattern 1: Lazy-load plugin bundles**
```tsx
const PluginComponent = React.lazy(() =>
  loadPluginBundle('https://cdn.example.com/plugins/yt-feed.js')
);
```

**Pattern 2: `use()` for async plugin initialization**
```tsx
function PluginSlot({ manifest }) {
  const pluginModule = use(loadPlugin(manifest));
  return <pluginModule.Wrapper />;
}
```

**Pattern 3: Transition-based plugin switching**
```tsx
const [isPending, startTransition] = useTransition();
startTransition(() => {
  setActivePlugin(newPluginId);
});
```

### Pros and Cons

**Pros:**
- Declarative loading states — no manual spinners
- Concurrent rendering prevents UI jank during plugin load
- `use()` eliminates useEffect boilerplate for plugin initialization
- Suspense boundaries provide natural error isolation (with ErrorBoundary)

**Cons:**
- `React.lazy()` only works with default exports
- `use()` requires a Suspense boundary ancestor (can be forgotten)
- Multiple React roots (as in Flux) cannot share Suspense boundaries
- Streaming SSR doesn't apply to desktop Tauri apps

### Flux relevance

Flux cannot use `React.lazy()` or Suspense for plugin loading because each plugin Web Component creates its own React root. These features work within a single React tree. However, within each plugin's own React tree, `use()` and Suspense could be used for internal code splitting (e.g., lazy-loading heavy subcomponents within a plugin). If Flux moved to a single-root model where the host renders all plugin components, these features would become directly applicable for orchestrating plugin load order, showing loading/error states, and enabling concurrent rendering.

Sources:
- https://react.dev/reference/react/lazy
- https://devstarsj.github.io/2026/03/28/react-19-concurrent-features-suspense-deep-dive-2026/
- https://www.codewithseb.com/blog/react-suspense-tutorial-lazy-loading-async-rendering-data-fetching-react-18-19
- https://techoral.com/react/react-suspense-concurrent.html

---

## 10. State Management Across Script Boundaries

### The problem

When frontend components live in separate script bundles (each with its own module scope, potentially its own React instance), they cannot share React context, Zustand stores, or Jotai atoms directly. Shared state must cross the JavaScript module boundary using browser-native mechanisms.

### Pattern 1: CustomEvent Bus

**How it works:** Components dispatch and listen for `CustomEvent` on a shared DOM node (typically `window` or `document`). Events carry serializable data in `detail`. Any script bundle can participate — no shared imports needed.

```typescript
// Dispatch
window.dispatchEvent(new CustomEvent('plugin:action', { detail: { type: 'navigate', to: '/settings' } }));

// Listen
window.addEventListener('plugin:action', (e) => {
  const { type, to } = e.detail;
  if (type === 'navigate') router.navigate(to);
});
```

**Type safety:** Runtime-only unless both sides share TypeScript types at build time. Schema validation (e.g., Zod) helps at runtime.

**Pros:** Zero dependencies; works across frameworks and React roots; simple to implement; natural decoupling.

**Cons:** No type safety across boundaries; no built-in persistence; debugging event ordering is hard with async loading; no backpressure or guaranteed delivery.

**Flux relevance:** Flux already uses this pattern for card→player→modal communication. It's the primary cross-component communication mechanism. Extending this to a more structured event bus with typed schemas would improve maintainability.

### Pattern 2: Shared Globals on Window

**How it works:** Libraries or stores are exposed as properties on `window`. Multiple script bundles read/write to the same global object.

```typescript
// In host bundle
(window as any).__FLUX_STORE__ = { user: null, theme: 'dark' };

// In plugin bundle
const store = (window as any).__FLUX_STORE__;
console.log(store.theme); // 'dark'
```

**Pros:** Simple, works everywhere, no bundler coordination needed.

**Cons:** Global namespace pollution; no reactivity (consumers must poll or use events); easy to create race conditions; TypeScript requires global type augmentation.

### Pattern 3: Shared Singleton via Module Federation

**How it works:** A shared library (e.g., Zustand store, Jotai atom) is configured as a singleton in Module Federation's `shared` config. All participants use the same module instance. Changes in one remote are visible in all others.

```typescript
// webpack.config.js
shared: {
  '@shared/store': { singleton: true, eager: true }
}
```

**Pros:** Type-safe; real reactivity; framework-integrated (React hooks work); no serialization overhead.

**Cons:** Requires Module Federation on all participants; version coupling (singletons must match); complex to set up.

### Pattern 4: Signals (Preact Signals, Angular Signals)

**How it works:** Signals provide fine-grained reactivity with automatic dependency tracking. A signal is a value wrapper that tracks subscribers. When the value changes, only dependent computations re-run. Placing a signal on a shared global object lets multiple script bundles subscribe to changes.

```typescript
// Shared global signal
(window as any).__theme = signal('dark');

// In any bundle
const theme = (window as any).__theme;
effect(() => console.log('Theme:', theme.value));
```

**Pros:** Fine-grained reactivity; minimal re-renders; works across boundaries if the signal library is a singleton.

**Cons:** Requires the signal library to be shared (same instance); newer paradigm with less ecosystem maturity; React integration requires wrappers.

### Pattern 5: Jotai Atoms (Atomic State)

**How it works:** Jotai creates independent atoms that can be shared, derived, and composed. Atoms stored on a shared bridge (window global or Module Federation singleton) can be read by any bundle.

```typescript
// In host, expose atom creator
(window as any).__createAtom = (initialValue: any) => atom(initialValue);

// In plugin
const countAtom = (window as any).__createAtom(0);
const [count, setCount] = useAtom(countAtom);
```

**Pros:** Bottom-up composition; derived atoms auto-update; works with React hooks.

**Cons:** Requires host to expose atom factory; atoms are not serializable by default; multiple React roots mean multiple Jotai providers.

### Flux relevance

Flux uses CustomEvent (Pattern 1). The main limitation is that events are fire-and-forget with no response channel — if a plugin needs to query state, it must listen for a reply event. Adding a request-response pattern (e.g., `event.detail.replyChannel` — a MessagePort or callback) would enable bidirectional communication. For real shared state (e.g., auth tokens, user preferences), a shared global object with events for change notifications would bridge the gap without MF.

Sources:
- https://docs.bswen.com/blog/2026-04-30-customevent-state-management/
- https://vic-e.com/blog/state-management-in-2026
- https://usertourkit.com/blog/micro-frontends-product-tours-shared-state
- https://jotai.org/docs
- https://github.com/preactjs/signals

---

## Cross-Cutting Analysis: Relevance to Flux

### Flux's Current Architecture

1. **Plugin loading:** Script injection via `<script>` tags with IIFE Web Components
2. **Component boundary:** Each plugin registers a custom element; React renders inside it
3. **Communication:** CustomEvent on `window`
4. **Dependencies:** Each plugin bundles its own React copy
5. **Styling:** Each WC uses Shadow DOM

### Key Observations

| Aspect | Flux | Industry Pattern | Gap |
|--------|------|-----------------|-----|
| Plugin bundling | IIFE + WC registration | Module Federation or explicit API | No shared dependency management; each plugin bundles React |
| Component loading | Script injection + `createRoot` in WC | `React.lazy` / Suspense in single root | No coordination between plugin loads; cannot show loading states |
| Cross-component communication | CustomEvent (fire-and-forget) | Structured event bus or shared state | No type safety, no request-response, no persistence |
| Style isolation | Shadow DOM | Shadow DOM (same) | No Tailwind solution (see §8) |
| Build pipeline | Custom `build-plugins.ts` | Vite plugin model | Not extensible by third parties |
| State sharing | None (CustomEvent only) | Shared globals / MF singletons / signals | No shared reactive state between plugins |
| Error isolation | None (one plugin crash can affect others) | ErrorBoundary / iframe isolation | No error boundary isolation between plugin roots |

### Recommended Investigation Paths

1. **Shared React instance:** Explore externalizing React from plugin bundles (similar to MF's `shared` config), loaded once by the host and provided to plugins via a global or import map.

2. **Structured event protocol:** Move from ad-hoc CustomEvent dispatch to a typed event bus with request-response patterns, schema validation, and logging/debugging support.

3. **Slot system:** Formalize the slot pattern — named positions in the host UI that plugins can fill, with the host controlling layout and lifecycle.

4. **Build-time Tailwind injection:** Automatically extract used Tailwind classes per plugin and inject them into the shadow root via `adoptedStyleSheets`.
