---
type: Guide
title: Browser Usage
description: Using youtubei.js in browsers via proxy and DASH streaming.
resource: https://ytjs.dev/guide/browser-usage.html
tags: [youtube, browser, streaming, dash]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-browser
    resource: https://ytjs.dev/guide/browser-usage.html
    title: Browser Usage Guide
---

# Browser Usage

Browser usage requires proxying InnerTube requests through your own server.

```ts
import { Innertube } from 'youtubei.js/web';
await Innertube.create({
  fetch: async (input, init) => {
    // forward to proxy, return Response
    return fetch(input, init);
  }
});
```

Proxy example: `examples/browser/proxy/deno.ts`.

# Streaming

Convert `VideoInfo` to MPEG-DASH manifest and play with dash.js:

```ts
import dashjs from 'dashjs';
const videoInfo = await innertube.getInfo('videoId', { client: 'TV' });
const manifest = await videoInfo.toDash(url => url);
const uri = "data:application/dash+xml;charset=utf-8;base64," + btoa(manifest);
const player = dashjs.MediaPlayer().create();
player.initialize(document.getElementById('video_player'), uri, true);
```

Up-to-date examples: [kira](https://github.com/LuanRT/kira), [sabr-shaka-example](https://github.com/LuanRT/googlevideo/tree/main/examples/sabr-shaka-example).
