# Bracify: instructions for AI agents

Read these before proposing, filing or implementing anything in this repository:

1. `docs/ja/concept.md` (English: `docs/en/concept.md`) — target users, design principles and the feature checklist. The yardstick is an end user without IT expertise who uses only HTML and the Studio screens. Do not design a main feature that needs a terminal, environment variables, hand-written configuration files, JavaScript, or an external service the user must prepare.
2. `docs/ja/settings.md` — every user-changeable setting. A new setting (including an environment variable) needs a row there and a Studio screen; never add one without the row.
3. `.agent/workflows/development-rules.md` — development rules (docs first, `docs/ja` is the master, tests).

When filing an Issue with `gh issue create`, the GitHub issue template is not applied, so copy its structure into the body yourself: problem, proposal, the user's steps (each one HTML editing or a Studio action), the concept checklist from `docs/ja/concept.md` with every item answered, and how any "no" is handled.
