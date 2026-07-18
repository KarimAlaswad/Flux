# Clean up legacy fields and standardise plugin packaging

Status: needs-info

## Problem Statement

The codebase has stale prototype artifacts that no longer serve a purpose. Three fields (`FeedContrib.type`, `PluginManifest.components`, `PluginInfo.alive`) exist in the type system but are unused or superseded. The `yt-auth` hook is named `"auth"` — too generic for a YouTube-specific capability. The `yt-card` plugin is a separate directory from `yt-feed` despite existing only to render that feed's items, adding unnecessary indirection. `AGENTS.md` still documents the old patterns, which confuses future agents about the canonical approach.

## Solution

Remove the dead fields from the shared TypeScript types. Move the `yt-video-card` source into the `yt-feed` plugin directory and delete the `yt-card` directory. Update `AGENTS.md` to reflect the current canonical approach (feeds + hooks, not components).

## User Stories

1. As a developer, I want the type system to only contain fields that are actually used, so I don't waste time wondering what a field is for.
2. As a developer, I want the file tree to reflect the actual dependency between plugins (yt-card belongs with yt-feed), so the directory structure is self-documenting.
3. As an AI agent reading AGENTS.md, I want the documentation to match the actual architecture, so I don't follow deprecated patterns.

## Implementation Decisions

### Remove `FeedContrib.type`

The `type` field on `FeedContrib` (e.g. `"video"`, `"post"`, `"image"`) was added without a clear purpose — it's declared but never read by any code. The feed widget ignores it and merges all sources into a single stream. Remove it from the interface in `src/shared/types.ts`. No `plugin.json` manifests reference it.

### Remove `PluginManifest.components`

The `components` field was the prototype pattern for declaring buildable Web Components. It's superseded by:
- `ui` — for main-UI components that get auto-mounted
- `feeds[].card` — for feed-item renderers that get built and loaded by the feed widget

Remove it from `PluginManifest` and from the build script's tag-collection logic. The `yt-video-card` tag is already collected via `yt-feed`'s `feeds[].card`.

### Remove `PluginInfo.alive`

The `PluginInfo` interface has an `alive: boolean` field that is declared but never read by any code. The whole interface appears unused. Remove the `alive` field from the interface definition. The rest of the interface (`name`, `methods`) is kept for now — it has a sensible shape even if not currently consumed.

### Move `yt-card` into `yt-feed`

The `yt-video-card.tsx` source currently lives under `plugins/youtube/plugins/yt-card/`. It's only referenced by `yt-feed`'s `feeds[].card` field. Move the file into `plugins/youtube/plugins/yt-feed/` and delete the `yt-card/` directory. The build script will find the source via `yt-feed`'s manifest as before.

### Rename `yt-auth` hook to `yt-auth`

The `yt-auth` plugin declares `hooks: ["auth"]` but the auth is YouTube-specific, not a generic Flux capability. Rename the hook to `"yt-auth"` in `yt-auth/plugin.json` to match the plugin name and avoid implying a generic auth system exists.

### Update AGENTS.md

Remove or update:
- The `components` row in the Manifest Fields table
- The `yt-card` row in the Current Manifests table
- The "Frontend-only (card)" plugin type description
- The build pipeline references to `components[]`
- The App.tsx init flow reference to `components`

## Testing Decisions

There are no existing unit tests for the type system, build pipeline, or feed widget. The only validation is a smoke test: `bun run build:plugins` must succeed and produce `build/plugins/yt-video-card.js`.

No new tests are added in this spec — the work is purely removal and restructuring.

## Out of Scope

- Refactoring the feed widget to use `call_hook` instead of `__pluginRpc` (that's a separate feature)
- Adding a test framework or writing tests for existing code
- Renaming any remaining fields or types
- Removing type definitions that haven't been discussed in this spec

## Further Notes

None.
