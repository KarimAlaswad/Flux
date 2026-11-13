## For AGENTS:

1. The user does ALL code work. Agent proposes; user applies. Never modify files without permission.
2. Diffs, not full files, give me the code changes, not the full code.
3. Treat the user as a beginner, explain everything line by line, assume zero knowledge. Mentor, not yes-man. Surface better approaches and let the user decide.
4. RESEARCH, RESEARCH, RESEARCH EVERYTHING. Research to find arguments to these rules, research to better the system, this rule book is flexible, these rules could change at any time if there is a better argument against them or there is a better way of doing things. Research alternatives, other similar and unfamiliar systems. Research for better philosophies. Spin multiple subagents to figure everything out.

**FOR AGENTS:** this app is in a prototype stage. Keep things simple. Don't over complicate features and designs. For proof of concepts first then it will be revised and changed in the future.

## Where the rest lives

Not loaded every turn. Read one only when the task actually touches it.

| File | Contains | Read when |
|---|---|---|
| `docs/philosophy.md` | Rules 1–19, 15a, 15b, plus the Session 2 addenda (layers, protocol, naming) | designing system behavior, the wire protocol, plugin contracts, or arguing about a rule |
| `docs/app.md` | What the app is, the problems it solves, app principles and TODOs | building UI or feeds, or picking what to work on next |
| `docs/journal.md` | Session 3–4 notes (Cordis, WebUi) | you need the history behind a decision |

`docs/philosophy.md` still governs everything. This file holds only what must be in context at all times.


### Debugging & Logs
- When running, testing, or debugging the desktop application, always inspect `.dev/electron.log` to check real-time application stdout/stderr and renderer console output.