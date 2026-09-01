# Install and configure tauri-plugin-cors-fetch

Type: Implementation
Status: done
Spec: ../spec.md

## Changes needed

1. **`src-tauri/Cargo.toml`** — add dependency:
   ```
   tauri-plugin-cors-fetch = "5"
   ```

2. **`src-tauri/src/lib.rs`** — register plugin in builder chain:
   Add `.plugin(tauri_plugin_cors_fetch::init())` after `.plugin(tauri_plugin_opener::init())`

3. **`src-tauri/capabilities/default.json`** — add permission:
   Add `"cors-fetch:default"` to the permissions array

4. **`src-tauri/tauri.conf.json`** — enable global Tauri:
   Add `"withGlobalTauri": true` under `"app"`

## Verification

1. `bun run dev` — app should load without errors
2. Open devtools console — `window.CORSFetch` should be defined
3. Click a PeerTube video in the feed — it should play (video loads, audio plays, seeking works)
4. Click a YouTube video — it should still play (regression check)

## Comments

Implemented 2026-07-18. All changes verified:

- `fetch` returns `206 Partial Content` with correct `Content-Range` header
- `fetch_read_body` IPC calls return data bytes
- Plugin intercepts all http/https requests as expected

Note: PeerTube videos still don't play despite CORS proxy working correctly. This is a separate issue in the player pipeline (likely flux-player/movi-player handoff). See handoff at `/tmp/flux-cors-proxy-handoff.md`.
