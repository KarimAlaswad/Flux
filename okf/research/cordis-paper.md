---
type: Research
title: "A Programming Paradigm for Spatiotemporal Composability (Cordis)"
description: "Formal foundations for dynamic plugin composition — revertible effects and reactive coeffects — implemented as Cordis"
resource: "paper.pdf"
tags:
  [
    "cordis",
    "plugin-systems",
    "composability",
    "effects",
    "coeffects",
    "research",
  ]
generated: "2026-09-02"
sources:
  - "paper.pdf"
  - "Cordis/"
---

# A Programming Paradigm for Spatiotemporal Composability (Cordis)

**Paper:** Yifan Shi, Wei Zhang, Tianyi Cui — Peking University / DeepSeek-AI (Typst 0.15.1, 2026-08-13, 88pp)  
**File:** [`paper.pdf`](../../paper.pdf)  
**Repo material:** [`Cordis/`](../../Cordis/)

> Don't copy the PDF into OKF. Link to it. OKF stays text-searchable and small.

## What agent must know

Modern plugin/agent systems need **dynamic composition** along two orthogonal axes:

- **Temporal composability** — removing a component completely reverts its side effects.
- **Spatial composability** — components declare dependencies and are reactively notified.

Paper lifts **effects → revertible effects** (every context transformation carries an invertible tracked by runtime) and **coeffects → reactive coeffects** (context changes notify components per their coeffect spec). Both contexts are unified into a single **Context paradigm**, then a **calculus of dynamic composition** carries properties to interleaved systems. Implemented as **Cordis**: core library (effect tracking + coeffect resolution) + declarative component loader with config reconciliation and HMR.

Ch 5–6 map directly to Flux: Ch 5.1 effect tracking / 5.1.2 coeffect ops / 5.2 loader + HMR; Ch 6.2 service multiplexing, 6.3 sandboxing, 6.5 granularity. See `paper.pdf` ToC §5–6.

## Allowed / risky actions

- **Allowed:** Use this paper to justify Flux's hook/skeleton model, HMR, and plugin lifecycle. Cite `paper.pdf` §5.1–5.2, §6.
- **Risky:** Inventing Cordis APIs from the paper — verify against `Cordis/` and `paper.pdf` first.
- **Never:** Paste large PDF excerpts into prompts — reference pages/sections.

## Read next

- [`paper.pdf`](../../paper.pdf) §5 Implementation and Case Study (Koishi) and §6 Discussion
- [`Cordis/MISSION.md`](../../Cordis/MISSION.md), [`Cordis/NOTES.md`](../../Cordis/NOTES.md)
- OKF: [`systems/plugin-system.md`](../systems/plugin-system.md), [`systems/skeleton.md`](../systems/skeleton.md)
- `okf/log.md` for open unknowns about Cordis→Flux adoption
