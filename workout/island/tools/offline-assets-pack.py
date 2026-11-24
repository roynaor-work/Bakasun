#!/usr/bin/env python3
"""Lossless shrink of the offline asset pack (everything offline-manifest.json names).

Nothing here changes what the game decodes:
  GLB   - byte ranges that hold identical data are stored once (animation time tracks,
          repeated attributes), ranges nothing references are dropped, the JSON chunk is
          written compact, and embedded 8-bit PNG textures become lossless WebP
          (EXT_texture_webp, the same extension the v7 packs already require; `exact`
          keeps the colour under transparent pixels). No Draco, meshopt or KTX2 is added.
          Every accessor is compared element by element and every image pixel by pixel
          against the input before a file is written; a mismatch aborts.
  PNG   - oxipng (zlib only, safe chunk strip), pixels compared after decode.
  JSON  - generated motion/clip data under assets/ and design/ is written without
          whitespace; the parsed value is compared. data/ and episodes/ stay readable.
Audio, JPEG and existing WebP are not touched: re-encoding a lossy file loses quality.

A file whose exact bytes the repository vouches for is left alone (recorded_files): its
SHA is written in a package manifest, an audit report or a test, or the delivered original
sits elsewhere in the tree. That is most of the pack; `--all` ignores the rule and shows
what repacking those would save (it then needs every recorded digest rewritten).
`--why` lists each kept file with the place that records it.

Usage:  python3 workout/island/tools/offline-assets-pack.py [--dry] [--why] [--all] [--only glb,png,json]
Then:   node workout/island/tools/offline-shell.mjs
Needs:  pip install pillow pyoxipng
"""
import hashlib, io, json, os, struct, sys, zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
KNOWN_EXT = {'KHR_draco_mesh_compression', 'KHR_mesh_quantization', 'KHR_materials_unlit', 'EXT_texture_webp',
             'KHR_lights_punctual', 'EXT_meshopt_compression', 'KHR_materials_clearcoat',
             'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_specular'}
pad4 = lambda n: (n + 3) & ~3


def read_glb(data):
    magic, version, total = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError('not a GLB v2')
    offset, doc, bin_chunk = 12, None, b''
    while offset < min(total, len(data)):
        length, kind = struct.unpack_from('<II', data, offset)
        body = data[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(body.decode('utf8'))
        elif kind == 0x004E4942:
            bin_chunk = body
        else:
            raise ValueError('unknown GLB chunk')
        offset += 8 + pad4(length)
    return doc, bin_chunk


def write_glb(doc, bin_chunk):
    text = json.dumps(doc, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')
    text += b' ' * (pad4(len(text)) - len(text))
    bin_chunk += b'\0' * (pad4(len(bin_chunk)) - len(bin_chunk))
    parts = [struct.pack('<II', len(text), 0x4E4F534A), text]
    if bin_chunk:
        parts += [struct.pack('<II', len(bin_chunk), 0x004E4942), bin_chunk]
    size = 12 + sum(len(p) for p in parts)
    return struct.pack('<III', 0x46546C67, 2, size) + b''.join(parts)


def view_bytes(doc, bin_chunk, index):
    """Bytes a buffer view resolves to inside the GLB BIN chunk, or None when it lives elsewhere."""
    view = doc['bufferViews'][index]
    meshopt = view.get('extensions', {}).get('EXT_meshopt_compression')
    source = meshopt if meshopt else view
    if source.get('buffer', 0) != 0 or 'uri' in doc['buffers'][0]:
        return None
    start = source.get('byteOffset', 0)
    return bin_chunk[start:start + source['byteLength']]


def element_size(accessor):
    return COMP[accessor['componentType']] * NUM[accessor['type']]


def accessor_bytes(doc, bin_chunk, accessor):
    """Tightly packed elements of one accessor (stride removed), plus its sparse blocks."""
    out = []
    if 'bufferView' in accessor:
        view = doc['bufferViews'][accessor['bufferView']]
        if 'EXT_meshopt_compression' in view.get('extensions', {}):
            out.append(b'meshopt:' + view_bytes(doc, bin_chunk, accessor['bufferView']) +
                       json.dumps(view['extensions']['EXT_meshopt_compression'].get('byteStride')).encode() +
                       struct.pack('<I', accessor.get('byteOffset', 0)))
        else:
            data = view_bytes(doc, bin_chunk, accessor['bufferView'])
            if data is None:
                out.append(b'external')
            else:
                size, start = element_size(accessor), accessor.get('byteOffset', 0)
                stride = view.get('byteStride') or size
                if stride == size:
                    out.append(data[start:start + size * accessor['count']])
                else:
                    out.append(b''.join(data[start + i * stride:start + i * stride + size] for i in range(accessor['count'])))
                if len(out[-1]) != size * accessor['count']:
                    raise ValueError('accessor runs past its buffer view')
    sparse = accessor.get('sparse')
    if sparse:
        for key, width in (('indices', COMP[sparse['indices']['componentType']]), ('values', element_size(accessor))):
            data = view_bytes(doc, bin_chunk, sparse[key]['bufferView'])
            start = sparse[key].get('byteOffset', 0)
            out.append(data[start:start + width * sparse['count']])
    return b'\x00|'.join(out)


def pixels(data):
    from PIL import Image
    image = Image.open(io.BytesIO(data))
    image.load()
    return image.size, image.convert('RGBA').tobytes()


def fingerprint(data):
    """What a loader gets out of a GLB, independent of how the bytes are laid out."""
    doc, bin_chunk = read_glb(data)
    accessors = [hashlib.sha256(accessor_bytes(doc, bin_chunk, a)).hexdigest() for a in doc.get('accessors', [])]
    images = []
    for image in doc.get('images', []):
        if 'bufferView' not in image:
            images.append('uri:' + image.get('uri', ''))
            continue
        raw = view_bytes(doc, bin_chunk, image['bufferView'])
        if image.get('mimeType') == 'image/jpeg':
            images.append('jpeg:' + hashlib.sha256(raw).hexdigest())
        else:
            size, rgba = pixels(raw)
            images.append('%dx%d:%s' % (size[0], size[1], hashlib.sha256(rgba).hexdigest()))
    draco = []
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            ext = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if ext:
                draco.append(hashlib.sha256(view_bytes(doc, bin_chunk, ext['bufferView'])).hexdigest())
    shape = json.loads(json.dumps(doc))
    shape.pop('bufferViews', None)
    shape.pop('buffers', None)
    for accessor in shape.get('accessors', []):
        accessor.pop('bufferView', None)
        accessor.pop('byteOffset', None)
        for key in ('indices', 'values'):
            if 'sparse' in accessor:
                accessor['sparse'][key].pop('bufferView', None)
                accessor['sparse'][key].pop('byteOffset', None)
    for image in shape.get('images', []):
        image.pop('bufferView', None)
        if image.get('mimeType') in ('image/png', 'image/webp'):
            image.pop('mimeType')
    for texture in shape.get('textures', []):
        ext = texture.get('extensions', {})
        webp = ext.pop('EXT_texture_webp', None)
        if webp:
            if 'source' in texture and texture['source'] != webp['source']:
                texture['fallback'] = texture['source']  # a PNG fallback next to the WebP stays visible
            texture['source'] = webp['source']
        if not ext:
            texture.pop('extensions', None)
    for mesh in shape.get('meshes', []):
        for primitive in mesh['primitives']:
            ext = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if ext:
                ext.pop('bufferView')
    for key in ('extensionsUsed', 'extensionsRequired'):
        if key in shape:
            shape[key] = sorted(set(shape[key]) - {'EXT_texture_webp'})
            if not shape[key]:
                shape.pop(key)
    return {'accessors': accessors, 'images': images, 'draco': draco, 'json': shape}


def webp_for_png(raw):
    """Lossless WebP of an 8-bit PNG, or None when it is not smaller or not provably identical."""
    from PIL import Image
    if raw[:8] != b'\x89PNG\r\n\x1a\n' or raw[24] != 8:
        return None
    offset = 8
    while offset + 12 <= len(raw):
        length, kind = struct.unpack_from('>I4s', raw, offset)
        if kind in (b'gAMA', b'iCCP', b'cHRM', b'acTL'):
            return None  # colour-managed or animated: leave as is
        offset += 12 + length
    image = Image.open(io.BytesIO(raw))
    image.load()
    alpha = image.mode in ('RGBA', 'LA', 'PA') or 'transparency' in image.info
    image = image.convert('RGBA' if alpha else 'RGB')
    out = io.BytesIO()
    image.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    packed = out.getvalue()
    if len(packed) >= len(raw) or pixels(packed) != pixels(raw):
        return None
    return packed


def pack_glb(data, webp=True):
    doc, bin_chunk = read_glb(data)
    views = doc.get('bufferViews', [])
    if not views or 'uri' in doc['buffers'][0]:
        return write_glb(doc, bin_chunk)
    careful = bool(set(doc.get('extensionsUsed', [])) - KNOWN_EXT)
    # Who points at each view.
    users = [[] for _ in views]
    for i, accessor in enumerate(doc.get('accessors', [])):
        if 'bufferView' in accessor:
            users[accessor['bufferView']].append(('accessor', i))
        if 'sparse' in accessor:
            users[accessor['sparse']['indices']['bufferView']].append(('sparse', i))
            users[accessor['sparse']['values']['bufferView']].append(('sparse', i))
    for i, image in enumerate(doc.get('images', [])):
        if 'bufferView' in image:
            users[image['bufferView']].append(('image', i))
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            ext = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if ext:
                users[ext['bufferView']].append(('draco', primitive))
    known = sum(len(u) for u in users)
    count = [0]

    def walk(node, path):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == 'bufferView' and isinstance(value, int):
                    count[0] += 1
                walk(value, path + [key])
        elif isinstance(node, list):
            for value in node:
                walk(value, path)
    walk({k: v for k, v in doc.items() if k != 'bufferViews'}, [])
    if count[0] != known:
        careful = True  # a reference this tool does not understand: keep every view

    out, placed, new_views, remap = bytearray(), {}, [], {}

    def place(chunk):
        key = hashlib.sha256(chunk).digest()
        if key not in placed:
            out.extend(b'\0' * (pad4(len(out)) - len(out)))
            placed[key] = len(out)
            out.extend(chunk)
        return placed[key]

    split_views, split_key = set(), {}
    accessors = doc.get('accessors', [])
    for index, view in enumerate(views):
        refs = users[index]
        if careful or not refs or view.get('extensions') or view.get('buffer', 0) != 0:
            continue
        if any(kind != 'accessor' for kind, _ in refs):
            continue
        ok = True
        for _, a in refs:
            accessor = accessors[a]
            size = element_size(accessor)
            if view.get('byteStride') not in (None, size) or (accessor['type'].startswith('MAT') and COMP[accessor['componentType']] < 4):
                ok = False
            if accessor.get('byteOffset', 0) + size * accessor['count'] > view['byteLength']:
                ok = False
        if ok:
            split_views.add(index)

    for index, view in enumerate(views):
        if index in split_views:
            continue
        if not users[index] and not careful:
            continue  # nothing reads it
        data = view_bytes(doc, bin_chunk, index)
        entry = json.loads(json.dumps(view))
        if data is not None:
            image_users = [i for kind, i in users[index] if kind == 'image']
            if webp and image_users and len(image_users) == len(users[index]) and all(doc['images'][i].get('mimeType') == 'image/png' for i in image_users):
                packed = webp_for_png(data)
                if packed:
                    data = packed
                    for i in image_users:
                        doc['images'][i]['mimeType'] = 'image/webp'
                        for texture in doc.get('textures', []):
                            if texture.get('source') == i and 'EXT_texture_webp' not in texture.get('extensions', {}):
                                texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
                    for key in ('extensionsUsed', 'extensionsRequired'):
                        if 'EXT_texture_webp' not in doc.setdefault(key, []):
                            doc[key].append('EXT_texture_webp')
            target = entry['extensions']['EXT_meshopt_compression'] if 'EXT_meshopt_compression' in entry.get('extensions', {}) else entry
            target['byteOffset'] = place(data)
            target['byteLength'] = len(data)
        remap[index] = len(new_views)
        new_views.append(entry)

    for index in sorted(split_views):
        view = views[index]
        for _, a in users[index]:
            accessor = accessors[a]
            size, start = element_size(accessor), accessor.get('byteOffset', 0)
            chunk = view_bytes(doc, bin_chunk, index)[start:start + size * accessor['count']]
            key = (hashlib.sha256(chunk).digest(), view.get('target'), view.get('byteStride'))
            if key not in split_key:
                entry = {'buffer': 0, 'byteOffset': place(chunk), 'byteLength': len(chunk)}
                for field in ('byteStride', 'target'):
                    if field in view:
                        entry[field] = view[field]
                split_key[key] = len(new_views)
                new_views.append(entry)
            accessor['bufferView'] = split_key[key]
            accessor.pop('byteOffset', None)

    for i, accessor in enumerate(accessors):
        if 'bufferView' in accessor and not any(('accessor', i) in users[v] for v in split_views):
            accessor['bufferView'] = remap[accessor['bufferView']]
        if 'sparse' in accessor:
            for key in ('indices', 'values'):
                accessor['sparse'][key]['bufferView'] = remap[accessor['sparse'][key]['bufferView']]
    for image in doc.get('images', []):
        if 'bufferView' in image:
            image['bufferView'] = remap[image['bufferView']]
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            ext = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if ext:
                ext['bufferView'] = remap[ext['bufferView']]
    doc['bufferViews'] = new_views
    doc['buffers'][0]['byteLength'] = pad4(len(out))
    return write_glb(doc, bytes(out))


def pack_png(data):
    import oxipng
    packed = oxipng.optimize_from_memory(data, level=6, strip=oxipng.StripChunks.safe())
    if len(packed) >= len(data) or pixels(packed) != pixels(data):
        return data
    return packed


def pack_json(data):
    value = json.loads(data)
    packed = json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')
    if data.endswith(b'\n'):
        packed += b'\n'
    if len(packed) >= len(data) or json.loads(packed) != value:
        return data
    return packed


TEXT = ('.mjs', '.js', '.json', '.md', '.txt', '.html', '.py', '.csv', '.yml', '.sha256')
# A change smaller than this is not worth a new file hash on every phone.
MIN_SAVING = {'glb': 2048, 'png': 512, 'json': 20000}
# catch-props7.mjs reads these with its own small GLB reader, which accepts no extensions.
NO_WEBP = ('assets/catch-v7/',)
# Byte sizes of these are written in the pack's own manifest or pinned by a short hash prefix in a test (island-naval-v7, island-racing-v24-4).
KEEP = ('assets/naval-v7/', 'assets/racing-pit-seq-v2/', 'assets/learning-v2/')  # the question bank stays reviewable line by line


def recorded_files(candidates):
    """Files whose exact bytes the repository vouches for: a digest of the file is written in a
    manifest, an audit report or a test, or an identical copy (the delivered original) sits
    elsewhere in the tree. Those stay byte for byte, so every provenance check keeps its meaning."""
    import base64, re
    repo = os.path.abspath(os.path.join(ROOT, '..', '..'))
    digest_of, by_size = {}, {}
    for path in candidates:
        data = open(os.path.join(ROOT, path), 'rb').read()
        sha256, sha384 = hashlib.sha256(data), hashlib.sha384(data)
        for token in (sha256.hexdigest(), sha256.hexdigest()[:16], hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest(), hashlib.sha1(data).hexdigest(),
                      hashlib.md5(data).hexdigest(), sha384.hexdigest(), hashlib.sha512(data).hexdigest(),
                      base64.b64encode(sha256.digest()).decode(), base64.b64encode(sha384.digest()).decode()):
            digest_of[token] = path
        by_size.setdefault(len(data), []).append((path, sha256.digest()))
    token = re.compile(r'(?<![0-9a-fA-F])[0-9a-f]{16,128}(?![0-9a-fA-F])|[A-Za-z0-9+/]{43,86}={1,2}')
    recorded = {}
    own = {os.path.join(ROOT, path) for path in candidates}
    for folder, folders, files in os.walk(repo):
        folders[:] = [name for name in folders if name not in ('.git', 'node_modules', '__pycache__')]
        for name in files:
            file = os.path.join(folder, name)
            if file == os.path.join(ROOT, 'offline-manifest.json'):
                continue
            size = os.path.getsize(file)
            if size in by_size and file not in own:
                digest = hashlib.sha256(open(file, 'rb').read()).digest()
                for path, mine in by_size[size]:
                    if mine == digest:
                        recorded.setdefault(path, 'same bytes as ' + os.path.relpath(file, repo))
            if name.endswith(TEXT) and size < 40_000_000:
                try:
                    text = open(file, encoding='utf8').read()
                except (UnicodeDecodeError, OSError):
                    continue
                for found in token.findall(text):
                    if found in digest_of and os.path.join(ROOT, digest_of[found]) != file:
                        recorded.setdefault(digest_of[found], 'digest in ' + os.path.relpath(file, repo))
    return recorded


def gz(data, path):
    """Bytes on the wire: GitHub Pages gzips GLB, JSON and code, not images or audio."""
    return len(zlib.compress(data, 6)) if path.endswith(('.glb', '.json')) else len(data)


def main():
    dry = '--dry' in sys.argv
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else {'glb', 'png', 'json'}
    manifest = json.load(open(os.path.join(ROOT, 'offline-manifest.json'), encoding='utf8'))
    paths = set(manifest.get('core', [])) | set(manifest.get('shell', []))
    for group in manifest.get('games', {}).values():
        paths |= set(group)
    totals, candidates = {}, []
    for path in sorted(paths):
        kind = path.rsplit('.', 1)[-1] if '.' in path else ''
        if kind not in only or kind not in ('glb', 'png', 'json') or path == 'offline-manifest.json':
            continue
        if '-rec/' in path or path.startswith(KEEP):
            continue  # Roy's own recordings and everything filed with them stay byte for byte
        if kind == 'json' and (not path.startswith(('assets/', 'design/')) or path.endswith('/manifest.json')):
            continue  # hand-edited data and package manifests stay readable
        candidates.append(path)
    recorded = {} if '--all' in sys.argv else recorded_files(candidates)
    if '--why' in sys.argv:
        for path, reason in sorted(recorded.items()):
            print('kept', path, '<-', reason)
    for path in candidates:
        kind = path.rsplit('.', 1)[-1]
        file = os.path.join(ROOT, path)
        data = open(file, 'rb').read()
        if path in recorded:
            packed = data
        elif kind == 'glb':
            packed = pack_glb(data, webp=not path.startswith(NO_WEBP))
            if fingerprint(packed) != fingerprint(data):
                raise SystemExit('NOT IDENTICAL after repack: ' + path)
            if gz(packed, path) >= gz(data, path):
                packed = data
        elif kind == 'png':
            packed = pack_png(data)
        else:
            packed = pack_json(data)
        if len(data) - len(packed) < MIN_SAVING[kind]:
            packed = data
        row = totals.setdefault(kind, [0, 0, 0, 0, 0, 0])
        row[0] += 1
        row[1] += packed != data
        row[2] += len(data)
        row[3] += len(packed)
        row[4] += gz(data, path)
        row[5] += gz(packed, path)
        if packed != data and not dry:
            open(file, 'wb').write(packed)
    for kind, (files, changed, raw0, raw1, wire0, wire1) in sorted(totals.items()):
        print('%-4s files %4d changed %4d  bytes %10d -> %10d  gzip-on-wire %10d -> %10d' % (kind, files, changed, raw0, raw1, wire0, wire1))


if __name__ == '__main__':
    main()
