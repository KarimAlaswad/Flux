---
type: Log
title: "Flux OKF Unknowns Log"
description: "Tracks open questions, uncertainties, and areas needing clarification for AI agent context"
resource: "okf/log.md"
tags: ["log", "unknowns", "open-questions"]
generated: "2026-09-02"
---

# Flux OKF Unknowns Log

This log tracks open questions, uncertainties, and areas needing clarification for AI agents working with the Flux project.

## Format

Each entry should include:

- **Date**: When the unknown was identified
- **Category**: System/Tool/Metric/Constraint/Workflow
- **Question**: What needs clarification
- **Context**: Why this is important for agents
- **Status**: Open / In Progress / Resolved
- **Resolution**: When resolved, what the answer is

---

## Open Questions

### 2026-09-02 — System

**Question**: What is the exact IPC protocol specification for plugin communication?

**Context**: The system uses subprocess stdin/stdout JSON for plugin communication, but the exact message format and error handling patterns need formal documentation.

**Status**: Open

**Notes**: Current implementation in `src-tauri/src/lib.rs` shows JSON-RPC-like messages with `id`, `method`, `params`, `result`, `error` fields.

---

### 2026-09-02 — System

**Question**: How are plugin manifests validated at runtime?

**Context**: The `PluginManifest` type exists in both TypeScript and Rust, but validation logic and error handling for malformed manifests needs documentation.

**Status**: Open

**Notes**: Manifest discovery happens in `discover_plugins()` in Rust, but validation beyond JSON parsing is unclear.

---

### 2026-09-02 — Tool

**Question**: What is the exact build pipeline for plugins with different frameworks?

**Context**: The `build-plugins.ts` script supports React, Vue, Svelte, and Preact, but the exact bundling process and output format needs clarification.

**Status**: Open

**Notes**: Script shows framework detection and Vite-based bundling, but output structure and naming conventions need documentation.

---

### 2026-09-02 — Constraint

**Question**: What are the exact safety boundaries for agent code modifications?

**Context**: AGENTS.md states agents should not modify code files directly, but the exact boundary between "suggestion" and "modification" needs clarification.

**Status**: Open

**Notes**: Current rule: agents propose, user applies. Exception: Markdown files are editable by agents.

---

### 2026-09-02 — Workflow

**Question**: How should agents handle plugin conflicts or dependency issues?

**Context**: The plugin system allows multiple plugins to declare the same hook, but conflict resolution and dependency management needs documentation.

**Status**: Open

**Notes**: Current implementation: "first match wins at runtime" for hooks. No formal dependency resolution.

---

## Resolved Questions

_(None yet)_

---

## Maintenance Notes

- Review this log weekly
- Close entries when questions are answered
- Archive resolved entries to `log-archive/YYYY-MM.md`
