# Cross-Framework Shared State and Communication

**Date:** 2026-07-29
**Context:** Flux plugin architecture — plugins built with React, Vue, Svelte, Lit, or vanilla JS need to share state and communicate inside a single-page Tauri app. Each plugin compiles to a standalone Web Component (IIFE via Vite), with zero cross-plugin imports at runtime.

---

## Table of Contents

1. [Signals (TC39 proposal + library implementations)](#1-signals)
2. [Atoms (Jotai, Recoil, Zustand)](#2-atoms)
3. [Observables (RxJS)](#3-observables)
4. [Podium MessageBus](#4-podium-messagebus)
5. [BroadcastChannel API](#5-broadcastchannel-api)
6. [CustomEvents on window](#6-customevents-on-window)
7. [FDC3 Context Channels](#7-fdc3-context-channels)
8. [Shared Worker](#8-shared-worker)
9. [Observable Store pattern (Redux, Zustand, Pinia)](#9-observable-store-pattern)
10. [Comparison Matrix](#10-comparison-matrix)
11. [Recommendation for Flux](#11-recommendation-for-flux)

---

## 1. Signals (TC39 proposal + library implementations)

### Preact Signals (`@preact/signals-core`)

**Source:** <https://github.com/preactjs/signals/blob/main/packages/core/README.md>

The `@preact/signals-core` package is a framework-agnostic reactive primitive. It exports `signal()`, `computed()`, `effect()`, `batch()`, and `untracked()`.

```js
import { signal, computed, effect } from "@preact/signals-core";

const counter = signal(0);
const doubled = computed(() => counter.value * 2);

effect(() => console.log(counter.value));
counter.value = 1; // triggers effect
```

Key properties:

- **Framework-agnostic core:** The core package has zero framework dependencies. Framework integrations (`@preact/signals-react`, `@preact/signals-preact`, `@preact/signals-vue`) are separate packages that bridge the core to each framework's render cycle.
- **Lazy + eager hybrid:** Computed signals are lazy (pull-based) — they only re-evaluate when read. Effects are eager (push-based) — they run immediately when dependencies change.
- **Automatic dependency tracking:** Signals accessed inside `computed()` or `effect()` are automatically subscribed.
- **Glitch-free:** Topological sorting prevents intermediate stale values from propagating.
- **Subscriber counting:** Signals expose `watched`/`unwatched` callbacks, enabling lazy cleanup when no one is listening.
- **No serialization:** Signals share object references in-memory. No cloning or serialization.

**Cross-framework viability: HIGH.** A `signal()` created in the core package can be imported by any framework's integration. React reads `signal.value` via `useSignals()`, Vue reads it in a template via `.value`, Lit reads it in `render()`. The same signal object is shared by reference.

**Private state:** Each plugin creates its own signal instances. No other plugin can access them unless the reference is explicitly shared (e.g., published on a global registry).

### TC39 Proposal

**Source:** <https://github.com/tc39/proposal-signals>

Stage 1 proposal. Defines `Signal.State`, `Signal.Computed`, and `Signal.subtle.Watcher`.

```js
const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
```

Key design points:

- **Interoperability is the primary motivation.** Framework authors (Angular, Ember, MobX, Preact, Qwik, RxJS, Solid, Svelte, Vue) are collaborating on a common reactive core.
- Lazy evaluation, memoization, automatic dependency tracking.
- `Signal.subtle.Watcher` enables framework-level scheduling — the proposal deliberately omits `effect()` to leave scheduling to frameworks.
- `Signal.subtle.untrack()` for reading without subscribing (marked as unsafe).
- A polyfill exists at <https://github.com/proposal-signals/signal-polyfill>.

**Cross-framework viability: VERY HIGH (future).** If standardized, signals become a language-level primitive. Two plugins using different frameworks could subscribe to the same `Signal.State` if they share the reference. This would eliminate the version-mismatch problem entirely.

**Current status:** Stage 1. Several framework authors are experimenting with the polyfill. Not yet suitable for production as a cross-framework bridge.

### Solid Signals

Solid's `createSignal()` returns a getter/setter pair:

```js
const [count, setCount] = createSignal(0);
createEffect(() => console.log(count()));
```

Solid's signals are similar in semantics to Preact Signals (lazy computed, eager effects with automatic tracking). They are not designed to be used outside Solid's reactive root — you need `createRoot()` to use them standalone.

### Angular Signals

**Source:** <https://angular.dev/guide/signals>

```js
const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));
```

Angular's signals are deeply integrated with the framework's change detection. The `effect()` is tied to the injection context. Angular signals have `asReadonly()` for controlled exposure. They support `linkedSignal` for writable derived state.

**Cross-framework:** Angular signals cannot be used outside Angular without significant wrapper work. They require the Angular DI context for `effect()`.

### Summary: Signals cross-compatibility

| Implementation | Standalone core | React | Vue | Lit | Vanilla | Same object across frameworks? |
|---|---|---|---|---|---|---|
| Preact Signals Core | Yes (`@preact/signals-core`) | `@preact/signals-react` | `@preact/signals-vue` | Manual `.value` in render | Yes, via `.value` | Yes — same Signal object |
| TC39 polyfill | Yes (polyfill) | Not yet integrated | Not yet integrated | Not yet integrated | Yes | Yes (future) |
| Solid `createSignal` | Requires `createRoot` | No official bridge | No | No | With wrapper | No |
| Angular `signal()` | Requires DI context | No | No | No | No | No |

---

## 2. Atoms (Jotai, Recoil, Zustand)

### Jotai

**Source:** <https://jotai.org/docs/>, <https://github.com/pmndrs/jotai>

Jotai is a React-centric atomic state library (2kb). Atoms are declarative references to a slice of state:

```js
import { atom, useAtom } from 'jotai';
const countAtom = atom(0);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
}
```

**Framework dependency:** Jotai requires React. The `useAtom` hook is a React hook. While Jotai v2 has a `Store` API that can be used outside React:

```js
import { createStore } from 'jotai';
const store = createStore();
store.set(countAtom, 5);
store.get(countAtom); // 5
store.subscribe(countAtom, () => { ... });
```

The vanilla store is framework-agnostic. However, atoms are designed with React in mind (suspense, concurrent mode). The `atomWithBroadcast` utility (source: <https://jotai.org/docs/recipes/atom-with-broadcast>) wraps atoms with `BroadcastChannel` for cross-tab sync.

**Cross-framework viability:** The vanilla `createStore()` can be shared across frameworks — a Lit component can call `store.get(atom)` and `store.subscribe(atom, cb)`. But the ergonomics are worse than using a purpose-built cross-framework store.

**Private state:** Each plugin creates its own atoms. No access unless the atom reference is shared.

### Recoil

**Source:** <https://recoiljs.org/>

Recoil provides atoms and selectors with a React-only API. It requires `<RecoilRoot>` at the app root. Even more coupled to React than Jotai — there is no official vanilla API.

**Cross-framework:** Not viable outside React.

### Zustand

**Source:** <https://github.com/pmndrs/zustand>

Zustand provides a vanilla store that can be used with or without React:

```js
import { createStore } from 'zustand/vanilla';

const store = createStore((set) => ({
  bears: 0,
  increase: () => set((state) => ({ bears: state.bears + 1 })),
}));

// Vanilla usage — any framework:
store.getState();       // { bears: 0 }
store.subscribe(console.log);
store.setState({ bears: 3 });
```

In React:
```js
import { useStore } from 'zustand';
const bears = useStore(store, (s) => s.bears);
```

**Key properties:**

- **True vanilla core.** The `zustand/vanilla` import has zero React dependency. The API surface is `getState`, `setState`, `subscribe`, `destroy`, `getInitialState`.
- **Subscribe with selector:** `store.subscribe(selector, callback, options?)` — only fires when the selected slice changes.
- **Immer middleware** available for immutable updates.
- **Devtools integration** via `devtools()` middleware connects to Redux DevTools browser extension.
- **No serialization.** Objects are shared by reference.

**Cross-framework viability: VERY HIGH.** A single `createStore()` call creates a store that any framework can read/write/subscribe to. React uses `useStore(store, selector)`. Vue can use `store.subscribe()` in a `watchEffect`. Lit can call `store.getState()` in `render()` and `store.subscribe()` in `connectedCallback`.

**Private state:** Each plugin creates its own store. No cross-plugin leakage. The host can create a shared store and pass references to plugins.

---

## 3. Observables (RxJS)

**Source:** <https://rxjs.dev/guide/overview>, <https://rxjs.dev/api/index/class/Subject>

RxJS is the most mature reactive library in the JS ecosystem. Framework-agnostic by design.

```js
import { Subject } from 'rxjs';

const messageBus = new Subject();
messageBus.subscribe((msg) => console.log(msg));
messageBus.next({ type: 'VIDEO_SELECTED', payload: { id: 'abc' } });
```

Key building blocks for shared state:

- **`Subject`:** A multicast observable. Any subscriber receives values pushed via `.next()`. No initial value.
- **`BehaviorSubject`:** Like Subject but emits the current value to new subscribers. Ideal for shared state (e.g., "currently selected video").
- **`ReplaySubject`:** Replays N last values to new subscribers.
- **`scan` operator:** Accumulate state over time (Redux-like reducer pattern).
- **`shareReplay`:** Make a cold observable hot and cache the last value.

```js
import { BehaviorSubject } from 'rxjs';

const selectedVideo$ = new BehaviorSubject(null);

// Plugin A (React) writes:
selectedVideo$.next({ id: 'abc', title: 'My Video' });

// Plugin B (Vue) reads:
selectedVideo$.subscribe((video) => console.log(video));

// Plugin C (Lit) reads current value synchronously:
const current = selectedVideo$.getValue(); // BEHAVIORSUBJECT ONLY
```

**Cross-framework viability: VERY HIGH.** RxJS is framework-agnostic and has been for over a decade. Any framework can `subscribe()` and `next()`. React has `rxjs` + `useEffect` (or `observable-hooks`). Vue has `rxjs` + `watch`. Angular has native `| async` pipe and `toSignal()` interop.

**Private state:** Each plugin can create private `Subject` instances. No access without the reference.

**Lifetime management:** Subscriptions return `Unsubscribable` — call `.unsubscribe()` for cleanup.

**Performance:** Synchronous push-based notification. Cost is O(N) per emission where N is subscribers. For BehaviorSubject, `.getValue()` is O(1) synchronous read with zero allocation.

**Devtools:** RxJS DevTools extension exists. Time-travel debugging is possible with `scan`-based reducers.

---

## 4. Podium MessageBus

**Source:** <https://github.com/podium-lib/browser>, <https://podium-lib.io/docs/api/message-bus> (404 on current docs URL)

Podium is a micro-frontend framework from FINN.no. Its `@podium/browser` package includes a `MessageBus` for cross-microfrontend pub/sub.

The MessageBus is a simple event bus:

```js
import { MessageBus } from '@podium/browser';

const bus = new MessageBus();

// Subscribe
bus.subscribe('video.selected', (data) => {
  console.log('Video selected:', data);
});

// Publish
bus.publish('video.selected', { id: 'abc', title: 'My Video' });
```

**Framework dependency:** None. Pure JS pub/sub.

**Cross-framework viability:** HIGH. Podium MessageBus is designed for cross-microfrontend communication. The bus itself is just a JavaScript object with subscribe/publish methods. Any framework can use it.

**Limitations:**
- No typed channels (string-based topic names).
- No built-in state (last value) — it's pure event emission, not state storage.
- No subscription selector/filter — every subscriber gets every message on the topic.
- Topic naming conventions are the only form of namespacing.

**Private state:** No concept of private buses. You'd create separate `MessageBus` instances for private vs public communication.

---

## 5. BroadcastChannel API

**Source:** <https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel>
**Spec:** <https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts>

Browser-native pub/sub for same-origin contexts. Available since 2020 (Baseline 2022), also available in Web Workers.

```js
// Channel A (sends)
const channel = new BroadcastChannel('flux-video');
channel.postMessage({ type: 'SELECTED', id: 'abc' });

// Channel B (receives)
const channel = new BroadcastChannel('flux-video');
channel.onmessage = (event) => {
  console.log(event.data); // { type: 'SELECTED', id: 'abc' }
};
```

**Framework dependency:** None. Native browser API.

**Cross-framework viability:** HIGH for event-based communication. Any JS runtime (window, worker, iframe) can use it. But:

- **Same-origin only.** All plugins must be served from the same origin. For Flux (Tauri), this is fine — everything runs in one WebView.
- **No in-memory state sharing.** Messages are serialized via the structured clone algorithm. You cannot pass function references, getter/setter pairs, or prototype-bearing objects. Data is a snapshot.
- **No subscriber filtering.** Every subscriber on the channel receives every message.
- **No built-in last-value cache.** A late subscriber misses prior messages. You'd need to wrap with a stateful layer.
- **Synchronous delivery within same document** (the spec says messages are fired asynchronously via task queue).
- **Not available in ServiceWorker** (SW can post to clients but can't receive BroadcastChannel messages while not active).

**Use case for Flux:** Good for cross-window/iframe communication if Flux ever needs it. Within a single-page app, BroadcastChannel adds unnecessary serialization overhead vs. in-memory alternatives.

---

## 6. CustomEvents on `window`

**Current Flux approach.** Source: <https://dom.spec.whatwg.org/#interface-customevent>

```js
// Dispatch
window.dispatchEvent(
  new CustomEvent('video.player.load', {
    detail: { url: '...', title: '...' }
  })
);

// Listen
window.addEventListener('video.player.load', (e) => {
  const { url, title } = e.detail;
});
```

**Framework dependency:** None — native DOM API.

**Cross-framework viability:** HIGH for event signaling. Any framework can dispatch or listen.

**Known issues in Flux** (per AGENTS.md):
- **Event name mismatch:** Cards dispatch `player-load` but listeners expect `modal-load`/`modal-close`. No compile-time checking.
- **No state storage:** Events are fire-and-forget. A late subscriber misses the current selection state. Components must store their own copy.

**Pros:**
- Simple, zero-dependency, well-understood by all JS devs.
- Works across Shadow DOM boundaries with `composed: true`.
- `window` is a singleton — no import needed.

**Cons:**
- No type safety on `detail` — stringly-typed event names and arbitrary payloads.
- No subscriber filtering — every listener on `window` sees every event.
- No history/last-value — late subscribers are out of luck.
- Cannot be used in Web Workers (no DOM).
- Debugging requires manual `console.log` or browser event listener breakpoints.
- No devtools integration.

**Scalability concerns:**
- At N plugins with M events each, total event listeners on `window` = N × M. For Flux's current 7 modules, this is fine. For 50+ plugins, event namespace collisions become a real risk.
- The `detail` property carries a single `any` — no structured schema.

---

## 7. FDC3 Context Channels

**Source:** <https://fdc3.finos.org/docs/next/agent-bridging/context-channels>

FDC3 (Financial Desktop Connectivity and Collaboration Consortium) defines a standard for desktop application interoperability. Its context channel system is designed for exactly the kind of cross-app state sharing Flux needs.

**How it works:**

1. **Channels:** Named communication lanes (e.g., "fdc3.channel.1"). Apps join a channel.
2. **Context:** Structured data objects with a `type` property identifying the schema (e.g., `{"type": "fdc3.instrument", "id": {"ticker": "AAPL"}}`).
3. **Broadcast:** `channel.broadcast(context)` — sends context to all other apps on the channel.
4. **Subscribe:** `channel.addContextListener("fdc3.instrument", handler)` — listens for specific context types.
5. **Intent resolution:** Apps declare intents they can handle. The desktop agent routes intent calls to the right app.

**Framework dependency:** FDC3 defines an API surface, not a specific library. An FDC3-compatible "desktop agent" provides the implementation. There are browser-based implementations (like Finsemble, Glue42, or the FDC3 reference implementation).

**Cross-framework viability:** HIGH conceptually, but requires an FDC3 desktop agent to be running. For a standalone Electron/Tauri app, you'd need to implement the FDC3 API surface yourself.

**Key design patterns worth adopting:**
- **Context type schemas:** Data is wrapped in a `{ type, id, ... }` envelope. Consumers filter by type.
- **Channel isolation:** Apps on different channels don't see each other's state.
- **Channel app member tracking:** The desktop agent knows which apps are on each channel.
- **Intent-based routing:** Instead of direct event dispatch, apps declare capabilities (e.g., `"video.play"`) and the system routes requests.

**Relevant for Flux:** The context+channel pattern is directly applicable. Flux could define context types like `flux.video` with a standard schema. Plugins subscribe by type, not by raw event name.

---

## 8. Shared Worker

**Source:** <https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker>

A SharedWorker is a JavaScript thread shared across multiple browsing contexts (windows, iframes, tabs) of the same origin.

```js
// Main thread
const worker = new SharedWorker('state-worker.js');
worker.port.postMessage({ type: 'GET_VIDEO' });
worker.port.onmessage = (e) => console.log(e.data);

// worker.js
const connections = [];
onconnect = (e) => {
  const port = e.ports[0];
  connections.push(port);
  port.onmessage = (event) => {
    // Broacast to all connections
    connections.forEach(c => c.postMessage(event.data));
  };
};
```

**Framework dependency:** None — native browser API.

**Cross-framework viability:** HIGH for multi-window scenarios. Within a single-page app, a SharedWorker adds unnecessary complexity — same-process in-memory state is simpler.

**Pros:**
- Truly isolated runtime — plugins cannot interfere with each other's global scope.
- Survives page navigation (as long as one tab keeps a reference).
- Can hold state without risk of DOM manipulation.
- Structured clone serialization for message passing.

**Cons:**
- Structured clone means no function references, no getters/setters, no prototypes.
- Communication is async (postMessage).
- SharedWorker is not available in all environments (not in Web Workers, requires same origin).
- Debugging is harder (dedicated devtools panel, `chrome://inspect/#workers`).
- For single-page app (Tauri), a SharedWorker is overkill and adds latency to every state read/write.

**Use case for Flux:** Not recommended for the current single-page architecture. If Flux ever supports multiple windows or iframes, SharedWorker becomes compelling.

---

## 9. Observable Store pattern (Redux, Zustand, Pinia)

The Observable Store pattern is a unidirectional data flow architecture: actions → store → subscribers → UI updates.

### Redux

**Source:** <https://redux.js.org/>

```js
import { createStore } from 'redux';

function reducer(state = { video: null }, action) {
  switch (action.type) {
    case 'SELECT_VIDEO': return { ...state, video: action.payload };
    default: return state;
  }
}

const store = createStore(reducer);
store.subscribe(() => console.log(store.getState()));
store.dispatch({ type: 'SELECT_VIDEO', payload: { id: 'abc' } });
```

Redux core is framework-agnostic. `react-redux` provides React bindings. The store is a plain JS object with `getState()`, `dispatch()`, `subscribe()`.

### Pinia (Vue)

**Source:** <https://vuejs.org/guide/scaling-up/state-management.html#pinia>

```js
import { defineStore } from 'pinia';

export const useVideoStore = defineStore('video', {
  state: () => ({ current: null }),
  actions: {
    select(video) { this.current = video; },
  },
});
```

Pinia requires Vue's reactivity system. Cannot be consumed by non-Vue code without wrapping.

### Cross-framework viability

| Store | Standalone core | React | Vue | Lit/Vanilla |
|---|---|---|---|---|
| Redux | Yes (`redux`) | `react-redux` | `vue-redux` | subscribe/getState |
| Zustand | Yes (`zustand/vanilla`) | `useStore` hook | `store.subscribe()` in watch | subscribe/getState |
| Pinia | No (requires Vue reactivity) | No | Yes | No |

**Observation:** The `{ getState, subscribe, dispatch/setState }` interface is the universal store pattern. Any store that exports these three primitives can be consumed by any framework. Zustand's vanilla API is the cleanest instantiation of this pattern for cross-framework use.

---

## 10. Comparison Matrix

| Pattern | Framework req? | Reactivity | Data shape | Cross-framework | Private state | Debugging | Performance (N subs) |
|---|---|---|---|---|---|---|---|
| **Preact Signals Core** | None | Lazy computed + eager effect | Any JS value (by ref) | Yes (via core) | Yes (scoped instances) | Devtools extension | O(N) push, lazy pull avoids work |
| **TC39 Signals** (future) | None | Lazy computed + push watcher | Any JS value (by ref) | Yes (future native) | Yes | Browser DevTools potential | O(N) push |
| **Zustand Vanilla** | None | Eager push on setState | Any JS value (by ref) | Yes | Yes (store per plugin) | Redux DevTools | O(N) push with selector filtering |
| **Jotai vanilla store** | React for hooks; vanilla store ok | Eager push on atom write | Any JS value (by ref) | Partial (vanilla store) | Yes | Redux DevTools | O(N) push |
| **RxJS Subject** | None | Eager push on .next() | Any JS value (by ref) | Yes | Yes (private Subjects) | RxJS DevTools | O(N) push + operator overhead |
| **Podium MessageBus** | None | Eager push | Any JS value (by ref) | Yes | Manual (separate bus) | Custom | O(N) push |
| **BroadcastChannel** | None | Async push (task queue) | Structured clone | Yes (same origin) | No (global) | Browser devtools | O(N) async |
| **CustomEvent on window** | None | Sync push during dispatch | Structured clone (detail) | Yes | No (global) | Manual | O(N) sync + propagation cost |
| **FDC3 Channels** | None (protocol) | Push on context broadcast | Typed context objects | Yes (with agent) | Channel isolation | FDC3 devtools | O(N) push |
| **SharedWorker** | None | Async postMessage | Structured clone | Yes (same origin) | Yes (worker scoped) | Chrome://inspect | O(N) async + serialization |
| **Redux** | None (core) | Eager push on dispatch | Any JS value (by ref) | Yes | Yes (compose reducers) | Redux DevTools + time travel | O(N) push |
| **Pinia** | Vue reactive system | Vue reactivity | Any (Vue reactive proxies) | No | Yes | Vue DevTools | Vue reactivity cost |

---

## 11. Recommendation for Flux

### Requirements recap

1. Plugin A (React 18) and Plugin B (Vue 3) both read/write "selected video" state
2. Plugin C (Lit, no framework) subscribes without importing React or Vue
3. Each plugin has private state invisible to others
4. Host can inspect/debug all state
5. No plugin depends on another plugin's framework version

### Proposed architecture: Zustand Vanilla + RxJS Bridge

**Layer 1 — Global shared stores (Zustand vanilla)**

A single Zustand vanilla store serves as the shared state bus. The host creates it and exposes its API on `window.__fluxStore`:

```js
// In App.tsx (host):
import { createStore } from 'zustand/vanilla';

const fluxStore = createStore((set) => ({
  selectedVideo: null,
  playerState: 'idle',
  // ... other shared state slices
}));

// Expose for all plugins
window.__fluxStore = {
  getState: fluxStore.getState,
  setState: fluxStore.setState,
  subscribe: fluxStore.subscribe,
};
```

Plugin A (React) reads via Zustand's `useStore`:
```js
import { useStore } from 'zustand';
const video = useStore(window.__fluxStore, (s) => s.selectedVideo);
```

Plugin B (Vue) subscribes in a reactive way:
```js
import { watch } from 'vue';
const state = reactive({ video: window.__fluxStore.getState().selectedVideo });
watch(() => window.__fluxStore.getState().selectedVideo, (val) => {
  state.video = val;
});
```

Plugin C (Lit) subscribes directly:
```js
class MyCard extends LitElement {
  connectedCallback() {
    this._unsub = window.__fluxStore.subscribe(
      (s) => s.selectedVideo,
      (video) => this.requestUpdate()
    );
  }
  disconnectedCallback() { this._unsub?.(); }
}
```

**Layer 2 — Event bus (RxJS Subject)**

For transient events (not state) — toasts, notifications, modal open/close — use an RxJS Subject:

```js
window.__fluxEvents = new Subject();
// window.__fluxEvents.next({ type: 'SHOW_TOAST', message: '...' });
// window.__fluxEvents.subscribe((event) => ...);
```

**Layer 3 — Private plugin stores**

Each plugin creates its own Zustand store for internal state:

```js
// Inside plugin initialization:
window.__pluginStores = window.__pluginStores || {};
window.__pluginStores['yt-feed'] = createStore((set) => ({
  feedItems: [],
  isLoading: false,
  // ... plugin-private state
}));
```

The host can inspect all stores via `window.__pluginStores`.

### Why not the other patterns?

| Rejected pattern | Reason |
|---|---|
| **CustomEvents alone** | No last-value cache, no type safety, no devtools, hard to debug at scale |
| **BroadcastChannel** | Unnecessary serialization within same process; async adds latency |
| **SharedWorker** | Overkill for single-page app; async communication adds latency |
| **Jotai/Recoil** | React-only at core; vanilla store is an afterthought |
| **TC39 Signals** | Not yet standardized; polyfill lacks production maturity |
| **Preact Signals Core** | Viable candidate, but less ecosystem tooling than Zustand (Redux DevTools) |
| **Pinia** | Vue-only; no non-Vue consumption |
| **FDC3** | Requires implementing a desktop agent; overengineered for current scope |

### Why Zustand?

1. **Smallest API surface:** `getState()`, `setState()`, `subscribe()` — everything any framework needs.
2. **Redux DevTools:** Built-in `devtools` middleware gives time-travel debugging, action logging, state inspection out of the box.
3. **Selector-based subscriptions:** Subscribers can filter to only the slice they need, avoiding unnecessary callback invocations.
4. **True vanilla core:** `zustand/vanilla` has zero framework dependencies. No React, no Vue, no Proxy magic.
5. **Proven in production:** 58k+ stars on GitHub, maintained by pmndrs, used in large-scale apps.
6. **No serialization:** Objects are shared by reference, not cloned. Zero overhead for cross-plugin reads.

### Debugging

```js
// Host exposes a debug panel:
window.__fluxDebug = {
  getGlobalState: () => fluxStore.getState(),
  getPluginState: (name) => window.__pluginStores?.[name]?.getState(),
  dispatch: (action) => fluxStore.setState(action),
};
```

With `devtools` middleware, all state changes appear in Redux DevTools Extension:

```js
import { devtools } from 'zustand/middleware';

const fluxStore = createStore(
  devtools((set) => ({
    selectedVideo: null,
    // ...
  }), { name: 'Flux Global Store' })
);
```

### Event name type safety (preventing the "player-load" vs "modal-load" bug)

Define event types as const objects:

```js
// shared/events.js — imported by all plugins at build time
export const FluxEvents = {
  VIDEO_SELECT: 'flux.video.select',
  VIDEO_PLAY: 'flux.video.play',
  MODAL_SHOW: 'flux.modal.show',
  MODAL_HIDE: 'flux.modal.hide',
} as const;

export interface VideoSelectPayload {
  id: string;
  title: string;
  url: string;
}
// Runtime: store.setState({ selectedVideo: payload });
```

The Zustand store schema serves as the single source of truth. Plugins that mutate the wrong field or pass the wrong shape get feedback from TypeScript.

### Migration path from current CustomEvents

1. Add Zustand vanilla store in the host (`App.tsx`).
2. Expose `window.__fluxStore` (same global bridge pattern as existing `__pluginRpc`).
3. Add a Zustand subscriber that dispatches equivalent CustomEvents for backwards compatibility.
4. Migrate plugins one at a time to read from `__fluxStore` instead of CustomEvents.
5. Remove the CustomEvent bridge once all plugins are migrated.

### Result

The simplest architecture that satisfies all requirements is:

```
window.__fluxStore                     # Zustand vanilla store (shared state)
window.__fluxEvents                    # RxJS Subject (transient events)
window.__pluginStores[pluginName]      # Per-plugin Zustand stores (private state)

Host:
  - Creates __fluxStore with shared state schema
  - Can inspect __fluxStore + __pluginStores
  - Redux DevTools for time-travel / action replay

Plugin A (React):
  - useStore(__fluxStore, selector) for reads
  - __fluxStore.setState() for writes
  - Private state in __pluginStores['pluginA']

Plugin B (Vue):
  - __fluxStore.subscribe() or reactive wrapper
  - __fluxStore.setState() for writes
  - Private state in __pluginStores['pluginB']

Plugin C (Lit):
  - __fluxStore.subscribe() in connectedCallback
  - __fluxStore.getState() for synchronous reads
  - Private state in __pluginStores['pluginC']
```

No plugin imports or depends on another plugin's framework. The shared state interface is three functions: `getState`, `setState`, `subscribe`. Everything else is plugin-specific and invisible.