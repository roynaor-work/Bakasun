#!/usr/bin/env python3
"""Export original WebGL artwork; requires optional Python Playwright + Chromium.

Start `python -m http.server 8765` at the repository root, then run this file.
No downloaded media and no postprocessing. PNGs are the viewer's canvas itself.
"""
import argparse
import base64
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--origin", default="http://127.0.0.1:8765")
parser.add_argument("--chromium", default="/usr/bin/chromium")
args = parser.parse_args()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1360, "height": 1000}, device_scale_factor=1, reduced_motion="reduce")
    page.goto(args.origin + "/workout/island/design/alpine-themes-v1/preview.html")
    page.wait_for_function("window.alpinePreview?.ready", timeout=90000)
    manifest = json.loads((ROOT / "manifest.json").read_text())
    (ROOT / "previews").mkdir(exist_ok=True)
    for i, theme in enumerate(manifest["themes"]):
        page.evaluate("async i => { await window.alpinePreview.select(i, 0); }", i)
        page.wait_for_function("window.alpinePreview.ready")
        data = page.evaluate("window.alpinePreview.capture()")
        (ROOT / theme["preview"]).write_bytes(base64.b64decode(data.split(",", 1)[1]))
        print(theme["id"], page.evaluate("window.alpinePreview.diagnostics"), flush=True)
    browser.close()
