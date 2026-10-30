"""Reimport and compare original stadium against final Draco UV2 copy."""
import sys,json
sys.dont_write_bytecode=True
from pathlib import Path
import bpy
from mathutils import Vector, kdtree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bake import audit
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    result={};anchors={}
    for o in bpy.context.scene.objects:
        if o.type=='EMPTY':anchors[o.name]=[round(x,7) for row in o.matrix_world for x in row]
        if o.type!='MESH':continue
        me=o.data;me.calc_loop_triangles();c=me.color_attributes[0]
        records=[]
        for loop in me.loops:
            pos=o.matrix_world@me.vertices[loop.vertex_index].co
            color=c.data[loop.index if c.domain=='CORNER' else loop.vertex_index].color
            records.append((tuple(pos),tuple(me.uv_layers[0].data[loop.index].uv),tuple(color)))
        result[o.name]={'records':records,'triangles':len(me.loop_triangles),'vertices':len(me.vertices),
                        'uv_sets':len(me.uv_layers)}
    return result,anchors

old,anchors=read(ROOT.parent/'models/soccer-stadium.glb')
new,newanchors=read(ROOT/'soccer-stadium-uv2.glb')
assert old.keys()==new.keys();assert anchors==newanchors
rows=[]
for name,src in old.items():
    dst=new[name];assert src['triangles']==dst['triangles'];assert dst['uv_sets']==2
    tree=kdtree.KDTree(len(src['records']))
    for i,r in enumerate(src['records']):tree.insert(Vector(r[0]),i)
    tree.balance();maxpos=maxuv=maxcolor=0
    for pos,uv,color in dst['records']:
        candidates=tree.find_range(Vector(pos),.004)
        assert candidates,(name,pos)
        matches=[]
        for co,i,d in candidates:
            _,suv,sc=src['records'][i]
            du=max(abs(a-b) for a,b in zip(uv,suv));dc=max(abs(a-b) for a,b in zip(color,sc))
            matches.append((du+dc,d,du,dc))
        _,d,du,dc=min(matches)
        maxpos=max(maxpos,d);maxuv=max(maxuv,du);maxcolor=max(maxcolor,dc)
    assert maxuv<.00002,(name,maxuv);assert maxcolor<.00001,(name,maxcolor)
    rows.append({'mesh':name,'triangles':dst['triangles'],'source_vertices':src['vertices'],'copy_vertices':dst['vertices'],
                 'max_position_error_m':round(maxpos,9),'max_uv0_error':round(maxuv,9),'max_color_error':round(maxcolor,9)})
obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in obs:o.data.uv_layers.active_index=1
uv=audit(obs)
assert uv['overlap_pixels']==0 and uv['out_of_range_triangles']==0 and uv['degenerate_uv_triangles']==0
report={'status':'PASS','source':'../models/soccer-stadium.glb','copy':'soccer-stadium-uv2.glb',
        'anchors_and_transforms_preserved':True,'uv0_and_colors_preserved_within_recorded_tolerance':True,
        'uv1_decoded_audit':uv,'meshes':rows,'extra_uv_bytes_float32':sum(r['copy_vertices'] for r in rows)*8}
(ROOT/'geometry-validation.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
print(json.dumps(report))
