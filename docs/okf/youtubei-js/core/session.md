---
type: Reference
title: Session Class
description: Manages authentication, signing, and transport for InnerTube.
resource: https://ytjs.dev/api/classes/Session.html
tags: [youtube, session, auth]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-auth
    resource: https://ytjs.dev/guide/authentication.html
    title: Authentication Guide
  - id: guide-cache
    resource: https://ytjs.dev/guide/caching.html
    title: Caching Guide
---

# Session

Created by `Innertube.create(options)` via `SessionOptions`.

# Key Options

`lang`, `location`, `timezone`, `visitor_data`, `cookie`, `cache: UniversalCache`, `fetch`, `client_type`, `device_category`, `enable_safety_mode`, `generate_session_locally`.

# OAuth Events

```ts
innertube.session.on("auth-pending", (data) => {
  /* verification_url, user_code */
});
innertube.session.on("auth", ({ credentials }) => {});
innertube.session.on("update-credentials", ({ credentials }) => {});
await innertube.session.signIn(credentials);
await innertube.session.oauth.cacheCredentials();
await innertube.session.signOut();
```
