#!/usr/bin/env python3
"""Encode browser screenshots as WebP; never changes scene assets."""
import json
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]
report=json.loads((root/"verification/browser-report.json").read_text())
for capture in report["captures"]:
    target=root/capture["output"]
    target.parent.mkdir(exist_ok=True)
    with Image.open(capture["temporaryPng"]) as im:
        im.convert("RGB").save(target,quality=90,method=6)
    capture["screenshotBytes"]=target.stat().st_size
    capture.pop("temporaryPng")
(root/"verification/browser-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(f"Exported {len(report['captures'])} final WebP screenshots.")
