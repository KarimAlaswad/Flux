---
type: Guide
title: Getting Started with YouTube.js
description: Installation, prerequisites, and session configuration for youtubei.js.
resource: https://ytjs.dev/guide/getting-started.html
tags: [youtube, setup, innertube]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-start
    resource: https://ytjs.dev/guide/getting-started.html
    title: Getting Started Guide
---

# Prerequisites

Requires `fetch`, `EventTarget`, and `CustomEvent`. On Node 16.8+ uses undici's fetch. Needs a JS interpreter shim for deciphering.

# Installation

```
npm install youtubei.js@latest
```

# Basic Usage

```ts
import { Innertube } from "youtubei.js";
const innertube = await Innertube.create(/* options */);
```

# Configuration Options

- `lang` / `location` / `timezone` / `visitor_data` — regional & tailoring.
- `cookie` — authenticated sessions.
- `cache: new UniversalCache(...)` — persistent or in-memory.
- `retrieve_player` — whether to fetch JS player for deciphering.
- `client_type` (`WEB`, `ANDROID`) and `device_category`.

# Custom JS Interpreter

```ts
import { Innertube, Platform, Types } from "youtubei.js/web";
Platform.shim.eval = async (data: Types.BuildScriptResult) =>
  new Function(data.output)();
```
