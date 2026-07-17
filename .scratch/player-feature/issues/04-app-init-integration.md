# 04 — App.tsx integration

**What to build:** Wire the player into the modal during App.tsx initialization. The player WC is created inside the modal's slot. The player tag is discovered at runtime via `resolveHook("video.player")` — no hardcoded tag name. Swap the manifest to swap players.

**Blocked by:** 02 — Modal refactor, 03 — Player plugin + card migration

**Status:** ready-for-agent

- [ ] App.tsx init: after creating `<player-modal>`, resolve player tag via `resolveHook("video.player")`
- [ ] Create player WC element, append it inside the modal's slot
- [ ] Both start hidden (player has `style="display:none"`, modal already hidden)
- [ ] Full chain: click card → `"video.player.load"` → player plays → `"video.modal.show"` → modal shows
- [ ] Close → `"video.player.hide"` → player stops → `"video.modal.hide"` → modal hides
- [ ] Verify swap: change manifest to a different player tag and confirm it works
