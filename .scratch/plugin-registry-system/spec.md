# Plugin Registry System — Modular Core Architecture

Status: ready-for-agent

## Problem Statement

Flux's architecture treats the Rust Tauri host as a privileged "core" that knows about all plugins — it discovers them, spawns them, holds their hook table, routes RPC calls, and enforces timeouts. This creates three problems:

1. **The core cannot be rewritten** in another language without reimplementing all these concerns. The hook table, process lifecycle, and RPC routing are tangled in ~317 lines of Rust.
2. **Plugins cannot define new hook types.** The hook table is built once at startup from `plugin.json` scans. A plugin that wants to register a new capability at runtime has no way to do it.
3. **There is no capability-based routing.** Callers address plugins by name (`"yt-feed.feed"`) rather than by capability (`"feed.video.feed"`). This couples every caller to a specific plugin identity.

## Solution

Introduce three new peer-level plugin types that replace the monolithic Rust host:

**Registry** — a swappable plugin that owns the hook table. Plugins register their capabilities (hooks + methods + optional schema) with the Registry. Consumers resolve by hook name, not by plugin name. The Registry mediates all inter-plugin communication.

**Supervisor** — a swappable plugin that manages subprocess lifecycles. The Registry discovers what plugins exist (via `plugin.json` scan). The Supervisor spawns each plugin as a subprocess, watches for crashes, and re-spawns on failure. The Supervisor has no knowledge of hooks, capabilities, or routing — only process management.

**Boot process** — a minimal binary (the only non-swappable piece) that scans `plugins/` for the Registry plugin by name and spawns it. The Boot then exits. The Registry handles everything from there.

The Rust Tauri host is replaced by these three pieces. The Tauri WebView (frontend) becomes just another plugin that registers with the Registry like any other peer.

## User Stories

1. As a plugin developer, I want to define a new hook type (e.g. `"search.video"`), so that other plugins can provide or consume this capability without the core knowing about it.
2. As a plugin developer, I want my plugin to register its capabilities with the Registry on startup, so that consumers can find me by hook name.
3. As a plugin developer, I want my plugin to resolve a hook at runtime, so that I don't have to hardcode which plugin provides the capability.
4. As a plugin developer, I want to provide JSON Schema descriptions for my methods, so that callers can validate parameters before calling.
5. As a plugin developer, I want my plugin to be automatically restarted if it crashes, so that the system keeps working without manual intervention.
6. As a plugin developer, I want to declare the dispatch intent of my hook (fan-out or exclusive), so that the Registry knows how to route calls to it.
7. As a plugin developer, I want to target a specific plugin by name when my plugin depends on it (e.g. a sub-plugin calling its parent), so that I can bypass hook resolution when I know exactly who I need.
8. As a plugin developer, I want to target a specific set of plugins when I know exactly which ones I need, so that I don't broadcast to all providers.
9. As a user, I want to see a clear error when two plugins conflict on an exclusive hook, so that I can decide which plugin to disable.
10. As a user, I want plugins to recover automatically from crashes, so that the app stays functional.
11. As a developer rewriting the core, I want to replace the Boot process with an implementation in another language, so that I can change the runtime without affecting any plugin.
12. As a developer rewriting the Registry, I want to replace it with an implementation in another language, so that all plugins that register with it continue working unchanged.
13. As a frontend plugin developer, I want the Tauri WebView to register with the Registry as a peer plugin, so that it can resolve backend capabilities through the same mechanism as every other plugin.
14. As a plugin developer, I want to query the Registry for all capabilities at runtime (introspect), so that I can build dynamic UIs that adapt to what's available.
15. As a developer, I want the Registry to send heartbeat requests to plugins, so that stale/unresponsive plugins are detected and removed from the routing table.
16. As a system designer, I want the dispatch model (fan-out/exclusive) to be a property of the hook name (set by the first plugin to register it), so that all providers of the same hook agree on the routing semantics.
17. As a system designer, I want dispatch model conflicts to surface as user-facing errors (not silent corruption), so that the user can resolve by disabling the misbehaving plugin.
18. As a plugin developer, I want my plugin to declare its lifecycle hooks (onRegister, onUnregister, onHeartbeatTimeout) in its manifest, so that I can perform setup/cleanup when the Registry interacts with me.

## Implementation Decisions

### Architectural diagram

```
Boot process (minimal binary, only non-swappable piece)
  │
  │  [scans plugins/ for name:"registry", follows run field]
  │
  ▼
Registry plugin (swappable)
  │
  │  [discovers all plugins via filesystem scan]
  │  [spawns Supervisor via basic OS spawn]
  │  [accepts register/resolve/list/heartbeat/unregister]
  │
  ▼
Supervisor plugin (swappable)
  │
  │  [spawns every other plugin as subprocess]
  │  [watches children via OS signals, re-spawns on crash]
  │
  ▼
Backend plugins (yt-feed, yt-auth, peertube, etc.)
  │
  │  [each registers hooks + methods + optional schema with Registry]
  │
  ▼
Frontend plugins (Tauri WebView, feed-widget, player-modal)
     │
     │  [register with Registry like any other peer]
     │  [resolve backend capabilities via Registry]
```

### Boot process

A minimal binary (~50 lines in any language). Responsibilities:
1. Scan `plugins/` recursively for a directory containing `plugin.json` with `name: "registry"`
2. Read its `run` field (e.g. `"bun ./main.ts"`), resolve `./` relative to the plugin directory
3. Spawn the process, passing `REGISTRY_ADDR` as environment variable (the address the Registry should listen on)
4. Exit

The Boot process has ONE hardcoded piece of knowledge: the name `"registry"`. Everything else is filesystem convention. To replace the Boot, write a new binary that does the same scan-and-spawn.

### Registry plugin

A process that listens for JSON-RPC requests. Owns the hook table. Has no knowledge of process management, subprocess spawning, or crash recovery.

**Registry API (JSON-RPC methods):**

```
register
  Request: { id, method: "register", params: {
    name: string,
    hooks: Array<{ name: string, dispatch: "fan-out" | "exclusive" }>,
    methods: Record<string, { params?: JSONSchema, returns?: JSONSchema }>,
    capabilities?: string[]
  }}
  Response: { id, result: { ok: true } }
  Error cases:
    - "dispatch model mismatch: hook X already registered as Y (by Z)"
    - "exclusive hook X already registered by Y. Disable Y to use this plugin."
    - "hook name collision: X registered as fan-out by Y, cannot register as exclusive"

resolve
  Request: { id, method: "resolve", params: { hook: string }}
  Response: { id, result: {
    providers: Array<{
      name: string,
      methods: string[],
      schema: Record<string, { params?: JSONSchema, returns?: JSONSchema }>,
      priority?: number
    }>
  }}

call
  Request: { id, method: "call", params: {
    hook: string,
    action: string,
    params?: any
  }}
  Response: { id, result: any }
  Behavior:
    - Fan-out hooks: calls ALL providers, merges results into array (caller always gets array for fan-out)
    - Exclusive hooks: calls the ONE registered provider
    - Forwarded to provider's stdin as JSON-RPC

callPlugin
  Request: { id, method: "callPlugin", params: {
    name: string,
    action: string,
    params?: any
  }}
  Response: { id, result: any }
  Behavior: bypasses hook resolution, routes directly to named plugin

callSet
  Request: { id, method: "callSet", params: {
    names: string[],
    action: string,
    params?: any
  }}
  Response: { id, result: Array<{ name: string, result: any }> }
  Behavior: calls each named plugin, returns array of results

list
  Request: { id, method: "list", params: {} }
  Response: { id, result: Array<{
    name: string,
    hooks: Array<{ name: string, dispatch: string }>,
    methods: string[],
    alive: boolean,
    lastHeartbeat: number
  }>}

heartbeat
  Request: { id, method: "heartbeat", params: {
    name: string,
    capabilities?: string[]
  }}
  Response: { id, result: { ok: true, nextHeartbeatIn: number } }

unregister
  Request: { id, method: "unregister", params: { name: string }}
  Response: { id, result: { ok: true }}
```

**Heartbeat protocol:**
- Registry sends heartbeat request to each plugin every 30s
- Plugin responds with `{ ok: true }`
- If a plugin misses 3 consecutive heartbeats (90s), Registry marks it as dead, removes it from routing table, and emits a `PluginDied` event
- The Supervisor subscribes to `PluginDied` events and re-spawns the dead plugin
- On re-spawn, the plugin re-registers and resumes normal operation

**Hook dispatch rules:**
- The dispatch model is a property of the **hook name**, not of the plugin
- The first plugin to register a hook establishes its dispatch model
- All subsequent registrations for the same hook name must use the same dispatch model; otherwise the Registry rejects them with a clear error
- If two plugins both register the same hook as `exclusive`, the second registration is rejected with: "exclusive hook X already registered by Y. Disable Y to use this plugin."
- If a plugin registers a hook with a dispatch model that differs from the established model, it is rejected with: "dispatch model mismatch: hook X already registered as Y (by Z)"

**Introspection:**
Plugins can optionally provide JSON Schema descriptions for their methods. The `register` method accepts an optional `methods` record where each key is a method name and the value contains `params` and `returns` JSON Schema objects. These are returned by `resolve` so callers can validate before calling.

### Supervisor plugin

A process that manages the lifecycle of all other plugin subprocesses. Has no knowledge of hooks, capabilities, or routing.

Responsibilities:
1. On startup, scan `plugins/` for all directories with `plugin.json` files (excluding itself and Registry)
2. For each plugin with a `run` field: spawn it as a subprocess, passing `REGISTRY_ADDR` as environment variable
3. Watch all children via OS process signals (SIGCHLD on Linux, process handles on Windows)
4. On child exit: if non-zero exit code, re-spawn with exponential backoff (1s, 2s, 4s, max 30s)
5. If a child crashes 5+ times within 60s, mark it as permanently failed and notify the Registry via `unregister`
6. Subscribe to Registry's `PluginDied` events (heartbeat timeout) and re-spawn those plugins

**Supervisor manifest:**
```json
{
  "name": "supervisor",
  "run": "bun ./main.ts",
  "methods": ["status", "restart", "stop"],
  "hooks": [
    { "name": "system.supervisor", "dispatch": "exclusive" }
  ]
}
```

**Supervisor API (JSON-RPC methods):**
```
status
  Request: { id, method: "status", params: {} }
  Response: { id, result: Array<{ name, pid, uptime, status: "running"|"crashed"|"permanently-failed", restartCount, lastExitCode }> }

restart
  Request: { id, method: "restart", params: { name: string }}
  Response: { id, result: { ok: true } }

stop
  Request: { id, method: "stop", params: { name: string }}
  Response: { id, result: { ok: true } }
```

### Plugin protocol changes

**Wire format:** JSON-RPC 2.0 compliant — add `"jsonrpc": "2.0"` field to all messages.

Current: `{"id":1,"method":"feed","params":{}}`
Proposed: `{"jsonrpc":"2.0","id":1,"method":"feed","params":{}}`

**Standard error format:**
```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"human-readable message","data":{"plugin":"yt-feed","hook":"feed.video","details":{}}}}
```

Error codes:
| Range | Meaning |
|-------|---------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32000 to -32099 | Plugin-specific errors |

**Environment variables passed to all plugins:**
- `REGISTRY_ADDR` — address of the Registry (host:port or pipe identifier)
- `PLUGIN_NAME` — this plugin's name (from manifest)
- `PLUGIN_BASE_DIR` — project root directory

### Plugin manifest extension

New `plugin.json` fields:

```json
{
  "name": "yt-feed",
  "run": "bun ./main.ts",
  "methods": ["feed", "resolve"],
  "hooks": [
    { "name": "feed.video", "dispatch": "fan-out" }
  ],
  "capabilities": ["system.backend"],
  "lifecycle": {
    "onRegister": "init",
    "onUnregister": "cleanup"
  }
}
```

- `hooks` is now an array of objects (not just strings), each with `name` and optional `dispatch` (defaults: fan-out)
- `capabilities`: optional array of capability tags for filtering/sorting
- `lifecycle`: optional hooks for lifecycle events

### Frontend plugin registration

The Tauri WebView (React app) registers with the Registry as a frontend-only plugin. It does not have a `run` field — it registers directly via the Tauri bridge.

The frontend's `App.tsx` init flow changes to:
1. Connect to Registry via `REGISTRY_ADDR` (passed through Tauri as an env var or command arg)
2. Register itself: `{ name: "flux-ui", hooks: [], capabilities: ["system.ui"] }`
3. Resolve needed plugins: `registry.resolve("feed.video")`, `registry.resolve("video.player")`, etc.
4. Load frontend WCs (existing `core-static.read` pattern, or direct HTTP if Registry serves static files)
5. Mount UI components

### Hook method convention (soft, not enforced)

The first plugin to register a hook name establishes a **convention** for that hook's methods — which methods the hook is expected to provide. This is NOT enforced at registration. Any plugin can register any hook with any method names. The Registry simply routes calls to the providers that have the requested method.

**Convention, not contract:**
- Plugin A registers `hook "feed.video"` with methods `["fetch", "resolve"]`
- Registry records: canonical suggestion for `feed.video` = `["fetch", "resolve"]`
- Plugin B registers `hook "feed.video"` with methods `["list", "resolve"]`
- Registry: ✓ accepted (no rejection — convention is soft)
- Plugin C registers `hook "feed.video"` with methods `["fetch", "resolve", "search"]`
- Registry: ✓ accepted (extra methods allowed)

**Runtime behavior:**
- `registry.call("feed.video", "fetch", {})` — Registry calls Plugin A (has `fetch`) but NOT Plugin B (doesn't have `fetch`). Plugin B is silently skipped for this call. It will still receive calls for `resolve` which it does have.
- `registry.call("feed.video", "resolve", {})` — Registry calls BOTH A and B (both have `resolve`)
- `registry.call("feed.video", "list", {})` — Registry calls only Plugin B (only B has `list`)
- `registry.call("feed.video", "nonexistent", {})` — Registry calls NO providers. Returns empty result for fan-out or "method not found" error for exclusive.

**Result for developers:**
- Developers who match the hook's established conventions get their methods called
- Developers who use different method names find their plugins silently skipped for calls targeting those methods
- Developers can always inspect `registry.list()` to see what methods each provider actually offers
- The Registry MAY show a warning at registration time: "hook feed.video typically uses methods [fetch, resolve]. Plugin provides [list] — calls may not reach this plugin."

### What happens to the current Rust host

The Rust host (`lib.rs`) is replaced. Its responsibilities are split:

| Current responsibility | Moves to |
|------------------------|----------|
| Plugin discovery (`discover_plugins`) | Registry (or a shared library) |
| Plugin spawning (`spawn_plugin`) | Supervisor |
| Hook table (`state.plugins`) | Registry |
| Hook resolution (`resolve_hook`) | Registry |
| Hook+call (`call_hook`) | Registry |
| Direct RPC (`plugin_request`) | Registry (via `callPlugin`) |
| Timeout enforcement | Registry (per-request timeout) |
| Process watching (not currently done) | Supervisor (new) |
| Boot + Tauri setup | Boot process (Tauri setup stays in a minimal host) |

The minimal Tauri host that remains is just enough to create the WebView window and connect the frontend to the Registry. This is likely ~50 lines of Tauri boilerplate with no plugin logic.

### Removals

- `core-manifest` plugin: no longer needed — Registry discovers plugins
- `core-static` plugin: no longer needed — Registry can serve static files, or the frontend loads WCs directly
- `core-serve` plugin: vestigial, removed
- All hardcoded `__pluginRpc` calls with plugin names: replaced by Registry-mediated routing

## Testing Decisions

### What makes a good test

Test the protocol contract — what messages are sent and received — not the implementation language or runtime. A Registry written in Rust and a Registry written in Python should pass the same test suite.

### Testing seams

The highest testing seam is **the Registry API protocol over stdin/stdout**. Every plugin implements at minimum the `register`, `heartbeat`, and `unregister` response handlers. The Registry implements `resolve`, `list`, `call`, `callPlugin`, `callSet`.

**Seam 1: Registry API conformance test** — send known JSON-RPC requests to any process claiming to be a Registry, assert correct responses. This same test can be run against the Rust implementation, a Python prototype, or any future rewrite.

**Seam 2: Supervisor lifecycle test** — spawn a Supervisor, have it spawn a test plugin, crash the test plugin, assert it gets re-spawned, crash it N times, assert it eventually stops trying.

**Seam 3: Integration test** — full boot sequence: Boot → Registry → Supervisor → test plugin → register → resolve → call → heartbeat → crash → recover → unregister.

### Prior art

No prior testing infrastructure exists in Flux for this kind of protocol-level testing. The existing plugin testing is manual (`echo '{"id":1,"method":"feed","params":{}}' | bun ...`). The protocol conformance tests should follow this same stdin/stdout echo-test pattern, automated with a test harness.

### Test categories

| Category | What it tests | How |
|----------|---------------|-----|
| Registry unit | register → resolve → list → unregister → resolve (empty) | Spawn Registry, send JSON-RPC over stdin, assert stdout |
| Registry dispatch | register fan-out hook twice → call → all providers called | Spawn Registry + 2 mock providers |
| Registry dispatch | register exclusive hook → register second → assert error | Spawn Registry, send register twice, assert error response |
| Registry introspection | register with schemas → resolve → return schemas | Spawn Registry, register with JSON Schema, resolve, assert schema in result |
| Supervisor unit | spawn plugin → watch → kill → re-spawn | Spawn Supervisor + mock plugin, send SIGKILL, assert re-spawn |
| Supervisor crash limit | crash plugin N times → assert permanently-failed | Spawn Supervisor, crash mock plugin repeatedly, assert status |
| Integration | Boot → Registry → Supervisor → plugin → register → call → heartbeat | Full pipeline |
| Frontend registration | Frontend connects to Registry as a peer | Mock frontend process registers, resolves, receives responses |
| Error propagation | Plugin crashes mid-call → Registry returns error | Send call to plugin, crash it mid-request, assert error response with code + message |

## Out of Scope

- Plugin sandboxing beyond subprocess isolation (WASM, containerization) — the subprocess model provides sufficient isolation
- Plugin marketplace or distribution mechanism — plugins are filesystem-scanned
- Authentication/authorization between plugins — not needed for a desktop app
- Persistent Registry state across restarts — Registry state is rebuilt on each boot from filesystem scan + runtime registration
- Streaming communication (video, audio) — the Registry handles request-response; streaming is out-of-band
- Plugin dependencies (a plugin requiring another plugin to be present) — handled by hook resolution at runtime, not at manifest level
- Version negotiation between plugins — future concern

## Further Notes

### Relationship to existing CustomEvent bridge

The Registry replaces inter-plugin backend communication. The frontend CustomEvent bridge (card → player → modal) still exists for frontend-only communication. However, frontend plugins now resolve backend capabilities through the Registry rather than calling `__pluginRpc` with hardcoded plugin names.

### Migration strategy

1. Build Registry as a standalone plugin (can run alongside current Rust host)
2. Build Supervisor as a standalone plugin
3. Migrate one plugin (yt-feed) to use Registry registration
4. Migrate feed-widget to resolve yt-feed through Registry instead of hardcoded name
5. Migrate remaining plugins one at a time
6. When all plugins use Registry, replace the Rust host with the minimal Boot process + Tauri shell

### Open questions deferred to implementation

- Should the Registry use stdin/stdout or TCP/Unix sockets for its own communication? The current subprocess model uses stdin/stdout (inherited from parent). For the Registry, other plugins need to reach it, so it likely needs a socket or named pipe.
- How does the Supervisor communicate with the Registry? Same protocol as any other plugin.
- What is the exact `REGISTRY_ADDR` format? Could be `tcp://127.0.0.1:PORT`, `unix:///tmp/flux-registry.sock`, or a named pipe depending on platform.
