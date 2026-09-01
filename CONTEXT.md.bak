# Flux Domain Glossary

## Plugin

The atomic unit of functionality in Flux. A **Plugin** is any directory under `plugins/` that contains a `plugin.json`, discovered via recursive scan. Nothing in Flux happens outside a plugin. Any functionality that could be extracted as its own plugin should be.

A plugin's identity is its **name** field (unique, used for RPC routing). Its capabilities are declared through optional manifest fields: `run`, `methods`, `hooks`, `ui`, `components`, `slots`, `feeds`. Which fields are filled determines what kind of plugin it is:

- Backend script (`run` present) — e.g. `yt-feed`, `yt-auth`, `core-manifest`
- Frontend component (`ui` or `feeds[].card`) — e.g. `feed`, `yt-feed` (card)
- Fullstack (both `run` and a frontend field) — e.g. `peertube`
- Meta-plugin (none of the above; groups sub-plugins) — e.g. `youtube`
- Core plugin (shipped with Flux) — e.g. `core-manifest`, `core-static`
- Sub-plugin (nested under another plugin's directory) — e.g. `yt-feed` under `youtube`
- Service plugin — wraps an internet service (YouTube, PeerTube, TikTok). Handles its own authentication, URL resolution, data format, and peculiarities. No shared abstraction attempts to paper over differences between services.

The meta-plugin and sub-plugin categories describe *nesting and grouping*, not a distinct capability set — they are still Plugins, just arranged in a tree.

## Manifest

The `plugin.json` file at the root of a plugin directory. A Manifest is the serialised metadata of a Plugin — it declares the plugin's identity (name) and capabilities (run, methods, hooks, ui, components, slots, feeds). The `PluginManifest` type in code is the parsed shape of this file. Not a separate domain concept; Manifest is the Plugin's self-description.

_Avoid_: Confusing the manifest with the plugin itself. The Plugin *is* the directory (its code, assets, runtime); the Manifest is just its declaration file.

## Hook

An abstract capability label that decouples *what* from *who*. A plugin declares "I provide this capability" via `hooks` in `plugin.json` (e.g. `hooks: ["feed.video", "yt.auth"]`). The Rust backend resolves it at runtime: `resolve_hook(hook)` returns the provider's name and methods; `call_hook(hook, method?, params?)` resolves and calls in one step (defaults to `methods[0]`).

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

## Media Type

A category of content defined by how users consume it, not by which service provides it. Examples: **short video** (YouTube Shorts, TikTok, Reels), **long video** (YouTube, PeerTube, Vimeo), **music** (YouTube Music, Spotify, SoundCloud), **posts** (Reddit, Twitter/X, Threads, 4chan). Content is organized by media type — each media type has one feed populated from all services the user chooses.

_Avoid_: Organizing content by service name (e.g. "YouTube section"). A single Service plugin may produce multiple media types.

## Feed Widget

A plugin that renders a unified feed for a specific Media Type. Owns the feed's state machine (loading, empty, partial, loaded, error). Aggregates items from all service plugins that produce that media type. Not a single widget — each media type may have its own feed widget plugin (e.g. shorts feed widget, long video feed widget).

## Skeleton

The minimal host that boots Flux. Everything else is a plugin. There is no specific size limit — the rule is: any functionality that could be a plugin should be. The skeleton spawns the initial set of plugins and stays out of their way.

## Framework Boundary

The principle that frontend plugins are self-contained and indestructible by framework changes. Each plugin bundle inlines its own framework (React 19, etc.). Plugins communicate via browser-native CustomEvents, not via shared framework state (React context, signals). A plugin compiled today must work on any version of the host tomorrow — the host's framework version is irrelevant to plugins.

_Avoid_: Shared framework instance across plugins, React context bridges, framework-state-based cross-component communication.

## Service

An internet service that provides content to Flux (YouTube, PeerTube, TikTok, Reddit, Spotify, etc.). Each service is wrapped by a Service plugin (or a tree of sub-plugins). The service plugin owns its authentication, data format parsing, and URL resolution. No shared abstraction attempts to bridge different services.

## Feed

A multi-source view of items aggregated from plugins that declare `feeds[]` in their manifest. Each feed contribution has:
- **method** — the RPC method to call for items (defaults to plugin's first method)
- **card** — the Web Component tag used to render each item (e.g. `"yt-video-card"`)

_Avoid_: Confusing "a feed" (the view) with "the feed" (a single plugin's data). Each plugin provides contributions *to* a feed.
