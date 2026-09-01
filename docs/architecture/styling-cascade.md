# Flux Styling Architecture — Cascade Model

## The Problem

Flux is fully modular: plugins use different frameworks (React, Web Components, vanilla HTML), nest inside each other via slots, and are authored by different developers. Without a styling architecture, each plugin produces visually disjointed UI.

## The Solution: CSS Custom Properties + DOM Inheritance

CSS custom properties (`--name`) inherit through the DOM tree automatically. This means:

- A theme set at `<html>` flows down to every plugin component
- Plugins consume tokens via `var(--token-name, fallback)`
- Theme authors override tokens at any depth via cascade specificity
- No framework code, no runtime — it's a browser API

## The Three Actors

| Role | Responsibility | Example |
|------|---------------|---------|
| **Token definer** (design system) | Publishes the canonical token set | `--color-surface`, `--space-inset-md` |
| **Plugin author** | Uses `var()` for all visual properties, provides fallbacks | `background: var(--card-bg, var(--color-surface, #fff))` |
| **Theme author** | Overrides tokens at any level | `yt-video-card { --card-bg: #222; }` |

## Cascade Layer Priority (highest to lowest)

| Layer | Who | Scope |
|-------|-----|-------|
| End-user override | User preferences | Root — global |
| Theme override | Theme author | Root or subtree |
| Plugin component | Plugin author | Component scope |
| Base tokens | Token definer | Root — global |
| Hardcoded fallback | Plugin author | Inline in `var()` |

## Plugin Author Contract

Every plugin component MUST:

1. Use `var(--token-name, fallback)` for every visual CSS property
2. Provide sensible fallbacks so the component works without any theme
3. Never hardcode design values (no `#2563EB`, no `16px`)
4. Document which tokens it consumes

## Theme Author Capabilities

Theme authors CAN:

1. Override tokens at `:root` for a global theme (dark mode, brand recolor)
2. Scope overrides to a component class for a partial theme (e.g., only card backgrounds)
3. Override at any depth — the cascade handles priority automatically
4. Combine partial themes (e.g., card theme + typography theme + dark theme)

## Example: Dark Mode

```css
/* Root theme */
:root[data-theme="dark"] {
  --color-surface: #1a1a2e;
  --color-text-primary: #e4e4e7;
  --color-text-secondary: #a0a0b0;
  --color-border: #2d2d44;
}

/* All plugin components automatically update because they use var() */
yt-video-card { background: var(--color-surface); }
peertube-card { background: var(--color-surface); }
feed-widget   { background: var(--color-surface); }
```

## Partial Theme Example

```css
/* A "glass card" partial theme — only affects cards */
yt-video-card, peertube-card {
  --card-bg: rgba(255, 255, 255, 0.05);
  --card-border: rgba(255, 255, 255, 0.1);
  --card-blur: 12px;
}

/* Cards use backdrop-filter; everything else unaffected */
yt-video-card { backdrop-filter: blur(var(--card-blur)); }
```

## Why Not Shadow DOM?

Shadow DOM isolates styles completely — even custom properties need `@property` or `inherit: true` to pierce through. For a platform where theme control is the priority over component isolation, the cascade model (light DOM) is the right foundation. Shadow DOM can be added later for specific high-isolation components (e.g., embeds) with explicit token injection via `AdoptedStyleSheets`.
