---
okf_version: "0.2"
title: YouTubei.js Knowledge Bundle
description: Curated insights and technical metadata for the youtubei.js library.
---

# Library Overview

* [YouTubei.js Library](library.md) - Core library capabilities and architecture.
* [Ecosystem — GoogleVideo and Extensions](ecosystem.md) - Streaming protocols and extensions.

# Guides

* [Getting Started](guides/getting-started.md) - Installation, prerequisites, and session configuration.
* [Caching](guides/caching.md) - UniversalCache and session/player caching.
* [Authentication](guides/authentication.md) - Cookie and OAuth2 flows.
* [Browser Usage](guides/browser-usage.md) - Proxying and DASH streaming in browsers.
* [Proxies](guides/proxies.md) - Custom fetch / proxy implementation.
* [Advanced Usage](guides/advanced-usage.md) - Actions and Parser extension patterns.
* [Troubleshooting](guides/troubleshooting.md) - Log levels.
* [FAQ](guides/faq.md) - InnerTube, environments, and common issues.

# Core API

* [Innertube Class](core/innertube.md) - Main entrypoint and feed/search APIs.
* [Actions](core/actions.md) - Low-level endpoint executor.
* [Session](core/session.md) - Session, auth events, and transport.
* [Parser](core/parser.md) - Strongly-typed InnerTube response parsing.
* [VideoInfo & ShortFormVideoInfo](core/video-info.md) - Video metadata and shorts sequences.
* [Search and Feeds](core/search-and-feeds.md) - Search, home/subs/history, and hashtag feeds.

# Endpoints

* [Home Feed](endpoints/home-feed.md) - How the home feed is structured and parsed.
* [Shorts & Reels](endpoints/shorts.md) - Internal shorts/reels endpoints (`/reel/reel_watch_sequence`, `ReelShelf`).
