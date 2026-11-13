"""Rebuild both original uncompressed GLBs: python3 source/build.py. CC0-1.0."""
import json
from pathlib import Path
import plane
import helicopter

root = Path(__file__).resolve().parent.parent
if __name__ == '__main__':
    reports = []
    for module, name in [(plane,'plane'),(helicopter,'helicopter')]:
        reports.append(module.build().export(root / (name+'.glb')))
    print(json.dumps(reports, indent=2))
