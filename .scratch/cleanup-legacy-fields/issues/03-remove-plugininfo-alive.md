# 03 — Remove dead `PluginInfo.alive` field

**What to build:** Remove the unused `alive: boolean` field from the `PluginInfo` interface. The field was declared but never read by any code.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Remove `alive` field from `PluginInfo` in `src/shared/types.ts`
