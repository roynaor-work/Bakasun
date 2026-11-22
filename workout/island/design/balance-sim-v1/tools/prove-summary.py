#!/usr/bin/env python3
"""Rebuild final tables and charts twice from immutable copied input files."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile

pack = Path(__file__).resolve().parent.parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix="balance-summary-proof-") as temporary:
    work = Path(temporary)
    inputs = work / "inputs"
    inputs.mkdir()
    for source in list((pack / "data").glob("baseline-*.json")) + [pack / "data/source-manifest.json"]:
        shutil.copyfile(source, inputs / source.name)
    before = {p.name: sha(p) for p in sorted(inputs.iterdir())}
    rounds = []
    for index in range(2):
        output = work / str(index)
        output.mkdir()
        subprocess.run(["node", str(pack / "tools/summarize.mjs"), "--data", str(inputs),
                        "--output", str(output / "summary.json"), "--tables", str(output / "TABLES.md"),
                        "--charts", str(output / "charts")], check=True, capture_output=True)
        rounds.append({str(p.relative_to(output)): sha(p) for p in sorted(output.rglob("*")) if p.is_file()})
    assert rounds[0] == rounds[1]
    assert len(rounds[0]) == 12
    assert before == {p.name: sha(p) for p in sorted(inputs.iterdir())}
    for name, digest in rounds[0].items():
        actual = pack / "data/summary.json" if name == "summary.json" else pack / name
        assert sha(actual) == digest, name
    summary = json.loads((work / "0/summary.json").read_text())
    assert summary["coverage"]["complete"]
    result = {"schemaVersion": 2, "baseCommit": summary["baseCommit"], "sourceDigest": summary["sourceDigest"],
              "method": "Two independent summary/Markdown/SVG generations from an immutable copy of all final baseline files and their manifest.",
              "coverage": summary["coverage"], "inputHashes": before, "outputHashes": rounds[0],
              "toolHashes": {name: sha(pack / "tools" / name) for name in ("summarize.mjs", "charts.py")},
              "independentRounds": 2, "inputFilesUnchanged": True, "byteIdenticalOutputs": True,
              "deliveredOutputsMatch": True, "complete": True}
    (pack / "data/summary-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"outputs": len(rounds[0]), "inputFiles": len(before), "coverage": summary["coverage"], "complete": True}))
