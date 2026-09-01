# Research: Comparable Plugin / Extension Systems

**Project:** Flux — Tauri v2 + React desktop app with subprocess-based plugin architecture for media feeds
**Date:** 2026-07-26
**Scope:** 10 systems analyzed for plugin loading, isolation, IPC, lifecycle, and lessons applicable to Flux

---

## Table of Contents

1. [GNOME Shell Extensions](#1-gnome-shell-extensions)
2. [VS Code Extensions](#2-vs-code-extensions)
3. [Obsidian Plugins](#3-obsidian-plugins)
4. [JupyterLab Extensions](#4-jupyterlab-extensions)
5. [KeePassXC Browser Integration](#5-keepassxc-browser-integration)
6. [Helix Editor Plugin System](#6-helix-editor-plugin-system)
7. [LazyVim / Neovim Plugin Ecosystem](#7-lazyvim--neovim-plugin-ecosystem)
8. [mpv Scripts](#8-mpv-scripts)
9. [Home Assistant Add-ons](#9-home-assistant-add-ons)
10. [Flutter / Tauri / Desktop Framework Comparison](#10-flutter--tauri--desktop-framework-comparison)

---

## 1. GNOME Shell Extensions

### Loading Mechanism

Extensions are JavaScript (GJS) modules loaded directly into the GNOME Shell process. They reside in `~/.local/share/gnome-shell/extensions/<uuid>/` or `/usr/share/gnome-shell/extensions/<uuid>/`. Each extension has a `metadata.json` (UUID, name, shell-version, dependencies) and a `extension.js` entry point exporting `init()`, `enable()`, `disable()`.

At startup, GNOME Shell scans these directories, reads metadata, and loads enabled extensions via GJS's `import()` mechanism. The shell itself is written in GJS (Mozilla SpiderMonkey JS engine with GObject-Introspection bindings).

Source: https://gjs.guide/extensions/overview/architecture.html

### How Extensions Extend the Host

Extensions have **unrestricted access** to the entire GNOME Shell internals. They can:
- Import and monkey-patch any Shell module
- Create UI via Clutter/St actors (widgets)
- Access Mutter (the compositor) for window management
- Connect to any GObject signal
- Use any GObject-Introspection library

There is **no formal hook/contribution point system** — extensions directly modify Shell's JS objects at runtime. This is both the system's greatest flexibility and its biggest fragility.

Source: https://gjs.guide/extensions/overview/architecture.html#extensions

### Isolation

**None.** Extensions run in-process with GNOME Shell. A buggy extension can crash the entire desktop. The review guidelines at extensions.gnome.org are the primary quality gate. There is no sandboxing, no subprocess, no capability system.

Source: https://gjs.guide/extensions/review-guidelines/review-guidelines.html

### Lifecycle

- **Install:** Download from extensions.gnome.org, extract to the extensions directory
- **Enable:** Shell calls `enable()` on the extension object
- **Disable:** Shell calls `disable()` — extension must clean up all modifications
- **Update:** User upgrades via extensions.gnome.org; requires shell restart or `r` in Looking Glass
- **Remove:** Delete extension directory

Extensions are loaded at shell startup; dynamic enable/disable triggers a full UI rebuild of affected components.

Source: https://gjs.guide/extensions/overview/anatomy.html

### IPC

Extensions use **in-process function calls** — no IPC. They communicate with the shell via direct GObject signal connections and JavaScript function calls. The shell communicates back via the same mechanism.

### Key Design Strengths
- Extremely powerful — can modify anything
- Simple to write (just JavaScript)
- GJS provides full GNOME platform access
- Centralized distribution (extensions.gnome.org) with review

### Key Design Weaknesses
- No isolation: one crash = whole desktop
- No version pinning: shell updates regularly break extensions
- No capability model: extensions can do anything
- In-process = memory shared with shell
- No structured contribution points means every extension is fragile

### Lessons for Flux
- **Do NOT run plugins in-process** — Flux's subprocess model is already better than GNOME Shell's approach
- Provide **structured contribution points** (hooks, events, feeds) rather than letting plugins modify core internals
- **Isolation is non-negotiable** for a stable desktop app
- A manifest format with explicit capability declarations (like Flux's `plugins[]` + `hooks[]`) is the right direction

---

## 2. VS Code Extensions

### Loading Mechanism

Extensions are installed in `~/.vscode/extensions/` as directories containing `package.json` (manifest) plus code. The manifest declares `activationEvents` (lazy activation triggers), `contributes` (static contribution points), and `main` (entry point). VS Code scans all installed extensions at startup, reads manifests, but does NOT load extension code — it registers the contribution points and awaits activation events.

Source: https://code.visualstudio.com/api/get-started/extension-anatomy

### How Extensions Extend the Host

Two mechanisms work together:
1. **Contribution Points** (static, declared in `package.json`): commands, menus, views, keybindings, languages, themes, snippets, etc. These are registered at startup without loading the extension.
2. **VS Code API** (dynamic, at runtime): The `vscode` namespace provides ~30 service categories — `window`, `workspace`, `commands`, `languages`, etc. Extensions call these APIs after activation.

Activation is **lazy**: an extension loads only when its declared `activationEvents` fire (e.g., `onLanguage:python`, `onCommand:myExtension.doStuff`, `onStartupFinished`). Since VS Code 1.74.0, commands/views/custom-editors contributed by an extension auto-register their activation trigger.

Source: https://code.visualstudio.com/api/references/activation-events
Source: https://code.visualstudio.com/api/references/contribution-points

### Isolation

Extensions run in a **separate Node.js process** called the Extension Host (`ExtensionHostKind.LocalProcess`). Three flavors exist:
- **LocalProcess:** Full Node.js child process (desktop default)
- **LocalWebWorker:** Web Worker with browser APIs only (vscode.dev)
- **Remote:** Node.js process on SSH/container/WSL

The Extension Host communicates with the renderer (Workbench) via a **typed RPC protocol** over `MessagePort`. Each side has paired proxy interfaces (`MainThread*` and `ExtHost*`) auto-generated by `createProxyIdentifier<T>()`. ~60 service pairs handle everything from commands to documents to decorations.

Crash isolation: if the Extension Host crashes or hangs (>3s watchdog), VS Code shows a banner and offers "Restart Extension Host" without losing editor state.

Source: https://readoss.com/en/microsoft/vscode/extension-host-vscode-isolates-communicates-extensions
Source: https://roopik.com/blog/vscode-internals-extension-host

### Lifecycle

- **Install:** VS Code downloads .vsix, extracts to extensions dir
- **Activate:** Extension's `activate()` function called once when activation event fires
- **Deactivate:** `deactivate()` called on shutdown (optional)
- **Update:** VS Code downloads newer version, restarts Extension Host
- **Remove:** Delete from extensions dir

Extensions can be enabled/disabled per workspace. The Extension Host can be restarted independently of the editor.

### IPC

**Typed RPC protocol** over `MessagePort` (or Electron IPC, WebSocket for remote). Every API call from an extension crosses the process boundary. The protocol:
- Uses `createProxyIdentifier<T>()` for typed markers
- Auto-generates proxy objects on both sides
- Serializes everything to JSON (with `VSBuffer` for binary)
- Converts between public types (`vscode.Position`) and internal types (`Position`) at the boundary
- Supports cancellation propagation via `CancellationToken`

Source: https://deepwiki.com/microsoft/vscode/3.2-extension-host-and-rpc-architecture

### Key Design Strengths
- **Full process isolation** — extensions cannot crash the editor
- **Lazy activation** — startup isn't penalized by 50K extensions
- **Rich contribution point model** — static declarations + dynamic API
- **Disposable Extension Host** — crash recovery without data loss
- **Three host flavors** — same API, different isolation levels
- **Strictly typed RPC protocol** — ensures correctness across process boundary
- **Responsiveness watchdog** — detects hangs

### Key Design Weaknesses
- RPC serialization overhead for every API call
- Complex protocol with ~60 service pairs to maintain
- Extension Host is single process — one misbehaving extension can affect others in the same host
- Memory grows as more extensions activate
- Remote development adds latency

### Lessons for Flux
- **Process isolation with structured IPC** is the gold standard — Flux's subprocess model matches this pattern
- **Lazy activation** is critical when plugin count grows: only load what's needed
- **Contribution points** (static declarations) + **runtime API** = clean pattern. Flux's `manifest.json` with `hooks[]`, `methods[]`, `feeds[]` already follows this
- **Timeout/watchdog** on plugin responsiveness should be built in (Flux already has 15s in Rust + 8s per feed request)
- **Typed IPC** reduces bugs — Flux uses JSON-RPC without `jsonrpc` field; consider adding type definitions
- **Crash resilience** through restartable plugin processes

---

## 3. Obsidian Plugins

### Loading Mechanism

Plugins are TypeScript/JavaScript bundles placed in `<vault>/.obsidian/plugins/<plugin-id>/`. Each has a `manifest.json` (id, name, version, minAppVersion, author) and a `main.js` (bundled by esbuild). Obsidian loads plugins in the **renderer process** (Electron app with `nodeIntegration: true`), executing `main.js` via `eval()` or `<script>` injection.

The `obsidian` npm package provides the TypeScript API types. Plugins extend the `Plugin` class from this package.

Source: https://docs.obsidian.md/Plugins/Getting%2Bstarted/Anatomy%2Bof%2Ba%2Bplugin
Source: https://ggprompts.com/architecture/obsidian

### How Plugins Extend the Host

Plugins register capabilities during `onload()`:
- **Commands:** `this.addCommand({id, name, callback})`
- **Views:** `this.registerView(type, leaf => new MyView(leaf))`
- **Settings tabs:** `this.addSettingTab(new MySettingTab(this))`
- **Ribbon icons:** `this.addRibbonIcon(icon, title, callback)`
- **Status bar items:** `this.addStatusBarItem()`
- **Editor extensions:** CodeMirror 6 extensions
- **Event handlers:** `this.registerEvent(app.vault.on('modify', cb))`

Core services accessed via `this.app`: `vault`, `workspace`, `metadataCache`, `fileManager`, `viewRegistry`, `customPlayers`, `keymap`, `commands`, `internalPlugins`.

Source: https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development
Source: https://docs.obsidian.md/Reference/TypeScript%2BAPI/Plugin

### Isolation

**None.** Plugins run in-process in the renderer. They share the same Electron renderer process, the same Node.js event loop, and the same memory space. A crashing plugin can take down the UI. Obsidian mitigates this through:
- Plugin review process (curated community plugins)
- Explicit permissions via manifest (`permissions` array for sensitive operations)
- Call for `nodeIntegration: true` means plugins have full filesystem access

Source: https://ggprompts.com/architecture/obsidian

### Lifecycle

- **Install:** Community plugins downloaded from within Obsidian, extracted to `.obsidian/plugins/`
- **Enable:** `onload()` called; plugin registers commands/views/events
- **Disable:** `onunload()` called; framework auto-cleans registered items
- **Update:** Plugin replaced, Obsidian reloads it
- **Remove:** Directory deleted

The `Component` base class provides recursive lifecycle: `load()` → `onload()` → children `load()`; `unload()` → `onunload()` → children `unload()`. The framework tracks all registered items and auto-detaches them on unload.

Source: https://deepwiki.com/obsidianmd/obsidian-api/3.2-plugin-lifecycle

### IPC

**In-process function calls.** Plugins call `this.app` methods directly. No serialization boundary. Communication with other plugins happens through the `app` object's event system (`app.workspace.on()`, `app.vault.on()`).

### Key Design Strengths
- **Simple API** — `Plugin` class with `onload/onunload` is easy to understand
- **Automatic cleanup** — registered items are tracked and auto-detached
- **Rich API surface** — vault access, workspace management, editor extensions
- **Core plugins are plugins too** — same API as community plugins (dogfooding)
- **Large community** with curated plugin store
- **Component hierarchy** — recursive lifecycle management

### Key Design Weaknesses
- **No isolation** — plugins run in-process with full Node.js access
- **Security by review** — no sandbox, manual review is the only gate
- `eval()` loading is a security concern
- **Shared memory** — one leaky plugin affects all
- **No structured IPC** — no process boundary, no crash isolation
- **Plugin conflicts** — two plugins modifying the same thing can silently break

### Lessons for Flux
- **Auto-cleanup** on unload is essential (Flux's feed-widget error banners do this partially)
- **Component-based lifecycle** (parent/children) is a useful pattern
- **Dogfooding** (core features as plugins) validates API design
- Flux's **subprocess model** already solves the isolation problem Obsidian doesn't
- **Explicit registration** (addCommand, addRibbonIcon) is cleaner than monkey-patching
- The `Plugin` base class pattern from Obsidian maps well to Flux's plugin manifest structure

---

## 4. JupyterLab Extensions

### Loading Mechanism

JupyterLab extensions are **npm packages** with a `plugin.json`-like integration. They install via `pip install` (Python packages that include a JS component) or `jupyter labextension install`. Extensions register **plugins** within the Lumino (formerly PhosphorJS) DI framework. Each plugin is a TypeScript module that implements the `JupyterFrontEndPlugin<T>` interface:

```typescript
const plugin: JupyterFrontEndPlugin<IMyService> = {
  id: 'my-extension:plugin',
  autoStart: true,
  requires: [IServiceA, IServiceB],
  optional: [IServiceC],
  activate: (app, serviceA, serviceB, serviceC) => { ... }
};
```

Two types:
- **Source extensions:** Traditional development workflow, built with the app
- **Prebuilt extensions:** Standalone npm packages loaded at runtime (JupyterLab 4+)

Source: https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html
Source: https://deepwiki.com/jupyterlab/jupyterlab/4.1-extension-architecture

### How Extensions Extend the Host

Extensions contribute via **Lumino Tokens** — typed service identifiers. The pattern is **provider-consumer** (dependency injection):
- **Providers** register a service by associating a token with an implementation
- **Consumers** declare `requires: [TokenA]` and receive the implementation at activation

JupyterLab core provides ~100 tokens for: `ILabShell`, `ICommandPalette`, `IMainMenu`, `IStatusBar`, `ISettingRegistry`, `IDocumentManager`, `INotebookTracker`, `ITabManager`, etc.

Extensions can also contribute:
- Commands (registered in the command registry)
- Widgets (via Lumino's dock panel and widget system)
- Context menus
- Settings schemas
- Keybindings
- MIME renderers

Source: https://jupyterlab.readthedocs.io/en/latest/extension/extension_points.html
Source: https://deepwiki.com/jupyterlab/lumino/4.2-plugin-system

### Isolation

**Limited.** Extensions run in the browser process (same JS context). However, the Lumino DI system provides **logical isolation**: plugins don't import each other directly, they only know about tokens. This prevents tight coupling. The JS code itself shares the same event loop, but the DI layer prevents direct dependency chains.

For server-side extensions (Python), there is a separate process boundary via the Jupyter Server. Frontend extensions communicate with server extensions via REST API or WebSocket.

Source: https://starlog.is/articles/developer-tools/jupyterlab-jupyterlab/

### Lifecycle

- **Install:** `pip install` or `jupyter labextension install`
- **Activation:** `activate()` called when all `requires` dependencies are available and plugin's `id` is not disabled
- **Deactivation:** No formal deactivation; plugins live for the app's lifetime
- **Enable/Disable:** Plugins can be toggled via Advanced Plugin Manager or CLI
- **Lock/Unlock:** Administrators can lock plugins to prevent disabling
- **Update:** `pip install --upgrade` or re-run install

JupyterLab 4+ uses PyPI as the default extension manager.

Source: https://jupyterlab.readthedocs.io/en/stable/user/extensions.html

### IPC

Extensions communicate via **in-process function calls through DI**. The `ILabShell` token, for example, provides methods that any plugin consuming it can call. For frontend↔backend communication:
- Jupyter Server's REST API
- WebSockets (for kernels)
- `requestAPI()` utility for typed HTTP calls

Cross-extension communication happens through event-like signals (Lumino's `Signal` class) and shared service objects.

Source: https://deepwiki.com/jupyterlab/extension-examples/2.1-jupyterfrontendplugin-architecture

### Key Design Strengths
- **Excellent dependency management** via Lumino Tokens — automatic resolution and ordering
- **Provider-consumer pattern** prevents tight coupling
- **Rich token ecosystem** (~100 core tokens) covers most extension points
- **Dual frontend/backend** — extensions can provide both
- **Settings system** is integrated: extensions declare schemas, UI is auto-generated
- **Lazy activation** when tokens are available
- **Per-plugin disable/lock** for administrators

### Key Design Weaknesses
- **No process isolation** — all JS runs in the same browser context
- **No formal deactivation lifecycle** — can't unload a plugin
- **Complex learning curve** — Lumino DI, tokens, widgets
- **Version migration pain** — JupyterLab 3→4 broke many extensions
- **Browser compatibility** — no graceful degradation on older browsers
- **Token API is TypeScript only** — limits language choices

### Lessons for Flux
- **Dependency injection via service tokens** is a strong pattern for decoupling — Flux could adopt this for cross-plugin communication
- **Provider-consumer model** maps well to Flux's hook-based system (hook producers and consumers)
- **Auto-generated settings UI** from schemas is valuable
- **Token-based service discovery** is more structured than Flux's current CustomEvent broadcasting
- **Administrator controls** (lock plugins, blocklist) are useful for enterprise deployment
- Lumino's DI model is worth studying for Flux's internal architecture, even if plugins are subprocess

---

## 5. KeePassXC Browser Integration

### Loading Mechanism

KeePassXC's browser integration uses a **three-component architecture**:
1. **Browser Extension** (WebExtension — JavaScript): The UI in the browser
2. **keepassxc-proxy** (standalone executable): A proxy binary that bridges the browser and KeePassXC
3. **KeePassXC** (C++ Qt application): The password manager itself

The browser extension communicates with `keepassxc-proxy` via the **Native Messaging** protocol (browser API for communicating with native applications). The proxy forwards messages to KeePassXC via **Unix domain sockets** (or named pipes on Windows).

Source: https://github.com/keepassxreboot/keepassxc-browser
Source: https://deepwiki.com/keepassxreboot/keepassxc/3.1-browser-integration

### How Extensions Extend the Host

The browser extension doesn't extend KeePassXC — it uses KeePassXC as a **service**. Communication is request-response over sockets. Actions include:
- `get-logins`: Search for matching entries
- `set-login`: Create or update entries
- `generate-password`: Generate a random password
- `get-database-hash`: Check if database is up-to-date
- `associate`: Establish a shared encryption key
- `test-associate`: Verify association

Each request is a JSON object encrypted with NaCl `crypto_box` (X25519 + XSalsa20-Poly1305).

Source: https://keepassxc.org/docs/

### Isolation

**Strong.** The browser extension runs in the browser's extension sandbox. `keepassxc-proxy` is a separate process. KeePassXC is another process. Communication crosses two process boundaries:
- Browser ↔ Native Messaging API ↔ proxy ← Unix socket → KeePassXC

Each component has minimal privileges. The proxy is lightweight — it only relays encrypted messages. KeePassXC only exposes specific commands.

Source: https://deepwiki.com/keepassxreboot/keepassxc-browser/2-extension-architecture

### Lifecycle

- **Browser Extension:** Standard WebExtension lifecycle (install/update via browser stores)
- **keepassxc-proxy:** Installed alongside KeePassXC, launched on demand by the browser via Native Messaging
- **KeePassXC:** User launches independently; proxy connects to it

KeePassXC's `BrowserService` manages the integration lifecycle — it starts/stops the socket listener when browser integration is enabled/disabled in settings.

Source: https://deepwiki.com/keepassxreboot/keepassxc/3.1-browser-integration

### IPC

**NaCl-encrypted JSON over Unix domain sockets.** The protocol:
1. Handshake: `change-public-keys` to exchange X25519 keys
2. Every message encrypted with `crypto_box`
3. Messages are JSON with encrypted payload
4. Association: browser first-time connects, user approves in KeePassXC GUI
5. Subsequent requests use the established key

This is essentially how Flux does it — JSON-RPC over stdin/stdout — but with encryption and a separate proxy process.

Source: https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md

### Key Design Strengths
- **Defense in depth** — three components, two process boundaries, encryption
- **Minimal trust surface** — proxy is a thin relay, no crypto logic in browser
- **Encrypted IPC** with public-key crypto
- **Association flow** — user must approve new clients
- **Per-entry access control** — entries can be restricted to specific browser instances
- **Clean protocol** with well-defined actions

### Key Design Weaknesses
- **Complex deployment** — three components to install and keep in sync
- **Proxy adds latency** — double serialization (browser→proxy→KeePassXC)
- **Flatpak issues** — Native Messaging doesn't work well with sandboxed browsers
- **One protocol version** — browser extension and KeePassXC must match
- **No service discovery** — hardcoded socket path
- **Security depends on correct implementation** — encrypted but still complex

### Lessons for Flux
- **Separate proxy process** is useful for sandboxing — Flux's subprocess model is analogous
- **Encrypted IPC** is important if plugin data includes credentials
- **Association/trust-on-first-use** is a good pattern for plugin pairing
- **Well-defined protocol with versioning** prevents incompatibilities
- Flux's **direct stdin/stdout** is simpler than KeePassXC's two-hop proxy but provides less isolation
- The **proxy pattern** could be useful for Flux if plugins need to run as different OS users or in containers

---

## 6. Helix Editor Plugin System

### Current Status

**Helix does not have a stable plugin system.** It is a design goal, not a shipped feature. As of mid-2026, work-in-progress includes:

1. **PR #8675:** Plugin system using **Steel** (a Scheme dialect) embedded via `rust-embed` — allows extension via a Lisp-like language
2. **External prototype:** WASM-based plugin systems using Wasmer/Wasmitime
3. **Discussion #3806:** Long-running design discussion covering language choice, sandboxing, API surface

The project deliberately prioritized a "batteries-included" core (built-in LSP, Tree-sitter) over extensibility, noting that extension systems reduce core velocity due to API maintenance burden.

Source: https://github.com/helix-editor/helix/discussions/3806
Source: https://github.com/helix-editor/helix/discussions/13945

### Design Direction

The decision (as of early 2026) is to use **Scheme** as the plugin language, embedded in the editor process. Key architectural choices under discussion:
- **Embedded interpreter** (not subprocess) for low latency
- Scheme was chosen for its simplicity (easy to parse, powerful macros, homoiconic)
- WASM was considered but deemed too complex for the initial implementation
- Steel has a built-in LSP server, supporting IDE features for plugin development
- Steel can also load `cdylib` (shared libraries) for native code performance
- The `helix-plugin` API is being kept minimal — enough for keybindings, custom commands, and UI integration

Source: https://github.com/helix-editor/helix/discussions/3806#discussioncomment-5909469

### Isolation

**Planned:** Limited. Steel runs in-process. Discussions mention WASM for sandboxing but it's not the current direction. The core team has argued that editor plugins are inherently trusted (users choose what to install), so sandboxing is less critical.

### IPC

**In-process** — Steel calls Rust functions via FFI (no serialization boundary). This is the opposite of Flux's approach.

### Key Design Strengths (of the planned system)
- **Embedded interpreter** = zero IPC latency
- **Scheme** is small and embeddable
- **Steel LSP** provides IDE support natively
- **Deliberate minimalism** — avoids the complexity burden of a full API

### Key Design Weaknesses (of the planned system)
- **No isolation** — a plugin crash takes down the editor
- **Single-threaded** — long-running plugins block the UI
- **No dynamic loading** — plugins reload requires restart
- **Limited API surface** by design — may not satisfy power users
- **WASM sidelined** — sandboxing opportunity deferred

### Lessons for Flux
- Flux's **subprocess isolation** is more robust than embedded scripting
- However, **latency matters** — for time-critical operations, in-process is faster
- The "batteries-included" philosophy (Helix's core: LSP, Tree-sitter) mirrors Flux's core manifest system
- **Minimal API surface** is a design choice that reduces maintenance burden
- **Language choice matters for community adoption** — Scheme vs Lua vs WASM is a perennial debate
- Flux's **JSON-RPC over stdin/stdout** is simpler and more language-agnostic than embedding a specific scripting runtime

---

## 7. LazyVim / Neovim Plugin Ecosystem

### Loading Mechanism

Neovim plugins are Lua modules placed in `~/.config/nvim/pack/*/opt/` or managed by a plugin manager. **lazy.nvim** (by Folke) is the de-facto standard plugin manager (~21K stars). It manages plugins declared as specs:

```lua
require("lazy").setup({
  { "nvim-telescope/telescope.nvim",
    cmd = "Telescope",           -- lazy-load on command
    keys = { "<leader>ff" },     -- lazy-load on keypress
    dependencies = { "nvim-lua/plenary.nvim" },
  },
})
```

lazy.nvim uses:
- **Partial Git clones** (not shallow clones) for faster installs
- **Bytecode compilation** of Lua modules for faster startup
- **Automatic lazy-loading** — Lua modules are intercepted; when a plugin's module is `require()`d, it triggers loading
- **Lazy-load triggers:** events, commands, file types, key mappings
- **Lockfile** (`lazy-lock.json`) for reproducible installs
- **Async execution** for install/update operations

Source: https://github.com/folke/lazy.nvim
Source: https://lazy.folke.io/spec/lazy_loading

### How Plugins Extend Neovim

Neovim's plugin API is extensive:
- **API functions** (`vim.api.nvim_*`): buffer manipulation, window management, etc.
- **Autocommands:** Event-based hooks (`BufEnter`, `InsertLeave`, etc.)
- **User commands:** `vim.api.nvim_create_user_command()`
- **Keymaps:** `vim.keymap.set()`
- **Highlights, colorschemes**
- **Treesitter queries**
- **LSP client integration** — plugins like `nvim-lspconfig` provide server configurations
- **UI extensions** — floating windows, statusline components, tabline

LazyVim is a **distribution** (pre-configured set of ~100 plugins) built on lazy.nvim. It provides organized plugin specs with merge behavior: when a user adds a plugin spec, it merges with LazyVim's defaults (extending `cmd`, `keys`, `opts`, `dependencies`).

Source: https://www.lazyvim.org/configuration/plugins

### Isolation

**None.** All plugins run in-process in Neovim's Lua runtime (LuaJIT). A misbehaving plugin can block the editor, crash it, or corrupt state. The only isolation is that plugins are loaded into separate Lua module namespaces and Neovim's internal data structures prevent direct access to other plugins' internals (though nothing prevents a plugin from monkey-patching global tables).

### Lifecycle

- **Install:** lazy.nvim clones git repos, sets up runtimepath
- **Load:** lazy.nvim intercepts `require()` calls, loads plugin when first accessed
- **Setup:** Plugin's `config()` function runs (usually calls `setup()`)
- **Unload:** No formal unload — requires restart
- **Update:** lazy.nvim `:Lazy update` pulls latest from git
- **Remove:** lazy.nvim `:Lazy clean` removes unmanaged plugins

Plugins can be loaded on demand, but once loaded they stay resident.

### IPC

**In-process Lua function calls.** Neovim exposes its entire API through `vim.api` which connects to the C core via Lua FFI. Plugins call each other's exposed functions through global namespace convention (e.g., `require('telescope').setup()`).

### Key Design Strengths
- **Extremely powerful** — LuaJIT gives near-C performance
- **Rich lazy-loading system** — events, commands, keys, file types
- **Declarative plugin specs** — easy to configure
- **Lockfile for reproducibility**
- **Massive ecosystem** — 1000+ plugins
- **Bytecode compilation** for startup speed
- **Partial Git clones** for efficient updates

### Key Design Weaknesses
- **No process isolation** — plugins share LuaJIT process
- **No formal dependency resolution** beyond what the manager provides
- **No cleanup/unload** — once loaded, always loaded
- **Version conflicts** — plugins often require specific versions of each other
- **Configuration complexity** — managing 100+ plugins with their options is overwhelming
- **No sandboxing** — plugins have full filesystem access

### Lessons for Flux
- **Lazy loading on events/commands** is a powerful pattern — Flux could adopt this for plugin activation
- **Declarative plugin specs** (what LazyVim/lazy.nvim does) make configuration manageable
- **Lockfile** for pinning plugin versions is important for reproducibility
- **Bytecode/module caching** could apply to Flux's WC build artifacts
- **Partial Git clones** are useful if Flux ever gets a plugin store with git sources
- **Global namespace convention** for plugin APIs is fragile — Flux's explicit IPC is better
- **The merge-semantics pattern** (user config merges with distribution defaults) is a good UX pattern

---

## 8. mpv Scripts

### Loading Mechanism

mpv supports **four scripting backends** identified by file extension:
- **`.lua`:** Lua (LuaJIT) — the primary, most feature-complete backend
- **`.js`:** JavaScript (MuJS — ECMAScript 5)
- **`.so`/`.dll`:** C plugins (native code, `dlopen`ed)
- **`.run`:** External process execution

Scripts are loaded from:
1. `--script=path` CLI option
2. `scripts/` subdirectory of mpv's config directory
3. Scripts auto-discovered in the config directory at startup

Each backend provides a `load()` function. After loading, the script enters an event loop (`mp_event_loop` for Lua). The core calls the backend's `load()` which initializes the runtime environment, then the script runs its event loop.

For Lua, the default `mp_event_loop` (defined in `player/lua/defaults.lua`) waits for events and dispatches them to registered handlers.

Source: https://github.com/mpv-player/mpv/blob/master/DOCS/man/lua.rst
Source: https://deepwiki.com/mpv-player/mpv/6-scripting-and-extensions

### How Scripts Extend mpv

mpv scripts register callbacks via the `mp` module:
- **Events:** `mp.register_event("file-loaded", handler)` — receive notifications
- **Hooks:** `mp.add_hook(type, priority, fn)` — intercept playback operations (e.g., `on_pre_load`, `on_load`, `on_unload`). Hooks are synchronous: mpv waits for the hook callback before continuing.
- **Key bindings:** `mp.add_key_binding(key, name, fn)` — register input handlers
- **Properties:** `mp.get_property(name)`, `mp.set_property(name, value)`, `mp.observe_property(name, fn)` — read/write player state
- **Commands:** `mp.command(string)`, `mp.commandv(...)`, `mp.command_native(table)` — execute any mpv command
- **Timers:** `mp.add_timeout(seconds, fn)` — schedule callbacks
- **OSC/UI:** Built-in OSD, console, select dialog
- **Timers:** `mp.add_timeout(seconds, fn)` for deferred execution
- **Custom event loops:** Scripts can override `mp_event_loop` for full control

Source: https://deepwiki.com/mpv-player/mpv/6-scripting-and-extensions

### Isolation

**Limited.** Lua/JS scripts run in-process via embedded interpreters. Each script gets its own Lua state (or JS context), providing **interpreter-level isolation** — one script cannot directly modify another script's globals. However, they share the mpv core process and can interfere through:
- Setting the same property to conflicting values
- Registering hooks with conflicting priorities
- Blocking the event loop (mpv waits for hook callbacks)
- Adding conflicting key bindings

C plugins (`.so`/`.dll`) run in-process with `dlopen`, sharing the full address space.

`.run` scripts (external processes) provide full OS-level isolation via subprocess, but have limited API surface (only stdin/stdout IPC).

### Lifecycle

- **Load:** Script loaded and `mp_event_loop` entered. Player waits for script to enter event loop before continuing startup.
- **Runtime:** Script runs its event loop, dispatching events/hooks/timers
- **Shutdown:** `MPV_EVENT_SHUTDOWN` is sent; event loop returns, script terminates
- **Reload:** Requires mpv restart (no dynamic reloading)

Scripts can be marked as "weak" so they don't prevent core shutdown.

Source: https://deepwiki.com/mpv-player/mpv/6-scripting-and-extensions

### IPC

**In-process FFI calls.** For Lua/JS/C plugins, all API calls are direct function calls into the mpv core via the client API (`libmpv` or embedded API). The `.run` backend communicates via stdin/stdout JSON-RPC.

mpv also has a **JSON IPC** mode for external control (over a socket), used by media players and controller apps. This is separate from the scripting system.

Source: https://deepwiki.com/mpv-player/mpv/6.1-client-api-and-ipc

### Key Design Strengths
- **Simple, well-documented API** — a few core functions for most tasks
- **Four backends** — Lua for most, JS for web developers, C for performance, `.run` for isolation
- **Hooks system** — synchronous interception points for tight integration
- **Interpreter-level isolation** — separate Lua states prevent direct interference
- **Property system** — clean key-value observation pattern (`observe_property`)
- **Minimal API surface** — can do real work with 5-10 core functions

### Key Design Weaknesses
- **No subprocess isolation** — only `.run` provides it, but at limited API cost
- **Lua event loop** blocks on hook callbacks — slow scripts delay playback
- **JavaScript limited to MuJS (ES5)** — no modern JS
- **No dynamic loading** — must restart to change scripts
- **No dependency management** — no package manager, no versioning
- **C plugins share address space** — a crash takes down mpv

### Lessons for Flux
- **Hooks** are the most natural pattern for media-related plugin systems — Flux already uses hooks via `call_hook` / `resolve_hook`
- **Property observation** (`observe_property`) is cleaner than polling — Flux could add property-like subscriptions
- **Separate interpreter states** is a lightweight isolation approach (but less robust than subprocess)
- **Multiple backend support** (Lua, JS, C, external) shows that one size doesn't fit all — Flux's approach of language-agnostic subprocess is more flexible
- **Event loop architecture** (scripts own their event loop) gives plugins control over their flow
- **Hooks with priorities** allow ordered interception — useful for feed processing pipelines

---

## 9. Home Assistant Add-ons

### Loading Mechanism

Home Assistant add-ons are **Docker containers** managed by the **Supervisor** (a Python orchestrator). Each add-on has a `config.yaml` manifest:

```yaml
name: My Add-on
version: 1.0.0
slug: my-addon
arch: [amd64, armv7, aarch64]
ports:
  8080/tcp: null
options: {}
schema: {}
```

The Supervisor:
1. Reads add-on repositories (Git repos containing add-on directories)
2. Installs add-ons by pulling Docker images or building from Dockerfile
3. Manages add-on lifecycle via Docker API
4. Provides a REST API for add-ons to communicate with Home Assistant Core
5. Handles system-level concerns (network, audio, USB passthrough)

Add-ons are **full virtualized services**, not lightweight plugins. Each runs as a separate container with its own filesystem, network stack, and process space.

Source: https://developers.home-assistant.io/docs/supervisor
Source: https://github.com/home-assistant/supervisor

### How Add-ons Extend the Host

Add-ons integrate with Home Assistant through multiple mechanisms:
- **Web UI ingress:** Home Assistant reverse-proxies the add-on's web interface
- **Service API:** Add-ons can register services callable from Home Assistant automations
- **Supervisor API:** Add-ons query `http://supervisor/` for system state and config
- **Configuration:** Add-ons expose settings via `config.yaml` schema, auto-generating UI
- **Integrations:** Python add-ons can register Home Assistant integrations
- **MQTT, WebSocket, REST** for custom communication

The Supervisor provides:
- `SUPERVISOR_TOKEN` (injected env var) for API authentication
- `bashio` helper library for common operations
- `s6-overlay` as the init system inside containers
- Automatic port management, network configuration, device passthrough

Source: https://developers.home-assistant.io/docs/apps/testing

### Isolation

**Maximum.** Each add-on runs in its own Docker container with:
- Separate filesystem (only `/data/` persists across restarts)
- Own network stack (can be bridged or host)
- Resource limits (CPU, memory)
- Permission model: `privileged` flag, `devices` list, `cap_add` for fine-grained OS access
- No access to Home Assistant Core's process or data (unless explicitly shared via `homeassistant` permission)
- No direct filesystem access to other add-ons

This is the most aggressive isolation model in this comparison.

Source: https://developers.home-assistant.io/docs/supervisor

### Lifecycle

- **Install:** Pull Docker image or build from Dockerfile in add-on directory
- **Start:** Docker container created and started via Supervisor
- **Stop:** Container stopped (SIGTERM, then SIGKILL after grace period)
- **Update:** Old container removed, new image pulled, new container started
- **Uninstall:** Container and images removed, `/data/` optionally preserved
- **Restart:** Container stopped and started again

The `s6-overlay` init system inside each container handles:
- Service supervision (auto-restart on crash)
- Signal handling (SIGTERM → graceful shutdown)
- Log aggregation (stdout/stderr)

### IPC

Add-ons communicate with Home Assistant Core via **REST API and WebSocket** over the internal Docker network. The Supervisor API is available at `http://supervisor/` with `SUPERVISOR_TOKEN` auth.

Common communication patterns:
- `GET http://supervisor/info` — system information
- `POST http://supervisor/addons/self/restart` — self-restart
- Home Assistant WebSocket API for real-time events
- Service calls via Home Assistant REST API
- MQTT for IoT device communication

Source: https://developers.home-assistant.io/docs/supervisor

### Key Design Strengths
- **Complete isolation** — containers are the strongest sandbox available
- **Declarative config** — `config.yaml` defines everything: ports, devices, permissions
- **Automatic rollback** — if an add-on update fails, Supervisor restores the previous version
- **Unified management** — all add-ons managed through a single Supervisor dashboard
- **Resource limits** — CPU/memory constraints per add-on
- **Multi-architecture support** — Docker buildx for amd64, armv7, aarch64, armhf, i386
- **Git-based distribution** — add-on repositories are just Git repos

### Key Design Weaknesses
- **Heavyweight** — Docker containers require significant resources (RAM, disk)
- **Complex development** — Dockerfile, s6-overlay, multi-arch builds
- **Startup latency** — containers take seconds to start
- **Not suitable for UI plugins** — containers don't share the app's rendering context
- **Docker dependency** — requires Docker runtime on the host
- **Invasive** — Supervisor is a separate orchestrator, not embedded in the app
- **Limited on container-only installations** — Home Assistant Container users cannot use add-ons

### Lessons for Flux
- **Container-level isolation** is overkill for Flux's plugin model — subprocess is sufficient
- However, the **permission/configuration schema** pattern is excellent: declare what the plugin needs, validate at install time
- **Automatic rollback** on failed updates is a great feature
- **s6-overlay** process supervision pattern is useful for Flux's backend plugins (auto-restart on crash)
- **Ingress pattern** (reverse proxy to plugin's web UI) could apply to Flux if plugins provide web interfaces
- **Environment variable injection** (SUPERVISOR_TOKEN) is simpler than shared secrets in config files
- The **add-on repository** model (Git repositories with plugin manifests) is a viable distribution model

---

## 10. Flutter / Tauri / Desktop Framework Comparison

### Architecture Comparison

| Aspect | Tauri v2 | Flutter Desktop | Electron |
|--------|----------|-----------------|----------|
| **Rendering Engine** | OS Native WebView (WinUI/WKWebView/GTK) | Impeller (Skia-based) | Chromium 124 |
| **Backend Language** | Rust | Dart | JavaScript/TypeScript |
| **Binary Size** | ~3-12 MB | ~20-89 MB | ~150-200 MB |
| **Idle Memory** | ~20-50 MB | ~50-287 MB | ~100-300 MB |
| **Cold Startup** | ~810 ms | ~920 ms | ~1870 ms |
| **Process Model** | Main + WebView(s) (OS managed) | Main + multiple isolates | Main + Renderer + Utility |
| **IPC Style** | Rust commands via invoke() | Dart FFI / Platform Channels | Electron IPC (Node.js) |

Sources:
- https://desktopcore.com/compare/desktop-frameworks
- https://johal.in/benchmark-electron-300-vs-tauri-20-vs-flutter-electron
- https://javascript.plainenglish.io/tauri-vs-electron-the-ultimate-desktop-framework-comparison-0ebebece5438

### Tauri's Plugin System

Tauri v2 has a **formal plugin system** with backend (Rust) and frontend (JS/TS) parts:
- **Rust side:** `tauri::plugin::Plugin` trait with lifecycle hooks: `on_register`, `on_plugin_init`, `on_window_created`, `on_window_close`, `on_drop`
- **Frontend side:** Auto-generated TypeScript bindings for Rust commands
- **Permission system:** Three-layer model:
  1. **Permissions** — define what a command can do (allow/deny + scopes)
  2. **Permission Sets** — bundle permissions for reuse
  3. **Capabilities** — assign permissions to specific windows/webviews
- **IPC primitives:** Commands (request-response), Events (fire-and-forget), Channels (high-frequency streaming)

Plugins are distributed as Rust crates + npm packages. Official plugins cover: filesystem, HTTP, dialog, shell, notification, clipboard, global shortcut, etc.

The permission system is **deny-by-default** — the app must explicitly grant capabilities to each window.

Sources:
- https://v2.tauri.app/develop/plugins/
- https://v2.tauri.app/security/permissions
- https://github.com/tauri-apps/tauri/blob/dev/ARCHITECTURE.md

### Tauri Security Model (v2)

Tauri's security philosophy:
1. **Process sandboxing:** WebView process has restricted system access; all privileged ops go through Rust core
2. **Capability-based access:** Explicit permissions per window, validated at compile time
3. **Content Security Policy:** Strict CSP in `tauri.conf.json`
4. **Type-safe IPC:** All `invoke()` calls are validated serde deserialization on the Rust side
5. **Deny by default:** No permissions are granted without explicit capability declarations

This directly addresses the security model that Flux needs to consider.

Source: https://www.oflight.co.jp/en/columns/tauri-v2-security-model

### Flutter's Plugin Architecture

Flutter uses **Platform Channels** for native communication:
- **MethodChannel:** Binary async messaging (MethodCall → handler)
- **EventChannel:** Stream of events
- **BasicMessageChannel:** String/semi-structured messages

A Flutter plugin consists of:
1. Dart API (the public interface)
2. Platform-specific implementation (Android: Kotlin/Java, iOS: Swift/ObjC, Desktop: C++ via FFI)

Desktop support (Windows, macOS, Linux) uses `dart:ffi` for direct native calls. Flutter desktop apps render via Impeller (Skia), not a WebView — so they have full control over rendering but cannot reuse web components.

Flutter has **no plugin isolation** — all Dart code runs in the same isolate (unless explicitly using `Isolate.spawn` for CPU-bound work).

Source: https://desktopcore.com/compare/desktop-frameworks

### Key Design Strengths (Tauri-specific)
- **Minimal footprint** — 3-12 MB binary, low memory
- **Security-first** — deny-by-default permissions, capability system
- **Native WebView** — benefits from OS security updates
- **Rust safety** — memory safety without GC, no buffer overflows
- **Growing plugin ecosystem** — official + community plugins
- **Multi-platform** — Windows, macOS, Linux, Android, iOS (v2 mobile)
- **Type-safe IPC** — compile-time validation vs runtime errors

### Key Design Weaknesses (Tauri-specific)
- **Smaller ecosystem** than Electron
- **WebView limitations** — not all web APIs available on all platforms
- **Rust learning curve** for backend work
- **Plugin API** still maturing
- **Native WebView differences** between platforms must be managed

### Lessons for Flux

Flux's architecture already leverages Tauri's strengths:

1. **Subprocess plugins + Tauri commands** are a natural fit. Flux uses the Rust core as an RPC router (via `plugin_request` command) which is exactly how Tauri plugins work, but with external processes instead of Rust plugins.

2. **Tauri's permission system** provides a model for Flux's plugin capability declarations. Flux's manifest (`methods`, `hooks`, `feeds`, `slots`) is already a capability declaration — it just needs a runtime enforcement layer.

3. **Three IPC primitives** from Tauri (commands, events, channels) map to Flux's needs:
   - **Commands:** `plugin_request` (request-response)
   - **Events:** CustomEvent bridge (fire-and-forget)
   - **Channels:** Future feature for streaming media data

4. **Deny-by-default** permissions: Flux could add a capability layer that validates plugin actions against declared permissions.

5. **Tauri v2 mobile** means Flux could potentially run plugins on mobile in the future.

---

## Cross-Cutting Analysis

### Isolation Spectrum

| System | Isolation Level | Mechanism |
|--------|----------------|-----------|
| Home Assistant Add-ons | **Maximum** | Docker containers |
| VS Code Extensions | **Strong** | Extension Host (Node.js process/Web Worker) |
| KeePassXC Browser Integration | **Strong** | 3 processes + encrypted IPC |
| **Flux (current)** | **Strong** | OS subprocesses via stdin/stdout |
| mpv `.run` scripts | **Medium** | Subprocess (but limited API) |
| mpv Lua/JS/C plugins | **Weak** | In-process, separate interpreter contexts |
| GNOME Shell Extensions | **None** | In-process, shared globals |
| Obsidian Plugins | **None** | In-process, shared Electron renderer |
| JupyterLab Extensions | **None** | In-process, DI-based logical isolation |
| Neovim Plugins | **None** | In-process LuaJIT |
| mpv C plugins | **None** | In-process, shared address space |
| Helix (planned) | **None** | In-process embedded Scheme |

### IPC Complexity Spectrum

| System | IPC Mechanism | Complexity |
|--------|--------------|------------|
| KeePassXC Browser Integration | NaCl-encrypted JSON over Unix sockets | High |
| VS Code Extensions | Typed RPC over MessagePort | High |
| Flux (current) | JSON-RPC over stdin/stdout | Medium |
| Home Assistant Add-ons | REST over Docker network | Medium |
| Tauri v2 Plugins | `invoke()` / Events / Channels (serde) | Medium |
| mpv `.run` scripts | stdin/stdout JSON IPC | Low |
| GNOME Shell Extensions | In-process function calls | None |
| Obsidian Plugins | In-process function calls | None |
| JupyterLab Extensions | In-process DI + Signal | None |
| Neovim Plugins | In-process FFI | None |
| mpv Lua/JS plugins | In-process FFI | None |

### Lifecycle Sophistication

| System | Lazy Load | Activate | Deactivate | Update | Crash Recovery |
|--------|-----------|----------|------------|--------|----------------|
| VS Code | ✅ (events) | `activate()` | `deactivate()` | Restart host | ✅ Auto-restart |
| Obsidian | ❌ | `onload()` | `onunload()` | Restart | ❌ |
| GNOME Shell | ❌ | `enable()` | `disable()` | Restart | ❌ |
| JupyterLab | ✅ (DI) | `activate()` | ❌ (app lifetime) | Restart | ❌ |
| Home Assistant | ❌ | Start container | Stop container | Pull new | ✅ s6-overlay |
| mpv | ❌ | Event loop start | Event loop end | Restart | ❌ |
| Neovim | ✅ (lazy.nvim) | First `require` | ❌ | Restart | ❌ |
| Flux | ❌ (spawned at need) | Process start | Process kill | Restart subprocess | ✅ Per-call timeout |
| Tauri Plugin | ❌ | Plugin init | on_drop | Rebuild | ✅ Rust safety |

### Contribution Point Models

| System | Model | Flexibility | Structure |
|--------|-------|-------------|-----------|
| **VS Code** | Static + Dynamic | Medium | Very high (declared + API) |
| **JupyterLab** | Token-based DI | Medium | High (typed service contracts) |
| **Flux** | Hooks + Events | High | Medium (CustomEvent + manifest) |
| **GNOME Shell** | Direct modification | Very high | None |
| **Obsidian** | Registration API | Medium | High (`addCommand`, etc.) |
| **Neovim** | API + Autocommands | Very high | Medium |
| **mpv** | Events + Hooks | Low | High (numbered hooks) |
| **Home Assistant** | REST + Container | Low | High (config.yaml schema) |

---

## Summary of Key Recommendations for Flux

| Concern | Lesson from | Recommendation |
|---------|------------|----------------|
| **Isolation** | VS Code, KeePassXC, Home Assistant | Keep subprocess model; add crash detection + auto-restart |
| **Lazy activation** | VS Code, lazy.nvim | Allow plugins to declare activation triggers (feed render, user action, timer) |
| **Contribution points** | VS Code, JupyterLab | Expand manifest with typed contribution declarations beyond hooks |
| **Permissions** | Tauri v2, KeePassXC | Add runtime capability enforcement layer matching manifest declarations |
| **IPC typing** | VS Code RPC | Define typed request/response schemas for each plugin method |
| **Lifecycle hooks** | Obsidian, mpv | Add `on_install`, `on_enable`, `on_disable`, `on_update` to plugin interface |
| **Auto-cleanup** | Obsidian Component | Track all registered resources and auto-detach on plugin unload |
| **Lockfile** | lazy.nvim | Pin plugin versions for reproducible builds |
| **Dependency injection** | JupyterLab Lumino | Token-based service discovery for cross-plugin communication |
| **Crash resilience** | VS Code, Home Assistant | Auto-restart crashed plugins; keep UI alive |
| **Settings schema** | Home Assistant, JupyterLab | Auto-generate settings UI from plugin config schemas |
| **Multiple backends** | mpv, VS Code | Support different plugin languages via subprocess (language-agnostic) |
| **Timeouts** | VS Code watchdog, Flux (existing) | Keep per-request timeouts; add per-plugin responsiveness monitoring |
| **Encrypted IPC** | KeePassXC | Add optional encryption for sensitive plugin data |
