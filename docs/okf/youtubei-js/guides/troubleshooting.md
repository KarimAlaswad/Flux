---
type: Guide
title: Troubleshooting
description: Log levels and diagnostics.
resource: https://ytjs.dev/guide/troubleshooting.html
tags: [youtube, troubleshooting, logging]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-troubleshoot
    resource: https://ytjs.dev/guide/troubleshooting.html
    title: Troubleshooting Guide
---

# Changing Log Levels

```ts
import { Log } from "youtubei.js";
Log.setLevel(Log.Level.NONE); // NONE | ERROR | WARNING | INFO | DEBUG
```
