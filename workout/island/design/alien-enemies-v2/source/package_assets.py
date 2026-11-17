#!/usr/bin/env python3
"""Pack generated art; never draws characters. Requires ImageMagick 7.

python3 source/package_assets.py --sources /absolute/path/to/source-map.json
The map associates catalog IDs with original generated 1536x1024 PNGs.
Without --sources, rebuild only JSON/browser data from existing packed PNGs.
Original generations stay outside this size-limited delivery; provenance records
their hashes. Palette reduction and alpha cleanup are deterministic packaging.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STATES = ("healthy", "scuffed", "patched")
ALPHA_OVERRIDES = {"cloud": 70, "dodger": 60}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def asset(path, width, height):
    return {"path": path.relative_to(ROOT).as_posix(), "width": width,
            "height": height, "bytes": path.stat().st_size, "sha256": digest(path)}


def pack(enemy, original, colors):
    magick = shutil.which("magick")
    if not magick:
        raise RuntimeError("ImageMagick 7 (magick) is required for packing")
    out = ROOT / "sprites" / enemy["id"]
    out.mkdir(parents=True, exist_ok=True)
    dims = subprocess.check_output([magick, "identify", "-format", "%wx%h", str(original)], text=True)
    if dims != "1536x1024":
        raise ValueError(f"{original}: expected 1536x1024, got {dims}")
    with tempfile.TemporaryDirectory(prefix="alien-v2-") as tmp:
        tmp = Path(tmp)
        # Remove low-alpha backdrop noise from model output. The same alpha
        # transfer is applied to every frame, preserving antialiasing/fades.
        # Uniform 7/8 scaling adds a guaranteed 16 px transparent frame gutter.
        alpha_floor = ALPHA_OVERRIDES.get(enemy["id"], 28)
        subprocess.run([magick, str(original), "-crop", "256x256", "+repage",
                        "-alpha", "on", "-channel", "A", "-level", f"{alpha_floor}%,99.6%", "+channel",
                        "-resize", "224x224", "-gravity", "center", "-background", "none",
                        "-extent", "256x256", str(tmp / "frame-%02d.png")], check=True)
        frames = sorted(tmp.glob("frame-*.png"))
        if len(frames) != 24:
            raise ValueError(f"Expected 24 frames, got {len(frames)}")
        rows = []
        for row in range(4):
            rows.extend(["(", *map(str, frames[row*6:row*6+6]), "+append", ")"])
        subprocess.run([magick, *rows, "-append", str(tmp / "sheet.png")], check=True)
        subprocess.run([magick, str(tmp / "sheet.png"), "+dither", "-colors", str(colors),
                        "-strip", "-define", "png:compression-level=9",
                        str(out / "atlas.png")], check=True)
        for row, filename in enumerate(("sprite.png", "damage-1.png", "damage-2.png")):
            subprocess.run([magick, str(out / "atlas.png"), "-crop", f"256x256+0+{row * 256}",
                            "+repage", "-strip", "-define", "png:compression-level=9",
                            str(out / filename)], check=True)
    print(f"Packed {enemy['id']}: {sum(p.stat().st_size for p in out.glob('*.png')):,} bytes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path)
    parser.add_argument("--colors", type=int, default=192)
    parser.add_argument("--only", nargs="+", help="Repack only these catalog IDs; requires --sources")
    args = parser.parse_args()
    if not 64 <= args.colors <= 256:
        parser.error("--colors must be 64..256")
    catalog = read(ROOT / "source/catalog.json")
    if args.only and (not args.sources or not set(args.only) <= {e["id"] for e in catalog["enemies"]}):
        parser.error("--only requires --sources and known catalog IDs")
    provenance = read(ROOT / "source/art-provenance.json")
    if args.sources:
        sources = read(args.sources)
        for enemy in catalog["enemies"]:
            if args.only and enemy["id"] not in args.only:
                continue
            original = Path(sources[enemy["id"]]).resolve(strict=True)
            item = next(p for p in provenance["enemies"] if p["id"] == enemy["id"])
            item["sourceSha256"] = digest(original)
            pack(enemy, original, args.colors)
        provenance["packaging"] = {"paletteColors": args.colors, "alphaLevelPercent": [28, 99.6],
                                   "alphaFloorOverridesPercent": ALPHA_OVERRIDES,
                                   "cellScale": 0.875, "transparentGutterPx": 16}
        write(ROOT / "source/art-provenance.json", provenance)

    patterns = {
        "schemaVersion": 1,
        "coordinateSystem": {"origin": "top-left", "xAxis": "right", "yAxis": "down",
                             "position": "normalized playable rectangle, 0..1",
                             "referencePlayfieldPx": [844, 390], "time": "milliseconds",
                             "projectileSpeed": "reference logical pixels per second",
                             "scaling": "scale speeds/radii by min(width/844,height/390)"},
        "rules": {"intervalMeaning": "windup-start to next windup-start",
                  "firstWindupAtMs": 900, "aimSample": "player position at windup start",
                  "death": "stop attacks, cancel windup, clear owned projectiles and children; remove after six frames",
                  "projectileSpawn": "current enemy center at windup end, aim remains locked",
                  "pathInterpolation": "periodic Catmull-Rom, tension 0.5, or piecewise linear; t is normalized loop time",
                  "split": "parent remains, children cannot split and expire after childLifetimeMs",
                  "childAttacks": False, "maxProjectilesGlobal": 12,
                  "maxSimultaneousBeamsGlobal": 1, "playerSafeGapPx": 34,
                  "difficultyMultiplier": 1, "difficultyMayReduceWindup": False,
                  "projectileCollision": "one hit per projectile, then remove",
                  "beamCollision": "at most one hit per beam activation",
                  "noAudio": True, "noCameraShake": True, "noFlashing": True},
        "enemies": {e["id"]: {k: e[k] for k in ("maxHp", "tier", "movement", "attack", "special")} for e in catalog["enemies"]}
    }
    write(ROOT / "patterns.json", patterns)
    manifest = {
        "schemaVersion": 1, "id": "alien-enemies-v2", "version": "2.0.0",
        "titleHe": "חברים מהחלל · 12 אויבים ידידותיים", "created": "2026-11-17",
        "license": "CC0-1.0", "licenseFile": "LICENSE.txt", "byteBudget": 4000000,
        "preview": {"path": "preview.html", "viewport": [844, 390], "offline": True},
        "frame": {"width": 256, "height": 256, "pivot": [128, 128],
                  "columns": 6, "rows": 4, "order": "row-major", "transparentGutterPx": 16,
                  "sourceRect": "x=(frameIndex%6)*256; y=floor(frameIndex/6)*256; w=h=256",
                  "premultipliedAlpha": False, "colorSpace": "sRGB", "filter": "linear",
                  "textureWrap": "clamp-to-edge", "generateMipmaps": False},
        "damageStates": [
            {"id": "healthy", "nameHe": "שלם", "row": 0, "hpFractionGreaterThan": 2/3, "hpFractionAtMost": 1},
            {"id": "scuffed", "nameHe": "שרוט", "row": 1, "hpFractionGreaterThan": 1/3, "hpFractionAtMost": 2/3},
            {"id": "patched", "nameHe": "מטולא", "row": 2, "hpFractionGreaterThan": 0, "hpFractionAtMost": 1/3}],
        "deadWhen": "hp <= 0; play death once, then remove",
        "patternTable": {"path": "patterns.json", "bytes": (ROOT / "patterns.json").stat().st_size,
                         "sha256": digest(ROOT / "patterns.json")},
        "enemies": []
    }
    for enemy in catalog["enemies"]:
        folder = ROOT / "sprites" / enemy["id"]
        entry = {k: enemy[k] for k in ("id", "order", "nameHe", "nameEn", "taglineHe", "accent",
                                      "recommendedDisplaySizePx", "movementLabelHe", "attackLabelHe")}
        entry["patternRef"] = f"patterns.json#/enemies/{enemy['id']}"
        entry["hitbox"] = {"shape": "circle", "center": [128, 128], "radius": enemy["hitRadiusSourcePx"],
                           "space": "source-frame-pixels"}
        entry["assets"] = {"atlas": asset(folder / "atlas.png", 1536, 1024), "states": []}
        entry["animations"] = {}
        for row, state in enumerate(STATES):
            filename = ("sprite.png", "damage-1.png", "damage-2.png")[row]
            entry["assets"]["states"].append({"state": state, **asset(folder / filename, 256, 256)})
            entry["animations"][state] = {"frames": list(range(row*6, row*6+6)), "fps": 6, "loop": True}
        entry["animations"]["death"] = {"frames": list(range(18, 24)), "fps": 8, "loop": False,
                                           "durationMs": 750, "onComplete": "remove"}
        manifest["enemies"].append(entry)
    manifest["runtimeAtlasBytes"] = sum(e["assets"]["atlas"]["bytes"] for e in manifest["enemies"])
    manifest["decodedBytesPerAtlasRGBA8"] = 1536 * 1024 * 4
    write(ROOT / "manifest.json", manifest)
    # Classic script: the preview also works directly from file://, no fetch/CDN.
    (ROOT / "catalog.js").write_text("/* Generated by source/package_assets.py; JSON files are canonical. */\n"
                                    "window.AlienEnemiesV2 = " + json.dumps({"manifest": manifest, "patterns": patterns},
                                                                          ensure_ascii=False, separators=(",", ":")) + ";\n",
                                    encoding="utf-8")
    print(f"Manifest: {len(manifest['enemies'])} enemies; atlas transfer {manifest['runtimeAtlasBytes']:,} bytes", flush=True)


if __name__ == "__main__":
    main()
