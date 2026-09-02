---
type: System
title: "Flux Skeleton"
description: "The minimal host that boots Flux and manages plugin lifecycle"
resource: "okf/systems/skeleton.md"
tags: ["skeleton", "host", "orchestrator", "tauri"]
generated: "2026-09-02"
sources:
  - "CONTEXT.md"
  - "AGENTS.md"
  - "src-tauri/src/lib.rs"
  - "src/App.tsx"
---

# Flux Skeleton

## What Agents Must Know

The skeleton is the **minimal host** that boots Flux. Everything else is a plugin. The skeleton's job is:

1. **Spawn plugins** — discover and start plugin subprocesses
2. **Route messages** — forward RPC calls between frontend and plugins
3. **Open the window** — create and manage the application window
4. **Clean up** — terminate plugin processes on exit

**Rule**: The host stays dumb. It routes by method prefix and does nothing else.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SKELETON (Host)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Tauri/Rust  │  │  Frontend   │  │  Plugin     │     │
│  │  Backend     │  │  (React)    │  │  Manager    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │              │
│         └────────────────┼────────────────┘              │
│                          │                               │
│                    ┌─────┴─────┐                         │
│                    │  Message  │                         │
│                    │  Router   │                         │
│                    └─────┬─────┘                         │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────┴────┐       ┌────┴────┐       ┌────┴────┐
    │ Plugin  │       │ Plugin  │       │ Plugin  │
    │   A     │       │   B     │       │   C     │
    │ (stdin) │       │ (stdin) │       │ (stdin) │
    └─────────┘       └─────────┘       └─────────┘
```

## Backend (Rust)

Located in `src-tauri/src/lib.rs`:

### Plugin Discovery

```rust
fn discover_plugins(dir: &PathBuf) -> Vec<(PluginManifest, PathBuf)>
```

Recursively scans `plugins/` directory for `plugin.json` files.

### Plugin Spawning

```rust
async fn spawn_plugin(manifest, base_dir, plugin_dir) -> Option<PluginHandle>
```

- Parses `run` field (e.g., `"bun ./main.ts"`)
- Spawns subprocess with piped stdin/stdout
- Sets up background stdout reader for responses
- Returns handle with pending request map

### Message Routing

```rust
#[tauri::command]
async fn plugin_request(state, method, params) -> Result<Value, String>
```

- Parses method format: `"plugin-name.action"`
- Finds plugin by name
- Sends JSON message to plugin stdin
- Waits for response with 15-second timeout

### Hook Resolution

```rust
#[tauri::command]
async fn resolve_hook(state, hook) -> Result<Value, String>
```

- Scans all plugin manifests for matching hook
- Returns first match (currently)
- Future: explicit single/multi-provider semantics

## Frontend (React)

Located in `src/App.tsx`:

### Global RPC Functions

```typescript
window.__pluginRpc = async (method: string, params: any) => { ... }
window.resolveHook = async (hook: string) => { ... }
window.callHook = async (hook: string, methodOrArgs: any, args?: any) => { ... }
```

These functions call the Rust backend via WebUi IPC.

### Plugin Loading

```typescript
const loaded = new Set<string>();

function loadScript(src: string) {
  if (loaded.has(src)) return;
  const s = document.createElement("script");
  s.src = src;
  s.type = "module";
  document.head.appendChild(s);
  loaded.add(src);
}
```

Plugins are loaded as ES modules via `<script>` tags.

## Allowed Actions

- **Read**: Skeleton source code, plugin discovery logic, message routing
- **Explain**: How plugins are spawned, messages routed, hooks resolved
- **Suggest**: Improvements to routing, error handling, timeout logic

## Risky Actions

- **Modify**: Message routing without understanding all plugin contracts
- **Change**: Timeout values without considering slow plugins
- **Add**: New Tauri commands without updating frontend bindings

## Related Files

- [`systems/plugin-system.md`](./plugin-system.md) — Plugin architecture
- [`tools/tauri-dev.md`](../tools/tauri-dev.md) — Tauri development environment
- [`tools/rust-backend.md`](../tools/rust-backend.md) — Rust backend details
