---
type: Guide
title: FAQ — InnerTube, Auth, Environments
description: Frequently asked questions for YouTube.js.
resource: https://ytjs.dev/guide/faq.html
tags: [youtube, faq, innertube]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-faq
    resource: https://ytjs.dev/guide/faq.html
    title: FAQ Guide
---

# FAQ

## What is "InnerTube"?

YouTube's private API used by the official website and apps. YouTube.js wraps it. See [Gizmodo: How Project InnerTube Helped Pull YouTube Out of the Gutter](https://gizmodo.com/how-project-innertube-helped-pull-youtube-out-of-the-gu-1704946491).

## Is authentication supported?

Yes — see [Authentication](authentication.md) (cookies, YouTube TV OAuth2).

## How do I disable logging?

Via [Troubleshooting](troubleshooting.md): `Log.setLevel(Log.Level.NONE)`.

## What environments are supported?

Node.js, Deno, modern browsers, React Native.

## Why do video info requests fail in my server?

Most commonly the server IP is blocked by YouTube; no known fix.
