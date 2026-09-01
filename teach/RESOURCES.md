# System Design Resources

## Knowledge

- [Book: _A Philosophy of Software Design_ — John Ousterhout](https://web.stanford.edu/~ouster/cgi-bin/book.php)
  The best short book on software design philosophy. Covers deep modules, information hiding, tactical vs strategic programming. Use for: design philosophy and deciding what goes where.
- [Article: "The Duct Tape Programmer" — Joel Spolsky](https://www.joelonsoftware.com/2009/09/23/the-duct-tape-programmer/)
  Counterpoint to Ousterhout — when pragmatism beats purity. Use for: calibrating how much design is enough.
- [Article: "The Law of Leaky Abstractions" — Joel Spolsky](https://www.joelonsoftware.com/2002/11/11/the-law-of-leaky-abstractions/)
  All abstractions are imperfect. Use for: understanding why plugin boundaries leak.
- [Resource: System Design Interview — Alex Xu (book series)](https://github.com/relogX/system-design-again)
  Concrete walkthroughs of common system designs (URL shortener, chat, etc.). Use for: pattern vocabulary and worked examples.
- [Resource: "How to design a system" — MIT 6.033 (Computer System Engineering)](https://ocw.mit.edu/courses/6-033-computer-system-engineering-spring-2018/)
  MIT's senior-level systems design course. Use for: foundational vocabulary (modularity, naming, consistency, performance).
- [Article: "What I've learned from 100+ system design interviews" — ByteByteGo](https://blog.bytebytego.com/p/what-i-learned-from-100-system-design)
  Pattern catalog of common design mistakes. Use for: what to watch out for.
- [Video: "Designing Data-Intensive Applications" talks — Martin Kleppmann](https://www.youtube.com/watch?v=BvJN5C6I_Ls)
  Author of DDIA. Use for: understanding trade-offs in data flow, especially relevant to Flux's multi-source feed.

## Knowledge (specific to Flux's stack)

- [Tauri v2 IPC documentation](https://v2.tauri.app/develop/plugins/)
  Tauri's plugin and IPC model. Use for: understanding the Rust-to-frontend bridge that underpins Flux.
- [Rust std::process docs](https://doc.rust-lang.org/std/process/)
  The actual subprocess spawning mechanism Flux uses. Use for: understanding the constraints of Flux's plugin model.
- [Web Components Custom Events](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent)
  Flux's cross-component communication mechanism. Use for: event-driven architecture patterns.

## Wisdom (Communities)

- [r/softwarearchitecture](https://reddit.com/r/softwarearchitecture)
  Discussion of real-world architecture decisions. Use for: seeing how others think about trade-offs.
- [Hacker News "Ask HN" threads on architecture](https://hn.algolia.com/?query=architecture&type=story)
  First-hand accounts of what worked and what didn't. Use for: real-world war stories.

## Gaps

- No good hands-on resource for system design *as applied to desktop apps* specifically — most resources assume web services. This workspace will have to bridge that gap ourselves.