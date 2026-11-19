#!/usr/bin/env python3
"""Check the final numeric coverage and standalone SVG exports (stdlib only)."""
from pathlib import Path
import hashlib
import json
import re
import xml.etree.ElementTree as ET

pack = Path(__file__).resolve().parent.parent
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
summary_path = pack / "data/summary.json"
summary = json.loads(summary_path.read_text())
assert summary["coverage"]["complete"] and len(summary["games"]) == 10
charts = []
for game in summary["games"]:
    path = pack / "charts" / (game["id"] + ".svg")
    tree = ET.fromstring(path.read_text())
    ids = [n.attrib["id"] for n in tree.iter() if "id" in n.attrib]
    assert len(ids) == len(set(ids)), path
    axes = [value for value in ids if re.fullmatch(r"axes_\d+", value)]
    assert len(axes) == 4, (path, axes)
    for node in tree.iter():
        assert node.tag.rsplit("}", 1)[-1].lower() not in {"script", "foreignobject", "image", "iframe", "object", "embed"}
        for key, value in node.attrib.items():
            key = key.rsplit("}", 1)[-1].lower()
            assert not key.startswith("on")
            if key == "href":
                assert value.startswith("#"), value
            for target in re.findall(r"url\(([^)]+)\)", value):
                assert target.strip("\"' ").startswith("#"), target
    charts.append({"game": game["id"], "path": "charts/" + path.name, "sha256": digest(path), "panels": 4, "validXml": True, "standalone": True})
result = {"schemaVersion": 1, "baseCommit": summary["baseCommit"], "sourceDigest": summary["sourceDigest"],
          "coverage": summary["coverage"], "watchdogTimeouts": sum(c["timeOuts"] for g in summary["games"] for c in g["cells"]),
          "summarySha256": digest(summary_path), "tablesSha256": digest(pack / "TABLES.md"),
          "charts": charts, "totalPanels": sum(c["panels"] for c in charts), "complete": True}
(pack / "data/final-artifact-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"charts": len(charts), "panels": result["totalPanels"], "coverage": summary["coverage"], "watchdogTimeouts": result["watchdogTimeouts"]}))
