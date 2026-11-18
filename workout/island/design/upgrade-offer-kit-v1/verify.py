"""Dependency-free kit validation: python path/to/verify.py. CC0-1.0."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
SVG = '{http://www.w3.org/2000/svg}'


def files():
    return sorted(p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)


def contrast(a, b):
    def luminance(value):
        rgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
        return sum(c * w for c, w in zip(linear, (.2126, .7152, .0722)))
    lo, hi = sorted((luminance(a), luminance(b)))
    return (hi + .05) / (lo + .05)


def palettes():
    css = (ROOT / 'offer.css').read_text()
    return {mode: dict(re.findall(r'--uo-([\w-]+):\s*(#[\da-f]{6})', re.search(pattern, css, re.S).group(1)))
            for mode, pattern in [('dark', r'\.uo-kit\s*\{(.*?)\}'),
                                  ('light', r'\.uo-kit\[data-mode="light"\]\s*\{(.*?)\}')]}


def contrast_rows():
    rows = []
    for mode, p in palettes().items():
        for fg, bg, threshold in [('text', 'panel', 4.5), ('muted', 'panel', 4.5),
                                  ('accent', 'panel', 4.5), ('text', 'tile', 4.5),
                                  ('muted', 'tile', 4.5), ('on-accent', 'accent', 4.5),
                                  ('border', 'panel', 3), ('border', 'tile', 3),
                                  ('fill', 'track', 3), ('accent', 'tile', 3)]:
            rows.append(dict(mode=mode, foreground=fg, background=bg,
                             ratio=round(contrast(p[fg], p[bg]), 3), minimum=threshold))
    return rows


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        self.refs += [v for k, v in attrs if k in ('href', 'src') and v and not v.startswith('#')]


class KitValidation(unittest.TestCase):
    def test_load_every_file_and_budget(self):
        all_files = files()
        self.assertTrue(all_files)
        for path in all_files:
            with self.subTest(file=str(path.relative_to(ROOT))):
                content = path.read_bytes()
                self.assertGreater(len(content), 0)
                content.decode('utf-8')
                if path.suffix == '.json':
                    json.loads(content)
                if path.suffix == '.py':
                    compile(content, str(path), 'exec')
        self.assertLessEqual(sum(p.stat().st_size for p in all_files), 400_000)

    def test_catalog_and_all_svg(self):
        catalog = json.loads((ROOT / 'icons.json').read_text())
        expected = {'engine', 'tires', 'brakes', 'aerodynamics', 'nitro', 'racket',
                    'tennis-power', 'accuracy', 'throw-power', 'jump', 'defense', 'speed',
                    'kick', 'goalkeeper', 'cannon', 'shield', 'armor', 'upgrade', 'star',
                    'coin', 'lock', 'arrow-up'}
        self.assertEqual({i['id'] for i in catalog}, expected)
        self.assertEqual(len(catalog), 22)
        self.assertEqual({i['file'] for i in catalog}, {str(p.relative_to(ROOT)) for p in (ROOT / 'icons').glob('*.svg')})
        for item in catalog:
            with self.subTest(icon=item['id']):
                svg = ET.parse(ROOT / item['file']).getroot()
                self.assertEqual(svg.tag, SVG + 'svg')
                for key, value in [('width', '48'), ('height', '48'), ('viewBox', '0 0 48 48'),
                                   ('stroke-width', '3'), ('stroke-linecap', 'round'),
                                   ('stroke-linejoin', 'round'), ('fill', 'none')]:
                    self.assertEqual(svg.get(key), value)
                self.assertEqual(svg.find(SVG + 'title').text, item['label'])
                self.assertEqual(len(svg.findall(SVG + 'path')), 2)
                self.assertEqual({e.tag.removeprefix(SVG) for e in svg.iter()}, {'svg', 'title', 'style', 'path'})
                for element in svg.iter():
                    self.assertFalse(any(k.startswith('on') or 'href' in k for k in element.attrib))
                self.assertIn('prefers-color-scheme:dark', svg.find(SVG + 'style').text)

    def test_html_and_local_references(self):
        source = (ROOT / 'preview.html').read_text()
        parser = Links(); parser.feed(source)
        for ref in parser.refs:
            self.assertNotIn('://', ref)
            self.assertTrue((ROOT / ref).is_file(), ref)
        self.assertIn('lang="he" dir="rtl"', source)
        self.assertIn("script-src 'self'", source)
        self.assertNotIn('unsafe-inline', source)
        self.assertNotIn('unsafe-eval', source)

    def test_native_modules_parse(self):
        for path in ROOT.glob('*.mjs'):
            result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_aa_and_non_text_contrast(self):
        for row in contrast_rows():
            with self.subTest(**row):
                self.assertGreaterEqual(row['ratio'], row['minimum'])

    def test_license_inventory(self):
        licenses = (ROOT / 'LICENSES.md').read_text()
        self.assertIn('CC0-1.0', licenses)
        for path in files():
            self.assertIn(f'`{path.relative_to(ROOT)}`', licenses)

    def test_runtime_is_local_and_wasm_free(self):
        for path in [*ROOT.glob('*.mjs'), *ROOT.glob('*.css')]:
            text = path.read_text()
            self.assertNotRegex(text, r'https?://|WebAssembly|\beval\s*\(|new Function|@import|data:')
        css = (ROOT / 'offer.css').read_text()
        self.assertIn('prefers-reduced-motion: reduce', css)
        self.assertNotIn('infinite', css)
        # Browser checks additionally measure the combined delay + duration.
        self.assertIn('520ms 60ms', css)


if __name__ == '__main__':
    print(f'Loaded {len(files())} files, {sum(p.stat().st_size for p in files()):,} bytes.')
    unittest.main(verbosity=2)
