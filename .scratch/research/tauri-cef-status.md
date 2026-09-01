# Tauri CEF (Chromium Embedded Framework) Support — Research Report

**Date:** 2026-08-31  
**Status:** Active development, alpha releases shipping, NOT merged to stable

---

## 1. The `feat/cef` Branch on tauri-apps/tauri

**Status: Active, NOT merged to `dev` or `main`.**

- The branch exists at `https://github.com/tauri-apps/tauri/tree/feat/cef`
- It has **6,532 commits** (vs `dev` which is the stable branch)
- It is **actively maintained** — regularly merged from `dev` (latest merge: May 9, 2026 by `lucasfernog`)
- PRs targeting this branch carry the label `scope: cef`
- As of Aug 2026, there are **6 open PRs** and **6 closed PRs** with the `scope: cef` label
- **Alpha releases are being published** under the `tauri-cef-v3.0.0-alpha.XX` tag series (latest: `v3.0.0-alpha.19` on Jul 15, 2026)
- The `@tauri-apps/cli-cef-v3.0.0-cef.0` pre-release was published May 4, 2026

**Key takeaway:** This is a parallel development track. The CEF runtime ships as alpha releases alongside stable Tauri v2.11.x. It has NOT been merged into stable and there is no public timeline for that.

**Sources:**
- https://github.com/tauri-apps/tauri/tree/feat/cef
- https://github.com/tauri-apps/tauri/pulls?q=is%3Apr+label%3A%22scope%3A+cef%22
- https://releasealert.dev/github/tauri-apps/tauri

---

## 2. The `cef-rs` Crate (tauri-apps/cef-rs)

**Status: Mature, actively maintained, 453 stars, 68 forks.**

- **Created:** January 10, 2025
- **Default branch:** `dev`
- **License:** Apache-2.0 + MIT
- **Commits:** 1,105
- **Open issues:** 10 | **Open PRs:** 6
- **13 contributors** including core Tauri team members (`lucasfernog`, `wusyong`, `csmoe`, `wravery`)

### What it provides:
- Safe Rust wrappers over CEF's C API (`cef-dll-sys` is the raw FFI, `cef` is the safe wrapper)
- **Supported targets:** Linux x86_64/ARM64, macOS x86_64/ARM64, Windows x86_64/ARM64 (all ✅)
- Wraps: `CefApp`, `CefBrowser`, `CefClient`, `WindowInfo` (including `set_as_child`), `CefMessageRouterBrowserSide`/`RendererSide`
- Tracks CEF releases within days (currently at CEF **v146**, with 254+ releases tracked)
- Handles CEF binary download, macOS helper bundle generation, CMake compilation
- `download-cef` crate fetches from `cef-builds.spotifycdn.com`
- `export-cef-dir` manages shared CEF installations (`~/.local/share/cef`)
- `bundle-cef-app` utility for creating platform-appropriate bundles

### What it does NOT provide (gaps for Tauri integration):
- `CefSchemeHandlerFactory` / `CefResourceHandler` — needed for custom protocol IPC
- `CefV8Handler` / V8 extensions — needed for `window.ipc.postMessage` fallback
- `CefRenderProcessHandler` — needed for initialization script injection
- Message loop bridging — CEF external_message_pump ↔ tao event loop

These gaps are filled by either `tauri-runtime-cef` (official) or `wrymium` (community).

**Sources:**
- https://github.com/tauri-apps/cef-rs
- https://crates.io/crates/cef (referenced by tauri-runtime-cef's Cargo.toml)

---

## 3. What `features = ["cef"]` Does

When you add `features = ["cef"]` to your Tauri dependency:

```toml
[dependencies.tauri]
version = "2"
default-features = false
features = ["cef"]
```

It switches Tauri's runtime backend from `tauri-runtime-wry` (system WebView) to `tauri-runtime-cef` (CEF-based WebView). Specifically:

- **Disables** `tauri-runtime-wry` (the default WRY-based runtime)
- **Enables** `tauri-runtime-cef` (the CEF-based runtime, version `0.1.0`)
- The `tauri-runtime-cef` crate depends on `cef = "=146.4.1"` and `cef-dll-sys = "=146.4.1"` (pinned versions)
- It is only available on the `feat/cef` branch — **not published to crates.io** for the `tauri-runtime-cef` crate itself
- Users must use `[patch.crates-io]` to point all Tauri crates at the `feat/cef` branch:

```toml
[patch.crates-io.tauri]
git = "https://github.com/tauri-apps/tauri"
branch = "feat/cef"
```

The CEF runtime (`tauri-runtime-cef` v0.1.0) is a separate crate at `crates/tauri-runtime-cef/` within the Tauri monorepo, only on the `feat/cef` branch.

**Sources:**
- https://github.com/tauri-apps/tauri/pull/15024 (shows the patch.crates-io setup)
- https://github.com/tinyhumansai/openhuman/blob/main/app/src-tauri/Cargo.toml (real-world usage)
- StackOverflow answer from Mar 2025: https://stackoverflow.com/questions/79521042

---

## 4. Official Docs and Blog Posts

### Official Tauri documentation:
- **No official CEF documentation exists on v2.tauri.app.** The official docs only reference system WebViews (WKWebView, WebView2, WebKitGTK).
- The Tauri 2.0 stable release blog post (Oct 2024) mentioned CEF as a **future possibility**: "Providing or Bundling Chromium Embedded Framework (CEF) for Linux as an alternative to WebKit2GTK"
- There is an **experimental Tauri Verso integration** blog post (Mar 2025) about Servo, but nothing equivalent for CEF.

### Third-party / community:
- **Atrium blog post** (May 22, 2026): "From WKWebView to CEF: embedding Chromium in a Tauri app" — detailed production experience shipping CEF in a real app
  - https://getatrium.dev/blog/embedding-real-browser-tauri
- **wrymium spec** — comprehensive community-driven CEF integration spec
  - https://github.com/gxcsoccer/wrymium/blob/main/docs/wrymium-spec.md
- **YouTube talk** (May 6, 2025): "Chromium (CEF) In Tauri With Bill Avery: Swapping Out The Webview"
  - https://www.youtube.com/watch?v=6SO_hRDDGXs

**Key takeaway:** The official team has been cautious about publicizing CEF support. It's treated as experimental/alpha. The community has been pushing it forward with projects like wrymium and real-world apps like atrium and openhuman.

---

## 5. Known Limitations and Blockers

### Bundle Size
- CEF adds **~170MB** to the app bundle (vs ~0 for system WebKit)
- ZSTD compression reduces download to ~50-60MB
- macOS requires **5 helper app bundles** (generic, GPU, renderer, plugin, alerts)

### Initialization
- CEF init costs **hundreds of ms to a couple of seconds** on cold launch
- Must be deferred to after first paint to avoid UI freezes
- CEF must be initialized before any windowing code runs (conflicts with wry's model)

### Platform-Specific Issues (active PRs)
- **Linux/X11 multiwebview windowing bugs** — fixed in PR #15534 (merged Jun 2026), 764 lines changed
- **macOS parent window content view** — PR #15726 (closed/draft, Jul 2026)
- **Custom protocol authority mapping** — PR #15749 (open, Jul 2026)
- **CPU usage on idle** — fixed in PR #15479 (merged Jun 2026)
- **winit-gtk4 migration** — PR #15787 (open, Jul 2026)

### Architecture Limitations
- CEF is **multi-process** (browser + renderer + GPU + utility) — wry assumes single-process
- CEF requires **custom message loop integration** — wry delegates event loops to consumers
- `hitTest:` on macOS requires native override — CSS `pointer-events: none` doesn't work at the AppKit level
- The CEF helper process is separate — logging/panic handlers must be set up independently
- CEF message pump can cause **reentrant panics** if not routed through async scheduling

### Sandboxing
- CEF renderer sandbox works but starts with `--no-sandbox` for PoC
- macOS sandbox requires per-helper entitlements (not yet implemented)

### Not Published to crates.io
- `tauri-runtime-cef` is **not published** to crates.io
- Users must use `[patch.crates-io]` pointing at the `feat/cef` branch
- This is a significant developer experience friction point

### Mobile
- CEF does **not support iOS or Android** — no mobile CEF runtime exists
- The `feat/cef` branch is desktop-only (Windows, macOS, Linux)

### Release Status
- Alpha releases: `tauri-cef-v3.0.0-alpha.19` (Jul 15, 2026)
- No stable release date announced
- No milestone on the Tauri GitHub project for "CEF stable"

---

## Summary Table

| Aspect | Status |
|--------|--------|
| `feat/cef` branch | Active, not merged to stable |
| `cef-rs` crate | Mature (453★, 1105 commits, all platforms) |
| `tauri-runtime-cef` | v0.1.0, alpha, not on crates.io |
| `features = ["cef"]` | Switches runtime from wry to CEF, requires patch.crates-io |
| Official docs | None — alpha/experimental only |
| Bundle size | +170MB (vs ~0 for system WebView) |
| Platforms | Desktop only (Win/Mac/Linux), no mobile |
| Production use | Yes — atrium, openhuman ship with CEF today |
| Stable release timeline | Unknown — alpha cadence is ~weekly |
