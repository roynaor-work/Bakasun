#!/usr/bin/env python3
"""Independent importer check: blender -b --factory-startup --python-exit-code 1 --python verify_blender.py

Original CC0 verification source. Run with Blender 4.3+, not system Python.
"""
import json
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
models = json.loads((HERE / 'models-info.json').read_text())['models']
result = {'result': 'PASS', 'importer': 'Blender ' + bpy.app.version_string, 'models': []}
for record in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = HERE / record['file']
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    triangles = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    assert triangles == record['triangles'], (path, triangles, record['triangles'])
    assert len(objects) > 0
    result['models'].append({'file': record['file'], 'loaded': True,
                             'triangles': triangles, 'meshParts': len(objects)})
(HERE / 'evidence').mkdir(exist_ok=True)
(HERE / 'evidence' / 'blender.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
