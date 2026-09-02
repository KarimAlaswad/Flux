---
type: Tool
title: "YouTube.js (youtubei.js) — InnerTube Client"
description: "JavaScript client for YouTube's InnerTube internal API used by Flux youtube plugins"
resource: "https://ytjs.dev/"
tags: ["youtube", "innertube", "youtubei.js", "ytjs", "video"]
generated: "2026-09-02"
sources:
  - "https://ytjs.dev/"
  - "https://ytjs.dev/guide/"
  - "https://ytjs.dev/api/"
  - "https://github.com/LuanRT/YouTube.js"
  - "package.json"
  - "plugins/youtube/"
---

# YouTube.js (youtubei.js) — InnerTube Client

## What agent must know

**YouTube.js** (`youtubei.js` on npm, docs at [ytjs.dev](https://ytjs.dev/)) is the JS client for YouTube's **InnerTube** internal API — the same API the YouTube web client uses. No API key or quota required. Runtime agnostic (Node.js, Deno, modern browsers).

**Core facts for Flux:**

- **Installed version:** `youtubei.js@^17.2.0` in [`package.json`](../../package.json) (upstream latest is v18 — check CHANGELOG before bumping).
- **Entry point:** `import { Innertube } from 'youtubei.js'; const yt = await Innertube.create(/* options */);` — see [Guide](https://ytjs.dev/guide/getting-started.html).
- **Key surfaces:** `Innertube`, `Session`, `Actions`, `Parser`, `YTNodes`, `Continuation` / `Innertube.getHashtag`, `IPlayerResponse` etc — full reference at [API docs](https://ytjs.dev/api/).
- **Flux usage:** `plugins/youtube/` is the meta-plugin; sub-plugins `yt-feed`, `yt-search`, `yt-auth` under [`plugins/youtube/plugins/`](../../plugins/youtube/plugins/) wrap InnerTube calls via the plugin IPC (`run: "bun ./main.ts"`, `hooks: ["feed.video"]` pattern). See [`systems/plugin-system.md`](../systems/plugin-system.md).
- **Docs map:** [Getting Started](https://ytjs.dev/guide/getting-started.html) → [Browser Usage](https://ytjs.dev/guide/browser-usage.html) → [Caching](https://ytjs.dev/guide/caching.html) / [Proxies](https://ytjs.dev/guide/proxies.html) / [Authentication](https://ytjs.dev/guide/authentication.html) → [Advanced Usage](https://ytjs.dev/guide/advanced-usage.html). GitHub: [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js).

Do not paste large sections of the upstream docs into the repo — link to the URLs above and summarize.

## Allowed / risky actions

- **Allowed:** Use `Innertube.create`, `yt.getInfo`, `yt.search`, `yt.getHashtag` etc inside `plugins/youtube/plugins/<name>/main.ts`; handle via stdin/stdout JSON per [`systems/plugin-system.md`](../systems/plugin-system.md). Read [Troubleshooting](https://ytjs.dev/guide/troubleshooting.html) and [FAQ](https://ytjs.dev/guide/faq.html) when diagnosing InnerTube errors.
- **Risky:** Upgrading `youtubei.js` major versions without reading [CHANGELOG](https://github.com/LuanRT/YouTube.js/blob/main/CHANGELOG.md) (breaking parser/nodes changes); inventing `ClientType` or `IPlayerResponse` fields — verify against [API](https://ytjs.dev/api/) first.
- **Never:** Commit API keys, cookies (`.youtube-cookie`), or user tokens. The library is unaffiliated with YouTube/Google — see Disclaimer on [ytjs.dev](https://ytjs.dev/).

## Read next

- [ytjs.dev Guide](https://ytjs.dev/guide/) and [API Reference](https://ytjs.dev/api/)
- [GitHub — LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js)
- OKF: [`systems/plugin-system.md`](../systems/plugin-system.md), [`playbooks/add-service-plugin.md`](../playbooks/add-service-plugin.md), [`workflows/plugin-development.md`](../workflows/plugin-development.md)
- `okf/log.md` for open unknowns about InnerTube auth/proxy decisions
