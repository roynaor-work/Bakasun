"""Check the delivered render evidence, without altering any image pixels."""
from pathlib import Path
from PIL import Image, ImageStat
import hashlib
import json
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {(390, 844, "near"), (390, 844, "far"),
            (844, 390, "near"), (844, 390, "far")}
report = {"generatedAt": datetime.now(timezone.utc).isoformat(),
          "rounds": [], "archives": [], "errors": []}
rounds = sorted(p for p in (ROOT / "iterations").iterdir()
                if p.is_dir() and len(p.name) == 2 and p.name.isdigit())
for folder in rounds:
    capture = json.loads((folder / "capture.json").read_text())
    actual = set()
    frames = []
    for frame in capture["captures"]:
        p = folder / frame["file"]
        viewport = frame["viewport"]
        key = (viewport["width"], viewport["height"], frame["camera"])
        actual.add(key)
        with Image.open(p) as image:
            image.load()
            if image.size != key[:2]:
                report["errors"].append(f"{p.relative_to(ROOT)}: wrong dimensions")
            rgb = image.convert("RGB")
            variance = sum(ImageStat.Stat(rgb).var) / 3
            if variance < 20:
                report["errors"].append(f"{p.relative_to(ROOT)}: nearly blank")
        frames.append({"file": frame["file"], "dimensions": list(key[:2]),
                       "camera": key[2], "bytes": p.stat().st_size,
                       "pixelVariance": variance,
                       "sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
        if frame["engine"] != "160" or frame["horizontalOverflow"]:
            report["errors"].append(f"{folder.name}: runtime or overflow mismatch")
    if len(frames) != 4 or actual != EXPECTED:
        report["errors"].append(f"{folder.name}: missing required view")
    if len({f["sha256"] for f in frames}) != 4:
        report["errors"].append(f"{folder.name}: duplicated views")
    if not capture["passed"] or capture["errors"] or capture["externalRequests"]:
        report["errors"].append(f"{folder.name}: capture did not pass")
    if not (folder / "CRITIQUE.md").is_file():
        report["errors"].append(f"{folder.name}: missing critique")
    report["rounds"].append({"round": folder.name, "frames": frames,
                              "startedAt": capture["startedAt"],
                              "completedAt": capture["completedAt"]})
    for archive in sorted(folder.rglob("frames.zip")):
        with zipfile.ZipFile(archive) as z:
            bad = z.testzip()
            if bad:
                report["errors"].append(f"{archive.relative_to(ROOT)}: bad CRC {bad}")
            entries = []
            for name in z.namelist():
                if not name.endswith(".webp"):
                    report["errors"].append(f"unexpected archive member {name}")
                payload = z.read(name)
                entries.append({"file": name, "bytes": len(payload),
                                "sha256": hashlib.sha256(payload).hexdigest()})
            report["archives"].append({"file": str(archive.relative_to(ROOT)),
                                       "crcPassed": bad is None, "frames": entries})

if len(rounds) < 6:
    report["errors"].append("Fewer than six rounds")
final = json.loads((rounds[-1] / "capture.json").read_text())
report["finalRoundSourceHashes"] = final["sourceHashes"]
for filename, expected in final["sourceHashes"].items():
    actual = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()
    if actual != expected:
        report["errors"].append("Final capture differs from current source: " + filename)
report["requiredScreenshotCount"] = len(rounds) * 4
report["passed"] = not report["errors"]
(ROOT / "verification" / "render-evidence.json").write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"passed": report["passed"], "rounds": len(rounds),
                  "requiredScreenshots": report["requiredScreenshotCount"],
                  "archives": len(report["archives"]), "errors": report["errors"]}))
raise SystemExit(0 if report["passed"] else 1)
