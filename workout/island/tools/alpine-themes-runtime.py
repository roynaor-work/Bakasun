"""Ski league v23: copies the runtime part of the Codex theme pack (design/alpine-themes-v1, CC0) to assets/alpine-themes-v23.

Only what the game reads: per theme the sky backplate, the snow and ground tiles (as WebP, the PNGs are flat-colour art and shrink
several times), the three scenery models, the two slalom gates, the ramp; the village chalet; the ice sparkle sprite. Previews,
review sheets, sources, manifests and the reference skier stay in design/ (never published from there for the game).
The design folder is never modified. Run from the island folder:  python3 tools/alpine-themes-runtime.py
"""
import hashlib, json, os, shutil, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ISLAND = os.path.dirname(HERE)
SRC = os.path.join(ISLAND, 'design', 'alpine-themes-v1', 'themes')
DST = os.path.join(ISLAND, 'assets', 'alpine-themes-v23')
THEMES = {'01-pine': 'pine', '02-ice': 'ice', '03-volcano': 'lava', '04-aurora': 'aurora', '05-village': 'village', '06-summit': 'peak'}
MODELS = {
    'pine': ['pine-tall', 'pine-round', 'pine-young'],
    'ice': ['ice-spire', 'ice-cluster', 'ice-arch'],
    'lava': ['basalt-stack', 'soot-boulder', 'glow-stones'],
    'aurora': ['night-pine', 'frost-boulder', 'moon-crystal'],
    'village': ['village-pine', 'snow-fir', 'garden-boulder', 'chalet'],
    'peak': ['granite-slab', 'snow-spire', 'cloud-boulder'],
}
TEXTURES = {'sky': 'sky.png', 'snow': 'snow.png', 'ground': 'ground-a.png'}


def webp(src, dst, quality):
    Image.open(src).convert('RGB').save(dst, 'WEBP', quality=quality, method=6)


def main():
    files = []
    for codex, theme in THEMES.items():
        out = os.path.join(DST, theme)
        os.makedirs(out, exist_ok=True)
        for name, png in TEXTURES.items():
            target = os.path.join(out, name + '.webp')
            webp(os.path.join(SRC, codex, 'textures', png), target, 90 if name == 'sky' else 86)
            files.append(target)
        for model in MODELS[theme] + ['gate-coral', 'gate-teal', 'ramp']:
            target = os.path.join(out, model + '.glb')
            shutil.copyfile(os.path.join(SRC, codex, 'models', model + '.glb'), target)
            files.append(target)
        if theme == 'ice':
            target = os.path.join(out, 'sparkle.png')
            shutil.copyfile(os.path.join(SRC, codex, 'textures', 'sparkle.png'), target)
            files.append(target)
    shutil.copyfile(os.path.join(ISLAND, 'design', 'alpine-themes-v1', 'LICENSES.md'), os.path.join(DST, 'LICENSES.md'))
    inventory = [{'path': os.path.relpath(f, ISLAND).replace(os.sep, '/'), 'bytes': os.path.getsize(f), 'sha256': hashlib.sha256(open(f, 'rb').read()).hexdigest()} for f in sorted(files)]
    with open(os.path.join(DST, 'inventory.json'), 'w') as fh:
        json.dump({'source': 'design/alpine-themes-v1 (Codex, CC0-1.0)', 'files': inventory, 'bytes': sum(i['bytes'] for i in inventory)}, fh, indent=1)
        fh.write('\n')
    print(len(inventory), 'files', sum(i['bytes'] for i in inventory), 'bytes')


if __name__ == '__main__':
    sys.exit(main())
