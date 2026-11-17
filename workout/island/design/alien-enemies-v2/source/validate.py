#!/usr/bin/env python3
"""Validate delivered assets, metadata, alpha gutters and the 4,000,000-byte cap.

Requires Python 3, Pillow and NumPy. Reads pixels only; never edits images.
Pass --record to save a compact verification/assets.json evidence file.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = ("small-saucer", "ribbon-conveyor", "diver", "flying-eye", "spiral", "split-blob",
            "shield", "missile", "laser", "dodger", "reinforced", "cloud")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_asset(spec):
    path = ROOT / spec["path"]
    require(path.resolve().is_relative_to(ROOT), f"Escaping asset path: {path}")
    require(path.is_file() and not path.is_symlink(), f"Missing/linked asset: {path}")
    require(path.stat().st_size == spec["bytes"], f"Byte count: {path}")
    require(hashlib.sha256(path.read_bytes()).hexdigest() == spec["sha256"], f"Hash: {path}")
    with Image.open(path) as im:
        require(im.format == "PNG", f"Format: {path}")
        require(im.size == (spec["width"], spec["height"]), f"Dimensions: {path}")
        require("transparency" in im.info or "A" in im.getbands(), f"No alpha: {path}")
        rgba = np.array(im.convert("RGBA"))
    require(int(rgba[:,:,3].min()) == 0, f"No transparent pixels: {path}")
    require(int(rgba[:,:,3].max()) >= 230, f"Sprite too transparent: {path}")
    return rgba


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", action="store_true")
    args = parser.parse_args()
    for name in ("manifest.json", "patterns.json", "preview.html", "preview.js", "preview.css", "catalog.js", "LICENSE.txt", "REPORT.md"):
        require((ROOT / name).is_file(), f"Required file: {name}")
    manifest, patterns = read(ROOT / "manifest.json"), read(ROOT / "patterns.json")
    require(tuple(e["id"] for e in manifest["enemies"]) == EXPECTED, "Twelve requested types/order")
    require(set(patterns["enemies"]) == set(EXPECTED), "Pattern IDs")
    require(manifest["preview"]["viewport"] == [844, 390], "Preview viewport")
    require(manifest["license"] == "CC0-1.0", "License")
    require(len(manifest["damageStates"]) == 3, "Three damage states")
    pattern_file = ROOT / manifest["patternTable"]["path"]
    require(hashlib.sha256(pattern_file.read_bytes()).hexdigest() == manifest["patternTable"]["sha256"], "Pattern hash")
    require(pattern_file.stat().st_size == manifest["patternTable"]["bytes"], "Pattern bytes")
    browser_data = (ROOT / "catalog.js").read_text(encoding="utf-8").split("window.AlienEnemiesV2 = ", 1)[1].removesuffix(";\n")
    require(json.loads(browser_data) == {"manifest": manifest, "patterns": patterns}, "Offline browser data is stale")
    results, atlas_total = [], 0
    for enemy in manifest["enemies"]:
        name = enemy["id"]
        rgba = verify_asset(enemy["assets"]["atlas"])
        atlas_total += enemy["assets"]["atlas"]["bytes"]
        cells = rgba.reshape(4, 256, 6, 256, 4).transpose(0, 2, 1, 3, 4)
        for row in range(4):
            for col in range(6):
                a = cells[row,col,:,:,3]
                require(np.count_nonzero(a > 64) > 8, f"Empty frame {name}/{row}/{col}")
                gutter = (a[:16,:], a[-16:,:], a[:,:16], a[:,-16:])
                require(all(not np.any(side) for side in gutter), f"Alpha gutter {name}/{row}/{col}")
        for row, state in enumerate(("healthy", "scuffed", "patched")):
            anim = enemy["animations"][state]
            require(anim["frames"] == list(range(row*6, row*6+6)) and anim["loop"], f"Animation row {name}/{state}")
            unique = len({hashlib.sha256(cells[row,col].tobytes()).hexdigest() for col in range(6)})
            require(unique == 6, f"Not six distinct motion frames {name}/{state}")
            still = verify_asset(enemy["assets"]["states"][row])
            require(np.array_equal(still, cells[row,0]), f"Poster differs from first motion frame {name}/{state}")
        require(all(not np.array_equal(cells[0,0], cells[row,0]) for row in (1,2)), f"Damage states identical: {name}")
        death = enemy["animations"]["death"]
        require(death["frames"] == [18,19,20,21,22,23] and death["loop"] is False and death["onComplete"] == "remove", f"Death contract {name}")
        require(float(cells[3,5,:,:,3].sum()) < float(cells[3,0,:,:,3].sum())*.25, f"Death does not fade: {name}")
        p = patterns["enemies"][name]
        require(p["maxHp"] >= 3, f"Unreachable damage states: {name}")
        m = p["movement"]
        require(m["durationMs"] >= 4000 and m["loop"], f"Movement timing: {name}")
        points = m["points"]
        require(points[0]["t"] == 0 and points[-1]["t"] == 1, f"Path time coverage: {name}")
        require(all(points[i]["t"] < points[i+1]["t"] for i in range(len(points)-1)), f"Path time order: {name}")
        require(points[0]["x"] == points[-1]["x"] and points[0]["y"] == points[-1]["y"], f"Open path loop: {name}")
        require(all(0 <= point[axis] <= 1 for point in points for axis in ("x","y")), f"Path bounds: {name}")
        a = p["attack"]
        require(a["windupMs"] >= 650 and a["intervalMs"] > a["windupMs"]+a["recoveryMs"]+400, f"Attack warning/recovery: {name}")
        require(a["lockAt"] == "windup-start" and a["retargetAfterFire"] is False, f"Aim lock: {name}")
        require(a["telegraph"]["flash"] is False, f"Flashing telegraph: {name}")
        if a["projectile"]:
            shot = a["projectile"]
            require(1 <= shot["count"] <= shot["maxActivePerEnemy"] <= 3, f"Projectile cap: {name}")
            require(shot["speedPxPerSecond"] <= 100 and shot["homingTurnDegreesPerSecond"] == 0, f"Projectile speed/homing: {name}")
        if a["beam"]:
            require(a["windupMs"] >= 1200 and a["beam"]["activeMs"] <= 400 and a["beam"]["sweepDegrees"] == 0, f"Beam contract: {name}")
        # Exact integer health boundaries choose one and only one damage row.
        for hp in range(1,p["maxHp"]+1):
            rows = [s for s in manifest["damageStates"] if s["hpFractionGreaterThan"] < hp/p["maxHp"] <= s["hpFractionAtMost"]]
            require(len(rows) == 1, f"Ambiguous damage boundary: {name}, hp={hp}")
        results.append({"id":name, "pngFiles":4, "motionFrames":18, "deathFrames":6,
                        "transparentGutterPx":16, "atlasBytes":enemy["assets"]["atlas"]["bytes"]})
    require(atlas_total == manifest["runtimeAtlasBytes"], "Runtime atlas byte total")
    split = patterns["enemies"]["split-blob"]["special"]
    require(split["childCanSplit"] is False and split["maxGeneration"] == 1 and split["childCount"] == 2, "Unbounded splitting")
    provenance = read(ROOT / "source/art-provenance.json")
    require(len(provenance["enemies"]) == 12 and all(len(e["sourceSha256"]) == 64 for e in provenance["enemies"]), "Art provenance")
    record_path = ROOT / "verification/assets.json"
    files = [p for p in ROOT.rglob("*") if p.is_file()]
    require(not any(p.is_symlink() for p in ROOT.rglob("*")), "Symlink in delivery")
    byte_count = sum(p.stat().st_size for p in files if p != record_path)
    require(byte_count < 4000000, f"Budget exceeded: {byte_count}")
    record = {"status":"pass", "enemyCount":12, "spritePngFiles":48, "motionFrames":216,
              "deathFrames":72, "totalFrames":288, "runtimeAtlasBytes":atlas_total,
              "bytesExcludingThisRecord":byte_count, "budgetBytes":4000000,
              "checks":["PNG dimensions and SHA-256", "real alpha in every PNG", "16 px transparent gutters in all 288 frames",
                        "six distinct motion frames per state", "three distinct damage posters", "six-frame non-looping fade",
                        "JSON/browser data parity", "closed movement loops", "aim lock, warnings, projectile/beam/split caps",
                        "unambiguous HP state boundaries", "original artwork provenance", "whole-directory byte budget"],
              "enemies":results}
    if args.record:
        record_path.parent.mkdir(exist_ok=True)
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    actual = sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    require(actual <= 4000000, f"Budget exceeded with record: {actual}")
    print(json.dumps({"status":"pass", "enemies":12, "pngAssets":48, "frames":288,
                      "directoryBytes":actual, "remainingBytes":4000000-actual, "atlasBytes":atlas_total}, ensure_ascii=False))


if __name__ == "__main__":
    main()
