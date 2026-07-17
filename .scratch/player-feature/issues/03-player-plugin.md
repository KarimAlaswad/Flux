# 03 — Player plugin + card migration

**What to build:** Create a new `movi-player` plugin that wraps the `movi-player` npm library. The backend validates/resolves media URLs. The frontend WC renders the `<movi-player>` element and listens for `"video.player.load"`/`"video.player.hide"`. Migrate card click handlers to dispatch `"video.player.load"` with `{url, title}` instead of the old `"player-load"`.

**Blocked by:** 01 — libmpv cleanup

**Status:** ready-for-agent

- [ ] `npm install movi-player`
- [ ] Create `plugins/movi-player/plugin.json` with `run`, `methods: ["load", "hide"]`, `hooks: ["video.player"]`
- [ ] Create backend (`main.ts`) — validates/resolves media URLs, returns stream metadata
- [ ] Create frontend WC — wraps `<movi-player>`, listens for `"video.player.load"`/`"video.player.hide"`, dispatches `"video.modal.show"`/`"video.modal.hide"`
- [ ] yt-video-card: `"player-load"` → `"video.player.load"`
- [ ] peertube-card: `"player-load"` → `"video.player.load"`
- [ ] `bun run build:plugins` succeeds — `movi-player.js` produced
- [ ] Click a card → video plays (standalone, not yet in modal)
