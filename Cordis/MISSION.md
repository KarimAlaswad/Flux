# Mission: Learn Cordis

## Why

I'm building a modular, plugin-based system (Flux) and I discovered Cordis — a TypeScript meta-framework that formalizes the exact problems I'm trying to solve: dynamic plugin composition, guaranteed cleanup, and reactive dependency management. I want to learn Cordis deeply so I can either adopt it as the foundation for my system or borrow its best ideas. The academic paper behind it defines "spatiotemporal composability" — a programming paradigm that gives formal guarantees about plugin lifecycle. Understanding this will make me a better system designer, whether I use Cordis or not.

## Success looks like

- I can explain what temporal and spatial composability mean, and why they're orthogonal
- I can read the Cordis source code and understand how Context, Fiber, Service, and Events work
- I can write a Cordis plugin that declares dependencies, registers effects, and cleans up properly
- I can evaluate whether Cordis fits as a foundation for Flux (or which pieces to borrow)
- I can articulate the trade-offs between Cordis's approach and Flux's current approach

## Constraints

- Absolute beginner to effect/coeffect theory — but I built Flux, so I understand the practical problems
- TypeScript is not my primary language — I'll need to read TS but think in concepts
- No time pressure — depth over speed
- Flux is the comparison point: every concept maps back to "how does Flux do this today?"

## Out of scope

- Building a production app on Cordis right now
- Contributing to Cordis upstream
- The full mathematical formalism in the paper (algorithms, proofs) — just the ideas
