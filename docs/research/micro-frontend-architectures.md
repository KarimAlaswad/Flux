# Micro-Frontend Architectures — Research for Flux

**Date:** 2026-08-02
**Context:** Flux — Tauri v2 + React 19 + Bun plugin architecture
**Problem:** Flux already IS a micro-frontend system (per-plugin Web Component bundles + backend subprocess plugins), but it was built without ever mapping itself onto the MFE landscape. This research explains what micro-frontends are, the named integration approaches with primary sources, and where Flux's design lands — so future decisions (module sharing, event contracts, federation) are made against the record, not by feel.

---

## Table of Contents

1. [What is a micro-frontend?](#1-what-is-a-micro-frontend)
2. [Integration approaches](#2-integration-approaches)
   - [2.1 Build-time composition](#21-build-time-composition)
   - [2.2 Runtime composition via Web Components](#22-runtime-composition-via-web-components)
   - [2.3 Module Federation](#23-module-federation)
   - [2.4 Iframe-based integration](#24-iframe-based-integration)
   - [2.5 Server-side composition (SSI / ESI / at the edge)](#25-server-side-composition-ssi--esi--at-the-edge)
   - [2.6 single-spa orchestration](#26-single-spa-orchestration)
3. [Key technical concepts, defined](#3-key-technical-concepts-defined)
4. [Known failure modes of micro-frontends](#4-known-failure-modes-of-micro-frontends)
5. [Where Flux sits in this landscape](#5-where-flux-sits-in-this-landscape)
6. [Pros and Cons for Flux](#6-pros-and-cons-for-flux)
7. [Glossary](#7-glossary)
8. [Primary sources used](#8-primary-sources-used)

---

## 1. What is a micro-frontend?

The canonical definition comes from Cam Jackson's *Micro Frontends* article on martinfowler.com:

> "An architectural style where independently deliverable frontend applications are composed into a greater whole" — [Cam Jackson, Micro Frontends, martinfowler.com (2019)](https://martinfowler.com/articles/micro-frontends.html)

The term first appeared on the [ThoughtWorks Technology Radar in November 2016](https://www.thoughtworks.com/radar/techniques/micro-frontends), extending the microservice idea to the frontend ([micro-frontends.org](https://micro-frontends.org/)). The problem it solves: an app whose frontend layer is one big codebase — a "Frontend Monolith" — that grows harder to maintain as teams work on it ([micro-frontends.org](https://micro-frontends.org/)).

The design goals, per the two defining sources:

| Goal | What it means | Primary source |
|------|---------------|----------------|
| **Independent deployability** | Each micro-frontend has its own build/test/deploy pipeline; you can ship one without coordinating with the others | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) |
| **Autonomous teams** | Teams formed around vertical slices of functionality, owning end-to-end | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) |
| **Technology agnosticism** | Each team picks/upgrades its stack without coordinating; Custom Elements "hide implementation details while providing a neutral interface" | [micro-frontends.org](https://micro-frontends.org/) |
| **Isolated team code** | "Don't share a runtime, even if all teams use the same framework… Don't rely on shared state or global variables" | [micro-frontends.org](https://micro-frontends.org/) |
| **Native browser features over custom APIs** | Prefer browser events for communication over building a global PubSub system | [micro-frontends.org](https://micro-frontends.org/) |
| **Team prefixes / naming conventions** | Namespace CSS, events, storage "where isolation is not possible yet" | [micro-frontends.org](https://micro-frontends.org/) |

The canonical mental picture — a **container (host) application** renders common chrome and mounts independently-built **micro-apps** ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)):

```
+------------------------------------------------------------------+
|                     CONTAINER APPLICATION (host)                 |
|  renders header/nav, auth, routing; decides WHAT mounts WHERE    |
|                                                                  |
|  +----------------+  +----------------+  +----------------+     |
|  | micro-app A    |  | micro-app B    |  | micro-app C    |     |
|  | (own repo,     |  | (own repo,     |  | (own repo,     |     |
|  |  own deploy,   |  |  own deploy,   |  |  own deploy,   |     |
|  |  own framework)|  |  own framework)|  |  own framework)|     |
|  +----------------+  +----------------+  +----------------+     |
|                                                                  |
|  A, B, C communicate through browser-native events or a thin     |
|  contract — NOT through shared framework state                   |
+------------------------------------------------------------------+
```

**Flux relevance:** Flux's architecture is recognizably this pattern. The skeleton (see [CONTEXT.md](../CONTEXT.md)) is the container; each plugin directory is a micro-app. Flux goes further than the web-originated pattern in one direction: its micro-apps have **backend halves** — the subprocess plugins spawned by the Rust host (see `src-tauri/src/lib.rs:104-162`) — making each plugin closer to a full vertical slice (a "BFF per micro-frontend" pattern Jackson describes in the same article: [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)).

---

## 2. Integration approaches

### 2.1 Build-time composition

**Mechanism:** each micro-frontend is published as a package; the container app imports them all as library dependencies and bundles them into **one** deployable artifact. ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Build-time integration").

```
package.json (container)
  ├─ @feed-me/browse-restaurants ^1.2.3
  ├─ @feed-me/order-food         ^4.5.6
  └─ @feed-me/user-profile       ^7.8.9
                    │
                    ▼  single webpack/vite build
          ┌─────────────────────────┐
          │  ONE bundle (one deploy)│
          └─────────────────────────┘
```

Vite's library mode is the tool-level mechanism for producing a shareable artifact: `build.lib` bundles a library, produces multiple formats (`es`, `umd`, `cjs` — configurable via `build.lib.formats`), and lets you *externalize* dependencies you don't want inlined ([Vite docs, Library Mode](https://vite.dev/guide/build#library-mode)).

**Why it's discouraged as an MFE approach:** it produces the lockstep release cycle micro-frontends exist to escape — "we have to re-compile and release every single micro frontend in order to release a change to any individual part" ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)). The *upside* it sacrifices is exactly the one Flux values most: independent deployability of plugins.

**Flux relevance:** Flux uses build-time *tooling* (Vite library mode per WC) but NOT build-time *integration*. `scripts/build-plugins.ts:176-183` emits each Web Component as its own **IIFE** (`formats: ["iife"]`) into `build/plugins/<tag>.js`, and `App.tsx:84-89` loads them at runtime via `core-static.read` + `<script>` injection. So Flux gets the "single deployable bundle per plugin" benefit while avoiding the lockstep-release drawback — the container (skeleton) never rebuilds when a plugin changes. This is a hybrid: **build-time artifact production, runtime integration** (see §5).

---

### 2.2 Runtime composition via Web Components

**Mechanism:** each micro-frontend's script runs `customElements.define(tag, class)`; the container later does `document.createElement(tag)` and appends it, or the browser's parser upgrades elements found in markup. This is the approach micro-frontends.org recommends as the "neutral interface" for technology-agnostic teams ([micro-frontends.org](https://micro-frontends.org/)).

The governing primitives are **W3C/WHATWG specs**, not any framework:

- **Custom Elements** ([WHATWG HTML Standard §4.13](https://html.spec.whatwg.org/multipage/custom-elements.html)) — the spec guarantees:
  - Custom element names must contain a dash (`-`), "used for namespacing and to ensure forward compatibility" ([HTML spec, valid custom element name](https://html.spec.whatwg.org/multipage/custom-elements.html)).
  - A lifecycle callback map — `connectedCallback`, `disconnectedCallback`, `adoptedCallback`, `attributeChangedCallback`, etc. — whose keys are fixed by the spec ([HTML spec, custom element definition](https://html.spec.whatwg.org/multipage/custom-elements.html)).
  - `customElements.define()` registers a constructor with the `CustomElementRegistry`; `customElements.whenDefined(name)` returns `Promise<CustomElementConstructor>`, resolving when the definition arrives ([HTML spec, CustomElementRegistry](https://html.spec.whatwg.org/multipage/custom-elements.html)).
  - **Upgrades**: elements created *before* a definition loads get upgraded when it arrives — an async script can define an element that's already in the DOM ([HTML spec, upgrades](https://html.spec.whatwg.org/multipage/custom-elements.html)).
  - Constructor constraints: `super()` must be first; "work should be deferred to `connectedCallback` as much as possible"; `connectedCallback` can fire more than once, so one-time init needs a guard ([HTML spec, conformance requirements](https://html.spec.whatwg.org/multipage/custom-elements.html)).
- **Shadow DOM** ([WHATWG DOM Standard §4.2.2 Shadow trees](https://dom.spec.whatwg.org/#shadow-trees)) — a shadow tree is a separate node tree attached to a host element; its root is the `ShadowRoot`. Styles inside the shadow tree do not leak out; document styles do not cross in. This is the browser-native style encapsulation.
- **Slots** ([WHATWG HTML Standard §4.12.4 The slot element](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element)) — the `<slot>` element renders **light DOM** children of the host inside the shadow tree ("slottables" assigned via `assignedNodes()`/`assignedElements()`; see also [DOM spec, slots](https://dom.spec.whatwg.org/#shadow-tree-slots)).

```
Container document (light DOM):
  <feed-widget>
    <yt-video-card></yt-video-card>      ← container creates these,
    <peertube-card></peertube-card>        sets .item, appends
  </feed-widget>

Host element (e.g. <flux-player>)            Shadow root (shadow DOM):
┌─────────────────────────────┐              ┌───────────────────────┐
│  light DOM children         │              │  <style>…</style>     │
│  (the caller's markup)      │  ──────────► │  <slot></slot>        │
│                             │  projected  │  renders children into │
│                             │  into       │  the shadow tree       │
└─────────────────────────────┘              └───────────────────────┘
   Styles in shadow tree CANNOT leak out; document styles stop at the
   shadow boundary. Events can cross it only if composed: true.
```

**What the browser natively guarantees** (all from the specs above): name-namespacing, lifecycle callbacks, `whenDefined` async coordination, style encapsulation (shadow DOM), and DOM-level interop that is framework-agnostic. What it does **not** guarantee: script/global isolation (all custom elements share the same `window` and the same global `CustomElementRegistry` — see §3 "Sandboxing").

**Flux relevance:** this is Flux's integration strategy, implemented faithfully: the build wrapper in `scripts/build-plugins.ts:33-48` defines a class extending `HTMLElement`, implements `connectedCallback` (creates the React root), `disconnectedCallback` (unmounts), and property setters (`item`, `manifests`) for data-injection; `App.tsx:75-78` uses `customElements.whenDefined(tag)` before `document.createElement(tag)`; `feed-widget.tsx:292` does the same for cards. Flux notably uses the *lifecycle + property-setter* part of the spec but **not shadow DOM** — which is exactly why its Tailwind per-bundle stylesheet must be injected globally (see §3 "Style leakage").

---

### 2.3 Module Federation

**Mechanism:** webpack's Module Federation lets *separate builds* share code at **runtime**: "Multiple separate builds should form a single application. These separate builds act like containers and can expose and consume code among themselves" ([webpack docs, Module Federation](https://webpack.js.org/concepts/module-federation/)).

Key concepts, per [webpack docs](https://webpack.js.org/concepts/module-federation/):

- **Remote vs local modules**: local modules are part of the current build; **remote modules** are "not part of the current build but are loaded at runtime from a remote container". Loading a remote is always asynchronous (an `import()` boundary).
- **Containers**: a build exposes modules through a container entry (`ContainerPlugin`); consumers reference it via `ContainerReferencePlugin`; `ModuleFederationPlugin` combines both.
- **Shared modules**: `shared` config declares modules that are "both overridable and provided as overrides to nested containers" — typically the same library in each build. `requiredVersion` is extracted from package.json for version negotiation.
- **The `get`/`init` contract**: a federated container exposes `get(module)` and `init(sharedScope)`; the host calls `init` with its shared scope first, then `get` ([webpack docs, Dynamic Remote Containers](https://webpack.js.org/concepts/module-federation/)).
- **Version conflicts are a documented failure mode**: "The container tries to provide shared modules, but if the shared module has already been used, a warning and the provided shared module will be ignored" ([webpack docs, Dynamic Remote Containers](https://webpack.js.org/concepts/module-federation/)). The docs also document the "Shared module is not available for eager consumption" error and the `eager: true` escape hatch ([webpack docs, Troubleshooting](https://webpack.js.org/concepts/module-federation/)).
- The ecosystem site [module-federation.io](https://module-federation.io/) describes the same architecture ("share code between multiple projects in a decentralized way… applications can be split into smaller, self-contained modules that can be independently developed, tested, and deployed") and supports both webpack and Rspack.

```
        HOST BUILD (shell)                    REMOTE BUILD (app1)
   ┌───────────────────────────┐        ┌───────────────────────────┐
   │ shared: { react: {...} }  │        │ shared: { react: {...} }  │
   │ remotes: { app1: "app1@   │        │ exposes: { "./Button":    │
   │   http://…/remoteEntry.js"}│       │   "./src/Button" }        │
   │                           │        │ name: "app1"              │
   │  await container.init(    │  ◄────►│ remoteEntry.js (loaded    │
   │    __webpack_share_scopes__│        │  as a <script> tag)       │
   │  );                       │  get   │                           │
   │  await container.get(     │──────► │  one shared React wins;   │
   │    "./Button")            │        │  version skew → warning,  │
   └───────────────────────────┘        │  fallback to own copy     │
                                        └───────────────────────────┘
```

**Flux relevance:** Flux deliberately does the opposite of module federation's *shared* concept: per the [Framework Boundary principle in CONTEXT.md](../CONTEXT.md), each plugin bundle inlines its own framework and there is deliberately *no* shared module negotiation. The cost is duplication (every React IIFE re-pays ~200KB — measured, see §4); the benefit is that the entire class of "shared module version skew" problems webpack documents disappears by construction. Flux's `build/plugins/<tag>.js` files are effectively "containers without a sharing scope": independently loadable, zero negotiated deps.

---

### 2.4 Iframe-based integration

**Mechanism:** each micro-frontend is a separate HTML document rendered inside an `<iframe>`. The HTML spec says the `iframe` element "represents its content navigable" — a full, separate browsing context ([WHATWG HTML Standard §4.8.5 The iframe element](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element)). That gives **complete isolation**: separate document, separate global object, separate event loop — and same-origin policy protects each frame from the others' scripts ([WHATWG HTML Standard, web-messaging §9.3](https://html.spec.whatwg.org/multipage/web-messaging.html)).

Communication between frames goes through `postMessage`, which the spec frames as "a messaging system that allows documents to communicate with each other regardless of their source domain, in a way designed to not enable cross-site scripting attacks" — with mandatory checks of `origin` and data shape ([WHATWG HTML Standard §9.3 Cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html)). The `sandbox` attribute adds extra restrictions ("an unordered set of unique space-separated tokens") on content hosted by the frame ([iframe spec](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element)).

```
┌──────────────────────────────────────────────────────────────┐
│  Parent document (window A, origin X)                        │
│                                                              │
│  <iframe src="https://micro-b.example/"></iframe>            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Child document (window B, origin Y — separate!)       │  │
│  │  separate JS globals, separate DOM, separate CSS       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  windowA.postMessage(msg, targetOrigin)  ⇄  windowB "message"│
│  (origin-checked; structured-clone serialized)               │
└──────────────────────────────────────────────────────────────┘
```

**Cons** (from [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Run-time integration via iframes"): iframes "tend to make them less flexible than other options. It can be difficult to build integrations between different parts of the application, so they make routing, history, and deep-linking more complicated, and they present some extra challenges to making your page fully responsive." The spec itself notes the awkwardness of even a fresh iframe being message-ready ("the scripts in the target browsing context have to have had time to set up listeners" — [web-messaging §9.3.3](https://html.spec.whatwg.org/multipage/web-messaging.html)).

**Flux relevance:** Flux *could* have isolated each plugin in an iframe, and deliberately didn't — the whole CustomEvent bridge (below) presumes one shared DOM. Flux gets its *isolation* instead from (a) the Custom Element + Framework Boundary contract for frontends, and (b) **true process isolation** for backends (each plugin is a separate Bun subprocess with newline-delimited JSON-RPC over stdin/stdout, per `lib.rs:104-162` — see §5). That's the closest analogue in Flux's design to iframe-style "don't share a runtime": backend plugins literally don't share a runtime.

---

### 2.5 Server-side composition (SSI / ESI / at the edge)

**Mechanism:** the *server* (or an intermediary between server and browser) assembles the page out of fragments before it reaches the browser.

- **SSI (Server Side Includes)**: Apache's `mod_include` module "provides a filter which will process files before they are sent to the client", driven by `<!--#include virtual="…" -->`-style SGML comments ([Apache HTTP Server docs, mod_include](https://httpd.apache.org/docs/current/mod/mod_include.html)). Jackson's guide shows nginx `ssi on;` composing a page from team-owned fragment files — a valid, if unglamorous, micro-frontend architecture ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)).
- **ESI (Edge Side Includes)**: a W3C Note (2001, by Akamai et al.) defining an XML language "which allows content assembly by HTTP surrogates" — a *template* containing `<esi:include src="…"/>` fragment references; each fragment is a separate resource with its own cacheability metadata, and `esi:try/attempt/except` gives per-fragment failure handling ([W3C, ESI Language Specification 1.0](https://www.w3.org/TR/esi-lang/)).
- **Composition at the edge (Cloudflare)**: Cloudflare's own docs describe a Worker-template "vertical microfrontends" architecture where a Router Worker maps URL paths to independently deployed Workers and "stitches" them together ([Cloudflare Workers docs, Microfrontends](https://developers.cloudflare.com/workers/framework-guides/web-apps/microfrontends/)); their engineering blog covers a "fragments architecture" of collaborating Workers that server-side render and stream fragments, and explicitly contrasts it with module federation by noting fragments avoid "version skew issues and coordination problems when updating shared libraries" ([Cloudflare blog, Micro-frontends on Workers (2022)](https://blog.cloudflare.com/better-micro-frontends/); [Cloudflare blog, Vertical microfrontends (2026)](https://blog.cloudflare.com/vertical-microfrontends/)).

**Flux relevance:** N/A for the web-facing part — Flux is a desktop app; there is no server. But the *routing pattern* has a local mirror: Flux's Rust host is the "router" that assembles the app from independently-deployable pieces (discover → spawn → RPC route by `name.action`, `lib.rs:59-100`), and the per-plugin failure isolation ESI's `try/except` provides is analogous to Flux's `Promise.allSettled` + per-source error banners in `feed-widget.tsx:89-137`.

---

### 2.6 single-spa orchestration

**Mechanism:** single-spa is "a framework for bringing together multiple JavaScript microfrontends", based on "abstracting lifecycles for entire applications". A **root config** registers each application with (1) a name, (2) a load function, (3) an activity function deciding when it's active. Each registered application must implement `bootstrap`, `mount`, `unmount` lifecycles — "The main difference between a traditional SPA and single-spa applications is that they must be able to coexist with other applications as they do not each have their own HTML page" ([single-spa docs, Getting Started](https://single-spa.js.org/docs/getting-started-overview/)).

**Parcels** are single-spa's answer to sharing smaller units: "a framework agnostic component… mounted by a manual function call rather than the activity function", exporting `bootstrap`/`mount`/`unmount`/`update` functions that each return a promise ([single-spa docs, Parcels](https://single-spa.js.org/docs/parcels-overview/)). single-spa's docs recommend against *build-time* module sharing in the browser, preferring import maps for shared dependencies (React/ReactDOM declared in the root config's import map — [Getting Started](https://single-spa.js.org/docs/getting-started-overview/)).

```
Root config (single-spa)
  registerApplication({ name, loadingFn, activityFn })
        │   activityFn says WHEN active (URL match)
        ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ app (React)  │   │ app (Vue)    │   │ app (Angular)│
   │ bootstrap    │   │ bootstrap    │   │ bootstrap    │
   │ mount        │   │ mount        │   │ mount        │
   │ unmount      │   │ unmount      │   │ unmount      │
   └──────────────┘   └──────────────┘   └──────────────┘
        └───────────── all mounted into ONE page DOM ─────────────┘
```

**Flux relevance:** Flux's WC wrapper (`build-plugins.ts:33-48`) is a hand-rolled single-spa lifecycle engine: `connectedCallback` ≈ `mount`, `disconnectedCallback` ≈ `unmount`, plus property setters for props. But where single-spa *explicitly* drives lifecycles from a root config that knows every app, Flux is **declarative and discovery-driven**: the skeleton knows nothing about plugins until `core-manifest.scan` returns manifests; mounting is decided by manifest fields (`ui` → auto-mount by App.tsx, `components` → create-on-demand by slot consumers). Flux's "activity function" is the manifest itself. single-spa also centralizes shared-dependency decisions (import maps); Flux's Framework Boundary makes that decision *not to decide*.

---

## 3. Key technical concepts, defined

- **Web Component** — a browser-native component: a custom element (optionally with shadow DOM and slots). Defined by the [Custom Elements](https://html.spec.whatwg.org/multipage/custom-elements.html), [Shadow DOM](https://dom.spec.whatwg.org/#shadow-trees), and [slot](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element) specs. *Flux: every plugin's UI is a Web Component (`feed-widget`, `yt-video-card`, `player-modal`, `flux-player`).*

- **Custom Element** — an element "whose constructor and prototype are defined by the author, instead of by the user agent" ([HTML spec §4.13.3](https://html.spec.whatwg.org/multipage/custom-elements.html)). *Flux: the wrapper class generated in `build-plugins.ts` is a custom element; the tag name is the plugin's contract.*

- **Custom element lifecycle** — the browser-invoked callbacks: `connectedCallback` (inserted into a document), `disconnectedCallback` (removed), `attributeChangedCallback`, `adoptedCallback` ([HTML spec §4.13](https://html.spec.whatwg.org/multipage/custom-elements.html)). *Flux: `connectedCallback` → `createRoot(this)`; `disconnectedCallback` → `root.unmount()` (`build-plugins.ts:37-41`).*

- **Shadow DOM / shadow tree** — a node tree attached to a host element, whose root is a `ShadowRoot`; style scoping happens at its boundary ([DOM spec §4.2.2](https://dom.spec.whatwg.org/#shadow-trees)). *Flux: NOT used — plugin styles are injected globally (see "Style leakage" below).*

- **Light DOM vs shadow DOM** — light DOM = the children the *caller* writes in markup; shadow DOM = the internal tree the component author owns. The `<slot>` element projects light-DOM children into the shadow tree ([DOM spec, slottables](https://dom.spec.whatwg.org/#shadow-tree-slots)). *Flux: the modal's `<slot>` concept from CONTEXT.md is named after this exact mechanism, but is implemented as a plain DOM container filled imperatively, not a native slot.*

- **Slot (HTML)** — `<slot>`, whose DOM interface is `HTMLSlotElement` with `assignedNodes()`/`assignedElements()` ([HTML spec §4.12.4](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element)). *Flux: `slots: ["video.player"]` in `plugin.json` is the manifest-level analogue — a named placeholder resolved at runtime by scanning manifests (CONTEXT.md: Slot).*

- **ES module** — JavaScript's native module system (a syntax + runtime semantics defined in ECMA-262 §15.2 [Modules](https://tc39.es/ecma262/#sec-modules)); the browser hosts it via `<script type="module">`, module maps (each module fetched/parsed/evaluated once per document), and import maps ([HTML spec §8.1.4, script processing / module hooks](https://html.spec.whatwg.org/multipage/webappapis.html#integration-with-the-javascript-module-system)). *Flux: not used at runtime — bundles are classic scripts (below).*

- **Bundle vs module** — a *module* is one source file with import/export; a *bundle* is the product of a bundler (Vite/webpack) that has concatenated many modules for the browser. *Flux: `build/plugins/*.js` are bundles.*

- **IIFE bundle** — "immediately invoked function expression": the bundler wraps all code in a function that runs on load, exposing a single global if configured ([webpack's own glossary-adjacent description of IIFEs](https://webpack.js.org/concepts/why-webpack/#iifes---immediately-invoked-function-expressions)). *Flux: `build.lib.formats: ["iife"]` (`build-plugins.ts:177`) — each WC is a classic `<script>` executed on injection, sharing the page's global scope.*

- **Code splitting** — emitting a bundle as multiple chunks loaded on demand (usually via dynamic `import()`). *Flux: no code splitting per plugin; each WC is one monolithic file.*

- **Shared dependencies / singletons** — one copy of a library (e.g. one React instance) used by many apps, usually negotiated at runtime (module federation `shared` / single-spa import maps). *Flux: explicitly rejected — every bundle inlines React (Framework Boundary).*

- **CustomEvent** — an `Event` subclass carrying arbitrary `detail`; constructor takes `type` + `CustomEventInit` with `bubbles`/`cancelable`/`composed` ([DOM spec §2.4](https://dom.spec.whatwg.org/#interface-customevent)). **Composed events**: an event crosses a shadow boundary only if `composed: true` — "True if event invokes listeners past a ShadowRoot node that is the root of its target" ([DOM spec, `composed`](https://dom.spec.whatwg.org/#dom-event-composed)); `composedPath()` shows the full crossing path. *Flux: `window.dispatchEvent(new CustomEvent("video.player.load", {detail}))` in `yt-video-card.tsx:6-8` — dispatched on `window`, so no shadow-boundary issue arises (and none could, since Flux has no shadow DOM).*

- **Capability-based decoupling (IoC / service discovery)** — components depend on *capability names*, not implementations; a registry resolves the name to a provider at runtime. Flux's hooks are exactly this: a plugin declares `hooks: ["feed.video"]`; the Rust host resolves the provider (`resolve_hook` returns `{name, methods}`, `lib.rs:215-230`) or resolves-and-calls (`call_hook`, `lib.rs:236-261`). CONTEXT.md: Hook documents it as "an abstract capability label that decouples *what* from *who*". Slots are the frontend twin: the container scans `.manifests` for a plugin whose `slots` matches, then instantiates its component (CONTEXT.md: Slot). This is the recommended MFE posture — micro-frontends.org's "the DOM specification of this element acts as the contract or public API for other teams" ([micro-frontends.org](https://micro-frontends.org/)) — pushed one step further: Flux's contract is *resolved*, not hardcoded.

- **Sandboxing / JS global scope pollution** — sandboxing = isolating untrusted or independent code so it can't touch other code's globals. A classic `<script>` bundle shares one global scope — no sandboxing. Iframes give real sandboxing (separate document/global; [iframe spec](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element)). *Flux: frontends are NOT sandboxed — all bundles share `window` (they even extend it: `window.__pluginRpc`, `App.tsx:6-18`). A plugin could shadow `window.__pluginRpc` and break others. Backends ARE isolated (separate processes).*

- **Style leakage / cascade** — CSS is global by default: any stylesheet can match any element. Jackson's guide calls this the classic MFE hazard ("if one team's micro frontend has a stylesheet that says `h2 { color: black; }` and another says `h2 { color: blue; }`… someone is going to be disappointed") and lists shadow DOM as a solution ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Styling"). *Flux: each build injects its own Tailwind v4 stylesheet (`@import "tailwindcss"` via `build-plugins.ts:158-161`, then `vite-plugin-css-injected-by-js`), into the shared document. Tailwind's preflight/utilities are largely class-scoped, but preflight resets and any plugin's raw selectors can collide. This is the price of not using shadow DOM.*

- **z-index / overlay stacking** — with multiple independent apps on one page, overlay layering is a shared, unscoped global: the modal needs to be above everything. *Flux: `player-modal` renders a backdrop with a high z-index; since Flux has one stacking context per page and one window, the modal works — but two plugins each wanting "on top" would fight. Iframes sidestep this (each frame stacks independently) but break full-window overlays.*

- **Framework boundary / version skew** — the principle that a plugin's framework version is its own concern; "the host's framework version is irrelevant to plugins" (CONTEXT.md: Framework Boundary). **Version skew** = two apps on one page running different major versions of the same library (e.g. two Reacts) — the module-federation docs' shared-scope negotiation and its version-mismatch warnings exist precisely because of this ([webpack docs](https://webpack.js.org/concepts/module-federation/)). *Flux: version skew is impossible by construction — every bundle inlines its own framework, so there is nothing to negotiate; two Reacts coexist as two closed bundles.*

- **Lifecycle ownership / garbage collection of unloaded app code** — someone must decide when a micro-app's DOM, listeners, and state are torn down. In single-spa, applications own this via `unmount` ([single-spa docs](https://single-spa.js.org/docs/getting-started-overview/)); with Web Components, the browser owns element teardown but *not* script unload — once a `<script>` has run, its code and top-level state cannot be garbage collected until the page dies. *Flux: WC unmount (`disconnectedCallback` → `root.unmount()`) cleans the React tree, and `feed-widget.tsx:300-302` clears card containers on re-render — but the plugin *scripts* themselves, once injected via `App.tsx:86-89`, are permanent residents of the page; there is no plugin unload/reload story.*

---

## 4. Known failure modes of micro-frontends

1. **Duplicated dependencies / payload cost.** "Some micro frontend implementations can lead to duplication of dependencies, increasing the number of bytes our users must download" — Cam Jackson's guide names this as the first downside ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Downsides"). **Flux, measured:** each React IIFE is ~200KB uncompressed (build/plugins/: `feed-widget.js` 208,818 B, `peertube-card.js` 202,901 B, `yt-video-card.js` 201,546 B, `player-modal.js` 199,292 B — `AGENTS.md` quotes ~156-160KB, which appears to be the gzipped figure), and `flux-player.js` is 10.4 MB because the movi-player library is inlined. Four React bundles ≈ 800KB before the player. A single shared React would cut that ~4× (this is exactly what module federation `shared` and single-spa import maps exist for). Flux trades this away deliberately (Framework Boundary), but it is a real, ongoing cost.

2. **Cross-team coordination tax.** Jackson: "the dramatic increase in team autonomy can cause fragmentation in the way your teams work" ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)). Contract changes (event names, `detail` shapes, hook methods) require coordinated upgrades — "you won't be able to make breaking changes to your integrations without having a coordinated upgrade process" ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Cross-application communication"). **Flux:** hooks are *implicit* contracts (CONTEXT.md: Hook — "providers and consumers agree by convention on what methods the hook supports"), and the CustomEvent names follow the hook-method convention. Nothing enforces the convention at runtime — the failure mode below is the proof.

3. **Event-name collisions / contract fragility.** **Flux's documented live example:** AGENTS.md Known Issue #1 records that `yt-video-card.tsx` dispatched `player-load` while listeners waited for `modal-load`/`modal-close` — a silent, no-error bug where "only the card event triggers; the listener pair is unused". I verified the current tree: cards now dispatch `video.player.load` (`yt-video-card.tsx:6-8`, `peertube-card.tsx:12-14`), the player listens to it and dispatches `video.modal.show`/`video.modal.hide` (`flux-player.tsx:31-45`), the modal listens to those and dispatches `video.player.hide` (`player-modal.tsx:11-20`), and `feed-widget.tsx:47-48` hides on modal events — so the mismatch is *currently fixed*, but the category of bug is structural: event names are strings, not symbols or a typed registry. micro-frontends.org's "Establish Team Prefixes — namespace… Events" ([micro-frontends.org](https://micro-frontends.org/)) is the canonical mitigation; Flux's `<hook>.<method>` naming convention is that mitigation.

4. **Version skew.** Module federation's docs are the primary-source witness: shared modules negotiate versions, warn, and fall back ([webpack docs](https://webpack.js.org/concepts/module-federation/)); single-spa's import-map approach makes the *root config* the arbiter of React's version ([single-spa docs](https://single-spa.js.org/docs/getting-started-overview/)). **Flux:** immune by construction (no shared modules), at the price of #1.

5. **Debugging / stack-trace pain.** The harder the isolation, the harder the trace: iframes obscure everything behind cross-document boundaries; federation adds async module indirection (its docs' troubleshooting section exists for errors like "Module './Button' does not exist in container" — [webpack docs](https://webpack.js.org/concepts/module-federation/)). **Flux:** actually on the *good* side — one page, one global scope, classic scripts; stack traces cross plugin boundaries freely. The Rust host adds one hop (errors reject with plain strings — use `??` not `||`, per AGENTS.md), but the IPC is a simple newline-JSON pipe with `id` correlation (`lib.rs:129-152`).

6. **Performance: each bundle parsed/executed separately.** Every IIFE/ESM bundle pays its own parse+eval cost; shared code is parsed N times. **Flux:** N React bundles are parsed N times at startup (skeleton loads each `ui`/`components`/`feeds[].card` script once, `App.tsx:40-67`, but N = number of plugins), and there is no caching layer between `core-static.read` and the injected `<script>` on re-init. Also no StrictMode: Flux removed it because React's dev-only double-mount (documented at [react.dev, StrictMode](https://react.dev/reference/react/StrictMode)) caused duplicate WC elements + redundant RPC calls — a genuinely MFE-specific StrictMode interaction, since each WC root double-mounts independently.

7. **Testability.** Jackson: unit-test each micro-frontend, use functional tests only to validate page assembly, and prefer consumer-driven contracts for integration ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Testing"). **Flux:** no test suite exists in the repo; the CustomEvent bridge and manifest resolution are precisely the seams consumer-driven contract testing would target.

8. **Operational/governance complexity.** Jackson's third named downside: "environment differences" and "operational and governance complexity" ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html), "Downsides"). **Flux:** 12 manifests / 7 spawned processes (AGENTS.md); the Rust host must discover, spawn, supervise, and timeout (15s, `lib.rs:206-208`) every plugin. That is real host complexity that a monolith wouldn't have.

---

## 5. Where Flux sits in this landscape

Flux is a **three-layer hybrid**, each layer mapping to a different integration approach:

1. **Backend: subprocess plugins** — closest to *vertical micro-frontends / BFF per micro-app* (Jackson's BFF pattern, [martinfowler.com](https://martinfowler.com/articles/micro-frontends.html)); closest isolation to iframes (true separate processes), with JSON-RPC as its `postMessage`.
2. **Frontend integration: runtime Web Components** — the canonical micro-frontends.org approach ([micro-frontends.org](https://micro-frontends.org/)) and Jackson's "runtime integration via Web Components" ([martinfowler.com](https://martinfowler.com/articles/micro-frontends.html)), with lifecycle handled by the browser spec ([WHATWG](https://html.spec.whatwg.org/multipage/custom-elements.html)).
3. **Build: per-plugin IIFE via Vite library mode** — build-time *artifact* production ([Vite docs](https://vite.dev/guide/build#library-mode)) without build-time *integration* — deliberately avoiding the lockstep release problem Jackson warns about ([martinfowler.com](https://martinfowler.com/articles/micro-frontends.html)).

```
                    FLUX: where the pieces live
┌─────────────────────────────────────────────────────────────────────┐
│  Tauri WebView (one page, one window, no chrome, transparent)       │
│                                                                     │
│  App.tsx (skeleton/container)                                       │
│   ├─ __pluginRpc / resolveHook / callHook  (window globals)         │
│   ├─ core-manifest.scan → manifests                                  │
│   └─ loadFrontend() → core-static.read → <script> injection         │
│                                                                     │
│   <feed-widget>  (WC, React IIFE ~200KB)                            │
│     ├─ calls __pluginRpc("yt-feed.feed")     ──────────────┐        │
│     ├─ CustomEvent("video.player.load")  ────┐              │        │
│     └─ <yt-video-card/> (WC, React IIFE)     │              │        │
│   <player-modal> (WC) ← listens modal.show/hide              │        │
│   <flux-player>  (WC, IIFE ~10MB) ← listens player.load ────┤        │
│                                                                     │
│   tauri::invoke ──► plugin_request / resolve_hook / call_hook      │
│        │  ("name.action", 15s timeout)                              │
└────────┼────────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────  Rust host (lib.rs)  ─────────────────────────┐
│  discover_plugins() → spawn_plugin() → resolve_run("bun ./main.ts")│
│  → PluginHandle { stdin, pending map id→oneshot, next_id }         │
│  one tokio reader task per child, matching responses by id         │
└───────┬──────────────────────┬──────────────────────┬──────────────┘
        ▼                      ▼                      ▼
  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
  │ yt-feed     │      │ yt-auth      │      │ peertube     │
  │ (Bun proc)  │      │ (Bun proc)   │      │ (Bun proc)   │
  │ hooks:      │      │ hooks:       │      │ hooks:       │
  │ feed.video  │      │ yt-auth      │      │ feed.video   │
  └─────────────┘      └──────────────┘      └──────────────┘
   newline-delimited JSON {"id","method","params"} on stdin/stdout
```

**Against Module Federation:** Flux shares nothing, federation negotiates sharing. Flux's "container" is a Rust host with a manifest registry; federation's container is a JS object with `get`/`init`. Flux's contract is capability names (hooks) resolved by the host; federation's contract is exposed module paths. Flux eliminates federation's entire version-negotiation machinery — and its failure modes — by inlining. What Flux loses: federation's deduplication and cross-app code reuse, and its lazy `import()`-based loading (Flux loads whole bundles eagerly per tag).

**Against single-spa:** single-spa is an *orchestrator library* with a root config that knows all apps and drives bootstrap/mount/unmount. Flux's skeleton is deliberately ignorant: it reads manifests and lets the manifest shape (`ui`, `components`, `slots`, `feeds`) decide mounting. Flux's WC wrapper (`build-plugins.ts:33-48`) implements the same lifecycle contract single-spa enforces, but browser-spec-native (`connectedCallback`/`disconnectedCallback`) instead of promise-returning functions. single-spa pairs with import maps to share React — Flux's Framework Boundary forbids that.

**Against iframes:** iframes give perfect script/CSS isolation but cost cross-document integration, sizing, and responsiveness ([martinfowler.com](https://martinfowler.com/articles/micro-frontends.html)). Flux gets *behavioral* isolation without iframes because its heavy state lives in separate processes, and its frontend state machine lives inside each WC's React root. The residual isolation gaps (globals, styles — §3) are exactly what iframes would have fixed.

**What Flux gets right per the primary sources:**
- Native encapsulation via Custom Elements as the integration seam — the micro-frontends.org prescription verbatim: "Custom Elements are a great way to hide implementation details while providing a neutral interface to others" ([micro-frontends.org](https://micro-frontends.org/)).
- "Favor native browser features over custom APIs… use browser events" — Flux's CustomEvent bridge is this recommendation, with a naming convention = micro-frontends.org's "team prefixes" ([micro-frontends.org](https://micro-frontends.org/)).
- "Don't share a runtime… don't rely on shared state or global variables" — the Framework Boundary in CONTEXT.md is a direct restatement ([micro-frontends.org](https://micro-frontends.org/)).
- Real isolation for backends via process boundaries (JSON-RPC over stdin/stdout) — stronger than any browser-side technique.

**Where it deviates:**
- IIFE bundles mean no native module sharing, no code splitting, no shared deps — duplicated React per plugin (~200KB each, 10MB for the player).
- No shadow DOM → no native style encapsulation; Tailwind stylesheets are injected into the shared document.
- CustomEvent contract is string-typed and convention-enforced only (AGENTS.md Known Issue #1 shows what happens), vs. typed registries or single-spa's lifecycle props.
- Scripts are never unloaded — plugin bundles are page-lifetime residents (no hot reload/unload; §3 "Lifecycle ownership").

---

## 6. Pros and Cons for Flux

### Pros

| # | Pro | Evidence (primary source) | Flux mechanism |
|---|-----|---------------------------|----------------|
| 1 | True technology independence | [micro-frontends.org](https://micro-frontends.org/) "Be Technology Agnostic" | Framework auto-detection in `build-plugins.ts:12-77` (React/preact/Vue/Svelte) |
| 2 | Independent deployability without lockstep releases | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) | Each `build/plugins/<tag>.js` is standalone; skeleton never rebuilds |
| 3 | Backend isolation stronger than iframes | [iframe spec](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element) (separate browsing contexts) vs subprocesses | Each `run` plugin = own Bun process, own memory, own crash domain (`lib.rs:104-162`) |
| 4 | Capability resolution (IoC) matches MFE "contracts over implementations" | [micro-frontends.org](https://micro-frontends.org/) "The DOM specification… acts as the contract" | `resolve_hook`/`call_hook` (`lib.rs:215-261`); slot resolution scans `.manifests` |
| 5 | Version skew eliminated by construction | [webpack docs](https://webpack.js.org/concepts/module-federation/) (shared-module conflicts) | Framework Boundary: every bundle inlines its own framework (CONTEXT.md) |
| 6 | Debugging stays simple | (inference — no primary source needed: one document, classic scripts) | Stack traces cross plugin code freely; no module-federation indirection |
| 7 | Fault isolation per source | [ESI spec, try/attempt/except](https://www.w3.org/TR/esi-lang/) (fragment failure handling) | `Promise.allSettled` + per-source error banners + 20s safety timer (`feed-widget.tsx:80-137`) |

### Cons

| # | Con | Evidence | Flux evidence |
|---|-----|----------|---------------|
| 1 | Duplicated framework payload | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) "duplication of dependencies" | ~200KB React per WC (measured: feed-widget 208,818 B, yt-video-card 201,546 B, peertube-card 202,901 B, player-modal 199,292 B); flux-player 10,423,790 B |
| 2 | Contract fragility (string-typed events) | [micro-frontends.org](https://micro-frontends.org/) "Establish Team Prefixes" (implies collisions otherwise) | AGENTS.md Known Issue #1: `player-load` vs `modal-load` mismatch — silent failure; now fixed to `video.player.load`/`video.modal.show` (verified in current tree) |
| 3 | No style isolation | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) "Styling" — CSS is global | Per-plugin Tailwind v4 styles injected into shared document (`build-plugins.ts:158-161`, `injectCss`); only shadow DOM or conventions prevent leakage |
| 4 | No script unload / GC of app code | [HTML spec, classic scripts](https://html.spec.whatwg.org/multipage/scripting.html) (executed once, page-lifetime) | `App.tsx:86-89` injects scripts; nothing ever removes them |
| 5 | Host complexity grows with plugin count | [Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html) "operational and governance complexity" | 12 manifests, 7 spawned processes; 15s timeout per request (`lib.rs:206-208`); timeout errors are plain strings |
| 6 | Global-scope pollution risk | (inference from classic-script semantics in [HTML spec](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)) | All bundles share `window`; plugins extend it (`__pluginRpc`, `resolveHook`, `callHook`) — a plugin could shadow another's |
| 7 | No dev-mode StrictMode safety net | [react.dev, StrictMode](https://react.dev/reference/react/StrictMode) | Removed because double-mount duplicated WCs + RPC calls (AGENTS.md) — correct call, but loses StrictMode's double-render/effect checks |

### Comparison table

| Approach | Isolation | Code sharing | Versioning | Debugging | Flux fit |
|----------|-----------|--------------|------------|-----------|----------|
| Build-time (single bundle) | none (one scope) | full (dedup by bundler) | one version, lockstep | simplest | Flux uses its tooling, rejects its integration |
| Web Components (Flux's choice) | style via shadow DOM (unused), DOM-level contract | none | skew impossible, duplicates instead | direct (one document) | **current architecture** |
| Module Federation | none (shared global scope) | runtime negotiation | warns/falls back on conflict | indirection + container errors | would solve payload, violates Framework Boundary |
| iframes | strongest (separate document) | none | impossible (independent docs) | painful (cross-document) | overkill; Flux's subprocess backends already give process isolation |
| SSI/ESI/edge | server-side (n/a client) | per-fragment | per-fragment deploy | server-side | n/a for desktop; pattern mirrored in Rust host routing |
| single-spa | none (shared page) | via import maps (shared React) | root-config-arbitrated | orchestration layer to learn | closest analogue; Flux's WC wrapper is a spec-native version |

---

## 7. Glossary

- **BFF (Backend for Frontend)** — a dedicated backend per frontend app. ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)) — *Flux: each backend plugin is a mini-BFF.*
- **Container / host application** — the app that composes micro-frontends and owns cross-cutting concerns. ([Cam Jackson (2019)](https://martinfowler.com/articles/micro-frontends.html)) — *Flux: the skeleton + App.tsx.*
- **Custom element** — author-defined DOM element (see §3). — *Flux: every plugin UI.*
- **CustomEvent** — event carrying arbitrary `detail` (see §3). — *Flux: `video.player.load` etc.*
- **Composed event** — event that crosses shadow boundaries (`composed: true`). ([DOM spec](https://dom.spec.whatwg.org/#dom-event-composed)) — *Flux: n/a (no shadow DOM; events dispatched on `window`).*
- **Code splitting** — on-demand chunk loading (see §3). — *Flux: none per plugin.*
- **ESI (Edge Side Includes)** — W3C markup language for assembling pages via HTTP surrogates. ([W3C](https://www.w3.org/TR/esi-lang/)) — *Flux: conceptual analogue only (per-fragment failure handling).*
- **ES module** — native JS module system. ([ECMA-262](https://tc39.es/ecma262/#sec-modules)) — *Flux: unused at runtime.*
- **Framework boundary** — Flux's principle that plugin bundles are self-contained w.r.t. frameworks. (CONTEXT.md) — *Flux's core isolation strategy.*
- **Hook** — declared capability name resolved at runtime (see §3). (CONTEXT.md) — *Flux: `feed.video`, `yt-auth`, `video.player`.*
- **IIFE** — immediately-invoked function expression; classic-script bundle format. — *Flux: all `build/plugins/*.js`.*
- **Import map** — browser feature mapping module specifiers to URLs ([HTML spec §8.1.4](https://html.spec.whatwg.org/multipage/webappapis.html#integration-with-the-javascript-module-system)) — *Flux: n/a (no modules).*
- **Light DOM** — caller-owned children of a custom element. ([DOM spec](https://dom.spec.whatwg.org/#shadow-tree-slots)) — *Flux: cards inside feed-widget.*
- **Module federation** — runtime code sharing between builds (see §2.3). ([webpack docs](https://webpack.js.org/concepts/module-federation/)) — *Flux: deliberately not used.*
- **Parcel** — single-spa's manually-mounted micro-component with lifecycle functions. ([single-spa](https://single-spa.js.org/docs/parcels-overview/)) — *Flux: `components[]` slot-fillers are the analogue.*
- **Remote module** — module loaded at runtime from another build. ([webpack docs](https://webpack.js.org/concepts/module-federation/)) — *Flux: n/a.*
- **Shadow DOM / shadow tree** — encapsulated node tree attached to an element ([DOM spec](https://dom.spec.whatwg.org/#shadow-trees)) — *Flux: unused.*
- **Slot (HTML)** — projection point for light-DOM children ([HTML spec](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element)) — *Flux: manifest-level `slots[]`, resolved imperatively.*
- **Slot (Flux)** — named frontend placeholder a plugin fills (CONTEXT.md) — *Flux: `video.player`.*
- **SSI (Server Side Includes)** — server-side fragment inclusion ([Apache docs](https://httpd.apache.org/docs/current/mod/mod_include.html)) — *Flux: n/a.*
- **Upgrade (custom element)** — retroactive instantiation of defined behavior on pre-existing elements ([HTML spec](https://html.spec.whatwg.org/multipage/custom-elements.html)) — *Flux: avoided by `whenDefined` before `createElement`.*
- **Web Component** — browser-native component primitive set (see §3). — *Flux: every plugin UI.*

---

## 8. Primary sources used

All URLs fetched/verified 2026-08-02.

1. [Cam Jackson — Micro Frontends (martinfowler.com)](https://martinfowler.com/articles/micro-frontends.html) — definition, benefits, all integration approaches, styling, testing, downsides.
2. [micro-frontends.org — Micro Frontends: extending the microservice idea to frontend development](https://micro-frontends.org/) — core ideas (technology agnosticism, team code isolation, prefixes, native browser features), ThoughtWorks radar origin.
3. [WHATWG HTML Standard §4.13 Custom elements](https://html.spec.whatwg.org/multipage/custom-elements.html) — lifecycle callbacks, `CustomElementRegistry`, `whenDefined`, upgrades, constructor rules.
4. [WHATWG DOM Standard — Shadow trees](https://dom.spec.whatwg.org/#shadow-trees) and [Slots/slottables](https://dom.spec.whatwg.org/#shadow-tree-slots).
5. [WHATWG HTML Standard §4.12.4 The slot element](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element) — `HTMLSlotElement`, `assignedNodes`.
6. [WHATWG DOM Standard §2.4 Interface CustomEvent](https://dom.spec.whatwg.org/#interface-customevent) and [Event `composed`](https://dom.spec.whatwg.org/#dom-event-composed).
7. [webpack — Module Federation concepts](https://webpack.js.org/concepts/module-federation/) — containers, remotes, shared modules, version warnings, eager, troubleshooting.
8. [module-federation.io](https://module-federation.io/) — ecosystem documentation.
9. [single-spa — Getting Started](https://single-spa.js.org/docs/getting-started-overview/) and [Parcels](https://single-spa.js.org/docs/parcels-overview/) — registration lifecycle, bootstrap/mount/unmount, import maps.
10. [WHATWG HTML Standard §4.8.5 The iframe element](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element) — content navigable, sandbox.
11. [WHATWG HTML Standard §9.3 Cross-document messaging](https://html.spec.whatwg.org/multipage/web-messaging.html) — `postMessage`, origin checks.
12. [Apache HTTP Server — mod_include (SSI)](https://httpd.apache.org/docs/current/mod/mod_include.html).
13. [W3C Note — ESI Language Specification 1.0 (2001)](https://www.w3.org/TR/esi-lang/).
14. [Cloudflare Workers docs — Microfrontends](https://developers.cloudflare.com/workers/framework-guides/web-apps/microfrontends/) and [Cloudflare blog — Vertical microfrontends (2026)](https://blog.cloudflare.com/vertical-microfrontends/) / [— Micro-frontends on Workers (2022)](https://blog.cloudflare.com/better-micro-frontends/).
15. [Vite docs — Building for Production, Library Mode](https://vite.dev/guide/build#library-mode) — `build.lib`, formats, externalization.
16. [React docs — StrictMode](https://react.dev/reference/react/StrictMode) — dev-only double render / effect re-run.
17. [ECMA-262 §15.2 Modules](https://tc39.es/ecma262/#sec-modules) and [WHATWG HTML — module system integration](https://html.spec.whatwg.org/multipage/webappapis.html#integration-with-the-javascript-module-system).

**Could not verify from a primary source:** no primary source explicitly documents "stack traces degrade with module federation" or "script unload semantics for IIFEs" — those points are reasoned from the classic-script execution model in [WHATWG HTML §4.12.1](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element) and stated as inference in §3/§4. The `player-load`/`modal-load` bug is sourced from the repo's own AGENTS.md (not a web source), and I verified against the current tree that it is now fixed (`video.player.load` etc.).
