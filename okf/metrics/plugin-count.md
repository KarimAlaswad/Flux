---
type: Metric
title: "Plugin Count"
description: "Total number of plugins discovered and loaded by the system"
resource: "okf/metrics/plugin-count.md"
tags: ["metrics", "plugins", "discovery"]
generated: "2026-09-02"
sources:
  - "src-tauri/src/lib.rs"
  - "plugins/"
---

# Plugin Count

## What Agents Must Know

The system tracks how many plugins are discovered and loaded. This metric helps understand system complexity and plugin adoption.

## Definition

**Plugin Count** = Number of directories under `plugins/` containing a valid `plugin.json` manifest.

## Current State

As of 2026-09-02:

| Category  | Count | Examples                                                  |
| --------- | ----- | --------------------------------------------------------- |
| Core      | 3     | `core-manifest`, `core-serve`, `core-static`              |
| Service   | 2     | `peertube`, `youtube`                                     |
| Component | 3     | `flux-player`, `player-modal`, `feed-widget`, `feed-tabs` |
| **Total** | **8** |                                                           |

## How to Measure

```bash
# Count all plugin directories
find plugins/ -name "plugin.json" | wc -l

# Count by type (requires parsing manifests)
# Backend plugins (have "run" field)
grep -l '"run"' plugins/*/plugin.json | wc -l

# Frontend plugins (have "components" or "feeds")
grep -l '"components"\|"feeds"' plugins/*/plugin.json | wc -l
```

## Why This Matters

- **System Complexity**: More plugins = more interactions to understand
- **Discovery Performance**: Plugin scanning time scales with count
- **Documentation Coverage**: Each plugin needs documentation

## Related Metrics

- [`plugin-communication-latency.md`](./plugin-communication-latency.md) — Time for RPC round-trips
- [`build-time.md`](./build-time.md) — Time to build all plugins

## Related Files

- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
