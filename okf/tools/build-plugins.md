---
type: Tool
title: "Plugin Build System"
description: "How plugins are bundled into Web Components using Vite and framework-specific adapters"
resource: "okf/tools/build-plugins.md"
tags: ["build", "plugins", "vite", "web-components"]
generated: "2026-09-02"
sources:
  - "scripts/build-plugins.ts"
  - "plugins/*/plugin.json"
  - "CONTEXT.md"
---

# Plugin Build System

## What Agents Must Know

The `build-plugins.ts` script bundles plugin frontend code into self-contained Web Components. Each plugin gets its own bundle with its framework inlined.

## Build Process

```
plugins/<name>/plugin.json
       ↓
  Scan for components/feeds[].card tags
       ↓
  Detect framework from imports
       ↓
  Generate Web Component wrapper
       ↓
  Bundle with Vite (framework-specific)
       ↓
build/plugins/<tag>.js
```

## Supported Frameworks

| Framework  | Detection                        | Entry Pattern                         |
| ---------- | -------------------------------- | ------------------------------------- |
| **React**  | `"react"`, `"react-dom"` imports | `createRoot()` + `root.render()`      |
| **Vue**    | `.vue` files                     | Vue plugin + custom element           |
| **Svelte** | `.svelte` files                  | Svelte plugin + `customElement: true` |
| **Preact** | `"preact"` imports               | `render()` function                   |

## Web Component Wrapper

For React plugins, the generated wrapper looks like:

```javascript
import "./style.css";
import Component from "./yt-video-card";
import { createRoot } from "react-dom/client";

customElements.define(
  "yt-video-card",
  class extends HTMLElement {
    root = null;
    _item = null;
    _manifests = null;

    connectedCallback() {
      try {
        this.root = createRoot(this);
        this._render();
      } catch (e) {
        this.innerHTML = `<p style="color:red">WC error: ${e}</p>`;
      }
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
      if (!this.root) return;
      this.root.render(
        <Component item={this._item} manifests={this._manifests} />,
      );
    }
  },
);
```

## Key Concepts

### Tag Extraction

Tags come from:

1. `components[]` in `plugin.json` — e.g., `["flux-player"]`
2. `feeds[].card` in `plugin.json` — e.g., `"peertube-card"`

### Incremental Builds

```typescript
function needsRebuild(input: string, output: string): boolean {
  if (!existsSync(output)) return true;
  return statSync(output).mtime < statSync(input).mtime;
}
```

Only rebuilds plugins whose source is newer than output.

### Watch Mode

```bash
bun scripts/build-plugins.ts --watch
```

Uses file watchers to rebuild on change. Combined with Vite's `wcReload` plugin for hot reload.

## Build Output

```
build/plugins/
├── flux-player.js      # Video player component
├── player-modal.js     # Modal overlay component
├── peertube-card.js    # PeerTube video card
├── yt-video-card.js    # YouTube video card
├── feed-widget.js      # Feed renderer
└── feed-tabs.js        # Tab navigation
```

Each file is a self-contained ES module that registers a custom element.

## Plugin Manifest Requirements

For a plugin to be built:

```json
{
  "name": "my-plugin",
  "components": ["my-component"], // OR
  "feeds": [{ "card": "my-card" }]
}
```

If neither `components` nor `feeds[].card` exists, the plugin is skipped (backend-only).

## Allowed Actions

- **Read**: Build script, plugin manifests, build output
- **Explain**: How plugins are bundled, framework detection, wrapper generation
- **Suggest**: Build optimizations, new framework support

## Risky Actions

- **Modify**: Build script without testing all framework types
- **Add**: New frameworks without understanding wrapper patterns
- **Remove**: Incremental build logic (slows down development)

## Related Files

- [`systems/frontend-composition.md`](../systems/frontend-composition.md) — How built components compose
- [`tools/tauri-dev.md`](./tauri-dev.md) — Development environment
