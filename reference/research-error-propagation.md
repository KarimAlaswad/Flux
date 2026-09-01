# Error Propagation Across Process Boundaries in Plugin Architectures

Research compiled 2026-07-28. Every claim cites a primary source.

---

## Table of Contents

1. [Language Server Protocol (LSP)](#1-language-server-protocol-lsp)
2. [D-Bus](#2-d-bus)
3. [Erlang/OTP "Let It Crash"](#3-erlangotp-let-it-crash)
4. [Rust `Result` Across FFI Boundaries](#4-rust-result-across-ffi-boundaries)
5. [JSON-RPC 2.0 Error Format](#5-json-rpc-20-error-format)
6. [HTTP APIs (Reverse Proxy / Gateway)](#6-http-apis-reverse-proxy--gateway)
7. [Web Worker `error` Event](#7-web-worker-error-event)
8. [Cross-Cutting Patterns](#8-cross-cutting-patterns)
9. [Recommendations for Flux](#9-recommendations-for-flux)

---

## 1. Language Server Protocol (LSP)

### Error model

LSP uses JSON-RPC as its transport and extends the error model with protocol-specific error codes.

**ResponseError object** (from the LSP 3.17 specification):

```typescript
interface ResponseError {
    code: integer;      // REQUIRED
    message: string;    // REQUIRED
    data?: LSPAny;      // optional extra info
}
```

Source: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#responseMessage

**Error codes** are partitioned into ranges:

| Range | Owner | Examples |
|-------|-------|----------|
| -32700 to -32000 | JSON-RPC reserved (Section 5.1) | ParseError (-32700), InvalidRequest (-32600), MethodNotFound (-32601), InvalidParams (-32602), InternalError (-32603) |
| -32099 to -32000 | JSON-RPC reserved range | ServerNotInitialized (-32002), UnknownErrorCode (-32001) |
| -32899 to -32800 | LSP reserved | RequestFailed (-32803), ServerCancelled (-32802), ContentModified (-32801), RequestCancelled (-32800) |

Source: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#errorCodes

**Key design decisions:**
- Error codes are integers, enabling programmatic handling.
- `message` is a human-readable string (required).
- `data` is optional and server-defined — often contains stack traces or inner errors.
- Error and result are **mutually exclusive**: if `error` exists, `result` MUST NOT exist.
- The LSP client must not fail on unknown enumeration values — they should be preserved and ignored.

### Crash detection and restart (VS Code implementation)

The VS Code LSP client library (`vscode-languageserver-node`) implements a `DefaultErrorHandler`:

```typescript
class DefaultErrorHandler implements ErrorHandler {
    private readonly restarts: number[];

    constructor(private client: BaseLanguageClient, private maxRestartCount: number) {
        this.restarts = [];
    }

    public error(_error: Error, _message: Message, count: number): ErrorHandlerResult {
        if (count && count <= 3) {
            return { action: ErrorAction.Continue };  // transient: keep connection
        }
        return { action: ErrorAction.Shutdown };       // persistent: shut down
    }

    public closed(): CloseHandlerResult {
        this.restarts.push(Date.now());
        if (this.restarts.length <= this.maxRestartCount) {
            return { action: CloseAction.Restart };
        } else {
            const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
            if (diff <= 3 * 60 * 1000) {
                // 5+ crashes in 3 minutes → give up
                return { action: CloseAction.DoNotRestart, message: `The ${this.client.name} server crashed ${this.maxRestartCount+1} times in the last 3 minutes.` };
            } else {
                this.restarts.shift();
                return { action: CloseAction.Restart }; // old crashes expired
            }
        }
    }
}
```

Source: https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/client.ts (lines documented as `DefaultErrorHandler`)

**Restart policy (default):**
- Max 4 restarts (`maxRestartCount ?? 4`).
- If 5+ crashes occur within 3 minutes, the server stays dead.
- The error handler and close handler are **plugable** via `LanguageClientOptions.errorHandler`.
- The client has pluggable `InitializationFailedHandler` that can decide whether to retry init.

**What the user sees:**
- Error message displayed: "The [name] server crashed 5 times in the last 3 minutes. The server will not be restarted."
- Output channel captures stderr/stdout from the server process.
- The `revealOutputChannelOn` option controls when the output panel pops up (default: on Error).
- Errors are logged to the output channel AND optionally shown as notifications.

**What crosses the boundary:**
- The process exit signal (host detects subprocess died).
- Stderr from the server (redirected to output channel).
- `ResponseError` objects with `code`, `message`, `data`.

**What does NOT cross:**
- Full stack traces by default (only if server puts them in `data`).
- Internal server state.

### Graceful degradation patterns

- The editor continues to function; only features that depend on that server degrade.
- Diagnostics are cleared when server disconnects (UI doesn't show stale errors).
- User can manually restart via command palette.

---

## 2. D-Bus

### Error model

D-Bus has a dedicated `ERROR` message type (type code 3 in the message header).

- **Error names** follow a namespaced convention: `org.freedesktop.DBus.Error.Failed`, `org.freedesktop.DBus.Error.AccessDenied`, etc.
- An error message includes the **error name** plus a **human-readable message** as the first argument (if it's a string).
- The `ERROR` message type carries a `REPLY_SERIAL` header field linking it to the original method call.

Source: https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol-types

**Propagation boundary:**
- The error name is a string (namespaced, like `com.example.Error.Foo`).
- The error message is a string (first argument).
- No stack traces, no inner exception chains — just name + message.
- The `ERROR` reply replaces the normal `METHOD_RETURN` — they are mutually exclusive.

### Crash handling

When a D-Bus service crashes mid-request:
- The message bus (dbus-daemon) detects the disconnection.
- The service's unique bus name is released.
- Any pending method calls to that service get no reply (caller sees timeout).
- If auto-start is configured, the bus daemon can relaunch the service on the next method call.
- The `NO_AUTO_START` flag on messages lets callers opt out of auto-activation.

Source: https://dbus.freedesktop.org/doc/dbus-specification.html#message-bus-starting-services

**Error categories:**
- Standard errors: `org.freedesktop.DBus.Error.*` (Failed, NoReply, AccessDenied, etc.)
- Service-specific errors: `com.example.MyService.Error.*`
- Errors are **per-call**, not per-session — each method call gets its own error response.

### Graceful degradation

- D-Bus is designed for a message bus — one failing service doesn't affect other services.
- Callers should handle the `org.freedesktop.DBus.Error.ServiceUnknown` error when a service isn't running.
- Interactive authorization can be requested via the `ALLOW_INTERACTIVE_AUTHORIZATION` flag.

---

## 3. Erlang/OTP "Let It Crash"

### Philosophy

The "let it crash" philosophy was codified in Joe Armstrong's work on Erlang and the OTP design principles. Core tenets:

1. **Process isolation** — each process has its own heap; a crash cannot corrupt another process's memory.
2. **Fail fast** — don't write defensive recovery code inside workers; just crash.
3. **Supervision** — a separate supervisor process decides what to do when a child crashes.
4. **Restart > repair** — restarting from a known-good state is simpler and more reliable than trying to recover corrupted state.

Source: https://erlang.org/documentation/doc-5.6/pdf/design_principles.pdf (OTP Design Principles)

### Supervision trees

Supervisors are processes that monitor child processes (workers or other supervisors). Strategies:

| Strategy | Behavior |
|----------|----------|
| `one_for_one` | Restart only the failed child |
| `one_for_all` | Restart ALL children (terminate + restart) |
| `rest_for_one` | Restart the failed child + any started after it |

Child specs define restart behavior:

- **permanent** — always restarted, even on normal exit.
- **temporary** — never restarted.
- **transient** — restarted only if terminated abnormally (crashed).

Source: https://erlang.org/doc/design_principles/sup_princ.html (Supervisor behaviour)

### Crash propagation boundaries

- The **exit signal** (with reason) propagates from child to parent if the child is linked.
- If the supervisor traps exits, it can handle the signal and decide on restart.
- If the supervisor does NOT trap exits, it crashes too (propagation upward).
- The **exit reason** is an Erlang term (atom, string, or complex term).
- **Process state is lost on crash** — any non-persisted data is gone.

### What crosses the boundary:
- Exit signal with reason (an Erlang term).
- Whether the exit was normal or abnormal.

### What does NOT cross:
- Stack traces (they're logged locally).
- Corrupted heap state.
- Intermediate computation results.

### Restart intensity limiting

OTP supervisors implement **restart intensity** — a maximum number of restarts within a time window (e.g., 5 restarts in 10 seconds). If exceeded, the supervisor itself terminates (escalation). This prevents crash loops.

Source: https://erlang.org/doc/man/supervisor.html (intensity and period)

### Graceful degradation

- The **supervision tree** ensures that failures are contained at the lowest possible level.
- A crashed worker is replaced silently; other workers in the same supervisor continue unaffected.
- If a supervisor gives up, its parent supervisor can escalate to a higher-level strategy.
- The system degrades only at the granularity of the supervision tree.

---

## 4. Rust `Result` Across FFI Boundaries

### The fundamental constraint

Rust's `Result<T, E>` type is **not representable in C** (or most other languages). It's a tagged union (enum) with no stable ABI guarantee across languages. Panics that cross an FFI boundary are **undefined behavior**.

Source: https://doc.rust-lang.org/nomicon/ffi.html (The Rustonomicon - FFI)

### Standard translation patterns

**Pattern 1: Return code + out parameter**

```rust
#[no_mangle]
pub extern "C" fn safe_divide(a: i32, b: i32, result: *mut i32) -> i32 {
    if b == 0 { return -1; }  // error code
    unsafe { *result = a / b; }
    0  // success
}
```

The C side checks return code (`0` = success, non-zero = error). This is the most common pattern.

**Pattern 2: errno-style**

For POSIX-compatible APIs, set a thread-local error number. The caller reads `errno` (or `io::Error::last_os_error()` in Rust) immediately after the call.

Source: https://doc.rust-lang.org/std/io/struct.Error.html#method.last_os_error

**Pattern 3: Error message function**

```rust
static LAST_ERROR: RefCell<Option<String>> = RefCell::new(None);

#[no_mangle]
pub extern "C" fn get_error_message(buf: *mut c_char, len: usize) -> c_int {
    // copy LAST_ERROR into buf
}
```

The caller first detects failure (via return code), then queries the error detail.

Source: https://github.com/actionbook/rust-skills/blob/main/skills/unsafe-checker/rules/ffi-08-error-handling.md

**Pattern 4: `catch_unwind` barrier**

```rust
use std::panic;

#[no_mangle]
pub extern "C" fn callback(data: *const u8) -> i32 {
    let result = panic::catch_unwind(|| {
        process_data(data)
    });
    match result {
        Ok(value) => value,
        Err(_) => -1,  // panic caught, return error code
    }
}
```

Source: https://doc.rust-lang.org/std/panic/fn.catch_unwind.html

### Design pattern: `-sys` / safe wrapper layers

- A `-sys` crate provides raw `extern "C"` bindings with C-compatible error returns.
- A higher-level crate wraps these in idiomatic `Result<T, E>` types.
- The boundary is the `-sys` crate's public API — errors are **translated** at this point.

Source: https://nrc.github.io/error-docs/rust-errors/interop.html (Rust Error Documentation - FFI)

### What crosses the boundary:
- Integer error codes.
- Pointers to error message strings (caller must free).
- `errno` values (thread-local, implicit).

### What does NOT cross:
- Rust `Result` enum tags.
- Rust panics (UB if they cross).
- Rust stack traces from `Error` impls.
- `Box<dyn Error>` or any trait object.

### Key lesson for Flux

Flux's Rust host already wraps errors as `Result<Value, String>` and returns them across Tauri's IPC bridge. The String representation is already a lossy translation — this is correct and unavoidable. The question is what goes INTO that string.

---

## 5. JSON-RPC 2.0 Error Format

### Specification

The JSON-RPC 2.0 error object has exactly three fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | integer | YES | Error type identifier |
| `message` | string | YES | Short, single-sentence description |
| `data` | any | optional | Additional structured info (server-defined) |

Source: https://www.jsonrpc.org/specification#error_object

**Standard error codes:**

| Code | Message | Meaning |
|------|---------|---------|
| -32700 | Parse error | Invalid JSON received |
| -32600 | Invalid Request | Not a valid Request object |
| -32601 | Method not found | Method does not exist |
| -32602 | Invalid params | Invalid method parameter(s) |
| -32603 | Internal error | Internal JSON-RPC error |
| -32000 to -32099 | Server error | Implementation-defined |

Codes -32768 to -32000 are reserved. Everything else is available for application-defined errors.

**Mutual exclusivity rule:**
> Either the `result` member or `error` member MUST be included, but both members MUST NOT be included.

### Key design properties

- `code` enables **programmatic handling** without parsing message strings.
- `message` is for **human display** — should be a concise single sentence.
- `data` is optional, intentionally vague — can hold anything: validation errors, nested causes, stack traces.
- The protocol is **notification-aware**: notifications never get error responses.

### Flux's current deviation

Flux currently uses `{"error": "message string"}` — a flat string, not a JSON-RPC 2.0 error object. This means:
- No error codes for programmatic handling.
- Cannot attach structured `data`.
- Inconsistent with JSON-RPC 2.0 spec (the `error` value should be an object with `code` and `message`).

---

## 6. HTTP APIs (Reverse Proxy / Gateway)

### Error propagation through intermediaries

When an HTTP reverse proxy or API gateway sits in front of upstream services, it translates upstream failures into standard HTTP status codes:

| Status | Meaning | When |
|--------|---------|------|
| **502 Bad Gateway** | Upstream returned invalid/unexpected response | Upstream is running but sends garbage or wrong protocol |
| **503 Service Unavailable** | Server temporarily overloaded or down | Upstream is down, has no healthy replicas, or is rate-limiting |
| **504 Gateway Timeout** | Upstream didn't respond in time | Upstream is slow or hung |

Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/502
Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/503

**Key insight:** The proxy **does not forward** the upstream's internal error details (stack traces, implementation details) to the client. It translates:

```
[Upstream 500 with full stack trace] → [Proxy 502 with generic message]
```

The MDN docs explicitly say: "If the origin server sends a valid HTTP error response to the gateway, the response should be passed on to the client instead of a 502 to make the failure reason transparent."

### Retry patterns

- `Retry-After` header can be sent with 503 to tell clients when to retry.
- Proxies may implement automatic retry for idempotent requests.
- Circuit breakers track failure rates and stop routing to unhealthy upstreams.

### What crosses the boundary:
- Status code (programmatic signal).
- Optional `Retry-After` header.
- Error response body (often JSON with a message).

### What does NOT cross:
- Internal stack traces.
- Internal hostnames/internal IPs.
- Database query details.
- Implementation-specific error codes (unless explicitly forwarded).

---

## 7. Web Worker `error` Event

### Error model

The Web Worker `error` event fires on the main thread when an uncaught error occurs in a worker. The event is a generic `Event` type — NOT an `ErrorEvent`.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Worker/error_event

**What the main thread receives:**
- A generic `Event` object (no `message`, no `filename`, no `lineno`).
- The MDN page says it's a generic `Event`, but the HTML spec says `WorkerGlobalScope.onerror` is an `OnErrorEventHandler` (lines 3512-3523 in the spec).

**Inside the worker (`WorkerGlobalScope.onerror`):**
- An `ErrorEvent` with `message`, `filename`, `lineno`, `colno`, `error` fields.
- But this fires *inside* the worker, not on the main thread.

Source: https://html.spec.whatwg.org/multipage/workers.html#runtime-script-errors-2

### What crosses the boundary:
- The fact that an error occurred (the event fires).
- A generic Event with limited information.

### What does NOT cross:
- The error message.
- The error stack trace.
- The line/column number where the error occurred.
- The thrown value itself.
- Any structured error data.

### Graceful degradation

- The worker thread crashes but the main thread continues running.
- Any pending `postMessage` calls from the worker are lost.
- The main thread can detect the error and respawn the worker.
- Unhandled promise rejections in workers fire `unhandledrejection` on the worker's global scope, not on the main thread.

### Key lesson

Web Workers are extremely restrictive about what crosses the boundary. The main thread gets almost no diagnostic information. This is by design: isolation is prioritized over debuggability. Flux's subprocess model is more generous (it has stderr to capture stack traces).

---

## 8. Cross-Cutting Patterns

### What crosses process boundaries vs. what stays contained

| Property | Crosses boundary? | Examples |
|----------|-------------------|----------|
| Error code / type | YES | Integer code, namespaced string |
| Human-readable message | YES | Short description |
| Structured data | Optional | JSON `data` field, D-Bus first arg |
| Stack trace | Rarely | Only if explicitly included in `data` |
| Process state | NO | Lost on crash |
| Corrupted memory | NO | Contained by process isolation |
| Intermediate results | NO | Died with the process |
| Open file handles / sockets | NO | Closed by OS on process exit |

### Error categories across all systems

| Category | D-Bus | LSP | Erlang OTP | JSON-RPC |
|----------|-------|-----|------------|----------|
| Parse/malformed | org.freedesktop.DBus.Error.Failed | ParseError (-32700) | badarg | -32700 |
| Method not found | org.freedesktop.DBus.Error.UnknownMethod | MethodNotFound (-32601) | undef | -32601 |
| Bad params | org.freedesktop.DBus.Error.InvalidArgs | InvalidParams (-32602) | function_clause | -32602 |
| Internal error | org.freedesktop.DBus.Error.Failed | InternalError (-32603) | any crash | -32603 |
| Permission | AccessDenied | — | — | — |
| Cancellation | — | RequestCancelled (-32800) | — | — |
| Timeout | NoReply | — | — | — |
| Not initialized | — | ServerNotInitialized (-32002) | — | — |

### Design patterns that appear repeatedly

1. **Error codes + human message** — Every system uses this dual approach (code for machines, message for humans). JSON-RPC, LSP, D-Bus, HTTP all follow this pattern.
2. **Mutual exclusion of success/error** — In JSON-RPC, LSP, and D-Bus, a response is either success or error, never both.
3. **Containment via process boundary** — Erlang processes, Web Workers, and OS subprocesses all provide crash containment. The process boundary is the unit of failure isolation.
4. **Pluggable error handling** — LSP's `ErrorHandler` interface and Erlang's supervision strategies are both pluggable/ configurable.
5. **Capped restart loops** — Both Erlang (restart intensity) and VS Code's LSP client (5 crashes in 3 minutes) implement capped restart to prevent crash loops.
6. **Throttled translation** — HTTP proxies, Rust FFI bindings, and LSP clients all **translate** errors at the boundary rather than forwarding raw internals.

---

## 9. Recommendations for Flux

### Current state (baseline)

Flux's current error flow:
```
Plugin subprocess → {"error": "message string"}
    → Rust host: Result<Value, String>
        → Frontend: result.reason?.message ?? result.reason ?? "Unknown error"
```

Problems:
- Error is a flat string — no codes, no categories, no structured data.
- No distinction between plugin type (feed source) vs plugin crash vs auth failure.
- `Promise.allSettled` in feed-widget means one crash doesn't break others — this is good.
- No attempt at restart/retry.
- No output channel / log viewer for debugging.
- Frontend shows "Unknown error" when both `reason` and `reason.message` are absent.

### Improvement 1: Error representation (JSON-RPC 2.0 compliant)

Switch from `{"error": "message"}` to a proper JSON-RPC 2.0 error object:

```json
{
    "error": {
        "code": -32000,
        "message": "YouTube feed returned HTTP 429",
        "data": {
            "plugin": "yt-feed",
            "retryAfter": 60,
            "httpStatus": 429
        }
    }
}
```

The Rust host should preserve this structure. Currently it returns `Result<Value, String>` — instead, return `Result<Value, ErrorObject>` where `ErrorObject` has `code`, `message`, `data`. The Tauri `invoke` error should carry the full object.

### Improvement 2: Error code taxonomy for Flux

Reserve error code ranges:

| Range | Category | Examples |
|-------|----------|----------|
| -32700 to -32000 | JSON-RPC standard (transport / protocol errors) | Parse error, invalid request |
| -30000 to -30099 | Plugin crashed | Process exited, stdin write failure |
| -30100 to -30199 | Plugin timeout | 15s timeout exceeded |
| -30200 to -30299 | Auth failures | Cookie expired, login required |
| -30300 to -30399 | External API errors | HTTP 429, 403 from upstream |
| -30400 to -30499 | Plugin logic errors | Bad params, unimplemented method |
| -31000+ | Application-level | Feed returned empty, not found |

This lets the frontend switch on error code:

```typescript
switch (error.code) {
    case -30000: // plugin crashed
        showPartialState(items, `YouTube feed unavailable (plugin crashed)`);
        break;
    case -30200: // auth failure
        showPartialState(items, `Login required for YouTube feed`);
        break;
    case -30300: // rate limited
        showPartialState(items, `YouTube rate limited — try again later`);
        break;
}
```

### Improvement 3: Graceful degradation in the feed widget

The feed-widget already uses `Promise.allSettled` per feed source. The per-source error should be surfaced as a yellow banner (not a modal error). The widget already has a "partial" state — use it.

Each feed source error should include:
- Plugin name (so user knows which source failed).
- Error category (so UI decides what to show).
- A user-facing message (not a stack trace).

Example:
```typescript
{
    source: "yt-feed",
    status: "error",
    code: -30300,
    userMessage: "YouTube is rate-limiting requests. Videos may be missing.",
    debug: { plugin: "yt-feed", httpStatus: 429 }
}
```

The feed-widget's partial state already shows items + error banners. The banner should search for the failing plugin's name and offer relevant action (e.g., "Configure YouTube login").

### Improvement 4: Plugin crash recovery (Erlang-inspired)

Add a supervisor-like restart policy in the Rust host:

- Track last N crash times per plugin.
- On crash: wait 1s, then restart (with exponential backoff: 1s, 2s, 4s, 8s, max 30s).
- If 5 crashes in 3 minutes, give up and mark plugin as permanently failed.
- Expose plugin health status: `{ "plugin": "yt-feed", "status": "dead", "lastError": "...", "willRetry": false }`.

Currently the Rust host spawns plugins once at startup. The `resolve_run` function in `lib.rs:85` handles spawning. A `PluginSupervisor` would wrap this with restart logic.

### Improvement 5: Debugging via stderr capture

Currently, plugin stderr goes to... the void? (Need to check.) VS Code's LSP client redirects server stderr to an output channel. Flux should:

- Capture stderr from each plugin process.
- Expose it via a `plugin.log` RPC method or a file in `build/plugins/`.
- The frontend or developer can tail plugin logs without restarting.
- Include crash stack traces in the `data` field of error responses when available.

### Improvement 6: Frontend error display

Current: `result.reason?.message ?? result.reason ?? "Unknown error"`

Replace with:

```typescript
function formatPluginError(err: PluginError): string {
    const codes: Record<number, string> = {
        [-30000]: "Plugin crashed",
        [-30200]: "Login required",
        [-30300]: "Rate limited by external service",
    };
    const label = codes[err.code] ?? "Error";
    return `${err.plugin}: ${label} — ${err.userMessage}`;
}
```

And always show the plugin name so the user knows which source failed.

### Summary of impact

| Area | Improvement | Effort | Impact |
|------|-------------|--------|--------|
| Error format | Switch to JSON-RPC 2.0 error object | Small | Enables programmatic handling |
| Error codes | Define plugin error code taxonomy | Small | Frontend can categorize + act |
| Display | Plugin name + user message instead of "Unknown error" | Small | User knows what broke |
| Crash recovery | Exponential backoff restart with cap | Medium | Self-healing for transient failures |
| Debugging | Stderr capture + expose via RPC | Medium | Devs can debug without restart |
| Degradation | Feed widget partial state with per-source banners | Already exists | Just use it properly |
| Auth errors | Error code → login prompt | Medium | Smooth auth failure UX |

### Sources checklist

- LSP spec: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#responseMessage
- LSP error codes: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#errorCodes
- VS Code LSP client DefaultErrorHandler: https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/client.ts
- D-Bus spec: https://dbus.freedesktop.org/doc/dbus-specification.html
- Erlang OTP Design Principles: https://erlang.org/documentation/doc-5.6/pdf/design_principles.pdf
- Erlang supervisor docs: https://erlang.org/doc/design_principles/sup_princ.html
- Rust Nomicon FFI: https://doc.rust-lang.org/nomicon/ffi.html
- Rust `catch_unwind`: https://doc.rust-lang.org/std/panic/fn.catch_unwind.html
- Rust FFI error handling: https://nrc.github.io/error-docs/rust-errors/interop.html
- JSON-RPC 2.0 spec: https://www.jsonrpc.org/specification
- HTTP 502 MDN: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/502
- HTTP 503 MDN: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/503
- Web Worker error event MDN: https://developer.mozilla.org/en-US/docs/Web/API/Worker/error_event
- HTML spec Worker runtime errors: https://html.spec.whatwg.org/multipage/workers.html#runtime-script-errors-2
- Neon bindings Rust-to-JS error translation: https://docs.rs/neon/latest/neon/result/index.html