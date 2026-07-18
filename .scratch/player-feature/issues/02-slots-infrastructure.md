# 02 — Slots infrastructure

**What to build:** Add the `slots` manifest field to the type system so plugins can declare which slots they fill. Components that are built but not auto-mounted are declared via `components[]`. The build script already collects `components` tags. This is the prefactor that enables slot-based DOM composition.

**Manifest shape:**
```json
{
  "name": "movi-player",
  "components": ["movi-player"],        // built + loaded, not auto-mounted
  "slots": ["video.player"]              // which slots this plugin fills
}
```

**Glossary update:** Add entries for **Slot** and **Component** to CONTEXT.md.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] Add `slots?: string[]` to `PluginManifest` in `src/shared/types.ts` (at `types.ts:23`)
- [x] Add `slots: Option<Vec<String>>` to `PluginManifest` in `src-tauri/src/lib.rs` (at `lib.rs:37`)
- [x] Verify `components` is already in both types + build script (it is — kept from prototype)
- [x] Add **Slot** entry to `CONTEXT.md` — a named placeholder that a plugin fills. Declared via `slots[]`. Resolved at runtime: a plugin with a slot scans manifests for a provider, reads its `components[0]` tag, creates the WC, and appends it to itself.
- [x] Add **Component** entry to `CONTEXT.md` — a WC tag that is built and script-loaded but not auto-mounted. Declared via `components[]`. Consumed by another plugin's slot resolution.
- [x] Add `slots` to the Manifest Fields table in `AGENTS.md`
- [x] Add `components` to the tag collection check in `scripts/build-plugins.ts` (already present — verify)
