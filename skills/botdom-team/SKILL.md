---
name: botdom-team
description: "Use Botdom itself: find bots and groups, add a bot, bring bots into a group, hand out work, ask to change or delete a bot. Use when the person or a teammate asks you to create, hire, configure, gather or remove bots, or to set up a group. 当用户或同事让你创建、招聘、配置、拉群、删除 Bot 时使用。"
---

# Working with Botdom from inside a conversation

Every bot in Botdom may use the team tools below. You do not need to be a "Chief of Staff", an HR bot or a supervisor, and
you never need to hand the request to someone "with permission". If a tool is in your list, it is yours to use.

Only use these tools. Never call Botdom's local address with `curl` or a script, and never edit Botdom's data files: those
requests are refused, and they are not how changes are made here.

## Look before you change

- `list_bots`: every bot you can reach, with its exact id, group (分组), model and status.
- `list_rooms`: the groups (群) you belong to and their members.
- `list_team_setup`: exact engine and model ids. Never invent a model id; if the model the person named is not listed, say so
  and name what is available.

## Add a bot

`create_bot` with a `name`, a one-line `role`, and `instructions` (what it does and how it works). Leave `modelSelection`
out for the default model, or copy an exact id from `list_team_setup`.

- In a Full access conversation the bot is added at once and the person can undo it.
- Anywhere else the person sees a card and confirms. Say that it is waiting; do not report it as created.
- A bot you add starts by asking before it acts. Only the person raises that.
- At most four bots in one turn, and bots together may add eight an hour. If you are told the limit is reached, stop and
  tell the person; do not look for another way.
- The new bot lands in your own 分组. Moving bots or groups between 分组 is the person's choice.

After it exists, give it work with `coordinate_bots`, or bring it into a group.

## Groups

- `manage_room` with `action: "create"` opens a new group with the bots you name. Botdom gives the group its own
  supervisor; you do not pick or create one.
- In a group you belong to, `add_members` brings bots in.
- Renaming a group, changing its bulletin, removing members and opening a new thread belong to that group's supervisor
  and the person. If you are an ordinary member, ask the supervisor in the group.
- A supervisor works only in its own group. Never add a supervisor to another group, and never remove one.

## Changing or deleting a bot

- `propose_team_setup` changes another bot's name, role, instructions, model or working folder.
- `propose_bot_deletion` asks to delete one named bot, and only when the person asked for exactly that.

Both always go to the person as a card, at every access level. Tell the person the card is waiting and what it will do.
A group's supervisor can not be changed or deleted this way at all.

## What only the person does

Access levels (Ask / Full access), moving anything between 分组, removing a group's supervisor, and approving cards.
When a tool refuses, report the refusal in one plain sentence and stop. Do not retry through another tool, another bot,
or the shell.

## Report honestly

Say what the tool returned: created, waiting for the person, or refused and why. Check with `list_bots` before you claim
a bot exists.
