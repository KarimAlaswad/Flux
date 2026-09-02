---
type: Constraint
title: "Modularity Rules"
description: "Rules for maintaining modularity in the Flux system"
resource: "okf/constraints/modularity-rules.md"
tags: ["constraints", "modularity", "architecture", "design"]
generated: "2026-09-02"
sources:
  - "AGENTS.md"
  - "CONTEXT.md"
  - "Philosophy.md"
---

# Modularity Rules

## What Agents Must Know

Modularity is the **core principle** of Flux. Every rule exists to preserve modularity. When in doubt, choose the more modular option.

## Core Rules

### 1. Everything is a Plugin

**Rule**: Any functionality that could be extracted as its own plugin should be.

**Why**: Smaller plugins are easier to understand, replace, and extend.

**Test**: Can this feature be developed, tested, and deployed independently? If yes, it should be a plugin.

### 2. Recursive Modularity

**Rule**: Plugins can contain sub-plugins infinitely. Instead of just Core → Plugins, we have Core → Plugins → Sub-plugins → Sub-sub-plugins → ∞.

**Why**: Prevents plugins from becoming monolithic. Keeps each piece small and replaceable.

**Example**:

```
youtube/           # Meta-plugin
├── plugin.json
└── plugins/       # Sub-plugins
    ├── yt-feed/
    ├── yt-auth/
    └── yt-comments/
```

### 3. Language Agnostic

**Rule**: Every part of the system can be written in any language (Rust, Go, Python, Bun/TS, etc.).

**Why**: Developers use what they know. No forced technology choices.

**Implementation**: IPC via subprocess stdin/stdout JSON — the simplest cross-language IPC.

### 4. Skeleton Independence

**Rule**: The plugin system is independent of the app framework. The same plugins work on any skeleton (Tauri, Electrobun, Dioxus, etc.).

**Why**: Frameworks change. Plugins shouldn't have to.

**Test**: Could this plugin run on a different host framework without changes? If no, it's too coupled.

### 5. Host Stays Dumb

**Rule**: The host only routes messages, spawns processes, and manages the window. All real logic lives in plugins.

**Why**: Adding 100+ plugins requires zero changes to routing code.

**Forbidden**: Business logic in the skeleton. The skeleton is a thin orchestrator, not an application.

### 6. Framework Boundary

**Rule**: Plugins are indestructible by framework changes. Each plugin bundles its own framework. Plugins communicate via browser-native CustomEvents, not shared framework state.

**Why**: A plugin compiled today must work on any version of the host tomorrow.

**Test**: Can this plugin work if the host upgrades from React 18 to React 19? If no, it's too coupled.

## Plugin Author Contract

### MUST

- Use `var(--token-name, fallback)` for all visual CSS properties
- Provide sensible fallbacks so the component works without any theme
- Never hardcode design values (no `#2563EB`, no `16px`)
- Document which tokens it consumes
- Declare capabilities via `hooks` in `plugin.json`
- Keep payloads opaque (system never defines message content)

### MUST NOT

- Share framework state across plugins (React context, signals)
- Call other plugins directly (go through skeleton)
- Hardcode plugin names in routing logic
- Depend on other plugins' internal implementations
- Assume specific wire formats (plugins declare protocol in manifest)

### SHOULD

- Keep plugins small and focused
- Use hooks for capability resolution
- Declare unknown fields in manifests (system ignores them)
- Use stable IDs, never folder names, for identity

## Decision Framework

When evaluating a change, ask:

1. **Does this increase modularity?** → Good
2. **Does this decrease modularity?** → Reconsider
3. **Does this create coupling?** → Avoid
4. **Does this preserve language agnosticism?** → Required
5. **Does this work on any skeleton?** → Required

## Related Files

- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
- [`systems/skeleton.md`](../systems/skeleton.md) — The minimal host
- [`constraints/protocol-rules.md`](./protocol-rules.md) — IPC protocol constraints
