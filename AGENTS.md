# Flux

AI agents: do NOT make any code changes directly. The user will review your suggestions and apply them manually. You may read, explore, and suggest, but never write or edit code files.

Exception: **Markdown files** (`.md`) are editable by the agent — AGENTS.md, CONTEXT.md, docs/adr/*.md, .scratch/**/*. These are docs, not code.

When suggesting code changes, explain everything new you're adding in detail — the user is a beginner learning to program. Include what each piece does, why it's needed, and how it fits together.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Agent behavior rules

- **Fresh Read Rule:** Read `AGENTS.md` fresh every session. Never assume the previous agent kept it accurate. If something looks wrong, say so.
- **Verify before claiming:** Check the actual codebase, not the `.bak` or old docs. Speculative claims waste time — trace execution before proposing fixes.
- **Diffs, not full files:** When suggesting code changes, give targeted diffs or edited snippets, not entire file rewrites.
- **Understand first:** Propose changes only after understanding the root cause. Guessing is unacceptable.

## Stack & Dev Commands

```
Stack: Tauri v2 + React 19 + Vite 7 + Bun/TS plugins + Tailwind CSS v4
Host:  ~316-line Rust lib.rs with Tokio async
IPC:   subprocess stdin/stdout JSON-RPC (bare JSON, no jsonrpc field)
UI:    Web Components (React compiled to IIFE via Vite)
```

```bash
bun run dev              # tauri dev (builds plugins first via beforeDevCommand)
bun run build            # build:plugins + tauri build
bun run build:plugins    # build frontend WCs only
bun run dev:watch        # build:plugins --watch + tauri dev in parallel
bun run tauri            # raw tauri CLI

# Standalone plugin testing
echo '{"id":1,"method":"feed","params":{}}' | bun plugins/youtube/plugins/yt-feed/main.ts
echo '{"id":1,"method":"status","params":{}}' | bun plugins/youtube/plugins/yt-auth/main.ts
echo '{"id":1,"method":"list","params":{}}' | bun plugins/peertube/main.ts
```

`dev` requires env vars set in `package.json`: `WAYLAND_DISPLAY= GDK_BACKEND=x11`

## Tauri Commands (3 total, in `src-tauri/src/lib.rs`)

| Command | Signature | Purpose |
|---------|-----------|---------|
| `plugin_request` | `(method: "name.action", params: Value)` | Route RPC to plugin subprocess |
| `resolve_hook` | `(hook: "feed.video")` | Find which plugin provides a hook |
| `call_hook` | `(hook, method?, params?)` | Resolve hook + call it in one step |

All return `Result<Value, String>` — **rejects with plain strings**, not Error objects. In frontend code, use `??` not `||`:
```typescript
const msg = result.reason?.message ?? result.reason ?? "Unknown error"
```

15s `tokio::time::timeout` per request in the Rust host.

## Plugin Protocol

### Wire Format

Request: `{"id": <number>, "method": "<action>", "params": {}}` — newline-delimited JSON
Response: `{"id": <same>, "result": <any>}` or `{"id": <same>, "error": "<message>"}`

No `jsonrpc` field. Host prepends plugin name for routing (splits `"name.action"` on first `.`).

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique plugin ID for RPC routing |
| `run` | ❌ | Spawn command, e.g. `"bun ./main.ts"` — `./` resolved relative to plugin dir |
| `methods` | ❌ | Array of method names, e.g. `["feed","login"]` |
| `hooks` | ❌ | Hook strings for capability resolution, e.g. `["feed.video","yt-auth"]` |
| `ui` | ❌ | WC tag for main UI — loaded AND mounted by App.tsx |
| `components` | ❌ | WC tags to build but NOT auto-mount, e.g. `["movi-player"]` |
| `slots` | ❌ | Named placeholders this plugin fills, e.g. `["video.player"]` |
| `feeds` | ❌ | Feed contributions: `[{method?, card?}]` |

Plugin types:
- **Backend-only:** `run` present, no `ui`/`feeds`
- **Frontend-only (ui):** `ui` present, no `run` — loaded + mounted by App.tsx
- **Frontend-only (component):** `components` present, no `run` — built + loaded but NOT auto-mounted; created by slot consumers
- **Fullstack:** `run` + `ui`/`feeds`

### Current Manifests (12 active; 7 spawned processes)

| Plugin | Type | Run | Notes |
|--------|------|-----|-------|
| core-manifest | Backend | `bun ./main.ts` | Recursive scan `plugins/**/plugin.json` |
| core-static | Backend | `bun ./main.ts` | Read files from `build/plugins/` |
| core-serve | Backend | `bun ./main.ts` | Vestigial — Vite handles serving |
| feed | Frontend (ui) | — | feed-widget WC (5-state machine) |
| youtube | Metadata | — | Parent container, no run/no ui |
| yt-feed | Backend | `bun ./main.ts` | Innertube home feed, hooks: `["feed.video"]` |
| yt-auth | Backend | `bun ./main.ts` | Cookie auth from browser DBs, hooks: `["yt-auth"]` |
| yt-search | Backend | `bun ./main.ts` | Innertube search (no frontend UI) |
| peertube | Fullstack | `bun ./main.ts` | PeerTube API feed + card WC |
| player-modal | Frontend (ui) | — | Modal overlay (slot-based, resolves player slot) |
| movi-player | Hybrid | `bun ./main.ts` | Video player, hooks: `["video.player"]`, slots: `["video.player"]` |

### Plugin `run` Field Resolution (`resolve_run` in `lib.rs:85`)
- Format: `"bun ./main.ts"` — first word = command, rest = args
- `./` or `../` args: joined with plugin dir (where `plugin.json` lives)
- Bare commands (bun, python3): passed through
- `current_dir` = plugin dir, env `PLUGIN_BASE_DIR` = project root
- Shared stdin/stdout boilerplate: `#shared/stdin.ts`

## Frontend Architecture

### Global Bridge API (declared in `App.tsx:6-18`)

```typescript
window.__pluginRpc(method, params)   // → invoke("plugin_request", {method, params})
window.resolveHook(hook)             // → invoke("resolve_hook", {hook})
window.callHook(hook, method, params) // → invoke("call_hook", {hook, method, params})
```

These are set before any WC scripts load. WC wrappers generated by the build script use custom element property setters (`_item`, `_manifests`) to receive data from React.

### App.tsx `init()` Flow (lines 33-71)
1. Call `core-manifest.scan` → get all manifests
2. Collect WC tags from `ui`, `components`, `feeds[*].card` (dedup)
3. Load each via `core-static.read` → create `<script>` tag with response text
4. `customElements.whenDefined(tag)` → create element → set `.manifests` → append to `#feed-container`

### Cross-Component Communication (CustomEvent Bridge)
- **Cards** dispatch `CustomEvent("video.player.load")` with `{url, title}` in detail
- **Player** listens for `"video.player.load"` / `"video.player.hide"`, dispatches `"video.modal.show"` / `"video.modal.hide"`
- **Modal** listens for `"video.modal.show"` / `"video.modal.hide"`, close dispatches `"video.player.hide"`
- **feed-widget** listens for `video.modal.show` / `video.modal.hide` to hide/show itself
- Uses `window` as the event target (works across script bundles)

### Feed-Widget State Machine (`feed-widget.tsx`)
5 states: **systemError** → **loading** → **empty** → **partial** (items + yellow error banners) → **loaded**

Data flow:
1. Filter manifests to those with `feeds[]`
2. `Promise.allSettled` with per-source 15s timeout + 20s safety timer
3. Fisher-Yates shuffle items
4. CardRenderer creates card WCs imperatively: `document.createElement(tag)`, `card.item = rawItem`
5. Error banners search ALL manifests for plugin with `"login"` in methods

### Cookie Auth Flow
- **yt-auth** discovers browser cookies → writes `.youtube-cookie` file
- **yt-feed** reads `.youtube-cookie` at request time (lazy reload per request)
- Cookie file at `plugins/youtube/.youtube-cookie`
- 8s per-request timeout on `tube.getHomeFeed()` (JS-side `Promise.race`)
- Startup validation has empty `catch {}` (no destructive deletion on validation failure)

## Build Pipeline

### `bun run build:plugins` — `scripts/build-plugins.ts`
1. Recursive scan for `plugin.json` → collect tags from `ui`, `components[]`, `feeds[*].card` (dedup)
2. Per unique tag: find source in plugin dir (tsx > jsx > vue > svelte)
2. Per unique tag: find source in plugin dir (tsx > jsx > vue > svelte)
3. Auto-detect framework by scanning imports for `"react-dom"` vs `"preact"` vs `"vue"`
4. Generate temp `.vite.config.mjs` + entry.tsx + style.css (with `@import "tailwindcss"`)
5. `bunx vite build --config <config>` → IIFE output to `build/plugins/<tag>.js`
6. Cleanup temp files

### Output (`build/plugins/`)
```
feed-widget.js     # ~160KB (React 19 IIFE)
yt-video-card.js   # ~156KB
peertube-card.js   # ~156KB
player-modal.js    # ~155KB
```

### Quirks
- `needsRebuild`: checks mtime — delete `build/plugins/` for clean rebuild
- Cross-directory source: if source not in declaring plugin's dir, skip
- Duplicate `feeds` loop (lines 112-116): harmless — `tags.add` dedup
- Temp files (`.vite.config.mjs`, `entry.tsx`, `style.css`) cleaned up after build; may remain if interrupted

## Known Issues (verify before trusting)

1. **Event name mismatch:** `yt-video-card.tsx` dispatches `CustomEvent("player-load")` but `feed-widget.tsx` and `player-modal.tsx` listen for `modal-load` / `modal-close`. Only the card event triggers; the listener pair is unused.
2. **player-modal is a stub:** The newly added `plugins/player-modal/` has no backend, no iframe, no video — just a close button and title overlay.
3. **LSP errors on `__pluginRpc`:** Not declared on `Window` type. Work at runtime (Tauri bridge sets them before WC scripts run). Cosmetic.

## Platform / Config Quirks

- **Window:** `decorations: false, transparent: true` — no chrome. All UI from Web Components.
- **No StrictMode:** Removed from `main.tsx` because React double-mount caused duplicate WC elements + redundant RPC calls.
- **Tailwind v4:** Uses `@tailwindcss/vite` plugin and `@import "tailwindcss"` syntax (not v3 config file approach).
- **Filesystem:** `/mnt/5TB/` is NTFS — Cargo builds are slow. Workaround: `CARGO_TARGET_DIR=/tmp/flux-target`.
- **Memory:** 15GB RAM, ~11GB swap — constrained. Rust compilation is memory-intensive.
- **`core-serve`:** Spawned but vestigial. Vite dev server handles serving in Tauri mode.
- **`plugins-disabled/`:** Contains old `video-player/` and `mpv-player/` plugins — moved out, not active.
- **`session-ses_*.md`:** Historical session files at repo root for reference. Not authoritative.
