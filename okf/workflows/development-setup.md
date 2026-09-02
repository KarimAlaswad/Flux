---
type: Workflow
title: "Development Setup Workflow"
description: "First-time setup for Flux development environment"
resource: "okf/workflows/development-setup.md"
tags: ["workflow", "setup", "development", "environment"]
generated: "2026-09-02"
sources:
  - "package.json"
  - "src-tauri/Cargo.toml"
  - "README.md"
---

# Development Setup Workflow

## What Agents Must Know

This workflow covers setting up the Flux development environment from scratch. Follow these steps in order.

## Prerequisites

### Required Software

| Software    | Version       | Purpose                              |
| ----------- | ------------- | ------------------------------------ |
| **Bun**     | Latest        | Package manager, runtime, build tool |
| **Rust**    | Latest stable | Tauri backend                        |
| **Node.js** | 18+           | Vite dev server                      |
| **VS Code** | Latest        | IDE (recommended)                    |

### Required VS Code Extensions

- **Tauri** (`tauri-apps.tauri-vscode`)
- **rust-analyzer** (`rust-lang.rust-analyzer`)
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)

## Setup Steps

### 1. Clone Repository

```bash
git clone <repository-url>
cd Flux
```

### 2. Install Frontend Dependencies

```bash
bun install
```

This installs:

- React 19, React DOM
- Tauri API
- Vite and plugins
- TypeScript
- Tailwind CSS

### 3. Install Rust Dependencies

```bash
cd src-tauri
cargo build
cd ..
```

This compiles:

- Tauri framework
- Serde (JSON serialization)
- Tokio (async runtime)
- Reqwest (HTTP client)

### 4. Build Plugins

```bash
bun run build:plugins
```

This:

- Scans `plugins/` for manifests
- Detects frameworks
- Bundles into Web Components
- Outputs to `build/plugins/`

### 5. Start Development Server

```bash
bun run dev
```

This runs:

1. `build:plugins` — Build plugin bundles
2. `vite build` — Start Vite dev server
3. `cargo run` — Start Tauri backend

### 6. Verify Setup

1. **Check terminal output** — No errors
2. **Open browser** — App loads at `http://localhost:1420`
3. **Check DevTools** — No console errors
4. **Test plugin** — Feed shows content

## Development Commands

### Daily Development

```bash
# Start full dev environment
bun run dev

# Watch mode (auto-rebuild plugins)
bun run dev:watch
```

### Individual Commands

```bash
# Build plugins only
bun run build:plugins

# Watch plugin changes
bun scripts/build-plugins.ts --watch

# Build for production
bun run build

# Run Tauri CLI
bun run tauri <command>
```

### Debugging

```bash
# Check plugin discovery
find plugins/ -name "plugin.json"

# Check build output
ls build/plugins/

# Check Rust compilation
cd src-tauri && cargo check

# Check TypeScript
npx tsc --noEmit
```

## Common Issues

### Bun Not Found

**Error**: `bun: command not found`

**Fix**:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Or via npm
npm install -g bun
```

### Rust Compilation Fails

**Error**: `cargo build` errors

**Fix**:

```bash
# Update Rust
rustup update

# Install Tauri dependencies (Linux)
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Plugin Build Fails

**Error**: `bun run build:plugins` errors

**Fix**:

- Check plugin manifest syntax
- Verify framework imports
- Check file extensions

### Dev Server Won't Start

**Error**: Port 1420 already in use

**Fix**:

```bash
# Kill process on port 1420
lsof -ti:1420 | xargs kill -9

# Or use different port
PORT=1421 bun run dev
```

## Validation Checklist

- [ ] Bun installed and working
- [ ] Rust installed and working
- [ ] `bun install` succeeds
- [ ] `bun run build:plugins` succeeds
- [ ] `bun run dev` starts without errors
- [ ] App loads in browser
- [ ] No console errors
- [ ] Plugins appear in feed

## Related Files

- [`tools/tauri-dev.md`](../tools/tauri-dev.md) — Development environment details
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
- [`tools/rust-backend.md`](../tools/rust-backend.md) — Rust backend specifics
