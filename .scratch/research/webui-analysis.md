# WebUI (webui-dev/webui) — Comprehensive Analysis

**Date:** 2026-09-01
**Version analyzed:** v2.5.0-beta.4
**Repo:** https://github.com/webui-dev/webui
**Docs:** https://webui.me/docs.html
**License:** MIT
**Primary author:** Hassan Draga (Canada)

---

## 1. What It Is

WebUI is a **lightweight C library** (~few KB) that lets you use **any installed web browser** (or optionally a WebView) as the GUI for a native application. The backend is written in your language of choice; the frontend is standard HTML/CSS/JS rendered by whatever browser the user already has installed.

**Key insight:** WebUI does NOT bundle a browser or WebView. It launches the user's existing browser (Chrome, Firefox, Edge, etc.) with a **private profile** and communicates over a local WebSocket connection.

### How it works (high level)

```
┌─────────────────────┐         WebSocket (localhost)        ┌───────────────────┐
│   Backend Process   │◄────────────────────────────────────►│   Browser Window  │
│   (C library + your │    Binary protocol (custom framing)  │   (Chrome/Firefox/ │
│    language code)   │    Port assigned by OS               │    Edge/etc.)     │
└─────────────────────┘                                     └───────────────────┘
```

1. Your backend calls `webui_show(window, html_or_url)` 
2. WebUI picks a free port, generates a unique token, and launches the browser pointing at `http://localhost:<port>`
3. The browser loads a tiny injected bridge script (`webui.js`) that connects back via WebSocket
4. Backend and browser exchange binary-framed messages over the WebSocket
5. The bridge injects `webui.js` into every page the backend serves

**Source:** GitHub README diagram, `bridge/webui.ts` source code

---

## 2. Architecture & IPC Mechanism

### The Bridge

The IPC layer is called the **WebUI Bridge**. It lives in `bridge/webui.ts` (TypeScript, ~32KB), gets transpiled to JS via ESBuild, then converted to a C header (`webui_bridge.h`, ~120KB) via `bridge/js2c.js`. This header is embedded directly into the C library.

### Wire Protocol

The protocol is a **custom binary framing protocol** over WebSocket:

```
Byte 0:    Signature (0xDD = 221)
Bytes 1-4: Token (uint32, little-endian) — authentication token
Bytes 5-6: ID (uint16, little-endian) — message ID for request/response matching
Byte 7:    Command byte (see below)
Bytes 8+:  Data payload (null-terminated strings or raw bytes)
```

**Command bytes:**
| CMD | Value | Purpose |
|-----|-------|---------|
| `CMD_JS` | 254 | Execute JS in browser, return result |
| `CMD_JS_QUICK` | 253 | Fire-and-forget JS execution |
| `CMD_CLICK` | 252 | Click event from browser |
| `CMD_NAVIGATION` | 251 | Navigation event |
| `CMD_CLOSE` | 250 | Close window |
| `CMD_CALL_FUNC` | 249 | Call backend function from browser |
| `CMD_SEND_RAW` | 248 | Raw binary data transfer |
| `CMD_NEW_ID` | 247 | Register new element binding |
| `CMD_MULTI` | 246 | Multi-chunk large message |
| `CMD_CHECK_TK` | 245 | Token verification handshake |
| `CMD_WINDOW_DRAG` | 244 | Frameless window drag |
| `CMD_WINDOW_RESIZED` | 243 | Window resize notification |

**Large messages:** Packets > 65,500 bytes are split into chunks via `CMD_MULTI`.

**Token authentication:** On WebSocket connect, the bridge sends `CMD_CHECK_TK` with its token. The backend accepts or rejects. If rejected, the browser reloads to get a fresh token.

**Source:** `bridge/webui.ts` lines 1-120 (protocol constants), `bridge/webui_bridge.h`

### Binding System

Backend functions are exposed to JS via `webui_bind()`. The bridge:
1. Receives the bind list from backend during token handshake
2. Creates `window.fnName = (...args) => webui.call("fnName", ...args)` for each binding
3. Click events on elements with matching IDs are auto-forwarded to backend

**Source:** `bridge/webui.ts` `#generateCallObjects()`, `#clicksListener()`

---

## 3. Language Support

The core library is **pure C** (single header `webui.h` + implementation). Wrappers exist for:

| Language | Status | Repository |
|----------|--------|------------|
| C/C++ | Native | webui-dev/webui |
| Python | ✅ v2.5 | webui-dev/python-webui |
| Go | ✅ v2.5 | webui-dev/go-webui |
| Rust | ✅ v2.5 | webui-dev/rust-webui |
| Zig | ✅ v2.5 | webui-dev/zig-webui |
| Nim | ✅ v2.5 | webui-dev/nim-webui |
| V | ✅ v2.5 | webui-dev/v-webui |
| Swift | ✅ v2.5 | webui-dev/swift-webui |
| Odin | ✅ v2.5 | webui-dev/odin-webui |
| Pascal | ✅ v2.5 | webui-dev/pascal-webui |
| C# | ✅ v2.5 | Runic-Artifex/cs-webui |
| F# | ✅ v2.5 | no-waves/FSharp-WebUI |
| D | ✅ v2.5 | webui-dev/d-webui |
| TypeScript/JS (Deno) | ✅ v2.5 | webui-dev/deno-webui |
| TypeScript/JS (Bun) | ✅ v2.5 | webui-dev/bun-webui |
| PureBasic | ✅ v2.5 | webui-dev/purebasic-webui |
| Common Lisp | Partial | garlic0x1/cl-webui |
| Delphi | Partial | salvadordf/WebUI4Delphi |
| PHP | Partial | KingBes/php-webui-composer |

All wrappers link against the same C library (static or dynamic).

**Source:** GitHub README Wrappers section

---

## 4. Platform Support

| Platform | Status |
|----------|--------|
| Windows | ✅ Full |
| Linux | ✅ Full |
| macOS | ✅ Full |
| iOS | ❌ Not supported |
| Android | ❌ Not supported |

WebUI has **no mobile support**. It targets desktop only.

**Source:** GitHub README, webui.me

---

## 5. Browser Support

| Browser | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Firefox | ✅ | ✅ | ✅ |
| Chrome | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Chromium | ✅ | ✅ | ✅ |
| Yandex | ✅ | ✅ | ✅ |
| Brave | ✅ | ✅ | ✅ |
| Vivaldi | ✅ | ✅ | ✅ |
| Epic | ✅ | ✅ | ❌ |
| Safari | ❌ | "coming soon" | ❌ |
| Opera | "coming soon" | "coming soon" | "coming soon" |

**Fallback behavior:** If no supported browser is found, WebUI shows a warning. There is no bundled fallback browser.

**WebView support (v2.5+):** Optional — WebView2 (Windows), GTK WebView (Linux), WKWebView (macOS). This is a secondary mode; browsers are primary.

**Source:** GitHub README Supported Web Browsers table

---

## 6. Security Model

### Private Profile
WebUI launches browsers with a **private/incognito-like profile** so the app's browsing data is isolated from the user's personal browser data.

### Token Authentication
Every WebSocket connection requires a token (generated per window). The bridge sends it on connect; the backend verifies. This prevents unauthorized page access.

### TLS Support (Optional)
WebUI can be compiled with TLS support (`WEBUI_USE_TLS=1`), enabling `wss://` WebSocket connections.

### Sandboxing
**WebUI does NOT implement its own sandbox.** It relies entirely on the browser's built-in security model. The browser process runs with whatever permissions the OS grants a normal browser process. There is no capability-based security, no IPC sandboxing, and no content security policy enforcement from the library side.

### What this means
- The browser has full access to the local network, file system (via browser APIs), etc.
- The WebSocket connection is localhost-only, so external processes can't intercept it (assuming no port sniffing)
- The private profile prevents data leakage between sessions
- But there's no Tauri-style capability system — the browser is a full browser

**Source:** GitHub README "Uses private profile for safety", `bridge/webui.ts` token system, docs

---

## 7. Bundle Size

| Component | Size |
|-----------|------|
| webui.h (header) | ~45 KB |
| webui_bridge.h (embedded JS) | ~120 KB |
| Compiled static library | **Few KB** |
| Total app overhead | **Near zero** — just the library |
| Typical final binary | Language-dependent, but library adds only KBs |

This is dramatically smaller than:
- Electron: ~100-150 MB (bundles Chromium + Node.js)
- Tauri: ~2-10 MB (uses OS WebView, has Rust runtime)
- CEF: ~150 MB (bundles Chromium)

**Source:** GitHub README, build commands showing `-Os` optimization

---

## 8. Performance

### Startup Time
WebUI launches an existing browser process, which is fast (~100-300ms typical). The browser binary is already optimized and cached by the OS.

### Memory Usage
Memory usage is that of a browser tab. A simple app might use 30-100 MB (browser tab overhead). The C library itself is negligible.

### Communication Speed
The WebSocket protocol is described as "fast binary WebSocket communication protocol." Being localhost, latency is sub-millisecond. No cross-process IPC serialization overhead beyond the binary framing.

**Source:** GitHub README features

---

## 9. CEF Comparison

| Aspect | WebUI | CEF |
|--------|-------|-----|
| Browser engine | User's installed browser | Bundled Chromium |
| Binary size | Few KB | ~150 MB |
| Rendering consistency | Browser-dependent | Identical everywhere |
| Feature completeness | Full browser features | Full Chromium features |
| Mobile support | ❌ | ❌ |
| Process model | Browser is separate process | Multi-process (browser+renderer+GPU) |
| Embedding | Launches external browser | Embeds Chromium in your process |
| Language support | Any (via C library) | C/C++ primarily |
| Maintenance burden | Low (browser updates itself) | High (must track Chromium releases) |
| Sandbox | Browser's built-in | Chromium sandbox |

### Can WebUI do everything CEF can?

**No.** Key differences:
1. **Rendering consistency:** CEF bundles Chromium so rendering is identical everywhere. WebUI uses whatever browser is installed — CSS/JS behavior may differ between Firefox and Chrome.
2. **Off-screen rendering:** CEF supports off-screen rendering (render to texture). WebUI cannot do this — it renders in a browser window.
3. **Deep browser integration:** CEF gives you DevTools, network interception, cookie management, etc. at the API level. WebUI only gives you the WebSocket bridge.
4. **Custom browser flags:** CEF lets you set Chromium flags. WebUI passes limited flags to the launched browser.
5. **Persistence:** CEF gives you fine-grained control over cookies, cache, storage. WebUI uses a private profile with limited control.

### What WebUI does better:
- **Size:** Orders of magnitude smaller
- **Simplicity:** No build dependencies beyond a C compiler
- **Language agnostic:** Works with any language via C FFI
- **Maintenance:** Browser updates itself, no Chromium version tracking

**Source:** Architecture comparison, CEF documentation knowledge

---

## 10. Tauri Compatibility

### Could WebUI replace Wry inside Tauri?

**Not directly.** Tauri's architecture:
- **Wry** = cross-platform WebView abstraction (uses WebView2/WebKitGTK/WKWebView)
- **Tao** = window management
- **Tauri** = framework that combines Wry + Tao + IPC + security model

WebUI is a fundamentally different approach:
- WebUI launches an **external browser** (not an embedded WebView)
- Wry embeds a **native WebView** inside your window

They serve different purposes:
- Wry/WebUI's WebView mode: renders inside your window, you control the window
- WebUI's browser mode: opens a separate browser window, you don't control the window chrome

### Could WebUI replace Tauri entirely?

**Potentially, with trade-offs:**

| Aspect | Tauri | WebUI |
|--------|-------|-------|
| Window control | Full (via Tao) | Browser window (limited) |
| Native menus | Yes | No |
| System tray | Yes | No |
| File dialogs | Yes | Via browser APIs |
| Notifications | Yes | Via browser APIs |
| Mobile | iOS + Android | ❌ |
| Security model | Capability-based | Browser's built-in |
| Custom protocols | Yes | Limited |
| Auto-update | Yes (plugin) | No |
| Installer generation | Yes | No |

**Verdict:** WebUI could work for apps that just need to display a web UI and don't need deep OS integration. But Tauri provides a much richer platform for building proper desktop apps.

**Source:** Tauri architecture docs, Wry repository, webui.me

---

## 11. Maturity

| Metric | Value |
|--------|-------|
| GitHub Stars | 4,587 |
| Forks | 305 |
| Watchers | 50 |
| Open Issues | 6 |
| Total Commits | 1,518 |
| Created | Nov 2020 |
| Latest Release | v2.5.0-beta.4 |
| Primary Language | C |
| License | MIT |

### Assessment

**Moderately mature but pre-1.0:**
- 5+ years of development
- Active development (1,518 commits)
- Beta version (2.5.0-beta.4) — not yet stable
- Small but dedicated community
- Limited production usage documentation
- No major production deployments documented (unlike Electron/Tauri)
- The wrapper ecosystem is community-maintained with varying completeness

### Compared to alternatives
- **Electron:** 121K stars, 10+ years, powers VS Code/Slack/Discord
- **Tauri:** 107K stars, 5+ years, stable v2, mobile support
- **WebUI:** 4.6K stars, 5+ years, beta, desktop only

**Source:** GitHub API response (stars, forks, commits), release tags

---

## 12. Limitations

### Critical
1. **No mobile support** — desktop only (no iOS, no Android)
2. **No Safari support** — "coming soon" for years
3. **Browser dependency** — requires a supported browser installed; no fallback
4. **No rendering consistency** — UI may look different in Chrome vs Firefox
5. **No off-screen rendering** — cannot render to texture, embed in other windows

### Architectural
6. **No window management** — can't control window position, size, chrome programmatically (beyond basic move/resize)
7. **No native menus** — no system menu bar, context menus are browser-native
8. **No system tray** — no tray icon support
9. **No auto-update** — no built-in update mechanism
10. **No installer generation** — no MSI/DMG/AppImage packaging

### Security
11. **No sandboxing** — relies on browser's security, no capability model
12. **No CSP enforcement** — no content security policy from library side
13. **Localhost WebSocket** — theoretically accessible to other local processes

### Developer Experience
14. **Beta quality** — still in beta, APIs may change
15. **Limited documentation** — docs are basic, mostly API reference
16. **No DevTools integration** — can't programmatically access browser DevTools
17. **No cookie/session control** — limited browser profile management
18. **No custom protocol handlers** — can't register custom URL schemes

### Known Issues
- Safari support has been "coming soon" since early versions
- Opera support similarly perpetually "coming soon"
- The bridge JS is embedded as a C header — rebuild required for bridge changes
- WebView mode (v2.5+) is newer and less tested than browser mode

**Source:** GitHub issues, README limitations, API documentation

---

## 13. Relevance to Flux

### For the Flux system architecture

WebUI's approach is interesting because it aligns with several Flux principles:

**Pros:**
- **Language agnostic** — any backend language works (Flux's rule 3)
- **Tiny footprint** — near-zero overhead (Flux's rule 2 — small core)
- **No framework lock-in** — uses standard web technologies (Flux's rule 5)
- **Plugin-friendly architecture** — the binding system could map to Flux's plugin communication
- **Subprocess communication model** — browser as separate process communicating via protocol (similar to Flux's rule 12 — IPC via stdin/stdout JSON)

**Cons:**
- **No mobile** — Flux aims for cross-platform including mobile
- **No WebView embedding** — can't embed the UI inside another app's window
- **No window management** — Flux needs control over the app window
- **No auto-update** — Flux apps need update mechanisms
- **Beta quality** — Flux needs stable foundations
- **No capability-based security** — Flux's plugin system needs sandboxing

### As a potential "skeleton" for Flux

WebUI could serve as a **reference implementation** for how a Flux skeleton might work:
- Backend in any language, communicating with frontend via WebSocket
- Frontend loaded from the backend (embedded or served)
- Binary protocol for efficient communication

But it's not suitable as a production skeleton for Flux because:
1. It depends on an external browser (Flux should be self-contained)
2. It lacks the window/app management needed for desktop apps
3. It has no concept of plugins, capabilities, or security boundaries

**Better alternatives for Flux skeleton:**
- **Tauri** — proven architecture, mobile support, security model, but Rust-heavy
- **Deno Desktop** — TypeScript-native, IPC-free bindings, but experimental
- **Custom approach** — build a thin shell per-platform that embeds WebView and communicates with plugins via stdin/stdout JSON (Flux's stated IPC preference)

**Source:** Flux AGENTS.md rules, WebUI analysis

---

## 14. Sources

1. **GitHub Repository:** https://github.com/webui-dev/webui
2. **GitHub API:** `api.github.com/repos/webui-dev/webui` (stars, forks, commits)
3. **Documentation:** https://webui.me/docs.html (Docsify-based)
4. **Bridge source:** `bridge/webui.ts` (full IPC protocol implementation)
5. **Bridge README:** `bridge/README.md` (build instructions)
6. **C header:** `include/webui.h` (API reference)
7. **Go wrapper:** https://github.com/webui-dev/go-webui
8. **Python wrapper:** https://github.com/webui-dev/python-webui
9. **Rust wrapper:** https://github.com/webui-dev/rust-webui
10. **Tauri architecture:** https://tauri.app/v1/references/architecture/
11. **Wry repository:** https://github.com/tauri-apps/wry
12. **Deno Desktop comparison:** https://docs.deno.com/runtime/desktop/comparison/
13. **Electron vs Tauri 2026:** https://simpletechguides.com/comparisons/deno-desktop-vs-electron-vs-tauri/
14. **Desktop frameworks comparison:** https://www.digitalapplied.com/blog/desktop-apps-web-stack-tauri-electron-deno-wails-2026
