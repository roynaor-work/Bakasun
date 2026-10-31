"""Build the four original skinned meshes; no existing asset is written."""
import argparse
import json
from pathlib import Path
import numpy as np
from mesh import Mesh
from body import add_body
from head_hands import add_head_hands
from gear import add_gear

ROOT = Path(__file__).resolve().parent.parent
MODELS = ['soccer-player', 'goalkeeper', 'basketball-player', 'skier']
PALETTES = {
    'soccer-player': {'skin':'#BF8054', 'hair':'#263443', 'shirt':'#27C9A0', 'shorts':'#173B50'},
    'goalkeeper': {'skin':'#E4AC7E', 'hair':'#563E3A', 'shirt':'#FFD35D', 'shorts':'#343D69', 'socks':'#40547C', 'shoes':'#27364B'},
    'basketball-player': {'skin':'#81513B', 'hair':'#222B38', 'shirt':'#A68AF8', 'shorts':'#353455', 'socks':'#E6DDD0', 'shoes':'#FFCB68'},
    'skier': {'skin':'#DCA279', 'hair':'#674B35', 'shirt':'#57D8E4', 'shorts':'#263D63', 'shoes':'#34485A', 'gloves':'#FF9977', 'equipment':'#243B60'},
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='/tmp/island-characters2-raw')
    args = parser.parse_args()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    contract = json.loads((ROOT.parent/'characters/rig.json').read_text())
    rig = {j['name']: np.linalg.inv(np.array(j['inverseBindMatrix']).reshape(4,4).T)[:3,3] for j in contract['joints']}
    names = [j['name'] for j in contract['joints']]
    for model in MODELS:
        mesh = Mesh(names, PALETTES[model])
        add_body(mesh, model, rig)
        add_head_hands(mesh, model, rig)
        add_gear(mesh, model, rig)
        payload = {'model':model, 'positions':mesh.positions, 'normals':mesh.normals,
                   'indices':mesh.indices, 'colors':mesh.colors, 'joints':mesh.joints,
                   'weights':mesh.weights, 'parts':mesh.parts}
        (output/f'{model}.json').write_text(json.dumps(payload, separators=(',',':')))
        print(f'{model}: {len(mesh.positions)} vertices, {len(mesh.indices)} triangles', flush=True)

if __name__ == '__main__':
    main()
