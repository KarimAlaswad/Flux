---
type: Reference
title: Actions Class
description: Low-level InnerTube endpoint executor and playback tracking.
resource: https://ytjs.dev/api/classes/Actions.html
tags: [youtube, actions, innertube]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: actions-api
    resource: https://ytjs.dev/api/classes/Actions.html
    title: Actions API Reference
---

# Actions

Internal class used by `Innertube` to dispatch requests.

# Methods

- `execute(endpoint, args)` — executes an API call. Supports `{ parse: true|false, protobuf, serialized_data, skip_auth_check }`.
  ```ts
  const info = await yt.actions.execute('/player', { videoId, client: 'YTMUSIC', parse: true });
  ```
- `stats(url, client, params)` — playback tracking API.

Property: `session: Session` — the underlying session.
