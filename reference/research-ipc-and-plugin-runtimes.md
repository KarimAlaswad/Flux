# Research: IPC Patterns & Plugin Runtime Architectures

Comparison against Flux — a Tauri v2 desktop app using subprocess stdin/stdout JSON-RPC for plugin IPC.

---

## 1. JSON-RPC vs gRPC vs MessagePack vs Cap'n Proto

### JSON-RPC (Flux's current format)

Flux sends `{"id":<n>,"method":"<action>","params":{}}\n` over stdin/stdout to subprocess plugins. No `jsonrpc` field (RPC-style, but not spec-compliant).

**Benchmarks** (serialization of 1KB messages, Rust):
- Serialize: 5.2 μs | Deserialize: 8.7 μs | Total: 13.9 μs
- Size: ~280 bytes (baseline for comparison)
- Source: [Wire Formats for High-Volume Service Communication (2025)](https://mechanicalsnail.com/posts/wire-formats-rust/)

**Advantages**: Human-readable, no schema required, universal support, trivial to debug with `echo '...' | bun plugin/main.ts` (Flux's exact debugging pattern). Zero build step.

**Disadvantages**: Text encoding is ~4× slower to parse than binary formats. JSON cannot represent binary data without Base64 (~33% size bloat). Field names are repeated in every message. No type safety at the wire level. For Flux's small RPC payloads (<1KB) the difference is negligible — serialization overhead is dominated by subprocess context-switch cost (~50-200μs).

**Academic source**: [Impact of Serialization Format on Inter-Service Latency (2024)](https://doi.org/10.23939/acps2024.02.089) — FlatBuffers saw 97.59% efficiency vs JSON baseline; textual formats (JSON, XML, YAML) performed worst in all benchmarks.

### gRPC (Google's RPC framework)

Uses Protocol Buffers (binary schema-based serialization) over HTTP/2. Requires `.proto` schema compilation.

**Benchmarks**:
- Serialize: 1.8 μs | Deserialize: 2.4 μs | Total: 4.2 μs (2.9× faster serialization, 3.6× faster deserialization than JSON)
- Size: ~98 bytes (65% smaller than JSON)
- Source: [Wire Formats for High-Volume Service Communication (2025)](https://mechanicalsnail.com/posts/wire-formats-rust/)

**Netflix migration results** (JSON→gRPC):
- P50 latency: 15ms → 12ms (20% reduction)
- P99 latency: 80ms → 55ms (31% reduction)
- Throughput: 10K → 15K RPS per instance (50% increase)
- Source: [Wire Formats for High-Volume Service Communication (2025)](https://mechanicalsnail.com/posts/wire-formats-rust/)

**Trade-offs for Flux**: gRPC requires code generation, a schema definition, and an HTTP/2 stack. For subprocess plugins, HTTP/2 multiplexing is irrelevant (single bidirectional stream). The HTTP/2 framing adds overhead that negates serialization gains for Flux's tiny messages. gRPC's main value is in service-to-service networking, not subprocess IPC.

### MessagePack ("Binary JSON")

Binary format that preserves JSON's data model (schema-less) but encodes more compactly.

**Benchmarks**:
- Serialize: 2.1 μs | Deserialize: 3.8 μs | Total: 5.9 μs (2.5× faster than JSON)
- Size: ~168 bytes (40% smaller than JSON)
- Source: [Wire Formats for High-Volume Service Communication (2025)](https://mechanicalsnail.com/posts/wire-formats-rust/)

**Relevance to Flux**: MessagePack could be a drop-in replacement for JSON — same data model, no schema, no code generation. `rmp-serde` crate in Rust interops seamlessly with `serde_json`. For Flux's current architecture, switching wire format alone (without changing the subprocess model) would yield minimal benefit since context-switch + line-reading dominates. However, if Flux ever moves to in-process plugins, MessagePack's 2.5× parsing speedup becomes relevant.

### Cap'n Proto

"Zero-copy" serialization — encoded data is laid out in memory such that reading a field is just pointer arithmetic. No parse step.

**Benchmarks**:
- Serialize: 0.7 μs | Deserialize (zero-copy): 0.2 μs | Total: 0.7 μs (7.4× faster serialization, 44× faster field access than JSON)
- Size: ~152 bytes (46% smaller than JSON, but 55% larger than Protobuf due to 8-byte alignment)
- Source: [Wire Formats for High-Volume Service Communication (2025)](https://mechanicalsnail.com/posts/wire-formats-rust/)

**Trade-offs**: Cap'n Proto requires schema definition and code generation. Its RPC layer uses capability-based security (promises pipelining). For Flux's subprocess model, zero-copy is meaningless — data crosses a process boundary and must be serialized anyway. The ecosystem is much smaller than Protocol Buffers.

**Flux relevance**: Only worth considering if Flux migrates to in-process WASM or shared-memory plugins where zero-copy access patterns matter.

### Summary Table

| Format | Schema | Serialize | Deserialize | Size | Flux Fit |
|--------|--------|-----------|-------------|------|----------|
| JSON | No | 5.2 μs | 8.7 μs | 280 B | ✅ Current (good enough) |
| MessagePack | No | 2.1 μs | 3.8 μs | 168 B | ⚠️ Drop-in replacement, marginal gain |
| Protobuf (gRPC) | Required | 1.8 μs | 2.4 μs | 98 B | ❌ Overkill for subprocess IPC |
| Cap'n Proto | Required | 0.7 μs | 0.2 μs | 152 B | ❌ Only if in-process WASM |
| FlatBuffers | Required | 0.9 μs | 0.3 μs | 132 B | ❌ Gaming niche |

**Bottom line**: JSON-RPC is the right choice for Flux's current subprocess model. The dominant cost is subprocess context switching (50-200μs per write/read syscall), not serialization. Switch to MessagePack only if profiling shows JSON parsing as a hotspot. Avoid schema-based formats (gRPC, Cap'n Proto, Protobuf) unless plugging into an ecosystem that demands them.

---

## 2. Tokio Channel Patterns

### Current Flux Implementation

```rust
// lib.rs:47
struct PluginHandle {
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: Arc<AtomicU64>,
}
```

Flux uses `tokio::sync::Mutex<HashMap<u64, oneshot::Sender>>` to match async responses to their request IDs. A background task reads stdout lines, parses `{"id": <n>, "result": ...}`, looks up the matching `oneshot::Sender`, and completes the future.

### Tokio's Four Channel Types

Source: [Tokio Channels Tutorial](https://tokio.rs/tokio/tutorial/channels)

| Type | Producers | Consumers | Values | Use Case |
|------|-----------|-----------|--------|----------|
| `oneshot` | 1 | 1 | 1 | Request-response, shutdown signal |
| `mpsc` | Many | 1 | Many | Work queues, command channels |
| `broadcast` | Many | Many | Many (all see all) | Pub/sub, event fan-out |
| `watch` | Many | Many | Latest only | Config, state sync |

### The Actor Pattern (recommended alternative for Flux)

Instead of `Mutex<HashMap<...>>`, spawn a dedicated task that owns the pending map:

```rust
enum PluginCommand {
    Send {
        id: u64,
        line: String,
        reply: oneshot::Sender<Result<Value, String>>,
    },
}
let (cmd_tx, mut cmd_rx) = mpsc::channel::<PluginCommand>(64);
```

Source: [Tokio Channels Tutorial — Actor Pattern](https://tokio.rs/tokio/tutorial/channels)

**Advantages over current Flux approach**:
- No `Mutex` contention — the actor owns `pending` exclusively
- Backpressure via bounded `mpsc` channel capacity
- The stdin write can be serialized through the actor, avoiding write interleaving

**Flux relevance**: Flux's current approach (lock-and-read from background task + lock-and-write from command handler) works correctly but risks deadlock if the lock is held across `.await` points. The actor pattern eliminates this class of bug entirely.

### broadcast Channel — Event System

If Flux adds hooks/event propagation (e.g., "plugin loaded", "feed updated"), the `broadcast` channel is the right primitive:

```rust
let (event_tx, _) = broadcast::channel::<PluginEvent>(256);
// Each subscriber calls:
let mut rx = event_tx.subscribe();
```

Source: [Tokio broadcast docs](https://docs.rs/tokio/latest/tokio/sync/broadcast/index.html)

The `recv()` method returns `Err(Lagged(n))` when a slow consumer misses messages — built-in backpressure detection.

### watch Channel — Hot-Reload State

For sharing plugin registry state (e.g., "which plugins are loaded"):

```rust
let (state_tx, state_rx) = watch::channel(AppState { plugins: vec![] });
// Readers always see the latest value
// Writers send updates
```

Source: [Tokio watch docs](https://docs.rs/tokio/latest/tokio/sync/index.html)

**Flux relevance**: The `watch` channel is the ideal mechanism for Flux's hot-reload system — new plugin state can be pushed, and all consumers immediately see the latest version without polling.

### select! — Multi-Channel Orchestration

For services that need to handle requests, events, and state changes simultaneously:

```rust
select! {
    Some(req) = request_rx.recv() => handle(req),
    Ok(msg) = broadcast_rx.recv() => broadcast(msg),
    Ok(_) = state_rx.changed() => { let s = *state_rx.borrow(); update(s); }
    // ...
}
```

Source: [Rust Tokio Channel Patterns: 6 Production Patterns (2026)](https://www.toolsku.com/en/blog/rust-tokio-channel-patterns-2026/)

---

## 3. Web Workers — Message Passing

### Mechanism

Web Workers use `postMessage()` with the **structured clone algorithm** — a deep copy mechanism that handles:
- Cyclical references (detected via reference map)
- Built-in types: `Map`, `Set`, `RegExp`, `Date`, `Blob`, `File`, `ArrayBuffer`
- Transferable objects for zero-copy transfer of `ArrayBuffer`, `MessagePort`, `OffscreenCanvas`

Source: [MDN: Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

Source: [HTML Spec: Safe passing of structured data](https://html.spec.whatwg.org/multipage/structured-data.html)

### Transferable Objects

`ArrayBuffer` transfer is zero-copy — the underlying memory is moved between contexts:

```javascript
worker.postMessage({ input: buffer }, [buffer]); // 6.6ms vs 302ms for 32MB
```

Source: [Chrome Developers: Transferable objects — Lightning fast](https://developer.chrome.com/blog/transferable-objects-lightning-fast)

After transfer, `buffer.byteLength === 0` on the sending side. This is C-like ownership semantics (move, not copy) exposed in JavaScript.

### MessagePort Architecture

Dedicated Web Workers use `MessagePort` internally:

```
Main Thread                   Worker Thread
    |                             |
    |-- postMessage(data) ------->|
    |                             |-- onmessage handler
    |<--- postMessage(data) ------|
```

Source: [HTML Spec: Web Workers](https://html.spec.whatwg.org/multipage/workers.html)

MessagePorts can also be transferred between workers, creating arbitrary communication topologies (not just parent-child).

### Relevance to Flux

Flux's subprocess model is architecturally similar to Web Workers — separate execution context, message-based communication. Key differences:
- Flux uses text JSON over stdin/stdout; Web Workers use structured clone (binary, rich types)
- Flux subprocesses are OS processes (heavy, isolated); Web Workers are threads (lightweight, same process)
- Flux subprocesses can be written in any language; Web Workers are JavaScript only
- Structured clone cannot be replicated over a pipe — it's a JS VM feature

If Flux ever moves from subprocess to in-process (via WASM or Lua), the structured clone model shows what's possible: rich types, zero-copy buffers, and object ownership transfer.

---

## 4. Deno/Bun Worker Implementation

### Deno Workers

Deno's `WebWorker` uses an internal `MessagePort` pair for communication:

```rust
fn create_handles(...) -> (WebWorkerInternalHandle, SendableWebWorkerHandle) {
    let (parent_port, worker_port) = create_entangled_message_port();
    let (ctrl_tx, ctrl_rx) = mpsc::channel::<WorkerControlEvent>(1);
    // ...
}
```

Source: [deno/runtime/web_worker.rs](https://github.com/denoland/deno/blob/main/runtime/web_worker.rs)

Key design decisions:
- `WebWorkerInternalHandle` is NOT `Send` — it stays on the worker thread
- `SendableWebWorkerHandle` IS `Send` — sent to the parent thread
- Separate `mpsc` channel for control events (terminate, error)
- `MessagePort` for data messages (structured clone)
- Termination uses `AtomicBool` + `AtomicWaker` for cross-thread signalling

**Structured clone optimization** (Deno PR #35110): Primitive types (`undefined`, `null`, boolean, number, string) skip V8's `ValueSerializer`/`ValueDeserializer` using a `0xFE`-sentinel encoding:
- Ping-pong latency: 46.1μs → 41.0μs (−11%)
- Fire-and-forget throughput: 276K → 345K msg/s (+25%)
- Source: [Deno PR #35110](https://github.com/denoland/deno/pull/35110)

### Bun Workers

Bun implements Web Workers with optimized fast paths:

- **String fast path**: Pure strings bypass structured clone entirely (zero serialization overhead)
- **Simple object fast path**: Plain objects with only primitive values skip full structured clone
- Source: [Bun Docs: Workers](https://bun.com/docs/runtime/workers)

Bun's `Worker` class also supports `node:worker_threads` API for compatibility:
- `MessageChannel` / `MessagePort` / `BroadcastChannel`
- `setEnvironmentData()` / `getEnvironmentData()` for sharing config
- `worker.unref()` for lifecycle management
- Source: [Bun API: Worker](https://bun.sh/reference/bun/Worker)

### Node.js `worker_threads`

Additional features over Web Workers:
- `receiveMessageOnPort()` — synchronous message check (no event loop tick)
- `moveMessagePortToContext()` — transfer port between V8 contexts
- `markAsUncloneable()` / `markAsUntransferable()` — security controls
- `SharedArrayBuffer` support for true shared memory
- Source: [Deno docs: worker_threads](https://docs.deno.com/api/node/worker_threads/)

### Relevance to Flux

Deno/Bun/Node worker implementations show that **in-process threading with structured clone is 100-1000× faster** than subprocess IPC (microseconds vs milliseconds). The Flux architecture could potentially:
1. Keep subprocess for isolation (security sandbox)
2. Use in-process WASM for performance-critical plugins
3. Use Bun's internal Workers for JS-only plugins running in the same process

The structured clone fast path optimizations (primitive type bypass) are analogous to what Flux could do: if a response is a simple string/value, skip JSON parsing entirely.

---

## 5. Chrome Extension Message Passing

### Architecture

Chrome extensions have 5 context types:
1. **Service Worker** — background, persistent hub
2. **Content Scripts** — run in web page context, share DOM
3. **Popup/Options Pages** — transient UI
4. **Side Panels** — persistent alongside browser
5. **Offscreen Documents** — manifest v3 for audio/processing

Source: [Chrome Developers: Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)

### Two API Levels

**One-time requests** (`runtime.sendMessage`, `tabs.sendMessage`):
- Fire-and-forget with optional response callback
- Internally equivalent to: `connect()` → `postMessage()` → `disconnect()`
- JSON-serialized (not structured clone — more restricted)
- Requires at least 2 IPC messages (sender → browser process → receiver)

Source: [Stack Overflow: Chrome Extension Messaging Architecture](https://stackoverflow.com/questions/36371072/chrome-extension-messaging-architecture)

**Persistent connections** (`runtime.connect`, `tabs.connect`):
- Returns a `runtime.Port` object (bidirectional)
- Ports survive service worker restarts
- Port lifecycle: `connect()` → `onConnect` → `postMessage()`/`onMessage` → `disconnect()`/`onDisconnect`
- Can have named channels for multiplexing

Source: [Chrome Developers: runtime.Port](https://developer.chrome.com/docs/extensions/reference/api/runtime)

### Port-Based Communication (internal implementation)

```
Connection:
1. connect() → OpenChannelToExtension to browser
2. Browser dispatches OnConnect to renderers
3. Renderer with listener responds with OpenMessagePort

Message Posting:
1. postMessage() → PostMessageToPort to browser
2. Browser sends DeliverMessage to listening renderers

Disconnecting:
1. disconnect() → CloseMessagePort to browser
2. Browser sends DispatchOnDisconnect to other renderers
```

Source: [Chromium source: native_renderer_messaging_service.h](https://chromium.googlesource.com/chromium/src/+/69d8fd684376f3f078adaca34ff8b471754d1884/extensions/renderer/native_renderer_messaging_service.h)

### Cross-Extension & Native Messaging

- **`runtime.connectNative()`** — connects to a native app via stdin/stdout JSON messages with 32-bit length prefix
- **`runtime.onConnectExternal`** — cross-extension connections
- **`externally_connectable`** — web pages can send messages to extensions

Source: [Chrome Developers: Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

### Relevance to Flux

Chrome's extension architecture is the closest analogue to Flux:
- ✅ **Subprocess plugins**: Chrome's native messaging uses stdin/stdout JSON, exactly like Flux
- ✅ **Port-based connections**: Flux could implement a "port" abstraction on top of subprocess stdin/stdout (long-lived bidirectional channels within one process)
- ✅ **Lazy activation**: Chrome extensions activate only when their declared events fire — analogous to Flux's hook system
- ✅ **Multiple contexts**: Chrome's content scripts, service workers, and popups mirror Flux's WC cards, feed widget, and modal

The key lesson: Chrome's port-based API is fundamentally more ergonomic than raw request-response. Flux could offer a `connect()` method that returns a channel-like handle, multiplexed over the existing subprocess pipe.

---

## 6. WASM Plugin Runtimes (Extism, Wasmtime, Wasmer)

### Extism

Extism is a universal plugin framework built on WebAssembly. It wraps lower-level Wasm runtimes (Wasmtime, Wazero, V8) with a high-level API.

**How it works**:
- Plugins are compiled to `.wasm` (any language → Wasm via PDK)
- Host loads `.wasm` into a sandboxed runtime
- Communication via host functions (imports) — host exposes specific capabilities
- PDKs provide idiomatic wrappers for reading input, writing output, HTTP, config, variables

Source: [Extism GitHub](https://github.com/extism/extism)
Source: [Extism FAQ](https://extism.org/docs/questions/)

**Security model**:
- Wasm sandbox provides memory isolation by default
- Host functions are the attack surface — each function is explicitly registered
- Memory limits (`MaxPages: 256` = 16 MiB)
- Per-call timeouts (must be explicitly configured)
- WASI can be disabled (no filesystem access)
- Plugin binaries can be verified via SHA256/cosign

Source: [Extism Plugin Security: Host/Guest Trust Boundaries](https://www.systemshardening.com/articles/wasm/extism-plugin-security/)

**Extism vs Flux subprocess**:
| Aspect | Extism (WASM) | Flux (Subprocess) |
|--------|---------------|-------------------|
| Process | In-process (same address space) | Separate OS process |
| Isolation | Wasm memory sandbox | OS process boundary |
| Latency | Microseconds (function call) | Milliseconds (context switch) |
| Languages | Any → Wasm (Rust, Go, TS, Python, C#, Zig, C++) | Any with stdin/stdout |
| State | Persistent between calls | Persistent (process lives) |
| Security | Fine-grained host functions | OS-level (signals, file perms) |
| Startup | ~1ms | ~50-200ms (Bun/Node startup) |

### Wasmtime

Bytecode Alliance's Wasm runtime, used by Extism's Rust SDK.

**Security features**:
- Memory isolation between instances (2GB guard pages)
- Capability-based WASI (filesystem access granted explicitly)
- Rust's type safety prevents embedding bugs
- Spectre mitigations on bounds checks
- Zeroing freed memory to prevent info leakage
- CFI (control-flow integrity) for hardware-backed sandboxing

Source: [Wasmtime Security docs](https://docs.wasmtime.dev/security.html)

### Wasmer

Alternative Wasm runtime with different trade-offs:
- Singlepass compiler for fast compilation (embedded use cases)
- WASIX extensions (multithreading, sockets, tokio async)
- Middleware system for customizing runtime behavior
- Compile Wasm to native code (serialize/deserialize)
- Web support via wasm32 target

Source: [WebXtism — Extism on Wasmer](https://github.com/anlumo/webxtism/)

### Plugin Development Kits (PDKs)

Extism PDK interface (simplified):
```go
//export count_vowels
func count_vowels() int32 {
    input := pdk.Input()
    // ... process ...
    pdk.OutputString(result)
    return 0
}
```

PDKs exist for: TypeScript, Go, Rust, Python, C#, Zig, C++.

Source: [Extism Announcement Blog](https://extism.org/blog/announcing-extism/)

### Relevance to Flux

WASM plugins via Extism would be the most architecturally significant change Flux could make:

1. **Replace subprocess Bun/Node plugins** with in-process WebAssembly — eliminates context-switch cost entirely
2. **Fine-grained capability control** — each plugin declares exactly what it needs (HTTP, config, file read) rather than getting full OS access
3. **Deterministic startup** — WASM instantiation is ~1ms vs 50-200ms for Bun/Node subprocess
4. **Language freedom** — plugins can be written in Rust, Go, C, Zig, TypeScript (via ComponentizeJS), Python, and compiled to Wasm

**Trade-offs**:
- Async host function calls are still evolving (Extism doesn't support async plugin calls yet)
- Wasm ecosystem is smaller than npm for JS plugins
- Some APIs (DOM, Web APIs) unavailable — plugins must use WASI or host functions
- Debugging Wasm is harder than debugging a Node subprocess

---

## 7. Lua Embedding (LuaJIT, mlua, rlua)

### mlua (Rust bindings)

`mlua` provides safe, high-level Rust bindings to Lua 5.1-5.5, LuaJIT, and Luau (Roblox's Lua dialect).

**Key features**:
- `Lua::new()` creates a new Lua VM instance
- `Lua::load()` compiles and can execute Lua chunks
- `FromLua` / `IntoLua` traits for Rust↔Lua type conversion
- `UserData` trait for exposing Rust types to Lua with methods
- `LuaSerdeExt` for serde-based conversion
- `create_async_function()` for async/await in Lua (uses Tokio)
- `Lua::sandbox()` for restricted execution (Luau only)
- Feature: `vendored` statically compiles Lua from source
- Feature: `send` makes `Lua: Send + Sync` (uses reentrant mutex internally)

Source: [mlua GitHub](https://github.com/mlua-rs/mlua)
Source: [mlua docs](https://docs.rs/mlua/latest/mlua/)

**Model (standalone vs module)**:
- **Standalone**: Your app embeds Lua — full control over what's exposed
- **Module**: Your Rust code becomes a Lua module (`require('yourmodule')`) — less control

**Sandboxing notes**:
- Luau has built-in `Lua::sandbox()` method
- For standard Lua, sandboxing requires removing dangerous globals (`os.execute`, `io.open`, `loadfile`, `dofile`, `require`, `debug`)
- This is fragile — determined Lua code can escape via metatables or FFI (LuaJIT's `ffi` library gives full memory access)

Source: [mlua struct.Lua](https://docs.rs/mlua/latest/mlua/struct.Lua.html)

### Real-world example: sqleibniz

A SQL tool embeds Lua via mlua for user-defined hooks:
```rust
let lua = mlua::Lua::new();
lua.load(file_content).set_name("config.lua").exec()?;
let config: Config = lua.unpack(globals.get::<mlua::Value>("leibniz")?)?;
```
- Rust→Lua: `IntoLua` trait converts struct to Lua table
- Lua→Rust: `FromLua` trait parses Lua table into struct
- Lua functions stored as `mlua::Function` and called with Rust types

Source: [Embedding Lua in sqleibniz with Rust (2024)](https://xnacly.me/posts/2024/embed-lua-in-rust/)

### Neovim's Lua embedding

Neovim embeds LuaJIT directly (not through mlua — raw C API). Architecture:
- Single global Lua state (`global_lstate`) initialized at startup
- `vim.*` namespace populated with core functions
- Lua plugins auto-discovered from `runtimepath`
- Bidirectional interop: `vim.fn` (Lua→Vimscript) and `v:lua` (Vimscript→Lua)
- Plugins loaded lazily from `lua/` directory (via `require()`)
- Plugin host for remote plugins (msgpack-RPC over channels)

Source: [Neovim: Lua Plugin Guide](https://neovim.io/doc/user/lua-plugin/)
Source: [Neovim: Lua Engine Integration](https://deepwiki.com/neovim/neovim/4.2-lua-engine-integration)

### Relevance to Flux

Lua embedding is an alternative to WASM for in-process scripting:

**Lua advantages over WASM**:
- Smaller runtime (~200KB vs ~2MB for Wasmtime)
- Dynamic typing — no compilation step required for scripts
- Decades of proven embedding (games, Redis, Nginx, Neovim)
- LuaJIT is extremely fast (often beats Wasm for compute)

**Lua disadvantages vs WASM**:
- No memory safety — Lua C API can segfault your host
- Sandboxing is fragile (especially with LuaJIT's FFI)
- Limited standard library compared to JS/npm
- Single global state per VM (unless using lua_newstate carefully)

**For Flux specifically**:
- Lua would be good for config files and simple hooks (Neovim model)
- WASM is better for untrusted third-party plugins (stronger sandbox)
- A hybrid approach: Lua for user configuration, WASM for plugin execution

---

## 8. Polyglot Plugin Systems

### Neovim (Lua + Vimscript + Any Language via RPC)

Neovim supports three plugin mechanisms:

| Mechanism | Language | Communication | Use Case |
|-----------|----------|---------------|----------|
| Lua Plugins | Lua 5.1 / LuaJIT | In-process | High-performance plugins |
| Vimscript Plugins | Vimscript | In-process | Legacy compatibility |
| Remote Plugins | Any (Python, Node, etc.) | msgpack-RPC over channels | Out-of-process extensions |

Source: [Neovim: Extension and Plugin System](https://deepwiki.com/neovim/neovim/4-extension-and-plugin-system)

Key design: **Plugin hosts** — language runtimes that speak msgpack-RPC. Hosts are loaded lazily only when needed (manifest-driven). This keeps startup fast even with many plugins.

Source: [Neovim: remote_plugin.txt](https://github.com/neovim/neovim/blob/master/runtime/doc/remote_plugin.txt)

### VS Code (JavaScript/TypeScript + Any Language via LSP)

VS Code runs extensions in an **Extension Host** — an isolated process:

```
Workbench (Renderer) ←RPC→ Extension Host (Node.js) ←LSP→ Language Server (any language)
```

RPC protocol defined in `extHost.protocol.ts` — async, proxy-based. Each extension gets access to a `vscode` namespace that proxies calls to the main thread.

Extension Host types:
- **Local Process**: Node.js process for desktop
- **Web Worker**: Browser worker for web
- **Remote**: Process on SSH/Container/WSL

Source: [VS Code DeepWiki: Extension System](https://deepwiki.com/microsoft/vscode/5-extension-system)

Extension languages: JavaScript, TypeScript. Any other language via Language Server Protocol (LSP) or Debug Adapter Protocol (DAP) — separate processes communicating over stdin/stdout JSON.

Source: [VS Code: Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

### Java ClassLoader-based (IntelliJ, Eclipse, Tomcat)

Java plugin systems use **custom ClassLoaders** with parent-delegation overrides:

**Child-first ClassLoader pattern**:
```java
class ChildFirstClassLoader extends URLClassLoader {
    protected Class<?> loadClass(String name, boolean resolve) {
        // Shared API classes → parent
        if (name.startsWith("plugin.api.")) return parent.loadClass(name);
        // Plugin-private classes → child first
        try { return findClass(name); } catch (...) {}
        return parent.loadClass(name);
    }
}
```

Key lesson: **Shared API contract** — plugin interface classes must be loaded by a common parent ClassLoader. If plugin and host each load their own copy of the interface, `ClassCastException` results even with identical class names.

Source: [Java ClassLoader Architecture (2026)](https://mdsanwarhossain.me/blog-java-classloader-deep-dive.html)

### Relevance to Flux

Flux already has a polyglot architecture: subprocess plugins can be written in any language (Bun/TS, Python, etc.). Neovim's architecture is the closest model:

| Flux Feature | Neovim Equivalent |
|---|---|
| `run: "bun ./main.ts"` | Remote plugin host (msgpack-RPC) |
| Frontend Web Components | Lua in-process plugins (UI) |
| Hook system (`feed.video`) | Autocommand events |
| Manifest-driven discovery | `rplugin.vim` manifest |
| `plugin_request` command | `rpcrequest()` / `rpcnotify()` |

VS Code's LSP integration is a practical example of how to support polyglot plugins while keeping the core lean: define a protocol, spawn language-specific servers, communicate over stdin/stdout JSON. Flux already does this.

The Java ClassLoader lesson is directly applicable: **Flux's shared API types (Value, method strings, manifest format) should be versioned and stable**. A plugin compiled against v1 manifests should still work with v2 of the host.

---

## 9. Unix Signals vs Socket Activation vs Pipe-Based IPC

### Performance Benchmarks

From [ipc-bench](https://github.com/goldsborough/ipc-bench) (ping-pong, 100 byte messages):

| Method | Throughput | 
|--------|-----------|
| Unix Signals | (broken — unreliable for data) |
| TCP Sockets (loopback) | 70,221 msg/s |
| Unix Domain Sockets | 130,372 msg/s |
| Anonymous Pipes | 162,441 msg/s |
| POSIX Message Queues | 232,253 msg/s |
| Named Pipes (FIFOs) | 265,823 msg/s |
| Shared Memory | 4,702,557 msg/s |
| Memory-Mapped Files | 5,338,860 msg/s |

### Depth analysis (block-size dependent)

From [IPC Performance Comparison (Baeldung)](https://www.baeldung.com/linux/ipc-performance-comparison):

| Method | 100B block | 1MB block |
|--------|-----------|-----------|
| Named Pipe | 318 Mbit/s (fastest) | 9,699 Mbit/s |
| UNIX Socket | 245 Mbit/s | 41,334 Mbit/s (fastest) |
| Anonymous Pipe | ~280 Mbit/s | 9,039 Mbit/s |
| TCP Socket | ~200 Mbit/s | ~30,000 Mbit/s |

**Key insight**: Pipes are faster for small messages (less setup overhead per send). Sockets are faster for large messages (better throughput once the connection is established). This is because pipes do less bookkeeping in the kernel per syscall.

### Unix Signals

Signals are **not suitable for IPC data transfer**:
- Carry no data (just a signal number)
- Non-real-time signals are not queued (can be lost)
- Interrupt process at arbitrary points — safe handlers are notoriously difficult
- Don't mesh well with multi-threaded programs

From [Unix IPC Practical Guide](https://unixy.io/blog/linux-ipc-practical-guide/):
> Signals are not really a communication mechanism. They are interrupts.

**Proper signal uses**: `SIGHUP` for config reload, `SIGTERM` for graceful shutdown, `SIGUSR1`/`SIGUSR2` for custom triggers (log rotation, status dump). Never for data.

### Unix Domain Sockets vs Pipes

**Unix domain sockets**:
- Bidirectional (one socket is enough for request-response)
- Filesystem-addressed (`/tmp/app.sock`) — easy to debug
- Support multiple clients (accept/connect pattern)
- 2-3× faster than TCP loopback (no network stack)
- Star topology (one server, many clients)

**Pipes (anonymous)**:
- Unidirectional (need two pipes for request-response)
- Parent-child relationship only
- Simplest possible API (just `write()` / `read()`)
- Zero configuration

**Named pipes (FIFOs)**:
- Same as pipes but addressable by filesystem path
- Can connect unrelated processes
- Still unidirectional (need two for bidirectional)

### Flux's Current Choice

Flux uses **anonymous pipes** (stdin/stdout of a spawned subprocess). This is the right choice because:
1. ✅ Parent-child relationship (Tauri app spawns plugins)
2. ✅ Small messages (RPC calls are <1KB) — pipes are fastest for small blocks
3. ✅ Request-response via JSON-RPC (bidirectional achieved with two pipes)
4. ✅ Zero config — no socket files, no port management
5. ✅ Composability — the `|` pattern in shell matches Flux's echo-test debugging

**If Flux needs to handle streaming (large binary data, video chunks)**:
- Switch to Unix domain sockets for throughput (350% faster for 1MB+ messages)
- Or use shared memory for zero-copy between host and plugin
- But this is only relevant for video/media plugins

**Practical guide** (rule of thumb):
- 90% of IPC needs: Unix domain sockets (general-purpose)
- Small messages, parent-child: Pipes (simplest) ← Flux here
- Extreme throughput: Shared memory
- Process control: Signals
- Cross-machine: TCP sockets (networking, not IPC)

Source: [Unix IPC Practical Guide](https://unixy.io/blog/linux-ipc-practical-guide/)

---

## 10. Plugin Hot-Reload

### The Core Pattern

Hot reload universally follows this lifecycle:

```
Detect change → Serialize state → Unload old → Load new → Deserialize state → Swap reference
```

The atomic swap is the critical safety mechanism — typically done with a `volatile` reference or read-write lock.

Source: [Java ClassLoader Architecture (2026)](https://mdsanwarhossain.me/blog-java-classloader-deep-dive.html)

### Approaches by Platform

#### Java ClassLoader-based (IntelliJ, Tomcat, OSGi)

Each plugin gets its own `URLClassLoader`. Hot-reload:
1. File watcher detects new JAR
2. Create new `ChildFirstClassLoader` for the new JAR
3. Load and instantiate new plugin
4. `activePlugin = newPlugin` (atomic due to `volatile`)
5. Close old ClassLoader

**Critical pitfalls**:
- **Metaspace OOM**: Each reload creates a new ClassLoader that loads classes. If the old ClassLoader isn't GC'd (because of static references to its classes), Metaspace fills up. Root cause: `ThreadLocal`, static registries, JDBC drivers.
- **ClassCastException**: Plugin API classes must be loaded by a SHARED parent ClassLoader. If plugin and host each have their own copy of the interface class, casts fail despite identical class names.
- **File locks**: On Windows, JAR files are locked by the ClassLoader until `close()` is called.

#### C++ Hot-Reload (Dynamic Libraries)

From the SaneCppLibraries plugin system:
1. `FileSystemWatcher` detects source changes
2. Serialize plugin state to buffers
3. `SystemDynamicLibrary::close()` — unload `.so`/`.dll`
4. `PluginCompiler` compiles + links new binary
5. `SystemDynamicLibrary::load()` — map into address space
6. Query new interface pointer
7. Deserialize state from buffers

Debouncing: File system watchers fire multiple events per save. A tolerance mechanism merges duplicate events before triggering reload.

Source: [SaneCppLibraries: Plugin System](https://deepwiki.com/Pagghiu/SaneCppLibraries/4-plugin-system)

#### Java Hotswap Agent (JVM Instrumentation)

Uses `java.lang.instrument.ClassFileTransformer` to intercept class loading:
- `@Plugin` annotation marks plugin classes
- `@OnClassLoadEvent` matches class name patterns
- `@Init` injects state (ClassLoader, Watcher, Scheduler)
- Per-ClassLoader plugin instances (handles multiple Spring contexts in same JVM)

Key trick: **Per-ClassLoader isolation** — plugin instances are created per application ClassLoader, not globally.

Source: [Hotswap Plugin Framework](https://deepwiki.com/java-hot-deploy/debug-tools/5.2-hotswap-plugin-framework)

#### TypeScript/Node.js Hot-Reload

The `plugin-loader` NPM package demonstrates:
```typescript
manager.watch(['./plugins/*'], (id, event, error) => {
    if (event === 'reload') {
        // Plugin reloaded in-place
    }
});
```

Uses file watchers + dynamic `require()`/`import()` — Node's module cache is cleared for the changed module. This works because Node's `require()` caches by file path; deleting the cache entry forces re-evaluation.

Source: [plugin-loader GitHub](https://github.com/LibriaForge/plugin-loader)

#### APISIX Java Plugin Runner

Apache APISIX hot-reload:
1. Java `WatchService` monitors source directory
2. `ToolProvider.getSystemJavaCompiler()` recompiles modified files
3. `DynamicClassLoader` loads new `.class` files
4. `BeanDefinitionBuilder` registers new beans in Spring context
5. Old beans removed via `registry.removeBeanDefinition()`

Source: [APISIX Java Plugin Runner: Hot Reload](https://deepwiki.com/apache/apisix-java-plugin-runner/4.3-hot-reload-development)

### GraalVM Truffle HotSwap Plugin API

For languages on Truffle (Java, JS, Python, Ruby):
- `registerClassInitHotSwap()` — re-run static initializers on class change
- `registerMetaInfServicesListener()` — detect new service implementations
- `postHotSwap()` — reload framework context (Micronaut, Spring)

Source: [GraalVM HotSwap Plugin API](https://www.graalvm.org/22.0/reference-manual/java-on-truffle/hotswap-plugin/index.html)

### Relevance to Flux

Flux currently spawns plugins at startup and never reloads them. To add hot-reload:

**Option A: Subprocess restart (simplest)**:
1. File watcher detects `plugin.json` or source changes
2. Send `SIGTERM` to old plugin process
3. Spawn new plugin process (same `spawn_plugin` code)
4. Atomically swap `PluginHandle` in the plugins Vec

**Trade-offs**:
- ✅ Simple — reuses existing spawn infrastructure
- ✅ Clean isolation — OS handles cleanup
- ❌ Process startup latency (50-200ms for Bun/Node)
- ❌ Plugin state lost (must be persisted externally)
- ❌ Active requests fail during restart window

**Option B: Per-plugin ClassLoader (if WASM-based)**:
- WASM modules can be instantiated, used, and dropped atomically
- No process restart needed
- State can be passed from old instance to new instance
- Atomic reference swap for zero-downtime

**Option C: Feature flags with watch channel**:
Use Tokio's `watch` channel to propagate plugin registry state:
```rust
let (state_tx, mut state_rx) = watch::channel(AppState { plugins: vec![] });
// On reload:
state_tx.send(new_state)?;
// All consumers pick up new state automatically
```
Source: [Tokio watch docs](https://docs.rs/tokio/latest/tokio/sync/index.html)

**Key lessons from research**:
1. **Shared API contract**: Flux's manifest types and RPC protocol must be stable across reloads. A plugin compiled for v1 protocol must work after host upgrade.
2. **State persistence**: Before killing a plugin, allow it to serialize state (or persist state externally via filesystem as Flux already does with `.youtube-cookie`).
3. **Atomic swap**: Use `volatile` or `RwLock` pattern for the plugin reference — in-flight requests should complete with the old instance; new requests go to the new instance.
4. **Grace period**: Unix signals (SIGTERM) followed by SIGKILL after timeout is the standard graceful shutdown pattern.
