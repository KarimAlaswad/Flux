# Research: Framework Version Negotiation and Grouped Sharing

**Date:** 2026-07-29
**Context:** Flux needs to load multiple plugins that may depend on different versions of shared frameworks (React, Vue, etc.) — and share a single framework instance among compatible plugins to save memory and avoid conflicts.

---

## Table of Contents

1. [Module Federation `shared` Config](#1-module-federation-shared-config)
2. [Jupyter Widgets `_model_module_version`](#2-jupyter-widgets-_model_module_version)
3. [NPM/Yarn Semver Resolution](#3-npmyarn-semver-resolution)
4. [Import Maps Browser Spec](#4-import-maps-browser-spec)
5. [SystemJS](#5-systemjs)
6. [FDC3 App Directory Versioning](#6-fdc3-app-directory-versioning)
7. [ES Module Shims](#7-es-module-shims)
8. [Cross-Cutting Analysis](#8-cross-cutting-analysis)
9. [Flux-Specific Design](#9-flux-specific-design)
10. [Sources](#10-sources)

---

## 1. Module Federation `shared` Config

### Declaration Format

Plugins declare shared dependencies via the `shared` key in the ModuleFederationPlugin config. The key is the package name, value is a `SharedConfig` object:

```typescript
interface SharedConfig {
  singleton?: boolean;       // allow only ONE version in the share scope
  requiredVersion?: string;  // semver range, e.g. "^18.2.0" or "~18.2.0"
  eager?: boolean;           // inline instead of async chunk
  shareScope?: string;       // namespace for isolation (default: "default")
  import?: string | false;   // false = don't bundle, only consume from host
  shareKey?: string;         // runtime negotiation key
  request?: string;          // build-time interception path
}
```

Source: https://module-federation.io/configure/shared.html

### Negotiation Algorithm

1. At build time, the bundler marks `import 'react'` as external — instead of inlining it, it generates a runtime call to the Share Scope.
2. At runtime, `__webpack_init_sharing__` builds a version map for each `shareKey`. Host and remotes each register their version into the scope.
3. When `singleton: true`:
   - Webpack picks the **highest** available version that satisfies ALL `requiredVersion` ranges.
   - If no single version satisfies all ranges, it picks the best fit and emits a console warning about the version mismatch.
   - The lower-version consumer gets the higher version's exports.
4. When `singleton: false` (default):
   - Each remote loads its own copy. No negotiation — every consumer gets its own bundled version.

Source: https://github.com/webpack/webpack (runtime code in `lib/sharing/`)
Source: https://module-federation.io/configure/shared.html#singleton

### Conflict Resolution

- **Singleton mode**: Only one instance ever exists. If Plugin A needs `^18.0.0` and Plugin B needs `^19.0.0`, and the host provides `19.0.0`, Plugin A gets React 19 at runtime. If `19.0.0` doesn't satisfy `^18.0.0`, webpack warns but still provides 19 — the plugin may break.
- **Non-singleton mode**: Each consumer loads its own copy. No conflict, but memory doubles.

### Isolation

`shareScope` provides namespacing — two scopes can have different versions of the same package:

```js
shared: {
  react: {
    singleton: true,
    shareScope: "legacy"  // isolated from "default" scope
  }
}
```

Source: https://module-federation.io/configure/shareScope.html

### Performance

- Singleton: one load, shared by all consumers. Best memory profile.
- Non-singleton: N copies for N consumers. Worst memory.
- Version resolution overhead: O(n) scan of registered versions at module load time. Negligible.

---

## 2. Jupyter Widgets `_model_module_version`

### Declaration Format

Each widget declares its framework dependency version as a trait on the Python class:

```python
class Email(DOMWidget, ValueWidget):
    _model_name = Unicode('EmailModel').tag(sync=True)
    _model_module = Unicode(module_name).tag(sync=True)
    _model_module_version = Unicode(module_version).tag(sync=True)  # semver
```

The frontend TypeScript side mirrors this:

```typescript
static model_module_version = MODULE_VERSION;  // "0.1.0"
```

Source: https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20Custom.html

### Negotiation Algorithm

Jupyter widgets use a **passive compatibility check** rather than active version resolution:

1. The widget manager in the frontend reads `_model_module_version` from the widget state.
2. It checks whether the running `@jupyter-widgets/base` version satisfies the widget's requirement.
3. If not, it logs an error — the widget may not render correctly.
4. There is **no automatic fallback or version selection**. The version is purely informational + a guard.

### Conflict Resolution

- If one widget needs `@jupyter-widgets/base@1.0.0` and another needs `2.0.0`, and the page has `1.0.0` loaded, the second widget fails at runtime.
- No singleton or sharing negotiation — the kernel provides exactly one version of the base library.

### Isolation

None. All widgets share a single `@jupyter-widgets/base` instance. If versions conflict, one widget breaks.

### Performance

Near zero — version check is a single string comparison.

---

## 3. NPM/Yarn Semver Resolution

### Declaration Format

Package dependencies declare version ranges using semver syntax in `package.json`:

```json
{
  "dependencies": {
    "react": "^18.2.0",   // compatible with 18.x.x
    "lodash": "~4.17.0",  // compatible with 4.17.x
    "next": ">=14.0.0 <15.0.0"  // arbitrary range
  }
}
```

Range operators:
- `^` — compatible with major version (allows minor/patch bumps)
- `~` — approximately equivalent (allows patch bumps only)
- `>=`, `<=`, `>` — arbitrary comparisons
- `*` or `x` — any version
- `1.2.3` — exact pin

Source: https://docs.npmjs.com/about-semantic-versioning

### Negotiation Algorithm (`npm-pick-manifest`)

The `npm-pick-manifest` package implements npm's resolution algorithm:

1. Collect all versions from the packument (registry metadata).
2. If a dist-tag is requested and not date-filtered, use it.
3. If an exact version is requested, use it.
4. Apply the range filter to the version set.
5. Sort by preference:
   - Prefer non-deprecated versions
   - Prefer satisfied engines requirements
   - Prefer higher semver precedence
6. Return the best match or throw `ETARGET`.

Source: https://github.com/npm/npm-pick-manifest (algorithm section in README)

### Conflict Resolution

NPM uses **deduplication** in the node_modules tree:
- If multiple packages request `react@^16.0.0` and `react@^18.0.0`, npm installs both at different levels of the tree (nested `node_modules`).
- With `npm dedupe`, it tries to hoist compatible versions to the top level.
- Lockfile (`package-lock.json`) records the exact resolved version for every dependency, ensuring reproducible installs.

### Isolation

Node.js module resolution provides isolation naturally:
- Each `node_modules` directory is searched upward.
- Two versions of the same package can coexist at different tree depths.

### Performance

Resolution is O(n) per package at install time. Runtime lookup via Node.js module resolution is O(depth) path walks.

---

## 4. Import Maps Browser Spec

### Declaration Format

Import maps are JSON objects embedded in `<script type="importmap">`:

```json
{
  "imports": {
    "react": "https://cdn.example.com/react@18.2.0/index.js",
    "react/": "https://cdn.example.com/react@18.2.0/"
  },
  "scopes": {
    "/legacy/": {
      "react": "https://cdn.example.com/react@16.14.0/index.js"
    }
  }
}
```

Key rules:
- Keys ending with `/` are prefix matches (must also end with `/` in value)
- `scopes` keys are URL paths — if the importing module's URL matches, the scope's map overrides `imports`
- Multiple import maps are merged: later maps cannot override already-resolved specifiers
- Relative URLs in values are resolved against the import map base URL

Source: https://html.spec.whatwg.org/multipage/webappapis.html#import-maps
Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap

### Negotiation Algorithm

The browser's import map resolution algorithm:

1. For a given module specifier and referrer URL:
   a. Find the best-matching scope key (longest matching path prefix).
   b. If found, resolve the specifier within that scope's module specifier map.
   c. If no scope match, resolve within the top-level `imports` map.
2. Within a module specifier map:
   a. Exact match wins over prefix match.
   b. Longest prefix match wins.
3. If no match, fall through to standard URL resolution (relative URL resolution).

The spec defines this formally at https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier

### Conflict Resolution

- **Scopes provide isolation**: `/legacy/` modules get React 16, while other modules get React 18. Same mechanism can provide per-plugin framework versions.
- **Multiple import maps merge**: First-registered wins for already-resolved specifiers. Order matters.
- **No semver negotiation**: Import maps are URL-level, not version-range-level. You map `"react"` to one specific URL.

### Isolation

Scopes are the isolation mechanism. If Plugin A lives under `/plugins/a/` and Plugin B under `/plugins/b/`, each can have its own scope entry mapping the same bare specifier to different URLs.

### Performance

- Import map parsing: O(entries) once at startup.
- Module resolution: prefix match against scope keys + imports keys. O(scope depth) per import.
- No runtime semver — pure string matching. Fast.

---

## 5. SystemJS

### Declaration Format

SystemJS uses **import maps** (its own `systemjs-importmap` type or standard `importmap`):

```html
<script type="systemjs-importmap">
{
  "imports": {
    "react": "https://unpkg.com/react@18.2.0/umd/react.production.min.js"
  }
}
</script>
```

Modules are authored in the `System.register` format:

```js
System.register(["react"], function(exports) {
  return {
    execute: function() {
      // module body
    }
  };
});
```

Source: https://github.com/systemjs/systemjs#readme

### Negotiation Algorithm

SystemJS does **not** do semver negotiation itself. It:
1. Resolves bare specifiers through the import map (same algorithm as the browser spec).
2. Loads the resolved URL.
3. Executes the `System.register` callback.
4. Provides hooks (`resolve`, `fetch`, `instantiate`) for custom resolution logic.

A plugin author could implement semver negotiation in the `resolve` hook:

```js
System.resolve = function(id, parentUrl) {
  // custom version negotiation logic here
};
```

Source: https://github.com/systemjs/systemjs/blob/main/docs/hooks.md

### Conflict Resolution

Same as import maps: scopes allow per-path resolution. No built-in singleton management — that's left to application code.

### Isolation

- `System.register` gives each module its own scope.
- Separate `System` instances (iframe forking) for hard isolation.
- Import map scopes for logical isolation.

### Performance

- SystemJS itself is ~4.2KB minified (system.js) or ~2.8KB (s.js).
- Loader overhead: ~1.5x native module speed (cached), ~1.4x (uncached) per benchmarks.
- Source: https://github.com/systemjs/systemjs#performance

---

## 6. FDC3 App Directory Versioning

### Declaration Format

The FDC3 App Directory records contain:

```json
{
  "appId": "my-app",
  "name": "My App",
  "version": "1.2.3",         // app version
  "manifestType": "http",     // or "web", "native"
  "manifest": "https://...",
  "hosts": ["https://..."]
}
```

Source: https://fdc3.finos.org/docs/next/app-directory/overview

### Negotiation Algorithm

FDC3 uses **app-level versioning**:
- `version` is the app's own version, used for update checks.
- Compatibility is determined by the FDC3 API version the app targets (e.g., "2.0").
- The desktop agent (host) checks whether the app's required API version is supported.
- No per-framework version negotiation — the framework IS the FDC3 API.

### Conflict Resolution

- Different apps can have different `version` values; they coexist because each app runs in its own window/process.
- If an app requires FDC3 API 3.0 and the agent only supports 2.0, the app is not launched.

### Isolation

Full process isolation — each app runs separately. The FDC3 API is the only shared surface.

### Performance

Version check is a simple string comparison at app launch time.

---

## 7. ES Module Shims

### Declaration Format

ES Module Shims is a polyfill for import maps and module features. It reads standard `importmap` scripts plus its own `esms-options`:

```html
<script type="esms-options">
{
  "polyfillEnable": ["wasm-module-sources"],
  "shimMode": true,
  "skip": ["^https?:\\/\\/cdn\\.com\\/"]
}
</script>
```

Source: https://github.com/guybedford/es-module-shims

### Negotiation Algorithm

ES Module Shims does not do semver negotiation — it is a spec-compliant import map polyfill:
1. Pass-through mode (94% of users with native import maps): ~5ms overhead, zero rewriting.
2. Polyfill mode (remaining users): rewrite module specifiers via the import map, execute as Blob URLs.
3. Shim mode: custom `module-shim` script type, full control over what gets loaded.

### Conflict Resolution

Same as import maps: scopes provide per-path module resolution. `skip` option lets you bypass certain modules from polyfill processing (for native passthrough).

### Isolation

- **Polyfill mode**: Native modules and shimmed modules share instances where possible (with edge cases for dynamic imports).
- **Shim mode**: Full isolation — only shim scripts are processed.
- The `skip` option prevents the shim from touching certain modules.

### Performance

- Polyfill mode: ~1.4–1.5x native module speed.
- Cached loads: ~81ms vs 49ms native (426 modules).
- Source: https://github.com/guybedford/es-module-shims#benchmarks

---

## 8. Cross-Cutting Analysis

| Dimension | Module Federation | Jupyter Widgets | NPM | Import Maps | SystemJS | FDC3 | ES Module Shims |
|-----------|------------------|-----------------|-----|-------------|----------|------|-----------------|
| Declaration | `shared.react.requiredVersion` | `_model_module_version` trait | `package.json` `^` `~` | `imports` map JSON | Import map JSON | `version` in manifest | Import map JSON + init options |
| Negotiation | Highest singleton, warn on mismatch | Passive check, fail if mismatch | Range → best match (npm-pick-manifest) | No semver — URL mapping | Custom via hooks | API version check | No semver — URL mapping |
| Conflict Resolution | Singleton (one wins) or non-singleton (N copies) | None — runtime error | Nested node_modules + dedupe | Scopes per path | Scopes per path | Different windows | Skip option for passthrough |
| Isolation | `shareScope` string | None | Filesystem tree depth | Import map `scopes` | Separate `System` instances | Process per app | Polyfill vs native boundary |
| Performance | O(n) at load time | Near zero | O(n) per install | O(entries) at parse | ~1.5x native | Near zero | ~1.4x native |

### Key Insights

1. **Two strategies dominate**: URL-based mapping (import maps, SystemJS) and version-range negotiation (Module Federation, NPM).
2. **Scopes are the isolation primitive** across all browser-based systems — associate a path prefix with specific module versions.
3. **Singleton mode (Module Federation) is the only system that actively negotiates ranges** to find one compatible version for all consumers.
4. **NPM's nested tree is the most robust isolation** but doesn't apply to browser runtime (it's a build-time/install-time mechanism).
5. **No existing system combines scoped import maps with semver range negotiation** — that's the gap Flux can fill.

---

## 9. Flux-Specific Design

### Goal

Allow Flux plugins to declare what framework versions they support, group compatible plugins to share one framework instance, and load separate instances for incompatible groups.

### Plugin Manifest Declaration

```json
{
  "name": "my-plugin",
  "ui": "my-widget",
  "framework": {
    "name": "react",
    "version": "^19.0.0"
  },
  "hooks": ["feed.video"],
  "feeds": [
    { "method": "yt-feed.list", "card": "yt-video-card" }
  ]
}
```

- `framework.name` — the shared framework identifier (e.g., "react", "vue", "lit")
- `framework.version` — semver range this plugin is compatible with

Multiple frameworks per plugin (if needed):

```json
{
  "frameworks": [
    { "name": "react", "version": "^19.0.0" },
    { "name": "lit", "version": "^3.0.0" }
  ]
}
```

### Grouping Algorithm (Pseudo-code)

```
function groupPluginsByFramework(manifests):
  // Step 1: Collect framework declarations
  groups = Map<FrameworkName, List<{plugin, range}>>
  for manifest in manifests:
    for framework in manifest.frameworks:
      groups[framework.name].add({manifest, framework.version})
  
  // Step 2: For each framework, find compatible version groups
  result = Map<FrameworkName, List<VersionGroup>>
  for (name, entries) in groups:
    // Use semver.intersects to build compatibility graph
    versionGroups = []
    assigned = Set()
    for entry in entries:
      if entry in assigned: continue
      group = {range: entry.range, plugins: [entry.plugin]}
      assigned.add(entry)
      for other in entries:
        if other in assigned: continue
        if semver.intersects(group.range, other.range):
          // Merge — widen range to satisfy both
          group.range = semver.intersect(group.range, other.range)
          group.plugins.add(other.plugin)
          assigned.add(other)
        // If ranges don't intersect, they go to different groups
      versionGroups.add(group)
    
    // Step 3: Pick the actual version for each group
    for group in versionGroups:
      // Use semver.maxSatisfying to find the best concrete version
      group.resolved = pickBestVersion(group.range, availableVersions)
      // If no version available, error
      if group.resolved == null:
        raise("No version satisfies " + group.range)
    
    result[name] = versionGroups
  
  return result
```

### Loading Algorithm

```
async function loadFrameworkInstances(groupedPlugins):
  instanceCache = Map<FrameworkName, Map<VersionGroup, Script>>
  
  for (frameworkName, versionGroups) in groupedPlugins:
    for group in versionGroups:
      // Build an import map scope for this group
      scopePath = getPluginBasePath(group.plugins[0])
      importMap = {
        "imports": {},
        "scopes": {
          scopePath + "/": {
            frameworkName: `https://cdn.example.com/${frameworkName}@${group.resolved}/index.js`
          }
        }
      }
      
      // Load the framework script via the generated import map
      frame = await loadIsolatedFrame(importMap)
      
      // Store the isolated frame reference for this group
      instanceCache[frameworkName][group.key] = frame
  
  return instanceCache
```

### Import Map Per-Group Approach

Flux can use import map scopes to isolate each compatibility group to its own framework instance:

```
Global scope:                / (host app)         → React 19
Plugin group A (^19):        /plugins/feed/       → React 19   (shared with host)
Plugin group B (^16):        /plugins/legacy/     → React 16   (separate instance)
```

Each group gets a scope entry that maps `"react"` to a specific version URL. Plugins in group A see React 19; plugins in group B see React 16. Both run in the same page but have different framework instances.

### Resolution Strategies

| Strategy | Description | When to use |
|----------|-------------|-------------|
| **max-satisfying** | Pick the highest compatible version for a group | Default: gives most features |
| **min-satisfying** | Pick the minimum compatible version | Conservative: widest group compatibility |
| **exact** | Force a specific version (host decides) | Host requires a specific version |

### Compilation Model

Plugins compile their framework dependency as **external**:

```json
// Plugin's Vite/Rollup config
{
  "rollupOptions": {
    "external": ["react", "react-dom"],
    "output": {
      "globals": {
        "react": "React",
        "react-dom": "ReactDOM"
      }
    }
  }
}
```

At runtime, the global `React` is provided by the framework instance loaded for that plugin's group. If the plugin was compiled against React 19 but the group resolved to React 18, it may break — but the version range declaration in the manifest prevents this, because the plugin declares `"version": "^19.0.0"` and the grouping algorithm ensures it only joins a group that satisfies that range.

### Edge Cases

**Plugin A needs `^18.0.0`, Plugin C needs `>=19.0.0 <20.0.0`:**
```
groups[react] = [
  {range: "^18.0.0", plugins: [A]},      // isolated group
  {range: ">=19.0.0 <20.0.0", plugins: [C]}  // separate group
]
```
Two separate React instances loaded. Different scopes in the import map.

**Plugin A needs `^18.0.0`, Plugin B needs `>=18.2.0`:**
```
intersects("^18.0.0", ">=18.2.0") → true (18.3.0 satisfies both)
groups[react] = [
  {range: "^18.0.0", plugins: [A, B]}  // one group, resolved to e.g. 18.3.0
]
```

**Plugin A needs `react@^18.0.0`, Plugin B needs `vue@^3.0.0`:**
Different framework names → no conflict. Each gets its own framework instance.

**Plugin A declares no framework:**
Assumed compatible with the host's default framework instance (or no framework dependency at all).

### Performance Considerations

- Import map scope matching is O(prefix) per import — negligible.
- Multiple framework instances consume memory: each React instance is ~130KB (minified).
- Lazy loading: framework instances should be fetched only when the first plugin in that group mounts.
- Impact: N incompatible groups → N framework instances. Tolerable for small N (2–3), but don't let it grow unbounded. Log a warning when `N > 3` as a hint for plugin authors to converge.

### Implementation Sketch

```typescript
import semver from "semver";

interface FrameworkDeclaration {
  name: string;
  version: string; // semver range
}

interface Manifest {
  name: string;
  frameworks?: FrameworkDeclaration[];
}

interface VersionGroup {
  range: string;           // intersection of all member ranges
  resolved: string | null; // concrete version picked after negotiation
  members: Manifest[];
}

function groupByFramework(
  manifests: Manifest[]
): Map<string, VersionGroup[]> {
  // 1. Collect all framework declarations
  const declarations = new Map<string, Array<{ manifest: Manifest; range: string }>>();
  for (const m of manifests) {
    for (const fw of m.frameworks ?? []) {
      if (!declarations.has(fw.name)) declarations.set(fw.name, []);
      declarations.get(fw.name)!.push({ manifest: m, range: fw.version });
    }
  }

  // 2. For each framework, build compatibility groups
  const result = new Map<string, VersionGroup[]>();
  for (const [name, deps] of declarations) {
    const groups: VersionGroup[] = [];
    const assigned = new Set<string>();

    for (const dep of deps) {
      if (assigned.has(dep.manifest.name)) continue;

      const group: VersionGroup = {
        range: dep.range,
        resolved: null,
        members: [dep.manifest],
      };
      assigned.add(dep.manifest.name);

      for (const other of deps) {
        if (assigned.has(other.manifest.name)) continue;
        if (semver.intersects(group.range, other.range)) {
          group.range = semver.intersect(group.range, other.range)!;
          group.members.push(other.manifest);
          assigned.add(other.manifest.name);
        }
      }

      groups.push(group);
    }

    result.set(name, groups);
  }

  return result;
}

function resolveGroups(
  groups: Map<string, VersionGroup[]>,
  availableVersions: Map<string, string[]>  // framework → [version strings]
): void {
  for (const [name, versionGroups] of groups) {
    const versions = availableVersions.get(name) ?? [];
    for (const group of versionGroups) {
      group.resolved = semver.maxSatisfying(versions, group.range);
      if (!group.resolved) {
        throw new Error(
          `No version of ${name} satisfies range ${group.range} (plugins: ${group.members.map(m => m.name).join(", ")})`
        );
      }
    }
  }
}
```

---

## 10. Sources

| Source | URL |
|--------|-----|
| Module Federation shared config docs | https://module-federation.io/configure/shared.html |
| Module Federation shareScope | https://module-federation.io/configure/shareScope.html |
| Jupyter Widgets custom widget tutorial | https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20Custom.html |
| NPM semantic versioning docs | https://docs.npmjs.com/about-semantic-versioning |
| npm-pick-manifest (algorithm) | https://github.com/npm/npm-pick-manifest |
| Import Maps WHATWG spec | https://html.spec.whatwg.org/multipage/webappapis.html#import-maps |
| MDN import map docs | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap |
| SystemJS GitHub | https://github.com/systemjs/systemjs |
| SystemJS performance benchmarks | https://github.com/systemjs/systemjs#performance |
| SystemJS hooks docs | https://github.com/systemjs/systemjs/blob/main/docs/hooks.md |
| FDC3 app directory overview | https://fdc3.finos.org/docs/next/app-directory/overview |
| ES Module Shims GitHub | https://github.com/guybedford/es-module-shims |
| ES Module Shims benchmarks | https://github.com/guybedford/es-module-shims#benchmarks |

---

**Appendix: Semver library functions referenced**

- `semver.intersects(range1, range2)` — checks whether two ranges have any overlap (https://www.npmjs.com/package/semver)
- `semver.intersect(range1, range2)` — returns the intersection of two ranges (if supported by the library; otherwise compute as `max(lower) min(upper)`)
- `semver.maxSatisfying(versions, range)` — returns the highest version matching a range
- `semver.minSatisfying(versions, range)` — returns the lowest version matching a range