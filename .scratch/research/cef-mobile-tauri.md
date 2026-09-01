# CEF (Chromium Embedded Framework) on Mobile with Tauri — Research

## Executive Summary

**CEF is NOT available on mobile platforms.** It is a desktop-only library (Windows, macOS, Linux). Tauri on mobile uses system-provided webviews: WKWebView on iOS and Android WebView on Android. You cannot use CEF on iOS or Android with Tauri — or with anything else.

---

## 1. Does Tauri's mobile support use system webviews or can it use CEF?

Tauri's mobile support uses **system-provided webviews exclusively**:

- **iOS**: WKWebView (Apple's WebKit-based webview)
- **Android**: Android System WebView (Chromium-based, maintained by Google)

Sources:
- [Tauri WebView Versions Reference](https://v2.tauri.app/reference/webview-versions/) — "Tauri uses the system Android WebView, which is based on Chromium" and "On macOS, Tauri uses the webview that comes preinstalled with macOS"
- [Tauri Architecture (GitHub)](https://github.com/tauri-apps/tauri/blob/8718d081/ARCHITECTURE.md) — "WRY provides a unified interface to the system webview, leveraging WKWebView on macOS & iOS, WebView2 on Windows, WebKitGTK on Linux and Android System WebView on Android"
- [Tauri feat/cef branch](https://github.com/tauri-apps/tauri/tree/feat/cef) — CEF integration exists only for desktop (macOS, Windows, Linux). No mobile targets listed.

There is no configuration option or feature flag to use CEF on mobile.

---

## 2. Is CEF available on mobile platforms?

**No.** CEF is a desktop-only framework.

### Evidence from CEF's own maintainers:

1. **CEF Forum (2014)** — CEF maintainer Marshall Greenblatt:
   > "No, that is not possible on iOS. Only desktop platforms are currently supported."
   Source: [CEF Forum - Building CEF for iOS](https://magpcss.org/ceforum/viewtopic.php?t=11949)

2. **CEF Forum (2021)** — CEF maintainer:
   > "CEF is not supported on Android. It does work with ARM Linux."
   Source: [CEF Forum - Cef on Android](https://www.magpcss.org/ceforum/viewtopic.php?t=18268)

3. **GitHub Issue #1991** — "Add Android support" filed in **2016**, still open with no progress:
   > "This issue is blocked on completion of issue #1990 (Linux ARM support)."
   Source: [chromiumembedded/cef#1991](https://github.com/chromiumembedded/cef/issues/1991)

### CEF's official build platforms:

From the [CEF Branches and Building page](https://chromiumembedded.github.io/cef/branches_and_building.html), the supported build targets are:

| Platform | Status |
|----------|--------|
| Windows  | ✅ Supported (Win 10+) |
| macOS    | ✅ Supported (12.0+) |
| Linux    | ✅ Supported (Ubuntu 20.04+, Debian 10+) |
| iOS      | ❌ Not supported |
| Android  | ❌ Not supported |

CEF's `cef_build.h` header defines `OS_IOS` and `OS_ANDROID` macros, but these are **build system detection macros** inherited from Chromium — they do NOT mean CEF supports those platforms. They're used internally for conditional compilation within the library itself.

### Why CEF can't work on mobile:

1. **iOS restrictions**: Apple requires all iOS browsers to use WKWebView. Chrome on iOS is literally a wrapper around WKWebView. Apple's App Store policies prohibit third-party browser engines. CEF (which embeds Chromium) would violate this.

2. **Android**: While Android is more permissive, CEF's multi-process architecture (browser process + renderer process + GPU process + utility process) doesn't map well to Android's process model. The Android System WebView already provides Chromium-based rendering with proper Android lifecycle integration.

3. **CEF's architecture**: CEF is designed for desktop embedding where it manages its own window hierarchy, message loops, and process model. Mobile platforms manage these differently (Activity lifecycle, system webview integration, etc.).

---

## 3. What are the alternatives for Tauri mobile webviews?

### iOS
| Option | Description |
|--------|-------------|
| **WKWebView** (default) | Apple's native webview. Tauri uses this by default via wry. |
| No CEF alternative | Apple's policies prohibit alternative browser engines |

### Android
| Option | Description |
|--------|-------------|
| **Android WebView** (default) | Chromium-based system webview. Tauri uses this via wry. |
| **Chrome Custom Tabs** | Opens URLs in Chrome (not an embedded webview) |
| No CEF alternative | CEF is not supported on Android |

### Desktop (for comparison)
| Option | Description |
|--------|-------------|
| **WebView2** (Windows) | Chromium-based, built into Windows |
| **WKWebView** (macOS) | WebKit-based, built into macOS |
| **WebKitGTK** (Linux) | WebKit-based, available on Linux |
| **CEF** (desktop only) | Full Chromium embedding, ~170MB bundle increase |

---

## 4. Mobile-specific limitations with Tauri's webview approach

| Limitation | iOS (WKWebView) | Android (System WebView) |
|------------|-----------------|--------------------------|
| **Rendering engine** | WebKit (Safari's engine) | Chromium |
| **Cross-platform consistency** | Different from Android (WebKit vs Chromium) | Different from iOS (Chromium vs WebKit) |
| **Feature parity** | WebKit lags behind Chromium on some web APIs | Chromium is generally more up-to-date |
| **Engine updates** | Controlled by Apple via OS updates | Controlled by Google via Play Store updates |
| **Custom protocol support** | Limited (custom schemes are restricted) | Supported |
| **Multi-process** | Single process (WKWebView is in-app) | System-managed process isolation |
| **DevTools** | Safari Web Inspector (limited) | Chrome DevTools (via USB) |

### Key architectural difference from desktop:
- On desktop, you can potentially replace the webview entirely (CEF, Servo, etc.)
- On mobile, you're constrained to the platform-provided webview — there's no "swap the engine" option

---

## 5. Is there any discussion or work on CEF for mobile in the Tauri ecosystem?

### Active CEF efforts (desktop only):

1. **tauri-apps/cef-rs** — Official CEF Rust bindings maintained by the Tauri organization:
   - Supports: Linux x86_64, macOS x86_64, Windows x86_64, Linux ARM64, macOS ARM64, Windows ARM64
   - **No mobile targets listed**
   - Source: [github.com/tauri-apps/cef-rs](https://github.com/tauri-apps/cef-rs/)

2. **tauri-apps/tauri/tree/feat/cef** — Official Tauri CEF integration branch:
   - Desktop only (macOS, Windows, Linux)
   - Source: [github.com/tauri-apps/tauri/tree/feat/cef](https://github.com/tauri-apps/tauri/tree/feat/cef)

3. **wrymium** — Community CEF backend for wry:
   - "Supporting mobile platform support (iOS, Android) in v1" is listed as **explicitly NOT in scope**
   - Source: [github.com/gxcsoccer/wrymium](https://github.com/gxcsoccer/wrymium/blob/main/docs/wrymium-spec.md)

4. **tauri-runtime-cef** (Kabegame) — CEF runtime implementation:
   - "Android does not include CEF in Kabegame's dependency tree"
   - Source: [gist](https://gist.github.com/MulverineX/4a26a5d6b20b91856c665655be7ce1eb)

### Why no one is working on CEF for mobile with Tauri:

The fundamental reason is that **it's technically impossible on iOS** (Apple's policies) and **unnecessary on Android** (Android WebView already provides Chromium-based rendering). Adding CEF to mobile would:
- Violate iOS App Store policies (if it were possible)
- Add ~170MB to the app bundle for no benefit on Android
- Require solving complex lifecycle integration problems that the system webview already handles

---

## 6. Practical recommendation

If you need consistent Chromium rendering across all platforms with Tauri:

| Platform | What you get | Chromium? |
|----------|--------------|-----------|
| Windows | WebView2 (Chromium-based) | ✅ Yes |
| macOS | WKWebView (WebKit) | ❌ No (but very capable) |
| Linux | WebKitGTK (WebKit) | ❌ No (CEF can replace this) |
| iOS | WKWebView (WebKit) | ❌ No (cannot be changed) |
| Android | Android WebView (Chromium) | ✅ Yes |

**For your specific use case** (CEF + Tauri on mobile): This is not achievable. The mobile platforms don't support it, and Tauri's architecture doesn't provide a path to make it work.

**What you CAN do:**
- Use Tauri's default webviews on mobile (WKWebView on iOS, Android WebView on Android)
- Use CEF on desktop if you need full Chromium capabilities (via the `feat/cef` branch or wrymium)
- Accept that mobile and desktop will have different rendering engines — this is the same tradeoff Chrome on iOS makes

---

## Sources

1. [CEF GitHub Repository](https://github.com/chromiumembedded/cef)
2. [CEF Documentation - Branches and Building](https://chromiumembedded.github.io/cef/branches_and_building.html)
3. [CEF Forum - Building CEF for iOS](https://magpcss.org/ceforum/viewtopic.php?t=11949)
4. [CEF Forum - Cef on Android](https://www.magpcss.org/ceforum/viewtopic.php?t=18268)
5. [GitHub Issue #1991 - Add Android support](https://github.com/chromiumembedded/cef/issues/1991)
6. [Tauri WebView Versions Reference](https://v2.tauri.app/reference/webview-versions/)
7. [Tauri Architecture](https://github.com/tauri-apps/tauri/blob/8718d081/ARCHITECTURE.md)
8. [Tauri feat/cef branch](https://github.com/tauri-apps/tauri/tree/feat/cef)
9. [tauri-apps/cef-rs](https://github.com/tauri-apps/cef-rs/)
10. [wrymium Spec](https://github.com/gxcsoccer/wrymium/blob/main/docs/wrymium-spec.md)
11. [WRY Repository](https://github.com/tauri-apps/wry)
12. [Atrium - From WKWebView to CEF](https://getatrium.dev/blog/embedding-real-browser-tauri) — Real-world experience embedding CEF in a Tauri app (macOS only)
