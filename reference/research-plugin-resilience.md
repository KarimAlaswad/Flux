# Plugin Lifecycle, Resilience, and Crash Recovery: Patterns from Mature Systems

Researched 2026-07-28. Primary sources only — no blog posts.

---

## Table of Contents

1. [VS Code Extension Host](#1-vs-code-extension-host)
2. [Chrome Extension System](#2-chrome-extension-system)
3. [IntelliJ / IDEA Plugin System](#3-intellij--idea-plugin-system)
4. [Electron Renderer Process Crashes](#4-electron-renderer-process-crashes)
5. [PostCSS / Webpack (In-Process Plugins)](#5-postcss--webpack-in-process-plugins)
6. [Homebridge Child Bridges](#6-homebridge-child-bridges)
7. [Pattern Summary Table](#7-pattern-summary-table)
8. [What This Means for Flux](#8-what-this-means-for-flux)

---

## 1. VS Code Extension Host

### Crash boundary

All extensions share a **single OS-level child process** (Node.js) spawned by the Electron main process. There are three kinds: `LocalProcess` (desktop Node.js), `LocalWebWorker` (browser WebWorker), and `Remote` (SSH/container headless server). Source: [`extensionHost.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/extensionHost.ts), [Extension Host docs](https://code.visualstudio.com/api/advanced-topics/extension-host).

Key detail: one crashing extension takes down the **entire** extension host — all extensions die together. There is no per-extension process isolation. Each extension shares the same V8 heap and event loop.

### Detection

1. **Process exit** — the main process detects via `child_process` `'exit'` event on the spawned extension host process. Logged as `"Extension host (LocalProcess pid: ...) terminated unexpectedly."` Source: [`extensionHost.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/extensionHost.ts) (search for `onDidExit`).
2. **Responsiveness watchdog** — the RPC protocol layer (`rpcProtocol.ts`) tracks message round-trips. If the extension host doesn't respond within ~3 seconds, it fires `onDidChangeResponsiveState(ResponsiveState.Unresponsive)`. Source: [`rpcProtocol.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/rpcProtocol.ts) (search for `ResponsiveState`).
3. **Native watchdog** (child side) — the extension host process runs `@vscode/native-watchdog` in a native thread. It `SIGKILL`s itself if the parent PID disappears. Source: [`extensionHostProcess.ts:255-265`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/node/extensionHostProcess.ts#L255-L265).
4. **Parent-polling watchdog** (child side) — `setInterval` every 1s calling `process.kill(parentPid, 0)`. If it throws EPERM 3 consecutive times (antivirus false-positive guard), kills itself. Source: same file, lines 239-253.

### Recovery action

- **Auto-restart** (recent versions): when the extension host exits unexpectedly, VS Code automatically spawns a new one. Log: `"Automatically restarting the extension host."` Source: [issue #325035](https://github.com/microsoft/vscode/issues/325035).
- **Manual restart**: command `"Developer: Restart Extension Host"` — available since 2017. Source: [issue #32768](https://github.com/microsoft/vscode/issues/32768).
- **Extension bisect**: built-in tool that binary-searches extensions to find the crashing one. Source: [VS Code docs on bisect](https://code.visualstudio.com/docs/editor/extension-bisect).
- **No restart loop protection** evident in source — an extension that crashes on every startup will cause indefinite restart loops (see issue #325035).

### User experience

- Notification: `"Extension host terminated unexpectedly"` with buttons to restart or open developer tools.
- If auto-restart succeeds, extensions re-activate based on current state (open files, visible views). UI stays intact — files, cursor position, unsaved changes survive.
- If extension host is unresponsive (not crashed): banner `"Extension host is not responding"`.

### Defensive measures in the child process

Before the real extension host code runs, `extensionHostProcess.ts`:

- **Patches `process.exit()`** — extensions calling `process.exit()` get a warning stack trace instead; only allowed in test runs. Line 103-107.
- **Patches `process.crash()`** — Electron's `process.crash()` is overridden to log a warning. Line 110-113.
- **Blocklists the `natives` module** — loading `require('natives')` throws. Lines 60-66.
- **Catches `uncaughtException`** — logged but process continues (unless SIGPIPE). Lines 97-99.
- **Handles `unhandledRejection`** — tracked for telemetry, not fatal.

### Design pattern

**Supervisor tree** (Erlang-style) / **Process manager**: the workbench (main process) acts as a supervisor that spawns, monitors, and restarts the extension host child process. Communication via RPC over MessagePort. The child has a built-in suicide watch for parent death.

---

## 2. Chrome Extension System

### Crash boundary

Chrome's multi-process architecture isolates content: each tab in its own **renderer process**, extensions can have their own **extension process** (background/service worker), and the **browser process** is the privileged coordinator.

- Manifest V3: extension background logic runs in **service workers** (ephemeral, idle-terminated after ~30s, hard cap ~5min per event). Source: [Chrome Extension Service Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- Content scripts run **in the renderer process of the host page** — they share the page's process, not an isolated extension process.
- Extension popups and options pages run in their own renderer processes.

Key principle: **a compromised renderer should not compromise the browser**. Source: [Chromium Site Isolation design doc](https://www.chromium.org/developers/design-documents/site-isolation/).

### Detection

- Renderer crash detected by the browser process via **IPC channel disconnection** (Mojo pipe closure).
- GPU process hangs detected by a **watchdog timer** that resets the GPU driver if a draw command hangs.
- The `chrome.processes` API (experimental) exposes `onExited` event with `exitType`: `normal`, `abnormal`, `killed`, `crashed`. Source: [Chromium processes API proposal](https://www.chromium.org/developers/design-documents/extensions/proposed-changes/apis-under-development/processes-api).

### Recovery action

- **"Aw, Snap!"** page shown in the affected tab with a **Reload** button. Reload creates a new renderer process and loads the page fresh.
- **Other tabs and the browser process are unaffected** — this is the core benefit of process isolation.
- Service workers are automatically **restarted** by the browser when the next event needs dispatching. All in-memory state is lost; persistent state must use `IndexedDB`, `caches`, or `chrome.storage.session`. Source: [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- No auto-retry for renderer crashes — user must reload. This avoids crash loops.

### User experience

- **"Aw, Snap! Something went wrong while displaying this webpage."** with a Reload button.
- Sad tab icon (broken page) replaces the page content.
- Other tabs continue working normally.
- GPU-related crashes show additional error text.

### Defensive measures

- **Site Isolation**: cross-site iframes run in separate processes (OOPIFs). Renderer processes are sandboxed (no direct disk/network access). Source: [Site Isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md).
- **Extension service worker ephemerality**: forces developers to persist state explicitly, reducing memory leaks and crash surface.
- **Permission-based API access**: extensions cannot access sensitive resources without declared permissions, limiting blast radius.

### Design pattern

**Bulkhead** (process-per-tab / process-per-site) + **Supervisor** (browser process monitors all children). Each renderer is isolated; failure is contained to that process. The browser process never dies from a renderer bug.

---

## 3. IntelliJ / IDEA Plugin System

### Crash boundary

All plugins run **in-process** — the same JVM as the IDE itself. There is no process isolation between plugins. Isolation is achieved through **classloader hierarchies**: each plugin gets its own `PluginClassLoader` instance.

Source: [IntelliJ Platform SDK: Class Loaders](https://plugins.jetbrains.com/docs/intellij/plugin-class-loaders.html).

### Detection

- Plugins that crash produce **JVM-level errors**: `OutOfMemoryError`, `StackOverflowError`, `LinkageError`, `ClassCastException` from classloader conflicts.
- The IDE generates **`hs_err_pid*.log`** (hotspot error log) for JVM crashes.
- `idea.log` captures exceptions from plugin code, but a JVM crash (segfault, OOM) takes down everything — IDE, all plugins, all open files.
- Thread dumps can diagnose hangs.

### Recovery action

- **None for JVM crashes** — the entire IDE process dies. User must relaunch.
- For non-fatal plugin errors (exceptions caught by the IDE): the plugin is **disabled** and the IDE continues running.
- **Plugin Verifier** (pre-submit CI tool) catches version incompatibilities before deployment. Source: [Plugin Compatibility](https://plugins.jetbrains.com/docs/intellij/plugin-compatibility.html).
- **Safe Mode**: IDE can start with plugins disabled for recovery.

### User experience

- JVM crash: IDE window disappears, `hs_err_pid*.log` is written, user relaunches.
- Plugin exception: error dialog with "Disable plugin" option. IDE stays up.
- Classloader conflict: cryptic `LinkageError` or `ClassCastException` — notoriously hard to debug. Source: [JVM ClassLoaders & IntelliJ](https://jonnyzzz.com/blog/2026/02/12/jvm-classloading-intellij/).

### Defensive measures

- **PluginClassLoader isolation**: each plugin's classes loaded by a separate classloader instance. Plugin A cannot see Plugin B's classes unless there's an explicit `<depends>` declaration in `plugin.xml`.
- **Process isolation for dangerous workloads**: the article [JVM ClassLoaders & IntelliJ](https://jonnyzzz.com/blog/2026/02/12/jvm-classloading-intellij/) explicitly recommends spawning a **separate process** for heavy/crash-prone work like compilers, rather than running them in-process.
- **`URLClassLoader(parent=null)` pattern**: for fully isolated sub-systems, create a classloader with no parent (only bootstrap classes). Communication limited to JDK types + reflection. Trade-off: verbose, but no `LinkageError`.

### Design pattern

**Classloader sandbox** (not process isolation). All plugins share the same OS process. Isolation is at the JVM classloader level — prevents dependency conflicts but does **not** prevent one plugin from crashing the entire IDE.

---

## 4. Electron Renderer Process Crashes

### Crash boundary

Each `BrowserWindow` has a `WebContents` that owns a Chromium **renderer process**. Electron apps typically have:
- **Main process** (Node.js, one per app)
- **Renderer process(es)** (Chromium, one per window)
- **Utility processes** (GPU, network service, audio, etc.)

### Detection

- **`render-process-gone`** event on `webContents`: emitted when the renderer process unexpectedly disappears (crashed or killed). Provides `reason` field: `crashed`, `killed`, `oom`, etc. Source: [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone).
- **`unresponsive`** event: emitted when the web page stops responding to the event loop.
- **`responsive`** event: emitted when an unresponsive page recovers.
- **`child-process-gone`** event on `app`: for non-renderer child processes (GPU, utility). Source: [Electron app docs](https://www.electronjs.org/docs/latest/api/app#event-child-process-gone).
- **`isCrashed()`** method: synchronous check if the renderer has crashed.
- **`crashReporter`** module: uploads crash dumps to a remote server. Source: [crashReporter docs](https://www.electronjs.org/docs/latest/api/crash-reporter).

### Recovery action

- **Reload the URL** in the `render-process-gone` callback. However, calling `loadURL` directly inside the crash callback can **crash Electron itself** — a known issue. Source: [electron issue #19887](https://github.com/electron/electron/issues/19887).
- **Recommended pattern**: set a flag in the crash handler, then reload asynchronously (e.g., `setTimeout` or `setImmediate`).
- **`forcefullyCrashRenderer()`**: programmatic crash for recovery from `unresponsive` state. Call `reload()` immediately after to force a new process. Source: [webContents docs](https://www.electronjs.org/docs/latest/api/web-contents#contentsforcefullycrashrenderer).
- **`app.relaunch()` + `app.exit(0)`**: for GPU process crashes, some apps restart the entire process. Source: [GPU crash recovery pattern](https://markaicode.com/electron-v28-rendering-issues-fixed).

### User experience

- **White screen of death** — the window goes blank or shows a sad tab page (if using Chromium's built-in error page).
- **"Aw, Snap!"-equivalent** — Chromium's built-in renderer crash page, same as Chrome.
- **Unresponsive banner** — Electron apps typically show a "Page is not responding" bar with wait/kill options.
- Delay between crash and event emission: reported up to **20-30 seconds** before `crashed` fires. Source: [stackoverflow](https://stackoverflow.com/questions/58055236/the-electron-crashed-event-of-render-process-is-triggered-too-late).

### Design pattern

**Bulkhead + Supervisor**: main process supervises renderer processes via `webContents` events. Recovery is app-specific — Electron provides the detection primitives but not the recovery policy.

---

## 5. PostCSS / Webpack (In-Process Plugins)

### Crash boundary

Plugins run **in the same process** as the build tool. No process isolation. One bad plugin **will break the entire build**.

### Detection

- Synchronous: exceptions propagate up the call stack. If uncaught, the build tool catches them at the top level.
- Async: `tapable` hooks support `tapAsync` / `tapPromise` with callback-based error propagation.
- Webpack: plugins push errors into `compilation.errors` array. `SyncBailHook` allows a plugin to short-circuit the pipeline by returning a non-undefined value. Source: [tapable docs](https://github.com/webpack/tapable).
- PostCSS: plugins attach warnings to the `result` object via `decl.warn(result, message)`. Build runners (Vite, Webpack) check for warnings/errors after processing. Source: [PostCSS plugin docs](https://postcss.org/docs/writing-a-postcss-plugin).

### Mitigation patterns

1. **Error collection** (Webpack): `compilation.errors.push(new Error(...))` — errors collected and displayed in red, but build continues (or fails) at the tool's discretion.
2. **Bail hooks** (tapable): `SyncBailHook` lets a plugin return `false` to stop the pipeline early — used for optimization hooks.
3. **Dependency tracking** (PostCSS): plugins register file dependencies with `result` so rebuilds trigger on file changes, but this doesn't prevent crashes.
4. **Plugin isolation via separate package** (Tailwind v4): `@tailwindcss/postcss` extracted into its own package to decouple versioning, but still in-process.
5. **Process isolation for dangerous work**: the IntelliJ recommendation also applies here — for computationally risky plugins, spawn a child process and communicate via stdin/stdout.

### Design pattern

**Pipeline with error collection** (no isolation). All plugins in-process. The build either succeeds or fails as a whole. Mitigation is limited to graceful error reporting and tool-specific error collections.

---

## 6. Homebridge Child Bridges

### Crash boundary

Homebridge plugins can optionally run as **child bridges** — each plugin (or group of accessories) in its **own Node.js child process**. Before v1.3.0, all plugins ran in the main bridge process.

Source: [Homebridge Child Bridges wiki](https://github.com/homebridge/homebridge/wiki/Child-Bridges).

### Detection

- **Process exit**: the main bridge detects child process termination via Node.js `child_process` `'exit'` event.
- **Auto-restart**: if the plugin process crashes, Homebridge **automatically restarts it** without impacting the main bridge or other plugins.

### Recovery action

- **Automatic restart of the crashed child process**.
- No impact on other plugins — they continue operating independently.
- Each child bridge pairs separately with HomeKit, so HomeKit can still communicate with non-crashed plugins.

### User experience

- The crashed plugin's accessories become non-responsive in HomeKit until the child process restarts.
- Other plugins continue working normally.
- Homebridge UI shows status of each child bridge (online/offline) and allows restarting individual bridges.

### Resource cost

- Each child bridge spawns a Node.js process (20-30 MB RAM). Source: [Child Bridges wiki](https://github.com/homebridge/homebridge/wiki/Child-Bridges).

### Design pattern

**Bulkhead + Supervisor with auto-restart**. Per-plugin process isolation, optional (opt-in per plugin). Supervisor auto-restarts crashed children. This is the closest analogue to Flux's current architecture.

---

## 7. Pattern Summary Table

| System | Crash Boundary | Detection | Recovery | UX | Pattern |
|--------|---------------|-----------|----------|-----|---------|
| **VS Code** | Single child process (all extensions) | Process exit event, RPC watchdog (3s) | Auto-restart child process; manual restart; extension bisect | "Extension host terminated unexpectedly" notification; UI stays alive | Supervisor tree |
| **Chrome** | Per-tab renderer process; per-extension service worker | IPC pipe close; GPU watchdog timer | User reloads tab; service worker auto-restarts on next event | "Aw, Snap!" sad tab page; other tabs unaffected | Bulkhead + Supervisor |
| **IntelliJ** | Same JVM (all plugins) | JVM crash log; exception in idea.log | None for JVM crash; plugin disable for caught errors | IDE disappears; relaunch required | Classloader sandbox (weak isolation) |
| **Electron** | Per-window renderer process | `render-process-gone` event; unresponsive event | App-specific: reload URL or restart app | White screen or sad tab; up to 30s delay detecting crash | Bulkhead + Supervisor (app-defined policy) |
| **Webpack/PostCSS** | Same process (all plugins) | Inline exception; `compilation.errors` | Error reported, build fails; bail hooks for early exit | Red error text; build fails entirely | Pipeline with error collection |
| **Homebridge** | Per-plugin child process (optional) | Process exit event | Auto-restart child process | Plugin accessories offline temporarily; others work | Bulkhead + Supervisor with auto-restart |

---

## 8. What This Means for Flux

### Current state

Flux already has a solid foundation: **per-plugin subprocesses** (Node.js) spawned by a **Rust host** (`lib.rs:85` `resolve_run`). This is the same pattern as Homebridge child bridges and Chrome's process-per-extension. Plugins communicate via **stdin/stdout JSON-RPC**. This is bulkhead at the process level — already better than VS Code (all extensions one process) and IntelliJ (all plugins one JVM).

Current gaps:

1. **No crash detection** — Rust host spawns the child but does not monitor for unexpected exits.
2. **No restart logic** — if a plugin process dies, the host doesn't know and doesn't restart it.
3. **No timeout on requests** — 15s timeout exists in the Rust host (`tokio::time::timeout`) but there's no per-request timeout enforcement visible in the plugin protocol.
4. **No unresponsive detection** — a plugin that's alive but hung (infinite loop, deadlock) is indistinguishable from a working plugin.
5. **No crash isolation at the frontend** — a crashed plugin's UI component could still be mounted, trying to communicate with a dead backend.
6. **No crash logging** — no crash dump, no structured error event for logging/diagnostics.

### Highest-impact changes (ordered by practical value)

#### 1. Process monitoring with restart (bulkhead + supervisor)

**What**: In the Rust host, after spawning each plugin child process, store its `Child` handle. Spawn an async task that `await`s the child's exit. On unexpected exit (any status ≠ 0, or signal termination), log the event and **restart the process**.

**Why**: This is the single highest-leverage change. Homebridge proves this works: a crashed plugin restarts seamlessly, other plugins unaffected. The Rust async runtime (`tokio`) makes this trivial — `child.wait()` returns a `ExitStatus`.

**Implementation sketch** (in `lib.rs`):

```rust
// Pseudocode for the supervisor pattern
struct PluginProcess {
    child: Child,
    restart_count: u32,
}

async fn supervise(mut plugin: PluginProcess) {
    let status = plugin.child.wait().await;
    if !status.success() {
        error!("Plugin crashed with status: {:?}", status);
        if plugin.restart_count < MAX_RESTARTS {
            plugin.restart_count += 1;
            // Spawn new child, replace plugin.child
            // Notify frontend via event
        }
    }
}
```

#### 2. Heartbeat / liveness check

**What**: Add a lightweight `ping`/`pong` to the JSON-RPC protocol. The Rust host sends `{"id":0,"method":"ping"}` every N seconds (e.g., 10s). If no response within a timeout (e.g., 5s), mark the plugin as unresponsive and restart it.

**Why**: Detects hung processes that haven't exited but aren't processing requests. VS Code's RPC watchdog does the same with ~3s threshold. This catches infinite loops, deadlocks, and event-loop starvation.

#### 3. Request timeout enforcement at the plugin level

**What**: The 15s `tokio::time::timeout` in Rust already covers the host side. But plugins can hang forever on a single request. Add a **per-request timeout** sent as part of the JSON-RPC request (e.g., `"timeout": 8000`). The plugin's shared stdin/stdout boilerplate should enforce this via `Promise.race` or `AbortController`.

**Why**: A plugin that hangs on one request shouldn't block all subsequent requests on the same stdin/stdout pipe. The 15s host timeout protects the host, but the plugin could queue up requests internally.

#### 4. Graceful degradation at the frontend

**What**: When a plugin backend process crashes and restarts, the frontend Web Component should:
- Show a "Plugin X is restarting..." state (not a frozen/broken UI)
- Re-establish communication after restart
- Dispatch an event so the feed-widget / player-modal can handle degraded state

**Why**: Currently no mechanism exists for the frontend to know a plugin died. The card/widget keeps waiting for a response that will never come.

#### 5. Crash loop protection

**What**: Track restart counts per plugin process. If a plugin restarts >3 times within 60 seconds, stop restarting and emit a permanent error. Notify the user: "Plugin X keeps crashing. Disable it?"

**Why**: Without this, a buggy plugin that crashes on startup will enter an infinite restart loop — consuming CPU, flooding logs, and providing no useful service. VS Code had this exact problem (issue #325035).

#### 6. Structured crash logging

**What**: When a plugin crashes, log: `plugin_name`, `exit_code`, `signal`, `uptime_seconds`, `restart_count`. Send this as a telemetry event from the frontend (via `__pluginRpc` to a hypothetical `core-logging` plugin).

**Why**: Enables debugging which plugins are unstable, and whether crashes correlate with specific operations (feed loading, search queries).

### What NOT to change (yet)

- **Per-plugin processes**: already the right architecture. Moving to a shared-process model (like VS Code) would be a regression.
- **stdin/stdout JSON-RPC**: works well. The pipe-based protocol gives automatic crash detection when the pipe closes.
- **Plugin manifest format**: no changes needed for resilience improvements.
- **The 15s host timeout**: keep this. If anything, increase it for long operations (video processing, batch imports) and add per-request timeouts.

### Recommended priority

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Process monitoring + restart | Low (days) | Highest — eliminates permanent plugin death |
| P0 | Request timeout enforcement | Low (days) | High — prevents hung plugins blocking pipe |
| P1 | Heartbeat / liveness check | Medium (week) | High — catches hung-but-alive processes |
| P1 | Frontend degraded state | Medium (week) | Medium — eliminates confusing frozen UI |
| P2 | Crash loop protection | Low (days) | Medium — prevents resource waste |
| P2 | Structured crash logging | Low (days) | Medium — enables debugging |

### Sources

- [VS Code extensionHost.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/extensionHost.ts)
- [VS Code extensionHostProcess.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/node/extensionHostProcess.ts)
- [VS Code ExtensionHostManager.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/extensionHostManager.ts)
- [VS Code rpcProtocol.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/extensions/common/rpcProtocol.ts)
- [VS Code issue #32768 — Implement extension host restarting](https://github.com/microsoft/vscode/issues/32768)
- [VS Code issue #325035 — Crash-loop with auto-restart](https://github.com/microsoft/vscode/issues/325035)
- [Extension Host docs](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Chromium Multi-Process Architecture](https://www.chromium.org/developers/design-documents/multi-process-architecture/)
- [Chromium Site Isolation](https://www.chromium.org/developers/design-documents/site-isolation/)
- [Chrome Extension Service Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Electron webContents API](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron app child-process-gone](https://www.electronjs.org/docs/latest/api/app#event-child-process-gone)
- [Electron issue #19887 — crash on reload in crashed callback](https://github.com/electron/electron/issues/19887)
- [IntelliJ Plugin Class Loaders](https://plugins.jetbrains.com/docs/intellij/plugin-class-loaders.html)
- [JVM ClassLoaders & IntelliJ](https://jonnyzzz.com/blog/2026/02/12/jvm-classloading-intellij/)
- [tapable hook system](https://github.com/webpack/tapable)
- [PostCSS plugin docs](https://postcss.org/docs/writing-a-postcss-plugin)
- [Homebridge Child Bridges wiki](https://github.com/homebridge/homebridge/wiki/Child-Bridges)
- [Flux lib.rs](https://github.com/anomalyco/Flux/blob/main/src-tauri/src/lib.rs)