#!/usr/bin/env python3
"""Build the handoff manifest from the shipped bytes, not estimates.

Run after the model/audio generators and Khronos validation. Python stdlib only.
"""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]


def fingerprint(path):
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def glb_info(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    size, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    doc = json.loads(data[20:20 + size])
    meshes = doc.get("meshes", [])
    counts = [sum(doc["accessors"][p["indices"]]["count"] // 3
                  if "indices" in p else doc["accessors"][p["attributes"]["POSITION"]]["count"] // 3
                  for p in mesh["primitives"]) for mesh in meshes]
    nodes = doc.get("nodes", [])
    clips = []
    for animation in doc.get("animations", []):
        times = [doc["accessors"][sampler["input"]] for sampler in animation["samplers"]]
        clips.append({"name": animation.get("name", ""),
                      "duration_seconds": max(t.get("max", [0])[0] for t in times),
                      "targets": sorted({nodes[c["target"]["node"]].get("name", "")
                                         for c in animation["channels"]})})
    return {"triangles_all_nodes": sum(counts[n["mesh"]] for n in nodes if "mesh" in n),
            "mesh_count": len(meshes), "node_names": [n.get("name", "") for n in nodes],
            "animations": clips, "embedded_resources": True,
            "required_extensions": doc.get("extensionsRequired", [])}


def main():
    assets = []
    for path in sorted((ROOT / "models").glob("*.glb")):
        stem = path.stem
        kind = ("vehicle" if stem == "fire-truck" or stem.startswith("car-") else
                "road_tile" if stem.startswith("road-") else
                "destination" if stem == "house-burning" else "prop")
        item = {"id": stem, "type": kind, "file": str(path.relative_to(ROOT)),
                "format": "glTF 2.0 binary", "license": "CC0-1.0",
                **fingerprint(path), **glb_info(path)}
        if stem.startswith("road-"):
            end = {"road-right": [3, 0, 0], "road-left": [-3, 0, 0]}.get(stem, [0, 0, 3])
            item.update({"tile_size_m": [6, 6], "surface_y_m": 0,
                         "entry": {"position_m": [0, 0, -3], "tangent": [0, 0, 1]},
                         "exit": {"position_m": end, "tangent": [1 if end[0] > 0 else -1, 0, 0]
                                  if end[0] else [0, 0, 1]}})
            if stem == "road-cross":
                item["ports_m"] = [[0, 0, -3], [0, 0, 3], [-3, 0, 0], [3, 0, 0]]
        assets.append(item)
    audio = json.loads((ROOT / "verification/audio.json").read_text())
    for sound in audio["assets"]:
        path = ROOT / sound["file"]
        assert fingerprint(path)["sha256"] == sound["sha256"]
        assets.append({**sound, "type": "audio", "format": "WAV PCM16",
                       "license": "CC0-1.0"})
    vendor = [{"file": str(p.relative_to(ROOT)), "license": "MIT", **fingerprint(p)}
              for p in sorted((ROOT / "vendor").iterdir()) if p.is_file()]
    contracts = {}
    for name in ("truck", "environment"):
        path = ROOT / "verification" / f"{name}-authoring.json"
        if path.exists():
            contracts[name] = json.loads(path.read_text())
    manifest = {
        "$schema": "./manifest.schema.json",
        "schema_version": "1.0.0", "id": "fire-truck-chase-v1", "version": 1,
        "title": "מרדף הכבאית — נסיעה, כניסה וכיבוי",
        "repository": "roynaor-work/Bakasun", "branch": "codex/fire-truck-chase-v1",
        "scope": "Asset/design handoff only; no production game files changed.",
        "coordinates": {"units": "metres", "up": "+Y", "vehicle_forward": "+Z",
                        "wheel_axle": "+X", "ground_y": 0, "handedness": "right"},
        "style": {"reference": "Existing island fire-v7 CC0 vehicle geometry and palette",
                  "palette_srgb": {"truck": "#B82535", "truck_shadow": "#791E2D",
                                   "cream": "#E9E3CC", "steel": "#9DAEAE",
                                   "glass": "#294D61", "rubber": "#202B30"},
                  "brands": False, "lettering_on_models": False},
        "preview": {"entry": "preview.html", "viewport_px": [844, 390],
                    "serve": "HTTP from this folder or the repository root; no build or CDN",
                    "sequence": ["chase", "arrival", "entry", "extinguish", "success_or_timeout"],
                    "production_integration": False},
        "runtime": {"renderer": "three.js r160", "vendor": vendor,
                    "network": "same-origin local files only", "external_media": False},
        "integration": {
            "truck": "Animate named wheel/ladder/nozzle pivots or play the GLB clips. Attach under a gameplay transform parent so clips cannot overwrite world navigation.",
            "civilian_yield": "Play YieldRight once, clamp at the shoulder. Mirror the gameplay parent for the opposite shoulder only when the lane direction requires it; leave model scale positive.",
            "fire_states": "Select exactly one of FlamesLow, FlamesMedium, FlamesHigh by group scale/visibility. Set all hidden after extinguishing. State groups are alternatives, not LODs.",
            "interior": "Hide CutawayFront and Roof for entry view; use the doorway and interior anchors in the environment authoring contract.",
            "audio": audio["integration"],
            "clock": "One mission clock continues across arrival and entry. Pause freezes simulation and suspends audio. Production logic is intentionally separate from this preview."
        },
        "authoring_contracts": contracts,
        "assets": assets,
        "totals": {"glb_files": len(list((ROOT / "models").glob("*.glb"))),
                   "audio_files": len(audio["assets"]),
                   "asset_bytes": sum(a["bytes"] for a in assets)},
        "qa": {"gltf": "verification/assets.json", "audio": "verification/audio.json",
               "browser": "verification/browser.json", "repository": "verification/repository.json",
               "loop_regions": "Full buffer: start frame inclusive 0, end frame exclusive frames; 60–120ms start/stop gain ramps.",
               "lufs_target": -16, "lufs_tolerance_lu": 0.2},
        "license_notes": "LICENSES.md"
    }
    assert manifest["totals"]["glb_files"] == 14, "Expected truck + 6 roads + 4 civilians + 2 props + house"
    assert manifest["totals"]["audio_files"] == 9
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest["totals"]))


if __name__ == "__main__":
    main()
