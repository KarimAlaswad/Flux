# 02 — Modal refactor

**What to build:** Rewrite `player-modal` to be a pure overlay shell with a `<slot>` for the player element. Remove URL/title state — the modal doesn't manage media metadata. Migrate events to the new naming convention. The feed widget's modal-show/hide listeners use the same events.

Event mappings:
- `"modal-load"` → `"video.modal.show"`
- `"modal-close"` → `"video.modal.hide"`
- Close button dispatches `"video.player.hide"`

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] player-modal: remove title/URL state, add `<slot>`
- [ ] player-modal: listen for `"video.modal.show"`/`"video.modal.hide"`
- [ ] player-modal: close button dispatches `"video.player.hide"` instead of `"modal-close"`
- [ ] feed-widget: migrate `"modal-load"` → `"video.modal.show"` and `"modal-close"` → `"video.modal.hide"`
- [ ] Verify: dispatching `"video.modal.show"` shows the modal, close dispatches `"video.player.hide"`
