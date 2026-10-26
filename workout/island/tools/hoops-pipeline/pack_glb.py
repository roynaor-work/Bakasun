"""Shrinks a Blender-exported GLB without changing how it renders.

- normals -> normalized int8, texcoords -> normalized uint16, skin weights -> normalized uint8
  (KHR_mesh_quantization, supported by three.js GLTFLoader)
- the uniform trim colour (last COLOR_n) becomes COLOR_0 as normalized uint8; other colour sets are dropped
- images: alpha images -> palette PNG, others -> JPEG; long side capped per image name
usage: python3 pack_glb.py in.glb out.glb
"""
import json, struct, sys, io
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jl])
bin0 = 20 + jl + 8
BIN = raw[bin0:]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5122: np.int16, 5121: np.uint8, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read(ai):
    a = J['accessors'][ai]
    bv = J['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']])
    n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', n * dt.itemsize)
    arr = np.frombuffer(BIN, dtype=np.uint8, count=a['count'] * stride, offset=off).reshape(a['count'], stride)
    arr = arr[:, :n * dt.itemsize].copy().view(dt).reshape(a['count'], n)
    return arr, a


out_bin = bytearray()
views, accs = [], []


def add_view(data, target=None, stride=None):
    while len(out_bin) % 4:
        out_bin.append(0)
    v = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}
    if target:
        v['target'] = target
    if stride:
        v['byteStride'] = stride
    out_bin.extend(data)
    views.append(v)
    return len(views) - 1


def add_acc(arr, ctype, typ, normalized=False, minmax=False, target=34962, pad_to=None):
    n = NC[typ]
    data = arr
    stride = None
    if pad_to:
        p = np.zeros((arr.shape[0], pad_to), dtype=arr.dtype)
        p[:, :n] = arr
        data = p
        stride = pad_to * arr.dtype.itemsize
    vi = add_view(data.tobytes(), target, stride)
    acc = {'bufferView': vi, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if normalized:
        acc['normalized'] = True
    if minmax:
        acc['min'] = [float(x) for x in arr.min(0)]
        acc['max'] = [float(x) for x in arr.max(0)]
    accs.append(acc)
    return len(accs) - 1


def copy_acc(ai, target=None):
    arr, a = read(ai)
    acc = dict(a)
    acc['bufferView'] = add_view(arr.tobytes(), target)
    acc.pop('byteOffset', None)
    accs.append(acc)
    return len(accs) - 1


for m in J.get('meshes', []):
    for p in m['primitives']:
        at = p['attributes']
        new = {}
        colors = sorted(k for k in at if k.startswith('COLOR_'))
        for k, ai in at.items():
            arr, a = read(ai)
            if k == 'POSITION':
                new[k] = add_acc(arr.astype(np.float32), 5126, 'VEC3', minmax=True)
            elif k == 'NORMAL':
                q = np.clip(np.round(arr * 127), -127, 127).astype(np.int8)
                new[k] = add_acc(q, 5120, 'VEC3', normalized=True, pad_to=4)
            elif k.startswith('TEXCOORD'):
                if arr.min() >= -1e-4 and arr.max() <= 1 + 1e-4:
                    q = np.clip(np.round(arr * 65535), 0, 65535).astype(np.uint16)
                    new[k] = add_acc(q, 5123, 'VEC2', normalized=True)
                else:
                    new[k] = add_acc(arr.astype(np.float32), 5126, 'VEC2')
            elif k.startswith('WEIGHTS'):
                w = arr.astype(np.float32)
                q = np.round(w * 255).astype(np.int32)
                # keep the sum exactly 255
                diff = 255 - q.sum(1)
                q[np.arange(len(q)), np.argmax(w, 1)] += diff
                new[k] = add_acc(np.clip(q, 0, 255).astype(np.uint8), 5121, 'VEC4', normalized=True)
            elif k.startswith('JOINTS'):
                new[k] = add_acc(arr.astype(np.uint8 if arr.max() < 256 else np.uint16), 5121 if arr.max() < 256 else 5123, 'VEC4')
            elif k.startswith('COLOR_'):
                if k != colors[-1]:
                    continue
                f = arr.astype(np.float32)
                if a['componentType'] == 5123:
                    f = f / 65535.0
                elif a['componentType'] == 5121:
                    f = f / 255.0
                if f.shape[1] == 3:
                    f = np.concatenate([f, np.ones((len(f), 1), np.float32)], 1)
                q = np.clip(np.round(f * 255), 0, 255).astype(np.uint8)
                new['COLOR_0'] = add_acc(q, 5121, 'VEC4', normalized=True)
            else:
                new[k] = copy_acc(ai, 34962)
        p['attributes'] = new
        if 'indices' in p:
            arr, a = read(p['indices'])
            mx = int(arr.max())
            if mx < 65536:
                p['indices'] = add_acc(arr.astype(np.uint16).reshape(-1, 1), 5123, 'SCALAR', target=34963)
            else:
                p['indices'] = add_acc(arr.astype(np.uint32).reshape(-1, 1), 5125, 'SCALAR', target=34963)

for s in J.get('skins', []):
    if 'inverseBindMatrices' in s:
        s['inverseBindMatrices'] = copy_acc(s['inverseBindMatrices'])

input_cache = {}
for an in J.get('animations', []):
    keep = []
    for ch in an['channels']:
        node = J['nodes'][ch['target']['node']].get('name', '')
        if ch['target']['path'] == 'scale':
            continue
        if ch['target']['path'] == 'translation' and not node.endswith('Hips'):
            continue
        keep.append(ch)
    used = sorted(set(ch['sampler'] for ch in keep))
    remap = {o: i for i, o in enumerate(used)}
    an['samplers'] = [an['samplers'][o] for o in used]
    for ch in keep:
        ch['sampler'] = remap[ch['sampler']]
    an['channels'] = keep
    rot_samplers = set(ch['sampler'] for ch in an['channels'] if ch['target']['path'] == 'rotation')
    for si, smp in enumerate(an['samplers']):
        if smp['input'] not in input_cache:
            input_cache[smp['input']] = copy_acc(smp['input'])
        smp['input'] = input_cache[smp['input']]
        arr, a = read(smp['output'])
        if si in rot_samplers and a['componentType'] == 5126:
            q = np.clip(np.round(arr * 32767), -32767, 32767).astype(np.int16)
            smp['output'] = add_acc(q, 5122, 'VEC4', normalized=True, target=None)
        else:
            smp['output'] = copy_acc(smp['output'])


def cap_for(name):
    n = (name or '').lower()
    if 'skin' in n or 'diffuse' in n and ('male' in n or 'female' in n):
        return 1024
    if 'short0' in n or 'afro' in n or 'hair' in n:
        return 512
    if 'eye' in n:
        return 256
    return 512


for img in J.get('images', []):
    bv = J['bufferViews'][img['bufferView']]
    data = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    im = Image.open(io.BytesIO(data))
    cap = cap_for(img.get('name'))
    if max(im.size) > cap:
        im = im.resize((cap, cap) if im.size[0] == im.size[1] else (cap, int(cap * im.size[1] / im.size[0])), Image.LANCZOS)
    buf = io.BytesIO()
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and 'A' in im.getbands() and np.array(im.getchannel('A')).min() < 250
    if has_alpha:
        im = im.convert('RGBA').quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        im.save(buf, 'PNG', optimize=True)
        img['mimeType'] = 'image/png'
    else:
        im.convert('RGB').save(buf, 'JPEG', quality=84, optimize=True, progressive=False)
        img['mimeType'] = 'image/jpeg'
    img['bufferView'] = add_view(buf.getvalue())

J['bufferViews'] = views
J['accessors'] = accs
J['buffers'] = [{'byteLength': len(out_bin)}]
ext = set(J.get('extensionsUsed', []))
ext.add('KHR_mesh_quantization')
J['extensionsUsed'] = sorted(ext)
req = set(J.get('extensionsRequired', []))
req.add('KHR_mesh_quantization')
J['extensionsRequired'] = sorted(req)
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
while len(out_bin) % 4:
    out_bin.append(0)
total = 12 + 8 + len(js) + 8 + len(out_bin)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A))
    f.write(js)
    f.write(struct.pack('<II', len(out_bin), 0x004E4942))
    f.write(out_bin)
print('packed', src, len(raw), '->', dst, total)
