# Module Federation taught in detail as a runtime module system

The previous lesson 0004 (conceptual MF overview) was deleted by the user. A new comprehensive lesson was created covering MF as a practical runtime system.

## What was learned

- MF 2.0 vs Webpack 5 built-in MF: MF 2.0 adds multi-bundler support (Webpack, Rspack, Vite, Rsbuild, Modern.js), auto DTS generation, manifest, runtime plugins, Bridge, async startup, observability, and Chrome DevTool
- The runtime architecture: remoteEntry.js as bootstrap manifest, Share Scope as runtime dependency registry, the full module loading sequence
- Configuration deep dive: exposes (keys must start with `./`), remotes (alias@url format with manifest vs remoteEntry), shared (singleton, requiredVersion, shareKey, shareScope, eager, import, request with trailing slash for subpath imports)
- shareStrategy: version-first (loads all remotes at init, highest version wins) vs loaded-first (on-demand loading, reuses already-loaded deps)
- The Share Scope negotiation algorithm in decision-tree form: first registration, singleton check, version comparison, strategy application
- Type safety: auto-generated @mf-types.zip, consumer tsconfig paths, extractThirdParty/extractRemoteTypes/generateAPITypes, compilerInstance (tsgo)
- Bridge: cross-framework application sharing via render/destroy lifecycle contract, createBridgeComponent/createRemoteAppComponent/createLazyComponent APIs
- Runtime diagnostics: RUNTIME-001 (network), RUNTIME-008 (execution), RUNTIME-006 (async entry), RUNTIME-007 (shared mismatch), FEDERATION_DEBUG mode, observability plugin
- Common gotcha: trailing slash on subpath imports (react-dom/ not react-dom)
- Tied back to Flux: IIFE is right for Flux's independence-at-any-cost constraint; MF or ESM+import-maps would be alternatives if sharing became the priority

## Implications for future lessons

- The glossary needs MF-specific terms added (Share Scope, remoteEntry, Bridge, Host, Remote/Producer, Consumer)
- The MF skill at /home/niri/.agents/skills/mf/ is now a practical toolbelt the user can use — each sub-skill maps to a concept from this lesson
- If the user later wants to experiment with MF on a small side project, they have the conceptual foundation to use the integrate sub-skill
