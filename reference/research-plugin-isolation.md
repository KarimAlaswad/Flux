# Plugin Isolation, Sandboxing, and Security Boundaries

Research into how existing plugin systems handle isolation between plugins and the host. Primary sources only.

## 1. VS Code Extension Host

### What a plugin can access

The extension host has **the same permissions as VS Code itself** — any action VS Code can perform, an extension can perform through the extension host. This includes reading/writing files, making network requests, running external processes, and modifying workspace settings.

Source: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security

### How access is restricted

- **Process isolation**: Extensions run in a separate OS process (the "Extension Host") from the renderer (UI). The renderer sandbox (Electron's renderer sandbox) has Node.js disabled entirely — all Node.js operations must delegate to the extension host or shared process via IPC (MessagePorts).
- **No direct UI access**: Extensions cannot modify the UI directly. They contribute through a declarative API (contribution points in `package.json`).
- **Lazy loading**: Extensions declare `activationEvents` so they're only loaded on demand (e.g., when a markdown file is opened). This prevents CPU/memory waste from unused extensions.
- **Workspace Trust**: A feature where the user decides whether to trust the workspace folder. Extensions declare `untrustedWorkspaces` in their manifest (`true`, `false`, or `'limited'`). When the workspace isn't trusted, extensions with `false` or `'limited'` get restricted mode (limited file access, no code execution from workspace).
- **Extension kinds**: Extensions declare `extensionKind` (`workspace` vs `ui`) to control where they run — locally or on a remote machine/Codespace.

Sources:
- https://code.visualstudio.com/api/advanced-topics/extension-host
- https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox
- https://code.visualstudio.com/api/extension-guides/workspace-trust

### Threat model

- **Malicious extensions** from the marketplace — mitigated by malware scanning (multiple AV engines), dynamic detection (clean-room VM), block list (auto-uninstall), and secret scanning at publish time.
- **Buggy extensions** — can OOM or infinite-loop the extension host, but VS Code can detect unexpected termination and restart the extension host gracefully (basic editing still works during restart).
- **Data exfiltration** — extensions have full FS/network access by default. No per-permission model.

### How the host survives a bad plugin

- The extension host is a separate process. If it crashes, VS Code detects the termination, removes extension-driven UI elements (squiggles, status bar items), and can restart the host. Basic editing continues working.
- Lazy activation prevents unused extensions from consuming resources.
- Remote extension host runs on a separate machine (SSH, container, Codespaces) — local machine is isolated entirely.

Sources:
- https://code.visualstudio.com/updates/v1_16 (extension host crash recovery)

### User-facing permissions

- **Workspace Trust**: Modal dialog on first open asking if user trusts the folder and its subfolders. Restricted Mode until granted. Parent folder can be trusted once, applying to all children.
- **Block list**: Malicious extensions removed from marketplace and auto-uninstalled from users.
- No per-API permission prompts at extension level (unlike Chrome/Deno).

---

## 2. Chrome Extension Sandbox (Manifest V3)

### What a plugin can access

Extensions request specific **API permissions** (e.g., `"storage"`, `"tabs"`, `"scripting"`, `"history"`) and **host permissions** (URL match patterns for accessing websites). Without explicit permission, an extension cannot access the filesystem, make cross-origin requests, read browsing history, or inject scripts into pages.

Source: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions

### How access is restricted

- **Declarative permission system**: Every API call is gated on a manifest permission string. Host permissions use URL match patterns (e.g., `"https://*.example.com/*"`).
- **Dual permission categories**: `permissions` and `host_permissions` are separate manifest keys. `optional_permissions` and `optional_host_permissions` can be requested at runtime.
- **Service worker instead of background page**: MV3 replaces persistent background pages with event-driven service workers — they live only as long as needed, reducing persistent attack surface.
- **Content Security Policy**: `extension_pages` CSP restricts script sources to `'self'`, `'wasm-unsafe-eval'`, and localhost (unpacked only). No `'unsafe-eval'` on extension pages. Sandboxed pages get their own CSP.
- **Sandboxed iframes**: Pages listed in manifest `sandbox` key run in a unique origin — no access to `chrome.*` APIs, no direct access to non-sandboxed pages. Communication only via `postMessage()`.
- **OOPIF (Out-of-Process Iframes)**: Cross-origin iframes run in separate processes, keeping web content isolated from privileged extension processes.

Sources:
- https://developer.chrome.com/docs/extensions/reference/manifest/sandbox
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- https://blog.chromium.org/2017/05/improving-extension-security-with-out.html
- https://www.chromium.org/developers/design-documents/oop-iframes/

### Threat model

- **Compromised extension**: If an extension's developer account is hijacked, malicious code could be pushed. Mitigations: 2FA enforcement, permission scope limiting (compromised extension still only has declared permissions).
- **Content script attacks**: Content scripts share a renderer process with web pages, vulnerable to Spectre/side-channel attacks. Mitigation: sensitive operations go through the service worker, not content scripts.
- **Data exfiltration**: Permissions limit what data is accessible. CSP blocks inline script injection. `externally_connectable` restricts inter-extension communication to trusted IDs.

Sources:
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure

### User-facing permissions

- **Install-time warnings**: Users see warning dialogs explaining what the extension can access (e.g., "Read your browsing history", "Manage your downloads"). Extension is disabled if permissions change on update until user accepts.
- **Host permissions**: Declared at install time or optionally at runtime via `chrome.permissions.request()` (user gesture required).
- **activeTab permission**: Grants temporary access to the current tab only when user invokes the extension — no install-time warning.
- **Optional permissions**: Can be requested at runtime with context (extension explains why). User can grant or deny.

Sources:
- https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings

---

## 3. Electron contextIsolation

### What a plugin can access

In Electron, **preload scripts** run in a separate JavaScript context from the renderer (website). With `contextIsolation: true` (default since Electron 12), the preload's `window` object is **different** from the website's `window`. Setting `window.hello = 'wave'` in preload will not make `hello` visible to the website.

Source: https://www.electronjs.org/docs/latest/tutorial/context-isolation

### How access is restricted

- **Separate V8 contexts**: Preload scripts execute in an isolated context — they cannot access the website's DOM or JavaScript objects directly, and vice versa.
- **contextBridge API**: A safe mechanism to expose specific APIs from the preload to the renderer. Only JSON-serializable data and simple functions pass through. Custom prototypes and symbols are stripped.
- **No raw IPC exposure**: Best practice is to expose specific methods wrapping `ipcRenderer.invoke()` calls — not the raw `ipcRenderer.send()` (which would allow the website to send arbitrary IPC messages).
- **Process sandbox**: Electron's renderer sandbox disables Node.js integration entirely. The renderer can only use web APIs. All Node.js operations require IPC to the main process or utility processes.

Source:
- https://www.electronjs.org/docs/latest/tutorial/sandbox

### Threat model

- **Untrusted web content** rendered in the same window should not be able to access Electron APIs, Node.js, or native resources.
- **Preload compromise**: If the website can manipulate the preload's exposed API surface, it must be limited to intentional, filtered operations only.

### User-facing permissions

- No user-facing permission prompts. Security decisions happen at app-build time (what preload exposes) and are not configurable by end users.

---

## 4. Web Components / Shadow DOM

### What a component can access

Shadow DOM provides **DOM and style isolation**. A shadow root's internal DOM is rendered separately from the main document. Styles inside the shadow tree do not leak out, and external styles do not leak in (unless using CSS custom properties or `::part` / `::slotted` pseudo-elements). JavaScript is **not isolated** — same global scope, same `window` object.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_components

### How access is restricted

- **Shadow root boundary**: Encapsulated DOM tree. `mode: 'closed'` prevents external access via `element.shadowRoot`.
- **Event retargeting**: Events that cross shadow boundaries have their `target` retargeted to the shadow host (prevents leaking internal structure).
- **`composed` events**: Events must explicitly set `composed: true` to propagate across shadow boundaries.
- **Scoped custom element registries**: Can create isolated `CustomElementRegistry` instances to prevent name collisions between components.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM
- https://dom.spec.whatwg.org/#interface-shadowroot

### Threat model

- Not designed for security isolation — only **encapsulation**.
- A malicious component running in Shadow DOM has full access to `document`, `window`, fetch, cookies, etc.
- No protection against:
  - JavaScript code injection through a component
  - Access to parent document's cookies/storage
  - Access to parent document's DOM (if `mode: 'open'`)
  - Network requests from the component's script

---

## 5. Build Tool Plugins (Webpack, Rollup, PostCSS)

### What a plugin can access

**Webpack**: Plugins receive the `compiler` and `compilation` objects — full access to the build graph, module sources, asset pipeline, and output files. A plugin can read, modify, or delete any file in the project, inject arbitrary code into bundles, and access network resources.

**Rollup**: Plugins receive a controlled `this` context with a limited API: `this.resolve()`, `this.emitFile()`, `this.getModuleInfo()`, `this.cache`, `this.warn()`, `this.error()`. They operate on a per-file basis through hooks (`resolveId`, `load`, `transform`, `generateBundle`).

Sources:
- https://webpack.js.org/api/plugins/
- https://rollupjs.org/plugin-development/
- https://readoss.com/en/rollup/rollup/rollups-plugin-system-hooks-contexts-and-the-art-of-extensibility

### How access is restricted

- **Hook-based API surface**: Plugins can only interact with the build tool through defined hooks. They cannot call `require()` on internal modules or access private state — those are not part of the API.
- **Controlled context object**: Rollup constructs a context per-plugin that closes over only the plugin's name and the graph. `this.resolve()` calls back through the full plugin pipeline (with `skipSelf` to prevent recursion). No `require()`, no file system access, no network — unless the plugin imports Node modules directly.
- **Phase gating**: Rollup gates file emission — chunks can only be emitted during the build phase (when the module graph is mutable), assets only during generate. Attempting to emit a chunk during generate throws an error.
- **Isolated cache namespace**: Each plugin gets its own cache subspace via `PluginCache`, keyed by plugin name. Anonymous plugins can't use caching.
- **Filter-based hook skipping**: Plugins can declare `include`/`exclude` patterns on hooks (`resolveId`, `load`, `transform`), allowing the driver to skip irrelevant hooks without entering the async function at all.
- **Webpack's Tapable**: Plugins subscribe to named hooks on specific lifecycle objects (`compiler`, `compilation`, `parser`). Hook types enforce execution semantics: `SyncBailHook` for early-exit, `SyncWaterfallHook` for chaining, `AsyncParallelHook` for concurrent work.

### Threat model

- Build tool plugins are **trusted code** — they run in the same Node.js process as the tool. A malicious plugin can exfiltrate source code, inject backdoors into bundles, or access environment variables.
- No sandboxing. The only isolation is the API surface design (plugins can't access internal state that isn't exposed through hooks).
- Webpack's `WeakMap<Compilation, T>` pattern for custom hooks prevents memory leaks across compilations but does not restrict plugin power.

Sources:
- https://webpack.js.org/contribute/plugin-patterns/
- https://rollupjs.org/plugin-development/#conventions

### User-facing permissions

- None. Build tools rely on the user choosing plugins from trusted sources (npm, verified publishers).

---

## 6. Figma Plugin Sandbox

### What a plugin can access

Figma plugins run **on the main thread in a sandbox** that has no DOM/browser API access. The sandbox can access the Figma document (scene graph) through the `figma.*` API. It has access to modern JavaScript standard built-ins (`Array`, `Map`, `Proxy`, `Promise`, `BigInt`, etc.) but NOT `fetch`, `XMLHttpRequest`, `setTimeout`, or any DOM APIs.

Source: https://www.figma.com/plugin-docs/how-plugins-run/

### How access is restricted

- **Sandboxed execution environment**: A minimal JavaScript environment — no browser APIs. Even `console.log` is a custom minimal version.
- **Two-tier architecture**: Two contexts communicate via message passing:
  - **Sandbox (main thread)**: Has access to the Figma scene graph (`figma.*` API). No browser APIs.
  - **Iframe (separate context)**: Has full browser API access. Can render UI, make network requests. No direct access to the scene graph.
- **Plugin UI iframe**: Created via `figma.showUI()`. Runs as an `<iframe>` with full web capabilities but no scene access. Communicates with sandbox via `postMessage()`.
- **Network access limits**: Manifest `networkAccess` field restricts which domains the plugin can fetch from. Violations return a CSP error.
- **Lifecycle enforcement**: `figma.closePlugin()` must be called explicitly. If not, a "Running..." toast persists until the user cancels (which triggers `figma.closePlugin()` from the host).

### Threat model

- **Malicious plugin**: Cannot access the user's file system, browser cookies, or DOM. Network access is limited to declared domains. The sandbox has no `fetch` or `XMLHttpRequest` by default.
- **Data exfiltration**: Limited because the sandbox has no network API. The iframe (which does have network) cannot read the scene graph — it only receives data the sandbox explicitly sends via `postMessage()`.
- **Buggy plugin**: If the sandbox doesn't close properly, host detects and shows a toast. User can cancel from the host UI at any point.

### User-facing permissions

- **Network access limits**: Declared in manifest. Users see no prompts (unlike Chrome extensions) — it's a restriction on the plugin, not a permission prompt.
- The user can cancel a running plugin at any time.

---

## 7. Deno Permissions

### What a plugin (script) can access

**Nothing by default.** Deno is secure-by-default — a program has no access to file system, network, environment variables, or subprocesses unless explicitly granted. The permission system uses opt-in flags (`--allow-read`, `--allow-write`, `--allow-net`, `--allow-env`, `--allow-run`, `--allow-ffi`, etc.).

Source: https://docs.deno.com/runtime/fundamentals/security/

### How access is restricted

- **Granular scoping**: Permissions can be scoped to specific paths, hosts, environment variables, etc. Example: `--allow-read=./data` limits reads to one directory. `--allow-net=example.com` limits network to one host.
- **Deny overrides**: `--deny-*` flags override `--allow-*` — you can grant broad access and carve out sensitive parts: `--allow-read --deny-read=/etc`.
- **Runtime permission prompts**: When stdout is a terminal and a flag is not passed, Deno pauses and asks the user interactively: "Deno requests net access to 'example.com'. Allow? [y/n/A]"
- **Programmatic permission API**: `Deno.permissions.query()`, `.request()`, `.revoke()`. Scripts can drop permissions they no longer need (e.g., revoke `read` after reading a config file at startup).
- **Permission broker**: For centralized policy enforcement — all `--allow-*` flags are ignored, every permission check goes to an external broker process via Unix socket or named pipe. If the broker disconnects or sends malformed data, Deno terminates immediately.
- **Worker permission reduction**: Web Workers can be spawned with reduced permissions (not inheriting the parent's full grant).

### Threat model

- **Untrusted code execution**: Permission sandbox controls I/O. Code within the same thread shares the same privilege level — `eval`, `new Function`, dynamic imports all run at the same privilege. No privilege escalation possible.
- **Subprocess escalation (`--allow-run`)**: Considered equivalent to `--allow-all` because a subprocess runs as a separate program with its own permissions, not inheriting the sandbox. Especially dangerous: `--allow-run=deno` lets a sandboxed script launch a new `deno` with `--allow-all`.
- **FFI escalation (`--allow-ffi`)**: Native libraries run as compiled machine code in the same process and can make arbitrary system calls — effectively `--allow-all`.
- **Write + run combination**: Granting `--allow-write` on a directory containing a binary that's allowed by `--allow-run` lets a script overwrite that binary and then spawn attacker-controlled code.
- **Recommendation for truly untrusted code**: Use OS sandboxing (chroot, cgroups, seccomp), Web Workers with reduced permissions, `--frozen` lockfile + `--cached-only`, or VM/MicroVM isolation.

### User-facing permissions

- **CLI flags**: User explicitly grants on the command line at invocation time.
- **Interactive prompts**: When running without flags and a sensitive API is accessed, Deno prompts interactively (if terminal).
- **Config file**: Permissions can be declared in `deno.json` under a `permissions` key.
- **No install-time** — Deno scripts are run directly, not installed. Permissions are per-invocation.

---

## 8. Synthesis: Isolation Strategies Compared

| Dimension | VS Code | Chrome MV3 | Electron | Shadow DOM | Build Tools | Figma | Deno |
|-----------|---------|------------|----------|------------|-------------|-------|------|
| Process boundary | Separate OS process | Separate renderer process | Separate contexts + processes | Same context | Same process | Sandbox + iframe | Same process with permission gates |
| Filesystem access | Full (via host) | None (unless native messaging) | Full (main process) | Full | Full | None | Opt-in, scoped |
| Network access | Full | Declared hosts only | Full (main process) | Full | Full | Declared hosts only (iframe) | Opt-in, scoped |
| DOM access | None (extension host) | Limited (content scripts) | Full (preload) | Full | None | None | N/A (runtime) |
| Other plugin data | Same process | Isolated storage | N/A | N/A | Shared compiler/compilation | No | No (separate KV namespaces) |
| Permission model | None (trust-based) | Declare at install/runtime | None (app-level) | None | None | Network access limits | Granular flags |
| User prompts | Workspace Trust | Install warnings, runtime requests | None | None | None | None | CLI flags, interactive prompts |
| Crash isolation | Process restart | Per-extension kill | Kill renderer | No | No | User cancel | Process-level |

---

## 9. Minimum Viable Isolation for Flux

Flux currently: backend plugins = full Node.js subprocesses with unrestricted FS/network. Frontend WCs = same WebView context as the app. No permission system.

### Practical middle ground

**1. Permission manifest field (low effort, high impact)**

Add an optional `permissions` field to `plugin.json`:

```json
{
  "permissions": {
    "allow_net": ["https://youtube.com", "https://*.google.com"],
    "allow_read": ["./plugins/youtube/.youtube-cookie"],
    "allow_write": [],
    "allow_run": false
  }
}
```

The host (lib.rs) checks these before forwarding the RPC request to the plugin subprocess. This is a **declarative gate** — the host enforces it, not the plugin. A plugin that tries to fetch `https://evil.com` gets an error from the host, not a network request.

**Why this level**: Deno proves that even simple scope-limited permissions catch most real-world threats (data exfiltration, network abuse). Most Flux plugins only need net access to specific APIs. No plugin today needs `allow_run`.

**2. Frontend WC script injection audit (zero code change)**

Review what each WC bundle actually does at runtime — does `feed-widget.js` need `fetch()`? Does `player-modal.js` need `document.cookie`? Add a build-time CSP header that restricts what WebView scripts can do.

Source: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy

**3. Process-level resource limits (medium effort)**

Each backend plugin subprocess gets:
- 15s timeout per RPC (already exists in `lib.rs`)
- OS-level cgroup/ulimit: max memory (e.g., 256MB), max file descriptors, max child processes
- If a plugin subprocess OOMs, only that subprocess dies — the host can restart it

This is the pattern VS Code uses: extension host crash = graceful restart of just that process, not the whole app.

**4. What NOT to do**

- Don't implement full Deno-style sandbox (requires a different runtime — overkill for 7 backend plugins)
- Don't implement Chrome-style install-time permissions (no marketplace/install flow for Flux)
- Don't isolate frontend WCs into iframes (Shadow DOM is already used; adding cross-origin iframes would require re-architecting the WC loading pipeline in `App.tsx`)

### Summary for Flux

| Measure | Effort | Impact |
|---------|--------|--------|
| Permission manifest (declarative net/filesystem gates) | ~2 days | High — catches malicious/buggy plugins at the host level |
| Build-time CSP for frontend bundles | ~1 day | Medium — reduces XSS surface in WebView |
| cgroup/ulimit per plugin subprocess | ~1 day | Medium — host survives OOM/infinite loop |
| Plugin crash → restart (not app crash) | Already works (15s timeout) | Already exist |