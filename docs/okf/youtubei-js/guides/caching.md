---
type: Guide
title: Caching in YouTube.js
description: Caching player and session data with UniversalCache.
resource: https://ytjs.dev/guide/caching.html
tags: [youtube, caching, performance]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-cache
    resource: https://ytjs.dev/guide/caching.html
    title: Caching Guide
---

# UniversalCache

Stores transformed player/session data. Uses `node:fs`, `Deno.writeFile`, or `indexedDB` depending on runtime. Temp dir by default.

```ts
import { Innertube, UniversalCache } from 'youtubei.js';
const innertube = await Innertube.create({ cache: new UniversalCache(false) }); // non-persistent
const innertube2 = await Innertube.create({ cache: new UniversalCache(true, './.cache') }); // persistent
```
