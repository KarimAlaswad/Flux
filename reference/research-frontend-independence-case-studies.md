# Research: Framework-Independent Plugin Systems — Case Studies

**Date:** 2026-07-29
**Context:** Flux plugin system — how to guarantee frontend plugins (compiled as IIFE Web Components) work across host version upgrades.

---

## 1. Chrome Extensions (Manifest V3)

### Guarantee mechanism

Chrome extensions are HTML/JS/CSS that run in a browser. There is **no dependency on Chrome's internal framework**. The guarantee comes from:

- **Stable API surface:** Extensions call `chrome.*` APIs (or `browser.*`). These namespaces follow Chrome's own deprecation policy — APIs are deprecated for at least 3 milestones before removal (source: [Chrome Extension API reference](https://developer.chrome.com/docs/extensions/reference/api)). Beginning in Chrome 148, APIs are also available under the `browser` namespace for cross-browser compatibility.
- **No framework coupling:** The extension page is just a web page. It can use any framework (React, Vue, vanilla JS) — Chrome doesn't care. The browser provides DOM APIs, `chrome.*` APIs, and nothing else.
- **Service worker for background:** MV3 replaced background pages with service workers. This broke extensions that relied on `window` or `document` in background scripts. But the extension's popup/options page (the UI facing the user) remained unaffected — it's still a regular HTML page.

### What broke in MV2→MV3

From the [MV3 migration guide](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3):

1. **Background page → Service worker**: `window` and `document` no longer available in background context. Extensions that used `chrome.extension.getBackgroundPage()` broke. Fix: move DOM-dependent code to an offscreen document or the popup.
2. **No remotely hosted code**: MV3 requires all JS to be in the extension package. Extensions that fetched scripts from a remote CDN broke. Fix: bundle everything.
3. **`webRequest` blocking → `declarativeNetRequest`**: Extensions that used blocking `webRequest` to modify network requests had to rewrite to a declarative rule-based API.
4. **Promise-based APIs**: MV2 callbacks were replaced with promises in MV3. Not a breakage, but required code changes.

**What did NOT break:** The `chrome.*` API surface itself. The same API calls (just converted to promises) worked. The extension's popup HTML/JS/CSS — the UI layer — was **completely unaffected** by MV3.

### How plugins get their framework

Fully bundled with the extension. The extension ships its own `node_modules` (or bundled output). Chrome provides no shared framework. This is the **safest model** — zero dependency on the host's framework version.

### Communication mechanism

- **Between extension parts:** `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` — message passing between popup, service worker, content scripts.
- **Between content script and page DOM:** Direct DOM access. Content scripts run in an isolated world.
- **No postMessage/iframe isolation** for the popup or options page — they run in the same process as the extension service worker.

### Upgrade horror stories

- **MV2 deprecation (ongoing):** Google announced MV2 deprecation in 2020. The transition took years. Extensions that didn't migrate by 2024+ were auto-disabled. The biggest breakage was `webRequest` blocking removal, which broke ad-blockers (uBlock Origin had to release a Lite version). Source: [MV2 deprecation timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline).
- **Key lesson:** Even with a stable API surface, changing the **execution model** (background page → service worker) broke extensions. The UI layer (popup HTML) survived unchanged.

---

## 2. VS Code Webviews

### Guarantee mechanism

VS Code extensions can open webviews — embedded iframes rendering arbitrary HTML/CSS/JS. The host has **zero knowledge of the webview's framework**. Key guarantees:

- **Iframe isolation:** The webview is an `<iframe>` inside VS Code's Electron shell. The iframe has no access to VS Code's DOM or Node.js process. Source: [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview).
- **`postMessage` bridge:** Communication goes through `webview.postMessage()` (host→webview) and `acquireVsCodeApi().postMessage()` (webview→host). The host doesn't inspect the webview's content.
- **`localResourceRoots`:** Controls which local files the webview can load. Avoids security issues without constraining framework choice.
- **No framework coupling:** The webview's HTML can use React, Angular, Vue, Svelte, vanilla JS — VS Code doesn't care. The webview is a blank iframe.

### What breaks?

- **`enableScripts: false` by default:** Extensions must explicitly enable scripts. Not a breakage, just a pitfall.
- **Content Security Policy:** VS Code's default CSP restricts inline scripts. Extensions that use inline `<script>` tags without a nonce break. Fix: extract scripts to external files or use a nonce. Source: [CSP in webviews](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy).
- **`webview.html` replaces entire content:** Setting `webview.html` reloads the entire iframe. State is lost unless using `getState`/`setState` or `retainContextWhenHidden`.
- **Web Workers limited:** Workers can only be loaded via `data:` or `blob:` URIs. No direct file loading.

### How plugins get their framework

Bundled with the extension. The extension ships a directory (e.g., `media/`). The webview loads HTML that references bundled JS/CSS via `asWebviewUri()`. VS Code provides zero shared libraries.

### Communication mechanism

- **Host → Webview:** `webview.postMessage(data)` — any JSON-serializable data.
- **Webview → Host:** `acquireVsCodeApi().postMessage(data)` — same.
- **State persistence:** `getState()`/`setState()` survive webview hibernate/reload.

### Upgrade horror stories

- **None documented.** VS Code has maintained backward compatibility for the webview API since its introduction. The API surface is small: `createWebviewPanel`, `webview.html`, `webview.postMessage`, `onDidReceiveMessage`. Source: [VS Code API](https://code.visualstudio.com/api/references/vscode-api#Webview).
- **Key lesson:** The tiny API surface (4-5 methods) is easy to keep stable. The iframe provides perfect isolation. Host upgrades never break webview content because the host never touches the webview's internals.

---

## 3. Figma Plugins

### Guarantee mechanism

Figma runs plugins in a **sandboxed JavaScript environment** on the main thread. The sandbox: [How Plugins Run](https://www.figma.com/plugin-docs/how-plugins-run/)

- **No DOM access from sandbox:** Plugin code runs in a sandbox with modern JS (ES2020+) but **no browser APIs** — no `fetch`, `XMLHttpRequest`, `setTimeout`, or DOM access. This prevents framework dependencies entirely.
- **Sandbox API surface:** Only the `figma` global object is available for scene access. This is a **fully custom API**, not a framework. It has no coupling to any frontend framework.
- **UI via iframe:** If a plugin needs UI, it calls `figma.showUI(__html__)` which creates an `<iframe>`. The iframe has full browser API access and can use any framework (React, Vue, vanilla). Source: [Creating UI](https://www.figma.com/plugin-docs/creating-ui/).
- **Message passing:** Sandbox ↔ UI via `figma.ui.postMessage()` / `parent.postMessage({ pluginMessage: ... })`.

### What breaks?

- **Sandbox lacks browser APIs:** Plugins that try to use `fetch` from the sandbox fail. Must use `figma.showUI` and do network requests from the iframe.
- **`figma.closePlugin()` required:** If a plugin doesn't call `figma.closePlugin()`, it runs indefinitely and the user sees a toast. Not a compatibility issue, but a gotcha.
- **Typings file updates:** Figma [releases typed API definitions](https://www.figma.com/plugin-docs/api/typings/) on npm (`@figma/plugin-typings`). When the API changes, plugins need to update their typings. Figma's [API versioning](https://www.figma.com/plugin-docs/api/api-overview/) follows semver for the sandbox API.

### How plugins get their framework

- **Sandbox code:** No framework. Pure JS (or TypeScript compiled to JS). The plugin author bundles their sandbox code however they like.
- **UI code:** Bundled as a single HTML file (or HTML that loads scripts). Any framework works. The UI is served via `figma.showUI(__html__)` or `__uiFiles__`.

### Communication mechanism

- **Sandbox → UI:** `figma.ui.postMessage(value)`
- **UI → Sandbox:** `parent.postMessage({ pluginMessage: value }, '*')`
- **Events:** `figma.ui.onmessage`, `onmessage` in UI
- **Drop events:** Special `pluginDrop` message protocol for drag-and-drop from UI to canvas.

### Upgrade horror stories

- **Minimal.** Figma's plugin API has been relatively stable. The biggest changes have been additions (new node types, new properties), not removals. The `figma` global object has grown over time.
- **Key lesson:** The combination of a sandbox (no DOM = no framework dependency) + iframe UI (any framework, fully isolated) provides the strongest backward compatibility guarantee. The sandbox API is versioned and typed.

---

## 4. WordPress Blocks (Gutenberg)

### Guarantee mechanism

WordPress blocks are React components, but WordPress provides **backward compatibility via the deprecation API**. Key parts:

- **`wp.element` global:** WordPress provides a [@wordpress/element](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-element/) package that wraps React. It re-exports `createElement`, `Component`, hooks, etc. Plugins use `wp.element.createElement` instead of `React.createElement`. Under the hood, WordPress bundles its own React version.
- **`registerBlockType`:** The core registration function. The block's `edit` and `save` functions receive `props` with a stable shape (`{ attributes, setAttributes, isSelected, ... }`). Source: [@wordpress/blocks](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-blocks/).
- **Deprecation API:** Blocks declare deprecated versions. If a block's current `save` output doesn't match what's stored in the database, WordPress tries each deprecation in order. The deprecation provides old `save`, `attributes`, and an optional `migrate` function. Source: [Block Deprecation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-deprecation/).
- **Block validation:** WordPress validates saved block markup against the registered `save` function. If it doesn't match, the block is marked as invalid and the user sees a "Block has been altered" message. Deprecations prevent this.

### What breaks?

- **React version upgrades:** WordPress upgraded React internally (e.g., React 16 → 17 → 18). Plugins using `wp.element` were unaffected. Plugins that imported React directly from `node_modules` instead of using `wp.element` could break if they relied on removed APIs (e.g., legacy context API).
- **`render` → `createRoot`:** WordPress deprecated `wp.element.render` in favor of `wp.element.createRoot` (matching React 18's `createRoot`). The old `render` still works but shows deprecation warnings.
- **Block attribute changes:** Changing a block's `save` output without adding a deprecation breaks all existing instances of that block. The fix is to always add a deprecation entry.

### How plugins get their framework

- **Provided by host:** WordPress provides `wp.element` (React wrapper), `wp.components`, `wp.data`, `wp.hooks`, etc. Plugins declare these as dependencies in their `registerBlockType` call. The actual React bundle is loaded by WordPress core.
- **Plugin can also bundle its own framework** for the frontend (rendered block on the page), but the editor experience uses `wp.*` packages.

### Communication mechanism

- **React props:** Block receives `{ attributes, setAttributes, isSelected, clientId, name, context }`.
- **`wp.data`:** Blocks access shared state through WordPress's data store (`@wordpress/data`).
- **`wp.hooks`:** Filters and actions for extending the editor.

### Upgrade horror stories

- **Gutenberg merge into WordPress 5.0 (2018):** Classic editor users had a massive disruption. But blocks themselves — the registered block types — survived because the block registration API was designed for stability.
- **React 18 upgrade (WordPress 6.2):** Blocks that used `wp.element` were fine. Blocks that imported React directly from npm sometimes broke due to concurrent rendering changes.
- **Key lesson:** A host-provided framework wrapper (`wp.element`) insulates plugins from framework version changes. The deprecation API is essential for data (serialized block HTML) compatibility. **Block serialization format (HTML comments) is the true contract**, not the framework.

---

## 5. Jupyter Widgets (ipywidgets)

### Guarantee mechanism

Jupyter widgets are HTML/JS rendered in the notebook frontend. The `@jupyter-widgets/base` package provides backward compatibility:

- **`_model_module_version` / `_view_module_version`:** Every widget declares which version of its JS module it depends on, using a semver range. The widget manager loads the correct version. Source: [ipywidgets Low Level Widget Explanation](https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20Low%20Level.html).
- **AMD module loading via RequireJS:** The widget manager uses RequireJS to load widget modules by name + version. Multiple versions can coexist in the same notebook. Source: same page.
- **`@jupyter-widgets/base` API versioning:** The base package is separately versioned. Widgets declare compatibility ranges (`"^2 || ^3 || ^4 || ^5 || ^6"`). Source: [ipywidgets migration guide](https://ipywidgets.readthedocs.io/en/latest/migration_guides.html).
- **Widget manager interface (`IWidgetManager`):** The `@jupyter-widgets/base` package exposes a stable TypeScript interface. The implementation moved to `@jupyter-widgets/base-manager` in v8.

### What breaks?

- **Phosphor → Lumino rename:** In ipywidgets 8, the `JupyterPhosphorPanelWidget` class was renamed to `JupyterLuminoPanelWidget`. Widgets that extended `JupyterPhosphorPanelWidget` broke. The migration guide provides a compat shim.
- **Backbone.js version bump (1.2.3 → 1.4.0):** Widgets using Backbone's `.extend()` pattern had to rewrite to ES6 `class extends`. The `.extend()` pattern was removed in ipywidgets 8.
- **`tagName` → `preinitialize`:** The way widget views set their HTML tag name changed. Old `get tagName()` accessors stopped working in v8.
- **`ManagerBase` split:** Split into `IWidgetManager` (interface in `@jupyter-widgets/base`) and `ManagerBase` (implementation in `@jupyter-widgets/base-manager`). Widgets importing from the wrong path broke.

### How plugins get their framework

- **AMD modules loaded via RequireJS.** The widget manager discovers which JS module to load from the widget's `_view_module` and `_view_module_version` traits (sent from the kernel). The module exports a WidgetView class. The view can use any framework internally.

### Communication mechanism

- **Comms (kernel ↔ frontend):** Symmetric, async, fire-and-forget messaging via Jupyter's comm API. JSON-serializable state is synced between kernel Widget and frontend WidgetModel.
- **State synchronization:** Traitlets with `sync=True` in Python automatically sync to the JS model. The model and view communicate via Backbone events.
- **No postMessage:** Widget state is synchronized, not passed as messages.

### Upgrade horror stories

- **ipywidgets 7 → 8:** Multiple breaking changes (Phosphor→Lumino, Backbone→ES6 classes, `ManagerBase` split). The `@jupyter-widgets/base` version range approach (`"^2 || ^3 || ^4 || ^5 || ^6"`) allowed gradual migration. Widgets could support both v7 and v8 simultaneously.
- **Key lesson:** **Version range declarations** are more practical than deprecation chains. The AMD module system allows multiple module versions to coexist. The **interface** (`IWidgetManager`) being separate from the **implementation** (`ManagerBase`) is a key pattern for stability.

---

## 6. Salesforce Lightning Web Components (LWC)

### Guarantee mechanism

Salesforce LWC compiles to native Web Components. The framework is open source ([lwc.dev](https://lwc.dev)):

- **Compiles to Custom Elements:** LWC components are compiled from HTML+JS templates into native Custom Elements (`class extends LightningElement`). The output is standard Web Components. Source: [LWC Dev Guide](https://lwc.dev/guide/introduction).
- **Semantic versioning:** LWC follows strict semver. Major version increments (v2→v3, v3→v4, etc.) include breaking changes. The [LWC Versioning page](https://lwc.dev/guide/versioning) documents each breaking change per major version.
- **Component-level API versioning (Salesforce platform):** On the Salesforce platform, components declare an `apiVersion` in their `*.js-meta.xml`. The LWC framework behaves as it did for the corresponding API version. This allows old components to work even as the framework evolves.
- **`apiVersion` scoping:** The `apiVersion` is scoped to a component definition and all its HTML/CSS/JS files. Each component can target a different API version. Source: [LWC Versioning](https://lwc.dev/guide/versioning#component-level-api-versioning).

### What breaks?

- **Breaking changes happen at major versions.** v4.0.0, v5.0.0, v6.0.0, v7.0.0, v8.0.0 each had documented breaking changes. The release notes list specifics.
- **Compiler output changes:** LWC increments the minor version even when the compiler output changes (not just API changes). This means minor version bumps can require recompilation.
- **`apiVersion` only on Salesforce platform:** The open-source LWC does not have component-level API versioning. Only the Salesforce-hosted platform supports this.

### How plugins get their framework

- **Compiled at build time:** The LWC compiler transforms components into standard JS classes. No framework is shipped to the browser — the compiled output is vanilla Custom Elements + a small LWC engine runtime.
- **LWC engine runtime:** A ~10KB runtime that handles reactivity, template diffing, etc. This is the only shared dependency.

### Communication mechanism

- **Custom events:** LWC components communicate via standard DOM CustomEvents (`this.dispatchEvent(new CustomEvent(...))`).
- **`@api` decorated properties:** Parent→child data flow via public properties.
- **`@wire`:** Reactive data service for fetching from Salesforce APIs.

### Upgrade horror stories

- **LWC OSS major version bumps are breaking.** Each major version (v3→v4→v5→v6→v7→v8) includes breaking changes. The [release notes](https://github.com/salesforce/lwc/releases) document each. The `apiVersion` system on the Salesforce platform mitigates this for hosted components.
- **Key lesson:** Compiling to native Web Components provides **runtime stability** — the compiled output doesn't change even if the framework version does. But the **compiler itself** must be kept in sync with the runtime. The `apiVersion` scoping is a powerful pattern for backward compatibility at the component level.

---

## 7. OpenFin / FDC3

### Guarantee mechanism

FDC3 (Financial Desktop Connectivity and Collaboration Consortium) is a standard for financial desktop applications to interoperate. Key patterns:

- **Standardized API surface:** FDC3 defines a fixed API (`fdc3.open`, `fdc3.raiseIntent`, `fdc3.addContextListener`, etc.). Applications implement or consume this API without knowing each other's internals. Source: [FDC3 Introduction](https://fdc3.finos.org/docs/fdc3-intro).
- **API versioning:** FDC3 versions are independently versioned (1.0, 1.1, 1.2, 2.0). Applications declare which version they support. The API surface grows across versions but doesn't break old calls.
- **Desktop container abstraction:** OpenFin provides a container runtime (proprietary) that manages windows, apps, and the FDC3 bridge. Applications are HTML/JS that run in the container. The container handles routing FDC3 calls between apps.

### What breaks?

- **FDC3 1.2 → 2.0:** The `fdc3.raiseIntent` signature changed. Apps using the old signature needed updates. Source: FDC3 changelog.
- **OpenFin runtime upgrades:** OpenFin's own runtime (Chromium-based) can break apps if they rely on deprecated Electron/Chromium APIs.
- **No framework isolation:** Applications are regular web apps. They bundle their own frameworks. The container doesn't care.

### How plugins get their framework

Bundled with the application. Each app ships its own framework (React, Angular, etc.). FDC3 doesn't provide a shared framework.

### Communication mechanism

- **FDC3 API methods:** `fdc3.open(appId, context)`, `fdc3.raiseIntent(intent, context)`, `fdc3.addContextListener(contextType, handler)`.
- **Context passing:** Apps share structured context objects (e.g., `fdc3.context.instrument` for a financial instrument). The container routes context between apps.

### Upgrade horror stories

- **FDC3 1.2 → 2.0 was a major rewrite for some apps.** The intent resolution model changed significantly. Apps that only used simple channel-based messaging were fine.
- **Key lesson:** A **standardized API with version negotiation** is the core pattern. Each app is fully isolated from other apps' framework choices. The container provides only the FDC3 API bridge — nothing else.

---

## 8. Discord Activities / Roblox Plugins

### Discord Activities

- **iframe-based isolation:** Discord Activities are web apps hosted in an iframe within the Discord client. The app has no access to Discord's internal DOM or Electron APIs. Source: [Discord Activities Overview](https://discord.com/developers/docs/activities/overview).
- **Embedded App SDK:** Communication goes through the SDK (`@discord/embedded-app-sdk`), which wraps `postMessage` calls. The SDK provides commands (authorize, fetch user info) and events (user join/leave, instance updates).
- **Any framework works:** Since the Activity is a web app in an iframe, it can use React, Unity WebGL, Phaser, vanilla JS — anything that runs in a browser.
- **No version coupling:** Discord Activities don't depend on Discord's UI framework version. The SDK version is bundled with the activity.

### Roblox Plugins

- Roblox plugins are Lua scripts that run in the Roblox Studio IDE. They access the Roblox API via `plugin` object and service APIs. Not a frontend framework plugin system.
- **Key insight for Flux:** Roblox plugins are sandboxed — they have no access to Studio's internal UI framework. They extend Studio via well-defined APIs.

---

## Synthesis: Patterns for Flux

### What guarantees backward compatibility?

| System | Mechanism | Best for |
|--------|-----------|----------|
| Chrome Extensions | `chrome.*` API surface, no shared framework, bundled code | Full isolation, but host can change execution model |
| VS Code Webviews | iframe isolation, `postMessage` bridge | Tiny API surface, perfect isolation |
| Figma Plugins | Sandbox (no DOM) + iframe UI | Strongest isolation, but limited sandbox |
| WordPress Blocks | `wp.element` wrapper + deprecation API | Data compatibility, versioned host-provided framework |
| Jupyter Widgets | AMD module version ranges, `@jupyter-widgets/base` interface | Framework version ranges, multiple versions coexist |
| Salesforce LWC | Compile to Web Components, `apiVersion` scoping | Component-level version targeting |
| FDC3 | Standardized API with version negotiation | Cross-app interop, no framework coupling |
| Discord Activities | iframe + SDK | Full framework freedom, SDK abstraction |

### What breaks plugins across host upgrades?

1. **Changes to the execution model** — Chrome MV2→MV3 background page→service worker broke many extensions. The UI layer survived.
2. **Renamed base classes / methods** — Jupyter's Phosphor→Lumino rename broke widgets.
3. **Removed APIs** — WordPress's `render`→`createRoot` deprecation.
4. **Changed serialization format** — WordPress blocks that changed `save` output without deprecations.
5. **Framework version bumps in shared libraries** — Jupyter's Backbone 1.2.3→1.4.0 removed `.extend()`.
6. **Compiler/runtime mismatch** — LWC compiler output changes can break if runtime isn't updated.

### Traps Flux should avoid

1. **Don't expose host framework internals to plugins.** Chrome's popup has no access to Chrome's UI framework internals. Figma's sandbox has no access to Figma's React tree. Flux should **never** expose React internals to plugins.
2. **Don't share framework instances.** If Flux loads React 19 and a plugin also loads React 19 (bundled), having two copies in the same page is wasteful but safe. If Flux provides a shared `React` global and later upgrades to React 20, the plugin's JSX compiled for React 19 may break. **Never provide a shared framework global.**
3. **Don't let plugins touch the host DOM.** Figma's sandbox prevents DOM access entirely. VS Code's webviews are isolated in iframes. Flux plugins (Web Components) exist in the same DOM as the host — this is inherently riskier. Use `attachShadow({ mode: 'closed' })` to isolate plugin DOM.
4. **Don't rely on CustomEvents for critical data contracts without versioning.** If Flux passes data via CustomEvent `detail`, the shape of that data is a protocol. Version it.
5. **Don't skip deprecation compatibility for stored/serialized data.** WordPress allows versioned serialization of block data. If Flux saves plugin state anywhere, use a migration/deprecation system.

### What Flux should adopt

1. **Web Components as stable API boundary** — Custom Elements are a browser standard, not a framework. They will not break. This is Flux's strongest card.
2. **iframe or shadow DOM isolation** — `attachShadow({ mode: 'closed' })` prevents the host from accidentally accessing plugin internals and vice versa.
3. **Protocol versioning for CustomEvent data** — Include a `version` field in event `detail` objects. The host can check compatibility before handling an event.
4. **Bundled frameworks, not shared globals** — Plugins should bundle their own framework (React 19 IIFE). The host should provide zero framework globals.
5. **Declared compatibility ranges** — Like Jupyter's `_model_module_version`, Flux plugins should declare which host API versions they support. The host can check before loading.
6. **Deprecation API for plugin state** — If plugins can save state (via `core-static` or similar), provide a migration system like WordPress block deprecations.
7. **`apiVersion` scoping** — Like Salesforce LWC, let each plugin declare a target API version. The host adapts behavior per-plugin.
