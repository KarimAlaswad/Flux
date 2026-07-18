# 02 — Modal refactor

**What to build:** Rewrite `player-modal` to be a pure overlay shell with a `<slot>` for the player element. Remove URL/title state — the modal doesn't manage media metadata. Migrate events to the new naming convention. The feed widget's modal-show/hide listeners use the same events.

Event mappings:
- `"modal-load"` → `"video.modal.show"`
- `"modal-close"` → `"video.modal.hide"`
- Close button dispatches `"video.player.hide"`

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] player-modal: remove title/URL state, add `<slot>` (div ref as slot container at `player-modal.tsx:5`)
- [x] player-modal: listen for `"video.modal.show"`/`"video.modal.hide"` (at `player-modal.tsx:11-12`)
- [x] player-modal: close button dispatches `"video.player.hide"` instead of `"modal-close"` (at `player-modal.tsx:20`)
- [x] feed-widget: migrate `"modal-load"` → `"video.modal.show"` and `"modal-close"` → `"video.modal.hide"` (at `feed-widget.tsx:47-48`)
- [x] Verify: dispatching `"video.modal.show"` shows the modal, close dispatches `"video.player.hide"`
