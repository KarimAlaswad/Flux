---
type: Reference
title: Search and Feed Mixins
description: Search results, home/subscriptions/history/library, and hashtag feeds.
resource: https://ytjs.dev/api/classes/Innertube.html
tags: [youtube, search, feeds]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:56:00Z }
sources:
  - id: innertube-api
    resource: https://ytjs.dev/api/classes/Innertube.html
    title: Innertube API — search / feeds
  - id: feed-mixin
    resource: node_modules/youtubei.js/dist/src/core/mixins/Feed.js
    title: Feed Mixin Source
---

# Search

```ts
const results = await innertube.search("query", {
  type: "video",
  duration: "short",
  upload_date: "today",
});
const suggestions = await innertube.getSearchSuggestions("query");
```

# Feeds

- `getHomeFeed()` → `HomeFeed` (RichItem / RichShelf / ReelShelf)
- `getSubscriptionsFeed()` / `getChannelsFeed()` / `getCourses()` / `getPlaylists()` → `Feed<IBrowseResponse>`
- `getHistory()` → `History`
- `getLibrary()` / `getGuide()` → `Library` / `Guide`

# Hashtag

```ts
const feed = await innertube.getHashtag("shorts");
const videos = feed.videos; // ObservedArray<Video | ShortsLockupView | ...>
```

Hashtag feed is the most reliable shorts listing in current `youtubei.js` without a dedicated shorts feed endpoint.
