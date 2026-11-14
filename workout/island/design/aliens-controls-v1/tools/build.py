#!/usr/bin/env python3
"""Build original, font-independent SVG controls and matching 128px RGBA PNGs.

Requires Python 3, Pillow, and Inkscape. Run from any working directory.
Only writes inside this asset package. No network access is used.
"""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STATES = ("normal", "pressed", "disabled")
SPECS = {
    "fire": ("ירי רגיל", "Regular fire", "#E8F6FF", "button"),
    "vulcan": ("וולקן", "Vulcan", "#FFD28A", "button"),
    "missile": ("טיל", "Missile", "#B5C7FF", "button"),
    "bomb": ("פצצה", "Bomb", "#FFB7AA", "button"),
    "energy": ("אנרגיה", "Energy", "#A4F0CD", "meter"),
    "shield": ("מגן", "Shield", "#A8DEFF", "meter"),
}
GLYPHS = {
    "fire": '<path d="M58 80V44l6-14 6 14v36M53 80h22M58 48h12M43 51v15m42-15v15"/>',
    "vulcan": '<path d="M49 69V43m15 26V36m15 33V43M44 69h40v9H44zM45 36v-7m38 7v-7M60 25h8"/>',
    "missile": '<g transform="rotate(30 64 58)"><path d="M54 75V47q0-16 10-24 10 8 10 24v28zM54 58l-12 18 12-3m20-15 12 18-12-3M58 84l6 12 6-12"/><circle cx="64" cy="48" r="5"/></g>',
    "bomb": '<path d="M57 39v-8h14v8M71 31q0-12 11-12M86 17l5-3m-4 10 6 1M52 61q2-9 11-10"/><circle cx="64" cy="65" r="25"/>',
    "energy": '<path d="M68 34 50 61h13l-4 18 20-28H65z"/>',
    "shield": '<path d="m64 33 20 8-3 20q-3 12-17 19-14-7-17-19l-3-20zM64 45v20m-8-12h16"/>',
}
# Small numeric glyphs are vector strokes, so exports never depend on a font.
SEGMENTS = {"a": (2, 1, 9, 1), "b": (10, 2, 10, 9),
            "c": (10, 11, 10, 18), "d": (2, 19, 9, 19),
            "e": (1, 11, 1, 18), "f": (1, 2, 1, 9), "g": (2, 10, 9, 10)}
DIGITS = dict(zip("0123456789", ("abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg")))


def digits(value, color):
    value = str(value)
    start = 64 - (len(value) * 15 - 4) / 2
    paths = []
    for i, digit in enumerate(value):
        for segment in DIGITS.get(digit, "g"):
            x1, y1, x2, y2 = SEGMENTS[segment]
            paths.append(f'<path d="M{x1 + start + i * 15:g} {y1 + 88}h{x2-x1}"/>' if y1 == y2 else
                         f'<path d="M{x1 + start + i * 15:g} {y1 + 88}v{y2-y1}"/>')
    return f'<g id="value-digits" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round">' + ''.join(paths) + '</g>'


def svg_for(key, state):
    _, label, accent, kind = SPECS[key]
    disabled, pressed = state == "disabled", state == "pressed"
    icon = "#A9BAC5" if disabled else accent if pressed else "#F2F8FC"
    edge = "#8A9CA9" if disabled else accent if pressed else "#B2C5CF"
    opacity = ".78" if disabled else ".90" if pressed else ".72"
    dash = ' stroke-dasharray="6 6"' if disabled else ""
    title = f"{key}-{state}-title"
    value = {"vulcan": 36, "energy": 82, "shield": 64}.get(key)
    if key == "vulcan" and pressed:
        value = 72
    if disabled and value is not None:
        value = 100 if key == "vulcan" else 0
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-labelledby="{title}" data-component="{key}" data-state="{state}">',
             f'<title id="{title}">{label} — {state}</title>',
             '<g id="control">',
             f'<rect x="12" y="12" width="104" height="104" rx="30" fill="#07131F" fill-opacity="{opacity}" stroke="{edge}" stroke-width="2.8"{dash}/>']
    if pressed:
        parts.append(f'<rect x="19" y="19" width="90" height="90" rx="24" fill="{accent}" fill-opacity=".07" stroke="{accent}" stroke-width="1.5"/>')
    if value is not None:
        color = "#FFAE9E" if disabled and key == "vulcan" else "#A9BAC5" if disabled else "#A4F0CD" if key == "vulcan" and value < 60 else accent
        parts.extend(['<circle cx="64" cy="57" r="36" fill="none" stroke="#566874" stroke-width="4"/>',
                      f'<circle id="value-ring" cx="64" cy="57" r="36" pathLength="100" transform="rotate(-90 64 57)" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="{value} 100"/>'])
    transform = ' transform="translate(0 1.5)"' if pressed else ""
    if key == "vulcan":
        transform = ' transform="translate(16 10) scale(.75)"'
    parts.append(f'<g id="glyph" fill="none" stroke="{icon}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"{transform}>{GLYPHS[key]}</g>')
    if value is not None:
        parts.append('<rect x="36" y="84" width="56" height="28" rx="9" fill="#07131F"/>')
        parts.append(digits(value if not disabled or key == "vulcan" else "--", color))
    elif not disabled:
        parts.append(f'<path d="M55 102h18" fill="none" stroke="{accent}" stroke-width="3.5" stroke-linecap="round"/>')
    if disabled:
        parts.append('<path d="m88 30 9 9m-9 0 9-9" fill="none" stroke="#CDD8DF" stroke-width="3" stroke-linecap="round"/>')
    parts.append('</g></svg>')
    return '\n'.join(parts) + '\n'


def main():
    for folder in ("svg", "png", "verification"):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    components, inline = [], {}
    for key, (label, english, accent, kind) in SPECS.items():
        component = {"id": key, "label": label, "name": english, "kind": kind,
                     "accent": accent, "targetCssPx": 56 if kind == "button" else None,
                     "displayCssPx": 56, "states": {}}
        inline[key] = {}
        for state in STATES:
            name = f"{key}-{state}"
            source = ROOT / "svg" / f"{name}.svg"
            output = ROOT / "png" / f"{name}.png"
            source.write_text(svg_for(key, state), encoding="utf-8")
            subprocess.run(["inkscape", str(source), "--export-type=png", f"--export-filename={output}",
                            "--export-width=128", "--export-height=128"], check=True, capture_output=True)
            with Image.open(output) as image:
                image.convert("RGBA").save(output, optimize=True)
            inline[key][state] = source.read_text(encoding="utf-8")
            component["states"][state] = {
                fmt: {"path": f"{fmt}/{name}.{fmt}", "bytes": path.stat().st_size,
                      "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                for fmt, path in (("svg", source), ("png", output))}
        components.append(component)
    manifest = {
        "schemaVersion": 1, "id": "aliens-controls-v1", "version": "1.0.0",
        "created": "2026-11-14", "license": "MIT", "licenseFile": "LICENSE.txt",
        "source": "Original geometric vector artwork; no external images, fonts or icon libraries.",
        "preview": "preview.html", "pngSize": {"width": 128, "height": 128},
        "svgViewBox": [0, 0, 128, 128], "states": list(STATES),
        "tokens": {"surface": "#07131F", "normalSurfaceOpacity": .72,
                   "pressedSurfaceOpacity": .90, "disabledSurfaceOpacity": .78,
                   "icon": "#F2F8FC", "edge": "#B2C5CF", "disabledIcon": "#A9BAC5",
                   "targetCssPx": 56, "gapCssPx": 8, "edgeInsetCssPx": 16},
        "components": components,
        "layout": {"referenceViewport": {"width": 844, "height": 390},
                   "coordinateSystem": "Physical left/top CSS pixels; never mirror with RTL; add safe-area insets.",
                   "buttons": {key: {"x": 772, "y": y, "width": 56, "height": 56}
                               for key, y in zip(("fire", "vulcan", "missile", "bomb"), (71, 135, 199, 263))},
                   "meters": {"energy": {"x": 16, "y": 111, "width": 56, "height": 56},
                              "shield": {"x": 16, "y": 211, "width": 56, "height": 56}},
                   "unobstructedPlayfield": {"x": 88, "y": 0, "width": 668, "height": 390}},
        "dynamicValues": {
            "units": "SVG user units; heat and resource values are clamped to 0–100.",
            "ringSelector": "#value-ring", "ringUpdate": "set stroke-dasharray to '<value> 100'; pathLength is 100.",
            "digitsSelector": "#value-digits", "digitsUpdate": "Replace vector digits or use a 10px DOM numeric label at the same badge position; never scale the hit target.",
            "heat": {"component": "vulcan", "normalSample": 36, "pressedSample": 72,
                     "disabledSample": 100, "thresholds": [50, 80, 100],
                     "colors": ["#A4F0CD", "#FFD28A", "#FFAE9E"],
                     "locked": "Use actual model.vulcanLocked; keep disabled while cooling even below 100. No blinking is required."},
            "resources": {"energy": 82, "shield": 64},
            "png": "PNGs are static state samples. Draw the current heat/resource ring and digits separately in a canvas integration.",
            "meterStateMeaning": {"normal": "available", "pressed": "highlighted feedback only; meters are read-only", "disabled": "unavailable, shown as --"}},
        "integration": {
            "status": "Design package only; live game files are untouched.",
            "knownModelFields": {"fire": "input.firing", "vulcan": "input.vulcan", "heat": "model.vulcanHeat (0–1)",
                                 "locked": "model.vulcanLocked", "missile": "input.nova / model.novaCharges"},
            "unmapped": ["bomb", "energy", "shield resource"],
            "unmappedNote": "Require an explicit game adapter. Do not invent or change gameplay/state/persistence.",
            "pointer": "Keep 56×56 target stationary. Release/cancel/lost capture/blur/hidden/resize/disable clears held input. Each pointer owns its button.",
            "accessibility": "Native buttons with Hebrew accessible names; disabled attribute for unavailable actions; meters use role=meter and aria-valuenow. Keep labels/numbers alongside color. Focus outline is outside the asset.",
            "safeArea": "right/left: calc(16px + env(safe-area-inset-right/left)); use top/bottom insets for the usable rail height."
        },
        "rebuild": "python3 workout/island/design/aliens-controls-v1/tools/build.py"
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding="utf-8")
    payload = {"components": components, "svg": inline, "digits": DIGITS, "segments": SEGMENTS}
    (ROOT / "preview-assets.js").write_text("// Generated by tools/build.py; classic script, local data, no fetch or modules.\nwindow.ALIENS_ASSETS = " +
                                           json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding="utf-8")
    print(f"Built {len(components) * 3} SVGs + {len(components) * 3} PNGs; manifest and offline preview data updated.")


if __name__ == "__main__":
    main()
