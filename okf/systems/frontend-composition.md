---
type: System
title: "Flux Frontend Composition"
description: "How plugins compose in the UI using Web Components, hooks, and framework-agnostic loading"
resource: "okf/systems/frontend-composition.md"
tags: ["frontend", "web-components", "hooks", "composition"]
generated: "2026-09-02"
sources:
  - "CONTEXT.md"
  - "docs/architecture/styling-cascade.md"
  - "docs/research/micro-frontend-architectures.md"
  - "plugins/*/plugin.json"
  - "scripts/build-plugins.ts"
---

# Flux Frontend Composition

## What Agents Must Know

Flux is a **micro-frontend system**. Each plugin provides its own UI as a self-contained Web Component. The key principles:

1. **Framework Agnostic**: Plugins can use React, Vue, Svelte, Preact, or vanilla JS
2. **Isolated Runtime**: Each plugin bundles its own framework (no shared instances)
3. **Browser-Native Communication**: Plugins communicate via CustomEvents, not shared state
4. **Hook-Based Discovery**: Components are resolved at runtime via hooks

## Component Lifecycle

### 1. Build Time

The `build-plugins.ts` script:

- Scans `plugins/` for manifests with `components` or `feeds[].card`
- Detects framework from imports (React, Vue, Svelte, Preact)
- Generates a Web Component wrapper that:
  - Imports the framework-specific component
  - Registers it as a custom element
  - Manages `item` and `manifests` properties

Example React wrapper:

```javascript
customElements.define(
  "yt-video-card",
  class extends HTMLElement {
    root = null;
    _item = null;
    _manifests = null;
    connectedCallback() {
      this.root = createRoot(this);
      this._render();
    }
    disconnectedCallback() {
      this.root?.unmount();
      this.root = null;
    }
    set item(d) {
      this._item = d;
      this._render();
    }
    set manifests(d) {
      this._manifests = d;
      this._render();
    }
    _render() {
      this.root.render(
        <Component item={this._item} manifests={this._manifests} />,
      );
    }
  },
);
```

### 2. Load Time

In `App.tsx`:

```typescript
function loadScript(src: string) {
  if (loaded.has(src)) return;
  const s = document.createElement("script");
  s.src = src;
  s.type = "module";
  document.head.appendChild(s);
  loaded.add(src);
}
```

Scripts are loaded from `build/plugins/<tag>.js`.

### 3. Mount Time

Components are created imperatively by consumers:

```typescript
// Find provider for hook
const provider = await resolveHook("video.player");
// Create element
const player = document.createElement(provider.components[0]);
// Set data
player.item = videoData;
// Mount
container.appendChild(player);
```

## Hook-Based Resolution

### Frontend Hooks

| Hook           | Purpose        | Example Provider |
| -------------- | -------------- | ---------------- |
| `video.player` | Video playback | `flux-player`    |
| `video.modal`  | Video overlay  | `player-modal`   |
| `feed.widget`  | Feed rendering | `feed-widget`    |
| `feed.tabs`    | Tab navigation | `feed-tabs`      |

### Resolution Flow

```
App.tsx
  ↓ resolveHook("video.modal")
  ↓ → finds "player-modal" plugin
  ↓ → creates <player-modal> element
  ↓
player-modal
  ↓ resolveHook("video.player")
  ↓ → finds "flux-player" plugin
  ↓ → creates <flux-player> element
  ↓
flux-player
  ↓ renders video
```

## Styling Architecture

### CSS Custom Properties Cascade

```
┌─────────────────────────────────────┐
│ End-user override (highest priority)│
├─────────────────────────────────────┤
│ Theme override                      │
├─────────────────────────────────────┤
│ Plugin component                    │
├─────────────────────────────────────┤
│ Base tokens                         │
├─────────────────────────────────────┤
│ Hardcoded fallback (lowest)         │
└─────────────────────────────────────┘
```

### Plugin Author Contract

Every plugin component MUST:

1. Use `var(--token-name, fallback)` for all visual CSS properties
2. Provide sensible fallbacks
3. Never hardcode design values
4. Document which tokens it consumes

## Framework Boundary

**Critical Rule**: Plugins are indestructible by framework changes.

Each plugin bundle:

- Inlines its own framework (React 19, etc.)
- Communicates via browser-native CustomEvents
- Never shares framework state (React context, signals)

A plugin compiled today must work on any version of the host tomorrow.

## Allowed Actions

- **Read**: Plugin components, build scripts, styling patterns
- **Explain**: How components resolve, mount, and communicate
- **Suggest**: New hooks, component patterns, styling improvements

## Risky Actions

- **Modify**: Component wrappers without understanding framework-specific lifecycle
- **Add**: Shared framework state across plugins (breaks isolation)
- **Remove**: CustomEvent contracts that other plugins depend on

## Related Files

- [`systems/plugin-system.md`](./plugin-system.md) — Plugin architecture
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
- [`tools/styling.md`](../tools/styling.md) — CSS custom properties and theming
