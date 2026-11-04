"""MakeHuman-derived mobile basketball characters; Blender 4.3, no game build.
python tools/atlas.py; blender -b --factory-startup --python tools/build_characters.py
Then node tools/pack.mjs. Writes raw intermediates to /tmp/hoops-v6-raw.
The six profiles share an identical 18-joint bind rig in metre units.
"""
from pathlib import Path
import bpy, bmesh, math, json, sys, hashlib
from mathutils import Matrix, Vector
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[4]
SRC=REPO/'workout/island/assets/models'
RAW=Path('/tmp/hoops-v6-raw'); RAW.mkdir(exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parent))
JOINTS=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']
KEEP={x:'mixamorig:'+x for x in JOINTS if x not in ['Root','Chest']};KEEP['Chest']='mixamorig:Spine2'
PARENT={'Root':None,'Hips':'Root','Spine':'Hips','Chest':'Spine','Neck':'Chest','Head':'Neck','LeftArm':'Chest','LeftForeArm':'LeftArm','LeftHand':'LeftForeArm','RightArm':'Chest','RightForeArm':'RightArm','RightHand':'RightForeArm','LeftUpLeg':'Hips','LeftLeg':'LeftUpLeg','LeftFoot':'LeftLeg','RightUpLeg':'Hips','RightLeg':'RightUpLeg','RightFoot':'RightLeg'}
PROFILES=[{'id':'pg','role':'PG','source':'guard','heightMeters':1.83,'widthScale':.94,'number':'01','hair':'close textured crop'}, {'id':'sg','role':'SG','source':'wing','heightMeters':1.93,'widthScale':.97,'number':'02','hair':'side-swept short cards'}, {'id':'sf','role':'SF','source':'forward','heightMeters':2.01,'widthScale':1.01,'number':'03','hair':'compact forward crop'}, {'id':'pf','role':'PF','source':'big','heightMeters':2.08,'widthScale':1.10,'number':'04','hair':'full coiled afro cards'}, {'id':'c','role':'C','source':'big','heightMeters':2.16,'widthScale':1.02,'number':'05','hair':'short flat coiled cards'}, {'id':'referee','role':'REF','source':'wing','heightMeters':1.86,'widthScale':.93,'number':None,'hair':'short tapered crop'}]
TILES=json.loads((ROOT/'textures/tiles.json').read_text())['tiles']

def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for coll in [bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.actions,bpy.data.images]:
  for a in list(coll):
   if coll==bpy.data.actions or a.users==0:coll.remove(a)

def load(source):
 reset();bpy.ops.import_scene.gltf(filepath=str(SRC/('hoops-'+source+'.glb')))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 rig.animation_data_clear()
 for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
 for o in list(bpy.context.scene.objects):
  if o not in meshes and o!=rig:bpy.data.objects.remove(o,do_unlink=True)
 lo=min(v.co.z for o in meshes for v in o.data.vertices);hi=max(v.co.z for o in meshes for v in o.data.vertices)
 M=Matrix.Scale(1.95/(hi-lo),4)@Matrix.Translation((0,0,-lo))
 for o in meshes:o.data.transform(M)
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for b in rig.data.edit_bones:b.transform(M,scale=True,roll=True)
 bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
 return rig,meshes

def mapping(name):
 short=name.replace('mixamorig:','')
 if short in JOINTS:return short
 if short in ['Spine1','Spine2','LeftShoulder','RightShoulder']:return 'Chest' if short!='Spine1' else 'Spine'
 if 'Hand' in short:return ('Left' if short.startswith('Left') else 'Right')+'Hand'
 if 'Toe' in short:return ('Left' if short.startswith('Left') else 'Right')+'Foot'
 return 'Hips'

def common_rig():
 rig,meshes=load('guard')
 specs={}
 for name in JOINTS:
  if name=='Root':specs[name]={'head':Vector((0,0,0)),'tail':Vector((0,.10,0)),'matrix':Matrix.Identity(4)}
  else:
   b=rig.data.bones[KEEP[name]];specs[name]={'head':b.head_local.copy(),'tail':b.tail_local.copy(),'matrix':b.matrix_local.copy()}
 return specs

def canon(source_rig,meshes,specs):
 old={k:source_rig.data.bones[v].matrix_local.copy() for k,v in KEEP.items()}
 data=bpy.data.armatures.new('Canonical18');rig=bpy.data.objects.new('AthleteRig',data);bpy.context.collection.objects.link(rig)
 bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name in JOINTS:
  b=data.edit_bones.new(name);b.head=specs[name]['head'];b.tail=specs[name]['tail']
  if name!='Root':b.matrix=specs[name]['matrix'];b.length=(specs[name]['tail']-specs[name]['head']).length
  b.use_deform=True
  if PARENT[name]:b.parent=data.edit_bones[PARENT[name]]
 bpy.ops.object.mode_set(mode='OBJECT')
 for o in meshes:
  groups={g.index:mapping(g.name) for g in o.vertex_groups}
  weights=[]
  for v in o.data.vertices:
   w={}
   for g in v.groups:w[groups[g.group]]=w.get(groups[g.group],0)+g.weight
   total=sum(w.values());w={k:v/total for k,v in w.items()} if total else {'Hips':1.}
   co=Vector((0,0,0))
   for k,val in w.items():co+=(specs[k]['matrix']@old[k].inverted()@v.co)*val
   v.co=co;weights.append(w)
  o.vertex_groups.clear()
  vg={n:o.vertex_groups.new(name=n) for n in JOINTS}
  for i,w in enumerate(weights):
   for n,val in w.items():vg[n].add([i],val,'REPLACE')
  o.parent=None;o.matrix_world=Matrix.Identity(4)
  for mod in list(o.modifiers):o.modifiers.remove(mod)
  arm=o.modifiers.new('Canonical skin','ARMATURE');arm.object=rig;o.parent=rig
 bpy.data.objects.remove(source_rig,do_unlink=True)
 return rig

def kind(o):
 if 'atlasKind' in o:return o['atlasKind']
 n=o.name.lower()
 if n=='jersey':return 'jersey'
 if n=='shorts':return 'shorts'
 if 'eyebrow' in n:return 'eyebrows'
 if 'eyelash' in n:return 'eyelashes'
 if 'low-poly' in n:return 'eyes'
 if 'shoes' in n:return 'shoes'
 if n=='human_x':return 'skin'
 return 'hair'

def adjust(o,k,p):
 me=o.data
 if k=='skin':
  # Remove only occluded central torso/upper-thigh faces beneath the kit.
  bm=bmesh.new();bm.from_mesh(me)
  dead=[]
  for f in bm.faces:
   c=f.calc_center_median()
   if (.66<c.z<1.57 and abs(c.x)<.145) or (.66<c.z<1.16 and abs(c.x)<.255):dead.append(f)
  bmesh.ops.delete(bm,geom=dead,context='FACES');bm.to_mesh(me);bm.free()
  # Facial diversity preserves base face topology and skin features.
  if p['id'] in ['c','referee']:
   for v in me.vertices:
    if v.co.z>1.72:
     t=max(0,min(1,(v.co.z-1.72)/.16))
     v.co.x*=1-(.075 if p['id']=='c' else .04)*math.sin(t*math.pi)
     if p['id']=='c' and v.co.y<-.05:v.co.y-=.009*math.sin(t*math.pi)
 elif k=='hair':
  zs=[v.co.z for v in me.vertices];bottom=min(zs);top=max(zs)
  if p['id'] in ['c','referee','sf']:
   factor={'c':.38,'referee':.62,'sf':.80}[p['id']]
   for v in me.vertices:v.co.z=bottom+(v.co.z-bottom)*factor
  if p['id']=='sg':
   for v in me.vertices:
    t=(v.co.z-bottom)/max(1e-5,top-bottom);v.co.x+=.025*t*t
 elif k=='jersey':
  # Drape a sleeveless vest over the original body-derived shell. Smooth front
  # chest contour and level lower vertices so the cut hem reads as sewn cloth.
  lo=min(v.co.z for v in me.vertices)
  for v in me.vertices:
   if v.co.z<lo+.048:v.co.z=lo+.020
   if 1.22<v.co.z<1.53 and v.co.y<-.08 and abs(v.co.x)<.20:
    v.co.y=min(v.co.y,-.152+.035*(abs(v.co.x)/.2)**2)
  bpy.context.view_layer.objects.active=o
  sm=o.modifiers.new('Relax cloth contours','SMOOTH');sm.factor=.65;sm.iterations=5;bpy.ops.object.modifier_apply(modifier=sm.name)
  # A subtle cloth gap avoids exposed torso after simplification.
  for v in me.vertices:
   if abs(v.co.x)<.20 and v.co.y<-.06:v.co.y-=.004
 elif k=='shorts':
  lo=min(v.co.z for v in me.vertices)
  for v in me.vertices:
   if v.co.z<lo+.045:v.co.z=lo+.018
 # One 1024 atlas layout shared by both geometry LODs.
 uv=me.uv_layers.active or me.uv_layers.new(name='AtlasUV')
 if k in ['jersey','shorts']:
  lo=min(v.co.z for v in me.vertices);hi=max(v.co.z for v in me.vertices)
  # Front/back chart intentionally shares same two-digit uniform number.
  maxx=max(abs(v.co.x) for v in me.vertices)
  for poly in me.polygons:
   back=sum(me.vertices[i].co.y for i in poly.vertices)/len(poly.vertices)>0
   for li in poly.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co
    u=.5+v.x/(maxx*2)*( -1 if back else 1)
    z=(v.z-lo)/max(1e-5,hi-lo)
    uv.data[li].uv=(max(.015,min(.985,u)),max(.015,min(.985,z)))
 x,y,w,h=TILES[k]
 for loop in uv.data:
  u,v=loop.uv;loop.uv=((x+max(.002,min(.998,u))*w)/1024,(1024-y-h+max(.002,min(.998,v))*h)/1024)
 for layer in list(me.uv_layers):
  if layer!=uv:me.uv_layers.remove(layer)
 for a in list(me.color_attributes):me.color_attributes.remove(a)
 for poly in me.polygons:poly.use_smooth=True


def atlas_material(p):
 m=bpy.data.materials.new('PBR_Atlas_'+p['id']);m.use_nodes=True;m.surface_render_method='DITHERED'
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.8;bs.inputs['Metallic'].default_value=0
 nodes=m.node_tree.nodes;links=m.node_tree.links
 maps={}
 for suffix in ['basecolor','normal','orm']:
  im=bpy.data.images.load(str(ROOT/'textures'/(p['id']+'-'+suffix+'.png')),check_existing=True)
  im.colorspace_settings.name='sRGB' if suffix=='basecolor' else 'Non-Color'
  n=nodes.new('ShaderNodeTexImage');n.image=im;n.interpolation='Linear';maps[suffix]=n
 links.new(maps['basecolor'].outputs['Color'],bs.inputs['Base Color']);links.new(maps['basecolor'].outputs['Alpha'],bs.inputs['Alpha'])
 normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.7;links.new(maps['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
 sep=nodes.new('ShaderNodeSeparateColor');links.new(maps['orm'].outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
 return m

def tris(o):return sum(len(p.vertices)-2 for p in o.data.polygons)

def decimate(o,budget):
 n=tris(o)
 if n<=budget:return
 bpy.context.view_layer.objects.active=o
 d=o.modifiers.new('Mobile topology budget','DECIMATE');d.ratio=max(.01,(budget-8)/n);d.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=d.name)
 if tris(o)>budget:
  d=o.modifiers.new('Exact triangle cap','DECIMATE');d.ratio=(budget-12)/tris(o);d.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=d.name)

def level_hem(o,k):
 if k not in ('jersey','shorts'):return
 if 'hemBaseZ' not in o:o['hemBaseZ']=min(v.co.z for v in o.data.vertices)
 lo=o['hemBaseZ']
 target=lo+.040
 for v in o.data.vertices:
  if v.co.z<lo+.080:v.co.z=target
 o.data.update()

def split_head(o):
 """Budget facial topology independently; never weight face into decimation."""
 head=o.copy();head.data=o.data.copy();bpy.context.collection.objects.link(head)
 head.name='FaceAnatomy';head['atlasKind']='head'
 for mesh,keep_head in [(o,False),(head,True)]:
  bm=bmesh.new();bm.from_mesh(mesh.data)
  dead=[f for f in bm.faces if (sum(v.co.z for v in f.verts)/len(f.verts)>1.70)!=keep_head]
  bmesh.ops.delete(bm,geom=dead,context='FACES');bm.to_mesh(mesh.data);bm.free()
 return head

def join_meshes(meshes,rig,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 # Reassign all faces to the identical atlas material, eliminating redundant slots.
 m=o.data.materials[0];o.data.materials.clear();o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=0
 for vg in list(o.vertex_groups):
  if vg.name not in JOINTS:o.vertex_groups.remove(vg)
 return o

def export(rig,mesh,path):
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_skins=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_force_sampling=True,export_anim_slide_to_zero=True,export_morph=False,export_apply=False,export_yup=True,export_texcoords=True,export_normals=True,export_vertex_color='NONE',export_image_format='AUTO',export_keep_originals=False)

def main():
 specs=common_rig();metadata={'schemaVersion':1,'players':[],'rig':{'jointNames':JOINTS,'normalizedHeightMeters':1.95,'up':'+Y','front':'+Z','units':'metres'},'atlas':{'kitMask':'uv.y > 0.5','jerseyRect':[0,.5,.5,.5],'shortsRect':[.5,.5,.5,.5],'sourceBlenderKitMask':'uv.y < 0.5','uvConvention':'Delivered glTF UV origin top-left; Blender source UV origin bottom-left','resolution':1024}}
 # Rig-only reference is available early for animation development.
 for p in PROFILES:
  source_rig,meshes=load(p['source']);rig=canon(source_rig,meshes,specs)
  mat=atlas_material(p)
  budgets0={'skin':2300,'head':2000,'hair':660,'eyes':172,'eyebrows':96,'eyelashes':100,'shoes':850,'jersey':740,'shorts':660}
  budgets1={'skin':850,'head':700,'hair':230,'eyes':76,'eyebrows':40,'eyelashes':32,'shoes':280,'jersey':330,'shorts':310}
  kinds=[]
  for o in meshes:
   k=kind(o);o['atlasKind']=k;adjust(o,k,p);o.data.materials.clear();o.data.materials.append(mat)
   if k=='skin':
    head=split_head(o);kinds.append((head,'head'))
   kinds.append((o,k))
   for poly in o.data.polygons:poly.material_index=0
  for o,k in kinds:
   decimate(o,budgets0[k]);level_hem(o,k)
  meshes=[o for o,k in kinds]
  # Create LOD1 before joining LOD0 so region-specific budgets retain faces.
  low=[]
  for o,k in kinds:
   d=o.copy();d.data=o.data.copy();bpy.context.collection.objects.link(d);low.append(d);decimate(d,budgets1[k]);level_hem(d,k)
  high=join_meshes(meshes,rig,p['id']+'_LOD0');lowmesh=join_meshes(low,rig,p['id']+'_LOD1')
  if p['id']=='pg':
   bpy.ops.wm.save_as_mainfile(filepath='/tmp/hoops-v6-rig.blend')
   print('CANONICAL_REFERENCE_READY',flush=True)
   if '--reference-only' in sys.argv:return
  try:
   import animations
   animations._SOURCE_CACHE=None
   from animations import build_animations
   actions,clips=build_animations(rig,[high,lowmesh])
  except ImportError:
   if '--geometry-only' not in sys.argv:raise
   actions=[];clips={}
  rig.animation_data.action=None if rig.animation_data else None
  bpy.context.scene.frame_set(0)
  n0=tris(high);n1=tris(lowmesh)
  if n0>8000 or n1>3000:raise RuntimeError(('Budget exceeded',p['id'],n0,n1))
  export(rig,high,RAW/(p['id']+'-lod0.glb'));export(rig,lowmesh,RAW/(p['id']+'-lod1.glb'))
  record={**p,'normalizedHeightMeters':1.95,'models':{'lod0':'models/'+p['id']+'-lod0.glb','lod1':'models/'+p['id']+'-lod1.glb'},'triangles':{'lod0':n0,'lod1':n1},'clips':clips,'source':str((SRC/('hoops-'+p['source']+'.glb')).relative_to(REPO)),'sourceSha256':hashlib.sha256((SRC/('hoops-'+p['source']+'.glb')).read_bytes()).hexdigest()}
  metadata['players'].append(record)
  (ROOT/'asset-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
  print('PROFILE_READY',p['id'],n0,n1,flush=True)
 (ROOT/'rig.json').write_text(json.dumps({'schemaVersion':1,'jointCount':18,'joints':[{'name':n,'parent':PARENT[n],'headBlenderZUp':list(specs[n]['head']),'tailBlenderZUp':list(specs[n]['tail']),'bindMatrixBlenderRowMajor':[list(row) for row in specs[n]['matrix']]} for n in JOINTS]},indent=2)+'\n')

if __name__=='__main__':main()
