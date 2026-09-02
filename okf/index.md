---
okf_version: "0.2"
project: Flux
description: "Open Knowledge Format bundle for the Flux AI agent context"
last_updated: "2026-09-02"
maintainer: "Flux Development Team"
---

# Flux OKF Bundle

This directory provides durable Open Knowledge Format (OKF) context for AI agents working with the Flux project. It contains structured knowledge about systems, tools, metrics, playbooks, and constraints that agents need before acting.

## Quick Navigation

| Category        | Directory                        | Purpose                                                   |
| --------------- | -------------------------------- | --------------------------------------------------------- |
| **Systems**     | [`systems/`](./systems/)         | Core architecture, plugin system, and app components      |
| **Tools**       | [`tools/`](./tools/)             | Development tools, build systems, and runtime environment |
| **Metrics**     | [`metrics/`](./metrics/)         | Success criteria and performance measurements             |
| **Playbooks**   | [`playbooks/`](./playbooks/)     | Step-by-step guides for common tasks                      |
| **Constraints** | [`constraints/`](./constraints/) | Safety rules and operational boundaries                   |
| **Workflows**   | [`workflows/`](./workflows/)     | Multi-step processes and automation                       |

## Reading Order for New Agents

1. **Start here**: [`constraints/agent-safety-rules.md`](./constraints/agent-safety-rules.md) — Mandatory rules before any action
2. **Understand the system**: [`systems/plugin-system.md`](./systems/plugin-system.md) — Core architecture
3. **Learn the tools**: [`tools/tauri-dev.md`](./tools/tauri-dev.md) — Development environment
4. **Check workflows**: [`workflows/plugin-development.md`](./workflows/plugin-development.md) — How to add/modify plugins

## Source Files

This OKF bundle was compiled from:

- [`AGENTS.md`](../AGENTS.md) — Agent behavior rules and philosophy
- [`CONTEXT.md`](../CONTEXT.md) — Domain glossary and system concepts
- [`docs/agents/`](../docs/agents/) — Agent-specific documentation
- [`docs/architecture/`](../docs/architecture/) — Architecture decisions
- [`docs/learning/domains.md`](../docs/learning/domains.md) — Design domains and resources
- [`plugins/`](../plugins/) — Plugin manifests and implementations
- [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) — Rust backend implementation
- [`scripts/build-plugins.ts`](../scripts/build-plugins.ts) — Plugin build system

## Log

Unknowns and open questions are tracked in [`log.md`](./log.md).

## Contributing

When adding new OKF files:

1. Use YAML frontmatter with required fields (`type`, `title`, `description`, `resource`, `tags`, `generated`, `sources`)
2. Add verification/lifecycle fields only when a real person or process performed the check
3. Use standard Markdown links consistently
4. Put unknowns in `log.md`
