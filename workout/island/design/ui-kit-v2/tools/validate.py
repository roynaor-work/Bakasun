#!/usr/bin/env python3
"""Validate shipped assets, hashes, references, budgets and live game coverage."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import hashlib
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = []
        self.images = 0

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for attr in ('src', 'href'):
            if attrs.get(attr):
                self.references.append(attrs[attr])
        if tag == 'img':
            self.images += 1
            assert 'alt' in attrs, attrs
            assert 'width' in attrs and 'height' in attrs, attrs


def main():
    manifest = json.loads((ROOT/'manifest.json').read_text())
    paths = set()
    for asset in manifest['assets']:
        path = ROOT/asset['path']
        assert asset['path'] not in paths, f'Duplicate asset: {path}'
        paths.add(asset['path'])
        data = path.read_bytes()
        assert len(data) <= manifest['maxAssetBytes'] == 100000, f'Oversize: {path}'
        assert len(data) == asset['bytes'], f'Stale byte count: {path}'
        assert hashlib.sha256(data).hexdigest() == asset['sha256'], f'Stale hash: {path}'
        root = ET.fromstring(data)
        assert root.tag == '{http://www.w3.org/2000/svg}svg'
        assert root.attrib['viewBox'] == f'0 0 {asset["width"]} {asset["height"]}'
        assert int(root.attrib['width']) == asset['width']
        assert int(root.attrib['height']) == asset['height']
        ids = []
        for element in root.iter():
            tag = element.tag.rsplit('}',1)[-1]
            assert tag not in {'text','script','foreignObject','image','filter','animate','set'}, (path,tag)
            if 'id' in element.attrib:
                ids.append(element.attrib['id'])
            for key,value in element.attrib.items():
                assert not key.lower().startswith('on'), (path,key)
                if key.rsplit('}',1)[-1] == 'href':
                    assert value.startswith('#'), (path,value)
                for match in re.findall(r'url\((.*?)\)',value):
                    assert match.startswith('#'), (path,match)
        assert len(ids)==len(set(ids)), f'Duplicate SVG IDs: {path}'
        if asset['role'] in {'game-icon','menu-icon'}:
            assert root.attrib['stroke-width']=='3'
            assert root.attrib['stroke-linecap']=='round'
            assert root.attrib['stroke-linejoin']=='round'
    shipped = {str(p.relative_to(ROOT)) for p in ROOT.rglob('*.svg')}
    assert paths == shipped, f'Unregistered or missing SVGs: {paths ^ shipped}'
    for path in ROOT.rglob('*.webp'):
        assert path.stat().st_size<=100000, f'Oversize WebP: {path}'
    extensions=json.loads((ROOT.parents[1]/'data/extensions.json').read_text())['records']
    flags=json.loads((ROOT.parents[1]/'data/featureFlags.json').read_text())
    config=json.loads((ROOT.parents[1]/'data/config.json').read_text())['minigames']
    expected={r['id'] for r in extensions.values() if r.get('id') in config and flags.get(r.get('featureFlag'),False)}
    actual={g['id'] for g in manifest['games']}
    assert expected==actual, f'Game coverage changed: {expected ^ actual}'
    for game in manifest['games']:
        assert game['icon'] in paths and game['intro'] in paths
    html=(ROOT/'index.html').read_text()
    parser=References()
    parser.feed(html)
    assert len(parser.ids)==len(set(parser.ids)), 'Duplicate HTML IDs'
    for reference in parser.references:
        url=urlsplit(reference)
        assert not url.scheme and not url.netloc, f'External reference: {reference}'
        if url.path:
            assert (ROOT/unquote(url.path)).is_file(), f'Broken reference: {reference}'
        elif url.fragment:
            assert url.fragment in parser.ids, f'Broken anchor: {reference}'
    for sheet in ('ui-kit.css','preview.css'):
        css=(ROOT/sheet).read_text()
        for ref in re.findall(r'url\([\'\"]?([^\)\'\"]+)[\'\"]?\)',css):
            assert (ROOT/ref).is_file(), f'Broken CSS reference: {ref}'
        assert 'prefers-reduced-motion' in css
        assert 'infinite' not in css
    assert (ROOT/'tokens.json').is_file()
    totals=dict(assets=len(paths),bytes=sum(a['bytes'] for a in manifest['assets']),largestBytes=max(a['bytes'] for a in manifest['assets']))
    assert totals==manifest['totals'], 'Stale totals'
    result=dict(status='passed',games=len(actual),svgAssets=len(paths),svgBytes=totals['bytes'],largestSvgBytes=totals['largestBytes'],htmlImages=parser.images,byteLimit=100000)
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    main()
