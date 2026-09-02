AI agents: do NOT make any code changes directly. The user will review your suggestions and apply them manually. You may read, explore, and suggest, but never write or edit code files.

Exception: **Markdown files** (`.md`) are editable by the agent — AGENTS.md, CONTEXT.md, docs/adr/*.md, .scratch/**/*. These are docs, not code.

When suggesting code changes, explain everything new you're adding in detail — the user is a beginner learning to program. Include what each piece does, why it's needed, and how it fits together.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Agent behavior rules

- **Fresh Read Rule:** Read `AGENTS.md` fresh every session. Never assume the previous agent kept it accurate. If something looks wrong, say so.
- **Verify before claiming:** Check the actual codebase, not the `.bak` or old docs. Speculative claims waste time — trace execution before proposing fixes.
- **Diffs, not full files:** When suggesting code changes, give targeted diffs or edited snippets, not entire file rewrites.
- **Understand first:** Propose changes only after understanding the root cause. Guessing is unacceptable.

## Philosophy

This is the first session of documenting what I want to do with this system and the app, this is gonna be all over the place but we'll organize later:

1. Fully modular system: Fully modular means 100% modular, which means that everything about this system, is gonna be extensible, modifiable, replaceable, down to the core.
2. The core needs to be as small as possible and as much as possible becomes a plugin.
3. Language Agnostic: every part of the app core or plugins could be written in any language.
4. This system needs to be as independent as possible: that means either software dependencies (packages, crates, modules) or spec dependencies (frameworks like tauri, electron, zero-native, electrobun, others / jsonrpc / front-end technology used like web-technologies, qt, gtk, winui). This system should be more of a way of programming that code dependent system, this system should be as flexible and as evolving as possible no matter what specs are used.
5. The problem with software right now: Open-source software is bottle-necked by the end-developer they are the ones that approve of the changing to the final build of an application, but people have different features they want, different philosophies of making an app, fixes, issues, etc. but the way open-source right now is not it. We need to make software that anyone can contribute to it with exactly what they want to add without going back to a single developer to approve of it. Another issue, a single developer or a few can't handle thousands of prs, issues, features, changes at a consistent rate, so development cycle is very slow, so this system is trying to solve that by having a apps that any one could simply add a plugin and extent it as much as possible and modify it as much as humanly possible without limitations.
6. no hard-coding at a system level, no static APIs, APIs should be dynamic, the community will decide what the API should look like, they will declare the parts of the app that they provide and others call what they need. 
7. No opinionation on a system level: no pre-picking what end-users want, they choose what to use and what appear on their screens, no pre-picking a specific language, front-end engine, frameworks, tools, etc. There is gonna be opinionation at the plugin level but the user still has the option to choose between them and other ones or even having a range between fully picking what they want and what is provided to them so they can stay at any point of that range, for example, this app is eventually gonna allow for meta-plugins that includes a ton of recommended plugins to be installed and pre-configured with a single install button, that's opinionation, so the end-user could choose to stick with that, but let's say they don't want to keep every part of it the same way, they can choose to pick a specific plugins from all of them to install, they can pick how each is configured, they can skip specific plugins from the meta-Plugin, etc.
8. Infinite customizability: every line of code in this system is gonna be changeable, maybe not directly but through a "Lego" style plugin/sub-plugin system, where a plugin is so small that someone could rewrite another one in a different lang and change it completely, and because the entire system is done this way, the entire system becomes a "Shape-Shifter" of sort.
9. Cross-platform: this system should be one codebase that runs on every platform without having to maintain more than one codebase, every plugin should be written to run on both, no rewriting a plugin twice.
10. Let's talk about the Frontend: this system 
11. Developer Experience: should be as simple as possible even above performance, So things should be: Correctness/Safety, Developer Experience, Performance. In that order.
12. The Plugin System Philosophy: Language-agnostic and fully modular. Every feature is a plugin; plugins can be written in any language (Go, Python, Bun/TS, Rust…) because IPC is subprocess stdin/stdout JSON (that's just an example, it could be an way of communication) — “the simplest cross-language IPC.”
13. Skeleton independence. The plugin system is independent of the app framework. The same plugins work on any skeleton — Electrobun, Tauri, or zero-native, dioxus. “Different skeleton per platform is fine. Plugins don’t change.”
14. The host stays dumb. It routes by method prefix and does nothing else — “adding 100+ plugins requires zero changes to routing code.” Host = thin orchestrator: spawn processes, forward messages, open the window, clean up. All real logic lives in plugins.

15. Plugins should work forever: when a developer writes a plugin, the developer should never be tasked to rewrite/maintain the plugin with newer specs, it should be on the system to be back-word compatible with older plugin in the case of spec evolutions or even a complete spec migration. Examples: let's say this system starts with json-rpc as a spec for backend cross-plugin communication, and let's say in the future there's a better spec for whatever benefits it offers, an old plugin that was written to communicate with json-rpc should be be tasked to be maintain with the new spec, but the system should figure a way to make the old plugins that talk with the old spec and the new ones that talk with newer specs to communicate somehow, so it falls on the system to fix migration, maintainability, and evolution of the system, but that's just an example of how the system is considered. and that's takes us to the next rule.

15a. A change to rule 15: Plugins never talk to each other directly. Every message goes Plugin => Skeleton => Plugin. So the skeleton is the only part that touches the wire format, and it can translate between old and new.

15b. The system never defines message content — only the message skeleton.
Every message has two parts. The skeleton: id, method, result, error — the system owns this, and it stays as small as possible. The payloads: everything inside params and result — plugins own this. The system treats payloads as opaque data. It never declares their shape, validates them, or interprets them. If the system doesn’t understand it, it doesn’t touch it.
Rules that make the format regret-proof:
a. skeleton stays tiny. Every system-forced field is a future migration.
b. Unknown fields are ignored, never errors. Adding is always safe.
c. No field is required unless routing depends on it.
d. Method names are just strings. There is no fixed vocabulary to change.
e. If the skeleton itself must change, that’s a new protocol version — bridged by the Skeleton, old plugins untouched.
The only format the system commits to is the manifest — and even that gets the same rules: unknown fields ignored, version field for bridges.

16. Developer Experience: Developer Convenient is one of the most important rules of this system. The Developer Experience comes before Performance. The developer experience should be continuously evolving and becoming easier. It also should be very similar to how developer program on their own projects, so less abstractions, boilerplate code, etc. while providing a ton of benefits to the developer.
17. Modularity over everything. “I don’t want to sacrifice modularity, DX, UX for anything.” Performance is explicitly deprioritized for now with the plan that core plugins ship as fast compiled languages (Rust, Go, Zig) in production, JS being fine “just for prototyping and ease and future modularity and easy migrations.” The wire protocol makes language invisible.
18. Migration-agnostic core. Future core swaps should be “just a quick drop without configuring a lot of things… the core should be as adaptable as possible to core changes.” This motivated shrinking the host by extracting core plugins.
19. 

The App:
The problems it tries to solve: 
1. Websites exposes users to malicious code, a big part of the internet is malicious with viruses/adware/spyware/etc even if it's not malicious in the traditional term but also in dark patterns, addictive layouts, popups, elements everywhere, trackers, browser vulnerabilities or put simply anything that not user desired behavior is considered malicious. And all of that is because of the current systems of servers and clients and how they operate. So this system tries to solve this with the exact opposite which is starting with what the user needs from the server and not the server pushing whichever code it benefits their own goals on the user. And the best approach for this is simply using APIs and some other techniques but the philosophy itself is just whatever the user requires should be the only code running on the client side.
2.

What the app is:
1. One app for every internet API. The long-term goal: a single cross-platform app where every internet service is a plugin — a “unified API client” that replaces having a separate app for YouTube, Discord, Twitter, Instagram, Telegram, Reddit, TikTok, etc. There are a ton of clients for all different services like third-party YouTube clients, Twitter, Discord, Instagram, Telegram, Reddit, etc. but all of them suffer from the same issue, they are not as feature rich as the first-party client, and having to replicate all of the official features is a ton of work for a non-profit open-source application done by mostly a single developer. but what if we make an app that is a third-party client for all of them and pretty much any server ever existed on the internet to fetch data from all of them and put them all in the same place and all developers could work on it at the same time.
2. Content is organized by MEDIA TYPE, not by service. Types include: Posts/Threads, Shorts, Long Videos, Images, DMs/Chat, Live, Music, Books, Shopping, Anime/Manga, Recipes — but that's just an example of a few types it should be “theoretically infinite, one per API endpoint type.”
3. Global Features: Features attach to the media type, not the service. Auto-scroll for shorts → all shorts get it (TikTok + Reels + YT Shorts). Download → all images. Translation → all posts. the same full featured video player for all video types. Community-built features work everywhere instantly — “the community builds features once, and they work for every service with that media type.” No more waiting for YouTube to add a feature you want.
4. Built GRADUALLY. Start with one simple API plugin at a time. When multiple plugins produce the same media type, build a unified feed, then generalized features. “Architecture evolves organically as patterns emerge (no premature abstraction).” It’s “a long-term vision, not a right-now requirement.”
5. I'm not entirely sure if this system is gonna be front-end dependent or not, like do I have to choose a front-end, my plan with this system is to have it independent even from front-end engines by being agnostic so you write the frontend once in like a "design token" way but for the entire frontend but I don't think you can write a global frontend that gets interpreted into any other frontend engine like web, qt, gtk, kotlin, swiftui, etc without writing an interpreter for each. but if I have to choose something like web technologies, a HUGE rule is that this system should be completely FRAMEWORK-AGNOSTIC (using any framework) and FRAMEWORK-VERSION-AGNOSTIC (using any version of every framework).
6. For the frontend: developers would be able to make as many plugins for the same components as possible. For example, we need to slot the old player with the new one without any other changes.

For AGENTS:
1. The user does ALL code work. Agent proposes; user applies. Never modify files without permission.
2. Diffs, not full files, give me the code changes, not the full code.
3. Treat the user as a beginner, explain everything line by line, assume zero knowledge. Mentor, not yes-man. Surface better approaches and let the user decide.
4. RESEARCH, RESEARCH, RESEARCH EVERYTHING. Research to find arguments to these rules, research to better the system, this rule book is flexible, these rules could change at any time if there is a better argument against them or there is a better way of doing things. Research alternatives, other similar and unfamiliar systems. Research for better philosophies. Spin multiple subagents to figure everything out.



Session 2:
again, I don't know what I'm doing, this is all over the place, but i think I'm moving forward, let's start:

1. This system is very layered that nested that I think there are multiple systems at different levels to it. So the uppermost philosophy is far beyond code and more of a way or approach of programming and not tied at all the any specs or code whatsoever.
2. The second layer is the system between the Philosophy and the App, which worries about composition, structure, software architecture.
3. The third layer is the App itself which I think starts at the core/plugin level.
4. adding to rule 15, 15a from session 1: When there's a protocol change (e.g. JSON => msgpack). Each plugin declares its protocol in its manifest ("protocol": "msgpack") but if this field is ommited it should defaults to JSON, and this is an example of a better Developer Experience, reducing a field for less code when possible. The core translates shapes. Meaning doesn't change. Zero plugins rewritten.
5. Sub-plugins: there's a problem with having a system made out of plugins, the system is similar to an Operating System and the Plugins are similar to Applications that if they get too big, they need version control and a single developer's approval of changes to it so it's not modular and we basically be going in a circle, my solution for this is the same solution of the system which is making everything into small plugins, we can just recur that, Recursive Modularity, we just nest the plugin system deeper and deeper infinitely, so instead of just having Core and Plugins, we have core - plugins - sub-plugins- sub-sub-plugins - sub-sub-sub-plugins ... to infinity. I don't know if that's the best way to solve this but it's the only solution that make sense, also this will make plugins a bunch of small language-agnostic pieces that can be easily modified, replaced, extended in any language, which could make the entire system more and more efficient.
6. *** Problem: how to i account for method changes like in the contracts that the plugins speak in, I don't want to force a specific format and i end up regretting it and needing to update/adding/removing or completely changing the format? 
*** Answer: new Rule added 15b
7. Name Conventions Independency: Instead of forcing and looking for a specific name, let's instead look for what that name represent loosing the conventions as much as possible. (e.g. plugin.json), why plugin as a name of the manifest? why not anything else? also why .json? why are we dependent on a spec for no reason when we can make it spec-agnostic? 
*** Answer: The system looks for concepts, not names. A directory is a plugin if it declares itself one. The manifest filename is a bootstrap detail, not a law — it is versioned (manifest_version (optional, defaults to v1 if omitted)), unknown fields are always ignored, and discovery moves toward runtime registration: plugins tell the Registry what capabilities they provide, and consumers ask for capabilities (hooks), never for names. Direct calls by name are a deliberate, documented opt-out, not the default. Format freedom is a bounded, closed list normalized to one object model — never unbounded sniffing, and never two formats that can express different things. Adding a format is an adapter, not a migration. Identity is a stable ID, never a folder name. Concept strings are owned by the system (core-declared hook schemas), versioned by the contract, not by the string.


Session 3:
I had an important realization, I don't have to spent all the time on the philosophy and system design, I can actually starting writing some plugins, even though I know the system might change, because the logic of solving some plugin behaviors is still gonna be the same, maybe the code around that logic will change and will need to be written but i'll take that for writing code and feeling like making progress.

*** Problem: If I want a system without single developer maintaining any substantial part of this system mostly by making the API dynamic/community-driven instead of a static/developer-maintained, this could lead to huge problems, is this even achievable? 

Today, I have found the more important discovery throughout this whole proejct ([Cordis](https://github.com/cordiverse/cordis)), the paper.pdf is in this repo at the top level. Whatever changes this programming paradigm causes to this system, I'm down for it. FOR AGENTS: The current app is not at all a concrete or a statement of what this system/application should be, this system could be completely overhauled if it's beneficial for the future of this.


Session 4:
1. Today I realized I can just work on both at the same time. I don't have to wait until the system is done. I can start working on the logic of the plugins aside from how differently they might plugin into each other in the future.

random app principles:
- Tab persistance: when you switch between tab they should show the data it already loaded as a default behavior. Maybe it could be toggled off as an option.
*** TODO: Tab persistance between restarts.
*** TODO: Default tab option.
*** TODO: empty feeds should show "Install sources to see *media here" button and directs to the marketplace.

- if there is a single feed there should be a plus button to add new feeds and if they add a new feed with no sources, the install new sources button should show
*** TODO: feed tab bar should auto-hide and show on hover to save space. Togglable.

*** FOR AGENTS: this app is in a prototype stage. Keep things simple. Don't over complicate features and designs. For proof of concepts first then it will be revised and changed in the future.

