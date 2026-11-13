#!/usr/bin/env python3
"""Original CC0 assets. Run with Python 3 + requirements.txt, from any directory.

No downloaded art, meshes, fonts, text decals, compression, or runtime dependencies.
Geometry is metre-scale, Y-up. Downhill is -Z; camera is behind the skier at +Z.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau
THEMES = [
    dict(id="01-pine", name="יער האורנים", subtitle="שלג רך ושמש בין העצים", sky=["#78bccc", "#fff0cc"], snow="#f4f1df", ground="#c6dbd6", rock="#7f9b90", accent="#e8ba77", vegetation=["pine-tall", "pine-round", "pine-young"], fx=["#fff9df", "#c5ece9", "#f3c887"], fog="#d7e4d9"),
    dict(id="02-ice", name="מערת הקרח", subtitle="קשתות כחולות ונצנוץ שקט", sky=["#244c82", "#b8edf0"], snow="#e2f4f4", ground="#7ac1db", rock="#5094c0", accent="#c8e9f1", vegetation=["ice-cluster", "ice-arch", "ice-spire"], fx=["#e2ffff", "#8cdced", "#efd3a1"], fog="#a8d4e3"),
    dict(id="03-volcano", name="ההר הזוהר", subtitle="סלעים כהים ושלג מפויח", sky=["#827e9b", "#f4d1b2"], snow="#dddde2", ground="#9d99ac", rock="#555361", accent="#efbc7c", vegetation=["basalt-stack", "soot-boulder", "glow-stones"], fx=["#eee6dd", "#c4bed5", "#f1c385"], fog="#b9aab8"),
    dict(id="04-aurora", name="ליל הזוהר", subtitle="כוכבים ואורורה מעל השלג", sky=["#172943", "#7b9eae"], snow="#d9e4ec", ground="#859dad", rock="#63758e", accent="#a7ded1", vegetation=["night-pine", "frost-boulder", "moon-crystal"], fx=["#e2f9ee", "#a6e6d5", "#f1d6a9"], fog="#758fa6"),
    dict(id="05-village", name="הכפר האלפיני", subtitle="בקתות עץ וחבלים בין האורנים", sky=["#8bc9ce", "#ffe9c9"], snow="#f6efdc", ground="#d9d9c9", rock="#ab9d8e", accent="#dca87b", vegetation=["village-pine", "garden-boulder", "snow-fir"], fx=["#fff4da", "#c9e4dd", "#e9bb82"], fog="#e9dfcd"),
    dict(id="06-summit", name="פסגת העננים", subtitle="הר עצום, עננים ואוויר בהיר", sky=["#609fbf", "#e5eef0"], snow="#f1f3eb", ground="#b9cbd4", rock="#829aaa", accent="#edca8e", vegetation=["granite-slab", "snow-spire", "cloud-boulder"], fx=["#fffceb", "#cbe4ee", "#ecd5a6"], fog="#cbdde4"),
]


def rgb(color):
    return np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def save_png(path, pixels):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(path, optimize=True)


class Mesh:
    """Small, unindexed, flat-shaded meshes with named PBR material groups."""
    def __init__(self, name):
        self.name = name
        self.groups = defaultdict(list)
        self.materials = {}

    def mat(self, color, glow=False):
        key = (color, glow)
        if key not in self.materials:
            self.materials[key] = len(self.materials)
        return key

    def face(self, vertices, material, uvs=None):
        for i in range(1, len(vertices) - 1):
            tri = [np.array(vertices[j], dtype=float) for j in (0, i, i + 1)]
            normal = np.cross(tri[1] - tri[0], tri[2] - tri[0])
            if np.linalg.norm(normal) < 1e-8:
                continue
            normal /= np.linalg.norm(normal)
            tex = [uvs[j] for j in (0, i, i + 1)] if uvs else [(p[0] / 8, -p[2] / 8) for p in tri]
            self.groups[material].append((tri, normal, tex))

    def box(self, center, size, color, bevel=0):
        x, y, z = center
        w, h, d = np.array(size) / 2
        pts = [(x + sx * w, y + sy * h, z + sz * d) for sx, sy, sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        m = self.mat(color)
        for indices in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,4,7,3),(1,2,6,5)]:
            self.face([pts[i] for i in indices], m)

    def frustum(self, center, height, bottom, top, color, sides=8, phase=0, cap=True):
        x, y, z = center
        rings = [[(x + radius * math.cos(TAU * i / sides + phase), y + dy, z + radius * math.sin(TAU * i / sides + phase)) for i in range(sides)] for dy, radius in [(0, bottom), (height, top)]]
        m = self.mat(color)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([rings[0][i], rings[1][i], rings[1][j], rings[0][j]], m)
        if cap:
            self.face(rings[0], m)
            self.face(list(reversed(rings[1])), m)

    def gem(self, center, size, color, glow=False):
        x, y, z = center
        a, b, c = size
        ring = [(x-a,y,z),(x,y,z+c),(x+a,y,z),(x,y,z-c)]
        for i in range(4):
            self.face([ring[(i+1)%4], (x,y+b,z), ring[i]], self.mat(color, glow))
            self.face([ring[i], (x,y-b,z), ring[(i+1)%4]], self.mat(color, glow))

    def beam(self, a, b, radius, color, sides=7):
        a,b=np.array(a,dtype=float),np.array(b,dtype=float)
        axis=(b-a)/np.linalg.norm(b-a)
        tangent=np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0])
        tangent/=np.linalg.norm(tangent)
        other=np.cross(axis,tangent)
        rings=[[point+radius*(math.cos(i*TAU/sides)*tangent+math.sin(i*TAU/sides)*other) for i in range(sides)] for point in [a,b]]
        for i in range(sides):
            j=(i+1)%sides
            self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],self.mat(color))
        self.face(list(reversed(rings[0])),self.mat(color))
        self.face(rings[1],self.mat(color))

    def write(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        blob = bytearray()
        views, accessors, primitives = [], [], []

        def attribute(data, width, kind):
            array = np.asarray(data, dtype="<f4").reshape(-1, width)
            offset = len(blob)
            blob.extend(array.tobytes())
            views.append(dict(buffer=0, byteOffset=offset, byteLength=array.nbytes, target=34962))
            accessor = dict(bufferView=len(views)-1, componentType=5126, count=len(array), type=kind)
            if width == 3:
                accessor.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
            accessors.append(accessor)
            return len(accessors)-1

        for key, triangles in self.groups.items():
            positions, normals, uv = [], [], []
            for tri, normal, tex in triangles:
                positions.extend(tri)
                normals.extend([normal] * 3)
                uv.extend(tex)
            primitives.append(dict(attributes=dict(POSITION=attribute(positions,3,"VEC3"), NORMAL=attribute(normals,3,"VEC3"), TEXCOORD_0=attribute(uv,2,"VEC2")), material=self.materials[key], mode=4))
        materials = []
        for color, glow in self.materials:
            srgb = rgb(color) / 255
            # glTF PBR factors are linear; PNG base-color textures remain sRGB.
            factor = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4).tolist()
            material = dict(name=("glow-" if glow else "mat-")+color[1:], pbrMetallicRoughness=dict(baseColorFactor=factor+[1], metallicFactor=0, roughnessFactor=0.93), doubleSided=True)
            if glow:
                material["emissiveFactor"] = [v * .38 for v in factor]
            materials.append(material)
        document = dict(asset=dict(version="2.0", generator="Alpine themes v1 original mesh builder", copyright="Original artwork dedicated to CC0-1.0; see LICENSES.md"), scene=0, scenes=[dict(nodes=[0])], nodes=[dict(name=self.name, mesh=0)], meshes=[dict(name=self.name, primitives=primitives)], materials=materials, buffers=[dict(byteLength=len(blob))], bufferViews=views, accessors=accessors)
        document_bytes = json.dumps(document, separators=(",", ":")).encode()
        document_bytes += b" " * (-len(document_bytes) % 4)
        blob.extend(b"\0" * (-len(blob) % 4))
        result = struct.pack("<4sII", b"glTF", 2, 28+len(document_bytes)+len(blob)) + struct.pack("<I4s",len(document_bytes),b"JSON") + document_bytes + struct.pack("<I4s",len(blob),b"BIN\0") + blob
        path.write_bytes(result)
        triangles = sum(len(group) for group in self.groups.values())
        assert 0 < triangles <= 800, (path, triangles)
        points = np.array([p for group in self.groups.values() for tri, _, _ in group for p in tri])
        return dict(path=path.relative_to(ROOT).as_posix(), triangles=triangles, bytes=len(result), bounds=dict(min=points.min(axis=0).round(4).tolist(), max=points.max(axis=0).round(4).tolist()), license="CC0-1.0")


def pine(mesh, theme, variant):
    h = [5.3, 3.9, 2.8][variant]
    radius = [1.55, 1.65, 1.05][variant]
    foliage = ["#476e60", "#608474", "#749282"] if theme["id"] != "04-aurora" else ["#496172", "#566f7f", "#698391"]
    mesh.frustum((0,0,0), h*.36, .19, .13, "#99785e", 7)
    for j in range(3):
        base = h*(.19 + j*.21)
        hh = h*(.44 - j*.045)
        r = radius*(1-j*.24)
        mesh.frustum((0,base,0), hh, r, 0, foliage[j], 8, phase=j*.16)
        # A separate generous snow mantle, with visible green branch tips.
        mesh.frustum((0,base+hh*.21,0), hh*.80, r*.84, 0, theme["snow"], 8, phase=j*.16)


def boulder(mesh, theme, variant, crystal=False):
    seed = sum(map(ord, mesh.name))
    rng = random.Random(seed)
    if crystal:
        for i in range(3 + (variant == 0)):
            x, z = [(0,0),(-.8,.18),(.7,.24),(.25,-.7)][i]
            height = [3.5,2.2,1.7,1.4][i] * (1.3 if variant==2 else 1)
            r = [.68,.49,.43,.4][i]
            mesh.frustum((x,0,z), height*.73, r, r*.65, theme["rock"], 5, i*.6)
            mesh.frustum((x,height*.73,z), height*.27, r*.65, 0, "#a2dce7", 5, i*.6)
            mesh.gem((x-.13,height*.65,z+r*.8),(.10,.19,.04),"#e8ffff",True)
        return
    w, h, d = [(1.9,1.8,1.5),(2.2,1.3,1.7),(1.3,3.4,1.1)][variant]
    sides = 7
    jitter = [rng.uniform(.83,1.12) for _ in range(sides)]
    rings = []
    for y, scale, shift in [(0,.85,0),(h*.45,1,0),(h*.83,.65,.12),(h,.18,.23)]:
        rings.append([(math.cos(i*TAU/sides)*w*scale*jitter[i]+shift,y,math.sin(i*TAU/sides)*d*scale*jitter[i]) for i in range(sides)])
    for k in range(3):
        for i in range(sides):
            j = (i+1)%sides
            color = theme["rock"] if k<2 else theme["snow"]
            mesh.face([rings[k][i],rings[k+1][i],rings[k+1][j],rings[k][j]], mesh.mat(color))
    mesh.face(rings[0],mesh.mat(theme["rock"]))
    mesh.face(list(reversed(rings[-1])),mesh.mat(theme["snow"]))
    if theme["id"] == "03-volcano":
        # Soft amber crystal inclusions; no liquid, fire, damage or lava surface.
        for x, y in [(-.7,.45),(.1,.7),(.75,.35)]:
            mesh.gem((x,y,d*.78),(.16,.23,.05),theme["accent"],True)


def arch(mesh, theme):
    sides, segments = 6, 12
    rings = []
    for k in range(segments+1):
        a = k*math.pi/segments
        rings.append([(5.4*math.cos(a)+.70*math.cos(i*TAU/sides)*math.cos(a), 1.0+5.1*math.sin(a)+.70*math.cos(i*TAU/sides)*math.sin(a), .80*math.sin(i*TAU/sides)) for i in range(sides)])
    for k in range(segments):
        for i in range(sides):
            j=(i+1)%sides
            mesh.face([rings[k][i],rings[k][j],rings[k+1][j],rings[k+1][i]],mesh.mat(theme["rock"] if i%3 else "#a5dfea"))
    mesh.face(rings[0],mesh.mat(theme["rock"]))
    mesh.face(list(reversed(rings[-1])),mesh.mat(theme["rock"]))
    for x in [-5.4,5.4]:
        mesh.frustum((x,0,0),1.1,.9,.73,theme["rock"],6)
    for x, y in [(-2.4,5.4),(0,6),(2.7,5.3)]:
        mesh.gem((x,y,-.7),(.12,.3,.08),"#e3ffff",True)


def gate(mesh, theme, color):
    for sign in [-1,1]:
        x=sign*3.2
        mesh.frustum((x,0,0),2.8,.054,.043,"#59646e",7)
        mesh.frustum((x,0,0),.10,.20,.13,theme["snow"],8)
        # Each gate is TWO flags. Both sides receive the same course color.
        verts=[(x,2.62,0),(x-sign*.98,2.56,.09),(x-sign*.98,1.90,.04),(x,1.94,0)]
        mesh.face(verts,mesh.mat(color))
        # Pale border and a plain diamond make flags readable without text.
        mesh.face([(x,2.62,.012),(x-sign*.98,2.56,.102),(x-sign*.98,2.46,.102),(x,2.52,.012)],mesh.mat("#fff5de"))
        cx=x-sign*.49
        mesh.face([(cx,2.46,.12),(cx-sign*.16,2.24,.12),(cx,2.06,.12),(cx+sign*.16,2.24,.12)],mesh.mat("#fff5de"))


def ramp(mesh, theme):
    verts=[(-1.6,0,2.3),(1.6,0,2.3),(-1.6,1.05,-2.3),(1.6,1.05,-2.3),(-1.6,0,-2.3),(1.6,0,-2.3)]
    for idx,col in [((0,1,3,2),theme["snow"]),((4,5,1,0),theme["ground"]),((2,3,5,4),theme["ground"]),((0,2,4),theme["rock"]),((1,5,3),theme["rock"])]:
        mesh.face([verts[i] for i in idx],mesh.mat(col))
    for x in [-1.43,1.43]:
        mesh.face([(x-.05,.018,2.22),(x+.05,.018,2.22),(x+.05,1.058,-2.22),(x-.05,1.058,-2.22)],mesh.mat(theme["accent"]))


def arrow(mesh, theme):
    mesh.frustum((0,0,0),1.9,.10,.09,"#a88c6f",7)
    # Extruded arrow silhouette, +X direction, visible from both sides.
    polygon=[(-.85,1.55),(.10,1.55),(.10,1.31),(.85,1.94),(.10,2.57),(.10,2.32),(-.85,2.32)]
    # The concave outline is triangulated explicitly; no fan crossing the notch.
    front=[(x,y,.12) for x,y in polygon]
    back=[(x,y,-.12) for x,y in polygon]
    for idx in [(0,1,5),(0,5,6),(1,2,3),(1,3,5),(3,4,5)]:
        mesh.face([front[i] for i in idx],mesh.mat(theme["accent"]))
        mesh.face([back[i] for i in reversed(idx)],mesh.mat(theme["accent"]))
    for i in range(len(polygon)):
        j=(i+1)%len(polygon)
        mesh.face([front[i],back[i],back[j],front[j]],mesh.mat("#a98260"))


def chalet(mesh, theme):
    mesh.box((0,1.25,0),(4.6,2.5,3.8),"#b88963")
    mesh.box((0,.16,0),(5.0,.32,4.1),"#a29f96")
    a=[(-2.65,2.5,-2.25),(2.65,2.5,-2.25),(0,4.2,-2.25),(-2.65,2.5,2.25),(2.65,2.5,2.25),(0,4.2,2.25)]
    for ids,col in [((0,2,1),"#977459"),((3,4,5),"#977459"),((0,3,5,2),theme["snow"]),((2,5,4,1),theme["snow"]),((0,1,4,3),"#a77e5d")]:
        mesh.face([a[i] for i in ids],mesh.mat(col))
    mesh.box((0,.95,1.915),(.85,1.6,.04),"#846650")
    for x in [-1.45,1.45]:
        mesh.box((x,1.55,1.94),(.91,.91,.09),"#f4d397")
        mesh.box((x,1.55,2.0),(.065,.94,.05),"#9e7959")
        mesh.box((x,1.55,2.0),(.94,.065,.05),"#9e7959")
        mesh.box((x,1.02,2.03),(1.12,.14,.22),theme["snow"])
    for y in [.55,1.0,1.45,1.9,2.35]:
        for x in [-2.31,2.31]:
            mesh.box((x,y,0),(.05,.05,3.8),"#c69b75")


def rope_fence(mesh, theme):
    for x in [-2.5,0,2.5]:
        mesh.frustum((x,0,0),1.15,.11,.09,"#ab8562",7)
        mesh.frustum((x,1.13,0),.09,.13,.07,theme["snow"],7)
    for span in [-2.5,0]:
        # Continuous low-poly rope with gentle sag between posts.
        for height in [.45,.95]:
            points=[(span+2.5*i/8,height-.18*math.sin(i*math.pi/8),0) for i in range(9)]
            for a,b in zip(points,points[1:]):
                for j in range(4):
                    angles=[TAU*j/4,TAU*(j+1)/4]
                    mesh.face([(a[0],a[1]+.027*math.cos(angles[0]),.027*math.sin(angles[0])),(b[0],b[1]+.027*math.cos(angles[0]),.027*math.sin(angles[0])),(b[0],b[1]+.027*math.cos(angles[1]),.027*math.sin(angles[1])),(a[0],a[1]+.027*math.cos(angles[1]),.027*math.sin(angles[1]))],mesh.mat("#dfc69a"))


def terrain(mesh, theme):
    for x in range(4):
        for z in range(4):
            # An exactly flat 8x8m repeatable tile with common global UV scale.
            mesh.face([(x*2-4,0,z*2-4),(x*2-4,0,z*2-2),(x*2-2,0,z*2-2),(x*2-2,0,z*2-4)],mesh.mat(theme["snow"]))


def skier(mesh):
    for x in [-.23,.23]:
        mesh.box((x,.055,0),(.17,.09,1.9),"#446c72")
        mesh.box((x,.19,.05),(.21,.24,.37),"#edbd79")
        mesh.beam((x,.29,.05),(x,.49,-.12),.105,"#4d6778")
        mesh.beam((x,.49,-.12),(x*.8,.73,.13),.12,"#4d6778")
    mesh.frustum((0,.68,.10),.43,.27,.33,"#df8963",8)
    mesh.frustum((0,1.10,.06),.17,.19,.23,"#efbe74",9)
    mesh.frustum((0,1.27,.06),.15,.23,.06,"#efbe74",9)
    for x in [-.39,.39]:
        mesh.beam((x*.74,1.04,.08),(x,.87,-.08),.105,"#df8963")
        mesh.beam((x,.87,-.08),(x*.94,.81,-.27),.09,"#df8963")
        mesh.gem((x*.94,.8,-.28),(.085,.09,.1),"#53697a")
        mesh.beam((x*.94,.80,-.28),(x*1.45,.08,.45),.018,"#8c9b9b",5)
    mesh.box((0,1.21,-.14),(.37,.09,.05),"#58717c")


def textures(folder, theme, index):
    n=1024
    y,x=np.mgrid[0:n,0:n]/(n-1)
    # Periodic integer Fourier modes give exact matching opposite edges.
    noise=(np.sin(TAU*(3*x+2*y)+.7)+.65*np.cos(TAU*(7*x-4*y))+.35*np.sin(TAU*(13*x+9*y)+index))
    # Small broad triangular facets, still periodic and deliberately low contrast.
    faceted=np.abs(np.sin(TAU*(5*x+3*y)))*1.7+np.abs(np.cos(TAU*(4*x-7*y)))
    snow=rgb(theme["snow"])+noise[:,:,None]*.65+faceted[:,:,None]*.45
    for name,weight in [("snow",0),("ground-a",.20),("ground-b",.36)]:
        coverage=(.5+.5*np.sin(TAU*(2*x+3*y)+index))*(.5+.5*np.cos(TAU*(3*x-y)))
        mix=coverage[:,:,None]*weight
        image=snow*(1-mix)+rgb(theme["ground"])*mix
        pixels=np.uint8(np.clip(image,0,255))
        pixels[-1]=pixels[0]
        pixels[:,-1]=pixels[:,0]
        save_png(folder/"textures"/(name+".png"),pixels)


def sky(folder, theme, index):
    w,h=2048,1024
    top,bottom=rgb(theme["sky"][0]),rgb(theme["sky"][1])
    gradient=np.linspace(0,1,h)[:,None,None]
    pixels=np.broadcast_to(top*(1-gradient)+bottom*gradient,(h,w,3)).copy()
    im=Image.fromarray(np.uint8(pixels))
    d=ImageDraw.Draw(im)
    rng=random.Random(200+index)
    if index==3:
        for _ in range(190):
            x,y=rng.randrange(w),rng.randrange(40,550)
            r=rng.choice([1,1,2,3])
            d.ellipse((x-r,y-r,x+r,y+r),fill="#f6e7c9")
        # Transparent polygon ribbons; no flashing, high-frequency flicker or text.
        layer=Image.new("RGBA",im.size)
        ld=ImageDraw.Draw(layer)
        for j,col in enumerate([(139,217,196,38),(167,188,219,42),(132,215,202,55),(175,227,207,55)]):
            upper=[(x,190+j*37+int(70*math.sin(x/360+j*.4))) for x in range(-20,w+30,20)]
            lower=[(x,y+65) for x,y in reversed(upper)]
            ld.polygon(upper+lower,fill=col)
        im=Image.alpha_composite(im.convert("RGBA"),layer).convert("RGB")
        d=ImageDraw.Draw(im)
        d.ellipse((1530,112,1640,222),fill="#f4dfaf")
    elif index != 1:
        d.ellipse((1515,130,1650,265),fill="#fff0cc")
        for cx,cy,size in [(330,200,1),(850,290,.65),(1790,390,.7)]:
            pts=[(cx+int(dx*size),cy+int(dy*size)) for dx,dy in [(-160,18),(-126,-8),(-60,-12),(-20,-55),(50,-38),(80,-5),(151,14),(180,37),(-160,37)]]
            d.polygon(pts,fill="#e8efea" if index==5 else "#f5ebd9")
    # Three layers of low-poly mountains. The summit has a much taller silhouette.
    for layer,color in enumerate(["#b8d1d4","#9ebbc5","#88aab9"] if index not in [2,3] else (["#afa1b0","#95869c","#766e87"] if index==2 else ["#65839c","#4d6b89","#3b5678"])):
        base=560+layer*145
        pts=[(-50,h+20),(-50,base)]
        peaks=[]
        for x in range(-100,w+460,420):
            peak=base-rng.randint(230,340)-(120 if index==5 and 650<x<1300 else 0)
            if index==2 and 700<x<1200:
                peak=base-330
            pts.extend([(x-225,base-30),(x,peak),(x+250,base-20)])
            peaks.append((x,peak))
        pts.append((w+100,h+20))
        d.polygon(pts,fill=color)
        for x,y in peaks:
            d.polygon([(x,y),(x-95,y+125),(x-38,y+92),(x+20,y+130),(x+91,y+125)],fill="#dce8e7" if index!=3 else "#b5c6d6")
    if index==2:
        # A wide, calm volcanic silhouette with an amber rim, never a lava flow.
        d.polygon([(180,800),(815,280),(1040,245),(1205,295),(1840,800)],fill="#68667c")
        d.polygon([(1040,245),(1205,295),(1840,800),(1150,680)],fill="#777184")
        d.polygon([(770,315),(815,280),(1040,245),(1205,295),(1260,340),(1130,324),(1030,286),(865,320)],fill="#cbc7ce")
        d.polygon([(849,280),(1038,248),(1161,284),(1030,270)],fill="#edc494")
    if index==5:
        d.polygon([(245,840),(1080,85),(1840,840)],fill="#7299ae")
        d.polygon([(1080,85),(1840,840),(1140,725)],fill="#99b5c2")
        d.polygon([(1080,85),(785,352),(925,320),(1000,382),(1070,300),(1160,380),(1240,342),(1318,351)],fill="#f0f3e9")
    if index==1:
        # An enclosing faceted cave frame with open, readable center.
        for side in [-1,1]:
            points=[(0,0),(w//2-390,0),(w//2-610,190),(w//2-700,400),(w//2-850,680),(0,840)]
            if side==1:
                points=[(w-x,y) for x,y in points]
            d.polygon(points,fill="#376793")
        for x in range(0,w,190):
            d.polygon([(x,0),(x+170,0),(x+90,rng.randint(110,270))],fill="#548fb9")
        for _ in range(75):
            x,y=rng.randrange(w),rng.randrange(80,760)
            if abs(x-w/2)>550:
                d.polygon([(x-3,y),(x,y-7),(x+3,y),(x,y+7)],fill="#c1f2f7")
    if index==5:
        for x,y in [(80,365),(710,405),(1760,375)]:
            d.polygon([(x-350,y+40),(x-260,y-10),(x-100,y-25),(x,y-60),(x+140,y-20),(x+300,y+10),(x+400,y+65)],fill="#e2edef")
    path=folder/"textures/sky.png"
    path.parent.mkdir(parents=True,exist_ok=True)
    im.save(path,optimize=True)


def particles(folder, theme):
    # Two isolated transparent sprites and a four-cell atlas, all drawn from scratch.
    sprites=[]
    for kind in ["snowflake","sparkle","powder","glow"]:
        im=Image.new("RGBA",(256,256))
        d=ImageDraw.Draw(im)
        color=tuple(rgb(theme["fx"][0 if kind in ["snowflake","powder"] else 2]).astype(int))
        if kind=="snowflake":
            for i in range(6):
                a=i*TAU/6
                end=(128+88*math.cos(a),128+88*math.sin(a))
                d.line([(128,128),end],fill=color+(235,),width=10)
                for scale in [.49,.75]:
                    px,py=128+88*scale*math.cos(a),128+88*scale*math.sin(a)
                    for turn in [-1,1]:
                        d.line([(px,py),(px-25*math.cos(a+turn*.85),py-25*math.sin(a+turn*.85))],fill=color+(225,),width=7)
        elif kind=="sparkle":
            d.polygon([(128,22),(146,106),(224,128),(146,150),(128,234),(109,150),(32,128),(109,106)],fill=color+(230,))
        else:
            yy,xx=np.mgrid[0:256,0:256]
            r=np.sqrt(((xx-127.5)/120)**2+((yy-127.5)/120)**2)
            alpha=np.clip(1-r,0,1)**(1.7 if kind=="powder" else 2.6)
            rgba=np.zeros((256,256,4),dtype=np.uint8)
            rgba[:,:,:3]=color
            rgba[:,:,3]=np.uint8(alpha*(190 if kind=="powder" else 145))
            im=Image.fromarray(rgba)
        sprites.append(im)
        im.save(folder/"textures"/(kind+".png"),optimize=True)
    atlas=Image.new("RGBA",(1024,256))
    for i,im in enumerate(sprites):
        atlas.paste(im,(i*256,0))
    atlas.save(folder/"textures/particles.png",optimize=True)


def levels():
    result=[]
    for ti,theme in enumerate(THEMES):
        for stage in range(5):
            number=ti*5+stage+1
            length=240+stage*36
            gates=[]
            for i in range(6+stage):
                x=round(math.sin((i+stage*.45)*1.35)*(0.9+stage*.23),3)
                gates.append(dict(position=[x,0,-(18+i*28)],asset="gate-coral" if i%2==0 else "gate-teal", clearWidthM=4.44))
            props=[]
            rng=random.Random(7100+number)
            for i in range(24+stage*4):
                side=-1 if i%2 else 1
                asset=theme["vegetation"][i%3]
                offset=rng.uniform(8.0,12.5) if asset!="ice-arch" else rng.uniform(12.5,15)
                distance=7+(i//2)*(length-14)/((24+stage*4)//2-1)
                props.append(dict(asset=asset,position=[round(side*offset,3),0,round(-distance,3)],yaw=round(rng.uniform(-.6,.6),3),scale=round(rng.uniform(.85,1.18),3)))
            if ti==4:
                for i in range(5):
                    props.append(dict(asset="chalet",position=[(-1 if i%2 else 1)*11.5,0,-12-i*43],yaw=0,scale=1))
                    props.append(dict(asset="rope-fence",position=[(-1 if i%2 else 1)*7.5,0,-10-i*43],yaw=math.pi/2,scale=1))
            if ti==1:
                # Arch spans the course; legs stay well outside the ski corridor.
                props.append(dict(asset="ice-arch",position=[0,0,-38],yaw=0,scale=1.15))
            result.append(dict(id=number,theme=theme["id"],stageInTheme=stage+1,seed=7100+number,lengthM=length,courseWidthM=14,camera=dict(position=[0,3.5,9],lookAt=[0,1,-14],fov=54),gates=gates,ramps=[dict(asset="ramp",position=[(-1 if stage%2 else 1)*1.2,0,-(58+j*112)]) for j in range(1+int(stage>=3))],arrows=[dict(asset="arrow-sign",position=[-6.6,0,-12],yaw=0)],props=props,groundTiles=["ground-a","ground-b"],particlePreset="ambient",designOnly=True))
    return result


def main():
    manifest=dict(schemaVersion=1,license="CC0-1.0",units="metres",upAxis="+Y",forwardAxis="-Z",style="warm low poly / soft matte / coral and teal flags",integration="design assets only; no gameplay code changed",modelTriangleLimit=800,textureColorSpace="sRGB",themes=[],levels="levels.json",referenceSkier="shared/reference-skier.glb")
    for index,theme in enumerate(THEMES):
        folder=ROOT/"themes"/theme["id"]
        textures(folder,theme,index)
        sky(folder,theme,index)
        particles(folder,theme)
        models={}
        for j,name in enumerate(theme["vegetation"]):
            mesh=Mesh(name)
            if "pine" in name or "fir" in name:
                pine(mesh,theme,j)
            elif name=="ice-arch":
                arch(mesh,theme)
            else:
                boulder(mesh,theme,j,crystal=index==1 or name=="moon-crystal")
            models[name]=mesh.write(folder/"models"/(name+".glb"))
        for name,builder in [("gate-coral",lambda m,t:gate(m,t,"#e4856d")),("gate-teal",lambda m,t:gate(m,t,"#499c9c")),("ramp",ramp),("arrow-sign",arrow),("terrain-tile",terrain)]+([("chalet",chalet),("rope-fence",rope_fence)] if index==4 else []):
            mesh=Mesh(name)
            builder(mesh,theme)
            models[name]=mesh.write(folder/"models"/(name+".glb"))
        effects=dict(palette=dict(powder=theme["fx"][0],sparkle=theme["fx"][1],celebration=theme["fx"][2],gateCoral="#e4856d",gateTeal="#499c9c"),atlas=dict(path="textures/particles.png",size=[1024,256],cells=[dict(name=name,uvRect=[i/4,0,.25,1],pixels=[i*256,0,256,256]) for i,name in enumerate(["snowflake","sparkle","powder","glow"])]),presets=dict(ambient=dict(sprite="snowflake",maxParticles=40,ratePerSecond=6,speedMps=[.15,.45],sizeM=[.035,.12],opacity=.55,blend="normal"),sparkle=dict(sprite="sparkle",maxParticles=16,ratePerSecond=2,lifetimeSeconds=[1.5,3.5],sizeM=[.04,.10],opacity=.40,blend="additive"),skiPowder=dict(sprite="powder",maxParticles=48,ratePerSecond=14,lifetimeSeconds=[.35,.75],sizeM=[.08,.34],opacity=.28,blend="normal")),flashing=False,volcanicGlow="static amber stone inclusions only; no lava or hazards")
        dump(folder/"effects.json",effects)
        manifest["themes"].append(dict(id=theme["id"],name=theme["name"],subtitle=theme["subtitle"],levelRange=[index*5+1,index*5+5],palette=dict(snow=theme["snow"],ground=theme["ground"],rock=theme["rock"],accent=theme["accent"],fog=theme["fog"],sky=theme["sky"]),textures={name:dict(path=f"themes/{theme['id']}/textures/{name}.png",size=[2048,1024] if name=="sky" else ([1024,256] if name=="particles" else ([256,256] if name in ["snowflake","sparkle","powder","glow"] else [1024,1024])),seamless=name in ["snow","ground-a","ground-b"]) for name in ["snow","ground-a","ground-b","sky","snowflake","sparkle","powder","glow","particles"]},environment=theme["vegetation"],models=models,effects=f"themes/{theme['id']}/effects.json",preview=f"previews/{theme['id']}.png"))
    mesh=Mesh("reference-skier")
    skier(mesh)
    manifest["referenceSkierInfo"]=mesh.write(ROOT/"shared/reference-skier.glb")
    dump(ROOT/"manifest.json",manifest)
    dump(ROOT/"levels.json",dict(schemaVersion=1,description="30 distinct illustrative course layouts; integration data, not a game engine",levels=levels()))
    print(json.dumps(dict(themes=6,levels=30,glbs=1+sum(len(t["models"]) for t in manifest["themes"]),maxTriangles=max(m["triangles"] for t in manifest["themes"] for m in t["models"].values())),indent=2))


if __name__=="__main__":
    main()
