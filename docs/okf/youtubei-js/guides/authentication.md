---
type: Guide
title: Authentication in YouTube.js
description: Cookie and OAuth2 authentication flows for InnerTube.
resource: https://ytjs.dev/guide/authentication.html
tags: [youtube, auth, cookies]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-auth
    resource: https://ytjs.dev/guide/authentication.html
    title: Authentication Guide
---

# Cookies

Recommended for most WEB clients:

```js
const innertube = await Innertube.create({ cookie: '...' });
```

Acquire by copying `Cookie` header from an incognito window after login.

# YouTube TV OAuth2

Limited to TV client after Google changes. Uses device-code flow:

```ts
innertube.session.on('auth-pending', (data) => { /* verification_url, user_code */ });
innertube.session.on('auth', ({ credentials }) => { /* save */ });
await innertube.session.signIn(credentials);
```

Cache with `await innertube.session.oauth.cacheCredentials()`; revoke with `signOut()` / `removeCache()`.
