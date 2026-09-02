---
type: Reference
title: YouTubei.js Library
description: A full-featured wrapper for YouTube's internal API (InnerTube).
resource: https://ytjs.dev/
tags: [youtube, api, library]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:50:00Z }
sources:
  - id: official-docs
    resource: https://ytjs.dev/
    title: YouTubei.js Documentation
  - id: source-code
    resource: https://github.com/LuanRT/YouTube.js
    title: YouTubei.js Source Code
---

# Overview

YouTubei.js is a client-side wrapper for YouTube's internal "InnerTube" API. Unlike the official Data API v3, it provides access to features used by the official YouTube web and mobile clients, including home feeds, shorts, and music.

# Architecture

The library is built around several core modules:
- **Actions**: Handles raw endpoint execution (`actions.execute`).
- **Parser**: Dynamically parses InnerTube's polymorphic JSON responses into typed `YTNode` objects.
- **Session**: Manages authentication (cookies/OAuth) and request signing.

# Authentication

It supports authentication via cookies, which is required for personalized feeds and certain restricted content.
In this project, cookies are managed via a `.youtube-cookie` file.
