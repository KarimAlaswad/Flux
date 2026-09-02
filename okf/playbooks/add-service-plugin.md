---
type: Playbook
title: "Add Service Plugin"
description: "Step-by-step guide for adding a new internet service plugin to Flux"
resource: "okf/playbooks/add-service-plugin.md"
tags: ["playbook", "plugin", "service", "development"]
generated: "2026-09-02"
sources:
  - "plugins/peertube/"
  - "plugins/youtube/"
  - "CONTEXT.md"
---

# Add Service Plugin

## What Agents Must Know

This playbook walks through adding a new internet service (e.g., Reddit, TikTok, Discord) as a plugin. Service plugins handle authentication, API calls, data formatting, and URL resolution for a specific service.

## Prerequisites

- Understanding of the service's API
- API credentials (if required)
- Knowledge of the media types the service provides

## Steps

### 1. Create Plugin Directory

```bash
mkdir plugins/<service-name>
```

### 2. Create Manifest

Create `plugins/<service-name>/plugin.json`:

```json
{
  "name": "<service-name>",
  "version": "1.0.0",
  "description": "<Description of the service plugin>",
  "author": "Your Name",
  "run": "bun ./main.ts",
  "methods": ["list", "resolve"],
  "hooks": ["feed.<media-type>"],
  "feeds": [
    {
      "type": "<media-type>",
      "card": "<service>-card"
    }
  ]
}
```

**Fields**:

- `name`: Unique identifier (used for RPC routing)
- `run`: Backend command (e.g., `"bun ./main.ts"`)
- `methods`: RPC methods this plugin exposes
- `hooks`: Capability labels for runtime resolution
- `feeds`: What media types this plugin provides

### 3. Create Backend Implementation

Create `plugins/<service-name>/main.ts`:

```typescript
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  try {
    const msg = JSON.parse(line.trim());
    const { id, method, params } = msg;

    let result;
    switch (method) {
      case "list":
        result = await list(params);
        break;
      case "resolve":
        result = await resolve(params);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    // Send response
    console.log(JSON.stringify({ id, result }));
  } catch (e) {
    console.log(JSON.stringify({ id: msg.id, error: e.message }));
  }
});

async function list(params: any) {
  // Fetch items from service API
  // Return { items: [...] }
}

async function resolve(params: any) {
  // Resolve URL or ID to playable media
  // Return { url: "...", title: "...", ... }
}
```

### 4. Create Frontend Card (Optional)

If providing a custom card UI, create `plugins/<service-name>/<service>-card.tsx`:

```tsx
export default function ServiceCard({ item }) {
  return (
    <div className="card">
      <img src={item.thumbnail} alt={item.title} />
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </div>
  );
}
```

### 5. Build and Test

```bash
# Build plugins
bun run build:plugins

# Start dev server
bun run dev

# Test in browser
# Check browser console for errors
# Verify plugin appears in feed
```

### 6. Add to Meta-Plugin (Optional)

If grouping under a service family (e.g., "youtube" meta-plugin):

1. Create `plugins/<meta-plugin>/plugins/<service-name>/` directory
2. Move plugin files there
3. Update manifest paths

## Common Patterns

### Authentication

```typescript
// Store credentials securely
const credentials = await getCredentials();

// Use in API calls
const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${credentials.token}`,
  },
});
```

### URL Resolution

```typescript
async function resolve(params: { url: string }) {
  // Parse URL to extract video ID, etc.
  const videoId = parseUrl(params.url);

  // Fetch video details
  const details = await fetchVideoDetails(videoId);

  return {
    url: details.streamUrl,
    title: details.title,
    thumbnail: details.thumbnail,
  };
}
```

### Error Handling

```typescript
try {
  const result = await apiCall();
  console.log(JSON.stringify({ id, result }));
} catch (e) {
  console.log(JSON.stringify({ id, error: e.message }));
}
```

## Validation Checklist

- [ ] Plugin discovers correctly (`find plugins/ -name "plugin.json"`)
- [ ] Backend spawns without errors
- [ ] RPC methods respond correctly
- [ ] Frontend card renders (if applicable)
- [ ] Feed items appear in UI
- [ ] No console errors in browser

## Related Files

- [`systems/plugin-system.md`](../systems/plugin-system.md) — Plugin architecture
- [`tools/build-plugins.md`](../tools/build-plugins.md) — Plugin build system
- [`workflows/plugin-development.md`](../workflows/plugin-development.md) — Development workflow
