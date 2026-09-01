# Flux: Research Synthesis & Recommendations

> Generated 2026-07-26 from 4 parallel research agents covering 10 comparable systems, 10 IPC/plugin runtime patterns, 10 frontend architecture patterns, and 10 architecture design patterns. Full source docs at `reference/research-*.md`.

---

## Executive Summary

Flux's subprocess-plugin architecture is **already well-positioned** compared to most systems studied. However, the research reveals **10 concrete, high-impact improvements** — some quick wins, some deep overhauls. They're ranked by impact:eﬀort below.

---

## Quick Wins (1-2 days each)

### 1. Parallelize WC loading at startup

**Problem:** `App.tsx` loads frontend Web Components sequentially in a `for...of` loop. Each WC must finish fetching, parsing, and executing before the next starts. With 5 bundles at ~160KB each (~800KB total), this adds 500ms-2s of sequential blocking.

**Fix:** Load all WC scripts concurrently with `Promise.all`:

```typescript
const tagPromises = tags.map(async (tag) => {
  const result = await window.__pluginRpc("core-static.read", { path: `build/plugins/${tag}.js` })
  const script = document.createElement("script")
  script.textContent = result.code
  document.body.appendChild(script)
  await customElements.whenDefined(tag)
})
await Promise.all(tagPromises)
```

**Source:** `reference/research-architecture-patterns.md:384` — Architecture patterns agent

### 2. Defer non-critical frontend plugins

**Problem:** The `player-modal` is loaded at startup but only used when a user clicks a video. The `yt-search` WC exists but may not be visible on first load. All are loaded eagerly.

**Fix:** Defer modal and search-card loading to first interaction:

```typescript
window.addEventListener("video.player.load", async () => {
  if (!loaded.has("player-modal")) {
    loaded.add("player-modal")
    await loadFrontend("build/plugins/player-modal.js")
  }
}, { once: true })
```

**Source:** `reference/research-comparable-systems.md:162` — VS Code lazy activation model

### 3. Surface plugin lifecycle errors to the UI

**Problem:** When a plugin fails to spawn, the Rust host logs `"failed to spawn plugin: yt-feed"` to stderr — the user sees nothing. Failed plugins are silently absent, leaving confusing empty states.

**Fix:** Track plugin states in the Rust host and expose a status endpoint. Show degraded banners in the feed-widget: "YouTube feed unavailable — other feeds still work."

**Source:** `reference/research-architecture-patterns.md:349` — Graceful degradation agent

### 4. Move yt-auth cookie to OS-standard app data

**Problem:** The cookie file is stored at `plugins/youtube/.youtube-cookie` — a path inside the project directory that won't exist in production builds and may not be writable.

**Fix:** Use `tauri-plugin-store` or the OS app data directory (via `app_data_dir()` from `tauri::api::path`). Pass the storage path to plugins via environment variable on spawn.

**Source:** `reference/research-architecture-patterns.md:502` — Configuration persistence agent

### 5. Actor pattern for pending-request dispatch

**Problem:** `lib.rs:86` uses `Arc<Mutex<HashMap<u64, oneshot::Sender>>>` for matching RPC responses. This is correct but risks deadlock if the mutex is held across `.await` points. Every request involves two lock acquisitions (insert + remove).

**Fix:** Replace with an mpsc-based actor task that owns the map:

```rust
enum PluginCommand {
  Send { id: u64, line: String, reply: oneshot::Sender<Result<Value, String>> },
}
let (cmd_tx, mut cmd_rx) = mpsc::channel::<PluginCommand>(64);
```

The actor owns the pending map exclusively — no Mutex, no contention, built-in backpressure.

**Source:** `reference/research-ipc-and-plugin-runtimes.md:104` — Tokio channel patterns agent

---

## Medium Improvements (1-2 weeks each)

### 6. Plugin health monitoring + auto-restart

**Problem:** If a plugin subprocess crashes, the Rust host keeps its `PluginHandle` in the routing table. Subsequent calls hang for 15s timeout before failing. The slot is never cleaned up until app restart.

**Lessons from:**
- **VS Code**: Extension Host has a 3s watchdog — if it hangs, VS Code shows a banner and offers "Restart Extension Host"
- **Home Assistant**: s6-overlay supervises each add-on container, auto-restarting on crash
- **KeePassXC**: Proxy process reconnects if KeePassXC restarts

**Fix:** Add a per-plugin health check task in the Rust host that pings each plugin with a lightweight `ping` method every 30s. On failure: (1) mark plugin as degraded, (2) attempt restart (kill + re-spawn), (3) if 3 consecutive restarts fail, mark permanently failed and notify frontend.

**Source:** `reference/research-comparable-systems.md:936` — Lifecycle sophistication table

### 7. CQRS + SQLite feed cache

**Problem:** Feed items are fetched fresh on every load. No persistent cache. If the network is down or a source is slow, the user sees loading spinners or errors. The feed is a pure pull model.

**Fix:** Introduce a lightweight SQLite cache via `tauri-plugin-sql`:

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

Load from cache first (instant render), then background-refresh from network. This "stale-while-revalidate" pattern gives instant perceived performance.

Also enables offline mode and reduces API rate-limit pressure.

**Source:** `reference/research-architecture-patterns.md:133` — CQRS/Event Sourcing agent

### 8. Structured event bus with typed schemas

**Problem:** Cross-component communication uses raw `CustomEvent` on `window` with ad-hoc string names. No type safety, no request-response, no validation. The known issue in AGENTS.md (event name mismatch) is a symptom.

**Fix:** Replace raw events with a typed event bus using Zod schemas:

```typescript
const events = new EventBus()

// Define typed events
events.define("video.player.load", z.object({ url: z.string(), title: z.string() }))
events.define("video.modal.show", z.object({ playerTag: z.string() }))

// Dispatch with validation
events.emit("video.player.load", { url, title }) // Runtime-validated

// Listen with typed handler
events.on("video.player.load", ({ url, title }) => { ... })
```

Under the hood, it still uses CustomEvent, but the schema layer catches mismatches at development time and provides discoverable documentation.

**Source:** `reference/research-frontend-architecture.md:588` — State management agent; `reference/research-comparable-systems.md:167` — VS Code typed IPC agent

---

## Major Overhauls (2-4 weeks each)

### 9. Shared React instance + Module Federation–like dependency management

**Problem:** Each frontend WC bundles its own copy of React (~40KB compressed, ~160KB uncompressed). With 5 WCs, that's ~200KB of duplicate React. They cannot share context, Suspense boundaries, or state.

**Lessons from:**
- **Module Federation**: `shared: { react: { singleton: true } }` deduplicates deps at runtime
- **Salesforce LWC**: Compiler architecture that externalizes framework core
- **GitHub Catalyst**: ~2.5KB custom elements library that avoids framework duplication

**Fix options (best first):**

**Option A — React externalized as global:** In the Vite build config for plugins, externalize `react` and `react-dom` to a shared global loaded once by the host. Plugin bundles shrink from ~160KB to ~10-30KB. The host loads React once before any plugin script.

**Option B — Use Module Federation:** Switch from IIFE + script injection to Webpack/Rspack Module Federation. Plugin builds become `remoteEntry.js` modules. The host federates them at runtime. This buys shared dependency management, type-safe remote imports, and a mature ecosystem — at the cost of requiring all participants to use the same bundler.

**Option C — Import maps:** Use import maps to resolve React to a single URL. Supported in modern browsers (Chrome 89+, Firefox 108+, Safari 16.4+). Tauri's WebView supports them. This is the least invasive option but requires ESM output instead of IIFE.

**Source:** `reference/research-frontend-architecture.md:13` — Module Federation agent; `reference/research-frontend-architecture.md:114` — LWC agent

### 10. WASM-based plugin runtime (via Extism)

**Problem:** Subprocess plugins have 50-200ms startup latency per process, context-switch overhead for every RPC call (~50-200μs), and no fine-grained permission control. The plugin can access the full filesystem and network.

**Lessons from:**
- **Extism/Wasmtime**: Wasm sandbox provides memory isolation, fine-grained host functions, ~1ms instantiation
- **VS Code Extension Host**: Process isolation with restartability — Flux's subprocesses are the same model
- **Lua embedding (mlua, Neovim)**: In-process scripting with microsecond calls
- **Helix**: Chose Scheme (embedded interpreter) over WASM for simplicity

**Fix:** Replace subprocess plugins with Extism WASM plugins:

| Aspect | Subprocess (current) | WASM (proposed) |
|--------|---------------------|-----------------|
| RPC latency | 50-200μs + serialization | 1-5μs (function call) |
| Startup | 50-200ms per process | ~1ms instantiation |
| Isolation | OS process boundary | Wasm memory sandbox |
| Security | Full OS access | Fine-grained host functions |
| Languages | Any with stdin/stdout | Any → Wasm (Rust, Go, TS, Python, C#) |
| State | Persistent (process lives) | Persistent (linear memory) |

**Migration path:**
1. Keep both systems in parallel — subprocess for existing plugins, WASM for new ones
2. Add an Extism host in `lib.rs` alongside the subprocess router
3. Add `wasm` field to manifest (alternative to `run`)
4. Migrate high-value plugins (yt-feed, yt-auth) to WASM first
5. Deprecate subprocess when all plugins are migrated

**Trade-offs:**
- Async host function calls are still evolving in Extism
- Wasm ecosystem is smaller than npm
- Debugging Wasm is harder than debugging a Node subprocess
- Plugin authors would need to compile to Wasm (but PDKs for 8+ languages exist)

**Source:** `reference/research-ipc-and-plugin-runtimes.md:360` — WASM plugin runtimes agent

---

## Architecture Pattern Summary

| Principle | Flux Current State | Target State |
|-----------|-------------------|--------------|
| **Hexagonal Architecture** | Implicit protocol, plugin-by-name routing | Formal typed ports, host-routed by capability |
| **Domain-Driven Design** | No shared domain model | Core domain types (`Video`, `FeedItem`) with value objects |
| **CQRS** | Read+write mixed, no event store | Separate query/command paths, SQLite projections |
| **Microkernel** | Plugins reference each other by name | Enforced Independent Plugin Principle via extension points |
| **Registry/Service Locator** | Ad-hoc via manifest array passing | Central `PluginRegistry` with typed capability resolution |
| **Dependency Injection** | Hardwired property setters on WC wrappers | Lightweight DI container with Composition Root in App.tsx |
| **Graceful Degradation** | Per-source error banners, no crash isolation | Error boundaries per WC, stale-while-revalidate cache, safe mode |
| **Resilience** | Timeouts only (15s per-source) | Retry + backoff, circuit breaker per plugin, health monitoring |
| **Persistence** | Cookie in project dir, no cache | tauri-plugin-store for prefs, SQLite for feed cache |

---

## Recommended Reading Order

If you want to tackle these incrementally:

1. **Quick wins** (1-5) — measurable improvement, low risk, get them done first
2. **Feed cache + CQRS** (7) — the biggest UX improvement: instant feed loads
3. **Structured event bus** (8) — eliminates the bug class that causes the known event-name-mismatch issue
4. **Plugin health monitoring** (6) — makes the app robust enough for daily use
5. **Shared React** (9) — cuts bundle sizes ~80%, enables cross-plugin state sharing
6. **WASM runtime** (10) — the most transformative but most invasive; only after everything else works

---

## Research Source Files

All four research documents are in `reference/`:

- `reference/research-comparable-systems.md` — 10 plugin systems analyzed (969+ lines)
- `reference/research-ipc-and-plugin-runtimes.md` — IPC patterns, Tokio channels, WASM, Lua (829 lines)
- `reference/research-frontend-architecture.md` — Micro-frontends, WCs, Module Federation, Tailwind+Shadow DOM (629 lines)
- `reference/research-architecture-patterns.md` — Hexagonal, DDD, CQRS, Microkernel, DI, resilience (561 lines)
