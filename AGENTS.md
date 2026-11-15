# OpenMausBot agent notes

Before claiming a server or conversation change works, follow
[`docs/verification/README.md`](docs/verification/README.md). Always launch an
isolated fixture; never verify mutations against the user's live app or data.

## Comments

Write a comment only for what the code cannot say:

- a license or attribution notice;
- a fact forced by something outside this code (a vendor, CLI, OS, browser,
  Electron or protocol behaviour), with its version when it has one;
- the doc comment of a public contract: the wire types in `shared/`, the
  driver interface, the preload bridge, `config.json` fields people edit;
- a link to an upstream issue;
- a security invariant or a known open risk.

Do not narrate what the next line does, restate a name, record history ("used
to", "no longer", PR or issue numbers, plan or slice names: git has it), point
at other files, draw banners or leave commented-out code. When our own code
needs a paragraph to explain a surprise, change the code instead: a better
name, a type, an extracted function, one shared helper. A rule ("never X",
"must match Y") belongs in a type, a test or a lint rule. Never suppress a lint
rule that guards correctness; fix the code.

More specific `AGENTS.md` files override this note within their directories.

## Botdom desktop acceptance

- Product UI acceptance is performed only in the desktop application, using an
  isolated fixture and disposable Electron profile. Do not use browser previews
  or Web UI automation as acceptance evidence. Unit tests and static checks may
  still run from the command line. Never substitute a historical installed app
  or the user’s live workspace for the modified desktop build.

## Botdom domain model and visual identity

- There is no product concept of a global Chief of Staff. Each group owns exactly
  one dedicated supervisor. A supervisor is not an employee bot: never list it
  in employee, pin, department, direct-chat or another group's member pickers.
- New groups create their own supervisor; employees may be shared across groups.
  Plain group messages go to its supervisor. Preserve the imported supervisor's
  identity, instructions and saved engine when upgrading existing groups.
- Pinned employee bots stay at the top, independently of collapsed Groups and
  My Bots. Departments organize employees only.
- Reuse Botdom's existing logo, golden supervisor crown, normal-weight Chinese
  typography and quiet purple palette. Align header controls to the member
  cards, accounting for the engine caption above them. Preserve both directions
  of disclosure motion and honor reduced motion.

## Botdom context documents

- Maintain bounded CONTEXT.md indexes for each employee and group. Private notes
  and shared group notes stay separate. Load at most 60 lines / 6 KB of an index;
  retrieve topic documents on demand rather than concatenating every file.
- Task status lives on the group task board (`shared/room-todo.ts`, stored on
  each group conversation). The app sets working/reported from actual turns;
  only the person can set accepted. TASKS.md is optional notes. Never equate a
  bot report or supervisor approval with acceptance.
- Grok Bot migration is retired. Do not restore its popup, settings entry or probe.
