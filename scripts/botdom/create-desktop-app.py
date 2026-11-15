#!/usr/bin/env python3
import json
import plistlib
import shlex
import shutil
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / "node_modules/electron/dist/Electron.app"
target = Path.home() / "Applications/Botdom Next.app"
if target.exists():
    raise SystemExit(f"Refusing to overwrite {target}")
if not source.exists():
    raise SystemExit("Install the repository Electron runtime first")
target.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["ditto", str(source), str(target)], check=True)
contents = target / "Contents"
info = contents / "Info.plist"
with info.open("rb") as f:
    data = plistlib.load(f)
data.update(CFBundleShortVersionString=json.loads((root / "package.json").read_text())["version"], CFBundleName="Botdom Next", CFBundleDisplayName="Botdom Next", CFBundleIdentifier="local.botdom.next.dev", CFBundleExecutable="BotdomNext", CFBundleIconFile="Botdom.icns")
with info.open("wb") as f:
    plistlib.dump(data, f)
shutil.copyfile(root / "electron/resources/Botdom.icns", contents / "Resources/Botdom.icns")
launcher = contents / "MacOS/BotdomNext"
launcher.write_text("#!/bin/sh\n" + "cd " + shlex.quote(str(root)) + "\nexec " + shlex.quote(str(contents / "MacOS/Electron")) + " " + shlex.quote(str(root / "scripts/botdom/desktop-main.mjs")) + ' "$@"\n')
launcher.chmod(0o755)
subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(target)], check=True)
print(target)
