# Video player with modular modal wrapper

Status: ready-for-agent

## Problem Statement

There is no working video player in Flux. The `player-modal` plugin is a stub — it renders a close button and title overlay but no video. The disabled `video-player` and `mpv-player` plugins are prototypes that don't compile (missing libmpv dependency). Cards dispatch `"player-load"` events that nobody listens to — clicking a video card does nothing. The event taxonomy is inconsistent (`"player-load"` vs `"modal-load"` vs `"modal-close"` with no naming convention).

## Solution

Build two separate plugins — a **Player** (video renderer) and a **Modal** (overlay shell) — that communicate through named events following the hook-method convention. The modal is purely a wrapper with a slot; the player is the media engine. Both are created during App.tsx init and hidden by default. A card click dispatches `"video.player.load"`, each plugin reacts independently: the player loads and plays, then dispatches `"video.modal.show"`; the modal shows itself. Closing the modal dispatches `"video.player.hide"`; the player stops and dispatches `"video.modal.hide"`. Neither plugin hardcodes the other — swap manifests to swap players or modals.

Use the `movi-player` npm library (WebCodecs + FFmpeg WASM) as the video engine. Clean up the broken libmpv dependency from the Rust build.

## User Stories

1. As a user, I want to click a video card and see a video player open, so I can watch the content.
2. As a user, I want to close the video player and return to the feed, so I can continue browsing.
3. As a user, I want the video player to pause/hide when I close it, so the feed isn't playing in the background.
4. As a developer, I want to swap the player engine without touching the modal, so I can experiment with different players.
5. As a developer, I want to swap the modal style without touching the player, so I can change the UI independently.
6. As a developer, I want the player to validate media URLs before loading, so errors are caught early.
7. As a developer, I want the libmpv dependency removed from the build, so the project compiles cleanly.

## Implementation Decisions

### Two-plugin separation

Two plugins, one seam: the event contract.

| Plugin | Name | Hook | Methods | Slots | Components | Type |
|--------|------|------|---------|-------|------------|------|
| Player | `movi-player` | `video.player` | `load`, `hide` | `["video.player"]` | `["movi-player"]` | Hybrid |
| Modal | `player-modal` | `video.modal` | `show`, `hide` | — | — | Frontend (`ui`) |

The modal has a `<slot>`. The player element is placed inside that slot by the modal itself — during `connectedCallback`, the modal scans manifests for a plugin with `slots: ["video.player"]`, reads its `components[0]` for the WC tag, creates that element, and appends to itself. Neither plugin hardcodes the other.

### Event contract

Events follow the `"<hook>.<method>"` naming convention, matching the hook/method exactly:

| Event | Dispatch source | Listeners react |
|-------|----------------|-----------------|
| `"video.player.load"` `{url, title}` | Card click handler | Player loads video → dispatches `"video.modal.show"` |
| `"video.player.hide"` | Modal close button | Player stops → dispatches `"video.modal.hide"` |
| `"video.modal.show"` | Player (after load) | Modal shows its backdrop |
| `"video.modal.hide"` | Player (after stop) | Modal hides itself |

### Player plugin (movi-player)

- **Backend** (`run`): Validates media URLs, resolves auth/redirects. Returns stream metadata to the frontend.
- **Frontend WC**: Wraps the `<movi-player>` element from the `movi-player` npm package. Listens for `"video.player.load"` (starts playback, dispatches `"video.modal.show"`), listens for `"video.player.hide"` (stops playback, dispatches `"video.modal.hide"`).
- The `<movi-player>` npm package is an external dependency — it plays MKV, HEVC, AV1, HDR via WebCodecs + FFmpeg WASM. ~410KB full element bundle, ~180KB programmatic bundle.

### Slot and Component manifest fields

Two new manifest fields enable slot-based DOM composition:

- **`components[]`**: WC tags to build and script-load but not auto-mount. The build pipeline collects these tags, builds them into IIFE bundles, and App.tsx loads them. The modal (or other slot consumer) is responsible for creating the WC element and mounting it.
- **`slots[]`**: Named placeholders this plugin fills. A plugin with a slot declares "I can go inside something that accepts this slot name." The consumer (e.g. `player-modal`) scans manifests for a match.

This mirrors hooks — where hooks resolve backend capability, slots resolve frontend DOM composition.

### Modal plugin (player-modal)

- Frontend-only (`ui`). A backdrop overlay with a close button.
- During `connectedCallback`: scans `.manifests` for a plugin with `slots: ["video.player"]`, reads `components[0]` for the WC tag, creates the element, appends to itself.
- Listens for `"video.modal.show"` (shows), listens for `"video.modal.hide"` (hides).
- Close button dispatches `"video.player.hide"`.
- No URL, title, or media logic.

### No App.tsx changes needed

App.tsx already creates the modal via `"ui": "player-modal"`. The modal resolves the player slot itself — no init changes required.

Card click handlers are updated to dispatch `"video.player.load"` instead of the old `"player-load"`.

### Event name migration

Replace the existing event names across all plugins:

| Old event | New event |
|-----------|-----------|
| `"player-load"` | `"video.player.load"` |
| — (new) | `"video.player.hide"` |
| `"modal-load"` | `"video.modal.show"` |
| `"modal-close"` | `"video.modal.hide"` |

Affected files: `yt-video-card.tsx`, `peertube-card.tsx`, `player-modal.tsx`, `feed-widget.tsx`.

### libmpv cleanup

Remove the `tauri_plugin_libmpv::init()` call from `src-tauri/src/lib.rs` and ensure `Cargo.toml` has no remaining reference to `tauri-plugin-libmpv`.

## Testing Decisions

The highest seam is the event contract. Each plugin can be tested independently by dispatching events and asserting the response:

- **Player**: dispatch `"video.player.load"` with `{url, title}` → assert it dispatches `"video.modal.show"` → dispatch `"video.player.hide"` → assert it dispatches `"video.modal.hide"`
- **Modal**: dispatch `"video.modal.show"` → assert visible → click close → assert dispatches `"video.player.hide"` → dispatch `"video.modal.hide"` → assert hidden
- **Cards**: assert dispatch `"video.player.load"` with correct `{url, title}` on click

The `movi-player` npm library is tested upstream. The Flux WC wrapper's job is event wiring — test the wiring, not the video engine.

## Out of Scope

- Desktop app integration (the movi-player npm has a desktop app — not using it here)
- Multiple simultaneous players
- Playlist support
- Audio-only player
- Custom UI controls for the player (use movi-player's built-in UI)

## Further Notes

The event naming convention `"<hook>.<method>"` should be used for all future CustomEvents in Flux. Existing legacy events (`"player-load"`, `"modal-load"`, `"modal-close"`) are migrated in this spec.
