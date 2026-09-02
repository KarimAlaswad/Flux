---
type: Tool
title: "Tauri Development Environment"
description: "Development setup and commands for Flux's Tauri v2 + React + TypeScript stack"
resource: "okf/tools/tauri-dev.md"
tags: ["tauri", "development", "build", "dev-server"]
generated: "2026-09-02"
sources:
  - "package.json"
  - "vite.config.ts"
  - "src-tauri/Cargo.toml"
---

# Tauri Development Environment

## What Agents Must Know

Flux uses **Tauri v2** with a **React 19** frontend and **Bun** for plugin builds. The development workflow involves multiple processes running together.

## Tech Stack

| Layer           | Technology      | Version |
| --------------- | --------------- | ------- |
| Backend         | Rust (Tauri v2) | Latest  |
| Frontend        | React 19        | ^19.1.0 |
| Build Tool      | Vite            | ^7.0.4  |
| Package Manager | Bun             | Latest  |
| Language        | TypeScript      | ~5.8.3  |
| Styling         | Tailwind CSS    | ^4.3.2  |

## Development Commands

### Start Development Server

```bash
# Full dev environment (plugins + Vite + Tauri)
bun run dev

# Or step by step:
bun run build:plugins    # Build plugin Web Components
bun run dev:watch        # Watch mode with plugin rebuilds
```

### Build for Production

```bash
bun run build            # Full production build
bun run build:plugins    # Build plugins only
```

### Individual Commands

```bash
# Build plugins
bun scripts/build-plugins.ts

# Watch mode for plugins
bun scripts/build-plugins.ts --watch

# Run Vite dev server
bunx vite build

# Run Tauri backend
cargo run --manifest-path src-tauri-webui/Cargo.toml
```

## Project Structure

```
Flux/
├── src/                    # Frontend source
│   ├── App.tsx             # Main React component
│   ├── main.tsx            # Entry point
│   └── shared/             # Shared types
├── src-tauri/              # Rust backend
│   └── src/lib.rs          # Plugin system, IPC, hooks
├── plugins/                # Plugin directories
│   ├── _shared/            # Shared plugin utilities
│   └── <plugin-name>/      # Individual plugins
├── build/                  # Build output
│   └── plugins/            # Compiled plugin Web Components
├── scripts/                # Build scripts
│   └── build-plugins.ts    # Plugin bundler
└── dist/                   # Production build output
```

## Vite Configuration

From `vite.config.ts`:

```typescript
// Plugin reload on change
const wcReload = {
  name: "wc-reload",
  configureServer(server) {
    server.watcher.add("build/plugins/**/*.js");
    server.watcher.on("change", (p) => {
      if (p.includes("build/plugins/")) server.ws.send({ type: "full-reload" });
    });
  },
};
```

This watches for plugin file changes and triggers full reload.

## IPC Modes

Flux supports two IPC backends:

### 1. Tauri IPC (Default)

```typescript
const result = await invoke("plugin_request", { method, params });
```

### 2. WebUi IPC (Experimental)

```typescript
const result = await webui.call(
  "plugin_request",
  method,
  JSON.stringify(params),
);
```

Currently using WebUi mode (see `src/App.tsx`).

## Common Tasks

### Add a New Plugin

1. Create `plugins/<name>/plugin.json`
2. Add implementation file (e.g., `main.ts`)
3. Run `bun run build:plugins`
4. Restart dev server

### Debug Plugin Communication

1. Check Rust backend logs (stderr from plugin subprocess)
2. Use browser DevTools for frontend errors
3. Add console.log to plugin code

### Fix Build Errors

1. Run `bun run build:plugins` to see plugin build errors
2. Check Vite output for frontend errors
3. Check Cargo output for Rust errors

## Allowed Actions

- **Read**: All configuration files, build scripts, source code
- **Explain**: Build process, development workflow, IPC modes
- **Suggest**: Build optimizations, development improvements

## Risky Actions

- **Modify**: Vite config without understanding Tauri integration
- **Change**: IPC modes without updating all call sites
- **Remove**: Plugin reload logic (breaks hot reload)

## Related Files

- [`tools/build-plugins.md`](./build-plugins.md) — Plugin build system details
- [`tools/rust-backend.md`](./rust-backend.md) — Rust backend specifics
- [`workflows/development-setup.md`](../workflows/development-setup.md) — First-time setup guide
