#!/usr/bin/env python3
"""Write a team file from a running Botdom (Python) backend, for `openmausbot team apply`.

Reads only GET /api/bots and GET /api/channels. Live bots become bots in team "Botdom" (a bot scoped to one
group gets the group's name added, so names stay unique); live, unarchived groups become rooms whose responder
is the group's supervisor. Message history is not carried over.

  python3 scripts/botdom/team-from-botdom.py http://127.0.0.1:8790 > botdom-team.json
"""
import collections, json, sys, urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790").rstrip("/")
get = lambda path: json.load(urllib.request.urlopen(base + path, timeout=30))
all_channels = get("/api/channels")
bots = [b for b in get("/api/bots") if not b.get("deleted_at")]
groups = [c for c in all_channels if c.get("kind") == "group" and not c.get("deleted_at") and not c.get("archived_at")]
group_name = {c["id"]: c["name"] for c in all_channels}
clean = lambda s, n: " ".join((s or "").split())[:n]

def unique(base_name, used):
    name, i = base_name, 2
    while name.lower() in used:
        name, i = f"{base_name} {i}", i + 1
    used.add(name.lower())
    return name

used, names = set(), {}
for b in bots:
    name = clean(b.get("display_name") or b["name"], 80) or "Bot"
    if b.get("scope_channel_id"):
        name = clean(f"{name} · {group_name.get(b['scope_channel_id'], '群')}", 100)
    names[b["id"]] = unique(name, used)

team = {"version": 1, "teams": [{"name": "Botdom"}], "bots": [], "rooms": []}
for b in bots:
    entry = {"name": names[b["id"]], "team": "Botdom"}
    if (b.get("persona") or "").strip():
        entry["soul"] = b["persona"].strip()[:20000]
    team["bots"].append(entry)
room_names = set()
for c in groups:
    members = [names[m] for m in c.get("members", []) if m in names]
    if not members:
        continue
    room = {"name": unique(clean(c["name"], 60) or "群", room_names), "team": "Botdom", "members": members}
    lead = names.get(c.get("supervisor_bot_id"))
    if lead in members:
        room["responder"] = lead
    team["rooms"].append(room)
json.dump(team, sys.stdout, ensure_ascii=False, indent=1)
