# 01 — Remove dead `FeedContrib.type` field

**What to build:** Remove the unused `type` field from `FeedContrib` — it's declared in the shared types (TypeScript + Rust) and populated in two plugin manifests (`yt-feed`, `peertube`) but never read by any consumer. The feed widget ignores it and merges all sources into a single stream. This is a wide refactor: same mechanical change (`type` → delete) across 4 files.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Remove `type?: string` from `FeedContrib` in `src/shared/types.ts`
- [x] Remove `feed_type: Option<String>` from `FeedContrib` in `src-tauri/src/lib.rs`
- [x] Remove `"type"` field from `plugins/youtube/plugins/yt-feed/plugin.json`
- [x] Remove `"type"` field from `plugins/peertube/plugin.json`
- [x] `bun run build:plugins` succeeds (verification)
