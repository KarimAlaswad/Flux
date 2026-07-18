# 04 — Player plugin + card migration

**What to build:** Create a new `movi-player` plugin that wraps the `movi-player` npm library. The backend (`run`) validates/resolves media URLs. The frontend WC renders the `<movi-player>` element, listens for `"video.player.load"`/`"video.player.hide"`, and dispatches `"video.modal.show"`/`"video.modal.hide"`. Migrate card click handlers to dispatch `"video.player.load"` with `{url, title}`.

**Manifest:**
```json
{
  "name": "movi-player",
  "run": "bun ./main.ts",
  "methods": ["load", "hide"],
  "hooks": ["video.player"],
  "components": ["movi-player"],
  "slots": ["video.player"]
}
```

The slot `"video.player"` tells the modal this plugin fills that slot. The component `"movi-player"` is built and loaded but not auto-mounted — the modal mounts it.

**Blocked by:** 01 — libmpv cleanup, 02 — Slots infrastructure

**Status:** completed

- [x] `npm install movi-player`
- [x] Create `plugins/flux-player/plugin.json` with `components: ["flux-player"]`, `slots: ["video.player"]`, `hooks: ["video.player"]`
- [x] Create frontend WC (`flux-player.tsx`) — wraps `<movi-player>` from npm, listens for `"video.player.load"`/`"video.player.hide"`, dispatches `"video.modal.show"`/`"video.modal.hide"`
- [x] yt-video-card: `"player-load"` → `"video.player.load"`
- [x] peertube-card: `"player-load"` → `"video.player.load"`
- [x] `bun run build:plugins` succeeds — `flux-player.js` produced
- [x] Click a card → player loads in modal → close works (full chain, since modal already resolves the slot)
