# Architecture Patterns Research — Flux

**Purpose:** Evaluate Flux's current architecture against established patterns and recommend improvements.
**Date:** 2026-07-26
**Method:** Primary-source research × codebase analysis (Tauri v2, React 19, plugin subprocess model).

---

## 1. Hexagonal Architecture (Ports and Adapters)

### The Pattern

Coined by Alistair Cockburn in 2005, Hexagonal Architecture (aka Ports & Adapters) places the application at the center and all external actors (UI, database, test harness, other apps) on the outside. The application communicates with the outside through **ports** (interfaces that express the conversation in domain language) and **adapters** (implementations that translate between port protocols and external technologies).

Key rules:
- The inner app **never names any external technology** — no database, no UI, no network.
- Ports are defined by purpose, not by technology.
- There is a strong inside-outside asymmetry: primary/driving adapters (UI, tests) initiate calls into the app; secondary/driven adapters (database, network) are called by the app.
- The "weak" form still lets the port be expressed in technology terms (e.g. SQL). The "strong" form demands the port be in pure domain language.

Source: [Alistair Cockburn — Hexagonal Architecture (original 2005 article)](https://alistair.cockburn.us/hexagonal-architecture)
Source: [Alistair Cockburn — Hexagonal Architecture Explained (2025 book)](https://alistaircockburn.com/hexarch%20v1.1b%20DIFFS%2020250420-1012%20paper+epub.docx.pdf)

### How Flux Does It

Flux has the bones of Hexagonal Architecture but doesn't fully commit:

- **Good:** The Tauri host (`lib.rs`) acts as a port — it defines an RPC protocol (JSON over stdin/stdout) that all plugins speak. The Rust `plugin_request` handler is a driving adapter: it receives IPC from the WebView frontend and routes to the correct plugin subprocess.
- **Good:** The `startStdin` pattern in `plugins/_shared/stdin.ts` is a uniform adapter protocol. Every plugin implements the same `Handler` function signature `(req, send) => void`.
- **Violation:** There is no explicit port interface. The protocol is an implicit contract (bare JSON with `id`, `method`, `params` fields). No TypeScript type enforces what methods a plugin must export for a given port.
- **Violation:** Plugins are called directly by name (`"yt-feed.feed"`). This couples the caller to the plugin identity, which is the opposite of port-based thinking. The `call_hook` command improves this slightly by resolving hook → plugin at runtime, but hooks are still stringly-typed.
- **Violation:** The frontend (`feed-widget.tsx`) directly calls `window.__pluginRpc('yt-feed.feed', {})`. This is a hardcoded adapter invocation, not a port-based dispatch.

### Recommendations

1. **Define formal port interfaces** in shared types. For example:
   ```typescript
   // A "feed provider" port
   interface FeedPort {
     fetch(params: FeedParams): Promise<FeedItem[]>
     resolve?(url: string): Promise<ResolvedMedia>
   }
   ```
   Plugins would declare which ports they implement in their manifest. The host routes calls from port to implementation at runtime, never by plugin name.

2. **Move adapter code out of the frontend.** The feed-widget should call a port (`feed.fetch()`), not a plugin RPC directly. The host (or a thin bridge layer) resolves the port to the current provider.

3. **Create driven ports for persistence.** If a plugin needs to store state, it should go through a `StoragePort` interface, not write files directly. This makes plugins testable with mock storage.

4. **Adopt the "strong" form for plugin-to-host communication.** The wire protocol should express domain concepts (feed items, media metadata) not transport details (plugin names, raw JSON IDs).

---

## 2. Domain-Driven Design for Desktop Apps

### The Pattern

DDD (Eric Evans, 2003) provides a toolkit for modelling complex business logic. Key concepts:
- **Ubiquitous Language:** A shared vocabulary between domain experts and developers, reflected in code.
- **Bounded Context:** A logical boundary within which a particular model applies. Each context owns its own Ubiquitous Language and model. Contexts communicate through explicit translation layers.
- **Aggregate:** A cluster of domain objects treated as a unit, with a single **Aggregate Root** that enforces invariants.
- **Repository:** A mechanism for retrieving and storing aggregates, abstracting away the persistence technology.
- **Domain Event:** Something that happened that domain experts care about.
- **Entity vs. Value Object:** Entities have identity (a specific video), value objects are defined by their attributes (a thumbnail URL, a timestamp).

Source: [Martin Fowler — BoundedContext](https://martinfowler.com/bliki/BoundedContext.html)
Source: [Microsoft — DDD-oriented microservice (.NET docs)](https://github.com/dotnet/docs/blob/main/docs/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice.md)

### How Flux Does It

- **Good:** Flux already has several natural Bounded Contexts: feed aggregation, authentication, video playback, search. Each lives in a separate plugin, which is a good starting point.
- **Good:** The `feed-widget` has a state machine (systemError → loading → empty → partial → loaded) that resembles a domain model for feed state.
- **Missing:** There is no explicit *Ubiquitous Language*. The same concept ("video") is represented differently in yt-feed (`videoId`, `channel`, `views`, `published`) and peertube (`videoId`, `channel`, `views`, `duration`, `published`). Each plugin has its own implicit model but there's no shared domain vocabulary.
- **Missing:** No Aggregate Roots. Video items are passed as raw JSON objects with no invariant enforcement. There is no `Video` entity that both yt-feed and peertube produce.
- **Missing:** No Repositories. Plugins fetch data directly from their sources and return raw JSON. There's no abstraction over "give me feed items" that could be backed by YouTube, PeerTube, or a local cache.

### Recommendations

1. **Define a core domain model** in shared types:
   ```typescript
   // In src/shared/domain.ts
   interface VideoId { value: string; source: string }
   
   class Video {
     constructor(
       readonly id: VideoId,
       readonly title: string,
       readonly channel: string,
       readonly thumbnail: Url,
       readonly url: Url,
       readonly published: Date,
       readonly duration?: Duration,
       readonly metadata?: Record<string, string>
     ) {}
   }
   
   interface FeedRepository {
     getVideos(): Promise<Video[]>
   }
   ```

2. **Each plugin adapter translates from its protocol to the domain model.** yt-feed maps YouTube API shapes to `Video`. peertube maps PeerTube API shapes to `Video`. The feed widget only knows about `Video`.

3. **Use domain events for cross-plugin communication.** Instead of `window.dispatchEvent(new CustomEvent("video.player.load", {...}))`, define a `VideoSelected` domain event. The player plugin subscribes to this event. The modal plugin subscribes to `VideoModalRequested`. This turns ad-hoc EventTarget usage into explicit domain messaging.

4. **Identify your Core Domain.** What makes Flux valuable? Is it feed aggregation (unifying multiple sources)? Is it the playback experience? Is it the plugin ecosystem itself? Put the most design effort into this Bounded Context. Treat auth, search, and static serving as Supporting Subdomains (simpler, more generic solutions are fine there).

---

## 3. CQRS with Event Sourcing

### The Pattern

**CQRS (Command Query Responsibility Segregation)** separates the model that writes data from the model that reads it. Commands change state; queries return data. They use different models, often different data stores.

**Event Sourcing** stores state as a sequence of events rather than as a current snapshot. To get current state, you replay all events. This gives you an audit log, temporal queries, and the ability to reconstruct past states.

For feed-based media systems, CQRS is nearly ideal: the write side ingests content events (new video published, video removed), the read side builds optimized projections (a user's feed, a search index).

Source: [Łukasz Lalik — Scalable content feed using Event Sourcing and CQRS](https://medium.com/@k3nn7/scalable-content-feed-using-event-sourcing-and-cqrs-patterns-e09df98bf977)
Source: [GetStream — How Do You Architect a Scalable Activity Feed System?](https://getstream.io/blog/scalable-activity-feed-architecture/)
Source: [Aleksandromilenkov — SocialMediaMicroservices (CQRS + ES .NET)](https://github.com/aleksandromilenkov/SocialMediaMicroservices)

### How Flux Does It

- **Rudimentary CQRS:** Plugins have separate methods for queries (yt-feed has `feed` for reading and `resolve` for commands). This is a weak form of CQRS — separation at the method level but no separate model.
- **No Event Sourcing at all.** Flux has no event store. Feed items are fetched on every refresh (`loadFeed()` calls all sources). Nothing is cached or replayed.
- **No write model.** When a user clicks a video, the event goes straight to `window.dispatchEvent` — there's no command bus, no validation, no side-effect management.
- **The feed aggregation is a pull model (fan-out-on-read).** Every time the feed loads, each source is queried independently and results are merged client-side. This is fine at small scale but doesn't scale to many sources or many items.

### Recommendations

1. **Introduce a lightweight event store** using SQLite (via Tauri's `tauri-plugin-sql`). Each plugin emits events like `VideoDiscovered`, `AuthStateChanged`, `PlaybackStarted`. The feed read model is a projection built from these events.

2. **Separate commands from queries at the host level.** The Tauri host should expose:
   - `invoke("query", { port: "feed", params: {...} })` — read-only, no side effects
   - `invoke("command", { port: "player", command: "play", params: {...} })` — state-changing

3. **Use a hybrid feed model (push + pull):** For sources that have new content, push events into the event store. For historical/catch-up queries, pull from the API directly. The feed projection can merge both.

4. **Make the feed read model persistent.** Cache fetched items in SQLite so that subsequent loads show cached data immediately and refresh in the background (stale-while-revalidate pattern). This makes the app feel instant even when networks are slow.

---

## 4. The Kernel Pattern (Microkernel Architecture)

### The Pattern

The Microkernel Architecture (aka Plugin Architecture) consists of a **minimal core system** and **plug-in modules** that extend it. The core contains only what's necessary to make the system operational — bootstrapping, plugin lifecycle, the extension-point contracts. Everything else lives in plugins.

The analogy to operating system kernels is deliberate:
- **OS microkernel** (L4, Mach): only address spaces, threads, IPC. File systems, drivers, network stacks run as user-space processes.
- **Application microkernel:** only the plugin contract, lifecycle, and discovery mechanism. Features run as plugins.

Key principles:
- **Independent Plugin Principle:** No plugin depends on another plugin. The only dependency is the core-through-interface.
- **Standard Interface Principle:** One interface defines how the core uses all plugins in a given domain.
- **Domain Standard Interface Principle:** Each domain has its own standard interface.

Source: [O'Reilly — Microkernel Architecture (Software Architecture Patterns)](https://www.oreilly.com/library/view/software-architecture-patterns/9781491971437/ch03.html)
Source: [Sufficiently Advanced Technology — Microkernel Architecture](https://sufficiently-advanced.technology/post/architecture-patterns-microkernel)
Source: [University of Queensland — Microkernel Architecture (CSSE6400)](https://csse6400.uqcloud.net/handouts/microkernel.pdf)
Source: [MIT 6.828 — Microkernels (L4/Mach)](https://pdos.csail.mit.edu/6.828/2006/lec/l-mkernel.html)

### How Flux Does It

- **Good:** Flux's `lib.rs` is a minimal host — it discovers plugins, spawns processes, routes RPC. The core is ~317 lines of Rust.
- **Good:** The `plugin.json` manifest format is a uniform contract. Every plugin declares `name`, `methods`, `hooks`, `ui`, etc.
- **Violation: The core is not minimal enough.** `core-manifest` and `core-static` are backend plugins that could be built-in host services. Scanning plugin directories could be a host function rather than a plugin RPC call. Serving static files could be the Vite dev server's job (and already is in dev mode).
- **Violation: Plugins do depend on each other.** The feed-widget uses `window.__pluginRpc(authPlugin.name + ".login", {})` — it directly addresses another plugin by name. The player-modal finds the player provider by scanning manifests for `slots: ["video.player"]`. This is cross-plugin awareness that the kernel pattern forbids.
- **Violation: No explicit extension points.** The `hooks` field is stringly-typed. Any plugin can declare any hook string, and there's no validation that the hook exists or that the plugin's method signature matches what the hook consumer expects.

### Recommendations

1. **Shrink the core further.** Make `core-manifest`'s `scan` method a built-in function of the host, not a plugin. Make `core-static`'s `read` method a host function (or use Tauri's asset system). The only things that should be plugins are features that users can add/remove independently: feed sources, video players, auth mechanisms.

2. **Define explicit extension points in the core.** Instead of hooks being arbitrary strings, define them as typed contracts in shared code:
   ```typescript
   // In host, not in plugin
   export interface FeedExtensionPoint {
     name: "feed.video"
     fetch(): Promise<Video[]>
   }
   
   export interface AuthExtensionPoint {
     name: "yt-auth"
     status(): Promise<AuthStatus>
     login(): Promise<AuthResult>
     logout(): Promise<void>
   }
   ```

3. **Enforce the Independent Plugin Principle.** No plugin should ever import or reference another plugin by name. If a plugin needs functionality from another, it should go through a core-mediated extension point.

4. **Add plugin isolation and lifecycle management to the host.** Track plugin states (starting, running, failed, stopped). Add health checks. If a plugin crashes, the host should be able to restart it or mark it as degraded — and other plugins should never notice.

---

## 5. Plugin Architecture Patterns (Registry, Service Locator, Factory, Extension Object)

### The Pattern

From "Pattern-Oriented Software Architecture" (Buschmann et al.) and "Patterns of Enterprise Application Architecture" (Fowler):

- **Registry:** A global finder for objects/services that other objects need but can't navigate to directly. A well-known object that others use to locate dependencies.
- **Service Locator:** Like Registry but with lazy creation — it creates the service if it has a definition for it. Also considered an anti-pattern by many because it hides dependencies (Mark Seemann, et al.).
- **Plugin (Fowler):** Links classes during configuration rather than compilation. A central configuration mechanism that selects the right implementation at runtime based on environment.
- **Extension Object:** A pattern where the interface of a component can be extended with new services (extensions) without changing the component itself.
- **Factory:** Creates and returns objects but does not retain them.

Source: [Martin Fowler — Plugin (P of EAA)](https://martinfowler.com/eaaCatalog/plugin.html)
Source: [Paul M. Jones — Factories, Registries, and Service Locators](https://paul-m-jones.com/post/2013/12/02/quicker-easier-more-seductive-the-difference-between-factories-registries-and-service-locators/)
Source: [Stack Overflow — Registry vs Service Locator vs DI Container](https://stackoverflow.com/questions/27854298/registry-pattern-vs-service-locator-pattern-vs-dependency-injection-container)
Source: [Wikipedia — Service Locator Pattern](https://en.wikipedia.org/wiki/Service_locator_pattern)
Source: [MSDN — Best Practice: An Introduction To Domain-Driven Design](https://learn.microsoft.com/en-us/archive/msdn-magazine/2009/february/best-practice-an-introduction-to-domain-driven-design)

### How Flux Does It

- **Good:** Flux's `resolve_hook` and `call_hook` commands are a form of Service Locator. Given a hook name, the host locates the plugin that provides it.
- **Good:** The manifest discovery in `App.tsx :: init()` is a Registry pattern — it collects all manifests, then loads UI components by tag name.
- **Mixed:** The `CardRenderer` component in `feed-widget.tsx` uses `customElements.whenDefined(tag)` and `document.createElement(tag)` to instantiate card WCs. This is a form of the Factory pattern (the tag name is the product key), but it's duplicated across the feed-widget and player-modal.
- **Missing:** No central Plugin Registry object. The manifests array is passed around through WC property setters (`el.manifests = all`), but there's no singleton registry that provides typed access to plugins by capability.

### Recommendations

1. **Create a PluginRegistry service** in the frontend host:
   ```typescript
   class PluginRegistry {
     private manifests: PluginManifest[] = []
     
     register(manifest: PluginManifest) { this.manifests.push(manifest) }
     
     findPlugin(capability: string): PluginManifest | undefined
     getComponents(slot: string): string[]
     getCardForType(type: string): string | undefined
   }
   ```
   This centralizes the look-up logic that's currently duplicated in `feed-widget.tsx` (error banner auth plugin search) and `player-modal.tsx` (slot resolution).

2. **Build a proper Service Locator for the backend**, wrapping `resolve_hook`:
   ```typescript
   const services = new ServiceContainer()
   services.register("feed.video", async () => window.callHook("feed.video", "feed", {}))
   services.register("yt-auth", async () => window.callHook("yt-auth", "status", {}))
   
   // Usage
   const items = await services.get("feed.video")()
   ```

3. **Use the Plugin pattern explicitly for environment-based configuration.** When running in dev mode, load frontend WCs from Vite's dev server instead of from `core-static.read`. This avoids hardcoding the serving strategy.

4. **Add an Extension Object pattern for plugins that need to add capabilities at runtime.** A plugin could register new methods on an existing port without modifying the port's interface — e.g., a filter plugin could register `FeedExtension.beforeRender()`.

---

## 6. Dependency Injection in Plugin Systems

### The Pattern

Dependency Injection (DI) is the practice of providing a component's dependencies from outside rather than having the component create them itself. In plugin systems:

- The host defines a **Composition Root** where all dependencies are wired together.
- Plugins receive their dependencies through constructor injection or setter injection.
- A **DI Container** (like `Microsoft.Extensions.DependencyInjection` in .NET) manages lifetimes, resolution, and disposal.

The key insight from modern plugin systems: the **plugin contract** (shared interface) and the **DI wiring** are separate concerns. The host discovers plugins at runtime, registers their types with the container, and then consumers receive all implementations through `IEnumerable<T>`.

Source: [DevLeader — Plugin Architecture in C# (.NET)](https://www.devleader.ca/2026/04/07/plugin-architecture-in-c-the-complete-guide-to-extensible-net-applications)
Source: [Avalonia Docs — Implementing Dependency Injection](https://docs.avaloniaui.net/docs/app-development/dependency-injection)
Source: [Software Architecture Guild — Microkernel Monolith](https://software-architecture-guild.com/guide/architecture/styles/microkernel-monolith/)

### How Flux Does It

- **No DI at all.** The frontend uses no DI container. `App.tsx` creates the feed-widget element imperatively and sets `.manifests` directly. The feed-widget receives raw data but creates card WCs imperatively via `document.createElement`. There's no dependency resolution — everything is hardwired through property setters and global function calls.
- **The backend (`lib.rs`) also has no DI.** Plugins are spawned, their handles collected in a `Vec<PluginHandle>`, and accessed by name in a linear search. No abstraction layer separates the RPC routing from plugin discovery.
- **Good foundation:** The WC wrapper pattern (`_item` and `_manifests` setters) is a rudimentary form of property injection. The `customElements.define` wrapper auto-generated in `build-plugins.ts` creates a consistent constructor pattern. This could be extended into proper DI.

### Recommendations

1. **Add a lightweight DI container to the frontend.** Tiny libraries like `tsyringe` or `awilix` (or a minimal 50-line container) can provide:
   - Registration of plugin implementations by interface token
   - Constructor injection for plugin components
   - Lifecycle management (singleton vs. transient vs. scoped to feed load)

2. **Make the Composition Root explicit in `App.tsx`:**
   ```typescript
   const container = new Container()
   
   // Register host services
   container.register("rpc", { useValue: window.__pluginRpc })
   container.register("registry", { useClass: PluginRegistry })
   
   // Register discovered plugins by capability
   container.register("feed.providers", { useFactory: () => registry.findWithFeeds() })
   container.register("player.slot", { useFactory: () => registry.findSlot("video.player") })
   ```

3. **Inject dependencies into WC wrappers.** Instead of the feed-widget creating cards via `document.createElement`, have the container resolve card components with their dependencies already wired:
   ```typescript
   const card = container.resolve<HTMLElement>(tag)
   // card already has its rpc, manifests, etc. injected
   ```

4. **For backend plugins, inject a storage service** rather than having plugins write directly to the filesystem. The host could provide a `Storage` API that plugins receive on startup (via environment variable or a setup handshake), allowing the host to control where and how plugin data is persisted.

---

## 7. Graceful Degradation and Fallbacks

### The Pattern

Graceful degradation means a system continues to function — possibly with reduced capability — when some components fail. In plugin systems, this means:

- A failing plugin must not crash the host.
- A failing plugin must not prevent other plugins from working.
- Users must be informed about which plugins failed and why.
- The system should provide reasonable fallback behavior when a capability is missing.

The ISO 25010 quality model names this **fault tolerance** and **availability**. The Joplin issue tracker has real-world examples: a plugin that throws during startup can block the `startupPluginsLoaded` flag indefinitely, preventing all other plugins from working.

Source: [AuditBuffet — Incompatible plugins gracefully disabled](https://auditbuffet.com/patterns/ab-002093)
Source: [Joplin — Issue #12793: When a plugin fails to start, other plugins can behave unexpectedly](https://github.com/laurent22/joplin/issues/12793)
Source: [Joplin — PR #14577: Prevent a failing plugin from blocking other plugins](https://github.com/laurent22/joplin/pull/14577)

### How Flux Does It

- **Good:** The feed-widget already has partial failure handling. `Promise.allSettled` means one failing feed source doesn't block others. Per-source error banners show which plugin failed. The `safetyTimer` at 20s prevents a hanging plugin from blocking the feed forever.
- **Good:** The `feed-widget` shows a "Sign in" button when auth failure is detected. This is a graceful fallback — instead of a blank error, it guides the user toward recovery.
- **Bad:** There is no per-plugin loading isolation. If a plugin's frontend WC script throws during `customElements.define` or `connectedCallback`, the error can propagate into the host. There's no try/catch around WC creation.
- **Bad:** Plugin startup failures are silent. The Rust host logs `"failed to spawn plugin"` to stderr, but this never reaches the user. If `yt-auth` fails to load cookies, the feed simply has no content — the user sees "No feed sources" with no explanation.
- **Bad:** No safe mode. If a plugin causes a crash loop (like the Joplin PlantUML scenario), there's no way to start the app with plugins disabled.

### Recommendations

1. **Add plugin-level error boundaries in the frontend.** Each WC mount should be wrapped:
   ```typescript
   function mountPlugin(tag: string, container: HTMLElement, data: any) {
     try {
       const el = document.createElement(tag)
       el.item = data
       container.appendChild(el)
     } catch (e) {
       // Render an inline error placeholder
       container.innerHTML = `<div class="plugin-error">${tag} failed to load</div>`
     }
   }
   ```

2. **Surface plugin lifecycle errors to the UI.** The host should track plugin states and expose a `/health` or `/status` endpoint that the frontend can display. If `yt-feed` crashes, show a yellow banner: "YouTube feed is unavailable. Other feeds still work."

3. **Add a safe mode.** On startup, if a plugin has failed 3+ consecutive times, mark it as disabled and start without it. Provide a UI to re-enable it. Store crash counts in `tauri-plugin-store`.

4. **For the feed, implement stale-while-revalidate.** Cache the last successful feed fetch in SQLite. If a plugin fails, show cached data with a note: "YouTube feed is having trouble — showing cached results." This is far better than an error banner or empty state.

5. **Isolate plugin subprocess crashes.** If a plugin process dies, the Rust host should detect it (stdin write fails) and remove that plugin from the routing table. Future calls to that plugin should fail fast with "Plugin unavailable" rather than hanging for 15 seconds.

---

## 8. Lazy Loading and Code Splitting

### The Pattern

Lazy loading defers the loading of a module until it's actually needed. Code splitting divides a codebase into smaller chunks that can be loaded independently. In plugin systems:

- **Eager loading:** Load all plugins at startup (simple, but slow startup).
- **Lazy loading:** Load on first use (better startup time, slightly more complex).
- **On-demand:** Load only when explicitly requested (for heavy or rarely-used plugins).
- **Deferred:** Load after the initial bootstrap is complete (for non-critical features).
- **Parallel:** Load independent plugins concurrently (for I/O-bound loading like network requests).

Source: [ObjectStack — Plugin Loading Protocol spec](https://github.com/objectstack-ai/objectstack/blob/main/packages/spec/src/kernel/plugin-loading.zod.ts)
Source: [trae-op — Electron modular: Lazy Loading modules](https://github.com/trae-op/electron-modular?tab=readme-ov-file)

### How Flux Does It

- **Good:** Frontend WCs are loaded lazily through `core-static.read`. The `loaded` set prevents duplicate loads. Components are loaded only when they're needed (cards when feeds are present, modals when UI plugins declare them).
- **Good:** Backend plugin processes are spawned eagerly at startup (in `setup`), but they're lightweight Bun processes. The cost is ~1-2 seconds for all 7 processes.
- **Bad:** All frontend WCs are loaded during `init()` before any UI is rendered. The 5 WC bundles total ~800KB of JS that must be fetched, parsed, and executed before the user sees anything. Loading all of them eagerly defeats the purpose of code splitting.
- **Bad:** The `core-static.read` call is synchronous within the `for...of` loop — each WC is loaded sequentially. This could be parallelized.
- **Bad:** There's no chunking strategy. Each WC is a separate IIFE bundle with its own copy of React (160KB each). The build output at `build/plugins/feed-widget.js` is ~160KB, `yt-video-card.js` is ~156KB, etc. This means React is bundled 5 times.

### Recommendations

1. **Parallelize WC loading.** Load all WC scripts concurrently, not sequentially:
   ```typescript
   const tagPromises = tags.map(async tag => {
     const result = await window.__pluginRpc("core-static.read", { path: `build/plugins/${tag}.js` })
     const script = document.createElement("script")
     script.textContent = result.code
     document.body.appendChild(script)
     await customElements.whenDefined(tag)
   })
   await Promise.all(tagPromises)
   ```

2. **Defer non-critical plugins.** Components that are behind a user action (like the player-modal, which only opens when a video is clicked) don't need to be loaded at init. Load them in an `onInteraction` handler:
   ```typescript
   window.addEventListener("video.player.load", async () => {
     if (!loaded.has("player-modal")) {
       loaded.add("player-modal")
       await loadFrontend("build/plugins/player-modal.js")
     }
   }, { once: true })
   ```

3. **Extract React into a shared chunk.** In the Vite build config, mark `react` and `react-dom` as external IIFE dependencies loaded once. This would shrink each WC bundle from ~160KB to ~10-30KB. The build script already generates per-plugin IIFEs — adding a `shared` chunk that's loaded first would dramatically reduce total JS.

4. **Adopt loading strategies per plugin type:**
   - **UI plugins** (feed-widget, player-modal): eager (they define the app shell)
   - **Card plugins** (yt-video-card, peertube-card): lazy (loaded when feed sources are discovered)
   - **Backend-only plugins** (yt-auth, yt-search): on-demand (loaded only when their method is called)

5. **Prefetch high-probability plugins.** If the app detects that a YouTube cookie exists, prefetch the yt-video-card bundle in idle time after init.

---

## 9. Error Recovery and Resilience

### The Pattern

Resilience patterns for distributed systems, documented by Michael Nygard ("Release It!", 2007) and implemented in libraries like Resilience4j and Polly:

- **Timeout:** Never wait indefinitely for a response. Default to 2-5× the downstream p99.
- **Retry with backoff:** Retry transient failures with exponential backoff and jitter to avoid thundering herds.
- **Circuit Breaker:** Stop calling a failing service after a threshold of failures. Probe periodically (half-open state) to detect recovery.
- **Bulkhead:** Isolate resources per dependency so one failure doesn't exhaust the pool. Thread pools, semaphores, or connection pools per dependency.
- **Fallback:** Provide an alternative result when the primary path fails.

Source: [Resilience4j — GitHub (circuit breaker, retry, bulkhead)](https://github.com/resilience4j/resilience4j)
Source: [Silgi — Client plugins (retry, circuit breaker, timeout)](https://silgi.dev/docs/client-plugins)
Source: [HLD Handbook — Resilience Patterns: Timeouts, Retries, Circuit Breakers, Bulkheads](https://hld.handbook.academy/curriculum/reliability-and-operations/resilience-patterns/)
Source: [Resilience Patterns: Timeouts, Retries, Circuit Breakers, and Bulkheads — The HLD Handbook](https://hld.handbook.academy/curriculum/reliability-and-operations/resilience-patterns/)

### How Flux Does It

- **Good:** The feed widget has a 15s per-source timeout and a 20s safety timer. This prevents a single slow plugin from hanging the feed forever.
- **Good:** The Rust host has a 15s timeout on `plugin_request`. This means a hanging plugin process won't block an RPC call indefinitely.
- **Missing:** No retry logic. If `yt-feed.feed` returns a transient error (network blip, YouTube rate limit), the request fails immediately with no retry. Given that the feed is loaded on every refresh, transient failures are common.
- **Missing:** No circuit breaker. If a plugin process crashes, the Rust host still has its handle in the `plugins` vector. Subsequent calls to that plugin will fail with "stdin write error" or "broken pipe", but the slot is never cleaned up until app restart.
- **Missing:** No bulkhead isolation. All plugin calls share the same Rust async runtime. A slow plugin (e.g., 15s timeout) occupies a tokio task and a oneshot channel. With many slow plugins, this could exhaust the runtime's capacity.
- **Missing:** No fallback behavior. When `yt-feed.feed` fails, the feed widget shows an error banner. It doesn't attempt an alternative source, use cached data, or degrade gracefully.

### Recommendations

1. **Add retry with exponential backoff to the frontend RPC wrapper:**
   ```typescript
   async function callWithRetry(method: string, params: any, retries = 2): Promise<any> {
     for (let i = 0; i <= retries; i++) {
       try {
         return await window.__pluginRpc(method, params)
       } catch (e) {
         if (i === retries) throw e
         const delay = Math.min(1000 * Math.pow(2, i), 5000) + Math.random() * 500
         await new Promise(r => setTimeout(r, delay))
       }
     }
   }
   ```

2. **Implement a circuit breaker in the Rust host.** Track per-plugin failure counts. After N consecutive failures, mark the plugin as degraded and fail fast (immediately return error) without attempting the IPC. Periodically probe the plugin with a health check to see if it has recovered.

3. **Add bulkhead isolation at the frontend level.** Each feed source should have its own "slot" of execution. A slow source should not delay other sources:
   ```typescript
   const sourcePromises = feedSources.map(s => {
     const controller = new AbortController()
     const timeout = setTimeout(() => controller.abort(), 15000)
     // Each source runs independently
     return fetchFeed(s).finally(() => clearTimeout(timeout))
   })
   const results = await Promise.allSettled(sourcePromises)
   ```

4. **Implement plugin health monitoring in the Rust host.** Spawn a periodic health-check task that pings each plugin with a lightweight `ping` method. If a plugin doesn't respond in 5s, mark it as unhealthy, log, and notify the frontend.

5. **Design fallback chains.** If `yt-feed.feed` fails, try an alternative feed source (e.g., popular videos from a different PeerTube instance). If all sources fail, show cached data. If no cache exists, show the empty state with a meaningful message.

---

## 10. Configuration and State Persistence

### The Pattern

Desktop applications need to persist several kinds of state:
- **App preferences** (theme, language, window size): small key-value data, low write frequency.
- **Plugin state** (auth tokens, user preferences): per-plugin config data.
- **Session data** (feed cache, recent items): ephemeral data that improves UX if persisted.
- **Secrets** (API keys, OAuth tokens): encrypted-at-rest storage.

Common approaches ranked by complexity:
1. **JSON files** (via `tauri-plugin-store`): best for preferences and small state. Auto-save, debounced writes, atomic file operations.
2. **SQLite** (via `tauri-plugin-sql`): best for structured data with relationships. Indexes, transactions, queries.
3. **OS keychain** (via `tauri-plugin-stronghold` or OS-level credential APIs): best for secrets.
4. **LocalStorage / IndexedDB**: viable for web-target, but limits apply (5-10MB, synchronous access concerns).

Source: [Tauri — Store Plugin docs](https://v2.tauri.app/plugin/store/)
Source: [Codegiz — Tauri Patterns: Persist App State to Disk in Tauri 2](https://www.codegiz.com/blog/tauri-patterns-episode-5-persist-app-state-to-disk-in-tauri-2/)
Source: [Aptabase — Persistent State in Tauri Apps](https://aptabase.com/blog/persistent-state-tauri-apps)

### How Flux Does It

- **Minimal:** Flux persists almost nothing. There's no use of `tauri-plugin-store` or SQLite in the current codebase.
- **yt-auth plugin writes a cookie file directly** at `plugins/youtube/.youtube-cookie`. This is a flat file on disk, but it's stored inside the project directory, not in the OS-standard app data directory. On a real installation (outside dev), this path may not be writable or may be lost on update.
- **No persistent feed cache.** Every app restart triggers a full fetch from all sources. The `loadFeed()` function re-queries YouTube, PeerTube, etc. every time.
- **No user preferences storage.** There's no settings UI, no theme persistence, no "remember my feed sources" — the app always uses all available plugins.
- **No session recovery.** If the app crashes, there's no saved state to restore.

### Recommendations

1. **Integrate `tauri-plugin-store` for all preference data.** This should be registered in `lib.rs` and configured in capabilities. Use it for:
   - Window size/position
   - Selected feed sources
   - Last viewed state
   - Plugin enable/disable settings

2. **Move yt-auth's cookie to OS-standard app data.** Instead of `plugins/youtube/.youtube-cookie`, store it at `<app_data_dir>/auth/youtube-cookie`. The plugin should receive the storage path from the host (via environment variable or an initial handshake), not hardcode it relative to its own directory.

3. **Add SQLite for feed caching.** Use `tauri-plugin-sql` to create a local cache of feed items with TTL:
   ```sql
   CREATE TABLE feed_cache (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     title TEXT NOT NULL,
     channel TEXT,
     thumbnail TEXT,
     url TEXT NOT NULL,
     fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
     ttl INTEGER NOT NULL DEFAULT 300
   );
   ```
   On feed load: read cache first, show instantly, then refresh from network in background.

4. **Adopt the "one store per concern" pattern.** Have separate store files:
   - `settings.json` — app preferences
   - `plugins/<name>/state.json` — per-plugin persistent state
   - `feed-cache.json` (or SQLite) — cached feed items
   - `window-state.json` — window geometry

5. **Store plugin manifests in a registry file.** Use `tauri-plugin-store` to persist the list of discovered plugins. On startup, show the previously-working plugins immediately while the `core-manifest.scan` runs in the background. If scan fails (e.g., filesystem issue), the cached manifest allows the app to still function.

6. **Add a `__version` key to all stores.** This enables schema migration when the data format evolves. Without versioning, a changed store shape silently corrupts data.

---

## Summary: Key Architectural Improvements

| Area | Current State | Recommended |
|------|--------------|-------------|
| **Ports/Adapters** | Implicit protocol, plugin-by-name routing | Formal typed ports, host-routed by capability |
| **DDD** | No shared domain model, per-plugin data shapes | Core domain types, value objects, repositories per Bounded Context |
| **CQRS/Events** | Read+write mixed, no event store | Separate query/command paths, lightweight SQLite event store, materialized feed views |
| **Kernel** | ~317-line core, but plugins reference each other | Smaller core (built-in manifest/static), explicit extension point types, enforced plugin isolation |
| **Plugin Patterns** | Ad-hoc Registry via manifest array | Central PluginRegistry service, Service Locator for capabilities, Factory for WC instantiation |
| **DI** | None — hardwired through property setters | Lightweight DI container, Composition Root in App.tsx, injected dependencies for WCs |
| **Graceful Degradation** | Per-source error banners, but no isolation | Error boundaries per WC, plugin health tracking, stale-while-revalidate caching |
| **Lazy Loading** | Sequential WC loading at init | Parallel loading, on-demand for non-critical plugins, shared React chunk |
| **Resilience** | Timeouts only (15s per-source, 20s safety) | Retry with backoff, circuit breaker per plugin, health monitoring, fallback chains |
| **Persistence** | Cookie in project dir, no cache | tauri-plugin-store for prefs, SQLite for feed cache, OS-standard paths for auth |

---

*Research conducted 2026-07-26. Source URLs verified at time of writing. Some older sources may have been retrieved from the Internet Archive.*
