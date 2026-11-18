#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""Rebuild the original GLB meshes, panoramas, weather data and manifest."""
import hashlib
import json
from pathlib import Path

from course import BASE_CROSS_SECTION, LENGTH, build_gate, build_tile, placements, profiles
from parallax import HEIGHT, WIDTH, build_layers
from props import make_prop
from themes import THEMES, TILES

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 8_000_000


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def describe(path):
    data = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def model(mesh, path, name, category, **extras):
    result = mesh.write(path, name, {"category": category, **extras})
    return {**describe(path), **result}


def build_theme(key, spec, seed):
    folder = ROOT / "assets" / key
    palette = spec["palette"]
    props = []
    for i, (prop, label) in enumerate(spec["props"]):
        mesh = make_prop(prop, palette, seed + i * 37)
        props.append({"id": prop, "label": label, **model(mesh, folder / "props" / f"{prop}.glb",
                      prop, "side-prop", origin="ground contact")})

    tiles = []
    for i, (tile, label) in enumerate(TILES):
        mesh = build_tile(key, tile, palette, seed + i * 149)
        tiles.append({
            "id": tile, "label": label, "startMeters": i * LENGTH, "lengthMeters": LENGTH,
            **model(mesh, folder / "tiles" / f"{i + 1:02d}-{tile}.glb", tile, "track-tile",
                    theme=key, v1Slot=tile, lengthMeters=LENGTH),
            "placements": placements(key, i, props),
        })

    gates = {}
    for kind, z, name in (("start", 0, "התחלה"), ("finish", 8 * LENGTH, "סיום")):
        mesh = build_gate(key, kind, palette, seed)
        gates[kind] = {"label": name, "legend": kind.upper(), "position": [0, -0.12, z],
                       **model(mesh, folder / "signs" / f"{kind}.glb", kind, "course-gate", theme=key)}

    build_layers(folder / "parallax", key, spec, seed + 566)
    parallax = [
        {"id": name, "pixelsPerMeter": speed, "cameraOffsetFactor": yaw, "referenceViewportWidth": 844,
         "width": WIDTH, "height": HEIGHT, "wrapX": True, **describe(folder / "parallax" / f"{name}.webp")}
        for name, speed, yaw in [("sky", 0.09, 3.8), ("ridges", 0.33, 10.2), ("foothills", 0.83, 24.0)]
    ]

    weather_path = folder / "weather.json"
    write_json(weather_path, {"schemaVersion": 1, "seed": seed, **spec["weather"]})
    lighting = dict(zip(["sky", "ground", "sun", "rim", "fog"], spec["light"]))
    return {
        "id": key, "label": spec["name"], "title": spec["title"], "accent": spec["accent"], "lighting": lighting,
        "tiles": tiles, "parallax": parallax, "props": props,
        "weather": {"kind": spec["weather"]["kind"], "label": spec["weather"]["name"], **describe(weather_path)},
        "signs": gates,
    }


def main():
    themes = [build_theme(key, spec, 21189 + i * 4717) for i, (key, spec) in enumerate(THEMES.items())]
    largest_tile = max(tile["bytes"] for theme in themes for tile in theme["tiles"])
    assets = list((ROOT / "assets").rglob("*.*"))
    payload_size = sum(asset.stat().st_size for asset in assets)
    assert payload_size < MAX_BYTES
    write_json(ROOT / "manifest.json", {
        "schemaVersion": 2, "id": "alpine-runner-themes-v2", "assetLicense": "CC0-1.0",
        "base": {"branch": "codex/alpine-runner-v1", "commit": "e726ec0f811d5fdb200362c9a7a6ae6adc4582af"},
        "preview": {
            "path": "preview.html", "viewport": [844, 390],
            "localV1Dependencies": [
                "../alpine-runner-v1/vendor/three.module.js", "../alpine-runner-v1/vendor/GLTFLoader.js",
                "../alpine-runner-v1/vendor/BufferGeometryUtils.js",
                "../alpine-runner-v1/assets/characters/skier-coral.glb",
            ],
        },
        "coordinates": {
            "units": "metres", "up": "+Y", "forward": "+Z", "laneCentersMeters": [-2.4, 0, 2.4],
            "playableWidthMeters": 7.2, "baseSurfaceWidthMeters": 11.2, "tileLengthMeters": LENGTH,
            "courseLengthMeters": LENGTH * len(TILES),
            "ports": {"near": [0, 0, 0], "far": [0, 0, LENGTH], "tangent": [0, 0, 1],
                      "crossSection": BASE_CROSS_SECTION},
            "centerlineSampleFields": ["z", "x", "y", "dx_dz", "dy_dz"],
            "centerlineSamples": profiles(),
            "placementSpace": "Tile-local unless a sign. Add startMeters to z for course space.",
        },
        "format": {"models": "glTF 2.0 GLB", "modelExtensions": [], "images": "WebP", "weather": "JSON + Canvas 2D"},
        "budget": {"maxPackageBytes": MAX_BYTES, "assetBytes": payload_size, "largestTileBytes": largest_tile},
        "counts": {"themes": len(themes), "tiles": 48, "props": 60, "parallaxLayers": 18, "signs": 12, "weather": 6},
        "themes": themes,
    })
    print(f"{len(assets)} assets, {payload_size:,} bytes, largest tile {largest_tile:,} bytes")


if __name__ == "__main__":
    main()
