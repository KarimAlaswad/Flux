# Design Domains & Resources

Living reference. Grows as the agent encounters new domains during design work.

---

## Plugin Systems
- **Principle:** Hook-based dispatch, capability discovery, recursive modularity
- **Resources:**
  - "Cordis: Reactive Programming for Plugin Systems" (paper.pdf in repo root)
  - "Designing Data-Intensive Applications" — Martin Kleppmann (Ch. 11, event sourcing)
  - Cordis GitHub: https://github.com/cordiverse/cordis
- **Added:** 2026-09-02

## Protocol Design & Wire Formats
- **Principle:** Skeleton/payload separation, backward compatibility, version negotiation
- **Resources:**
  - "Designing Data-Intensive Applications" — Martin Kleppmann (Ch. 5, 8)
  - JSON-RPC 2.0 Specification: https://www.jsonrpc.org/specification
  - Cap'n Proto: https://capnproto.org/
- **Added:** 2026-09-02

## UI Composition & Micro-Frontends
- **Principle:** Component isolation, shadow DOM boundaries, framework-agnostic loading
- **Resources:**
  - "Building Micro-Frontends" — Luca Mezzalira
  - "Micro-Frontend Architectures" (docs/research/micro-frontend-architectures.md in repo)
  - Web Components spec: https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- **Added:** 2026-09-02

## Software Architecture (General)
- **Principle:** Separation of concerns, hexagonal architecture, ports & adapters
- **Resources:**
  - "Clean Architecture" — Robert C. Martin
  - "Fundamentals of Software Architecture" — Mark Richards & Neal Ford
  - "Architecture Decision Records": https://github.com/joelparkerhenderson/architecture-decision-record
- **Added:** 2026-09-02

## Cross-Platform / Skeleton Independence
- **Principle:** Abstract the runtime, plugins are framework-agnostic, host is a thin orchestrator
- **Resources:**
  - Tauri v2: https://v2.tauri.app/
  - Electrobun: https://electrobun.dev/
- **Added:** 2026-09-02

## Developer Experience (DX)
- **Principle:** Convention over configuration, pit of success, progressive disclosure
- **Resources:**
  - "The Pragmatic Programmer" — Hunt & Thomas
  - "A Philosophy of Software Design" — John Ousterhout
- **Added:** 2026-09-02
