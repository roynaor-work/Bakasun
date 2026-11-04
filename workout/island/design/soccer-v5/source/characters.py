"""Reuse the original CC0 athlete surfaces; author three toon heads and expressions.

The existing body, hands, boots and gloves are read-only source assets. All output
is intermediate JSON in /tmp, consumed by build.mjs. No live game files are edited.
"""
import argparse
import json
import sys
from math import sin, cos, pi, acos, exp
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT.parent / 'characters2/source'))
from mesh import Mesh
from body import add_body
from gear import add_gear
from head_hands import _face, _hair, _hand, HEAD_WEIGHTS

LOOKS = [
    {'id': 'quiff', 'skin': '#C78C60', 'hair': '#243341', 'width': .99, 'jaw': 1.04},
    {'id': 'curls', 'skin': '#80503E', 'hair': '#251F2A', 'width': 1.09, 'jaw': 1.12},
    {'id': 'knot', 'skin': '#E3AD88', 'hair': '#76412E', 'width': .97, 'jaw': .93},
]
TEAMS = {
    'teal': {'shirt': '#26BAAD', 'shorts': '#172E49', 'socks': '#EDF2DD',
             'shoes': '#FF8869', 'accent': '#FFE3AC'},
    'coral': {'shirt': '#F26C59', 'shorts': '#EEE6D2', 'socks': '#1C344D',
              'shoes': '#72E2CD', 'accent': '#FFE3AC'},
    'keeper': {'shirt': '#E7B73D', 'shorts': '#4B426D', 'socks': '#51476E',
               'shoes': '#27394F', 'gloves': '#F6ECD5', 'accent': '#EB8660'},
}


def curls(mesh):
    # A rounded cap and staggered solid coils give a distinct silhouette at 40px.
    vertices = [[0, 1.342, -.006]]
    segments, bands = 32, 8
    for row in range(1, bands + 1):
        for j in range(segments):
            a = j * 2*pi/segments
            hairline = 1.200 + .057*max(cos(a), 0)**2 - .027*max(-cos(a), 0)**2
            p = row/bands * acos(np.clip((hairline-1.214)/.128, -.99, .99))
            vertices.append([.084*sin(p)*sin(a), 1.214+.128*cos(p), -.006+.094*sin(p)*cos(a)])
    faces = [(0, 1+j, 1+(j+1)%segments) for j in range(segments)]
    for row in range(bands-1):
        for j in range(segments):
            a, b = 1+row*segments+j, 1+row*segments+(j+1)%segments
            faces.extend([(a,b,a+segments),(b,b+segments,a+segments)])
    mesh.add(vertices, faces, 'hair', HEAD_WEIGHTS)
    for band, (p, count) in enumerate([(.26,5),(.59,9),(.92,13),(1.18,15)]):
        for j in range(count):
            a = j*2*pi/count + band*.36
            y = 1.214 + .129*cos(p)
            if cos(a) > .2 and y < 1.259:
                continue
            mesh.ellipsoid([.081*sin(p)*sin(a), y, -.006+.092*sin(p)*cos(a)],
                           [.014,.012,.014], 'hair', HEAD_WEIGHTS, segments=8, rings=4)


def head(mesh, model, look):
    first = len(mesh.positions)
    _face(mesh, model)
    face_end = len(mesh.positions)
    if look['id'] == 'curls':
        curls(mesh)
    else:
        _hair(mesh, 'soccer-player' if look['id'] == 'quiff' else 'goalkeeper')
        if look['id'] == 'knot':
            mesh.ellipsoid([0,1.302,-.093],[.037,.039,.040],
                           'hair', HEAD_WEIGHTS, segments=20, rings=10)
            for sign in [-1, 1]:
                mesh.tube([[sign*.049,1.287,.049],[sign*.071,1.267,.025],
                           [sign*.077,1.239,-.011],[sign*.066,1.218,-.048],
                           [sign*.026,1.273,-.084]],
                          [.008,.010,.010,.009,.005], 'hair', HEAD_WEIGHTS, segments=10)
            mesh.tube([[-.023,1.290,-.091],[0,1.294,-.106],[.023,1.290,-.091]],
                      [.003]*3, 'accent', HEAD_WEIGHTS, segments=8)
    head_end = len(mesh.positions)
    for i in range(first, head_end):
        x,y,z = mesh.positions[i]
        region = mesh.regions[i]
        # Broader eyes, recognizable cheek and jaw shapes, a compact adult head.
        jaw = 1 + (look['jaw']-1)*exp(-((y-1.115)/.043)**2)
        x *= look['width']*jaw
        eye_surface = region.startswith('preserve_eye') or region in ['preserve_iris','preserve_pupil']
        eye_lid = region == 'skin' and z > .075 and 1.205 < y < 1.226 and .014 < abs(x) < .054
        if i < face_end and (eye_surface or eye_lid):
            cx = (.031 if x > 0 else -.031)*look['width']
            x = cx + (x-cx)*(1.55 if region in ['preserve_iris','preserve_pupil'] else 1.16)
            y = 1.215 + (y-1.215)*1.16
        mesh.positions[i] = [x*1.025, 1.088+(y-1.075)*.835, z*1.025]
    # Expression deltas stay in model space and follow the existing Head joint.
    smile, focus = np.zeros((len(mesh.positions),3)), np.zeros((len(mesh.positions),3))
    for i in range(first, face_end):
        x,y,z = mesh.positions[i]
        region = mesh.regions[i]
        if region in ['preserve_lip','preserve_mouth']:
            smile[i] = [x*.12, .008*(abs(x)/.025)**1.5-.001, .001]
            focus[i] = [x*-.06, -.001, .0003]
        elif region == 'hair':  # Eyebrows; the groom starts after face_end.
            inner = max(0,1-abs(x)/.070)
            smile[i] = [0,.003*inner,0]
            focus[i] = [0,-.009*inner+.002,.0005]
        elif region == 'skin' and z > .046 and 1.162 < y < 1.202:
            smile[i,1] = .0028*exp(-((abs(x)-.040)/.021)**2)
    for sign in [-1,1]:
        _hand(mesh, model, sign, RIG)
    # New hand vertices are deliberately unaffected by facial morphs.
    padding = len(mesh.positions)-len(smile)
    return (np.pad(smile,((0,padding),(0,0))), np.pad(focus,((0,padding),(0,0)))), (first,face_end)


def build(model, look, team):
    palette = {**TEAMS[team], 'skin': look['skin'], 'hair': look['hair']}
    mesh = Mesh(NAMES, palette)
    add_body(mesh, model, RIG)
    targets, face_range = head(mesh, model, look)
    before_gear = len(mesh.positions)
    add_gear(mesh, model, RIG)
    targets = [np.pad(t,((0,len(mesh.positions)-before_gear),(0,0))) for t in targets]
    # The outer shoulder panels keep kits readable in a distant game camera.
    for part in mesh.parts:
        if part['region'] != 'shirt':
            continue
        for i in range(part['firstVertex'], part['firstVertex']+part['vertexCount']):
            x,y,z = mesh.positions[i]
            if y > .903 and abs(x) > .132:
                from mesh import linear_rgb
                mesh.colors[i] = linear_rgb('#17354B' if team != 'keeper' else '#52476D')
    raw = mesh.to_dict()
    raw['morphs'] = {'smile':targets[0].tolist(), 'focus':targets[1].tolist()}
    raw['faceVertexRange'] = list(face_range)
    raw['look'] = look['id']
    raw['team'] = team
    return raw


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='/tmp/soccer-v5-raw')
    output = Path(parser.parse_args().out)
    output.mkdir(parents=True, exist_ok=True)
    contract = json.loads((ROOT.parent/'characters/rig.json').read_text())
    NAMES = [j['name'] for j in contract['joints']]
    RIG = {j['name']:np.linalg.inv(np.array(j['inverseBindMatrix']).reshape(4,4).T)[:3,3] for j in contract['joints']}
    for team in ['teal','coral']:
        for look in LOOKS:
            raw = build('soccer-player', look, team)
            (output/f"{team}-{look['id']}.json").write_text(json.dumps(raw,separators=(',',':')))
            print(f"{team}-{look['id']}: {len(raw['positions'])} vertices, {len(raw['indices'])} triangles",flush=True)
    raw = build('goalkeeper', LOOKS[0], 'keeper')
    (output/'goalkeeper.json').write_text(json.dumps(raw,separators=(',',':')))
    print(f"goalkeeper: {len(raw['positions'])} vertices, {len(raw['indices'])} triangles",flush=True)
