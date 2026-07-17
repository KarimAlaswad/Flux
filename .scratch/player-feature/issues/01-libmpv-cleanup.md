# 01 — libmpv cleanup

**What to build:** Remove the broken libmpv dependency so the project compiles again. The Rust backend calls `tauri_plugin_libmpv::init()` but `Cargo.toml` doesn't include the dependency. Remove the call and purge all references.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Remove `.plugin(tauri_plugin_libmpv::init())` from `src-tauri/src/lib.rs`
- [ ] Verify `Cargo.toml` has no `tauri-plugin-libmpv` dependency (remove if present)
- [ ] Run `cargo check` — compilation succeeds
