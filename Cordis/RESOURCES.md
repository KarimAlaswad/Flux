# Cordis Resources

## Knowledge

- [Paper: "A Programming Paradigm for Spatiotemporal Composability" — Shi, Zhang, Cui (2026)](https://github.com/cordiverse/paper/blob/main/paper.pdf)
  The formal foundation. Sections 1-2 introduce the problem; Section 5 gives the implementation. Use for: understanding why Cordis is designed the way it is, the two dimensions (temporal + spatial), and the guarantee that composition carries from one component to a whole system.

- [Cordis Primer — DeepSeek Harness docs](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer)
  Practical orientation for plugin authors. Covers the five core ideas, dispatch modes, waterfall semantics, and practical rules. Use for: the fastest path to writing a Cordis plugin.

- [Cordis Tutorial — DeepSeek Harness docs](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
  Hands-on walkthrough: first plugin, three plugin forms (function/object/class), declaring dependencies, effects, configuration. Use for: learning by doing.

- [Cordis Source Code — packages/core/src/](https://github.com/cordiverse/cordis/tree/main/packages/core/src)
  Seven TypeScript files that implement the framework: context.ts, fiber.ts, events.ts, registry.ts, reflect.ts, service.ts, utils.ts. Use for: understanding exactly how the runtime works.

- [Cordis Context API Reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context)
  API docs for Context: extend(), isolate(), intercept(), provide(), get(), set(), accessor(), mixin(). Use for: understanding how contexts are created, scoped, and composed.

- [Cordis Fiber API Reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/fiber)
  API docs for Fiber: lifecycle states, effect(), dispose(), restart(), update(). Use for: understanding plugin lifecycle management.

- [Cordis Service API Reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/service)
  API docs for the Service base class: symbols.init, symbols.check, symbols.config, symbols.invoke, symbols.extend. Use for: understanding how services expose capabilities on ctx.

- [Koishi Framework — where Cordis was born](https://koishi.chat)
  Cross-platform chatbot framework with 4,000+ community plugins, all built on Cordis. Use for: seeing what a mature Cordis ecosystem looks like in production.

## Wisdom (Communities)

- [Koishi Discord / Forum](https://koishi.chat/en/)
  The community where Cordis was battle-tested with thousands of plugins. Use for: real-world plugin authoring patterns, edge cases, and design decisions.

- [DeepSeek Harness Discord](https://github.com/deepseek-ai/deepseek-harness)
  Where Cordis plugin authors for the Harness agent system discuss. Use for: seeing how Cordis scales to complex agent architectures.

## Gaps

- No English-language tutorials beyond the DeepSeek Harness docs — most Cordis content is in Chinese (Koishi community)
- No comparison articles between Cordis and other plugin frameworks (e.g., VS Code extensions, webpack plugins, ESBuild)
- No video walkthroughs of Cordis internals
