# 03 — Modal refactor

**What to build:** Rewrite `player-modal` to be a pure slot wrapper. During `connectedCallback`, it scans `.manifests` for a plugin whose `slots` array includes `"video.player"`, reads its `components[0]` for the WC tag, creates that element, and appends it to itself. Remove URL/title state. Migrate events to the new naming convention.

**Slot resolution logic (inside the modal's connectedCallback):**
```
1. Scan .manifests for a plugin whose slots includes "video.player"
2. Read its components[0] to get the WC tag (e.g. "movi-player")
3. customElements.whenDefined(tag)
4. const el = document.createElement(tag)
5. this.appendChild(el)
```

**Event migrations:**
- `"modal-load"` → `"video.modal.show"` (modal listens, shows itself)
- `"modal-close"` → `"video.modal.hide"` (modal listens, hides itself)
- Close button dispatches `"video.player.hide"` (instead of old `"modal-close"`)
- feed-widget: `"modal-load"`/`"modal-close"` → `"video.modal.show"`/`"video.modal.hide"`

**Blocked by:** 02 — Slots infrastructure

**Status:** ready-for-agent

- [ ] player-modal: remove title/URL state
- [ ] player-modal: scan `.manifests` for `"video.player"` slot provider in `connectedCallback`
- [ ] player-modal: create provider's WC element, append to self
- [ ] player-modal: listen for `"video.modal.show"`/`"video.modal.hide"`
- [ ] player-modal: close button dispatches `"video.player.hide"`
- [ ] feed-widget: migrate `"modal-load"` → `"video.modal.show"` and `"modal-close"` → `"video.modal.hide"`
- [ ] Verify: dispatching `"video.modal.show"` shows the modal, close dispatches `"video.player.hide"`
