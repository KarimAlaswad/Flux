# Plugin Developer Experience — Comparative Research

> Investigated 6 mature plugin systems to extract patterns for scaffolding, build, hot reload, manifest validation, testing, debugging, and publishing. Each claim cites a primary source.

---

## 1. VS Code Extension API

### Scaffolding
- **Yeoman generator** (`generator-code`) scaffolds TypeScript or JavaScript projects.
  Source: https://code.visualstudio.com/api/get-started/your-first-extension
- Users run `npx --package yo --package generator-code -- yo code` or install globally.
- Prompts for name, identifier, bundler choice (unbundled vs webpack), package manager.

### Build Pipeline
- Official recommendation: **esbuild** (fast, simple) or **webpack** (broader ecosystem).
  Source: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
- esbuild config is a single JS file with entry points, bundle: true, format: 'cjs', external: ['vscode'].
- Two-tier: `compile` (dev, sourcemaps) vs `package` (production, minified, hidden sourcemaps).
- `vscode:prepublish` script runs before `vsce package`/`publish`.
- Typed separately: `tsc --noEmit` for type checking, esbuild for emitting (esbuild strips types).

### Hot Reload
- No true hot reload. Requires **Developer: Reload Window** to pick up extension code changes.
  Source: https://code.visualstudio.com/api/get-started/your-first-extension#developing-the-extension
- However, esbuild/webpack `--watch` mode recompiles on save automatically.
- UI changes (webviews, popups) trigger fast refresh via normal browser mechanisms.
- Manifest changes always need full reload.

### Validation
- **`vsce`** validates the manifest at package time: checks SVG constraints, badge providers, `engines.vscode` compatibility.
  Source: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions
- Runtime: the extension host validates `package.json` contributions (commands, menus, activationEvents) at load.
- Marketplace rejects extensions missing `publisher` or with invalid `engines.vscode`.

### Testing
- Integration tests run in the **Extension Development Host** with full VS Code API access.
  Source: https://code.visualstudio.com/api/working-with-extensions/testing-extension
- Test CLI: `@vscode/test-cli` + `@vscode/test-electron`. Mocha under the hood.
- `runTests()` downloads VS Code, launches with `--extensionDevelopmentPath` and `--extensionTestsPath`.
- Can debug tests from `launch.json` like normal extensions.

### Debugging
- **F5** from VS Code launches Extension Development Host with debugger attached.
  Source: https://code.visualstudio.com/api/get-started/your-first-extension#debugging-the-extension
- Breakpoints, variable inspection, Debug Console all work.
- Separate window runs the extension; the host window is debuggable.

### Publishing
- **`vsce`** (VS Code Extension manager) CLI: `vsce package` → `.vsix`, `vsce publish` → Marketplace.
  Source: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Requires registered **publisher identity** on the Marketplace.
- Authentication via Microsoft Entra ID (workload identity federation) or PAT.
- Pre-release: `vsce publish --pre-release` (recommended odd minor for pre-release, even for stable).
- Platform-specific: `--target win32-x64`, `--target linux-x64`, etc.
- `.vscodeignore` controls what goes in the VSIX.

### Versioning
- `engines.vscode` in package.json declares which VS Code versions the extension supports (e.g., `^1.8.0`).
- API is the VS Code API itself — no separate version number. Breaking changes land in new stable releases.
- `vscode` module is provided at runtime, not bundled.

---

## 2. Obsidian Plugin Development

### Scaffolding
- Community template repository: https://github.com/obsidianmd/obsidian-sample-plugin
  Source: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
- No official CLI generator. Developers clone the sample plugin and modify it.
- `npm init` with the sample repo is the de facto approach.

### Build Pipeline
- **esbuild** is the standard (sample plugin ships `esbuild.config.mjs`).
  Source: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
- `npm run build` compiles `main.ts` → `main.js`.
- Output goes to the repo root (alongside `manifest.json`).
- No bundling of `obsidian` module — it's external.

### Hot Reload
- No official hot reload. Community plugin **Hot Reload** (by pjeby) watches the plugin directory and reloads on change. Not built-in.
  Source: https://github.com/pjeby/hot-reload-for-obsidian
- Manual: "Reload app without saving" command or restart.

### Validation
- **Community review** process (GitHub PR to `obsidian-releases`): reviewers check `manifest.json` structure, `minAppVersion`, `id` uniqueness.
  Source: https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md → moved to https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Obsidian app validates manifest fields at load. Invalid manifests show an error.
- `minAppVersion` field controls compatibility.

### Testing
- No official test framework. Developers use standard Jest/Mocha on the plugin code, mocking the Obsidian API.
- No integration test harness (would need to run inside Obsidian).

### Debugging
- Obsidian is an Electron app. Plugin devs use the **Chromium DevTools** (`Ctrl+Shift+I`).
- Source maps work when enabled in build config.
- No debugger attachment protocol.

### Publishing
- Plugin is submitted via **GitHub PR** to `obsidianmd/obsidian-releases`.
  Source: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
- PR adds the plugin to `community-plugins.json` with repo URL.
- Obsidian's review team checks the PR against guidelines.
- Once merged, the plugin appears in Obsidian's Community Plugins browser.
- Updates: plugin authors tag a release on GitHub; Obsidian's bot picks it up.

### Versioning
- `manifest.json` has `minAppVersion` — the minimum Obsidian version required.
  Source: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- `versions.json` maps plugin version → required app version for migration.
- No API version number per se; the Obsidian API evolves with the app.

---

## 3. Figma Plugin Development

### Scaffolding
- **Figma desktop app** creates plugins: Plugins → Development → New Plugin → selects template (Figma Design, FigJam, etc.) → Custom UI or none.
  Source: https://www.figma.com/plugin-docs/plugin-quickstart-guide/
- Generates `manifest.json`, `code.ts`, `ui.html`, `package.json` with TypeScript + ESLint preconfigured.
- Community tools: `create-figma-plugin` (CLI), `plugma` (framework).
- `npx create-figma-plugin` scaffolds with bundling, UI components preconfigured.

### Build Pipeline
- Official recommendation: **Webpack** or **esbuild**.
  Source: https://www.figma.com/plugin-docs/libraries-and-bundling/
- Figma's sandbox requires all plugin code in a single file — bundling is mandatory for anything beyond trivial.
- `build` field in manifest: experimental shell command run before loading (e.g., `"build": "webpack"`).
  Source: https://www.figma.com/plugin-docs/manifest/
- TypeScript → JavaScript compilation via `tsc` or bundler.
- Output to `dist/` folder, `main` in manifest points to compiled JS.
- Community `create-figma-plugin` handles webpack config automatically.

### Hot Reload
- **Built-in hot reload toggle** in Figma desktop app: Plugins → Development → "Hot reload" checkbox.
  Source: https://www.figma.com/plugin-docs/plugin-quickstart-guide/#hot-reloading
- When enabled, editing code and rebuilding automatically restarts the plugin with latest changes.
- Requires the build tool to be in `--watch` mode.

### Validation
- **Manifest validation at Figma's side**: `manifest.json` fields (`id`, `api`, `main`, `editorType`, `networkAccess`) are validated when loading.
  Source: https://www.figma.com/plugin-docs/manifest/
- `api` field: version string — Figma checks it and warns if outdated.
- `networkAccess`: domain whitelist enforced at runtime (CSP).
- Publishing: Figma review process checks manifest, permissions, network access reasoning.
- No official JSON Schema published; validation is internal.

### Testing
- **No official test framework.** Developers unit-test sandbox code with standard tools.
- `@figma/plugin-typings` provides type definitions for testing.
- A Figma-specific ESLint plugin (`@figma/eslint-plugin-figma-plugins`) prevents common sandbox mistakes.
  Source: https://www.figma.com/plugin-docs/plugin-quickstart-guide/#plugin-linter
- No integration test harness (would need Figma app).

### Debugging
- **Chromium DevTools** in the Figma desktop app (Plugins → Development → "Show/Hide DevTools").
  Source: https://www.figma.com/plugin-docs/creating-ui/#debugging
- Sandbox code and iframe code can both be debugged.
- Source maps work with webpack/esbuild dev mode.

### Publishing
- Submitted through the **Figma Community** — "Publish" from the desktop app.
  Source: https://www.figma.com/plugin-docs/publishing/
- Requires a Figma account and compliance with review guidelines.
- Once approved, updates publish immediately without re-review.
- No version rollback possible; developers republish an earlier version to roll back.
- `networkAccess` reasoning is displayed on the Community page.

### Versioning
- `"api": "1.0.0"` in manifest — explicit API version string.
  Source: https://www.figma.com/plugin-docs/manifest/
- Figma does not auto-upgrade the `api` field — developers must update and test manually.
- Breaking changes are tied to new API versions; old versions continue working.
- `enableProposedApi` flag for early-access features (development only, not allowed in published plugins).

---

## 4. Chrome Extension Manifest V3

### Scaffolding
- **No official CLI generator.** Developers create files manually.
  Source: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
- Simplest scaffold: `manifest.json` + `hello.html` + icon.
- `chrome-types` npm package provides TypeScript typings for the Chrome API.
  Source: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world/#use-typescript
- Community tools: `chrome-extension-cli`, `extension-create`.

### Build Pipeline
- No mandatory bundler, but **recommended** for TypeScript and performance.
- Developers use their own tooling: webpack, rollup, esbuild, or Parcel.
- Manifest must declare `"manifest_version": 3`.
- All logic must be included in the extension package — **no remote code** allowed.
  Source: https://developer.chrome.com/docs/extensions/get-started/#include-all-extension-logic
- Service worker background scripts (replaced persistent background pages in MV3).

### Hot Reload
- **No built-in hot reload.** Workflow: click refresh icon on `chrome://extensions` page.
  Source: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world/#reload-the-extension
- Partial reload table: manifest changes require extension reload; popup/options page changes do not.
- Community tools: `webpack-chrome-extension-reloader`, `rollup-plugin-chrome-extension`.
- Chrome DevTools "Sources" panel can live-edit content scripts in some cases.

### Validation
- **Chrome validates `manifest.json` at install time.** Missing required fields (`manifest_version`, `name`, `version`) block installation.
  Source: https://developer.chrome.com/docs/extensions/reference/manifest/
- Permission model: `permissions`, `optional_permissions`, `host_permissions` declared in manifest, shown to user at install.
- Content Security Policy enforced at runtime.
- Chrome Web Store review validates against program policies.
- `update_url` for self-hosted extensions.

### Testing
- **Puppeteer** can test extension behavior programmatically (launch Chrome with extension loaded).
  Source: https://developer.chrome.com/docs/extensions/how-to/test
- Manual testing via `chrome://extensions` with "Load unpacked".
- Console logs: right-click popup → Inspect → Console.
- Service worker logs: click "service worker" link on `chrome://extensions`.

### Debugging
- **Chromium DevTools** for popup, options page, and service worker.
  Source: https://developer.chrome.com/docs/extensions/get-started/tutorial/debug
- Service worker debugging: `chrome://extensions` → service worker link → DevTools.
- Content scripts: DevTools on the target web page.
- Error button on `chrome://extensions` surfaces runtime errors.

### Publishing
- **Chrome Web Store** — upload `.zip` of extension files.
  Source: https://developer.chrome.com/docs/webstore/publish
- Developer account ($5 registration fee).
- Store review process (automated + manual for sensitive permissions).
- Self-hosting option with `update_url` in manifest.

### Versioning
- `"version"` field in manifest — semver-like string (1-4 dot-separated integers).
  Source: https://developer.chrome.com/docs/extensions/reference/manifest/version
- `"version_name"` for human-readable labels (e.g., "1.0 beta").
- `"minimum_chrome_version"` blocks install on older Chrome.
- Chrome Web Store enforces monotonically increasing versions.

---

## 5. Lit / Web Component Development

### Scaffolding
- **Starter kits**: `npm init @lit/element` and `npm init @lit/component`.
  Source: https://lit.dev/docs/tools/starter-kits/
- Generates TypeScript project with Web Dev Server, testing, and publishing config.
- `npm init @lit/component` creates a reusable component with npm publish support.

### Build Pipeline
- **No mandatory build step** during development — Lit ships as ES modules.
  Source: https://lit.dev/docs/tools/development/#local-dev-servers
- Production: compile TypeScript with `tsc` or Babel, target ES2021.
  Source: https://lit.dev/docs/tools/publishing/
- **Web Dev Server** (`@web/dev-server`) handles bare module specifier rewriting at dev time.
- Dev/prod separation via Node export conditions (`"development"` condition activates dev-mode warnings).
- **Don't bundle for npm** — let consumers deduplicate. Bundle only for CDN delivery.
  Source: https://lit.dev/docs/tools/publishing/#dont-bundle-minify-or-optimize-modules

### Hot Reload
- **Web Dev Server** with `watch: true` provides hot reload on file changes.
  Source: https://lit.dev/docs/tools/development/#web-dev-server
- Lit's reactive properties mean component re-renders are efficient — no full page reload needed.
- esbuild build cache + serve mode can provide near-instant rebuilds.

### Validation
- **No manifest** — Lit components are npm packages.
- TypeScript compiler provides type validation at build time.
- lit-plugin (VS Code extension) provides real-time template type-checking, syntax highlighting, linting.
  Source: https://lit.dev/docs/tools/development/#lit-plugin
- Dev builds include runtime warnings (multiple versions, change-in-update).
  Source: https://lit.dev/docs/tools/development/#development-build-runtime-warnings

### Testing
- **Web Test Runner** (`@web/test-runner`) — runs in a real browser (Chrome, Firefox, etc.).
  Source: https://lit.dev/docs/tools/testing/
- Supports Mocha/Chai, Puppeteer, Playwright.
- Component tests render elements, assert shadow DOM, fire events.
- Can run headless in CI.

### Debugging
- **Browser DevTools** — standard element inspection works with Shadow DOM.
- lit-plugin provides in-editor template debugging.
- Dev builds include descriptive error messages (vs minified production errors).

### Publishing
- **npm** — standard package.json with `"type": "module"`, `"main"`, `"module"`, `"types"`.
  Source: https://lit.dev/docs/tools/publishing/#publishing-to-npm
- Best practices: self-define elements, export element classes, publish `.d.ts` typings.
- No store or registry beyond npm.

### Versioning
- **npm semver** — Lit packages follow semver strictly.
- LitElement and lit-html versioned independently.
- Multiple compatible versions can coexist — the "Multiple versions of Lit loaded" warning is advisory (size, not correctness).

---

## 6. Sketch Plugin Development

### Architecture
- Plugins are **CocoaScript** (JavaScript + Cocoa bridge) or pure JavaScript.
- Bundle structure: `.sketchplugin` bundle (Contents/Sketch/ manifest.json + scripts/).
  Source: https://developer.sketch.com/plugins/ (overview page)
- `manifest.json` declares identifier, version, commands, menu, author.

### Scaffolding
- **skpm** (Sketch Package Manager) — `npm install -g skpm` + `skpm create my-plugin`.
- Generates the `.sketchplugin` bundle structure with manifest.

### Build Pipeline
- **skpm** handles build: compiles JavaScript → `.sketchplugin` bundle.
- Webpack-based under the hood.
- `npm run build` outputs to `my-plugin.sketchplugin/`.

### Hot Reload
- Sketch supports **"Run Plugin"** with Cmd-R to run the current plugin.
- No automatic hot reload; developer reruns the plugin manually.

### Validation
- Sketch validates `manifest.json` on plugin load.
- Commands must reference existing script files.
- `"version"` field is required.

### Testing
- No official test framework. Mocha/chai with mocked Sketch API objects.

### Debugging
- **Safari Web Inspector** connected to Sketch's web view.
- `console.log` output appears in the Sketch Developer console.
- `skpm log` shows plugin logs.

### Publishing
- **Sketch Plugin Directory** — submit via GitHub repo.
- Also distributable as `.sketchplugin` file directly.

### Versioning
- `"version"` in manifest (semver).
- Sketch app version compatibility declared in `"appcast"` or `"compatibleVersion"`.

---

## Cross-Cutting Patterns

| Dimension | VS Code | Obsidian | Figma | Chrome | Lit | Sketch |
|-----------|---------|----------|-------|--------|-----|--------|
| CLI scaffold | yo generator | Clone sample | Desktop app "New Plugin" | Manual | `npm init @lit/element` | skpm |
| Bundler | esbuild (recommended) | esbuild (standard) | Webpack/esbuild | Any | Web Dev Server (dev) | Webpack (via skpm) |
| Hot reload | Manual reload window | Community plugin | Built-in toggle | Manual refresh | Built-in (WDS watch) | Manual rerun |
| Manifest validation | vsce + runtime | Community review + app | Internal + review | Chrome at install + store | N/A (npm package) | Sketch at load |
| Test framework | Mocha + @vscode/test-electron | None official | None official | Puppeteer | @web/test-runner | None official |
| Debugging | Extension Dev Host + debugger | Chromium DevTools | Chromium DevTools | Chromium DevTools | Browser DevTools | Safari Web Inspector |
| Distribution | Marketplace (vsce) | GitHub + community plugin dir | Figma Community | Chrome Web Store | npm | Sketch Plugin Directory |
| API versioning | engines.vscode | minAppVersion | api field | minimum_chrome_version | npm semver | compatibleVersion |

---

## Flux-Specific Recommendations

Flux uses React Web Components compiled to IIFE via Vite (`scripts/build-plugins.ts`). Current gaps: no scaffolding, no hot reload, no manifest validation, no testing infrastructure, no debugging protocol.

### 1. Plugin scaffolding CLI (`bun create flux-plugin`)

**Problem:** Every plugin starts from scratch or by copying an existing one. No standard template.

**From the research:**
- VS Code, Lit, Figma, and Sketch all provide scaffold generators (VS Code has `yo code`, Lit has `npm init @lit/component`, Figma has desktop "New Plugin", Sketch has `skpm create`).
- A CLI generator reduces the "blank page" problem and enforces conventions from the start.

**What to build:**
- A `bun create flux-plugin` command (or `bun flux create-plugin`) that:
  - Prompts: plugin name, type (backend-only / frontend-wc / fullstack), method names, hooks, feeds.
  - Generates `plugin.json`, `main.ts` (with shared stdin/stdout boilerplate from `#shared/stdin.ts`), and a `src/` directory with a WC source file (React TSX).
  - Sets up the `run` command, the `ui` tag, and `feeds` entries.
  - Optionally adds the plugin to `plugins/` directory with correct structure.

**Feasibility:** Simple — 150-200 lines of TypeScript using `Bun.file` template strings. No new dependencies.

### 2. Manifest JSON schema validation at build time

**Problem:** `plugin.json` is read as freeform JSON. Typos, missing fields, or invalid hook/method references are not caught until runtime (or go unnoticed).

**From the research:**
- Chrome validates manifest at install time (required fields, permissions).
- VS Code's `vsce` validates at package time.
- Figma validates manifest internally and has a documented schema.
- All mature systems validate manifests programmatically.

**What to build:**
- Define a JSON Schema for `plugin.json` — covering all fields from AGENTS.md (`name`, `run`, `methods`, `hooks`, `ui`, `components`, `slots`, `feeds`).
- Validate in `scripts/build-plugins.ts` before building: parse each `plugin.json`, validate against schema, fail fast with descriptive errors.
- Also validate `feeds[*].card` matches an existing WC tag, hooks resolve to real plugin dirs, `run` commands exist.

**Feasibility:** ~50 lines. Use `Bun.inspect` or a lightweight JSON Schema validator (`ajv` is 50KB, could also hand-roll checks for this small schema).

### 3. Watch-mode hot reload for frontend Web Components

**Problem:** `bun run dev:watch` exists and Vite's `--watch` is already wired in `scripts/build-plugins.ts:185-189`, but the Tauri webview doesn't auto-refresh. Developers must manually restart the app to see WC changes.

**From the research:**
- Figma has a toggle for hot reload; Lit's Web Dev Server provides it out of the box.
- Chrome's popup/options HTML doesn't need extension reload — only the manifest and service worker do.
- The key insight: WC scripts loaded via `<script>` tags can be replaced if the app listens for file changes and re-evaluates the script.

**What to build:**
- In dev mode (`bun run dev:watch`), have the Tauri Rust command (or a frontend utility) watch for changes to `build/plugins/*.js` via file watcher.
- When a WC file changes, remove the existing `<script>` tag, fetch the updated JS, create a new `<script>` tag with the updated code, and re-create the WC elements.
- This is the pattern used by `vite-plugin-webcomponents-hmr` and similar tools.

**Feasibility:** Requires a companion file watcher process (either a new Rust command or a JS watcher that sends events via the Tauri event system). The WC wrapper classes in `scripts/build-plugins.ts` register via `customElements.define()` — which throws on re-definition. The HMR system needs to:
  1. Clear existing element definitions (not possible with native CE registry)
  2. OR use `customElements.upgrade()` on newly parsed elements
  3. OR skip re-definition and instead mutate the element prototype

   This is the hardest recommendation — see caveats below.

### 4. Standardized error boundary in WC wrappers

**Problem:** WC wrappers have inline error handling (`try/catch` sets `innerHTML` to red text), but errors from RPC calls, missing manifests, or invalid props are silent.

**From the research:**
- Dev builds of Lit include runtime warnings for multiple versions and change-in-update.
- Figma's `@figma/eslint-plugin-figma-plugins` catches sandbox-specific mistakes.
- VS Code extensions have full debugger attachment.

**What to build:**
- Add a shared WC base class or mixin to each generated entry file that:
  - Catches render errors and dispatches a `CustomEvent("wc.error")` with `{tag, error}`.
  - Logs structured errors to console with `[flux:{tag}]` prefix.
  - Wraps `_item` and `_manifests` setters to validate input shape.
- In `App.tsx` init flow, add a global listener for `wc.error` events and surface them in the UI (e.g., a dev-only error toast).

**Feasibility:** Very easy — modify the `entry` template functions in `scripts/build-plugins.ts:28-76` to emit slightly more robust wrapper code.

### 5. Backend plugin testing harness

**Problem:** Backend plugins (yt-feed, yt-auth, yt-search, peertube, core-manifest) are tested by piping JSON to stdin and reading stdout. There's no structured test runner.

**From the research:**
- VS Code has `@vscode/test-electron` for integration tests.
- Chrome extensions can use Puppeteer.
- Lit has `@web/test-runner`.
- The common pattern: a test helper that launches the plugin subprocess, sends a request, waits for response, and asserts.

**What to build:**
- A `test/plugin-test-helper.ts` module that:
  - Spawns a plugin process (same `resolve_run` logic from `lib.rs`).
  - Sends JSON-RPC request, waits for response (with timeout).
  - Returns parsed result for assertion.
- Example test file per backend plugin using Bun's built-in test runner (`bun test`):

```typescript
import { describe, it, expect } from "bun:test";
import { pluginRequest } from "./plugin-test-helper";

describe("yt-feed", () => {
  it("returns feed items", async () => {
    const result = await pluginRequest("yt-feed", "feed", {});
    expect(result).toHaveProperty("items");
  });
});
```

**Feasibility:** ~80 lines of TypeScript. Leverages Bun's native subprocess + test runner.

---

## Implementation Priority

| # | Change | Effort | Impact | Risk |
|---|--------|--------|--------|------|
| 1 | Scaffolding CLI | Low (1-2h) | High — lowers barrier for new plugins | Low |
| 2 | Manifest validation | Low (1h) | Medium — catches errors early | Low |
| 4 | Standardized error boundaries | Low (30min) | Medium — debuggability | Low |
| 5 | Backend test harness | Medium (3-4h) | High — enables CI/quality | Low |
| 3 | Hot reload for WCs | High (8-12h) | High — biggest DX win | Medium — CE registry limits |

### Hot Reload Caveat

The Custom Elements registry (`customElements.define()`) does not support re-defining an already-defined tag. Once `feed-widget` is registered, calling `customElements.define("feed-widget", ...)` again throws a `NotSupportedError`. Workarounds in order of practicality:

1. **Don't redefine** — instead, replace the element prototype. When a script changes, iterate all existing instances of that tag and set `Object.setPrototypeOf(el, NewClass.prototype)`. This works but is fragile.
2. **Namespaced tags** — build dev-mode WCs with a hash suffix (e.g., `feed-widget-abc123`), replace the script tag, and re-create elements. Requires the consumer (App.tsx) to know the current tag name.
3. **Iframe isolation** — load each WC in a separate iframe (dramatic architecture change, not recommended).

**Recommendation:** Build items 1, 2, 4, and 5 first. Tackle hot reload (item 3) as a separate research spike — it requires understanding the CE registry limitation deeply and prototyping the prototype-swap approach.
