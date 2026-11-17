#!/usr/bin/env python3
"""Validate the delivered data contract, real image properties, ZIP and byte budget."""
from pathlib import Path
from html.parser import HTMLParser
import base64
import hashlib
import json
import math
import re
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDS = ['morning','noon','afternoon','sunset','evening','night','fog','rain','snow','stadium']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def local(path):
    result = (ROOT/path).resolve()
    result.relative_to(ROOT)
    assert result.is_file(), f'Missing local asset: {path}'
    return result


def color(value):
    assert re.fullmatch(r'#[0-9a-fA-F]{6}', value), value


def number(value, low=0, high=1e9):
    assert isinstance(value,(int,float)) and not isinstance(value,bool)
    assert math.isfinite(value) and low <= value <= high, value


def vector(value, length):
    assert len(value)==length
    for item in value:
        number(item,-1e6,1e6)


class LocalHTML(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ['script','img','link']:
            path=attrs.get('src') or attrs.get('href')
            if path and not path.startswith('data:'):
                assert not re.match(r'^[a-z]+:|^//|^/',path), path
                local(path)


def main():
    pack = json.loads((ROOT/'presets.json').read_text())
    assert pack['schemaVersion']=='1.0.0'
    assert [p['id'] for p in pack['presets']]==IDS
    assert len({p['name'] for p in pack['presets']})==10
    assert pack['renderer']['exposure']==1
    assert pack['renderer']['toneMapping']=='ACESFilmicToneMapping'
    assert set(pack['assets'])=={'skyTile','clouds','halo'}
    for asset in pack['assets'].values():
        path = local(asset['path'])
        raw = path.read_bytes()
        assert len(raw)==asset['bytes'] and sha(raw)==asset['sha256']
        image = Image.open(path)
        assert image.format=='PNG'
        assert image.size==(asset['width'],asset['height'])
        assert image.mode==asset['channels']
        assert max(image.size)<=256
        if image.mode=='RGBA':
            alpha=image.getchannel('A')
            assert alpha.getextrema()[0]==0 and alpha.getextrema()[1]>200
            assert not any(alpha.crop((0,0,image.width,1)).tobytes())
            assert not any(alpha.crop((0,image.height-1,image.width,image.height)).tobytes())
    sky=Image.open(local('textures/sky-tile.png'))
    assert sky.crop((0,0,1,256)).tobytes()==sky.crop((255,0,256,256)).tobytes(), 'Sky X seam'
    assert sky.crop((0,0,256,1)).tobytes()==sky.crop((0,255,256,256)).tobytes(), 'Sky Y seam'
    for preset in pack['presets']:
        sun=preset['sun'];ambient=preset['ambient'];fog=preset['fog']
        color(sun['color']);vector(sun['direction'],3)
        assert abs(sum(v*v for v in sun['direction'])-1)<1e-6
        assert sun['direction'][1]>0
        number(sun['intensity'],0,8);number(sun['haloOpacity'],0,1)
        number(sun['discAngularRadius'],.001,.1)
        assert sun['kind'] in ['sun','moon']
        color(ambient['color']);color(ambient['groundColor']);number(ambient['intensity'],0,4)
        assert isinstance(fog['enabled'],bool)
        color(fog['color']);number(fog['start']);number(fog['end'])
        assert fog['start']<fog['end']<340
        for shade in preset['sky']['gradient'].values():color(shade)
        assert set(preset['sky']['gradient'])=={'zenith','upper','horizon','ground'}
        vector(preset['sky']['tileRepeat'],2);number(preset['sky']['tileStrength'],0,.1)
        stars=preset['stars'];clouds=preset['clouds'];weather=preset['weather']
        for settings in [stars,clouds]:
            assert isinstance(settings['enabled'],bool)
            assert isinstance(settings['count'],int)
            color(settings['color']);number(settings['opacity'],0,1)
            assert settings['enabled']==(settings['count']>0)
        number(stars['count'],0,512);number(stars['size'],.1,8)
        number(clouds['count'],0,16);number(clouds['scale'],.1,3)
        number(clouds['speed']);number(clouds['altitude'],1,80)
        assert weather['type'] in ['none','rain','snow']
        assert isinstance(weather['count'],int)
        number(weather['count'],0,400);number(weather['speed']);number(weather['opacity'],0,1)
        vector(weather['wind'],2);color(weather['color'])
        assert (weather['type']=='none')==(weather['count']==0)
        assert preset['textures']=={'skyTile':'skyTile','clouds':'clouds','halo':'halo'}
        assert len(preset['spotlights'])==(4 if preset['id']=='stadium' else 0)
        for spot in preset['spotlights']:
            vector(spot['position'],3);vector(spot['target'],3)
            assert spot['position']!=spot['target']
            color(spot['color']);number(spot['intensity'],1,10000)
            number(spot['distance'],1,200);number(spot['angle'],.01,math.pi/2)
            number(spot['penumbra'],0,1);number(spot['haloOpacity'],0,1)
            assert spot['decay']==2
    assert pack['presets'][7]['weather']['type']=='rain'
    assert pack['presets'][8]['weather']['type']=='snow'
    assert pack['presets'][6]['fog']['end']<pack['presets'][1]['fog']['start']
    # No server-side JSON fetching: the data snapshot must match byte-for-byte in meaning.
    snapshot=(ROOT/'preset-data.js').read_text().splitlines()
    copy=json.loads(snapshot[1].removeprefix('globalThis.LIGHTING_PACK = ').removesuffix(';'))
    assert copy==pack,'Rebuild preset-data.js after editing presets.json'
    inline=json.loads(snapshot[2].removeprefix('globalThis.LIGHTING_TEXTURES = ').removesuffix(';'))
    assert set(inline)=={a['path'] for a in pack['assets'].values()}
    for path,data in inline.items():
        assert base64.b64decode(data.split(',',1)[1])==local(path).read_bytes()
    html=(ROOT/'preview.html').read_text()
    LocalHTML().feed(html)
    assert "connect-src 'none'" in html and "object-src 'none'" in html
    assert 'type="module"' not in html
    for name in ['lighting.js','preview.js','preset-data.js']:
        code=(ROOT/name).read_text()
        assert not re.search(r'\b(?:fetch|import|WebAssembly)\s*\(',code), name
    assert not list(ROOT.rglob('*.wasm'))
    assert 'globalThis.THREE=' in (ROOT/'vendor/three.local.js').read_text()
    manifest=json.loads((ROOT/'manifest.json').read_text())
    for entry in manifest['files']:
        data=local(entry['path']).read_bytes()
        assert len(data)==entry['bytes'] and sha(data)==entry['sha256'],entry['path']
    archive=ROOT/'lighting-presets-v1.zip'
    assert archive.stat().st_size==manifest['archiveBytes']
    assert sha(archive.read_bytes())==manifest['archiveSHA256']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names={f['path'] for f in manifest['files']}
        assert {n.removeprefix('lighting-presets-v1/') for n in z.namelist()}==names
        for path in names:
            assert z.read('lighting-presets-v1/'+path)==local(path).read_bytes(),path
    total=sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
    assert total<=3_000_000,f'Whole-folder budget exceeded: {total}'
    result=dict(status='passed',presets=10,textureFiles=3,skySeams='exact X/Y match',
        transparentPNGs=2,embeddedData='matches canonical JSON and PNG bytes',
        runtimeBytes=manifest['runtimeBytes'],textureBytes=manifest['textureBytes'],
        archiveBytes=manifest['archiveBytes'],folderBytesBeforeReport=total,budgetBytes=3_000_000,
        zip='valid CRC and identical runtime contents',noWASM=True)
    (ROOT/'verification'/'asset-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
