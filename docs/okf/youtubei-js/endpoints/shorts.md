---
type: API Endpoint
title: YouTube Shorts & Reels
description: Internal endpoints used for vertical short-form video content.
tags: [youtube, shorts, reels]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:50:00Z }
sources:
  - id: ytjs-src
    resource: node_modules/youtubei.js/dist/src/Innertube.js
    title: YouTubei.js Innertube Source
  - id: reel-watch-src
    resource: node_modules/youtubei.js/dist/src/parser/classes/endpoints/ReelWatchEndpoint.js
    title: ReelWatchEndpoint Source
---

# Overview

YouTube Shorts (referred to internally as "Reels") are handled through a distinct set of endpoints compared to regular videos.

# Key Endpoints

### `/reel/reel_watch_sequence`
This endpoint is used to fetch a sequence of shorts. It requires a `sequenceParams` protobuf-encoded string.
In `youtubei.js`, this is used by `getShortsVideoInfo`.

### `/browse` with Shorts params
While `youtubei.js` doesn't expose a direct `getShortsFeed()` method, the shorts tab is essentially a browse request with specific parameters.

# Data Structures

- **ReelItem**: Represents a single short in a shelf or list.
- **ReelShelf**: A horizontal or vertical shelf of shorts often found in the home feed.
- **ShortFormVideoInfo**: Metadata returned for a specific short.

# Recommended Discovery Strategy

Since a direct "personalized shorts feed" method is absent in the high-level API, the most robust way to fetch shorts is using the hashtag feed:
`yt.getHashtag("shorts")`
This returns a guaranteed list of vertical videos.
