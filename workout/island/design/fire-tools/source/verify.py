"""Independent checks of final GLB bytes, shared atlas, coordinates and SVG contracts."""
from pathlib import Path
import hashlib
import json
import math
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<III', data)
    assert (magic, version, size) == (0x46546c67, 2, len(data))
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(data[20:20+length])
    blen, bkind = struct.unpack_from('<II', data, 20+length)
    assert bkind == 0x004e4942 and len(data) == 28+length+blen
    return doc, data[28+length:], data


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    width = {'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
    code = {5126:'f',5123:'H'}[a['componentType']]
    start = view.get('byteOffset',0) + a.get('byteOffset',0)
    size = struct.calcsize('<'+code*width)
    stride = view.get('byteStride',size)
    return [struct.unpack_from('<'+code*width,binary,start+i*stride) for i in range(a['count'])]


def main():
    manifest = json.loads((ROOT/'manifest.json').read_text())
    atlas = (ROOT/'fire-tools-atlas.png').read_bytes()
    assert atlas[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack_from('>II',atlas,16) == (512,512)
    models=[]
    for expected in manifest['models']:
        doc,binary,data = read_glb(ROOT/expected['file'])
        assert len(data)<=150000
        assert not doc.get('extensionsUsed') and not doc.get('extensionsRequired')
        assert len(doc['materials']) == len(doc['meshes']) == len(doc['textures']) == len(doc['images']) == 1
        assert len(doc['meshes'][0]['primitives']) == 1
        assert all('uri' not in image for image in doc['images'])
        assert all('uri' not in buf for buf in doc['buffers'])
        view=doc['bufferViews'][doc['images'][0]['bufferView']]
        start=view.get('byteOffset',0)
        assert binary[start:start+view['byteLength']] == atlas
        primitive=doc['meshes'][0]['primitives'][0]
        assert primitive['mode'] == 4
        pos=accessor(doc,binary,primitive['attributes']['POSITION'])
        normals=accessor(doc,binary,primitive['attributes']['NORMAL'])
        uvs=accessor(doc,binary,primitive['attributes']['TEXCOORD_0'])
        indices=[v[0] for v in accessor(doc,binary,primitive['indices'])]
        assert len(indices)%3 == 0 and len(indices)//3<=3000
        assert all(math.isfinite(v) for p in pos for v in p)
        assert all(abs(sum(v*v for v in n)-1)<1e-5 for n in normals)
        assert all(0<=v<=1 for uv in uvs for v in uv)
        # Every triangle samples one uniform tile, with a half-tile border against bleeding.
        for offset in range(0,len(indices),3):
            ids=indices[offset:offset+3]
            assert len({uvs[i] for i in ids}) == 1
            a,b,c=[pos[i] for i in ids]
            ab=[b[i]-a[i] for i in range(3)]; ac=[c[i]-a[i] for i in range(3)]
            cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
            assert sum(v*v for v in cross)>1e-20, 'degenerate triangle'
            assert sum(cross[i]*normals[ids[0]][i] for i in range(3))>0, 'normal/winding mismatch'
        lo=[min(p[i] for p in pos) for i in range(3)]
        hi=[max(p[i] for p in pos) for i in range(3)]
        assert abs(lo[1])<1e-6 and abs(lo[0]+hi[0])<1e-6 and abs(lo[2]+hi[2])<1e-6
        assert doc['scenes'] == [{'nodes':[0]}]
        root=doc['nodes'][0]
        assert root['children'] == [1,2]
        assert not any(k in root for k in ['matrix','translation','rotation','scale'])
        nozzle=[n for n in doc['nodes'] if n.get('name')=='nozzle']
        assert len(nozzle)==1
        n=nozzle[0]
        assert not any(k in n for k in ['mesh','camera','children','matrix','rotation','scale'])
        assert n['translation'] == expected['nozzle_m']
        assert n['extras']['direction'] == [0,0,-1]
        sha=hashlib.sha256(data).hexdigest()
        assert sha == expected['sha256']
        assert len(data) == expected['bytes'] and len(indices)//3 == expected['triangles']
        icon=ET.parse(ROOT/'icons'/expected['file'].replace('.glb','.svg')).getroot()
        assert icon.attrib['width'] == icon.attrib['height'] == '24' and icon.attrib['viewBox']=='0 0 24 24'
        assert icon.attrib['fill']=='none' and icon.attrib['stroke']=='currentColor'
        assert len(icon)==1 and icon[0].tag=='{http://www.w3.org/2000/svg}path'
        models.append({'file':expected['file'],'bytes':len(data),'triangles':len(indices)//3,
                       'origin_floor_center':True,'empty_nozzle':True,'nozzle_direction':[0,0,-1],
                       'standalone':True,'atlas_identical':True,'extensions':[],
                       'svg_24_single_path':True,'sha256':sha})
    result={'passed':True,'atlas':{'size':[512,512],'sha256':hashlib.sha256(atlas).hexdigest()},'models':models}
    (ROOT/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    main()
