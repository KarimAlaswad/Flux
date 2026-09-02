---
type: Reference
title: Innertube Class
description: Main entrypoint for YouTube InnerTube API interactions.
resource: https://ytjs.dev/api/classes/Innertube.html
tags: [youtube, innertube, api]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: innertube-api
    resource: https://ytjs.dev/api/classes/Innertube.html
    title: Innertube API Reference
---

# Innertube

The main class providing access to YouTube services.

```ts
import { Innertube, UniversalCache } from "youtubei.js";
const innertube = await Innertube.create({ cache: new UniversalCache(true) });
```

# Accessors

- `account: AccountManager` — account information.
- `actions: Actions` — internal request dispatcher.
- `music: Music` — YouTube Music client.
- `kids: Kids` — YouTube Kids client.
- `studio: Studio` — YouTube Studio client.
- `playlist: PlaylistManager` — playlist management.
- `interact: InteractionManager` — feature interactions.
- `session: Session` — underlying session.

# Key Methods

- `call(endpoint, args)` — call a NavigationEndpoint.
- `getInfo(target)` / `getBasicInfo(video_id)` / `download(video_id)` / `getStreamingData(video_id)` — video retrieval.
- `search(query, filters)` / `getSearchSuggestions(query)` — search.
- `getChannel(id)` — channel page.
- `getHomeFeed()` / `getGuide()` / `getLibrary()` / `getHistory()` / `getSubscriptionsFeed()` — browse feeds.
- `getHashtag(hashtag)` / `getPlaylist(id)` / `getPost(post_id, channel_id)` — specialized browses.
- `getShortsVideoInfo(video_id)` — shorts reel metadata (via `/reel/reel_watch_sequence`).
- `resolveURL(url)` — resolve any YouTube URL to a NavigationEndpoint.
