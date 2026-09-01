# Registry concept established

The user asked "what is a registry" during an architecture grilling session. A dedicated lesson (0003) was created to explain the concept from first principles.

## What was learned

- A registry is a directory that maps capabilities to providers (three-column table: capability, provider, address)
- Flux already has an embedded registry in `lib.rs` via `resolve_hook` and the `state.plugins` vector
- The key architectural insight: separating the registry into its own swappable piece enables true decoupling — plugins find each other by capability, not by name
- Without a registry: plugins hardcode each other's names, the core must know about all plugins, rewriting the core breaks everything
- With a registry: plugins register capabilities, consumers query by capability, the core can be rewritten independently

## Implications for Flux design

- The registry-as-separate-piece decision needs to be made explicitly (our Q5 in the grilling session)
- The `resolve_hook` and `call_hook` commands are already an implicit registry — formalizing them clarifies the architecture
- The registry is NOT a database, message bus, or orchestrator — it only maps capability → provider
- The glossary was expanded with: Registry, Capability, Discovery, Service Locator, Microkernel, Extension Point, Process Supervisor

## Related research

- `reference/research-registries-and-discovery.md` — 8 systems analyzed for registry patterns
- `reference/research-decoupled-architectures.md` — how registries enable true decoupling
- Lesson 0003: lessons/0003-what-is-a-registry.html
