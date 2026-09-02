---
type: Workflow
title: "Plugin Development Workflow"
description: "End-to-end workflow for developing, testing, and deploying Flux plugins"
resource: "okf/workflows/plugin-development.md"
tags: ["workflow", "development", "plugin", "testing"]
generated: "2026-09-02"
sources:
  - "plugins/"
  - "scripts/build-plugins.ts"
  - "src-tauri/src/lib.rs"
---

# Plugin Development Workflow

## What Agents Must Know

This workflow covers the full lifecycle of plugin development in Flux, from creating a new plugin to testing and deploying it.

## Workflow Steps

### Phase 1: Planning

1. **Identify the media type** — What kind of content will this plugin provide?
2. **Check existing hooks** — Is there already a hook for this media type?
3. **Decide plugin type** — Service, Component, Core, or Meta?
4. **Design the API** — What methods does the plugin need to expose?

### Phase 2: Creation

1. **Create directory structure**

   ```bash
   mkdir plugins/<name>
   cd plugins/<name>
   ```

2. **Create manifest** (`plugin.json`)

   ```json
   {
     "name": "<name>",
     "version": "1.0.0",
     "description": "<description>",
     "author": "Your Name",
     "run": "bun ./main.ts",
     "methods": ["list", "resolve"],
     "hooks": ["feed.<media-type>"],
     "feeds": [{ "type": "<media-type>", "card": "<name>-card" }]
   }
   ```

3. **Implement backend** (`main.ts`)
   - Handle stdin JSON messages
   - Implement declared methods
   - Return results or errors

4. **Implement frontend** (optional)
   - Create Web Component (e.g., `<name>-card.tsx`)
   - Use CSS custom properties for styling
   - Declare in `components[]` or `feeds[].card`

### Phase 3: Build

1. **Build plugins**

   ```bash
   bun run build:plugins
   ```

2. **Check build output**

   ```bash
   ls build/plugins/<tag>.js
   ```

3. **Fix any build errors**
   - Framework detection issues
   - Import errors
   - TypeScript compilation errors

### Phase 4: Testing

1. **Start dev server**

   ```bash
   bun run dev
   ```

2. **Test backend**
   - Check plugin subprocess spawns correctly
   - Verify RPC methods respond
   - Test error handling

3. **Test frontend**
   - Verify component renders
   - Check hook resolution
   - Test data flow

4. **Test integration**
   - Verify plugin appears in feed
   - Check styling cascade
   - Test with other plugins

### Phase 5: Refinement

1. **Add error handling**
   - Network failures
   - Invalid data
   - Timeout handling

2. **Optimize performance**
   - Lazy loading
   - Caching
   - Debouncing

3. **Document**
   - Update plugin README
   - Add JSDoc comments
   - Document tokens consumed

### Phase 6: Deployment

1. **Production build**

   ```bash
   bun run build
   ```

2. **Test production build**
   - Verify all plugins load
   - Check bundle sizes
   - Test on target platforms

3. **Release**
   - Tag version
   - Update changelog
   - Publish documentation

## Common Issues

### Plugin Not Discovered

**Symptom**: Plugin doesn't appear in feed

**Check**:

- Is `plugin.json` valid JSON?
- Is the directory under `plugins/`?
- Does the manifest have required fields?

### Build Fails

**Symptom**: `bun run build:plugins` errors

**Check**:

- Framework detection (check imports)
- File extensions (.tsx, .vue, .svelte)
- Missing dependencies

### RPC Timeout

**Symptom**: 15-second timeout error

**Check**:

- Plugin subprocess spawned correctly
- stdin/stdout not blocked
- Method name matches declared methods

### Component Not Rendering

**Symptom**: Empty space where component should be

**Check**:

- Web Component tag matches manifest
- Script loaded in `build/plugins/`
- Hook resolution returns correct provider

## Validation Checklist

- [ ] Plugin directory created under `plugins/`
- [ ] `plugin.json` is valid and complete
- [ ] Backend implements declared methods
- [ ] Frontend component renders correctly
- [ ] Plugin appears in feed
- [ ] No console errors
- [ ] Build succeeds
- [ ] Production build works

## Related Files

- [`playbooks/add-service-plugin.md`](../playbooks/add-service-plugin.md) — Step-by-step service plugin guide
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
