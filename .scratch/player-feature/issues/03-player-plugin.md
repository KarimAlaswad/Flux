# 03 — Player plugin + card migration

**What to build:** Create a new `movi-player` plugin that wraps the `movi-player` npm library. The backend validates/resolves media URLs. The frontend WC renders the `<movi-player>` element and listens for `"video.player.load"`/`"video.player.hide"`. Migrate card click handlers to dispatch `"video.player.load"` with `{url, title}` instead of the old `"player-load"`.

**Blocked by:** 01 — libmpv cleanup

**Status:** completed

- [x] `npm install movi-player`
- [x] Create `plugins/flux-player/plugin.json` with `components`, `slots`, `hooks: ["video.player"]` (no `run` — resolved upstream at source plugin level)
- [x] Create frontend WC (`flux-player.tsx`) — wraps `<movi-player>`, listens for `"video.player.load"`/`"video.player.hide"`, dispatches `"video.modal.show"`/`"video.modal.hide"`
- [x] yt-video-card: `"player-load"` → `"video.player.load"`
- [x] peertube-card: `"player-load"` → `"video.player.load"`
- [x] `bun run build:plugins` succeeds — `flux-player.js` produced
- [x] Click a card → video plays (standalone, not yet in modal)
