# Flux Domain Glossary

## Plugin

The atomic unit of functionality in Flux. A **Plugin** is any directory under `plugins/` that contains a `plugin.json`, discovered via recursive scan. Nothing in Flux happens outside a plugin.

A plugin's identity is its **name** field (unique, used for RPC routing). Its capabilities are declared through optional manifest fields: `run`, `methods`, `hooks`, `ui`, `components`, `slots`, `feeds`. Which fields are filled determines what kind of plugin it is:

- Backend script (`run` present) — e.g. `yt-feed`, `yt-auth`, `core-manifest`
- Frontend component (`ui` or `feeds[].card`) — e.g. `feed`, `yt-feed` (card)
- Fullstack (both `run` and a frontend field) — e.g. `peertube`
- Meta-plugin (none of the above; groups sub-plugins) — e.g. `youtube`
- Core plugin (shipped with Flux) — e.g. `core-manifest`, `core-static`
- Sub-plugin (nested under another plugin's directory) — e.g. `yt-feed` under `youtube`

The meta-plugin and sub-plugin categories describe *nesting and grouping*, not a distinct capability set — they are still Plugins, just arranged in a tree.

## Manifest

The `plugin.json` file at the root of a plugin directory. A Manifest is the serialised metadata of a Plugin — it declares the plugin's identity (name) and capabilities (run, methods, hooks, ui, components, slots, feeds). The `PluginManifest` type in code is the parsed shape of this file. Not a separate domain concept; Manifest is the Plugin's self-description.

_Avoid_: Confusing the manifest with the plugin itself. The Plugin *is* the directory (its code, assets, runtime); the Manifest is just its declaration file.

## Hook

An abstract capability label that decouples *what* from *who*. A plugin declares "I provide this capability" via `hooks` in `plugin.json` (e.g. `hooks: ["feed.video", "yt-auth"]`). The Rust backend resolves it at runtime: `resolve_hook(hook)` returns the provider's name and methods; `call_hook(hook, method?, params?)` resolves and calls in one step (defaults to `methods[0]`).

A hook name defines an implicit contract — providers and consumers agree by convention on what methods the hook supports. Multiple plugins can declare the same hook; the first match wins at runtime. In the future this will be made explicit: some hooks will allow only one provider, others will allow multiple.

Hooks are the canonical capability-resolution path. The older pattern of calling `__pluginRpc` with an explicit plugin name (used by the feed widget) is a legacy prototype approach that will be refactored to use hooks.

_Avoid_: Direct RPC calls with hardcoded plugin names

CustomEvent names follow the hook-method convention: `"<hook>.<method>"` (e.g. `"video.player.load"`, `"video.modal.show"`). This keeps event names and hook resolution consistent — anyone reading the event name knows which hook+method it maps to.

## Component

A WC tag that is built and script-loaded but not auto-mounted. Declared via `components[]` in `plugin.json`. The consumer (e.g. a modal that accepts a slot) creates the WC element imperatively and mounts it. Unlike `ui` (which App.tsx auto-mounts), Components are created by slot resolution at runtime.

## Slot

A named placeholder that a plugin fills in another plugin's DOM. Declared via `slots[]` in `plugin.json`. Resolved at runtime: the container plugin scans `.manifests` for a plugin whose `slots` includes a matching name, reads its `components[0]` tag, creates the WC element, and appends it to itself. Slots are to frontend DOM what Hooks are to backend capability.

_Avoid_: Hardcoding a player tag name in the modal. The slot resolves it.

## Player

A plugin that plays media content. Declares `hooks: ["video.player"]` with methods `["load", "hide"]`. The backend (`run`) resolves or validates the media URL. The frontend WC renders video inside a modal's slot.

_Avoid_: Video player, audio player — just Player.

## Modal

A plugin that wraps content in an overlay shell. Declares `hooks: ["video.modal"]` with methods `["show", "hide"]`. Frontend-only (`ui`). Contains a `<slot>` for the player element; does not manage any media state itself.

_Avoid_: Overlay, wrapper, dialog

## Feed

A multi-source view of items aggregated from plugins that declare `feeds[]` in their manifest. Each feed contribution has:
- **method** — the RPC method to call for items (defaults to plugin's first method)
- **card** — the Web Component tag used to render each item (e.g. `"yt-video-card"`)

_Avoid_: Feed, feed — the domain term is "a feed" (the view), not "the feed" (a single plugin's data). Each plugin provides contributions *to* a feed.
