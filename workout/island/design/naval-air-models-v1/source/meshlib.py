"""Small, deterministic, standard-library-only GLB authoring helpers. CC0-1.0."""
import json
import math
import struct
from pathlib import Path


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    d = math.sqrt(sum(x*x for x in v))
    return tuple(x/d for x in v) if d else (0, 0, 0)


def linear_color(color):
    rgb = [int(color.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)


class Mesh:
    def __init__(self):
        self.positions, self.normals, self.colors = [], [], []

    def triangle(self, a, b, c, color):
        n = cross(sub(b, a), sub(c, a))
        if sum(x*x for x in n) < 1e-18:
            return self
        n, rgb = unit(n), linear_color(color)
        for p in (a, b, c):
            self.positions.append(tuple(p))
            self.normals.append(n)
            self.colors.append(rgb)
        return self

    def quad(self, a, b, c, d, color):
        return self.triangle(a, b, c, color).triangle(a, c, d, color)

    def box(self, center, size, color):
        x, y, z = center
        a, b, c = (v/2 for v in size)
        p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
             (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
            self.quad(*(p[i] for i in ids), color)
        return self

    def loft(self, rings, sides, color):
        """Closed elliptical cross-sections along increasing Z: (z, rx, ry, cy)."""
        points = [[(rx*math.cos(2*math.pi*i/sides), cy+ry*math.sin(2*math.pi*i/sides), z)
                   for i in range(sides)] for z, rx, ry, cy in rings]
        for a, b in zip(points, points[1:]):
            for i in range(sides):
                j = (i+1) % sides
                self.quad(a[i], a[j], b[j], b[i], color)
        for k, reverse in ((0, True), (-1, False)):
            z, _, _, cy = rings[k]
            for i in range(sides):
                a, b = points[k][i], points[k][(i+1) % sides]
                self.triangle((0,cy,z), b if reverse else a, a if reverse else b, color)
        return self

    def ellipsoid(self, center, radii, color, segments=12, rings=6):
        x, y, z = center
        rx, ry, rz = radii
        tmp = Mesh().loft([(z-rz*math.cos(math.pi*i/rings), rx*math.sin(math.pi*i/rings),
                           ry*math.sin(math.pi*i/rings), y) for i in range(rings+1)], segments, color)
        self.positions.extend((px+x, py, pz) for px,py,pz in tmp.positions)
        self.normals.extend(tmp.normals)
        self.colors.extend(tmp.colors)
        return self

    def cylinder(self, a, b, radius, color, sides=8):
        axis = unit(sub(b, a))
        u = unit(cross(axis, (0,1,0) if abs(axis[1]) < .9 else (1,0,0)))
        v = cross(axis, u)
        def ring(center):
            return [tuple(center[k]+radius*(u[k]*math.cos(2*math.pi*i/sides)+v[k]*math.sin(2*math.pi*i/sides))
                          for k in range(3)) for i in range(sides)]
        p, q = ring(a), ring(b)
        for i in range(sides):
            j = (i+1) % sides
            self.quad(p[i],p[j],q[j],q[i],color)
            self.triangle(a,p[j],p[i],color)
            self.triangle(b,q[i],q[j],color)
        return self

    def prism_x(self, profile, x0, x1, color):
        """Extrude a convex YZ polygon along X; either winding accepted."""
        area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(profile, profile[1:]+profile[:1]))
        profile = profile if area > 0 else list(reversed(profile))
        p = [(x0,y,z) for y,z in profile]
        q = [(x1,y,z) for y,z in profile]
        for i in range(1, len(p)-1):
            self.triangle(p[0],p[i+1],p[i],color)
            self.triangle(q[0],q[i],q[i+1],color)
        for i in range(len(p)):
            j = (i+1) % len(p)
            self.quad(p[i],p[j],q[j],q[i],color)
        return self


def quaternion(pitch=0, yaw=0, roll=0):
    """R_y(yaw) * R_x(pitch) * R_z(roll); radians, glTF xyzw."""
    def mul(a,b):
        x,y,z,w = a; X,Y,Z,W = b
        return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)
    return mul(mul((0,math.sin(yaw/2),0,math.cos(yaw/2)),
                   (math.sin(pitch/2),0,0,math.cos(pitch/2))),
               (0,0,math.sin(roll/2),math.cos(roll/2)))


class Model:
    def __init__(self, name, body_color='#71889c'):
        self.name, self.body_color = name, body_color
        self.nodes = [{'name': 'motionRoot', 'children': [], 'translation': [0,0,0], 'rotation': [0,0,0,1],
                       'extras': {'forward': '+Z', 'up': '+Y', 'bodyOrigin': [0,0,0]}}]
        self.root = 0
        self.meshes = []

    def add(self, name, mesh, translation=(0,0,0), parent=None):
        index = len(self.nodes)
        node = {'name': name, 'translation': list(translation)}
        if mesh is not None:
            node['mesh'] = len(self.meshes)
            self.meshes.append(mesh)
        self.nodes.append(node)
        self.nodes[self.root if parent is None else parent].setdefault('children', []).append(index)
        return index

    def export(self, path):
        data = bytearray()
        doc = {'asset': {'version': '2.0', 'generator': 'Bakasun original naval-air-models-v1',
                         'copyright': 'Original work dedicated under CC0-1.0'},
               'scene': 0, 'scenes': [{'name': self.name, 'nodes': [self.root]}], 'nodes': self.nodes,
               'materials': [{'name': self.name+'-vertex-palette',
                              'pbrMetallicRoughness': {'baseColorFactor': [1,1,1,1], 'metallicFactor': .05, 'roughnessFactor': .62}}],
               'meshes': [], 'accessors': [], 'bufferViews': [], 'animations': []}
        def accessor(values, width, target=None):
            while len(data) % 4: data.append(0)
            offset = len(data)
            flat = [float(x) for v in values for x in (v if isinstance(v,(list,tuple)) else (v,))]
            data.extend(struct.pack('<'+'f'*len(flat), *flat))
            view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(flat)*4}
            if target: view['target'] = target
            doc['bufferViews'].append(view)
            columns = [flat[i::width] for i in range(width)]
            doc['accessors'].append({'bufferView': len(doc['bufferViews'])-1, 'componentType': 5126,
                                     'count': len(flat)//width, 'type': {1:'SCALAR',3:'VEC3',4:'VEC4'}[width],
                                     'min': [min(c) for c in columns], 'max': [max(c) for c in columns]})
            return len(doc['accessors'])-1
        for mesh in self.meshes:
            doc['meshes'].append({'primitives': [{'attributes': {
                'POSITION': accessor(mesh.positions,3,34962), 'NORMAL': accessor(mesh.normals,3,34962),
                'COLOR_0': accessor(mesh.colors,3,34962)}, 'material': 0, 'mode': 4}]})
        for name, duration in [('fly', 2.4), ('bank', 2.4), ('down', 1.6)]:
            count = 49 if name != 'down' else 33
            times = [duration*i/(count-1) for i in range(count)]
            translations, rotations = [], []
            for i,t in enumerate(times):
                u = i/(count-1)
                wave = math.sin(2*math.pi*u)
                if name == 'fly':
                    pos = (0,.075*wave,0)
                    q = quaternion(.018*wave,0,.022*math.sin(2*math.pi*u))
                elif name == 'bank':
                    pos = (0,.035*wave,0)
                    q = quaternion(.025*wave,.09*wave,.38*wave)
                else:
                    # Sub-180 degree sample intervals preserve the full 360-degree spin.
                    pos = (.16*math.sin(math.pi*u),-.85*u*u,0)
                    q = quaternion(1.22*(u*u*(3-2*u)),.18*math.sin(math.pi*u),2*math.pi*u)
                translations.append(pos)
                rotations.append(q)
            time_accessor = accessor(times,1)
            doc['animations'].append({'name': name, 'samplers': [
                {'input':time_accessor,'output':accessor(translations,3),'interpolation':'LINEAR'},
                {'input':time_accessor,'output':accessor(rotations,4),'interpolation':'LINEAR'}],
                'channels':[{'sampler':0,'target':{'node':self.root,'path':'translation'}},
                            {'sampler':1,'target':{'node':self.root,'path':'rotation'}}]})
        doc['buffers'] = [{'byteLength': len(data)}]
        encoded = json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
        encoded += b' '*((-len(encoded))%4)
        data += b'\x00'*((-len(data))%4)
        glb = struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(data))
        glb += struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(data),b'BIN\x00')+data
        Path(path).write_bytes(glb)
        return {'file':Path(path).name,'bytes':len(glb),'triangles':sum(len(m.positions)//3 for m in self.meshes),
                'materials':1,'textures':0,'clips':{'fly':2.4,'bank':2.4,'down':1.6}}
