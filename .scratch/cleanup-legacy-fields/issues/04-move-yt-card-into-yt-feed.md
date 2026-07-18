# 04 — Move yt-card source into yt-feed directory

**What to build:** Move the `yt-video-card.tsx` source from `plugins/youtube/plugins/yt-card/` into `plugins/youtube/plugins/yt-feed/` and delete the `yt-card/` directory. The card is only referenced by `yt-feed`'s `feeds[].card` field, so it belongs with its sole consumer. The build script discovers the source via the manifest, so the file move is transparent.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Move `yt-video-card.tsx` into `plugins/youtube/plugins/yt-feed/`
- [x] Delete `plugins/youtube/plugins/yt-card/` directory
- [x] `bun run build:plugins` produces `build/plugins/yt-video-card.js`
