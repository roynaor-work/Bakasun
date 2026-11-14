"""CC0 geometry helpers copied from tennis-crowd-3d-v1/source/build.py.

Source repository commit: d759582c171600dd7c7df7906c2fb38ae7f8b88a.
Original license: tennis-crowd-3d-v1/LICENSES.md, CC0-1.0.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SHIRTS = ['ed684b', '41a99a', 'e5b94b', '567cc1', 'bd6d9f', 'eee2c8',
          '729c4c', '955eb6', 'e58c42', '4e9fc5', 'bf535d', '8895ac']
SKINS = ['f2c5a0', '986342', 'd99b73', '663f2c', 'e4b08a', 'b87c54',
         '835135', 'f4d1af', 'c18b65', '593a2d', 'dcaf8a', 'a86c48']
HAIR = ['342c28', '1e2429', '805337', '272324', 'b48a50', '52372b',
        '252b32', 'b2ac9e', '6c4931', '1d2225', '9c6741', '6d6763']


def rgb(h):
    # glTF vertex colors are linear, unlike the palette's sRGB hex values.
    def linear(v):
        v = v / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    return [linear(int(h[i:i + 2], 16)) for i in (0, 2, 4)]


class Fan:
    def __init__(self):
        self.positions, self.colors, self.deltas, self.head, self.indices = [], [], [], [], []

    def face(self, points, color, target=None, head=False):
        a, b, c = points[:3]
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in n)) or 1
        light = sum(n[i]/length * [-.35, .8, .48][i] for i in range(3))
        # Baked broad key + cool ambient; darken under the seat and arms.
        shade = .64 + .30 * max(0, light)
        start = len(self.positions)
        for k, p in enumerate(points):
            self.positions.append(p)
            ao = .80 if .37 < p[1] < .67 else 1
            self.colors.append([round(min(1, x*shade*ao)*255) for x in rgb(color)] + [255])
            self.deltas.append([target[k][i]-p[i] for i in range(3)] if target else [0, 0, 0])
            self.head.append(1.0 if head else 0.0)
        for k in range(1, len(points)-1):
            self.indices.extend([start, start+k, start+k+1])

    def hull(self, points, faces, color, target=None, head=False):
        for f in faces:
            self.face([points[i] for i in f], color,
                      [target[i] for i in f] if target else None, head)

    def prism(self, center, dims, color, top=.9, head=False):
        x, y, z = center
        w, h, d = [n/2 for n in dims]
        p = [[x+sx*w*(top if sy>0 else 1), y+sy*h, z+sz*d]
             for sy in [-1, 1] for sz in [-1, 1] for sx in [-1, 1]]
        self.hull(p, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1],
                      [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], color, head=head)

    def limb(self, a, b, radius, color, target=None, sides=4):
        def points(a, b):
            axis = [b[i]-a[i] for i in range(3)]
            length = math.sqrt(sum(x*x for x in axis))
            axis = [x/length for x in axis]
            # All limb axes stay in YZ or mostly Y, so X is a stable ring direction.
            right = [0, -axis[2], axis[1]]
            if abs(axis[0]) < .9:
                right = [1-axis[0]*axis[0], -axis[0]*axis[1], -axis[0]*axis[2]]
            length = math.sqrt(sum(x*x for x in right))
            right = [x/length for x in right]
            up = [axis[1]*right[2]-axis[2]*right[1], axis[2]*right[0]-axis[0]*right[2], axis[0]*right[1]-axis[1]*right[0]]
            return [[p[j]+radius*(1 if end==0 else .83)*
                     (math.cos(k*math.tau/sides+math.pi/4)*right[j]+math.sin(k*math.tau/sides+math.pi/4)*up[j])
                     for j in range(3)] for end, p in enumerate([a, b]) for k in range(sides)]
        faces = [list(reversed(range(sides))), list(range(sides, sides*2))]
        faces += [[k, (k+1)%sides, (k+1)%sides+sides, k+sides] for k in range(sides)]
        self.hull(points(a, b), faces, color, points(*target) if target else None)

    def octa(self, center, dims, color, target=None):
        def points(c):
            return [[c[j]+(dims[j]*s if j==axis else 0) for j in range(3)]
                    for axis in range(3) for s in [-1, 1]]
        self.hull(points(center), [[4, 2, 0], [3, 4, 0], [5, 3, 0], [2, 5, 0],
                                  [2, 4, 1], [4, 3, 1], [3, 5, 1], [5, 2, 1]],
                  color, points(target) if target else None)
