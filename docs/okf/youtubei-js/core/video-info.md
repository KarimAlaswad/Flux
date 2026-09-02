---
type: Reference
title: VideoInfo and ShortFormVideoInfo
description: Video metadata, streaming data, and shorts reel sequences.
resource: https://ytjs.dev/api/youtubei.js/namespaces/YT/classes/VideoInfo.html
tags: [youtube, video, streaming, shorts]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:56:00Z }
sources:
  - id: innertube-api
    resource: https://ytjs.dev/api/classes/Innertube.html
    title: Innertube API — getInfo / getShortsVideoInfo
  - id: ytjs-src
    resource: node_modules/youtubei.js/dist/src/Innertube.js
    title: YouTubei.js Innertube Source
---

# VideoInfo

Returned by `innertube.getInfo(videoId)`, `getBasicInfo`, `getStreamingData`.

- Deciphered streaming formats via `Format` / `FormatUtils`.
- `toDash(urlTransform)` converts to MPEG-DASH manifest for browser playback (dash.js).
- Requires `Platform.shim.eval` for signature deciphering when `retrieve_player: true`.

# ShortFormVideoInfo

Returned by `innertube.getShortsVideoInfo(videoId)`.

Internally calls `/reel/reel_watch_sequence` with protobuf `ReelSequence { shortId, params: { number: 5 }, feature2: 25 }` plus `ReelWatchEndpoint` navigation. Used for single-short lookup, not feed listing.
