---
type: Guide
title: Advanced Usage — Extending and Parsing
description: Extending youtubei.js via Actions and parsing InnerTube responses.
resource: https://ytjs.dev/guide/advanced-usage.html
tags: [youtube, actions, parser]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-advanced
    resource: https://ytjs.dev/guide/advanced-usage.html
    title: Advanced Usage Guide
---

# Extending the Library

Use `yt.actions.execute` for arbitrary endpoints:

```ts
import { Innertube, UniversalCache } from 'youtubei.js';
const yt = await Innertube.create({ cache: new UniversalCache(true) });
const videoInfo = await yt.actions.execute('/player', { videoId, client: 'YTMUSIC', parse: true });
```

Call a `NavigationEndpoint` from parsed nodes:

```ts
import { YTNodes } from 'youtubei.js';
const page = await button.endpoint.call(yt.actions, { parse: true });
```

# Using the Parser

```ts
import { Parser, YTNodes } from 'youtubei.js';
import { readFileSync } from 'fs';
const page = Parser.parseResponse(JSON.parse(readFileSync('./artist.json', 'utf-8')));
const header = page.header?.item().as(YTNodes.MusicImmersiveHeader, YTNodes.MusicVisualHeader);
const tab = page.contents?.item().as(YTNodes.SingleColumnBrowseResults).tabs.firstOfType(YTNodes.Tab);
```

See `src/parser` for full documentation.
