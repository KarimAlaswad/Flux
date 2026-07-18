# 04 — App.tsx integration

**What to build:** Wire the player into the modal during App.tsx initialization. The player WC is created inside the modal's slot. The player tag is discovered at runtime via `resolveHook("video.player")` — no hardcoded tag name. Swap the manifest to swap players.

**Blocked by:** 02 — Modal refactor, 03 — Player plugin + card migration

**Status:** completed

- [x] App.tsx init: loads `components` tags (lines 58-67), including flux-player
- [x] Modal resolves slot internally — scans `.manifests` for `slots: ["video.player"]`, reads `components[0]`, creates WC, appends to self
- [x] Both start hidden (player not yet triggered, modal hidden by default)
- [x] Full chain: click card → `"video.player.load"` → player plays → `"video.modal.show"` → modal shows
- [x] Close → `"video.player.hide"` → player stops → `"video.modal.hide"` → modal hides
- [x] Verify swap: change manifest to a different player tag and confirm it works
