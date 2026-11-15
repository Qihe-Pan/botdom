# Botdom on OpenMausBot: handoff

Date: 2026-11-08. Reader: Codex, taking over development.

## 1. What this is

The user decided to rebuild Botdom on top of OpenMausBot instead of continuing the Python version or writing a new UI by hand. They want OpenMausBot's code used as-is wherever possible ("copy its code, don't write your own"), with Botdom's identity and a few Botdom behaviours on top.

- This repository: `/Volumes/DISK/projects/botdom-next`, branch `botdom`.
- Base: OpenMausBot commit `268b46f` (Apache-2.0), cloned from `/private/tmp/oss-ref/OpenMausBot`. Upstream history is kept for attribution.
- `enterprise/` was deleted (it is separately licensed). Do not bring it back or copy from it. `third_party/` keeps its own licenses.
- The old Botdom (Python, `grok-bot-projects-v0.2`, port 8790, database `Luna-Bot/data/bot.sqlite3`) is still the user's working product. Treat it and its data as read-only. Do not restart 8790.

## 2. How to run

```bash
cd /Volumes/DISK/projects/botdom-next
export OMB_DATA_DIR=$HOME/.botdom-next OMB_PORT=8820 OMB_UI_PORT=5220
corepack pnpm@10.33.0 dev:server   # backend on 127.0.0.1:8820
corepack pnpm@10.33.0 dev          # UI on http://127.0.0.1:5220/
```

- Data must stay on the internal disk. On `/Volumes/DISK` the data-directory lease fails with `ENOTSUP` (no hard links).
- Ports are separate on purpose: the user's installed OpenMausBot app uses 8799 and `~/.openmausbot`. Do not use either.
- Checks: `npx tsc -b` (UI) and `npx tsc -p tsconfig.server.json --noEmit` (server). The full upstream test suite has not been run on this branch.

## 3. Done so far (commits after `268b46f`)

| Commit | Change |
|---|---|
| `171fcad` | Start from OpenMausBot; remove `enterprise/` |
| `e0302d4` | Default brand: name Botdom, accent `#6E52C0`, Botdom logo and favicon (`server/brand.ts`, `src/lib/brand.ts`, `public/app-icon.svg`, `index.html`) |
| `fbb111f` | Botdom bot faces replace the upstream mascot: `src/components/BotdomFace.tsx`, images in `public/bot-3d/` (88 PNGs from old Botdom). `MausAvatar` renders `BotdomFace`; role from the bot's name, tone from its colour |
| `ea858b7` | `scripts/botdom/team-from-botdom.py`: reads old Botdom `GET /api/bots` and `/api/channels`, writes a team file |
| `f3e7cba` | New bots start with an empty conversation: no "Hi, I'm …" greeting and no "What should I help you with first?" card (`server/store.ts`, seeding only when `seedMessages === true`) |
| `494bb95` | Botdom bot motion: eyes follow the pointer, squash on press, hop on state change, rock while working, sway while waiting, float while thinking, double blink; reduced motion respected (`BotdomFace.tsx`, `src/styles.css`) |
| `6cdd2e6` | Menus and pickers open with Botdom's slide-down motion (140 ms), overriding upstream `animate-pop-in`/`pop-out` |
| `81226de` | A bot's harness is fixed after creation: the model picker lists only the bot's own driver kind (`ModelPicker.tsx`), and `PATCH /api/bots/:id` refuses a selection on another driver kind (`server/routes/bot-patch.ts`). Reasoning effort is Botdom's slider (`src/components/EffortSlider.tsx`), used in `SimpleModelMenu` and `EffortRow` |

Data already imported into `~/.botdom-next` (via `openmausbot team apply`): 40 live bots with their personas, in team "Botdom", and 4 live groups as rooms whose responder is the group's supervisor. Bots scoped to one group got the group name appended so names are unique. The 40 seeded greetings were deleted afterwards; a backup is at `~/.botdom-next/messages.db.bak-before-greeting-removal`.

## 4. The user's rules (keep these)

- Use OpenMausBot's code and layout. Do not hand-write replacement UI; change it only where Botdom differs.
- Keep Botdom's name, logo, purple accent and bot faces. Never show the upstream mascot.
- Keep Botdom's motion: bot interactions and dropdown/menu animation. Respect reduced motion.
- A bot's harness cannot change after it is created; only its model and effort can.
- Reasoning effort uses the Botdom slider, not buttons or a select.
- No canned greeting or setup card when a bot is created.
- Write user-facing text in plain language. The user reads Chinese.

## 5. Open work, in rough priority

1. **Codex speed.** Both old Botdom and OpenMausBot start `codex app-server` per turn. OpenMausBot is slower because it mounts its own MCP tool servers each turn and waits for every one to report started (up to 30 s each, `server/drivers/codex.ts` around `mcpStartup.settled`, `server/drivers/codex-mcp-startup.ts`), and it caps concurrent launches (`server/drivers/codex-process.ts`, `OMB_CODEX_LAUNCH_SLOTS`). Measure first, then reduce mounted servers or start the turn without waiting. Not yet measured.
2. **Leftover upstream names.** UI text still says OpenMausBot/MausBot in places (for example the chief bot is named "MausBot", locale strings, onboarding copy). Replace with Botdom wording. Keep upstream names in licence notices.
3. **Per-bot models.** Imported bots use the default model. Old Botdom kept a model and connection per bot (35 on `codex_session`, 4 on two API connections). Map them; respect the harness lock.
4. **Botdom-only features** not yet present: group member card strip with status (the user explicitly wants this kept), group checklist, task progress, supervisor coordination. Port onto OpenMausBot's room view.
5. **Message history import** was declined for now. Do not import without asking.
6. **Status halos** on avatars (old Botdom had concentric rings per state) are not ported.
7. **Desktop packaging** of this version has not been done. Upstream uses `electron/` and `electron-builder.yml`.
8. **Licence notice.** Add a Botdom `NOTICE`/README section stating it is a modified OpenMausBot (Apache-2.0) and listing changed areas.

## 6. Not verified

- The effort slider was not dragged (doing so changes a real bot's setting).
- The server-side harness refusal was type-checked, not exercised with a request.
- Bot motions other than gaze were not seen in a real working state.
- Only the desktop width in light mode was looked at.

## 7. Cautions from this session

- Testing in the UI can trigger real model turns on the user's accounts. A scripted click once sent "Hi?" to the chief bot and produced a real Codex reply. Click only elements identified by role and label, never by guessed coordinates or loose text matches; prefer isolated test data.
- Do not read secrets or `config.local.json` from the old Botdom.
- The old Botdom worktrees (`.worktrees/s0-design` and others) belong to the previous product; `claude/topbar` and `codex/ts-web` are abandoned experiments, uncommitted or unmerged, and can be ignored.
