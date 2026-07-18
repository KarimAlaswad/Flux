# CORS-Bypassed Video Streaming in Tauri v2 — Architectural Approaches

**Date:** 2026-07-17
**Context:** Flux — Tauri v2 + React 19 + Bun plugin architecture
**Problem:** PeerTube CDN (e.g. `peertube.cpy.re`) doesn't send CORS headers. Browser `<video>` elements using `fetch()` + native `HttpSource` are blocked. The goal is to relay video byte streams from a non-CORS CDN to the browser's `<video>` element without per-plugin proxy servers.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Approach A: Tauri Custom Protocol (Recommended)](#a-tauri-custom-protocol-recommended)
3. [Approach B: `tauri-plugin-http` + `Channel<T>` Streaming IPC](#b-tauri-plugin-http--channel-streaming-ipc)
4. [Approach C: Embedded Rust HTTP Proxy (Axum/warp)](#c-embedded-rust-http-proxy-axumwarp)
5. [Approach D: `tauri-plugin-cors-fetch` (Unofficial)](#d-tauri-plugin-cors-fetch-unofficial)
6. [Approach E: Bun Subprocess Proxy (core-proxy)](#e-bun-subprocess-proxy-core-proxy)
7. [Approach F: Service Worker Interception](#f-service-worker-interception)
8. [Approach G: Native Video Player Plugin](#g-native-video-player-plugin)
9. [Electron vs Tauri Comparison](#electron-vs-tauri-comparison)
10. [Ranking & Recommendation](#ranking--recommendation)
11. [Gotchas & Caveats](#gotchas--caveats)

---

## Architecture Overview

```
Current flow (broken):
  Browser <video> → fetch(CDN URL) → ❌ CORS blocked

Goal:
  Browser <video> → custom protocol URL → Rust backend → reqwest(CDN URL) → bytes back → <video> plays
```

The core constraint: **the browser's `<video>` element must receive a URL that the WebView considers same-origin or privileged.** The video source URL must point to something the WebView trusts — either a custom protocol handler registered in the Rust backend, a localhost HTTP server, or a `blob:` URL constructed from bytes fetched outside the browser's CORS context.

---

## Approach A: Tauri Custom Protocol (Recommended)

### How it works

Tauri v2 provides `Builder::register_asynchronous_uri_scheme_protocol` which lets you register a custom URL scheme (e.g. `stream://`) that the WebView treats as a trusted origin. When the `<video>` element sets `src="stream://videos/peertube-video.mp4"`, the WebView routes the HTTP request (including `Range` headers for seeking) to your Rust handler. The handler fetches the real CDN URL via `reqwest` (no CORS — it's a native HTTP client), and returns the bytes with proper `Content-Type` and `Content-Range` headers.

**This is the canonical Tauri approach.** The official Tauri repo has a dedicated `examples/streaming/` that demonstrates exactly this pattern.

### How it works

```
Browser <video src="stream://videos/abc123">
  → WebView sees custom scheme "stream"
  → Calls Rust handler registered via register_asynchronous_uri_scheme_protocol
  → Handler parses Range header, fetches from CDN via reqwest
  → Returns 206 Partial Content with video bytes + CORS-free headers
  → <video> plays natively
```

### Official Example

Tauri's own `examples/streaming/main.rs` demonstrates this with full `Range` header parsing, `206 Partial Content` responses, and multipart byterange support:

```rust
// src-tauri/src/lib.rs (add to existing run() function)
use http::{header::*, response::Builder as ResponseBuilder, status::StatusCode};
use http_range::HttpRange;
use reqwest::Client;

tauri::Builder::default()
    .register_asynchronous_uri_scheme_protocol("stream", move |_ctx, request, responder| {
        let response = handle_stream_request(request);
        match response {
            Ok(http_response) => responder.respond(http_response),
            Err(e) => responder.respond(
                ResponseBuilder::new()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(CONTENT_TYPE, "text/plain")
                    .body(e.to_string().as_bytes().to_vec())
                    .unwrap(),
            ),
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");

async fn handle_stream_request(
    request: http::Request<Vec<u8>>,
) -> Result<http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    // 1. Parse the path to determine which CDN URL to proxy
    let path = request.uri().path().trim_start_matches('/');
    let cdn_url = resolve_cdn_url(path)?; // e.g. "https://peertube.cpy.re/static/..."

    // 2. Build a reqwest request mirroring the original
    let client = Client::new();
    let mut req_builder = client.get(&cdn_url);

    // 3. Forward Range header for seeking support
    if let Some(range) = request.headers().get("range") {
        req_builder = req_builder.header("Range", range);
    }

    // 4. Fetch from CDN (no CORS — native HTTP client)
    let resp = req_builder.send().await?;
    let status = resp.status();
    let bytes = resp.bytes().await?;

    // 5. Build response with CORS headers the WebView needs
    let mut builder = ResponseBuilder::new()
        .status(status)
        .header(CONTENT_TYPE, resp.headers().get("content-type").unwrap_or(&"video/mp4".parse().unwrap()))
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        .header("Access-Control-Allow-Headers", "Range, Content-Type")
        .header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

    if let Some(content_range) = resp.headers().get("content-range") {
        builder = builder.header(CONTENT_RANGE, content_range);
    }
    if let Some(content_length) = resp.headers().get("content-length") {
        builder = builder.header(CONTENT_LENGTH, content_length);
    }

    Ok(builder.body(bytes.to_vec())?)
}
```

### Key details

- **`register_asynchronous_uri_scheme_protocol`** (added in Tauri v2 alpha.12) takes a closure with a `responder` callback — the handler can do async I/O without blocking the main thread.
- **Range requests work.** The official streaming example parses `Range` headers, returns `206 Partial Content`, and even handles multipart byteranges. Video seeking works.
- **The entire response body is a `Vec<u8>`** — the handler must buffer the full response before returning. For large videos this means memory proportional to file size. The Wry issue [#1404](https://github.com/tauri-apps/wry/issues/1404) tracks streaming body support (chunked transfer).
- **CSP must allow the custom scheme.** Add `media-src stream://*;` to your CSP in `tauri.conf.json`.
- **Feature flag required.** Enable `custom-protocol` in Cargo.toml: `tauri = { version = "2", features = ["custom-protocol"] }`.
- **Cross-platform URL format.** On macOS/Linux: `stream://videos/abc`. On Windows: `https://stream.localhost/videos/abc`.

### Sources

- Tauri streaming example: https://github.com/tauri-apps/tauri/blob/dev/examples/streaming/main.rs
- `register_asynchronous_uri_scheme_protocol` docs: https://docs.rs/tauri/latest/tauri/struct.Builder.html#method.register_asynchronous_uri_scheme_protocol
- Tauri v2 alpha.12 release notes (async protocol): https://v2.tauri.app/release/tauri/v2.0.0-alpha.12
- Wry custom protocol docs: https://deepwiki.com/tauri-apps/wry/4.1-custom-protocols
- Tauri streaming example README: https://github.com/tauri-apps/tauri/blob/dev/examples/streaming/README.md
- Wry issue #1404 (streaming body support): https://github.com/tauri-apps/wry/issues/1404

---

## Approach B: `tauri-plugin-http` + `Channel<T>` Streaming IPC

### How it works

Tauri v2's official `tauri-plugin-http` provides a `fetch()` function that runs in the Rust backend (via `reqwest`), completely bypassing browser CORS. Combined with Tauri v2's `Channel<T>` IPC primitive, you can stream video chunks from Rust to the frontend.

The frontend receives chunks via the channel, assembles them into a `ReadableStream`, creates a `blob:` URL or a `Response` object, and feeds it to the `<video>` element.

### Flow

```
Frontend: invoke("proxy_video", { url, channel })
  → Rust: reqwest::get(cdn_url).await
  → Rust: stream chunks via channel.send(chunk)
  → Frontend: ReadableStream → Response → blob: URL → <video src>
```

### Code Example

```rust
// src-tauri/src/lib.rs
use tauri::ipc::Channel;
use reqwest::Client;

#[tauri::command]
async fn proxy_video(
    url: String,
    on_chunk: Channel<Vec<u8>>,
) -> Result<(), String> {
    let client = Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        on_chunk.send(chunk).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

```typescript
// Frontend: movi-player.tsx
import { invoke, Channel } from "@tauri-apps/api/core";

async function playProxiedVideo(cdnUrl: string) {
  const channel = new Channel<Uint8Array>();
  const chunks: Uint8Array[] = [];

  channel.onmessage = (chunk) => {
    chunks.push(chunk);
  };

  await invoke("proxy_video", { url: cdnUrl, onEvent: channel });

  // Assemble into a blob URL for the <video> element
  const blob = new Blob(chunks, { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);
  videoElement.src = blobUrl;
}
```

### Limitations

- **No streaming playback.** The entire video must be downloaded before playback starts (you need all chunks to create the blob). For large videos this means high memory usage and long wait times.
- **No seeking.** `blob:` URLs don't support `Range` requests. The `<video>` element cannot seek until the full blob is assembled.
- **Memory.** The full video is held in memory as a `Blob`. For 4K videos this can be multiple GB.
- **Channel backpressure.** `Channel::send` is fire-and-forget; if the frontend can't keep up, chunks buffer in the Rust mpsc channel.

### When to use

Only suitable for short clips (<50MB) where you can wait for full download before playback. Not suitable for the PeerTube use case.

### Sources

- Tauri v2 Channel docs: https://v2.tauri.app/develop/calling-rust/#channels
- `tauri::ipc::Channel` docs: https://docs.rs/tauri/latest/tauri/ipc/struct.Channel.html
- `tauri::ipc::Response` docs: https://docs.rs/tauri/latest/tauri/ipc/struct.Response.html
- Stuffbucket skills on channels: https://stuffbucket.github.io/skills/catalog/tauri-events-channels-streaming

---

## Approach C: Embedded Rust HTTP Proxy (Axum/warp)

### How it works

Spawn a lightweight HTTP server (Axum or warp) inside the Tauri Rust process, bound to `127.0.0.1:<random-port>`. The server proxies video requests to the CDN, adding CORS headers. The frontend `<video>` element points to `http://127.0.0.1:<port>/proxy?url=<encoded-cdn-url>`.

This is the most common pattern in the Tauri ecosystem — several templates and plugins use it (e.g., `nitiksh/tauri-video-streaming-template`, `desktop-audio-proxy`, `tauri-plugin-axum`).

### Code Example

```rust
// src-tauri/src/lib.rs
use axum::{Router, routing::get, extract::Query, response::Response};
use reqwest::Client;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::Deserialize;

#[derive(Deserialize)]
struct ProxyParams {
    url: String,
}

async fn proxy_handler(Query(params): Query<ProxyParams>) -> impl axum::response::IntoResponse {
    let client = Client::new();
    let resp = client.get(&params.url).send().await.unwrap();
    let status = resp.status();
    let headers = resp.headers().clone();
    let body = resp.bytes().await.unwrap();

    let mut response = axum::response::Response::new(body);
    *response.status_mut() = status;
    response.headers_mut().insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    response.headers_mut().insert("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS".parse().unwrap());
    response.headers_mut().insert("Access-Control-Allow-Headers", "Range, Content-Type".parse().unwrap());
    response.headers_mut().insert("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length".parse().unwrap());

    // Forward Content-Type, Content-Length, Content-Range from upstream
    if let Some(ct) = resp.headers().get("content-type") {
        response.headers_mut().insert("content-type", ct.clone());
    }
    if let Some(cl) = resp.headers().get("content-length") {
        response.headers_mut().insert("content-length", cl.clone());
    }
    if let Some(cr) = resp.headers().get("content-range") {
        response.headers_mut().insert("content-range", cr.clone());
    }

    response
}

pub fn run() {
    // Spawn Axum server on a random port
    let rt = tokio::runtime::Runtime::new().unwrap();
    let port = rt.block_on(async {
        let app = Router::new().route("/proxy", get(proxy_handler));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        addr.port()
    });

    // Pass port to frontend via managed state or env
    std::env::set_var("PROXY_PORT", port.to_string());

    tauri::Builder::default()
        // ... rest of setup
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// Frontend: use the proxy
const port = await invoke("get_proxy_port");
const proxyUrl = `http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(cdnUrl)}`;
videoElement.src = proxyUrl;
```

### Tradeoffs

| Pro | Con |
|-----|-----|
| Full `Range` request support — seeking works | Opens a localhost TCP port (attack surface) |
| Streaming playback — no full download needed | Port management (pick random, pass to frontend) |
| Works with any `<video>` element, no JS changes | Another process/thread (though in-process with Axum) |
| Mature pattern with existing templates | CSP must allow `connect-src http://127.0.0.1:*` |
| Can handle multiple concurrent streams | Slightly more complex than custom protocol |

### Sources

- `nitiksh/tauri-video-streaming-template`: https://github.com/nitiksh/tauri-video-streaming-template
- `tauri-plugin-axum`: https://github.com/mcitem/tauri-plugin-axum
- `desktop-audio-proxy` (Tauri/Electron): https://github.com/Bandonker/desktop-audio-proxy
- Axum docs: https://docs.rs/axum/latest/axum/

---

## Approach D: `tauri-plugin-cors-fetch` (Unofficial)

### How it works

An unofficial Tauri plugin (`idootop/tauri-plugin-cors-fetch`) that hooks into the browser's native `fetch()` at page initialization and transparently redirects requests through Tauri's HTTP client. Zero code changes — your existing `fetch()` calls just work.

It works by monkey-patching the global `fetch` function to route through `tauri-plugin-http` instead of the browser's native fetch, which runs in the Rust backend and has no CORS restrictions.

### Setup

```bash
cargo add tauri-plugin-cors-fetch
```

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cors_fetch::init())
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
```

```json
// src-tauri/capabilities/default.json
{
  "permissions": ["cors-fetch:default"]
}
```

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "withGlobalTauri": true
  }
}
```

### Tradeoffs

| Pro | Con |
|-----|-----|
| Zero code change — existing `fetch()` just works | Unofficial plugin, not guaranteed stable |
| Streaming & SSE supported | Hooks global `fetch` — may conflict with other libs |
| Configurable include/exclude patterns | Requires `withGlobalTauri: true` |
| Multi-platform | May break with Tauri version bumps |

### Sources

- `tauri-plugin-cors-fetch`: https://github.com/idootop/tauri-plugin-cors-fetch
- crates.io: https://crates.io/crates/tauri-plugin-cors-fetch
- `tauri-plugin-better-cors-fetch` (fork with XHR support): https://github.com/wenxig/tauri-plugin-better-cors-fetch

---

## Approach E: Bun Subprocess Proxy (core-proxy)

### How it works

Add a new `core-proxy` Bun plugin (like `core-manifest` or `core-static`) that runs a lightweight HTTP server (Bun's built-in `Bun.serve()`). Source plugins call `core-proxy.fetch` via the existing JSON-RPC mechanism, and `core-proxy` returns the video bytes. The frontend then assembles them into a blob URL.

### Code Example

```typescript
// plugins/core-proxy/main.ts
import { serve } from "bun";

const server = serve({
  port: 0, // random port
  async fetch(req) {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing url", { status: 400 });

    const resp = await fetch(target, {
      headers: { Range: req.headers.get("Range") || "" },
    });

    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
    headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  },
});

// Report port back via stdout JSON-RPC
console.log(JSON.stringify({ id: 0, method: "ready", result: { port: server.port } }));
```

### Tradeoffs

| Pro | Con |
|-----|-----|
| Fits existing plugin architecture | Separate process — extra memory (~30-50MB for Bun) |
| Bun's `Bun.serve()` is fast (based on uSockets) | Port management — need to pass port to frontend |
| No Rust changes needed | Another process to monitor/restart |
| Streaming works natively (Bun returns `ReadableStream`) | Startup latency (Bun process spawn) |

---

## Approach F: Service Worker Interception

### How it works

Register a Service Worker that intercepts `fetch` events for the CDN domain and returns a CORS-wrapped response. The Service Worker can make the actual request via `fetch()` (which in a Tauri WebView may have different CORS behavior) and add the missing headers.

### The Problem

Service Workers in Tauri's WebView are subject to the **same CORS restrictions** as the main page. A Service Worker cannot add `Access-Control-Allow-Origin` to a response it receives from a CORS-blocked origin — the response is already an "opaque" response that the Service Worker cannot read or modify.

From the Fetch spec: if a Service Worker's `fetch()` call gets an opaque response (no CORS), the Service Worker cannot access the body or headers. It can only pass the opaque response through as-is, which the `<video>` element still can't use.

### Workaround

The Service Worker can make the request in `no-cors` mode, get an opaque response, and pass it through — but the `<video>` element will reject opaque responses for media playback. This approach **does not work** for video streaming.

### When it could work

If the CDN sends *some* CORS headers (even partial), a Service Worker could add missing ones. But for CDNs that send **zero** CORS headers (like PeerTube CDN), the Service Worker cannot help.

### Sources

- MDN: Opaque responses: https://developer.mozilla.org/en-US/docs/Web/API/Response/type
- Stack Overflow: Service Worker CORS limitations: https://stackoverflow.com/questions/57134235/fetching-cors-request-in-service-worker
- Chrome blog on Foreign Fetch: https://developer.chrome.com/blog/foreign-fetch

---

## Approach G: Native Video Player Plugin

### How it works

Use a Tauri plugin that launches a **native** video player outside the WebView. The `tauri-plugin-videoplayer` (for Android) or a custom Rust plugin can spawn `mpv`, `VLC`, or the OS-native media player with the CDN URL. Since native players use the OS networking stack (not the browser's), CORS doesn't apply.

### Code Example

```typescript
import { playVideo } from 'tauri-plugin-videoplayer-api';

// Launches native fullscreen player — no CORS issues
playVideo("https://peertube.cpy.re/static/...");
```

### Tradeoffs

| Pro | Con |
|-----|-----|
| No CORS issues at all | Exits the app's UI — user leaves the Tauri window |
| Full codec support | No integration with app's UI (overlay, controls) |
| Hardware-accelerated decoding | Platform-specific (Android ExoPlayer, macOS AVPlayer) |
| Handles any streaming format (HLS, DASH) | Limited to mobile or requires external player binary |

### Sources

- `tauri-plugin-videoplayer`: https://github.com/YeonV/tauri-plugin-videoplayer

---

## Ranking & Recommendation

### Final Ranking

| Rank | Approach | Ease | Cleanliness | Performance | Robustness | Overall |
|------|---------|------|-------------|-------------|-----------|---------|
| **1** | **A: Custom Protocol** | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | **Best** |
| **2** | **C: Embedded Axum Proxy** | ★★★ | ★★★★ | ★★★★★ | ★★★★★ | **Strong** |
| 3 | D: `tauri-plugin-cors-fetch` | ★★★★★ | ★★★ | ★★★ | ★★★ | Good |
| 4 | E: Bun core-proxy | ★★★★ | ★★★ | ★★★ | ★★★ | OK |
| 5 | B: Channel<T> IPC | ★★★★ | ★★★ | ★ | ★★ | Limited |
| 6 | F: Service Worker | ★★ | ★ | ★ | ★ | Doesn't work |
| 7 | G: Native Player | ★★★ | ★★ | ★★★★★ | ★★★★ | Different UX |

### Recommendation

**Use Approach A (Custom Protocol) as the primary solution.** It is the most architecturally clean — no extra ports, no extra processes, no blob assembly, no global fetch monkey-patching. The Tauri team explicitly provides the `streaming` example for this use case. The only downside is the full-body buffering (no chunked streaming), but for typical video files (<2GB) this is acceptable in a desktop app with sufficient RAM.

**Use Approach C (Embedded Axum Proxy) as the fallback** if you need true streaming (no full buffering) or if you hit the Wry streaming body limitation. The Axum approach gives you full HTTP streaming with `Range` request support, at the cost of a localhost TCP port.

**Do not use Approach F (Service Worker)** — it fundamentally cannot solve this problem for CDNs that send zero CORS headers.

---

## Gotchas & Caveats

### 1. Range Request Handling

Video elements send `Range` requests to seek. Your proxy **must** handle:
- Parsing `Range: bytes=<start>-<end>`
- Returning `206 Partial Content` with `Content-Range` header
- Handling `416 Range Not Satisfiable`
- Handling multipart byteranges (rare but possible)

The Tauri streaming example shows all of this. The `http-range` crate handles parsing.

### 2. Memory Usage

- **Custom Protocol (A):** Buffers the entire video in `Vec<u8>`. A 2GB video = 2GB RAM spike. Acceptable for desktop with 15GB RAM, but not for 4K.
- **Axum Proxy (C):** Streams chunk-by-chunk. Memory usage is ~64KB per connection.
- **Channel IPC (B):** Also buffers full video (must assemble blob). Same issue as A.

### 3. CSP Configuration

For custom protocols, add to `tauri.conf.json`:
```json
{
  "security": {
    "csp": "default-src 'self'; media-src stream://*; connect-src 'self' http://127.0.0.1:*;"
  }
}
```

### 4. Port Management (Approaches C, E)

If using a localhost proxy, pick a random port at startup and communicate it to the frontend. Options:
- Tauri managed state → command `get_proxy_port()`
- Environment variable
- Write to a temp file the frontend reads

### 5. Concurrent Streams

Multiple video elements may request different ranges simultaneously. Ensure your proxy handler is stateless or uses a connection pool. `reqwest::Client` pools connections by default.

### 6. Authentication Headers

If the CDN requires auth cookies or headers, the proxy must forward them. For the custom protocol approach, the Rust handler can read cookies from a file (like `yt-auth` does with `.youtube-cookie`) and attach them to the `reqwest` request.

### 7. Tauri v2 `asset` Protocol

Tauri v2 has a built-in `asset` protocol that implements streaming for local files. From the streaming example README: *"Tauri has a built-in `asset` protocol that implements this streaming functionality so you don't need to."* However, the `asset` protocol serves **local files**, not proxied remote URLs. It cannot help with the CDN CORS problem.

### 8. Security Considerations

- **Custom protocols** are sandboxed by the WebView — no network stack exposure.
- **Localhost HTTP servers** (Axum, Bun.serve) open a TCP port. Bind only to `127.0.0.1`, not `0.0.0.0`.
- **CSP headers** must be configured to allow the chosen scheme.
- **Tauri v2 capabilities** can restrict which commands/URLs are accessible.

---

## Electron vs Tauri Comparison

### How Electron Handles This

Electron has `protocol.handle()` + `net.fetch()` which is the closest analogue to Tauri's custom protocol:

```javascript
// Electron
const { protocol, net } = require('electron');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
}]);

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    return net.fetch('https://peertube.cpy.re' + req.url.slice('app://'.length));
  });
});
```

Key differences from Tauri:

| Feature | Electron | Tauri |
|---------|----------|-------|
| Streaming body | ✅ `stream: true` flag | ❌ Must buffer full body (Wry #1404) |
| Async handler | ✅ Native `Promise` support | ✅ `register_asynchronous_uri_scheme_protocol` |
| Range requests | ✅ Automatic via `net.fetch` | ✅ Manual (must parse + forward) |
| CSP bypass | ✅ `bypassCSP: true` | ❌ Must configure CSP manually |
| Memory | ✅ Streams without buffering | ❌ Buffers full response |

Electron's `stream: true` flag is the killer feature Tauri lacks. It tells Chromium to expect streaming responses for `<video>` elements. Without it, Tauri's custom protocol must buffer the entire video.

### Sources

- Electron protocol docs: https://www.electronjs.org/docs/latest/api/protocol
- Electron `net.fetch`: https://www.electronjs.org/docs/latest/api/net
- Electron `registerSchemesAsPrivileged`: https://www.electronjs.org/docs/latest/api/structures/custom-scheme
- Electron 25 migration: https://www.electronjs.org/blog/electron-25-0

---

## Summary

| Approach | Streaming | Seeking | Memory | Complexity | CORS-free | 
|----------|-----------|---------|--------|------------|-----------|
| **A: Custom Protocol** | ❌ (buffers) | ✅ (Range) | High | Low | ✅ |
| **B: Channel<T> IPC** | ❌ (full download) | ❌ | High | Low | ✅ |
| **C: Axum Proxy** | ✅ | ✅ | Low | Medium | ✅ |
| **D: cors-fetch plugin** | ✅ | ✅ | Low | Zero | ✅ |
| **E: Bun core-proxy** | ✅ | ✅ | Low | Medium | ✅ |
| **F: Service Worker** | ❌ | ❌ | — | — | ❌ |
| **G: Native Player** | ✅ | ✅ | Low | Medium | ✅ |

**Bottom line:** Start with **Approach A (Custom Protocol)** — it's the most architecturally clean, fits the Tauri philosophy, and the official example proves it works. If you hit memory issues with large videos, switch to **Approach C (Embedded Axum Proxy)** for true streaming.

---

## Appendix: Current Codebase Integration Points

### Where to add the custom protocol handler

In `src-tauri/src/lib.rs`, the `run()` function at line 266. Add `.register_asynchronous_uri_scheme_protocol("stream", ...)` to the builder chain at line 275, before `.run()`.

### Dependencies to add to Cargo.toml

```toml
[dependencies]
reqwest = { version = "0.12", features = ["stream"] }
http = "1"
http-range = "0.1"
# For Axum approach:
axum = { version = "0.7", features = [] }
tower-http = { version = "0.5", features = ["cors"] }
```

### How the frontend would use it

```typescript
// In movi-player.tsx or wherever the video source is set
// Instead of:
//   videoElement.src = cdnUrl;
// Use:
const resolvedUrl = await invoke("call_hook", {
  hook: "video.player",
  method: "resolve",
  params: { url: watchUrl }
});
// resolvedUrl = "https://peertube.cpy.re/static/..."
// Encode the CDN URL into the custom protocol:
const proxyUrl = `stream://proxy/${encodeURIComponent(resolvedUrl)}`;
videoElement.src = proxyUrl;
```

### How the Rust handler resolves the CDN URL

The handler can call the existing `plugin_request` or `call_hook` mechanism to ask the PeerTube plugin for the resolved CDN URL, then fetch it via `reqwest`. This keeps the resolution logic in the plugin layer where it belongs.
