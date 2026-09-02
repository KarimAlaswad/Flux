---
type: Tool
title: "Rust Backend"
description: "Tauri v2 Rust backend for plugin management, IPC, and hook resolution"
resource: "okf/tools/rust-backend.md"
tags: ["rust", "tauri", "backend", "ipc"]
generated: "2026-09-02"
sources:
  - "src-tauri/src/lib.rs"
  - "src-tauri/Cargo.toml"
  - "CONTEXT.md"
---

# Rust Backend

## What Agents Must Know

The Rust backend (`src-tauri/src/lib.rs`) is the **thin orchestrator** that:

1. Discovers and spawns plugin subprocesses
2. Routes JSON-RPC messages between frontend and plugins
3. Resolves hooks to find plugin providers
4. Manages plugin lifecycle (start, communicate, terminate)

**Rule**: The host stays dumb. It routes by method prefix and does nothing else.

## Core Data Structures

### PluginManifest

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    name: String,
    version: Option<String>,
    description: Option<String>,
    author: Option<String>,
    run: Option<String>,
    methods: Option<Vec<String>>,
    components: Option<Vec<String>>,
    feeds: Option<Vec<FeedContrib>>,
    hooks: Option<Vec<String>>,
}
```

### PluginHandle

```rust
struct PluginHandle {
    name: String,
    methods: Vec<String>,
    hooks: Vec<String>,
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: Arc<AtomicU64>,
}
```

### AppState

```rust
struct AppState {
    plugins: Mutex<Vec<PluginHandle>>,
}
```

## Key Functions

### Plugin Discovery

```rust
fn discover_plugins(dir: &PathBuf) -> Vec<(PluginManifest, PathBuf)>
```

Recursively scans for `plugin.json` files. Returns manifest + directory path pairs.

### Plugin Spawning

```rust
async fn spawn_plugin(
    manifest: &PluginManifest,
    base_dir: &PathBuf,
    plugin_dir: &PathBuf,
) -> Option<PluginHandle>
```

1. Parses `run` field (e.g., `"bun ./main.ts"` → `cmd="bun"`, `args=["/abs/path/main.ts"]`)
2. Spawns subprocess with piped stdin/stdout
3. Sets up background stdout reader task
4. Returns handle with pending request map

### Message Routing

```rust
#[tauri::command]
async fn plugin_request(
    state: tauri::State<'_, AppState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String>
```

1. Parses method: `"plugin-name.action"` → `plugin_name="plugin-name"`, `action="action"`
2. Finds plugin by name
3. Sends JSON message to stdin:
   ```json
   { "id": 1, "method": "action", "params": {...} }
   ```
4. Waits for response with 15-second timeout
5. Returns result or error

### Hook Resolution

```rust
#[tauri::command]
async fn resolve_hook(
    state: tauri::State<'_, AppState>,
    hook: String,
) -> Result<Value, String>
```

1. Scans all plugin manifests for matching hook
2. Returns first match:
   ```json
   { "name": "plugin-name", "methods": ["method1", "method2"] }
   ```

## IPC Protocol

### Request Format (Host → Plugin)

```json
{
  "id": 1,
  "method": "list",
  "params": { "type": "video" }
}
```

### Response Format (Plugin → Host)

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

## Dependencies

From `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["devtools"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
```

## Allowed Actions

- **Read**: All Rust source code, Cargo.toml, plugin manifests
- **Explain**: How plugins are spawned, messages routed, hooks resolved
- **Suggest**: Error handling improvements, timeout adjustments, new Tauri commands

## Risky Actions

- **Modify**: Message routing without understanding all plugin contracts
- **Change**: Timeout values without considering slow plugins
- **Add**: New Tauri commands without updating frontend bindings
- **Remove**: Error handling that protects against plugin crashes

## Related Files

- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
- [`systems/skeleton.md`](../systems/skeleton.md) — The minimal host
- [`tools/tauri-dev.md`](./tauri-dev.md) — Development environment
