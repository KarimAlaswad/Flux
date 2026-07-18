# 02 — Remove `PluginManifest.components` from type system

**What to build:** Remove the `components` field from `PluginManifest` — it was a prototype pattern for declaring buildable Web Components, now superseded by `ui` (for auto-mounted main-UI) and `feeds[].card` (for feed-item renderers). Remove from TypeScript types, Rust struct, and the build script's tag-collection loop. The `yt-video-card` tag is already collected via `yt-feed`'s `feeds[].card`.

**Note:** This decision predates the slot resolution system in the player-feature spec, which re-uses `components` as the mechanism for declaring slot-filling WC tags. The two specs disagree — this ticket records the cleanup decision; the player-feature later reintroduces `components` for the slot use case.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Remove `components?: string[]` from `PluginManifest` in `src/shared/types.ts`
- [x] Remove `components: Option<Vec<String>>` from `PluginManifest` in `src-tauri/src/lib.rs`
- [x] Remove `manifest.components` loop from tag collection in `scripts/build-plugins.ts`
- [x] Remove `components` from App.tsx `init()` tag loading loop
- [x] `bun run build:plugins` succeeds
