"""Small deterministic surface modeller. Metres, +Y up, +Z front.

Every vertex has a real atlas UV, an authored normal and a subtle occlusion tint.
Rigid gear can share the canonical skin. No existing repository code is imported.
"""
import json
import math
from collections import Counter
from pathlib import Path
import numpy as np

PALETTE = {
    'red': '#B82535', 'redLight': '#D44740', 'redDark': '#791E2D',
    'cream': '#E9E3CC', 'yellow': '#EED354', 'orange': '#F38337',
    'navy': '#243541', 'black': '#17232D', 'rubber': '#202B30',
    'steel': '#9DAEAE', 'metalDark': '#536774', 'glass': '#294D61',
    'blue': '#78BDD4', 'lamp': '#FFE5B0', 'beacon': '#F44344',
    'stone': '#AAB0A8', 'brick': '#B46F54', 'plaster': '#C9B994',
    'teal': '#538787', 'roof': '#626F75', 'wood': '#99725A',
    'char': '#3A3A3D', 'soot': '#514A48', 'asphalt': '#3A4954',
    'concrete': '#7E8C8C', 'green': '#586B60', 'skin': '#BD865E',
    'suit': '#B3A072', 'stripe': '#E5DC6A', 'white': '#F3F1DD',
    'hose': '#D6B46A', 'sky': '#403B50',
}
COLORS = list(PALETTE)


def normalize(v):
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else np.array([0., 1., 0.])


def basis(axis):
    y = normalize(axis)
    x = normalize(np.cross(y, [0, 0, 1] if abs(y[2]) < .92 else [1, 0, 0]))
    return np.column_stack((x, y, np.cross(x, y)))


def rotation(axis, angle):
    x, y, z = normalize(axis)
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c+x*x*(1-c), x*y*(1-c)-z*s, x*z*(1-c)+y*s],
                     [y*x*(1-c)+z*s, c+y*y*(1-c), y*z*(1-c)-x*s],
                     [z*x*(1-c)-y*s, z*y*(1-c)+x*s, c+z*z*(1-c)]])


class Mesh:
    def __init__(self, name, atlas='environment', bones=None):
        self.name, self.atlas = name, atlas
        self.lod = name.endswith('-lod')
        self.p, self.n, self.uv, self.col, self.j, self.w = [], [], [], [], [], []
        self.groups = {'solid': [], 'metal': [], 'glass': [], 'light': [], 'decal': []}
        self.bones = bones or []
        self.parts, self.anchors = [], {}
        self.surface_audit = []

    def add(self, vertices, faces, color, normals=None, surface='solid', skin=None,
            tint=1., matrix=None, center=None, part=None, vertex_alpha=None):
        start = len(self.p)
        vertices = np.asarray(vertices, dtype=float)
        if matrix is not None:
            vertices = vertices @ np.asarray(matrix).T
        if center is not None:
            vertices += np.asarray(center)
        # Closed shells must face outwards. glTF validation alone cannot detect
        # an inside-out wall; test welded positional edges and signed volume.
        welded={};weld_indices=[]
        for v in vertices:
            key=tuple(np.round(v,7));weld_indices.append(welded.setdefault(key,len(welded)))
        edges=Counter();volume=0.
        for face in faces:
            for a,b in zip(face,face[1:]+face[:1]):
                ia,ib=weld_indices[a],weld_indices[b]
                if ia!=ib:edges[tuple(sorted((ia,ib)))]+=1
            for k in range(1,len(face)-1):volume+=float(np.dot(vertices[face[0]],np.cross(vertices[face[k]],vertices[face[k+1]])))/6
        closed=bool(edges) and all(count==2 for count in edges.values())
        self.surface_audit.append({'part':part or f'surface-{len(self.surface_audit)}','closed':closed,'signedVolume':volume})
        if closed and volume < -1e-10:
            raise ValueError(f'{self.name}: inward closed shell in {part or "surface"}, volume={volume}')
        idx = COLORS.index(color)
        tile_x, tile_y = idx % 8, idx // 8
        skin = skin or {'Root': 1.}
        weighted = [(self.bones.index(k), v) for k, v in skin.items()] if self.bones else [(0, 1.)]
        while len(weighted) < 4:
            weighted.append((0, 0.))
        for face in faces:
            a, b, c = [vertices[i] for i in face[:3]]
            normal = normalize(np.cross(b-a, c-a))
            # Two dominant axes make the tile's grain follow each surface.
            drop = int(np.argmax(abs(normal)))
            axes = [i for i in range(3) if i != drop]
            pts = vertices[list(face)][:, axes]
            lo, hi = pts.min(0), pts.max(0)
            extent = np.maximum(hi-lo, .001)
            base = len(self.p)
            for k, vi in enumerate(face):
                v = vertices[vi]
                n = np.asarray(normals[vi]) if normals is not None else normal
                if normals is not None and matrix is not None:
                    n = np.asarray(matrix) @ n
                # A bounded, mild cavity tint avoids fake black outlines.
                ao = tint * (.91 + .09*max(n[1], 0))
                q = (pts[k]-lo)/extent
                # 8px gutters inside each 128px tile; no cross-tile mip bleed.
                # glTF UV origin is the top-left; GLTFLoader sets flipY=false.
                uv = [(tile_x + .065 + .87*q[0])/8,
                      (tile_y + .065 + .87*q[1])/8]
                self.p.append(v.tolist()); self.n.append(normalize(n).tolist())
                self.uv.append(uv); self.col.append([ao, ao, ao, vertex_alpha[vi] if vertex_alpha is not None else 1])
                self.j.append([x[0] for x in weighted]); self.w.append([x[1] for x in weighted])
            for k in range(1, len(face)-1):
                self.groups[surface].extend([base, base+k, base+k+1])
        if part:
            self.parts.append({'name': part, 'firstVertex': start, 'vertexCount': len(self.p)-start})

    def box(self, c, size, color, bevel=0, **kw):
        if self.lod:bevel=0
        half = np.asarray(size, float)/2
        b = min(bevel, min(half)*.8)
        if b <= 0:
            v = [np.asarray([x, y, z])*half for x,y,z in
                 [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
            f = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
            self.add(v, f, color, center=c, **kw)
            return
        # Convex clipped cube: 6 flat panels + 12 bevels + 8 corner facets.
        verts, faces = [], []
        for axis in range(3):
            oth = [a for a in range(3) if a != axis]
            for sign in [-1,1]:
                face=[]
                for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    p=np.zeros(3);p[axis]=sign*half[axis]
                    p[oth[0]]=u*(half[oth[0]]-b);p[oth[1]]=v*(half[oth[1]]-b)
                    face.append(len(verts));verts.append(p)
                if np.dot(np.cross(verts[face[1]]-verts[face[0]],verts[face[2]]-verts[face[0]]),np.eye(3)[axis]*sign)<0:
                    face.reverse()
                faces.append(face)
        # Each bevel uses points from the adjoining face planes.
        for along in range(3):
            a,baxis=[i for i in range(3) if i!=along]
            for sa in [-1,1]:
                for sb in [-1,1]:
                    face=[]
                    for end,which in [(-1,0),(1,0),(1,1),(-1,1)]:
                        p=np.zeros(3);p[along]=end*(half[along]-b)
                        p[a]=sa*(half[a]-(b if which else 0));p[baxis]=sb*(half[baxis]-(0 if which else b))
                        face.append(len(verts));verts.append(p)
                    outward=np.zeros(3);outward[a]=sa;outward[baxis]=sb
                    if np.dot(np.cross(verts[face[1]]-verts[face[0]],verts[face[2]]-verts[face[0]]),outward)<0:face.reverse()
                    faces.append(face)
        for sx in [-1,1]:
            for sy in [-1,1]:
                for sz in [-1,1]:
                    signs=np.array([sx,sy,sz]);face=[]
                    for axis in range(3):
                        p=signs*(half-b);p[axis]=signs[axis]*half[axis]
                        face.append(len(verts));verts.append(p)
                    if np.dot(np.cross(verts[face[1]]-verts[face[0]],verts[face[2]]-verts[face[0]]),signs)<0:face.reverse()
                    faces.append(face)
        self.add(verts,faces,color,center=c,**kw)

    def ellipsoid(self, c, radii, color, segments=16, rings=8, **kw):
        if self.lod:segments=min(8,segments);rings=min(4,rings)
        verts,normals=[],[]
        r=np.array(radii)
        for j in range(rings+1):
            phi=math.pi*j/rings
            for i in range(segments):
                a=math.tau*i/segments
                p=np.array([math.sin(phi)*math.cos(a),math.cos(phi),math.sin(phi)*math.sin(a)])
                verts.append(p*r);normals.append(normalize(p/r))
        faces=[]
        for j in range(rings):
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments
                if j>0:faces.append((a,b,a+segments))
                if j<rings-1:faces.append((b,b+segments,a+segments))
        self.add(verts,faces,color,normals=normals,center=c,**kw)

    def cylinder(self, a, b, radius, color, r2=None, segments=12, caps=True, **kw):
        if self.lod:segments=min(8,segments)
        a,b=np.array(a),np.array(b);d=b-a;mat=basis(d);length=np.linalg.norm(d)
        r2=radius if r2 is None else r2
        verts=[]
        for y,r in [(0,radius),(length,r2)]:
            for i in range(segments):
                angle=math.tau*i/segments
                verts.append(mat@np.array([r*math.cos(angle),y,r*math.sin(angle)]))
        faces=[(i,segments+i,segments+(i+1)%segments,(i+1)%segments) for i in range(segments)]
        if caps:faces.extend([tuple(range(segments)),tuple(range(segments,2*segments))[::-1]])
        self.add(verts,faces,color,center=a,**kw)

    def tube(self, points, radius, color, segments=8, **kw):
        for a,b in zip(points,points[1:]):
            self.cylinder(a,b,radius,color,segments=segments,**kw)

    def torus(self,c,radius,tube,color,axis=(0,1,0),major=20,minor=6,**kw):
        if self.lod:major=min(12,major);minor=min(4,minor)
        mat=basis(axis);verts=[];normals=[]
        for i in range(major):
            a=math.tau*i/major
            for j in range(minor):
                b=math.tau*j/minor
                n=np.array([math.cos(a)*math.cos(b),math.sin(b),math.sin(a)*math.cos(b)])
                p=np.array([(radius+tube*math.cos(b))*math.cos(a),tube*math.sin(b),(radius+tube*math.cos(b))*math.sin(a)])
                verts.append(mat@p);normals.append(mat@n)
        faces=[]
        for i in range(major):
            for j in range(minor):faces.append((i*minor+j,((i+1)%major)*minor+j,((i+1)%major)*minor+(j+1)%minor,i*minor+(j+1)%minor))
        # Torus loop order is opposite the outward normal for this basis.
        self.add(verts,[f[::-1] for f in faces],color,normals=normals,center=c,**kw)

    def save(self, folder, metadata):
        Path(folder).mkdir(parents=True,exist_ok=True)
        data={'name':self.name,'atlas':self.atlas,'positions':self.p,'normals':self.n,'uv':self.uv,
              'colors':self.col,'groups':self.groups,'parts':self.parts,'anchors':self.anchors,
              'metadata':metadata,'surfaceAudit':self.surface_audit}
        if self.bones:data.update(joints=self.j,weights=self.w)
        (Path(folder)/(self.name+'.json')).write_text(json.dumps(data,separators=(',',':')))
        print(self.name, sum(len(v)//3 for v in self.groups.values()), 'triangles',flush=True)
