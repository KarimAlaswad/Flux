# 05 — Rename yt-auth hook to match plugin name

**What to build:** Rename the `yt-auth` plugin's hook from `"auth"` to `"yt-auth"` in its manifest. The auth capability is YouTube-specific (cookie-based, innertube), not a generic Flux auth system. The hook name should match the plugin name to avoid implying a generic capability exists.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Change `"hooks": ["auth"]` to `"hooks": ["yt-auth"]` in `plugins/youtube/plugins/yt-auth/plugin.json`
