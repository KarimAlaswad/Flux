# Journal

Session notes. Historical context, not rules.

## Session 3:

I had an important realization, I don't have to spent all the time on the philosophy and system design, I can actually starting writing some plugins, even though I know the system might change, because the logic of solving some plugin behaviors is still gonna be the same, maybe the code around that logic will change and will need to be written but i'll take that for writing code and feeling like making progress.

Problem: If I want a system without single developer maintaining any substantial part of this system mostly by making the API dynamic/community-driven instead of a static/developer-maintained, this could lead to huge problems, is this even achievable?

Today, I have found the more important discovery throughout this whole proejct ([Cordis](https://github.com/cordiverse/cordis)), the paper.pdf is in this repo at the top level. Whatever changes this programming paradigm causes to this system, I'm down for it. FOR AGENTS: The current app is not at all a concrete or a statement of what this system/application should be, this system could be completely overhauled if it's beneficial for the future of this.

## Session 4:

- huge change in the tooling, the Linux webkit2gtk is notoriously buggy and is unusable. I had to make a decision so i found a library called "WebUi" that opens the app in the user's browser without embedding a browser and node process in the app like electron does. It's amazing so far.
- Today I realized I can just work on both at the same time. I don't have to wait until the system is done. I can start working on the logic of the plugins aside from how differently they might plug into each other in the future.
