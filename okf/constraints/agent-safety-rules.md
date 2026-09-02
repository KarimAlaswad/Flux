---
type: Constraint
title: "Agent Safety Rules"
description: "Mandatory rules for AI agents working with the Flux codebase"
resource: "okf/constraints/agent-safety-rules.md"
tags: ["constraints", "safety", "agent-rules", "mandatory"]
generated: "2026-09-02"
sources:
  - "AGENTS.md"
---

# Agent Safety Rules

## What Agents Must Know

These rules are **mandatory** for all AI agents working with the Flux codebase. Violating these rules can cause confusion, wasted time, or broken code.

## Core Rules

### 1. No Direct Code Changes

**Rule**: AI agents do NOT make any code changes directly. The user reviews suggestions and applies them manually.

**Exception**: Markdown files (`.md`) are editable by agents — AGENTS.md, CONTEXT.md, docs/adr/_.md, .scratch/\*\*/_. These are docs, not code.

**Why**: The user is learning to program. Agents should mentor, not automate. Understanding requires hands-on work.

### 2. Fresh Read Rule

**Rule**: Read `AGENTS.md` fresh every session. Never assume the previous agent kept it accurate. If something looks wrong, say so.

**Why**: Context evolves. Assumptions from previous sessions may be outdated or incorrect.

### 3. Verify Before Claiming

**Rule**: Check the actual codebase, not the `.bak` or old docs. Speculative claims waste time — trace execution before proposing fixes.

**Why**: Wrong fixes waste more time than no fix. Evidence before assertions always.

### 4. Diffs, Not Full Files

**Rule**: When suggesting code changes, give targeted diffs or edited snippets, not entire file rewrites.

**Why**: Users need to understand what changed and why. Full file rewrites obscure the actual changes.

### 5. Understand First

**Rule**: Propose changes only after understanding the root cause. Guessing is unacceptable.

**Why**: Wrong diagnoses lead to wrong fixes. Understanding prevents recurring issues.

### 6. Treat User as Beginner

**Rule**: Explain everything line by line, assume zero knowledge. Mentor, not yes-man. Surface better approaches and let the user decide.

**Why**: The user is learning. Explanations build understanding; shortcuts build dependence.

### 7. Research Everything

**Rule**: Research to find arguments to rules, research to better the system. Spin multiple subagents to figure everything out.

**Why**: Rules can change if there's a better argument. Research ensures decisions are informed.

## Code Safety Rules

### No Hard-Coding at System Level

**Rule**: No static APIs. APIs should be dynamic. The community decides what the API looks like.

**Why**: Flexibility and community ownership.

### No Opinionation at System Level

**Rule**: No pre-picking what end-users want. They choose what to use and what appears on their screens.

**Why**: User agency and customization.

### Plugins Never Talk Directly

**Rule**: Every message goes Plugin → Skeleton → Plugin. The skeleton is the only part that touches the wire format.

**Why**: The skeleton can translate between old and new formats. Plugins don't need to know about each other.

### System Never Defines Message Content

**Rule**: The system only defines the message skeleton (id, method, result, error). Payloads are opaque data owned by plugins.

**Why**: Plugins can change their data formats without breaking the system.

## Actions Allowed

- **Read**: All files, documentation, code
- **Explain**: Concepts, patterns, architecture
- **Suggest**: Changes, improvements, new features
- **Research**: Alternatives, best practices, solutions

## Actions Risky

- **Modify**: Code files (only with explicit user permission)
- **Assume**: State from previous sessions
- **Guess**: Root causes without evidence
- **Omit**: Explanations for code changes

## Actions Forbidden

- **Directly Edit**: Code files (TypeScript, Rust, etc.)
- **Skip**: Verification steps
- **Ignore**: User questions or concerns
- **Automate**: Without user understanding

## Related Files

- [`AGENTS.md`](../../AGENTS.md) — Full agent behavior rules
- [`constraints/modularity-rules.md`](./modularity-rules.md) — System modularity constraints
- [`constraints/protocol-rules.md`](./protocol-rules.md) — IPC protocol constraints
