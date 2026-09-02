---
type: Reference
title: Parser Namespace
description: Strongly-typed parsing of InnerTube polymorphic responses.
resource: https://github.com/LuanRT/YouTube.js/blob/main/src/parser
tags: [youtube, parser, ytnode]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-09-02T08:55:00Z }
sources:
  - id: guide-advanced
    resource: https://ytjs.dev/guide/advanced-usage.html
    title: Advanced Usage — Using the parser
---

# Parser

Converts raw InnerTube JSON into typed `YTNode` objects with proxy-based arrays (`firstOfType`, `as`).

```ts
import { Parser, YTNodes } from 'youtubei.js';
const page = Parser.parseResponse(JSON.parse(data));
const header = page.header?.item().as(YTNodes.MusicImmersiveHeader, YTNodes.MusicVisualHeader);
const tab = page.contents?.item().as(YTNodes.SingleColumnBrowseResults).tabs.firstOfType(YTNodes.Tab);
const sections = tab.content?.as(YTNodes.SectionList).contents.as(YTNodes.MusicCarouselShelf, YTNodes.MusicDescriptionShelf);
```

Detailed parser structure is documented in `src/parser` on GitHub.
