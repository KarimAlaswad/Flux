---
type: API Endpoint
title: YouTube Home Feed
description: The main personalized discovery feed for YouTube.
tags: [youtube, feed, home]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:50:00Z }
sources:
  - id: ytjs-feed-mixin
    resource: node_modules/youtubei.js/dist/src/core/mixins/Feed.js
    title: YouTubei.js Feed Mixin
---

# Overview

The home feed is the primary entry point for users. It is highly polymorphic, containing videos, shelves, and "nudge" items.

# Implementation in YouTubei.js

Accessed via `yt.getHomeFeed()`. The returned object is a `HomeFeed` class that extends the `Feed` mixin.

# Content Structure

The feed is organized into `RichSection` and `RichItem` nodes.

- **RichItem**: Usually contains a `LockupView` with `content_type: VIDEO`.
- **RichSection**: Can contain a `RichShelf` (a row of videos) or a `ReelShelf` (a row of shorts).

# Usage in Flux

The `yt-feed` plugin fetches this feed and maps it to the generic `feed.video` hook. It filters for `LockupView` items where `content_type === 'VIDEO'`.
