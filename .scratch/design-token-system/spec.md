# Spec: Design Token System + Global Theme Engine

Status: `ready-for-agent`

## Problem Statement

Flux is a modular, multi-framework desktop app where plugins from different authors (React, Web Components, vanilla) coexist in the same DOM tree. Today, every plugin bundles its own Tailwind CSS, producing ~150KB+ per plugin, all duplicating the same utility classes. There is no central styling contract — each plugin hardcodes colors, spacing, and typography independently. The result: plugins look mismatched, themes cannot be applied globally, and dark mode would require touching every plugin file.

The app needs a single source of truth for visual decisions — a design token system — and a global theme engine that can restyle all plugins from one place.

## Solution

Replace per-plugin Tailwind CSS with a **design token system** expressed as CSS custom properties on `:root`. Introduce a **global theme stylesheet** that targets semantic component classes (`.media-card`, `.card-title`, `.action-btn`). Plugin authors output semantic HTML with these classes; they write zero styling CSS by default. A user-facing **theme priority toggle** lets end-users choose whether the global theme overrides plugin styles, or vice versa.

The system is framework-agnostic — it works across React, Web Components, and vanilla HTML because it operates entirely at the CSS/DOM level.

### Architecture overview

```
Design tokens (JSON/CSS)
       │
       ▼
:root { --color-surface: #fafafa; ... }    ← Token definitions
       │
       ▼
global-theme.css                           ← Component class selectors
.media-card { background: var(--color-surface); ... }
       │
       ▼
Plugin HTML                                ← Plugin output (no CSS)
<yt-card class="media-card">
  <h2 class="card-title">...</h2>
  <button class="action-btn">Watch</button>
</yt-card>
       │
       ▼
Browser cascade resolves                   ← No runtime JS
```

## User Stories

1. As a Flux core developer, I want to define the canonical design tokens (color, spacing, typography, radius, shadow) as CSS custom properties, so all components consume the same values from one place.
2. As a Flux core developer, I want to remove Tailwind CSS from the plugin build pipeline, so each plugin's output is ~150KB smaller and builds are faster.
3. As a Flux core developer, I want the token system to replace every hardcoded design value currently in plugin CSS, so the app has visual consistency.
4. As a plugin author, I want to write semantic HTML with known class names (`.media-card`, `.card-title`, `.action-btn`, `.channel-name`, `.meta-text`), so my plugin gets styled automatically by the global theme.
5. As a plugin author, I want to provide fallback inline styles so my component is recognizable even before any theme loads.
6. As a plugin author, I want the option to use Tailwind in my plugin (imported explicitly), so I can override the global theme when my plugin needs custom appearance.
7. As an end-user, I want a toggle (global theme wins vs plugin styles wins), so I can choose between visual consistency across all plugins or letting each plugin keep its own look.
8. As a theme author, I want to write a complete global theme stylesheet that targets the class taxonomy, so I can restyle the entire app from one CSS file.
9. As a theme author, I want to write partial themes that only affect specific component types (e.g., only cards, only buttons), so I can mix and match theme components.
10. As a theme author, I want dark mode handled via token values under `[data-theme="dark"]`, so I don't need to write separate component styles for dark mode.
11. As a plugin author, I want to use `data-*` attributes for state-driven styling (`[data-selected]`, `[data-loading]`), so I can express conditional styles without clsx or class utilities.
12. As a plugin author, I want hover/active/focus/disabled states styled by the global theme via CSS pseudo-classes, so I don't need to write state styles myself.
13. As a Flux core developer, I want the global theme stylesheet to be loaded before any plugin code runs, so there's no flash of unstyled content.
14. As a Flux core developer, I want tokens organized by category: color (brand, semantic, state), spacing (inset, stack, inline), typography (family, size, weight, leading), radius, shadow, so the system is navigable.
15. As an end-user, I want to switch between themes (light, dark, high-contrast), so I can personalize the app's appearance.
16. As a plugin author, I want my plugin's HTML structure documented in a class taxonomy reference, so I know which classes to use.
17. As a Flux core developer, I want the build pipeline to support plugins that opt OUT of the global theme system (by declaring `"styling": "self-contained"` in plugin.json), so legacy plugins continue to work.
18. As a Flux core developer, I want to be able to deprecate specific tokens gracefully (with a transition period), so the token set can evolve without breaking plugins.
19. As an end-user, I want theme changes to apply instantly without reloading the app, so switching themes feels responsive.
20. As a Flux core developer, I want the global theme system to not introduce any JavaScript runtime dependency, so it works with any framework.

## Implementation Decisions

### A. Design Token Format

Tokens are defined as CSS custom properties on `:root`, organized by category. The canonical source is a CSS file (`src/tokens.css`), not JSON — because CSS custom properties are the runtime format and introducing a JSON transform step is unnecessary for a web-only system.

```css
/* ── Token categories ── */

/* --- Color --- */
--color-surface: #fafafa;
--color-surface-elevated: #ffffff;
--color-text-primary: #1a1a2e;
--color-text-secondary: #6b7280;
--color-action-primary: #2563eb;
--color-action-primary-hover: #1d4ed8;
--color-action-primary-active: #1e40af;
--color-action-primary-disabled: #93c5fd;
--color-border: #e5e7eb;
--color-border-strong: #d1d5db;
--color-success: #16a34a;
--color-warning: #d97706;
--color-error: #dc2626;
--color-info: #2563eb;

/* --- Spacing --- */
--space-inset-xs: 4px;
--space-inset-sm: 8px;
--space-inset-md: 16px;
--space-inset-lg: 24px;
--space-inset-xl: 32px;
--space-stack-xs: 4px;
--space-stack-sm: 8px;
--space-stack-md: 16px;
--space-stack-lg: 24px;
--space-stack-xl: 48px;
--space-inline-xs: 4px;
--space-inline-sm: 8px;
--space-inline-md: 16px;
--space-inline-lg: 24px;

/* --- Typography --- */
--font-family-sans: 'Inter', system-ui, sans-serif;
--font-family-mono: 'JetBrains Mono', monospace;
--font-size-xs: 0.75rem;
--font-size-sm: 0.875rem;
--font-size-base: 1rem;
--font-size-lg: 1.25rem;
--font-size-xl: 1.5rem;
--font-size-2xl: 2rem;
--font-size-3xl: 2.5rem;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
--line-height-tight: 1.25;
--line-height-normal: 1.5;
--line-height-relaxed: 1.75;

/* --- Radius --- */
--radius-none: 0;
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;

/* --- Shadow --- */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
--shadow-xl: 0 20px 25px rgba(0,0,0,0.15);
```

### B. Global Theme Stylesheet

A single CSS file (`src/global-theme.css`) that targets the semantic class taxonomy. This is the file where visual decisions are expressed — it maps token values to component appearances.

Key structural rules:
- All selectors target class names, never tag names directly (except reset/normalize)
- No token value appears as a raw value — only `var(--token-name)`
- Pseudo-classes handle state: `:hover`, `:active`, `:focus`, `:disabled`, `:focus-visible`
- `data-*` attributes handle custom states: `[data-selected]`, `[data-loading]`
- Dark mode is a `[data-theme="dark"]` selector on `:root` that reassigns token values
- High-contrast mode as `[data-theme="high-contrast"]`

```css
/* Example: media card in global theme */
.media-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-stack-sm);
  padding: var(--space-inset-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.card-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  color: var(--color-text-primary);
}

.card-title:hover {
  color: var(--color-action-primary-hover);
}

.action-btn {
  background: var(--color-action-primary);
  color: #ffffff;
  padding: var(--space-inset-sm) var(--space-inset-md);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: none;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--color-action-primary-hover);
}

.action-btn:active {
  background: var(--color-action-primary-active);
}

.action-btn:disabled {
  background: var(--color-action-primary-disabled);
  cursor: not-allowed;
}
```

### C. Plugin HTML Contract (Class Taxonomy)

Plugin authors output HTML using this class taxonomy. The global theme targets these classes. Plugin authors do NOT write CSS — they use the correct class names.

| Category | Classes | Used on |
|----------|---------|---------|
| Card container | `.media-card` | The outermost wrapper of a media item (video, channel, playlist) |
| Card title | `.card-title` | The headline/title of a media item |
| Card meta | `.meta-text` | Secondary information (channel, views, date) |
| Card thumbnail | `.media-thumbnail` | The image/thumbnail element |
| Action trigger | `.action-btn` | Primary action button (Watch, Play, Open) |
| Secondary action | `.action-btn-secondary` | Secondary action (Save, Share, Queue) |
| Tag/chip | `.tag` | Small label/chip for status or category |
| Avatar | `.avatar` | User/channel avatar image |
| Container section | `.section` | A grouped section of content |
| Status indicator | `.status-badge` | A badge showing state (Live, New, Error) |
| Link | `.text-link` | An inline text link |
| Inline icon | `.icon-inline` | An icon placed inline with text |

### D. Theme Priority Toggle

A user-facing control that switches between two modes:

1. **Global theme wins (default):** Global theme styles take precedence over any plugin styles. This gives visual consistency across all plugins.
2. **Plugin styles win:** Plugin-authored styles (if any) take precedence over the global theme. Plugin Tailwind usage works in this mode.

Implementation: Two mechanisms, choose one. Either:
- **CSS `@layer` approach**: `@layer global, plugin;` — the `plugin` layer has higher priority. Toggle swaps the order at runtime (not trivially possible with `@layer` since layers are declared once) OR
- **`data-*` attribute approach**: `[data-theme-priority="global"] .media-card { ... }` vs `[data-theme-priority="plugin"]` unsets global overrides. The latter is simpler but pollutes selector specificity.

Recommendation: **CSS `@layer` approach** with a hardcoded layer order that favors the user's choice. Since `@layer` order can't be changed at runtime, use two sets of layer declarations toggled via a `data` attribute on `<html>`:

```css
/* When global wins: global layer is declared AFTER plugin layer */
[data-theme-priority="global"] {
  @layer plugin, global;
}

/* When plugin wins: plugin layer is declared AFTER global layer */
[data-theme-priority="plugin"] {
  @layer global, plugin;
}
```

If `@layer` scoping in `data` attributes proves inconsistent across browsers, fall back to a simpler approach: global styles use `:where()` for zero specificity, plugin styles use normal selectors. When plugin-wins mode is active, load an additional stylesheet that overrides global values.

### E. Dark Mode Implementation

Dark mode is a token-level concern. The `[data-theme="dark"]` attribute on `:root` reassigns semantic token values:

```css
:root[data-theme="dark"] {
  --color-surface: #1a1a2e;
  --color-surface-elevated: #2d2d44;
  --color-text-primary: #e4e4e7;
  --color-text-secondary: #9ca3af;
  --color-border: #374151;
  --color-border-strong: #4b5563;
}
```

All component styles reference `var(--token-name)`. No component-level changes needed for dark mode. This applies to ALL plugins automatically.

### F. Plugin Build Pipeline Changes

Current pipeline (`scripts/build-plugins.ts`):
1. Each plugin's Vite config includes `@tailwindcss/vite` plugin
2. Each plugin's style.css includes `@import "tailwindcss"`
3. Tailwind generates ~150KB of utility classes per plugin
4. All this is duplicated across every plugin's IIFE bundle

New pipeline:
1. Remove `@tailwindcss/vite` from plugin Vite configs
2. Remove `@import "tailwindcss"` from plugin style.css entries
3. Plugin CSS output becomes minimal — only plugin-specific overrides if any
4. Global theme CSS (`global-theme.css`) loads once at app startup, not per plugin
5. Add `"styling"` field to `plugin.json` manifest:
   - `"global"` (default) — plugin uses the global theme, outputs semantic HTML
   - `"self-contained"` — plugin handles its own styling (legacy mode)
   - `"hybrid"` — plugin uses global theme but adds Tailwind overrides

### G. Plugin Manifest Changes

Add to `PluginManifest` type:

```typescript
styling?: 'global' | 'self-contained' | 'hybrid'
```

Default: `'global'`. When `'self-contained'` or `'hybrid'`, the build pipeline includes Tailwind for that plugin.

### H. File Structure

```
src/
├── tokens.css              ← Design token definitions as CSS custom properties
├── global-theme.css         ← Component class selectors using var(--token)
└── themes/
    ├── light.css            ← Light mode token overrides (if any, beyond defaults)
    ├── dark.css             ← Dark mode token overrides
    └── high-contrast.css    ← High-contrast mode token overrides
```

All plugins are expected to reference the global theme. Plugin CSS files become optional (only for `self-contained` or `hybrid` mode).

### I. Conditional Styling with data-* Attributes

Plugin authors express state via `data-*` attributes on their HTML elements. The global theme handles the visual response:

```html
<!-- Plugin HTML with semantic state -->
<button class="action-btn" data-loading>Watch</button>
<div class="media-card" data-selected>...</div>
<span class="status-badge" data-type="live">LIVE</span>
```

Global theme handles these:

```css
.action-btn[data-loading] {
  opacity: 0.7;
  pointer-events: none;
}
.media-card[data-selected] {
  border-color: var(--color-action-primary);
}
.status-badge[data-type="live"] {
  background: var(--color-error);
  color: white;
}
```

## Testing Decisions

### What makes a good test

- Tests verify external behavior: given a set of HTML classes and data attributes, the correct CSS values are applied
- Tests do NOT verify implementation details (specific selector structure, load order)
- Visual regression tests compare rendered output against known-good screenshots per theme
- Token tests verify that all tokens have defined values and no token references an undefined token

### Seams

**Highest seam: Global theme stylesheet as a CSS file loaded at app start.**
- Test: load `global-theme.css` + `tokens.css` + sample plugin HTML in a headless browser
- Assert: plugin HTML has correct computed styles
- Assert: all `var(--token)` references resolve to defined values
- Assert: `[data-theme="dark"]` correctly reassigns all surface/text/border tokens

**Second seam: Build pipeline plugin styling flag.**
- Test: build a plugin with `styling: "global"` — verify Tailwind is excluded from output
- Test: build a plugin with `styling: "self-contained"` — verify Tailwind is included in output
- Assert: output bundle size differs by ~150KB

### Prior art

- No existing tests in the repo (this is a greenfield testing effort)
- Headless browser testing: Playwright or Puppeteer for CSS computed-style assertions
- Token validation: simple script that parses `tokens.css` and checks for dangling `var()` references
- Visual regression: Playwright screenshot comparison per theme mode

## Out of Scope

- **Structural tokens** — describing component hierarchy in a platform-agnostic way is deferred.
- **Native mobile expansion** (iOS/Android) — this spec covers only the web frontend (Tauri webview). Native rendering will be a future phase.
- **Runtime theme switching animation** — transitions between themes will be instant (no crossfade/transition). Smooth transitions deferred.
- **Design token governance** — versioning, deprecation workflow, and automated PR review for token changes are deferred.
- **Plugin ecosystem** — the class taxonomy and token definitions will be documented, but a full plugin authoring guide is separate work.
- **End-user theme market** — users cannot create or share themes with each other yet.

## Further Notes

- The class taxonomy in this spec is minimal. It will grow as more plugin types are added. Start with what Flux currently needs (media card, feed, button, modal, player) and extend.
- The token set in this spec is a starting point, not the final set. Token values will be refined as the global theme is applied to actual Flux components.
- Plugin authors who previously used Tailwind utility classes in their components will need to migrate. A migration guide should be provided showing the old Tailwind code and the new semantic HTML equivalent.
- The `.scratch/design-token-system/issues/` directory is ready for breaking this spec into implementation tickets.
