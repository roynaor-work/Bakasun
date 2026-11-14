#!/usr/bin/env python3
"""Original CC0 soccer kit. Rebuild with Python 3 + Pillow; no mesh codecs.

Coordinates are metres, Y up, pitch length on X. Every GLB references the
same adjacent atlas.png. See ../LICENSES.md for sources and dedication.
"""
from collections import defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import struct

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
TAU = math.tau
GRASS = (8, 8, 504, 504)
NET = (8, 520, 752, 764)
BALL = (768, 520, 1016, 644)
FACE = (8, 800, 264, 996)
SWATCHES = {
    "white": (584, 64), "slate": (664, 64), "blue": (744, 64),
    "gold": (824, 64), "coral": (904, 64), "wood": (584, 160),
    "skin": (664, 160), "hair": (744, 160),
}
COLORS = {
    "white": (246, 247, 237), "slate": (39, 61, 67),
    "blue": (78, 138, 154), "gold": (244, 194, 79),
    "coral": (217, 109, 78), "wood": (183, 133, 80),
    "skin": (243, 148, 111), "hair": (67, 28, 19),
}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(a):
    return mul(a, 1 / math.sqrt(dot(a, a)))


def uv_rect(rect):
    x0, y0, x1, y1 = rect
    return [(x0/SIZE, y1/SIZE), (x1/SIZE, y1/SIZE),
            (x1/SIZE, y0/SIZE), (x0/SIZE, y0/SIZE)]


def soccer_planes():
    """Half-spaces of a truncated icosahedron, for the small ball atlas."""
    phi = (1 + math.sqrt(5)) / 2
    vertices = [(0, a, b*phi) for a in (-1, 1) for b in (-1, 1)]
    vertices += [(a, b*phi, 0) for a in (-1, 1) for b in (-1, 1)]
    vertices += [(b*phi, 0, a) for a in (-1, 1) for b in (-1, 1)]
    vertices = [unit(v) for v in vertices]
    edges = {(a, b) for a in range(12) for b in range(a+1, 12)
             if abs(dot(sub(vertices[a], vertices[b]), sub(vertices[a], vertices[b])) - 4/(1+phi*phi)) < 1e-6}
    faces = [(a, b, c) for a in range(12) for b in range(a+1, 12) for c in range(b+1, 12)
             if all(tuple(sorted(e)) in edges for e in [(a, b), (a, c), (b, c)])]
    planes = []
    for i, v in enumerate(vertices):
        neighbor = next(b if a == i else a for a, b in edges if i in (a, b))
        cut = add(mul(v, 2/3), mul(vertices[neighbor], 1/3))
        planes.append((v, dot(v, cut), True))
    for a, b, c in faces:
        n = unit(add(add(vertices[a], vertices[b]), vertices[c]))
        planes.append((n, dot(n, vertices[a]), False))
    return planes


def make_atlas():
    rng = random.Random(20261113)
    image = Image.new("RGBA", (SIZE, SIZE), (*COLORS["slate"], 255))
    grass = Image.new("RGBA", (512, 512))
    px = grass.load()
    # Periodic fine grain and blades: the same tile repeats without dark seams.
    for y in range(512):
        for x in range(512):
            grain = rng.randint(-8, 8)
            px[x, y] = (57+grain, 105+grain, int(50+grain*.55), 255)
    blades = ImageDraw.Draw(grass)
    for _ in range(14000):
        x, y = rng.randrange(512), rng.randrange(512)
        length, drift, tint = rng.randrange(2,9), rng.randrange(-2,3), rng.randrange(-9,10)
        blades.line((x,y,x+drift,y+length), fill=(61+tint,111+tint,51+tint,255), width=1)
    image.paste(grass, (0, 0))
    draw = ImageDraw.Draw(image)
    for name, (x, y) in SWATCHES.items():
        draw.rectangle((x-32, y-32, x+32, y+32), fill=(*COLORS[name], 255))
    # A single transparent, square-cell net patch, 100 pixels per metre.
    # 7.44 x 2.44 m rear; sides/roof sample a cropped part at the same density.
    x0, y0, x1, y1 = NET
    draw.rectangle((x0-4, y0-4, x1+4, y1+4), fill=(243, 246, 234, 0))
    for x in range(x0, x1+1, 12):
        draw.line((x, y0, x, y1), fill=(235, 241, 225, 255), width=2)
    for y in range(y0, y1+1, 12):
        draw.line((x0, y, x1, y), fill=(235, 241, 225, 255), width=2)
    draw.rectangle(NET, outline=(235, 241, 225, 255), width=2)
    # Analytic 32-panel ball: 12 black pentagons, 20 ivory hexagons, seams.
    planes = soccer_planes()
    x0, y0, x1, y1 = BALL
    for y in range(y0, y1):
        theta = (y-y0+.5)/(y1-y0)*math.pi
        for x in range(x0, x1):
            phi = (x-x0+.5)/(x1-x0)*TAU
            ray = (math.sin(theta)*math.cos(phi), math.cos(theta), math.sin(theta)*math.sin(phi))
            hits = sorted((d/dp, black) for n, d, black in planes if (dp := dot(n, ray)) > 0)
            seam = (hits[1][0]-hits[0][0])/hits[0][0] < .014
            color = (66, 77, 74) if seam else (30, 44, 46) if hits[0][1] else (243, 243, 230)
            image.putpixel((x, y), (*color, 255))
    # Extrude the ball patch border to keep bilinear filtering within the patch.
    image.paste(image.crop((x0, y0, x1, y0+1)).resize((x1-x0, 4)), (x0, y0-4))
    image.paste(image.crop((x0, y1-1, x1, y1)).resize((x1-x0, 4)), (x0, y1))
    # CC0 Kenney facial details only; no clothing graphics enter the atlas.
    kenney = Image.open(ROOT.parents[2]/"3d/model/skaterMaleA.png").convert("RGBA")
    face = kenney.crop((0,0,640,490)).resize((256,196), Image.Resampling.LANCZOS)
    image.paste(face, FACE[:2])
    image.save(ROOT / "atlas.png", optimize=True)


class Mesh:
    def __init__(self):
        self.positions, self.normals, self.uvs, self.indices = [], [], [], []

    def face(self, points, material, uvs=None, normals=None):
        if uvs is None:
            x, y = SWATCHES.get(material, SWATCHES["white"])
            uvs = [(x/SIZE, y/SIZE)]*len(points)
        normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])))
        first = len(self.positions)
        self.positions.extend(points)
        self.normals.extend(normals or [normal]*len(points))
        self.uvs.extend(uvs)
        for j in range(1, len(points)-1):
            self.indices.extend((first, first+j, first+j+1))

    def quad(self, points, material, rect=None):
        self.face(points, material, uv_rect(rect) if rect else None)


class Model:
    def __init__(self, name, specs):
        self.name, self.specs = name, specs
        self.parts = defaultdict(lambda: defaultdict(Mesh))

    def mesh(self, node, material):
        return self.parts[node][material]

    def quad(self, node, material, points, rect=None):
        self.mesh(node, material).quad(points, material, rect)

    def box(self, node, material, center, size):
        x, y, z = center
        a, b, c = [s/2 for s in size]
        p = [(x+i*a, y+j*b, z+k*c) for i, j, k in
             [(-1,-1,-1), (1,-1,-1), (1,1,-1), (-1,1,-1),
              (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1)]]
        for face in [(0,3,2,1), (4,5,6,7), (0,4,7,3), (1,2,6,5), (3,7,6,2), (0,1,5,4)]:
            self.quad(node, material, [p[i] for i in face])

    def cylinder(self, node, material, a, b, radius, segments=10):
        axis = unit(sub(b, a))
        u = unit(cross(axis, (0,0,1) if abs(axis[2]) < .9 else (1,0,0)))
        v = cross(axis, u)
        ring = [add(mul(u, math.cos(TAU*i/segments)), mul(v, math.sin(TAU*i/segments))) for i in range(segments)]
        mesh = self.mesh(node, material)
        for i in range(segments):
            j = (i+1) % segments
            mesh.face([add(a,mul(ring[i],radius)), add(a,mul(ring[j],radius)),
                       add(b,mul(ring[j],radius)), add(b,mul(ring[i],radius))], material,
                      normals=[ring[i], ring[j], ring[j], ring[i]])
        mesh.face([add(a, mul(r, radius)) for r in reversed(ring)], material)
        mesh.face([add(b, mul(r, radius)) for r in ring], material)

    def write(self):
        gltf = {"asset": {"version":"2.0", "generator":"soccer-pitch-v1/source/build.py", "copyright":"CC0-1.0"},
                "scene":0, "scenes":[{"nodes":[]}], "nodes":[], "meshes":[],
                "materials":[], "textures":[{"sampler":0,"source":0}],
                "images":[{"uri":"atlas.png","name":"soccer-pitch-v1 shared atlas"}],
                "samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":33071,"wrapT":33071}],
                "buffers":[], "bufferViews":[], "accessors":[],
                "extras":{"units":"metres","upAxis":"Y","license":"CC0-1.0", **self.specs}}
        data = bytearray()

        def accessor(values, component, kind, target, bounds=False):
            while len(data) % 4:
                data.append(0)
            flat = [n for row in values for n in row] if kind != "SCALAR" else values
            offset = len(data)
            data.extend(struct.pack("<" + ("f" if component == 5126 else "H")*len(flat), *flat))
            view = len(gltf["bufferViews"])
            gltf["bufferViews"].append({"buffer":0,"byteOffset":offset,"byteLength":len(data)-offset,"target":target})
            result = {"bufferView":view,"componentType":component,"count":len(values),"type":kind}
            if bounds:
                result.update(min=[min(v[i] for v in values) for i in range(3)],
                              max=[max(v[i] for v in values) for i in range(3)])
            index = len(gltf["accessors"])
            gltf["accessors"].append(result)
            return index

        material_ids = {}
        for materials in self.parts.values():
            for name in materials:
                if name in material_ids:
                    continue
                factor = [1, 1, 1, 1]
                if name == "grass_light":
                    factor = [.94, 1, .91, 1]
                if name == "grass_dark":
                    factor = [.76, .85, .74, 1]
                material = {"name":"pitch_lines" if name == "white_lines" else name,
                            "pbrMetallicRoughness":{"baseColorTexture":{"index":0}, "baseColorFactor":factor,
                                                   "metallicFactor":0,"roughnessFactor":.92}}
                if name == "net":
                    material.update(alphaMode="MASK", alphaCutoff=.45, doubleSided=True)
                if name == "gold":
                    material["doubleSided"] = True
                material_ids[name] = len(gltf["materials"])
                gltf["materials"].append(material)
        triangles = 0
        for node_name, materials in self.parts.items():
            primitives = []
            for material, mesh in materials.items():
                primitives.append({"attributes":{"POSITION":accessor(mesh.positions,5126,"VEC3",34962,True),
                                                  "NORMAL":accessor(mesh.normals,5126,"VEC3",34962),
                                                  "TEXCOORD_0":accessor(mesh.uvs,5126,"VEC2",34962)},
                                   "indices":accessor(mesh.indices,5123,"SCALAR",34963),
                                   "material":material_ids[material],"mode":4})
                triangles += len(mesh.indices)//3
            gltf["nodes"].append({"name":node_name,"mesh":len(gltf["meshes"])})
            gltf["scenes"][0]["nodes"].append(len(gltf["nodes"])-1)
            gltf["meshes"].append({"name":node_name,"primitives":primitives})
        while len(data) % 4:
            data.append(0)
        gltf["buffers"] = [{"byteLength":len(data)}]
        gltf["extras"]["triangles"] = triangles
        encoded = json.dumps(gltf, separators=(",", ":")).encode()
        encoded += b" "*((-len(encoded))%4)
        binary = struct.pack("<III",0x46546c67,2,28+len(encoded)+len(data))
        binary += struct.pack("<I4s",len(encoded),b"JSON") + encoded
        binary += struct.pack("<I4s",len(data),b"BIN\x00") + data
        path = ROOT / f"{self.name}.glb"
        path.write_bytes(binary)
        return {"file":path.name,"triangles":triangles,"bytes":len(binary),"sha256":sha256(binary).hexdigest()}


def make_pitch():
    m = Model("pitch", {"length":105,"width":68,"lineWidth":.12,
                      "measurement":"Rectangular markings are measured to outside of paint; centre/penalty arcs have 9.15 m outer radius.",
                      "centerCircleRadius":9.15,"penaltyArea":[40.32,16.5],"goalArea":[18.32,5.5],
                      "penaltySpotFromGoalLine":11,"cornerArcRadius":1,"paintElevation":.003})
    # 20 mowing strips, 7 tiles across. Texture density ~95 texels/metre.
    for i in range(20):
        x0, x1 = -52.5+i*5.25, -52.5+(i+1)*5.25
        for j in range(7):
            z0, z1 = -34+j*68/7, -34+(j+1)*68/7
            m.quad("grass", "grass_light" if i%2 == 0 else "grass_dark",
                   [(x0,0,z1),(x1,0,z1),(x1,0,z0),(x0,0,z0)], GRASS)
    paint = m.mesh("lines", "white_lines")

    def rect(x0,z0,x1,z1):
        paint.quad([(x0,.003,z1),(x1,.003,z1),(x1,.003,z0),(x0,.003,z0)],"white")

    def arc(cx,cz,r,a0,a1,segments):
        for i in range(segments):
            a,b = a0+(a1-a0)*i/segments, a0+(a1-a0)*(i+1)/segments
            points = [(cx+rr*math.cos(t),.003,cz+rr*math.sin(t))
                      for rr,t in [(r-.12,a),(r,a),(r,b),(r-.12,b)]]
            # Circle construction above is clockwise as viewed from +Y.
            paint.face(list(reversed(points)), "white")

    def spot(x,z):
        for i in range(12):
            a,b = TAU*i/12, TAU*(i+1)/12
            paint.face([(x,.003,z),(x+.12*math.cos(b),.003,z+.12*math.sin(b)),
                        (x+.12*math.cos(a),.003,z+.12*math.sin(a))],"white")

    rect(-52.5,-34,52.5,-33.88)
    rect(-52.5,33.88,52.5,34)
    rect(-52.5,-33.88,-52.38,33.88)
    rect(52.38,-33.88,52.5,33.88)
    rect(-.06,-33.88,.06,33.88)
    arc(0,0,9.15,0,TAU,96)
    spot(0,0)
    for sign in (-1,1):
        for width,depth in [(40.32,16.5),(18.32,5.5)]:
            far, near = sign*52.5, sign*(52.5-depth)
            x0,x1 = sorted((far,near))
            rect(x0,-width/2,x1,-width/2+.12)
            rect(x0,width/2-.12,x1,width/2)
            rect(near if sign == 1 else near-.12,-width/2+.12,
                 near+.12 if sign == 1 else near,width/2-.12)
        spot(sign*41.5,0)
        # Only the outside of the penalty area; each end is clipped to x=36.
        a = math.acos(5.5/9.15)
        start,end = (-a,a) if sign == -1 else (math.pi-a,math.pi+a)
        # Clip both radii to the same painted-area boundary, avoiding tiny gaps.
        ri = 9.03
        inner_angle = math.acos(5.5/ri)
        ai,bi = (-inner_angle,inner_angle) if sign == -1 else (math.pi-inner_angle,math.pi+inner_angle)
        for i in range(32):
            t0,t1 = i/32,(i+1)/32
            points = [(sign*41.5+r*math.cos(t),.003,r*math.sin(t)) for r,t in
                      [(ri,ai+(bi-ai)*t0),(9.15,start+(end-start)*t0),
                       (9.15,start+(end-start)*t1),(ri,ai+(bi-ai)*t1)]]
            paint.face(list(reversed(points)),"white")
    for sx,sz,start in [(1,1,math.pi),(-1,1,1.5*math.pi),(-1,-1,0),(1,-1,.5*math.pi)]:
        arc(sx*52.5,sz*34,1,start,start+math.pi/2,12)
    return m.write()


def make_goal():
    m = Model("goal", {"clearWidth":7.32,"clearHeight":2.44,"postDiameter":.12,
                       "depth":2,"frontPlane":"X=0 (front face)","outwardDirection":"+X",
                       "innerPostFacesZ":[-3.66,3.66],"undersideCrossbarY":2.44})
    # Inner post edges at +/-3.66; underside crossbar at 2.44.
    for z in (-3.72,3.72):
        m.cylinder("frame","white",(.06,0,z),(.06,2.5,z),.06,12)
    m.cylinder("frame","white",(.06,2.5,-3.78),(.06,2.5,3.78),.06,12)
    for z in (-3.72,3.72):
        m.cylinder("supports","slate",(1.975,0,z),(1.975,2.44,z),.025,6)
        m.cylinder("supports","slate",(.12,.025,z),(1.975,.025,z),.025,6)
        m.cylinder("supports","slate",(.12,2.44,z),(1.975,2.44,z),.025,6)
    m.cylinder("supports","slate",(1.975,2.44,-3.72),(1.975,2.44,3.72),.025,6)
    # Four double-sided alpha-masked planes; no dense rope geometry.
    m.quad("net","net",[(2,0,-3.72),(2,0,3.72),(2,2.44,3.72),(2,2.44,-3.72)],NET)
    side = (NET[0],NET[1],NET[0]+188,NET[3])
    for z in (-3.72,3.72):
        m.quad("net","net",[(.12,0,z),(2,0,z),(2,2.44,z),(.12,2.44,z)],side)
    roof = (NET[0],NET[1],NET[2],NET[1]+188)
    m.quad("net","net",[(2,2.44,-3.72),(2,2.44,3.72),(.12,2.44,3.72),(.12,2.44,-3.72)],roof)
    return m.write()


def make_flag():
    m = Model("corner_flag", {"height":1.6,"poleDiameter":.04,"flagSize":[.45,.32],"origin":"pole foot"})
    m.cylinder("pole","white",(0,0,0),(0,1.6,0),.02,8)
    # Slightly folded cloth, gold on both sides, no lettering.
    m.quad("flag","gold",[(.02,1.25,0),(.25,1.25,.04),(.25,1.57,.04),(.02,1.57,0)])
    m.quad("flag","gold",[(.25,1.25,.04),(.47,1.25,.015),(.47,1.57,.015),(.25,1.57,.04)])
    return m.write()


def make_bench():
    m = Model("bench", {"width":4,"depth":.65,"seatHeight":.45,"height":.95,"seats":6,"front":"+Z"})
    for z in (-.14,.14):
        m.box("seat","wood",(0,.415,z),(4,.07,.23))
    for y in (.65,.86):
        m.box("backrest","blue",(0,y,-.27),(4,.18,.07))
    for x in (-1.6,1.6):
        m.box("legs","slate",(x,.2,.12),(.08,.4,.45))
        m.box("legs","slate",(x,.55,-.27),(.08,.8,.08))
    return m.write()


def make_board():
    m = Model("ad_board", {"width":4,"height":1,"depth":.3,"front":"+Z","content":"blank flat colours"})
    m.box("housing","slate",(0,.5,0),(4,1,.3))
    # Flat single colour; geometry is a separate, replaceable blank panel.
    m.quad("blank_panel","blue",[(-1.94,.06,.151),(1.94,.06,.151),(1.94,.94,.151),(-1.94,.94,.151)])
    return m.write()


def make_ball():
    m = Model("ball", {"diameter":.22,"radius":.11,"origin":"sphere centre","atlasRegionPixels":[248,124]})
    mesh = m.mesh("ball","ball")
    segments,rings = 24,12
    for j in range(rings):
        for i in range(segments):
            coords = [(i/segments,j/rings),(i/segments,(j+1)/rings),
                      ((i+1)/segments,(j+1)/rings),((i+1)/segments,j/rings)]
            if j == 0:
                coords = [coords[0],coords[1],coords[2]]
            elif j == rings-1:
                coords = [coords[0],coords[1],coords[3]]
            coords.reverse()
            normals = [(math.sin(v*math.pi)*math.cos(u*TAU),math.cos(v*math.pi),
                        math.sin(v*math.pi)*math.sin(u*TAU)) for u,v in coords]
            uvs = [((BALL[0]+u*(BALL[2]-BALL[0]-1)+.5)/SIZE,
                    (BALL[1]+v*(BALL[3]-BALL[1]-1)+.5)/SIZE) for u,v in coords]
            mesh.face([mul(n,.11) for n in normals],"ball",uvs,normals)
    return m.write()


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    make_atlas()
    assets = [make_pitch(),make_goal(),make_flag(),make_bench(),make_board(),make_ball()]
    counts = {a["file"]:a["triangles"] for a in assets}
    instances = {"pitch.glb":1,"goal.glb":2,"corner_flag.glb":4,"bench.glb":2,"ad_board.glb":8,"ball.glb":1}
    manifest = {"license":"CC0-1.0","units":"metres","upAxis":"Y","lengthAxis":"X",
                "baseCommit":"d759582c171600dd7c7df7906c2fb38ae7f8b88a",
                "atlas":{"file":"atlas.png","size":[1024,1024],"sha256":sha256((ROOT/"atlas.png").read_bytes()).hexdigest(),
                         "grassTilePixels":list(GRASS),"netPixels":list(NET),"ballPixels":list(BALL)},
                "assets":assets,"uniqueTriangles":sum(counts.values()),"fullSceneInstances":instances,
                "fullSceneTriangles":sum(counts[k]*v for k,v in instances.items()),"triangleLimit":4000,
                "pitchBounds":{"min":[-52.5,0,-34],"max":[52.5,.003,34]},
                "placement":{"goals":[{"position":[52.38,0,0],"rotationY":0},{"position":[-52.38,0,0],"rotationY":math.pi}],
                             "flags":[[-52.5,0,-34],[-52.5,0,34],[52.5,0,-34],[52.5,0,34]]},
                "camera":{"source":"../../data/config.json minigames.soccer.view.camera",
                          "fov":42,"landscapeElevation":28,"landscapeDistance":15,
                          "portraitElevation":40,"portraitDistance":21,"near":.1,"far":240}}
    (ROOT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"assets":counts,"uniqueTriangles":manifest["uniqueTriangles"],
                      "fullSceneTriangles":manifest["fullSceneTriangles"]},indent=2))


if __name__ == "__main__":
    main()
