# Research: Web Components & Framework Independence for Frontend Plugins

**Date:** 2026-07-29
**Context:** Flux plugin system — plugins are Web Components loaded at runtime, compiled from various frameworks into IIFE bundles, communicating via DOM CustomEvents.

---

## 1. Custom Elements API — Stability & Backward Compatibility

### Spec guarantee

The Custom Elements spec is part of the HTML Living Standard (WHATWG), which does not have versioned releases. The spec evolves incrementally but **never removes or breaks existing APIs**. The `customElements.define()` method signature has been stable since the initial implementation shipped in Chrome 54, Safari 10.1, Firefox 63 (2016–2018).

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#custom-elements-api

### Validation rules are stable

`customElements.define()` enforces:
- Name must contain a hyphen (`-`)
- Name must start with ASCII lower alpha
- No ASCII upper alphas in name
- Name must not be one of the reserved hyphenated SVG/MathML names (`annotation-xml`, `color-profile`, `font-face`, etc.)

These rules have not changed since the spec was standardized.

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name

### Lifecycle callbacks are stable

Five lifecycle callbacks are defined in the spec and implemented uniformly across browsers:

| Callback | Trigger |
|----------|---------|
| `connectedCallback` | Element inserted into a document's DOM |
| `disconnectedCallback` | Element removed from the document's DOM |
| `adoptedCallback` | Element moved to a new document |
| `attributeChangedCallback` | Observed attribute added/removed/changed |
| `connectedMoveCallback` | (Newer) Element moved within same document without disconnect |

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-reactions

### Future-proofing

A `customElements.define()` call from 2024 will work on a browser from 2028 because:
1. WHATWG Living Standard never removes features — only adds.
2. The API surface (`define`, `get`, `whenDefined`, `upgrade`, `getName`, `initialize`) is frozen.
3. Browser engines (Chromium, WebKit, Gecko) treat Web Components as a strategic platform feature — none have signaled deprecation.

### Scoped registries (recent addition, 2024+)

`new CustomElementRegistry()` creates scoped registries, enabling isolated element definitions per DOM subtree. This is additive, not breaking.

```js
const scoped = new CustomElementRegistry();
scoped.define("my-element", MyElement);
const el = document.createElement("my-element", { customElementRegistry: scoped });
```

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#scoped-custom-element-registries

---

## 2. Shadow DOM Isolation — What It Does and Doesn't Do

### What Shadow DOM isolates

- **CSS:** Styles inside shadow root do not leak out; page styles do not leak in. This is the primary isolation mechanism.
- **DOM:** `document.querySelector`, `element.children`, `innerHTML` etc. do not traverse into shadow trees (unless `mode: "open"` and accessed via `element.shadowRoot`).
- **Event target retargeting:** Events crossing the shadow boundary have their `target` retargeted to the shadow host, preventing internal element references from leaking.

### What Shadow DOM does NOT isolate

- **JavaScript scope:** Shadow DOM does not create a separate JavaScript realm. Variables, prototypes, and closures are shared. Security relies on the standard same-origin policy, not shadow boundaries.
- **Network:** Fetch, WebSocket, Service Worker, etc. are unaffected by shadow roots.
- **JavaScript execution:** Code inside shadow DOM runs in the same main thread / worker as the page.
- **Event dispatch for composed events:** Events with `composed: true` (e.g., `click`, `keydown`, custom events with `composed: true`) bubble past shadow boundaries.

### Mode: open vs closed

- `open`: `element.shadowRoot` is accessible from external JS. You can traverse into the shadow tree.
- `closed`: `element.shadowRoot` returns `null`. However, this is not a security mechanism — it can be circumvented via `Event.composedPath()`, browser extensions, or mutation observers.

**Source:** https://dom.spec.whatwg.org/#shadow-trees
**Source:** https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM

### Attribute inheritance

Shadow tree and `<slot>` elements inherit `dir` and `lang` attributes from the shadow host automatically.

**Source:** https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM#attribute_inheritance

---

## 3. Custom Elements Registry — Limitations & Behavior

### Cannot re-define a tag

If a name is already registered, `define()` throws `NotSupportedError`:

```
customElements.define("my-el", A);
customElements.define("my-el", B); // NotSupportedError
```

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#the-customelementregistry-interface (define method steps, step 4)

### Can upgrade elements after page load

The `upgrade()` method forces upgrade on disconnected elements. The `initialize()` method associates a scoped registry with a DOM subtree.

Elements are auto-upgraded when they become connected (inserted into DOM).

**Key behavior:** Only connected elements get upgraded. An element created via `document.createElement` but not yet connected stays as `HTMLElement` until appended.

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#upgrades

### Conflict resolution with two scripts

Both scripts get `NotSupportedError`. There is no "last writer wins" — the first `define()` call wins. Solutions:

- **Scoped registries:** Each script uses `new CustomElementRegistry()` with `initialize()` to scope to its own DOM subtree.
- **Defensive check:** `if (!customElements.get('my-el')) customElements.define('my-el', MyEl)`
- **Build-time namespacing:** Use prefix conventions like `yt-video-card`, `peertube-card`.

### `disabledFeatures` static property

A constructor can expose `static disabledFeatures = ["internals", "shadow"]` to prevent `attachInternals()` or `attachShadow()` from being called on instances.

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-definition

---

## 4. HTML Imports — Deprecated, Replaced

### Status

HTML Imports (`<link rel="import">`) were proposed as part of the original Web Components v0 spec, then deprecated. Chrome shipped them in 2014 and removed support in Chrome 80 (2020). Safari and Firefox never shipped them.

### Replacements

| Need | Replacement |
|------|-------------|
| Import HTML templates | ES Modules (`import`), `<template>` with `shadowrootmode` (DSD) |
| Import styles | `@import` in CSS, `CSSStyleSheet` + `adoptedStyleSheets`, `<link>` in shadow DOM |
| Import components | ES Modules, import maps |
| Bundle components | Vite/Rollup/Webpack compile WCs into single IIFE/ESM bundle |

**Source:** https://developer.mozilla.org/en-US/docs/Web/Web_Components/HTML_Imports (deprecated)

### Import maps

Import maps (`<script type="importmap">`) enable bare specifier resolution in the browser:

```json
{
  "imports": {
    "lit": "https://cdn.example/lit@3.0.0/index.js"
  }
}
```

This replaces the module resolution step that HTML Imports once served.

---

## 5. Declarative Shadow DOM (DSD)

### What it enables

Before DSD, Shadow DOM could only be created imperatively:
```js
const shadow = host.attachShadow({ mode: "open" });
```

DSD allows server-rendered HTML to include shadow roots:
```html
<host-element>
  <template shadowrootmode="open">
    <style>...</style>
    <slot></slot>
  </template>
  <h2>Light content</h2>
</host-element>
```

### What this enables that wasn't possible before

1. **Server-side rendering (SSR)** of Shadow DOM — no FOUC, no client-side JS required for initial render.
2. **Streaming** — parser attaches shadow roots as the HTML stream arrives.
3. **No-JS fallback** — custom elements with DSD render fully even without JavaScript (their content is visible).
4. **Progressive enhancement** — component class upgrade adds interactivity; layout/style is already in place.

### Parser-only restriction

DSD is a parser feature. Setting `shadowrootmode` on a template via JS after parsing does nothing. Only `setHTMLUnsafe()` / `parseHTMLUnsafe()` can create DSD programmatically.

### Browser support

Baseline Newly available as of August 2024 (Chrome 111+, Edge 111+, Firefox 123+, Safari 16.4+). Polyfill available.

**Source:** https://developer.chrome.com/docs/css-ui/declarative-shadow-dom
**Source:** https://html.spec.whatwg.org/#parsing-main-inhead:attr-template-shadowrootmode
**Source:** https://developer.mozilla.org/en-US/docs/Web/API/HTMLTemplateElement/shadowRootMode

---

## 6. ElementInternals

### What it provides

`ElementInternals` is obtained via `this.attachInternals()` in a custom element constructor.

| Property/Method | Purpose |
|----------------|---------|
| `shadowRoot` | Returns existing declarative shadow root |
| `form` | The `<form>` element this element belongs to |
| `states` | `CustomStateSet` for `:state()` pseudo-class |
| `willValidate` | Whether element participates in form validation |
| `validity` | `ValidityState` object |
| `validationMessage` | Validation message string |
| `labels` | Associated `<label>` elements |
| `setFormValue(value, state?)` | Set form submission value |
| `setValidity(flags, message?, anchor?)` | Set validity state |
| `checkValidity()` / `reportValidity()` | Validation triggers |
| `role` | Default ARIA role |
| `aria*` properties | All ARIA attributes reflected |

### Requirements

- Element must have `static formAssociated = true` to use `attachInternals()`.
- Constructor can opt out via `static disabledFeatures = ["internals"]`.

### Key enabled patterns

1. **Form participation:** Custom elements can submit values with `<form>`, participate in `form.elements`, and trigger `formdata` events.
2. **Constraint validation:** Custom elements can report validation errors natively via `ValidityState`.
3. **Accessibility defaults:** Set default `role` and ARIA states that users can override.
4. **Custom states**: `:state(checked)` pseudo-class for styling custom states.

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#the-elementinternals-interface
**Source:** https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals

---

## 7. Cross-Framework Web Component Compilation

### Lit

- **The gold standard.** Every Lit component IS a web component by definition.
- `LitElement` extends `HTMLElement`, uses Shadow DOM by default, reactive properties reflect to attributes.
- Runtime: ~5KB min+gzip.
- **Limitation:** Properties don't auto-reflect to attributes unless configured with `reflect: true`.

**Source:** https://lit.dev/docs/

### Vue

- `defineCustomElement()` wraps any Vue component as a CE. Props become element properties; emits become CustomEvents; slots use native `<slot>`.
- SFCs can use `.ce.vue` extension for custom element mode — CSS is inlined into shadow root.
- ~16KB baseline runtime per component (Vue's runtime).
- **Limitations:** No scoped slots across CE boundary; Provide/Inject only works between Vue CEs; SSR via shadow DOM is challenging.
- `configureApp` callback allows app-level config (error handlers, etc.).

**Source:** https://vuejs.org/guide/extras/web-components

### Svelte

- Compile with `customElement: true` — `svelte:options customElement="my-element"`.
- The `<svelte:options>` object supports `tag`, `shadow` ("none"/"open"/`ShadowRootInit`), `props` (attribute/reflect/type config), and `extend` (custom element class extension for `ElementInternals`).
- Styles are inlined as JS strings into the component (not extracted as .css).
- **Limitations:** Slotted content renders eagerly (not lazily like Svelte's own `<slot>`). Context does not cross CE boundaries. Server-side rendering is not suitable (shadow DOM invisible until JS loads). Properties starting with `on` are treated as event listeners.
- The `$host` rune provides access to the host element inside the component.

**Source:** https://svelte.dev/docs/custom-elements

### Angular

- `@angular/elements` package provides `createCustomElement(Component, {injector})` — returns an `NgElement` constructor that extends `HTMLElement`.
- Inputs → element attributes (dash-case). Outputs → CustomEvents with `detail` payload.
- Built-in change detection and DI scope.
- **Limitation:** ~17KB+ baseline for Angular runtime. Danger of double instantiation if component selector matches the CE tag name.
- TypeScript typings via `HTMLElementTagNameMap` augmentation.

**Source:** https://angular.dev/guide/elements

### Preact

- **No explicit CE authoring from Preact** — Preact renders CEs declaratively in JSX: `<x-foo prop={value} />`.
- Uses runtime heuristic: if the element defines a property setter, use property; otherwise attribute.
- Event handlers: unrecognized `on*` props on DOM elements are registered as event listeners with exact casing preserved.
- `preact-custom-element` (separate library) wraps Preact components as CEs.

**Source:** https://preactjs.com/guide/v10/web-components

### Solid

- JSX for CEs works natively: `<my-el prop={value} />`.
- Uses `prop:` namespace for explicit property binding: `<my-el prop:someProp={value} />`.
- Custom events use `on:` namespace: `<div on:my-custom-event={handler} />`.
- 100% on Custom Elements Everywhere tests.

**Source:** https://custom-elements-everywhere.com/#solid

### Summary of framework limitations

| Framework | Runtime size | SSR support | Notes |
|-----------|-------------|-------------|-------|
| Lit | ~5KB | yes (labs) | Best for WC-first dev |
| Vue | ~16KB | limited | Scoped slots lost across boundary |
| Svelte | ~0KB (compiled) | no | Eager slots, no cross-CE context |
| Angular | ~17KB+ | yes | Heavy, careful with tag naming |
| Preact | ~4KB | yes | Consumer-only, not authoring |
| Solid | ~0KB (compiled) | yes | `prop:` / `on:` namespaces |

**Source:** https://custom-elements-everywhere.com/

---

## 8. Performance — WC-heavy Apps vs Framework-Native

### Overhead per component

- **Custom Element instantiation** cost is negligible — it is a native `HTMLElement` constructor call plus lifecycle callbacks.
- **Shadow DOM attachment** has a one-time cost — creating a `ShadowRoot` and adopting stylesheets. This is comparable to mounting a framework component's vnode tree.
- **Constructable Stylesheets** (`adoptedStyleSheets`) are shared across instances — the browser parses the CSS once. This is more efficient than per-instance `<style>` elements.

### Framework-native vs WC overhead

| Factor | WC-heavy app | Framework-native |
|--------|-------------|-----------------|
| Element creation | Native (fast) | Virtual DOM + reconciliation |
| Style isolation | Native Shadow DOM CSS scoping | CSS-in-JS, CSS modules, or scoped attributes |
| Inter-component communication | DOM events (dispatch + listen) | Framework messaging (props, store, context) |
| Bundle size per component | ~5-160KB (depends on framework IIFE) | Framework runtime shared across components |

### Key findings

1. **Lit CEs are faster than React/Vue components** for initial render because there is no vdom diff — Lit's template system updates only the dynamic parts.
2. **150+ CEs on a page** with Shadow DOM can slow down initial page load due to per-shadow-root style scoping overhead — but adoptedStyleSheets mitigates this.
3. **The bottleneck is JS bundle size, not CE overhead.** A 160KB React IIFE per component (current Flux build output) is the real cost.
4. **DSD + hydration** removes the JS bottleneck for initial paint, since the server renders the shadow tree.

---

## 9. Known Patterns for WC + Framework Integration

### Adopted stylesheets

Share a `CSSStyleSheet` across multiple shadow roots:
```js
const sheet = new CSSStyleSheet();
sheet.replaceSync(":host { display: block; }");
shadow.adoptedStyleSheets = [sheet];
```

This is more performant than `<style>` elements because the browser parses once.

### Event retargeting across shadow boundary

Events with `composed: true` cross shadow boundaries. The `target` is retargeted to the shadow host:
- Dispatch: `this.dispatchEvent(new CustomEvent('my-event', { bubbles: true, composed: true, detail: data }))`
- Listen on host: `host.addEventListener('my-event', handler)` — `event.target` is the host, not the internal element.
- Use `event.composedPath()` to traverse to the actual dispatching element.

### Slot fallback content

Slots support default content when nothing is assigned:
```html
<slot name="title">Default title</slot>
```

### Manual slot assignment (newer)

`HTMLSlotElement.assign()` enables dynamic slot assignment without `slot` attributes:
```js
const slot = shadowRoot.querySelector('slot');
slot.assign(element1, element2); // replaces assigned nodes
```

### Listening for multiple WC events on window

In Flux's feed-widget pattern, cards dispatch events on `window` to decouple from the host framework:
```js
window.dispatchEvent(new CustomEvent("video.player.load", { detail: { url, title } }));
```

This works across script bundle boundaries since `window` is the shared global.

---

## 10. CustomEvents as Communication Bridge

### Spec guarantee

`CustomEvent` extends `Event` and is defined in the DOM Living Standard. The interface has been stable since 2015.

```webidl
[Exposed=*]
interface CustomEvent : Event {
  constructor(DOMString type, optional CustomEventInit eventInitDict = {});
  readonly attribute any detail;
};
```

**Source:** https://dom.spec.whatwg.org/#interface-customevent
**Source:** https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent

### Stability guarantee

- `CustomEvent` constructor signature (`new CustomEvent(type, init)`) has not changed since the interface was standardized.
- The `detail` property (carries custom data) is `any` — no type restrictions.
- `Event` interface's `composed`, `bubbles`, `cancelable` flags are stable.
- **No breaking changes expected** — the DOM spec treats this as a fundamental API.

### Can a WC from 2024 dispatch an event a WC from 2028 receives?

**Yes.** Events are just strings. As long as:
1. The event `type` string matches (`"video.player.load"` → `"video.player.load"`)
2. Both sides agree on the meaning of `detail`

There is zero coupling between the dispatching and receiving component's codebases, versions, or frameworks.

### Potential risks

- **Name collisions** on `window` — solved by prefixing event names (`yt-video:play`, `peertube:play`).
- **PascalCase vs lowercase** — DOM events are case-sensitive. Always use consistent casing (kebab-case or dotted notation like `"video.player.load"` is common).
- **composed: true** — must be set for events to cross shadow boundaries.

---

## 11. Form-Related WC — ElementInternals Deep Dive

### Form association

Setting `static formAssociated = true` enables a CE to act as a form control:

```js
class MyInput extends HTMLElement {
  static formAssociated = true;
  constructor() {
    super();
    this._internals = this.attachInternals();
  }
  get value() { return this._internals.getFormValue?.() ?? this._value; }
  set value(v) {
    this._value = v;
    this._internals.setFormValue(v);
  }
}
```

### Form lifecycle callbacks

| Callback | When called |
|----------|-------------|
| `formAssociatedCallback(form)` | Element associated with a form |
| `formDisabledCallback(disabled)` | Element's disabled state changes |
| `formResetCallback()` | The form is reset |
| `formStateRestoreCallback(state, reason)` | Form state restored (e.g., back navigation) |

**Source:** https://html.spec.whatwg.org/multipage/custom-elements.html#form-associated-custom-elements

### Validation

```js
this._internals.setValidity({
  valueMissing: true,
  customError: true
}, "This field is required");
```

### Custom state pseudo-class

```css
my-checkbox:state(checked) { border-color: green; }
```

States managed via `this._internals.states` (`CustomStateSet`):
```js
this._internals.states.add('checked');
this._internals.states.delete('checked');
```

---

## Summary: What Makes Web Components Framework-Independent

| Property | Mechanism | Stability |
|----------|-----------|-----------|
| Element registration | `customElements.define()` | Frozen spec, no breaking changes expected |
| DOM/scope isolation | `attachShadow()` with open/closed mode | Stable since 2016 |
| Style isolation | Shadow root + adoptedStyleSheets | Stable; DSD adds SSR support |
| Template reuse | `<template>` + `<slot>` | Stable; manual slot assignment added |
| Data transfer | CustomEvents via `window` / `dispatchEvent` | Frozen since 2015 |
| Cross-script comm | `CustomEvent` with `composed: true` | Stable, framework-agnostic |
| Form integration | `ElementInternals` with `formAssociated` | Baseline widely available since 2023 |
| Server rendering | Declarative Shadow DOM (`shadowrootmode`) | Baseline new 2024; polyfill available |
| No-collision registries | Scoped `CustomElementRegistry` | Newer (2024), additive, not breaking |

### Key takeaway

A plugin system using Web Components for frontend is **future-proof by design**. The specs are frozen, the browser vendors are invested, and the communication layer (CustomEvents on `window`) is the simplest possible protocol — strings with a payload. The only significant risk is **name collisions** in both element tag names and event names, which is mitigated by scoped registries and event namespace conventions.
