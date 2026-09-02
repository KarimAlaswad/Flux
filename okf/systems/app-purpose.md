---
type: System
title: "Flux App Purpose"
description: "The unified API client that replaces separate apps for every internet service"
resource: "okf/systems/app-purpose.md"
tags: ["app", "purpose", "unified-client", "media-types"]
generated: "2026-09-02"
sources:
  - "AGENTS.md"
  - "CONTEXT.md"
  - "Philosophy.md"
---

# Flux App Purpose

## What Agents Must Know

Flux is a **unified API client** — a single cross-platform app where every internet service is a plugin. It replaces having separate apps for YouTube, Discord, Twitter, Instagram, Telegram, Reddit, TikTok, etc.

## Core Problem

Websites expose users to malicious code:

- Viruses, adware, spyware
- Dark patterns, addictive layouts
- Popups, trackers, browser vulnerabilities

**Flux's approach**: Start with what the user needs from the server, not what the server pushes.

## Key Principles

### 1. One App for Every API

Every internet service becomes a plugin. No more separate clients for each service.

### 2. Content Organized by Media Type

Content is organized by **how users consume it**, not by which service provides it:

| Media Type  | Services                           |
| ----------- | ---------------------------------- |
| Short Video | TikTok, Reels, YT Shorts           |
| Long Video  | YouTube, PeerTube, Vimeo           |
| Music       | YouTube Music, Spotify, SoundCloud |
| Posts       | Reddit, Twitter/X, Threads         |
| DMs/Chat    | Discord, Telegram, WhatsApp        |
| Images      | Instagram, Pinterest, Imgur        |

### 3. Global Features

Features attach to the **media type**, not the service:

- Auto-scroll for shorts → all shorts get it (TikTok + Reels + YT Shorts)
- Download → all images
- Translation → all posts
- Same full-featured video player for all video types

**Community builds features once, they work for every service with that media type.**

### 4. Built Gradually

Start with one simple API plugin at a time. When multiple plugins produce the same media type, build a unified feed, then generalized features.

**Architecture evolves organically as patterns emerge (no premature abstraction).**

## Design Philosophy

### Priority Order

1. **Correctness/Safety** — The app must work correctly and safely
2. **Developer Experience** — Easy to contribute and extend
3. **Performance** — Important but not at the expense of the first two

### Modularity Over Everything

"I don't want to sacrifice modularity, DX, UX for anything."

Performance is explicitly deprioritized for now. Core plugins will ship as fast compiled languages (Rust, Go, Zig) in production. JS is fine for prototyping and ease of future modularity.

## Allowed Actions

- **Read**: App documentation, philosophy, purpose statements
- **Explain**: Why Flux exists, what problems it solves
- **Suggest**: New media types, service plugins, feature ideas

## Risky Actions

- **Add**: Features that break modularity or add framework coupling
- **Simplify**: In ways that reduce extensibility
- **Decide**: Media type categorization without community input

## Related Files

- [`systems/plugin-system.md`](./plugin-system.md) — How services become plugins
- [`systems/media-types.md`](./media-types.md) — Media type definitions
- [`constraints/modularity-rules.md`](../constraints/modularity-rules.md) — Rules for maintaining modularity
