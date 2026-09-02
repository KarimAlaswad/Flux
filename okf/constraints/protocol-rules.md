---
type: Constraint
title: "Protocol Rules"
description: "Rules for IPC protocol design and evolution in Flux"
resource: "okf/constraints/protocol-rules.md"
tags: ["constraints", "protocol", "ipc", "wire-format"]
generated: "2026-09-02"
sources:
  - "AGENTS.md"
  - "CONTEXT.md"
  - "src-tauri/src/lib.rs"
---

# Protocol Rules

## What Agents Must Know

The IPC protocol is how plugins communicate with the skeleton and each other. These rules ensure the protocol can evolve without breaking existing plugins.

## Core Rules

### 1. Plugins Should Work Forever

**Rule**: When a developer writes a plugin, they should never be tasked to rewrite/maintain it with newer specs. The system must be backward compatible with older plugins.

**Why**: Plugin developers shouldn't be penalized for adopting early.

**Implementation**: The skeleton translates between old and new formats. Old plugins untouched.

### 2. Plugins Never Talk Directly

**Rule**: Every message goes Plugin → Skeleton → Plugin. The skeleton is the only part that touches the wire format.

**Why**: The skeleton can translate between different protocols. Plugins don't need to know about each other.

### 3. System Never Defines Message Content

**Rule**: Every message has two parts:

- **Skeleton** (system-owned): id, method, result, error — stays tiny
- **Payloads** (plugin-owned): everything inside params and result — opaque data

**Why**: Plugins can change their data formats without breaking the system.

### 4. Format Regret-Proof Rules

| Rule                                    | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| **Skeleton stays tiny**                 | Every system-forced field is a future migration |
| **Unknown fields ignored**              | Adding is always safe, never errors             |
| **No field required**                   | Unless routing depends on it                    |
| **Method names are strings**            | No fixed vocabulary to change                   |
| **New skeleton = new protocol version** | Bridged by skeleton, old plugins untouched      |

### 5. Protocol Declaration

**Rule**: Each plugin declares its protocol in its manifest:

```json
{
  "name": "my-plugin",
  "protocol": "jsonrpc"
}
```

If omitted, defaults to JSON.

**Why**: Better Developer Experience — reducing fields for less code when possible.

## Message Format

### Request (Host → Plugin)

```json
{
  "id": 1,
  "method": "list",
  "params": { "type": "video" }
}
```

### Response (Plugin → Host)

```json
{
  "id": 1,
  "result": { "items": [...] }
}
```

### Error

```json
{
  "id": 1,
  "error": "Plugin not found: invalid-plugin"
}
```

## Evolution Scenarios

### Adding a New Field

**Safe**: Add to payload. System ignores unknown fields.

```json
// Old plugin
{ "id": 1, "result": { "items": [...] } }

// New plugin
{ "id": 1, "result": { "items": [...], "total": 100 } }
```

### Changing a Field Name

**Safe**: Old plugins keep old name, new plugins use new name. Skeleton translates.

### Changing Wire Format (e.g., JSON → msgpack)

**Safe**: New plugins declare `"protocol": "msgpack"` in manifest. Skeleton translates between formats.

### Changing Message Skeleton

**Requires new protocol version**: Old plugins continue using old version. Skeleton bridges.

## Forbidden Patterns

### Direct Plugin Calls

```typescript
// ❌ BAD: Direct call by name
const result = await window.__pluginRpc("peertube.list", {});

// ✅ GOOD: Hook-based resolution
const provider = await window.resolveHook("feed.video");
const result = await window.__pluginRpc(`${provider.name}.list`, {});
```

### Shared State

```typescript
// ❌ BAD: Shared React context
const ctx = useContext(PluginContext);

// ✅ GOOD: CustomEvent communication
window.dispatchEvent(new CustomEvent("plugin.update", { detail: data }));
```

### Hardcoded Contracts

```typescript
// ❌ BAD: Assuming specific payload shape
const url = result.url; // What if plugin changes to result.streamUrl?

// ✅ GOOD: Documented contract
// Plugin declares: { url: string, title: string, ... }
const url = result.url; // Safe because contract is explicit
```

## Validation Checklist

When reviewing protocol changes:

- [ ] Does this break backward compatibility?
- [ ] Can old plugins continue working?
- [ ] Is the skeleton handling translation?
- [ ] Are unknown fields being ignored?
- [ ] Is the change documented in the manifest?

## Related Files

- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
- [`tools/rust-backend.md`](../tools/rust-backend.md) — Rust backend IPC implementation
- [`constraints/modularity-rules.md`](./modularity-rules.md) — Modularity constraints
