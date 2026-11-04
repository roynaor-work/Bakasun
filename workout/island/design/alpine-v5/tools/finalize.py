#!/usr/bin/env python3
"""Derive byte counts, hashes and load budgets from the final runtime files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENVS = ["sunset", "fog", "night-floodlit"]


def file_info(path):
    data = (ROOT/path).read_bytes()
    return dict(path=path, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def main():
    assets = json.loads((ROOT/"tools/asset-registry.json").read_text())["assets"]
    files = {}
    for a in assets:
        a["file"] = file_info(a["path"]); files[a["path"]] = a["file"]
        a["provenance"] = "image_gen original background" if a["kind"] == "background" else "original procedural geometry/particles/geometric symbols"
        a["license"] = "See LICENSES.md; repository terms for new AI-assisted works"
        if "metadata" in a:
            a["metadataFile"] = file_info(a["metadata"])
            files[a["metadata"]] = a["metadataFile"]
    environments = []
    for env in ENVS:
        path = f"environments/{env}.json"; config = json.loads((ROOT/path).read_text())
        used = [a for a in assets if a["id"] in config["assets"]]
        resident = {}
        for orientation in ("landscape", "portrait"):
            current = [a for a in used if a["kind"] != "background" or a["orientation"] == orientation]
            resident[orientation] = dict(
                transferBytes=sum(a["file"]["bytes"] + a.get("metadataFile", {}).get("bytes", 0) for a in current),
                decodedTextureBytesRGBA8WithMipmapsUpperBound=sum(
                    int(a["width"]*a["height"]*4*(4/3 if a.get("mipmaps") else 1))
                    for a in current if "width" in a),
                uniqueModelTriangles=sum(a["triangles"] for a in current if a["kind"] == "model"),
                notes="One source allocation per unique texture; excludes framebuffer, render targets and catalog thumbnails. Not a measured mobile GPU allocation.")
        environments.append(dict(id=env,label=config["label"],path=path,environmentIds=[env],file=file_info(path),
                                 assetIds=config["assets"],residentBudgets=resident))
        files[path]=file_info(path)
    manifest = dict(schemaVersion=1, id="island-alpine-v5-environments-fx", created="2026-11-04",
                    integrationStatus="design-assets-ready-for-host-integration",
                    byteUnits="decimal: 1 MB = 1,000,000 bytes", maxFileBytes=1_500_000,
                    units="meters", up="+Y", downhill="+Z", environmentIds=ENVS,
                    environments=environments, assets=assets, files=list(files.values()),
                    runtimeFileBytes=sum(f["bytes"] for f in files.values()),
                    largestRuntimeFile=max(files.values(),key=lambda f:f["bytes"]),
                    preview=dict(path="preview.html", localDependencies=["../../vendor/three.module.js","../../vendor/GLTFLoader.js"],
                                 network="local static server only; no CDN or remote requests"),
                    verification=dict(structural="verification/asset-report.json", gltf="verification/gltf-report.json",
                                      browser="verification/browser-report.json", report="REPORT.md"),
                    policies=dict(load="Only active environment; pick one background orientation. Shared IDs are intentional, not missing attribution.",
                                  modelLoading="Standard GLTFLoader; no Draco, external buffers or external textures.",
                                  atlas="Straight alpha; sRGB; linear filter; no mipmaps; clamp-to-edge; half-texel UV inset.",
                                  surfaces="Repeat; sRGB albedo; linear-data normal and roughness; mipmaps permitted.",
                                  gameplay="Visual assets only. Host owns collision, land events, score and physics."))
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(dict(assets=len(assets),runtimeFiles=len(files),runtimeFileBytes=manifest["runtimeFileBytes"],
                          largestRuntimeFile=manifest["largestRuntimeFile"]),indent=2))


if __name__ == "__main__": main()
