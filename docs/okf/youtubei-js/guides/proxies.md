---
type: Guide
title: Proxies and Custom Fetch
description: Providing a custom fetch implementation for proxying.
resource: https://ytjs.dev/guide/proxies.html
tags: [youtube, fetch, proxy]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-proxies
    resource: https://ytjs.dev/guide/proxies.html
    title: Proxies Guide
---

# Proxies

Provide a custom `fetch` to intercept and transform requests/responses:

```ts
const yt = await Innertube.create({
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    // modify request, send via your transport, return Response
    return new Response(/* ... */);
  }
});
```
