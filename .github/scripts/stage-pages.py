#!/usr/bin/env python3
"""Build Pages from tracked, public runtime files."""
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys

ISLAND = "workout/island/"
RUNTIME_DIRS = (
    "css/", "js/", "icons/",
    "north/css/", "north/fonts/", "north/icons/", "north/img/", "north/js/",
    "workout/css/", "workout/icons/", "workout/img/", "workout/js/",
    "workout/royiki/", "workout/snd/", "workout/3d/", "workout/voice-rec/",
    "workout/cam-lab/models/", "workout/cam-lab/vendor/",
    *(ISLAND + folder + "/" for folder in (
        "activity", "assets", "data", "engine", "episodes", "extensions",
        "learning", "minigames", "presentation", "ui", "vendor", "view")),
    # v24.7: games still load some files of wired design packs that the offline manifest does not list
    # (flag fallbacks such as the previous sounds), so those packs stay published as before.
    ISLAND + "design/",
)
# Review packs that no game loads (the list the workflow kept until v24.6) and audit or patch packages.
UNWIRED_DESIGN = set("""
    hoops-v7 racing-v7 racing-formula racing-audio-v2 defense-v7 alpine-v7 naval-v7 tennis-v7 fire-v7 soccer-v6
    soccer-v7 hoops-v6 broadcast-v1 hoops-motion-v8 soccer-motion-v8 soccer-stadium-v8 hoops-arena-v8 audio-v8 ui-
    kit-v8 ship-chase-models-v1 sirens-vulcan-audio-v1 alien-v16 aliens-controls-v1 alpine-start-lights-v1
    athlete-body-v1 athlete-kits-v1 boars-aim-v1 catch-siren-v3 crowd-audio-v1 fire-building-v1 fire-fx-v1 fire-
    rescue-v1 fire-rooms-v1 fire-tools firefighter-v1 hockey-v1 hockey-v1-fix hockey-v2 hoops-crowd-3d-v1 hoops-
    motion-v10 hoops-motion-v11 hoops-motion-v13 hoops-motion-v9 hoops-ref-scoreboard-v1 hoops-referee-audio-v1
    hoops-tall-v1 motion-fix-v12 naval-air-audio-v1 naval-base-fx-v1 naval-base-models-v1 racing-audio-v4 racing-
    formula-cars-v1 racing-fx-v2 racing-liveries-v1 racing-pit-v1 soccer-kicks-v2 soccer-locomotion-v2 soccer-
    motion-v10 soccer-motion-v11 soccer-motion-v9 soccer-referee-v1 soccer-tackle-keeper-v2 soccer-whistle-
    crowd-v1 tennis-crowd-audio-v1 tennis-grip-v1 tennis-motion-v1 tennis-stadium-v1 tennis-ui-fx-v1 alien-fx-v1
    alpine-themes-v1 athlete-body-v2 catch-audio-v2 refill-enemyfire-v1 soccer-clips-v13 soccer-crowd-3d-v1
    soccer-fx-v1 soccer-pitch-v1 torpedo-sub-v1 tennis-callouts-v1
""".split())
REVIEW_DESIGN = ("-audit-v1", "-patches-v1")
# Licence and attribution notes travel with the files they cover.
NOTICE_NAME = ("license", "licence", "ofl", "dedication", "notice")
ATTRIBUTIONS = {
    "workout/3d/model/License.txt", "workout/cam-lab/vendor/LICENSE",
    ISLAND + "assets/racing/LICENSE.md", ISLAND + "assets/racing-v7/LICENSE.md",
}
ENTRY_FILES = ATTRIBUTIONS | {
    "index.html", "manifest.json", "sw.js",
    "north/index.html", "north/legal.html", "north/survey.html", "north/sw.js",
    "workout/index.html", "workout/manifest.json", "workout/upload-sw.js",
    ISLAND + "offline-sw.js", ISLAND + "release.json",
}
RUNTIME_TYPES = set("""
    .css .html .js .mjs .json .webmanifest .woff .woff2 .ttf .wasm .task .bin
    .avif .gif .jpeg .jpg .png .svg .webp .ico .ktx2 .glb .gltf .fbx
    .mp3 .mp4 .ogg .opus .wav .webm .m4a
""".split())
CAM_LAB = "workout/cam-lab/"
PRIVATE_PARTS = {
    "audit", "docs", "evidence", "iterations", "node_modules", "notes", "private",
    "snapshot", "snapshots", "source", "tests", "tools", "verification",
}


def is_notice(path):
    name = PurePosixPath(path).name.casefold()
    return name.startswith(NOTICE_NAME) or name.endswith("-sources.txt")


def allowed_path(path):
    parts = path.split("/")
    if path.startswith(ISLAND + "design/") and len(parts) > 3:
        pack = parts[3]
        if pack in UNWIRED_DESIGN or pack.endswith(REVIEW_DESIGN):
            return False
    return (
        all(part and not part.startswith(".") and part.casefold() not in PRIVATE_PARTS for part in parts)
        and (path in ATTRIBUTIONS or is_notice(path) or PurePosixPath(path).suffix.lower() in RUNTIME_TYPES)
    )


def runtime_manifest(root):
    data = json.loads((root / ISLAND / "offline-manifest.json").read_text())
    files = data["core"] + data["shell"] + [p for game in data["games"].values() for p in game]
    paths = {ISLAND + p for p in files if p}
    if not all(allowed_path(path) for path in paths):
        raise SystemExit("The offline manifest contains a path outside public runtime")
    return paths


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: stage-pages.py NEW_DESTINATION | --list")
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    listing = sys.argv[1] == "--list"
    target = None if listing else Path(sys.argv[1]).resolve()
    if target and target.exists():
        raise SystemExit("Destination already exists")
    manifest_paths = runtime_manifest(root)
    required = ENTRY_FILES | manifest_paths
    paths = set()
    index = subprocess.check_output(["git", "-C", root, "ls-files", "--stage", "-z"])
    for record in index.decode().split("\0"):
        if not record:
            continue
        entry, path = record.split("\t", 1)
        mode, _, stage = entry.split()
        lab_entry = any(path.startswith(top) and "/" not in path[len(top):] for top in (CAM_LAB, ISLAND))
        if allowed_path(path) and (path in required or lab_entry or path.startswith(RUNTIME_DIRS)):
            source = root / path
            if mode not in {"100644", "100755"} or stage != "0" or not source.is_file() or source.is_symlink():
                raise SystemExit(f"Invalid tracked runtime file: {path}")
            paths.add(path)
    if missing := required - paths:
        raise SystemExit(f"Missing public runtime paths: {', '.join(sorted(missing))}")
    if listing:
        print("\n".join(sorted(paths)))
        return
    target.mkdir()
    for path in sorted(paths):
        output = target / path
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / path, output)
    print(f"Staged {len(paths)} public runtime files")


if __name__ == "__main__":
    main()
