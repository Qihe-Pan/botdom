#!/usr/bin/env python3
"""Copy Python Botdom chat history into an existing, stopped Botdom Next workspace."""
import argparse
import collections
import datetime as dt
import hashlib
import json
import mimetypes
import os
import re
from pathlib import Path
import shutil
import socket
import sqlite3
import tempfile
import urllib.request
import urllib.parse
import uuid

NAMESPACE = uuid.UUID('32b567ab-26cf-49d4-b409-d58202d47bc4')


def identifier(kind, source):
    return str(uuid.uuid5(NAMESPACE, kind + ':' + source))


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.history-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def readonly(path):
    connection = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def stamp(value):
    return round(dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)


def map_bots(bots, channels, target):
    group_names = {channel['id']: channel['name'] for channel in channels}
    used, mapped = set(), {}
    for bot in bots:
        if bot.get('deleted_at'):
            continue
        name = ' '.join((bot.get('display_name') or bot['name']).split())[:80] or 'Bot'
        if bot.get('scope_channel_id'):
            name = ' '.join(f"{name} · {group_names.get(bot['scope_channel_id'], '群')}".split())[:100]
        base, suffix = name, 2
        while name.lower() in used:
            name = f'{base} {suffix}'
            suffix += 1
        used.add(name.lower())
        matches = [entry for entry in target if entry['name'] == name]
        if len(matches) != 1:
            raise ValueError(f"Bot identity mapping is ambiguous: {bot['id']}")
        mapped[bot['id']] = matches[0]
    return mapped


def verified_file(root, path, digest, size):
    root = root.resolve()
    path = (root / path).resolve()
    if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size != size:
        return None
    data = path.read_bytes()
    return path if hashlib.sha256(data).hexdigest() == digest else None


def message_recipient(database, source_id, source_bots, mapped, channel_id):
    if not source_id:
        return None
    row = database.execute('SELECT recipient FROM messages WHERE id=?', (source_id,)).fetchone()
    if not row or not row['recipient']:
        return None
    name = row['recipient']
    candidates = [bot for bot in source_bots if name in (bot['id'], bot.get('name'), bot.get('display_name')) and (not bot.get('scope_channel_id') or bot['scope_channel_id'] == channel_id)]
    if len(candidates) == 1 and candidates[0]['id'] in mapped:
        bot = mapped[candidates[0]['id']]
        return {'botId': bot['id'], 'name': bot['name'], 'color': bot.get('color', 'purple')}
    return {'name': name, 'color': 'purple'}


def build_plan(source_db, source_bots, channels, target_data):
    target_data = Path(target_data).resolve()
    bots, groups = read_json(target_data / 'bots.json'), read_json(target_data / 'groups.json')
    mapped = map_bots(source_bots, channels, bots)
    old_bots = {bot['id']: bot for bot in source_bots}
    scoped = {bot['id'] for bot in source_bots if bot.get('scope_channel_id')}
    plans, files, missing, skipped, metadata_updates = [], {}, [], collections.Counter(), []
    with readonly(source_db) as old, readonly(target_data / 'messages.db') as current:
        old.execute('BEGIN')
        for channel in channels:
            if channel.get('deleted_at') or channel.get('archived_at'):
                skipped['archivedOrDeletedChannels'] += 1
                continue
            rows = old.execute('SELECT * FROM chat WHERE channel_id=? ORDER BY created_at,rowid', (channel['id'],)).fetchall()
            if not rows:
                continue
            if channel['kind'] == 'group':
                matches = [group for group in groups if group['name'] == channel['name'] and not group.get('dm')]
                if len(matches) != 1:
                    raise ValueError(f"Group identity mapping is ambiguous: {channel['id']}")
                owner = matches[0]
                old_lead = mapped.get(channel.get('supervisor_bot_id'))
                if old_lead and owner.get('supervisorId') != old_lead['id']:
                    raise ValueError('Group supervisor identity does not match')
                owner_kind = 'group'
            else:
                members = channel.get('members', [])
                if len(members) != 1 or members[0] not in mapped or members[0] in scoped:
                    skipped['unmappedOrSupervisorDirectMessages'] += len(rows)
                    continue
                owner, owner_kind = mapped[members[0]], 'bot'
            history_thread = identifier('channel', channel['id'])
            active_has_messages = current.execute('SELECT 1 FROM messages WHERE thread_id=? LIMIT 1', (owner['threadId'],)).fetchone()
            thread = history_thread if active_has_messages else owner['threadId']
            imported = current.execute('SELECT DISTINCT thread_id FROM messages WHERE id=?', (identifier('message', rows[0]['id']),)).fetchall()
            if len(imported) > 1:
                raise ValueError('History exists in more than one destination')
            if imported:
                thread = imported[0]['thread_id']
            for task in owner.get('tasks', []):
                if task['threadId'] == history_thread:
                    thread = history_thread
            messages, previous = [], None
            for row in rows:
                message_id = identifier('message', row['id'])
                message = {'id': message_id, 'at': stamp(row['created_at']), 'role': 'user' if row['sender'] == 'user' else 'bot',
                           'kind': 'text', 'text': row['content'] or '', 'parentId': previous,
                           'legacyHistory': {'source': 'botdom-python', 'channelId': channel['id'], 'messageId': row['id'], 'kind': row['kind'] or 'message', 'sourceMessageId': row['source_message_id']}}
                if row['kind'] in ('member_report', 'delegation'):
                    recipient = message_recipient(old, row['source_message_id'], source_bots, mapped, channel['id'])
                    if recipient:
                        message['legacyHistory']['recipient'] = recipient
                if message['role'] == 'bot':
                    speaker = mapped.get(row['sender'])
                    old_speaker = old_bots.get(row['sender'])
                    message['from'] = {'botId': speaker['id'] if speaker else identifier('speaker', row['sender']),
                                       'name': speaker['name'] if speaker else (old_speaker or {}).get('display_name') or (old_speaker or {}).get('name') or ('系统记录' if row['sender'] == 'system' else row['sender']),
                                       'color': speaker.get('color', 'purple') if speaker else 'purple'}
                references = []
                for attachment in json.loads(row['attachments_json'] or '[]'):
                    upload = old.execute('SELECT * FROM uploads WHERE id=?', (attachment['id'],)).fetchone()
                    references.append(('upload', upload))
                if row['artifact_id']:
                    artifact = old.execute('SELECT a.*,s.relative_path FROM artifacts a LEFT JOIN artifact_snapshots s ON s.artifact_id=a.id WHERE a.id=?', (row['artifact_id'],)).fetchone()
                    references.append(('artifact', artifact))
                linked_artifacts = {}
                for link in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', row['content'] or ''):
                    match = re.fullmatch(r'(?:https?://127\.0\.0\.1(?::\d+)?)?/artifact/([\w-]+)(?:\?[^ ]*)?', link)
                    linked = None
                    if match:
                        linked = old.execute('SELECT a.*,s.relative_path FROM artifacts a JOIN runs r ON r.id=a.run_id LEFT JOIN artifact_snapshots s ON s.artifact_id=a.id WHERE a.id=? AND r.channel_id=?', (match[1], channel['id'])).fetchone()
                    elif 'run_id' in row.keys() and row['run_id']:
                        path = urllib.parse.unquote(link.removeprefix('file://'))
                        run = old.execute('SELECT root FROM runs WHERE id=? AND channel_id=?', (row['run_id'], channel['id'])).fetchone()
                        if run:
                            full_path = str((Path(run['root']) / path).resolve())
                            matches = old.execute('SELECT a.*,s.relative_path FROM artifacts a LEFT JOIN artifact_snapshots s ON s.artifact_id=a.id WHERE a.run_id=? AND (a.path=? OR a.path=?) AND a.created_at<=?', (row['run_id'], path, full_path, row['created_at'])).fetchall()
                            if matches and len({entry['sha256'] for entry in matches}) == 1:
                                linked = matches[0]
                    if linked:
                        linked_artifacts[linked['id']] = link
                        references.append(('artifact', linked))
                attachments = []
                for file_kind, entry in references:
                    name = Path((entry['name'] if file_kind == 'upload' else entry['path']) if entry else '附件').name
                    root = Path(source_db).resolve().parent
                    source = None
                    if entry:
                        if file_kind == 'upload':
                            source = verified_file(root / 'uploads', entry['path'], entry['sha256'], entry['size'])
                        elif entry['relative_path']:
                            source = verified_file(root / 'artifact_objects', entry['relative_path'], entry['sha256'], entry['size'])
                    if source is None:
                        missing.append({'messageId': row['id'], 'name': name})
                        message['text'] += f'\n\n（旧版附件无法读取：{name}）'
                        continue
                    extension = Path(name).suffix.lower()
                    if not extension or len(extension) > 12 or not extension[1:].isalnum():
                        extension = '.bin'
                    destination = target_data / 'attachments' / (identifier('file', entry['sha256'] + extension) + extension)
                    files[str(destination)] = {'source': str(source), 'sha256': entry['sha256'], 'size': entry['size']}
                    mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
                    attachments.append({'kind': 'image' if mime.startswith('image/') and extension in ('.png', '.jpg', '.jpeg', '.gif', '.webp') else 'file', 'path': str(destination), 'mime': mime, 'name': name})
                    if file_kind == 'artifact' and entry['id'] in linked_artifacts:
                        message['legacyHistory'].setdefault('documentLinks', {})[linked_artifacts[entry['id']]] = str(destination)
                if attachments:
                    message['attachments'] = list({attachment['path']: attachment for attachment in attachments}.values())
                messages.append(message)
                previous = message_id
            existing = {row['id'] for row in current.execute('SELECT id FROM messages WHERE thread_id=?', (thread,))}
            present = sum(message['id'] in existing for message in messages)
            if present and present != len(messages):
                raise ValueError('Partial or changed history import requires explicit recovery')
            if present:
                skipped['alreadyImportedMessages'] += present
                for message in messages:
                    existing_json = current.execute('SELECT json FROM messages WHERE thread_id=? AND id=?', (thread, message['id'])).fetchone()['json']
                    existing_message = json.loads(existing_json)
                    recipient = message['legacyHistory'].get('recipient')
                    updated = False
                    if existing_message.get('legacyHistory', {}).get('source') != 'botdom-python':
                        continue
                    if recipient and existing_message['legacyHistory'].get('recipient') != recipient:
                        existing_message['legacyHistory']['recipient'] = recipient
                        updated = True
                    links = message['legacyHistory'].get('documentLinks')
                    if links and existing_message['legacyHistory'].get('documentLinks') != links:
                        existing_message['legacyHistory']['documentLinks'] = links
                        existing_paths = {attachment['path'] for attachment in existing_message.get('attachments', [])}
                        existing_message.setdefault('attachments', []).extend(attachment for attachment in message.get('attachments', []) if attachment['path'] not in existing_paths)
                        updated = True
                    if updated:
                        metadata_updates.append({'threadId': thread, 'id': message['id'], 'before': existing_json, 'after': json.dumps(existing_message, ensure_ascii=False)})
                continue
            if current.execute('SELECT 1 FROM messages WHERE thread_id=? LIMIT 1', (thread,)).fetchone():
                raise ValueError('History destination is not empty')
            plans.append({'channelId': channel['id'], 'ownerId': owner['id'], 'ownerKind': owner_kind, 'threadId': thread, 'messages': messages})
    return {'bots': bots, 'groups': groups, 'threads': plans, 'files': files, 'missingFiles': missing, 'skipped': dict(skipped), 'metadataUpdates': metadata_updates}


def summary(plan):
    return {'conversations': len(plan['threads']), 'messages': sum(len(thread['messages']) for thread in plan['threads']),
            'files': len(plan['files']), 'missingFiles': len(plan['missingFiles']), 'metadataUpdates': len(plan['metadataUpdates']), 'skipped': plan['skipped']}


def apply_plan(plan, target_data):
    target_data = Path(target_data).resolve()
    if not plan['threads'] and not plan['metadataUpdates']:
        return summary(plan)
    backup = target_data / 'backups' / ('before-history-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(parents=True, mode=0o700)
    with sqlite3.connect(target_data / 'messages.db') as current, sqlite3.connect(backup / 'messages.db') as saved:
        current.backup(saved)
    (backup / 'messages.db').chmod(0o600)
    for name in ['bots.json', 'groups.json']:
        shutil.copy2(target_data / name, backup / name)
    created = []
    database = sqlite3.connect(target_data / 'messages.db')
    try:
        for destination, entry in plan['files'].items():
            path = Path(destination)
            data = Path(entry['source']).read_bytes()
            if len(data) != entry['size'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('Source attachment changed after planning')
            path.parent.mkdir(mode=0o700, exist_ok=True)
            if path.exists():
                if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
                    raise ValueError('Destination attachment collision')
            else:
                with path.open('xb') as stream:
                    stream.write(data)
                path.chmod(0o600)
                created.append(path)
        database.execute('BEGIN IMMEDIATE')
        for update in plan['metadataUpdates']:
            changed = database.execute('UPDATE messages SET json=? WHERE thread_id=? AND id=? AND json=?', (update['after'], update['threadId'], update['id'], update['before'])).rowcount
            if changed != 1:
                raise ValueError('History metadata changed after planning')
        for thread in plan['threads']:
            if database.execute('SELECT 1 FROM messages WHERE thread_id=? LIMIT 1', (thread['threadId'],)).fetchone():
                raise ValueError('Destination changed after planning')
            for message in thread['messages']:
                database.execute('INSERT INTO messages(thread_id,id,at,role,kind,text,json) VALUES(?,?,?,?,?,?,?)',
                                 (thread['threadId'], message['id'], message['at'], message['role'], message['kind'], message['text'], json.dumps(message, ensure_ascii=False)))
            database.execute('INSERT INTO thread_state(thread_id,active_leaf_id) VALUES(?,?) ON CONFLICT(thread_id) DO UPDATE SET active_leaf_id=excluded.active_leaf_id', (thread['threadId'], thread['messages'][-1]['id']))
            owner = next(owner for owner in plan['bots' if thread['ownerKind'] == 'bot' else 'groups'] if owner['id'] == thread['ownerId'])
            task = next((task for task in owner.get('tasks', []) if task['threadId'] == thread['threadId']), None)
            if task is None:
                task = {'threadId': thread['threadId'], 'createdAt': thread['messages'][0]['at']}
                if thread['ownerKind'] == 'bot':
                    task['resumeCursors'] = {}
                owner.setdefault('tasks', []).append(task)
            task.update({'title': '旧版聊天记录', 'updatedAt': thread['messages'][-1]['at'], 'unread': False})
            owner['threadId'] = thread['threadId']
        write_json(target_data / 'bots.json', plan['bots'])
        write_json(target_data / 'groups.json', plan['groups'])
        database.commit()
    except Exception:
        database.rollback()
        for name in ['bots.json', 'groups.json']:
            shutil.copy2(backup / name, target_data / name)
        for path in created:
            path.unlink(missing_ok=True)
        raise
    finally:
        database.close()
    result = {**summary(plan), 'backup': str(backup), 'threads': [{key: thread[key] for key in ('channelId', 'ownerId', 'ownerKind', 'threadId')} for thread in plan['threads']], 'missingFileDetails': plan['missingFiles']}
    write_json(target_data / ('history-import-receipt.json' if plan['threads'] else 'history-metadata-receipt.json'), result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-db', required=True)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--target-data', required=True)
    parser.add_argument('--target-port', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    base = args.source_url.rstrip('/')
    if not base.startswith('http://127.0.0.1:'):
        raise ValueError('Source must be an explicit loopback Botdom service')
    def get(path):
        with urllib.request.urlopen(base + path, timeout=30) as response:
            return json.load(response)
    plan = build_plan(args.source_db, get('/api/bots'), get('/api/channels'), args.target_data)
    if args.apply:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', args.target_port)) == 0:
                raise ValueError('Stop the target backend before applying history')
        result = apply_plan(plan, args.target_data)
        print(json.dumps({key: value for key, value in result.items() if key not in ('threads', 'missingFileDetails')}, ensure_ascii=False))
    else:
        print(json.dumps(summary(plan), ensure_ascii=False))


if __name__ == '__main__':
    main()
