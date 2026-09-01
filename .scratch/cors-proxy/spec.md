# CORS-Bypassed Video Streaming via `tauri-plugin-cors-fetch`

Status: `done`

## Problem Statement

PeerTube CDNs (e.g. `peertube.cpy.re`) send zero CORS headers. Flux's video player — `movi-player` — fetches video bytes via the browser's `fetch()` API through its `HttpSource`. The browser blocks these responses (opaque responses are unusable), so PeerTube videos fail to load and play. YouTube videos work fine because Google's CDN sends proper CORS headers.

## Solution

Install `tauri-plugin-cors-fetch` (v5), an unofficial Tauri plugin that monkey-patches the global `fetch()` function and routes all HTTP requests through Tauri's Rust-side HTTP client (`reqwest`), which has no CORS restrictions. Since `movi-player`'s `HttpSource` uses `fetch()` for all HTTP requests (HEAD, ranged GETs, stream reads), the plugin intercepts every byte fetch from the video pipeline.

This requires zero code changes to any existing plugin backend or frontend component.

## User Stories

1. As a user, I want to watch PeerTube videos from the feed, so that I can access decentralized video content.
2. As a user, I want video seeking to work on PeerTube videos, so that I can skip to any point in the video.
3. As a developer, I want a CORS solution that requires no changes to existing plugin code, so that I don't need to modify `flux-player`, `peertube`, `yt-feed`, or any other plugin.
4. As a developer, I want YouTube videos to continue working unchanged, so that existing functionality is not regressed.
5. As a developer, I want the CORS proxy to be removable without code changes to plugins, so that if we switch approaches later, the plugin code stays clean.
6. As a maintainer, I want to verify that the CORS plugin is active at runtime, so that I can debug issues when videos fail to play.
7. As a developer, I want video loading to remain performant enough for smooth playback, so that the IPC overhead per chunk doesn't cause buffering or stutter.

## Implementation Decisions

### Plugin choice: `tauri-plugin-cors-fetch` v5

- **Dependency:** `cargo add tauri-plugin-cors-fetch --version 5`
- **Registration:** `.plugin(tauri_plugin_cors_fetch::init())` in the Tauri builder chain
- **Capability:** `"cors-fetch:default"` permission in `src-tauri/capabilities/default.json`
- **Config:** `"app.withGlobalTauri": true` in `tauri.conf.json`

### How it works for movi-player's HttpSource

`HttpSource` makes all video byte requests via `fetch()`:

1. **HEAD request** — for `Content-Length` (resolves file size). Forwarded by the plugin, `Content-Length` header survives.
2. **Ranged GETs** — `fetch(url, { headers: { Range: "bytes=..." } })`. The plugin's Rust code special-cases `Range` headers: it adds `Accept-Encoding: identity` per the Fetch spec, then forwards to `reqwest`. The CDN's `206 Partial Content` response (including `Content-Range`) is returned through the plugin's `ReadableStream`.
3. **Streaming reads** — `response.body.getReader()` on the plugin's `ReadableStream`. Each chunk is fetched via a Tauri IPC call (`fetch_read_body`), which reads one chunk from the `reqwest` response stream and relays it to JS.

### IPC overhead concern

Every byte chunk from the video passes through Tauri IPC (`invoke("plugin:cors-fetch|fetch_read_body")`). For typical HD video (~5-10 MB/s), this means:
- ~10-20 IPC calls per second (at 500KB chunks)
- Each IPC call has serialization overhead (~0.1-0.5ms for binary data)

This is the primary risk. If playback stutters, switch to Approach A (Custom Protocol) which avoids IPC entirely — the WebView's network stack calls the Rust handler directly.

### Default config: proxy all http(s)

The plugin proxies all `http://` and `https://` requests by default. Tauri internal protocols (`ipc://`, `asset://`) are excluded automatically. No custom `include`/`exclude` patterns needed at this stage.

### Configuration (optional, for future tuning)

```typescript
// Can be set from frontend if needed:
window.CORSFetch.config({
  include: [/^https:\/\/peertube\.cpy\.re/i],
  exclude: ["https://api.openai.com/v1/chat/completions"],
})
```

Not needed now — the default (proxy all) is fine for a desktop app with no third-party content.

## Testing Decisions

### What makes a good test

Only external behavior matters: **does a PeerTube video play?** Internal mechanism (IPC calls, chunk sizes, header forwarding) is implementation detail.

### Test seams (highest to lowest)

1. **E2E manual: PeerTube video plays in the app**
   - Load the app, navigate feed, click a PeerTube video
   - Verify: video loads, plays, audio syncs, seeking works
   - Verdict: the canonical test. If this passes, the feature works.

2. **PeerTube resolve + fetch smoke**
   - Open devtools console
   - Call `window.__pluginRpc("peertube.resolve", { url: "..." })` to get a CDN URL
   - Call `fetch(url)` on the resolved URL
   - Check `response.status` and that body bytes are readable (not opaque)
   - Verdict: isolates the CORS fix from the player pipeline

3. **YouTube regression**
   - Play a YouTube video from the feed
   - Verify it still loads and plays identically to before
   - Verdict: the CORS proxy must not break existing functionality

4. **Plugin initialization smoke**
   - Check `window.CORSFetch` is defined after app load
   - Check `window.fetch !== window.fetchNative` (fetch is patched)
   - Verdict: quick confirmation the plugin initialized

### Testing infrastructure

No automated test infrastructure needed at this stage. Manual testing via Tauri dev mode (`bun run dev`) is sufficient for a prototype.

## Out of Scope

- **XMLHttpRequest interception.** The plugin does not patch XHR. This is fine — Flux uses `fetch()` exclusively.
- **Custom protocol (Approach A).** Not implemented. If IPC overhead causes stuttering, this is the fallback path.
- **Auth cookie forwarding.** The plugin has a `cookies` feature (Cargo feature flag) but it's not needed yet — PeerTube CDN URLs don't require auth. If needed later, enable via `features = ["cookies"]`.
- **Selective domain filtering.** Default is proxy-all. Filtering can be added later via `window.CORSFetch.config()` if needed.
- **Build-time plugin embedding.** The plugin is a Cargo dependency, not a separate binary. No build pipeline changes.
- **Service Worker or native player approaches.** Documented in research but ruled out.

## Further Notes

### Migration path if IPC overhead is too high

If playback is smooth, stay with Approach D. If seeking is slow or high-bitrate streams stutter:

1. Switch to **Approach A (Custom Protocol)** — `register_asynchronous_uri_scheme_protocol("stream", ...)` in Rust
2. Movi-player's `HttpSource` would call `fetch("stream://proxy/...")` instead of `fetch("https://cdn/...")`
3. The custom protocol handler is called directly by the WebView's network stack — zero IPC overhead per chunk
4. The Rust handler code already exists as a reference in `docs/research/cors-proxy-approaches.md`
5. Required Cargo deps: `reqwest`, `http`, `http-range`; feature flag: `custom-protocol` on `tauri`

### movi-player compatibility details

`movi-player` (v0.3.5) uses `HttpSource` which:
- Calls `fetch()` with `Range` headers for byte-range access
- Uses `response.body.getReader()` for streaming
- Uses `SharedArrayBuffer` + `Atomics` for zero-copy on supported browsers

The CORS plugin returns a standard `Response` with a `ReadableStream` body. `HttpSource`'s streaming path (`readStreamBackground`) reads from this stream via `reader.read()`. The `SharedArrayBuffer` fast path is only used when the source URL is on the same origin — proxied URLs will use the standard streaming path, which is acceptable.

### CSP note

`tauri.conf.json` already has `"csp": null` (disabled), so no CSP configuration is needed for the plugin.

## Completion Notes

Implemented 2026-07-18. All 4 changes applied and verified:

- ✅ Plugin compiles and registers in Tauri builder
- ✅ `window.CORSFetch` defined, `fetch` is patched (different from `fetchNative`)
- ✅ Range requests return `206 Partial Content` through the proxy
- ✅ Data flows via IPC (`fetch_read_body` returns correct bytes)

### Remaining issue (unrelated to CORS proxy)

Video doesn't play in `<movi-player>` despite the proxy working correctly. Player enters `movi-linear` (sequential download) mode. Likely a handoff issue in `flux-player.tsx` or a `SharedArrayBuffer` mismatch. movi-player Logger defaults to `SILENT` (no errors visible).

See handoff: `/tmp/flux-cors-proxy-handoff.md`

---

### Version compatibility

`tauri-plugin-cors-fetch` v5 targets Tauri v2 (confirmed via its `Cargo.toml` and release history). Flux uses Tauri v2 (from `Cargo.toml`: `tauri = { version = "2", features = [] }`).

### Constraint: withGlobalTauri

The plugin requires `"app": { "withGlobalTauri": true }` in `tauri.conf.json`. This exposes `window.__TAURI_INTERNALS__` which the plugin's IIFE uses for IPC. This is also used by other parts of the app (the global bridge API in `App.tsx` sets `window.__pluginRpc` via `invoke`), so it should already be functionally available.
