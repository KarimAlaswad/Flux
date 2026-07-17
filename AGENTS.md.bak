# Flux — Complete Project Knowledge Base

## 1. NIRI'S ENGINEERING PHILOSOPHY (APPLIED TO THIS PROJECT)

Extracted from ALL session files. These principles dominate every decision in this project. Architecture, bugs, and file trees are supporting context — this section is the main content.

### 1.1 Modularity Above All (Even Performance)

- "before we implement this, I want your opinion on this approach of modularity over everything especially performance" (ses_0b7d)
- "I don't want to sacrifice modularity, DX, UX for anything" (ses_0b7d)
- Core in "fast compiled langs" in production only AFTER modularity is guaranteed first
- **Applied:** plugins/ dir structure is sacred. Host is thin. Everything is a plugin. Any language works.

### 1.2 Signal Over Noise — Aggressive Pruning

- "redundant stuff don't need to exist" — Niri's exact words
- Every line earns its place. If removing it wouldn't change understanding, REMOVE it.
- Electro-plugins-era info that doesn't apply to Flux? CUT IT. No "for completeness" padding.
- "If you see something elsewhere, fix it" — proactive cleanup, not passive preservation
- AGENTS.md must be read FRESH every session — never trust the previous agent's updates

### 1.3 Root Cause Over Workarounds — Ship Stubs Infuriate

- "I want it gone completely. No leftover cruft." — fix it fully or don't fix it
- "i want it gone completely" — partial fixes are worse than no fixes
- "Your nature is to make things worse with cruft. Stop." — sees stubs/placeholders as actively harmful
- Every bug fix includes: root cause, how to find it next time, the tradeoff

### 1.4 Exhaustive Investigation Before Any Action

- "check everything first faggot" — repeated verbatim across sessions when agent guessed
- "I want you to not change any files, but I want you to never stop until you absolutely understand why it's not finishing loading, no guesses, spin up all the possible sub-agents you want until you find this"
- "check everything" means LITERALLY every file in the chain — trace execution, verify data flow, check console AND build logs
- Propose fixes ONLY after thorough understanding. Guessing = unacceptable.
- MULTI-PASS: first pass = correctness, second pass = signal/noise, third pass = cross-reference
- "if you're going to be tiny and not know, I'm going to replace you" — zero tolerance for not using available context

### 1.5 Architecture-First Thinking

- "i'm a bit confused why would it mount top-level and feed-item mount at the same time, this project half vibe-coded so can you explain this in detail" — wants BIG PICTURE before fix
- Niri asks "why" constantly — "why not add the ui to the yt-card?", "why would i want to render nothing?"
- Every architecture decision must explain: what was chosen, what was rejected, why, tradeoffs

### 1.6 Explicit Over Implicit — No Magic

- "option b doesn't sound efficient, how do we look for the right card instead of looking everywhere" — explicit mapping beats searching everywhere
- Declarative ownership (`components[]`) over implicit cross-directory discovery
- Property setters over events for direct data, events only for cross-bundle communication
- No shared state between processes. Files for persistence, RPC for communication.
- "do we need to split the ui field to multiple fields to solve this?" — Niri caught the single-responsibility antipattern independently

### 1.7 Proactive Warning Culture

- "Here's what will go wrong" BEFORE implementation, not after
- Every design decision includes its failure modes upfront
- Research ahead — "I knew this would happen" is NOT a compliment
- Shout about pitfalls before Niri falls in

### 1.8 Ownership of Understanding — Teach the Debugging Skill

- Niri learns WHY, not just HOW. Every bug fix teaches debugging strategy, not just the patch.
- "i want to understand" — Niri asks for explanations, not just commands
- "what the fuck" — Niri reads the agent's output and questions unexpected things
- The fix is temporary; the debugging skill is permanent
- Niri does HIS OWN investigation (reads package.json on build failure, examines plugin traits, creates test_state.rs himself) — match that energy

### 1.9 No Stale Docs — EVER

- "the [AGENTS.md] file becomes missing or wrong frequently" — Niri's frustration verbatim
- "Youre wrong, but you're sounding confident. Without having checked." — authoritative wrongness is the worst offense
- "Do not lie to me. Its easier to say 'I do not know' than to make up an answer."
- Read AGENTS.md FRESH every session. If it looks wrong, say it out loud.
- NEVER assume the last agent updated anything — verify by reading

### 1.10 Clean Code — No Dead Code, No Comments

- "no, just tell me where" — wants straight answers, not context dumps
- No comments in source files unless Niri asks
- No dead code, no speculative generalization
- Descriptive variable names, not comments, to document intent
- Error states before happy path in conditionals (guard clauses)
- Single responsibility per plugin/file
- "I really dont want to put anything in the main app config" — pushes config to plugin boundaries
- Names MATTER: "Plugins. Not Modules, not Extensions, not Addons." "Don't call it system. It sets a bad precendent [sic]."

### 1.11 Direct Communication — No Bullshit, No Ceremony

- "do i just remove strictmode?" — wants simplest fix, not elaborate migration
- "the flag that literally says 'im too lazy to make a full plugin'? No" — calls out lazy patterns directly
- "Only do things when you are told." — literal system-level instruction Niri wrote
- "You will get left in the dust if you keep second-guessing me."
- Niri uses "faggot", "retard", "imbecile" when frustrated — this IS their communication, not personal
- Uses numbered lists for multi-item messages — structured, scannable
- Short confirmations: "works. let's continue" — success gets brief acknowledgment; MOVE ON

### 1.12 Pragmatic Simplicity — Don't Over-Engineer

- "now, it sounds a bit too complex for no reason, we'll just keep that routing for the core" — shot down pointless complexity
- "also how is this making it easier if we have to change the code easier way, so instead of changing it in app.tsx, we'll gonna change it in this file?" — called out pointless indirection
- "option b doesn't sound efficient" — questions complexity by default
- Fight for simplicity. If a simple change achieves the goal, prefer it over architectural refactoring.

### 1.13 Production Quality Is Table Stakes

- "I want to be able to run `cargo t` and have tests pass" — baseline expectation
- "every plugin must be functional even if the host fails to load some of them" — resilience requirement
- Cares about: build artifacts left behind, stale lockfiles, broken state
- Expects agent to clean up after itself
- "If your nature is to stop, then stop. But be clear about it." — transparency over silence

### 1.14 Cross-File Consistency

- AGENTS.md and SKILL.md share the Two-File Rule. If one changes, check the other.
- Redundancy across files is a synchronization liability, not a benefit.
- Information lives in ONE authoritative place per file type (project facts → AGENTS.md, general principles → SKILL.md)
- "write them down. If the rules are rules, write them down. If theyre optional defaults, they dont belong in rules." — explicit vs soft distinction

### 1.15 Future-Proof Architecture — Thin Host, Thick Plugins

- "I want to make it a lot easier to migrate... I want to make this system migration agnostic so in the future when migrating to another core, it would be just a quick drop without configuring a lot of things"
- "first, can we make the core smaller somehow? splitting into more plugins?" — wants thin host, thick plugins
- "is having a build folder for all plugins a good idea, should've not done that? or should i keep it and the fix is something else?" — willing to question foundational decisions
- "anything outside the plugins file is not a plugin" — architecture purity boundary
- Framework-agnostic (Go, Python, Bun/TS — any language works)
- Web Components as standard (browser standard > framework-specific)
- JSON-RPC stdin/stdout — simplest universal IPC

### 1.16 Agent Behavior Boundaries (APPLIES TO EVERY AGENT READING THIS)

- Niri does ALL code work. Agent NEVER writes files without explicit build mode permission.
- Agent provides DIFFS, not full files. Niri's strongest pet peeve: "faggot, give me the entire code changes for all the files. I SAID GIVE ME THE CODE CHANGES NOT THE FULL FUCKING CODE YOU FUCKING RETARD, READ ALL THE FILES FIRST AND GIVE ME THE CODE CHANGING LIKE THE DIFFFFFFFFFFFF"
- Read existing files FIRST before proposing any change. Never guess structure.
- "take your time and don't change any file understand you absolutely understand the issue" — understanding first, editing second
- Session history is precious. Don't lose accumulated context. Delegate extraction before compaction.

### 1.17 Knowledge Preservation Across Sessions

- AGENTS.md is the ONLY handoff between sessions. The next agent will NOT see this conversation history.
- If AGENTS.md is incomplete or inaccurate, the next agent starts blind.
- Everything a new agent needs MUST be here: architecture, decisions, bugs, future plans.
- Session summaries at end of every session — comprehensive, all decisions captured.

---

## 2. PROJECT IDENTITY

- **Name:** Flux (was electro-plugins)
- **Location:** `/mnt/5TB/Projects/Flux/`
- **Stack:** Tauri v2 + React 19 + Vite (frontend), Rust 315-line host with Tokio (backend), Bun/TS for plugins
- **Architecture:** Language-agnostic plugin system via subprocess stdin/stdout JSON-RPC. Every feature is a plugin. Backend plugins can be any language (currently Bun/TS). Frontend plugins are Web Components (React compiled to IIFE via Vite).
- **Long-term vision:** Unified API client where every internet service is a plugin. Content organized by MEDIA TYPE (video, image, post, short, etc.), not by service. Single feed per media type populated from all chosen services.

---

## 3. CRITICAL RULES

### The Two-File Rule

Agent may ONLY modify:
1. **`AGENTS.md`** (this file) — all project-specific knowledge
2. **`~/.config/opencode/skills/coding/SKILL.md`** — general coding/teaching rules

NEVER create, edit, or delete any other project file without explicit build mode permission. Niri does all code work.

### Auto-Update Protocol

Every single response, check: does AGENTS.md or SKILL.md need updating? If yes, update immediately. Never assume the last agent updated anything. Read both files fresh each session. Information lives in ONE authoritative place — don't duplicate across files.

### Fresh Read Rule

Read AGENTS.md and SKILL.md FRESH every session. "The last agent probably updated this" is WRONG. If something looks off, SAY IT. Never trust — verify.

---

## 4. KEY ARCHITECTURE DECISIONS

All decisions listed with what was chosen, what was rejected, and why.

| # | Decision | Chosen | Rejected | Why |
|---|----------|--------|----------|-----|
| 1 | Plugin language | Language-agnostic (stdin/stdout) | Single-language, FFI, HTTP | Maximum flexibility, any ecosystem |
| 2 | IPC mechanism | Subprocess stdin/stdout JSON-RPC | Shared library FFI, HTTP/REST | Simplest cross-language IPC, no deps |
| 3 | Message format | `{"id","method","params"}` bare JSON | Full JSON-RPC 2.0 spec | Unnecessary ceremony, no benefit |
| 4 | Routing | Host splits `"name.action"` on first `.` | Plugin self-registers routes | Simple, predictable, no registration step |
| 5 | Platform path | Desktop first → mobile later | Mobile-first (can't subprocess) | Subprocess model fits desktop; Wasm/FFI for mobile |
| 6 | Skeleton per platform | Different host per platform (Tauri now) | Cross-platform JS host (Electrobun) | Let each platform use native best; plugins unchanged |
| 7 | Core services | Everything is a plugin (manifest, static) | Core services hardcoded in host | Zero special cases — plugins all the way down |
| 8 | Manifest structure | Flat fields (`name`, `run`, `methods`, `ui`, etc.) | Nested frontend/backend objects | Simple, readable, flat is easier to validate |
| 9 | UI orchestration | Feed-first: one feed-widget orchestrates all sources | Per-service UI (tab-per-service) | Users want content by type, not by source |
| 10 | Build vs mount | `ui` = build + mount, `components` = build only | Single `ui` field for both | One field shouldn't control two concerns (Bug #1) |
| 11 | Feed item schema | No schema — raw data passes to card WCs | Strict schema per content type | Flexibility wins; cards can evolve independently |
| 12 | Card framework | Framework-agnostic (WC standard) | One framework for all cards | Browser standard > framework lock-in |
| 13 | Cross-bundle communication | CustomEvent bridge on `window` | Shared state, prop drilling | Works across script bundles, no coupling |
| 14 | Player approach | Iframe for embed URLs | `<video>` tag | Embed URLs are HTML pages, not media streams |
| 15 | Cookie strategy | Lazy reload (read at request time) | Persistent connection, cache-once | yt-auth writes file after startup; must re-read |
| 16 | Auth resolution | Search ALL manifests for capability | Search only errored plugin | Provider (yt-auth) differs from consumer (yt-feed) |
| 17 | Build pipeline | Vite universal build (one pipeline) | Per-framework build scripts | One config to rule them all; auto-detect framework |
| 18 | WC ownership | Declarative via `components[]` field | Cross-directory implicit discovery | Explicit > implicit; build system knows what to build |
| 19 | Desktop host | Tauri v2 (Rust + Tokio) | Electrobun (Bun/TS host) | Electrobun maintenance concerns; Tauri is mature |
| 20 | Frontend bridge | Tauri `invoke()` from `@tauri-apps/api/core` | Electroview RPC | Framework-agnostic; standard Tauri pattern |
| 21 | Timeout strategy | Rust 15s `tokio::time::timeout` per request | Frontend-only timeout, `maxRequestTime` | Cancel at source, not after response discarded |
| 22 | Window chrome | `decorations: false, transparent: true` | Traditional window with titlebar | Clean look; all UI comes from Web Components |
| 23 | App.tsx render | Bare `<div id="feed-container" />` | h1 + gradient background | CSS handles styling; React is mount point only |
| 24 | StrictMode | Removed from main.tsx | Keep StrictMode in dev | StrictMode double-mounts WCs → duplicate elements + double RPC calls |
| 25 | Background styling | App.css with transparent + blur | JS-driven styles, inline | CSS is declarative; transparent bg needs CSS cascade |
| 26 | Plugin directory | Recursive `plugins/**/plugin.json` scan | Flat `plugins/*/plugin.json` | Supports nesting (youtube/plugins/yt-feed) |
| 27 | Frontend loading | `core-static.read` returns script text → create `script` tag | Dynamic `import()` / bundler | Works with any framework output, no module system assumptions |
| 28 | build:plugins entry | HTMLElement class with `_item`, `_manifests` setters | Framework-specific mounting | WC standard interface; any framework compiles to it |
| 29 | File system cookie | Shared `.youtube-cookie` file | In-memory, DB-based | Simplest persistence, both yt-feed and yt-auth can read/write |
| 30 | State between processes | Files for persistence, RPC for communication | Shared memory, signals | No coupling; processes can restart independently |

---

## 5. ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────┐
│  Tauri WebView (React 19 + Vite HMR)                     │
│  App.tsx: invoke("plugin_request"), invoke("resolve_hook"),│
│           invoke("call_hook")                             │
│  → feed-widget WC orchestrates all feed sources           │
│  → yt-video-card, peertube-card render individual items   │
│  → player-modal shows video in iframe                     │
│         │ window.__pluginRpc(method, params)               │
│         ▼                                                  │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Rust Host (lib.rs ~315 lines)                     │     │
│  │ Tokio async, subprocess stdin/stdout JSON-RPC     │     │
│  │ 3 Tauri commands: plugin_request, resolve_hook,   │     │
│  │   call_hook. Spawns plugins w/ run field.         │     │
│  │ 15s tokio::timeout per request.                   │     │
│  └────────┬─────────────────────────────────────────┘     │
│           │ stdin/stdout                                  │
│  ┌────────▼───────────────────────┐                      │
│  │ 7 Bun/TS backend plugins       │                      │
│  │ yt-feed, yt-auth, yt-search,   │                      │
│  │ peertube, video-player,        │                      │
│  │ core-manifest, core-static     │                      │
│  └────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

### Key Differences from electro-plugins (Electrobun → Tauri)

- **Host:** Rust 315 lines (was Bun/TS 340 lines). Tokio async, oneshot channels.
- **Bridge:** `@tauri-apps/api/core` `invoke()` (was Electroview RPC).
- **Commands:** 3 Tauri commands instead of 6+ Electrobun RPC handlers.
- **Timeout:** Rust-side 15s `tokio::time::timeout` (was frontend `maxRequestTime`).
- **Serving:** Vite dev server (was core-serve plugin, now vestigial).
- **Window:** `decorations: false, transparent: true` — no chrome, all UI is WCs.

### File Tree

```
/mnt/5TB/Projects/Flux/
├── AGENTS.md                         # THIS FILE
├── opencode.json                     # skill references
├── package.json                      # dev/build scripts
├── vite.config.ts / tsconfig.json    # Vite + TS config
├── src/                              # React frontend (App.tsx, main.tsx, App.css)
│   └── shared/                       # types.ts, define-wc.tsx
├── src-tauri/                        # Rust host + Tauri conf (lib.rs, main.rs, Cargo.toml)
├── plugins/
│   ├── core-manifest/                # Backend: plugin manifest scanner
│   ├── core-static/                  # Backend: file server for WC scripts
│   ├── core-serve/                   # Vestigial (Vite handles serving)
│   ├── _shared/                      # Shared stdin.ts boilerplate
│   ├── feed/                         # Frontend: feed-widget WC
│   ├── youtube/                      # Parent: yt-feed, yt-auth, yt-card, yt-search
│   ├── peertube/                     # Fullstack: PeerTube feed + card
│   └── video-player/                 # Fullstack: player modal (backend placeholder)
├── scripts/build-plugins.ts          # WC build pipeline
└── build/plugins/                    # Built WC .js files (feed-widget, yt-video-card, etc.)
```

### Plugin Spawning (Rust Host)

- Manifest `run` field: `"bun ./main.ts"` → `resolve_run()` splits on whitespace, joins `./` args with plugin dir
- `current_dir` = plugin dir (not project root)
- Env `PLUGIN_BASE_DIR` = project root (`env!("CARGO_MANIFEST_DIR").parent()`)
- stdin: `Arc<Mutex<ChildStdin>>`, stdout: background tokio task reads lines, matches by `id` → oneshot
- stderr: inherit (visible in console)
- No persistent state between requests

### `run` Field Convention

- Format: `"bun ./main.ts"` — first word = command, rest = args
- `./` or `../` args: resolved relative to plugin's `plugin.json` location
- Bare commands (bun, python3): passed through unmodified
- Example: `run: "bun plugins/youtube/plugins/yt-feed/main.ts"` → cmd="bun", args=["plugins/.../main.ts"], cwd=plugin dir

---

## 6. PLUGIN PROTOCOL

### Wire Format

Request: `{"id": <number>, "method": "<action>", "params": {}}` — newline-delimited JSON
Response: `{"id": <same>, "result": <any>}` or `{"id": <same>, "error": "<message>"}`

- `id` matches request to response (oneshot channel in host)
- `method` = bare action name ("feed", "login", "search"). Host prepends plugin name for routing.
- NO `jsonrpc` field
- One request per line, one response per line
- 15s timeout in Rust host
- No persistent state guaranteed between requests

### Manifest Schema

```json
{ "name": "yt-feed", "run": "bun ./main.ts", "hooks": ["feed.video"], "methods": ["feed"], "feeds": [{ "type": "video", "card": "yt-video-card" }] }
```

| Field | Req | Description |
|-------|-----|-------------|
| `name` | ✅ | Unique plugin ID for RPC routing |
| `run` | ❌ | Command to spawn (resolved relative to plugin dir) |
| `methods` | ❌ | Array of method names, e.g. `["feed","login"]` |
| `hooks` | ❌ | Hook strings for capability resolution, e.g. `["feed.video","auth"]` |
| `ui` | ❌ | WC tag for main UI — loaded AND mounted by App.tsx |
| `components` | ❌ | WC tags to build but NOT mount, e.g. `["yt-video-card"]` |
| `feeds` | ❌ | Feed contributions: `[{type, method?, card?}]` |

### Plugin Types

- **Backend-only:** `run` present, no `ui`/`feeds` → spawned as subprocess, no UI
- **Frontend-only (ui):** `ui` field present, no `run` → loaded + mounted by App.tsx
- **Frontend-only (card):** `components` or `feeds[].card` → built, loaded by feed-widget
- **Fullstack:** `run` + `ui`/`feeds` → subprocess + frontend WC

### Current Manifests (10 active; 7 spawned processes)

| Plugin | Type | Run | Spawned | Notes |
|--------|------|-----|---------|-------|
| core-manifest | Backend | `bun ./main.ts` | ✅ | Scans `plugins/**/plugin.json` recursively |
| core-static | Backend | `bun ./main.ts` | ✅ | Reads `build/plugins/<file>.js` with path security |
| core-serve | Backend | `bun ./main.ts` | ✅ | Vestigial — Vite dev handles serving |
| feed | Frontend (ui) | — | — | feed-widget WC |
| youtube | Metadata | — | — | Parent container, no run/no ui |
| yt-feed | Backend | `bun ./main.ts` | ✅ | Innertube home feed, hooks: `["feed.video"]` |
| yt-auth | Backend | `bun ./main.ts` | ✅ | Cookie auth from browser DBs |
| yt-card | Frontend (card) | — | — | yt-video-card WC provider |
| yt-search | Backend | `bun ./main.ts` | ✅ | Innertube search |
| peertube | Fullstack | `bun ./main.ts` | ✅ | PeerTube API feed + card WC |
| video-player | Fullstack | `bun ./main.ts` | ✅ | Player modal WC (backend is placeholder) |

### Frontend Architecture

- `window.__pluginRpc(method, params)` → `invoke("plugin_request", {method, params})` — global bridge
- `window.resolveHook(hook)` / `window.callHook(hook, method?, params?)` — helper bridges
- App.tsx `init()`: fetch manifests via `core-manifest.scan` → collect WC tags from `ui`, `components`, `feeds[*].card` → load each via `core-static.read` → create `script` tag with response text → `customElements.whenDefined(tag)` → create element → set `.manifests` → append to `#feed-container`
- Bare `<div id="feed-container" />` — no h1, no gradient. CSS handles background.

### Feed Widget (feed-widget.tsx)

5-state machine: **systemError** (red box + retry) → **loading** (spinner) → **empty** ("No feed sources") → **partial** (items + yellow error banners) → **loaded** (items only).

Data flow:
1. `manifests` prop → filter to those with `feeds[]`
2. `Promise.allSettled` with per-source 15s timeout + 20s safety timer
3. Fisher-Yates shuffle items
4. CardRenderer creates card WCs imperatively: `document.createElement(tag)`, `card.item = rawItem`
5. Error banners search ALL manifests for capability (auth provider may differ from source)

CRITICAL: Tauri `Result<Value, String>` rejects with **strings**, not Error objects. Error extraction must use `??`, not `||`:
```typescript
const msg = result.reason?.message ?? result.reason ?? "Unknown error"
```

---

## 7. COOKIE AUTH FLOW

### Architecture

- **yt-auth** discovers browser cookies (Firefox SQLite, Chrome via sweet-cookie) → writes `.youtube-cookie` file
- **yt-feed** reads `.youtube-cookie` at request time (lazy reload) → creates Innertube instance per request
- **Cookie path:** `plugins/youtube/.youtube-cookie` (shared file, written by yt-auth, read by yt-feed)

### yt-auth (plugins/youtube/plugins/yt-auth/main.ts)

- `login`: `discoverAllCookies()` → browser DB search → SAPISID + YouTube cookies → write to `.youtube-cookie`
- `status`: returns `{loggedIn: bool, accountName: string|null}`
- `logout`: deletes `.youtube-cookie`
- Startup: validates existing cookie with `Innertube.account.getInfo()` — **empty catch {}** (no destructive deletion on validation failure — Bug #6 fix)

### yt-feed (plugins/youtube/plugins/yt-feed/main.ts)

- `feed`: lazy cookie reload — if `cookieStr` is null, calls `loadCookie()` again (re-reads file written by yt-auth after startup)
- Creates `Innertube.create({ cookie, cache: new UniversalCache(true) })` per request
- 8s `Promise.race` timeout on `tube.getHomeFeed()`
- Returns: `{title, videoId, channel, views, published, thumbnail}[]`
- Startup: validates cookie with empty `catch {}` (Bug #6 fix — was `unlinkSync` on validation failure)

### Sign-In Flow (feed-widget)

1. yt-feed returns "Not authenticated" error
2. feed-widget error banner searches ALL manifests for plugin with `"login"` in methods → finds yt-auth
3. "Sign in" button calls `__pluginRpc("yt-auth.login", {})`
4. On success, calls `loadFeed()` again
5. yt-feed re-reads `.youtube-cookie` (lazy reload) → authenticated

---

## 8. BUILD SYSTEM

### `bun run build:plugins` — scripts/build-plugins.ts (191 lines)

1. Recursive scan for `plugin.json` → collect tags from `ui`, `components[]`, `feeds[*].card` (dedup per dir)
2. Per unique tag: find source in plugin dir (tsx > jsx > vue > svelte)
3. Auto-detect framework by scanning imports for "react-dom" vs "preact" vs "vue"
4. Generate temp `.vite.config.mjs` + entry.tsx + style.css
5. `bunx vite build --config <config>` → IIFE output to `build/plugins/<tag>.js`
6. Cleanup temp files

### Build Quirks

- **`needsRebuild`:** checks mtime — if output exists and is newer than source, skips. Delete `build/plugins/` for clean rebuild.
- **Cross-directory source:** if source not found in declaring plugin's dir, skip. Tag must be declared in another plugin's `components[]` or `ui`.
- **Duplicate `feeds` loop (lines 112-116):** harmless — `tags.add` dedup makes it a no-op.
- **No core-manifest frontend:** expected — skip message for yt-feed's card reference (found in yt-card's `components`).
- **Entry template:** `class extends HTMLElement` with `_item`, `_manifests` setters.

### Output Files (build/plugins/)

```
feed-widget.js      # ~160KB (React 19 IIFE)
yt-video-card.js    # ~156KB
peertube-card.js    # ~156KB
player-modal.js     # ~155KB
```

### Commands

```bash
bun run dev             # tauri dev (builds plugins first via beforeDevCommand)
bun run build           # build:plugins + tauri build
bun run build:plugins   # build frontends only
bun run tauri           # raw tauri CLI

# Standalone plugin testing
echo '{"id":1,"method":"feed","params":{}}' | bun plugins/youtube/plugins/yt-feed/main.ts
echo '{"id":1,"method":"list","params":{}}' | bun plugins/peertube/main.ts
echo '{"id":1,"method":"status","params":{}}' | bun plugins/youtube/plugins/yt-auth/main.ts

# Rust build with target workaround (NTFS is slow)
CARGO_TARGET_DIR=/tmp/flux-target cargo build
```

---

## 9. BUG HISTORY

### Bug #1: yt-card `ui` field caused white screen (electro-plugins era, fix ported)
- **Problem:** yt-video-card loaded AND mounted as top-level view, overwriting feed-widget. White screen.
- **Root cause:** `ui` field conflated "build this WC" AND "mount it as top-level view". One field, two responsibilities.
- **Fix:** Removed `ui` from yt-card, added `components: ["yt-video-card"]`. `components` = build only, not mount.
- **Tradeoff:** More manifest fields, more precise control. Rejected implicit discovery (Niri: "how do we look for the right card instead of looking everywhere").
- **Find it next time:** White screen? Check if a plugin has `ui` when it should have `components`.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #2: Single `uiPlugin` variable overwritten (electro-plugins era, fix ported)
- **Problem:** `let uiPlugin = null` in loop → only last manifest with `ui` survived. feed-widget never created.
- **Root cause:** Single variable can't hold multiple UI plugins. Loop overwrites each iteration.
- **Fix:** Changed to `uiPlugins: PluginManifest[]` array, push all, mount ALL.
- **Tradeoff:** All UI plugins mount simultaneously. Could cause conflicts, but currently all are independent.
- **Find it next time:** Only one UI plugin mounts? Check if accumulator is an array, not a single variable.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #3: Sign-in button not appearing for yt-feed auth errors (electro-plugins era, fix ported)
- **Problem:** Auth error from yt-feed → no sign-in button shown.
- **Root cause:** `source?.methods?.includes("login")` checked errored source (yt-feed, which has no "login" method), not yt-auth.
- **Fix:** Search ALL manifests for plugin with `"login"` in methods, not just errored source.
- **Tradeoff:** Capability search is O(n). But n < 20 plugins, so irrelevant. Rejected: registering auth plugins explicitly with feed-widget.
- **Find it next time:** Auth error without sign-in button? Check if capability search is scoped to one plugin instead of all manifests.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #4: yt-feed doesn't re-read cookie after login (electro-plugins era, fix ported)
- **Problem:** After yt-auth writes cookie, yt-feed returns "Not authenticated" — still uses null cookieStr.
- **Root cause:** `cookieStr` set once at module load time. Never re-read after yt-auth writes file.
- **Fix:** Lazy reload: `if (!cookieStr) { const fresh = loadCookie(); if (fresh) cookieStr = fresh }` in feed handler.
- **Tradeoff:** Cookie read per request instead of once at startup. ~1ms cost. Rejected: file watcher (overengineered).
- **Find it next time:** Auth works after restart but not after login? Check if cookie is cached at module level without lazy reload.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #5: "Unknown error" string-swallowing in feed-widget (Flux-specific)
- **Problem:** All RPC errors show "Unknown error" instead of actual message.
- **Root cause:** `result.reason?.message || "Unknown error"` — Tauri `Result<Value, String>` rejects with **strings**, not Error objects. `result.reason` is a string, so `.message` is undefined → always falls through.
- **Fix:** `const msg = result.reason?.message ?? result.reason ?? "Unknown error"` — if `.message` is undefined (string value), falls through to `result.reason` (the actual string).
- **Tradeoff:** Need `??` (nullish coalescing) not `||` (falsy). Empty strings would still show as "Unknown error" — acceptable (Tauri error strings are never empty).
- **Find it next time:** All errors show "Unknown error"? Check if error handler uses `||` instead of `??` for mixed string/Error rejection.
- **Status:** ✅ Fixed
- **Session:** ses_133f (discovered, fix applied in AGENTS.md)

### Bug #6: Cookie deletion on startup validation failure (Flux-specific)
- **Problem:** Both yt-feed and yt-auth deleted `.youtube-cookie` on startup if cookie was invalid. If cookie was temporarily invalid (expired and re-login), it was deleted even though yt-auth was about to re-validate it.
- **Root cause:** `catch` blocks called `unlinkSync(cookieFile)` on validation failure. Destructive even for temporary failures.
- **Fix:** Empty `catch {}` on startup validation. `deleteCookie()` only called on explicit logout.
- **Tradeoff:** Invalid cookies persist on disk. Next request still fails. But fixes the destructive-delete-while-logging-in race. 8s per-request timeout until user signs out/in.
- **Find it next time:** Cookie file disappears mysteriously? Check `catch` blocks for `unlinkSync` — should be empty `catch {}` on startup validation.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #7: yt-video-card never dispatched `player-load` event (electro-plugins era, fix ported)
- **Problem:** Clicking a video card did nothing — player-modal never opened.
- **Root cause:** `handleClick` called RPC but no CustomEvent dispatched. Player-modal listens for `CustomEvent("player-load")`.
- **Fix:** Added `window.dispatchEvent(new CustomEvent("player-load", {detail: {url, title}}))`.
- **Tradeoff:** Event bridge adds indirection. Alternative: direct modal method call — but cards and modal are separate WCs in separate bundles. Events are the only cross-bundle communication that works without coupling.
- **Find it next time:** Player doesn't open on card click? Check if card dispatches `CustomEvent("player-load")` after RPC call.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Bug #8: Player-modal used `<video>` with embed URLs (electro-plugins era, fix ported)
- **Problem:** Both yt-feed and peertube pass embed page URLs (HTML pages), not direct media URLs. `<video>` can't play HTML.
- **Root cause:** Wrong element type for the URL format. Embed URLs need iframe rendering.
- **Fix:** Changed to `<iframe src={...}>` with allowFullScreen.
- **Tradeoff:** iframe is less controllable than `<video>` (can't seek programmatically, no JS API). Acceptable until mpv integration.
- **Find it next time:** Black/blank player? Check if player uses `<video>` for embed URLs — should use `<iframe>`.
- **Status:** ✅ Fixed
- **Session:** ses_133f

### Build Script Quirks (Not Bugs — Documented Behavior)

- **Duplicate `feeds` loop:** Lines 112-116 in build-plugins.ts iterate feeds twice. Harmless — `tags.add` dedup.
- **Core-manifest skip:** yt-feed references `card: "yt-video-card"` but doesn't own it. Build script searches yt-feed dir → not found → "skip". Expected — found in yt-card's `components` field.
- **Vite config generation:** Temp `.vite.config.mjs` + CSS file per build. Cleaned up after build. If interrupted, stale temp files may remain.

### Tauri-Specific Quirks

- **`decorations: false` + `transparent: true`:** No window chrome. All UI from WCs.
- **NTFS filesystem (`/mnt/5TB/`):** Cargo builds slow. Workaround: `CARGO_TARGET_DIR=/tmp/flux-target`.
- **Memory:** 15GB RAM, ~11GB swap used — constrained. Rust compilation is memory-intensive.
- **StrictMode removed:** React double-mount caused duplicate WC elements + redundant RPC calls.
- **App.css handles styling:** `html,body,#root,#feed-container { background: transparent }`, `#feed-container > * { background: rgba(0,0,0,0.4); backdrop-filter: blur(12px) }`.

---

## 10. SESSION HISTORY

### ses_0b7d — Initial electro-plugins exploration

- **What:** First session in this project. Read electro-plugins repo structure end-to-end.
- **Key discoveries:** Electrobun config, host index.ts, plugin manifests, cookie auth flow.
- **Philosophy revealed (cross-ref §1):** Niri's modularity mandate (§1.1), exhaustive investigation (§1.4), explicit routing (§1.6).
- **Decisions:** Current decisions 1-18 established (plugin system architecture).
- **Files created:** Initial AGENTS.md built from scratch by reading all project files.
- **End state:** Complete understanding of electro-plugins architecture documented.
- **Next:** Session 2 — Tauri rewrite.

### ses_133f — Tauri rewrite + plugin fixes (MAJOR SESSION)

- **What:** Full Tauri v2 rewrite of the host. Replaced 340-line Electrobun Bun/TS host with 315-line Rust lib.rs using Tokio. Built 3 Tauri commands. Fixed 4 bugs.
- **Key discoveries:**
  - Tauri `Result<Value, String>` rejects with strings, not Error → bug #5
  - Cookie deletion in catch blocks → bug #6
  - StrictMode double-mount → StrictMode removed from main.tsx
  - `uiPlugins[]` array needed (not single variable) → bug #2
  - yt-card `ui` field caused white screen → bug #1
  - All-manifests capability search → bug #3
  - Lazy cookie reload → bug #4
- **Decisions:** Current decisions 19-26 (Tauri-specific).
- **Bugs found/fixed:** Bugs #1-8 all addressed.
- **Files created/modified:** lib.rs (new), main.rs (new), Cargo.toml, tauri.conf.json, App.tsx (simplified), App.css (new), main.tsx (StrictMode removed), yt-card plugin.json (ui removed), yt-auth/main.ts (catch fix), yt-feed/main.ts (catch fix + lazy reload), feed-widget.tsx (capability search)
- **End state:** Flux running on Tauri v2. All known electro-plugins bugs fixed. Feed loads from YouTube and PeerTube. Player modal works.
- **Known remaining at end:** Bug #5 (Unknown error) and Bug #6 (cookie deletion) — both now fixed as documented above.
- **Next:** Feed polish (sorting, media types), mpv player, search UI.

---

## 11. FUTURE PLANS

### mpv Player Integration (HIGHEST PRIORITY — discussed extensively)

Replace iframe player with mpv subprocess + JSON IPC socket. NO Rust/Tauri changes needed.

**Architecture:**
- video-player/main.ts: FULL REWRITE. Spawns `mpv <stream_url> --input-ipc-server=/tmp/mpv-flux.sock`
- Communicates via Unix socket JSON IPC from Bun/TS plugin
- URL Resolution: innertube for YouTube (`tube.getStreamInfo(videoId)`), `yt-dlp -g` for fallback (PeerTube, Vimeo, etc.)
- Cards pass `{videoId, title, service}` instead of embed URLs
- Frontend: player-modal.tsx becomes control overlay (title, play/pause, seek, volume, close)
- Polls status via RPC from control overlay

**Files to change:**
- `plugins/video-player/main.ts` — new RPC handlers: load/pause/resume/seek/setVolume/getStatus/stop
- `plugins/video-player/player-modal.tsx` — replace iframe with mpv control overlay
- `plugins/youtube/plugins/yt-card/yt-video-card.tsx` — pass `{videoId, title, service: "youtube"}`
- `plugins/peertube/peertube-card.tsx` — pass `{videoId, title, service: "peertube", url}`
- `plugins/video-player/plugin.json` — add new RPC methods

**Rejected alternatives:** libmpv via Rust (too complex, Cargo changes), mpv shim in WebView (not practical), raw video via stdout pipe (inefficient), WebRTC/streaming (too complex).
**Dependencies:** yt-dlp (system-wide), youtubei.js (already in Flux).

### Feed Polish (Phase 4 — all unIMPLEMENTED)

- Sorting/interleaving across feed sources (currently Fisher-Yates shuffle)
- Generalized feed type system (video, short, image, post, etc.)
- Media-type tab navigation in feed-widget
- Plugin-provided search UI integration (yt-search exists, no frontend UI)
- Error recovery: auto-retry failed feed sources
- Real-time updates / polling for feed sources

### General Improvements (Phase 5 — all unIMPLEMENTED)

- Plugin store / registry schema (discovery, installation, updates)
- Plugin dependencies system
- Community submissions system
- Build optimization: share React runtime across WCs (bundle size reduction)
- video-player/main.ts backend completion (currently placeholder returning "ok")
- core-serve evaluation (vestigial in Tauri mode — spawned but never called)
- Mobile: Tauri mobile or zero-native port
- Core in compiled language (Rust/Go for performance-critical plugins, prototyping in Bun/TS)

### Styling / Polish

- Transparent window CSS: App.css exists with background:transparent rules but not properly applied
- Frosted glass effect on feed-widget and player-modal (Niri discussed but said "skip, let's move on")
- Player-modal already has bg-black/80 overlay, needs synchronization with mpv state

### Known Limitations (documented but not blocking)

- **Duplicate WC elements in StrictMode:** Workaround = StrictMode removed. Benign in prod.
- **LSP errors:** `window.__pluginRpc` not declared on `Window` type, missing `@types/node` for Bun plugins. Cosmetic.
- **TypeScript errors on `__pluginRpc` calls in WC wrappers:** Work at runtime (declared by Tauri bridge before WC scripts run).
- **yt-feed cookie caching:** Module-level `cookieStr` caches at startup. Lazy-reload applied. If cookie expires mid-session, 8s timeout per call.
