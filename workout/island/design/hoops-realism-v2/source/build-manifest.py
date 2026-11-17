#!/usr/bin/env python3
"""Build or check the complete delivery inventory without third-party packages."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "43b27dc235387e3cb737aee9558cdf9d5fd5a262"
LIMIT = 6_000_000


def read(relative):
    return json.loads((ROOT / relative).read_text())


def make():
    files = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path == ROOT / "manifest.json":
            continue
        relative = path.relative_to(ROOT).as_posix()
        if "__pycache__" in path.parts or path.suffix == ".pyc":
            raise ValueError(f"Remove build cache before delivery: {relative}")
        payload = path.read_bytes()
        if relative.startswith("players/") or (relative.startswith("verification/") and path.suffix.lower() in (".png", ".webp", ".jpg")):
            provenance = "MakeHuman/MPFB anatomy from hoops-v7; canonical rebind and original realism-v2 additions; see LICENSES.md"
            license_id = "SEE-LICENSES.md"
        else:
            provenance = "Original hoops-realism-v2 production; referenced tool libraries remain outside this delivery"
            license_id = "CC0-1.0"
        files.append({"path": relative, "bytes": len(payload),
                      "sha256": hashlib.sha256(payload).hexdigest(),
                      "license": license_id, "provenance": provenance})
    return {
        "schemaVersion": 1,
        "id": "hoops-realism-v2",
        "created": "2026-11-17",
        "kind": "design-assets-not-runtime-integration",
        "repository": "roynaor-work/Bakasun",
        "branch": "codex/hoops-realism-v2",
        "baseCommit": BASE,
        "budgetBytes": LIMIT,
        "bytesExcludingManifest": sum(item["bytes"] for item in files),
        "coordinateSystem": {"units": "metres", "up": "+Y", "forward": "+Z"},
        "preview": {"path": "preview.html", "targetViewport": [844, 390],
                    "serveFrom": "repository root over HTTP", "network": "same-origin files only"},
        "sharedPreviewDependencies": [
            {"path": "../../vendor/three.module.js", "license": "MIT", "licenseFile": "../../vendor/LICENSE.three"},
            {"path": "../../vendor/GLTFLoader.js", "license": "MIT", "licenseFile": "../../vendor/LICENSE.three"},
            {"path": "../../vendor/BufferGeometryUtils.js", "license": "MIT", "licenseFile": "../../vendor/LICENSE.three"}
        ],
        "catalogs": {"crowd": "crowd/catalog.json", "players": "players/catalog.json", "audio": "audio/catalog.json"},
        "crowd": read("crowd/catalog.json"),
        "players": read("players/catalog.json"),
        "audio": read("audio/catalog.json"),
        "verification": {"assets": "verification/validation.json", "browser": "verification/browser.json"},
        "licenses": "LICENSES.md",
        "report": "REPORT.md",
        "inventoryRule": "All delivery files except manifest.json itself; byte budget includes manifest.json too.",
        "files": files,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the current inventory without writing")
    args = parser.parse_args()
    expected = make()
    path = ROOT / "manifest.json"
    if args.check:
        if read("manifest.json") != expected:
            raise SystemExit("Manifest is stale; run source/build-manifest.py")
    else:
        path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n")
    actual = sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    if actual > LIMIT:
        raise SystemExit(f"Delivery exceeds budget: {actual:,} > {LIMIT:,} bytes")
    print(json.dumps({"files": len(expected["files"]) + 1, "totalBytes": actual,
                      "budgetBytes": LIMIT, "inventory": "verified" if args.check else "written"}))


if __name__ == "__main__":
    main()
