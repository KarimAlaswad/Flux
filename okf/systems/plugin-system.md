---
type: System
title: "Flux Plugin System"
description: "Core architecture for modular, language-agnostic plugin system with recursive modularity"
resource: "okf/systems/plugin-system.md"
tags: ["plugin-system", "architecture", "modularity", "ipc"]
generated: "2026-09-02"
sources:
  - "CONTEXT.md"
  - "AGENTS.md"
  - "src-tauri/src/lib.rs"
  - "plugins/*/plugin.json"
  - "docs/learning/domains.md"
---

# Flux Plugin System

## What Agents Must Know

The Flux plugin system is the core architectural pattern. **Every feature is a plugin** — there are no exceptions. The system follows these principles:

1. **Recursive Modularity**: Plugins can contain sub-plugins infinitely
2. **Language Agnostic**: Plugins can be written in any language (Rust, Go, Python, Bun/TS)
3. **Skeleton Independence**: Plugins work on any host framework (Tauri, Electrobun, etc.)
4. **Host Stays Dumb**: The host only routes messages, spawns processes, and manages the window

## Plugin Structure

A plugin is any directory containing a `plugin.json` manifest file:

```
plugins/
├── youtube/           # Meta-plugin (groups sub-plugins)
│   ├── plugin.json    # Manifest with no run/methods
│   └── plugins/       # Sub-plugins directory
│       ├── yt-feed/
│       │   ├── plugin.json
│       │   └── main.ts
│       └── yt-auth/
│           ├── plugin.json
│           └── main.ts
├── peertube/          # Service plugin
│   ├── plugin.json    # Has run, methods, hooks, feeds
│   └── main.ts
├── flux-player/       # Component plugin
│   ├── plugin.json    # Has hooks, components
│   └── flux-player.tsx
└── core-manifest/     # Core plugin
    ├── plugin.json    # Has run, methods
    └── main.ts
```

## Manifest Fields

From `src/shared/types.ts`:

```typescript
interface PluginManifest {
  name: string; // Unique identifier, used for RPC routing
  version?: string; // Semantic version
  description?: string; // Human-readable description
  author?: string; // Plugin author
  run?: string; // Backend command (e.g., "bun ./main.ts")
  methods?: string[]; // RPC methods this plugin exposes
  components?: string[]; // Web Component tags to build
  feeds?: FeedContrib[]; // Feed contributions (type, card tag)
  hooks?: string[]; // Capability labels for runtime resolution
}
```

## Plugin Types

| Type           | Description                                  | Example                       |
| -------------- | -------------------------------------------- | ----------------------------- |
| **Service**    | Wraps an internet service, handles auth/API  | `peertube`, `youtube`         |
| **Component**  | Frontend Web Component, no backend           | `flux-player`, `player-modal` |
| **Core**       | Ships with Flux, provides essential services | `core-manifest`, `core-serve` |
| **Meta**       | Groups sub-plugins, no direct functionality  | `youtube`                     |
| **Sub-plugin** | Nested under another plugin                  | `yt-feed` under `youtube`     |

## IPC Protocol

Plugins communicate via **subprocess stdin/stdout JSON** (simplest cross-language IPC):

### Message Format (Plugin → Host)

```json
{
  "id": 1,
  "method": "list",
  "params": { "type": "video" }
}
```

### Response Format (Host → Plugin)

```json
{
  "id": 1,
  "result": { "items": [...] }
}
```

### Error Format

```json
{
  "id": 1,
  "error": "Plugin not found: invalid-plugin"
}
```

## Hook Resolution

Hooks decouple **what** from **who**. A plugin declares "I provide this capability" via `hooks`:

```json
{
  "name": "flux-player",
  "hooks": ["video.player"],
  "components": ["flux-player"]
}
```

At runtime:

1. Consumer calls `resolve_hook("video.player")`
2. Host scans manifests for plugin with matching hook
3. Returns plugin name and methods
4. Consumer creates Web Component element

**Rule**: Plugins never talk to each other directly. Every message goes: `Plugin → Skeleton → Plugin`.

## Actions Allowed

- **Read**: All plugin files, manifests, and implementations
- **Suggest**: New plugins, manifest changes, hook additions
- **Explain**: How plugins interact, resolve hooks, communicate

## Actions Risky

- **Modify**: Plugin manifests without understanding hook dependencies
- **Add**: New hooks without considering existing consumers
- **Remove**: Fields from manifests that other plugins may depend on

## Related Files

- [`systems/skeleton.md`](./skeleton.md) — The minimal host that boots Flux
- [`systems/frontend-composition.md`](./frontend-composition.md) — How plugins compose in the UI
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
- [`workflows/plugin-development.md`](../workflows/plugin-development.md) — How to add/modify plugins
