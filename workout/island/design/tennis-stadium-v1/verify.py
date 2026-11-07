#!/usr/bin/env python3
"""CC0 package validation. Run: python verify.py (requires Pillow)."""
import ast
import hashlib
import json
import math
import struct
import subprocess
import unittest
from pathlib import Path
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parent


def pixels(image):
    # Pillow 13 renamed this API; retain compatibility with earlier releases.
    return image.get_flattened_data() if hasattr(image,'get_flattened_data') else image.getdata()


def glb(path):
    data=path.read_bytes()
    magic,version,total=struct.unpack_from('<III',data)
    assert (magic,version,total)==(0x46546c67,2,len(data)), path
    length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a and length%4==0
    doc=json.loads(data[20:20+length])
    size,kind=struct.unpack_from('<II',data,20+length)
    assert kind==0x004e4942 and size%4==0 and 28+length+size==len(data)
    binary=data[28+length:]
    assert doc['buffers'][0]['byteLength']<=len(binary)
    assert doc['asset']['version']=='2.0'
    assert not doc.get('extensionsRequired') and not doc.get('extensionsUsed')
    assert 'uri' not in doc['buffers'][0]
    def accessor(index):
        a=doc['accessors'][index]
        v=doc['bufferViews'][a['bufferView']]
        assert v['buffer']==0 and v['byteOffset']%4==0
        assert v['byteOffset']+v['byteLength']<=len(binary)
        width={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
        fmt={5123:'H',5126:'f'}[a['componentType']]
        count=a['count']*width
        assert struct.calcsize(fmt)*count==v['byteLength']
        values=struct.unpack_from('<'+fmt*count,binary,v['byteOffset'])
        assert all(math.isfinite(x) for x in values)
        if width==3:
            for k in range(3):
                assert abs(min(values[k::3])-a['min'][k])<1e-5
                assert abs(max(values[k::3])-a['max'][k])<1e-5
        return values
    triangles=0
    positions=[]
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            assert p['mode']==4
            xyz=accessor(p['attributes']['POSITION'])
            normals=accessor(p['attributes']['NORMAL'])
            uv=accessor(p['attributes']['TEXCOORD_0'])
            ids=accessor(p['indices'])
            assert len(ids)%3==0 and max(ids)<len(xyz)//3
            assert len(normals)==len(xyz) and len(uv)//2==len(xyz)//3
            positions.extend(tuple(xyz[i:i+3]) for i in range(0,len(xyz),3))
            for i in range(0,len(ids),3):
                a,b,c=[xyz[j*3:j*3+3] for j in ids[i:i+3]]
                u=[b[k]-a[k] for k in range(3)]
                v=[c[k]-a[k] for k in range(3)]
                cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                length=math.sqrt(sum(x*x for x in cross))
                assert length>1e-10, (path,'degenerate triangle')
                n=normals[ids[i]*3:ids[i]*3+3]
                assert sum(n[k]*cross[k]/length for k in range(3))>.99
            triangles+=len(ids)//3
            assert p['material']<len(doc['materials'])
    for image in doc.get('images',[]):
        assert image['uri']=='score-display.png'
        with Image.open(path.parent/image['uri']) as im:
            im.load()
    return triangles,positions


class Package(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest=json.loads((ROOT/'assets.json').read_text())['assets']
        cls.inventory=json.loads((ROOT/'inventory.json').read_text())

    def test_every_file_loads_and_has_provenance(self):
        listed={f['path'] for f in self.inventory['files']}
        actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
        self.assertEqual(listed,actual)
        licenses=(ROOT/'LICENSES.md').read_text()
        for item in self.inventory['files']:
            with self.subTest(file=item['path']):
                path=ROOT/item['path']
                self.assertEqual(len(path.read_bytes()),item['bytes'])
                self.assertIn('`'+item['path']+'`',licenses)
                if path.suffix=='.glb':
                    glb(path)
                elif path.suffix in ('.png','.jpg'):
                    with Image.open(path) as im:
                        im.load()
                        self.assertGreater(im.width,0)
                else:
                    text=path.read_text('utf-8')
                    self.assertTrue(text.strip())
                    if path.suffix=='.json': json.loads(text)
                    if path.suffix=='.py': ast.parse(text)
                    if path.suffix=='.mjs':
                        subprocess.run(['node','--check',str(path)],check=True,capture_output=True)
        self.assertEqual(sum(f['bytes'] for f in self.inventory['files']),self.inventory['totalBytes'])
        self.assertLessEqual(self.inventory['totalBytes'],4_000_000)

    def test_glbs_and_runtime_textures(self):
        for item in self.manifest:
            with self.subTest(asset=item['path']):
                path=ROOT/item['path']
                data=path.read_bytes()
                self.assertEqual(len(data),item['bytes'])
                self.assertEqual(hashlib.sha256(data).hexdigest(),item['sha256'])
                self.assertEqual(item['license'],'CC0-1.0')
                if path.suffix=='.glb':
                    triangles,positions=glb(path)
                    self.assertEqual(triangles,item['triangles'])
                    self.assertLessEqual(triangles,item['limit'])
                    self.assertLessEqual(len(data),300_000)
                    for k in range(3):
                        self.assertAlmostEqual(min(v[k] for v in positions),item['bounds'][0][k],places=3)
                        self.assertAlmostEqual(max(v[k] for v in positions),item['bounds'][1][k],places=3)
                else:
                    with Image.open(path) as im:
                        im.load()
                        self.assertEqual(im.size,(item['width'],item['height']))
        self.assertEqual(len(self.manifest),13)

    def test_atlas_cells_and_pose_pairs(self):
        with Image.open(ROOT/'runtime/crowd-atlas.png') as atlas:
            self.assertEqual(atlas.size,(1024,512))
            self.assertEqual(atlas.mode,'RGBA')
            cells=[]
            for i in range(16):
                x,y=(i%8)*128,(i//8)*256
                cell=atlas.crop((x,y,x+128,y+256))
                a=cell.getchannel('A')
                bounds=a.getbbox()
                self.assertIsNotNone(bounds)
                self.assertGreater(sum(v>128 for v in pixels(a)),1700)
                self.assertGreater(bounds[0],1)
                self.assertLess(bounds[2],127)
                self.assertLess(max(pixels(a.crop((0,0,128,3)))),2)
                cells.append(cell)
            for i in range(0,16,2):
                self.assertIsNotNone(ImageChops.difference(cells[i],cells[i+1]).getbbox())
                self.assertGreater(cells[i].getchannel('A').getbbox()[1],cells[i+1].getchannel('A').getbbox()[1]+25)

    def test_tile_edges_and_background(self):
        for name in ['court-blue-green.png','hardcourt-tile.png']:
            with Image.open(ROOT/'runtime'/name) as im:
                self.assertEqual(list(pixels(im.crop((0,0,1,im.height)))),list(pixels(im.crop((im.width-1,0,im.width,im.height)))))
                self.assertEqual(list(pixels(im.crop((0,0,im.width,1)))),list(pixels(im.crop((0,im.height-1,im.width,im.height)))))
        with Image.open(ROOT/'runtime/evening-city.png') as im:
            self.assertEqual(im.size,(1024,512))
            self.assertEqual(list(pixels(im.crop((0,0,1,512)))),list(pixels(im.crop((1023,0,1024,512)))))

    def test_full_scene_and_stand_dimensions(self):
        scene=json.loads((ROOT/'scene.json').read_text())
        tris={Path(a['path']).stem:a['triangles'] for a in self.manifest if 'triangles' in a}
        self.assertEqual(set(tris),{p['model'] for p in scene['placements']})
        stands=sum(p['model']=='stand-10m' for p in scene['placements'])
        self.assertEqual(stands,10)
        # All placed models, every fan, court, plinth, tile, ground, sky cylinder.
        total=sum(tris[p['model']] for p in scene['placements'])+stands*60*2+2+12+2+2+48*2
        self.assertEqual(total,24860)
        self.assertLessEqual(total,25000)
        stand=next(a for a in self.manifest if a['path'].endswith('/stand-10m.glb'))
        self.assertAlmostEqual(stand['bounds'][1][0]-stand['bounds'][0][0],10)
        self.assertEqual(scene['crowd']['cellSize'],[128,256])


if __name__=='__main__':
    unittest.main(verbosity=2)
