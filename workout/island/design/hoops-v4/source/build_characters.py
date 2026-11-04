"""Derive five rigged, colour-only uniform athletes from the repository's MakeHuman assets.
Run from any directory with Blender 4.3:
blender -b --factory-startup --python build_characters.py
Only hoops-v4 and a temporary raw export directory are written.
"""
from pathlib import Path
import sys, json, hashlib, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
SRC = REPO/'workout/island/assets/models'
RAW = Path('/tmp/hoops-v4-players')
RAW.mkdir(exist_ok=True)
OUT = ROOT/'assets/players'
OUT.mkdir(parents=True, exist_ok=True)
PROFILES = [
 {'id':'pg', 'role':'PG', 'height':1.78, 'source':'guard', 'width':.90, 'depth':.90, 'build':'compact, lean playmaker', 'hair':'source close crop'},
 {'id':'sg', 'role':'SG', 'height':1.88, 'source':'wing', 'width':.95, 'depth':.94, 'build':'slender shooting guard', 'hair':'source short swept crop'},
 {'id':'sf', 'role':'SF', 'height':1.99, 'source':'forward', 'width':1.01, 'depth':1.00, 'build':'balanced athletic wing', 'hair':'source short crop'},
 {'id':'pf', 'role':'PF', 'height':2.09, 'source':'big', 'width':1.11, 'depth':1.12, 'build':'broad muscular power forward', 'hair':'full afro'},
 {'id':'c', 'role':'C', 'height':2.20, 'source':'big', 'width':.95, 'depth':.98, 'build':'long-limbed centre, narrower than power forward', 'hair':'flattened close afro'},
]
PALETTES = {
 'amber': {'team_primary':'#F5A536','team_secondary':'#132A3D','team_trim':'#FFE9B5'},
 'cyan': {'team_primary':'#20BFCC','team_secondary':'#14394E','team_trim':'#D1FCFF'},
}
def srgb(hex):
 v=[int(hex.lstrip('#')[i:i+2],16)/255 for i in (0,2,4)]
 return [x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]+[1.]
def material(name, hex):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=srgb(hex)
 p.inputs['Roughness'].default_value=.78
 m.diffuse_color=srgb(hex)
 return m

def uniforms(meshes):
 mats={n:material(n,c) for n,c in PALETTES['amber'].items()}
 for o in meshes:
  if o.name not in ('Jersey','Shorts'): continue
  me=o.data; old=me.color_attributes.active_color
  colors=[tuple(d.color) for d in old.data] if old else []
  me.materials.clear()
  primary=mats['team_primary' if o.name=='Jersey' else 'team_secondary']
  me.materials.append(primary);me.materials.append(mats['team_trim'])
  # Jersey stays a single colour. A binary interpretation of the source
  # continuous edge mask creates sawtooth collar triangles, so only the very
  # narrow turned-in shorts cuff receives the optional third palette colour.
  for p in me.polygons:
   edge=min(colors[i][0] for i in p.loop_indices) if colors else 0
   p.material_index=1 if o.name=='Shorts' and edge>.85 else 0
  for a in list(me.color_attributes): me.color_attributes.remove(a)
  for uv in list(me.uv_layers):me.uv_layers.remove(uv)
 return mats

def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for a in list(bpy.data.actions):
  a.use_fake_user=False
  if a.users==0:bpy.data.actions.remove(a)
 for coll in (bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images):
  for x in list(coll):
   if x.users==0:coll.remove(x)

def build(profile):
 reset()
 p=SRC/('hoops-'+profile['source']+'.glb')
 bpy.ops.import_scene.gltf(filepath=str(p))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 rig.name='HoopsV4_'+profile['role']
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
 for o in meshes:
  o.data.update()
 uniforms(meshes)
 # Only the centre's hair is reshaped: retain the source textured curls but give
 # the taller athlete an independent lower, narrower haircut.
 if profile['id']=='c':
  for o in meshes:
   if 'afro' in o.name.lower():
    coords=[v.co.z for v in o.data.vertices];bottom=min(coords)
    for v in o.data.vertices:
     v.co.z=bottom+(v.co.z-bottom)*.30
     v.co.x*=.90;v.co.y*=.90
  # A narrower, longer jaw distinguishes the centre's face from the forward.
  for o in meshes:
   if o.name=='Human_x':
    for v in o.data.vertices:
     if v.co.z>1.76 and abs(v.co.x)<.14:
      t=max(0,min(1,(v.co.z-1.76)/.16));v.co.x*=1-.08*math.sin(t*math.pi)
 allp=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 lo=min(v.z for v in allp);hi=max(v.z for v in allp)
 height_scale=profile['height']/(hi-lo)
 M=Matrix.Diagonal((profile['width'],profile['depth'],height_scale,1.)) @ Matrix.Translation((0,0,-lo))
 for o in meshes:
  o.data.transform(M)
  for poly in o.data.polygons:poly.use_smooth=True
 # Transform every bind bone by the same invertible metre-space map as the
 # mesh, preserving skin correspondence. The exporter rebuilds inverse binds.
 bpy.context.view_layer.objects.active=rig
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT')
 for b in rig.data.edit_bones:b.transform(M,scale=True,roll=True)
 bpy.ops.object.mode_set(mode='OBJECT')
 # Geometry is intentionally modest while preserving the full face and hands.
 # Keep face topology intact; simplify shoes/hair/garments only.
 for o in meshes:
  ratio=.68 if 'shoes' in o.name.lower() else (.76 if o.name in ('Jersey','Shorts') else .80 if 'afro' in o.name.lower() else 1.)
  if ratio<1:
   bpy.context.view_layer.objects.active=o
   d=o.modifiers.new('Export geometry reduction','DECIMATE');d.ratio=ratio;d.use_collapse_triangulate=True
   bpy.ops.object.modifier_apply(modifier=d.name)
  # Trim mask has already been materialized; retained texture assets only.
  for m in o.data.materials:
   if not m or not m.use_nodes:continue
   for n in m.node_tree.nodes:
    if n.type=='TEX_IMAGE' and n.image:
     im=n.image;w,h=im.size
     if max(w,h)>512:im.scale(max(1,round(w*512/max(w,h))),max(1,round(h*512/max(w,h))))
 from character_animations import build_animations, ground_actions
 actions,clips=build_animations(rig,height_scale=height_scale)
 floor_report=ground_actions(rig,meshes,actions)
 for name,report in floor_report.items():clips[name]['floorBake']=report
 # All NLA actions are explicitly exported. No current action is allowed to
 # overwrite idle/one-shot selection during glTF action collection.
 rig.animation_data.action=None
 bpy.context.scene.frame_set(0)
 rig.data.pose_position='POSE'
 bpy.ops.object.select_all(action='DESELECT')
 for o in [rig]+meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 path=RAW/(profile['id']+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_skins=True,
  export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
  export_frame_range=False,export_force_sampling=True,
  export_anim_slide_to_zero=True,export_morph=False,export_apply=False,export_yup=True,
  export_texcoords=True,export_normals=True,export_vertex_color='NONE',
  export_image_format='AUTO',export_jpeg_quality=82,export_keep_originals=False)
 # Actual untouched bind geometry (not posed playback) bounds.
 bound=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 mn=[min(v[i] for v in bound)for i in range(3)];mx=[max(v[i] for v in bound)for i in range(3)]
 chest=[v for o in meshes if o.name=='Jersey' for v in o.data.vertices if profile['height']*.69<v.co.z<profile['height']*.78]
 chestwidth=max(v.co.x for v in chest)-min(v.co.x for v in chest) if chest else 0
 meta={**profile,'path':profile['id']+'.glb','sourcePath':str(p.relative_to(REPO)),
  'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceLicense':'MakeHuman core assets CC0-1.0; repository provenance ASSETS.md',
  'heightMeters':mx[2]-mn[2],'chestWidthMeters':chestwidth,'coordinateSystem':{'up':'+Y','front':'+Z','units':'metres'},
  'restBoundsBlenderZUp':{'min':mn,'max':mx},'jointNames':[b.name for b in rig.data.bones],
  'clips':clips,'rawBytes':path.stat().st_size,
  'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)}
 print('PLAYER BUILT',json.dumps(meta),flush=True)
 return meta

def main():
 results=[]
 for profile in PROFILES:results.append(build(profile))
 metadata={'schemaVersion':1,'paletteMaterials':list(PALETTES['amber']), 'teams':PALETTES,'players':results,
 'animationSource':{'path':'workout/island/assets/models/hoops-anim.glb','sha256':hashlib.sha256((SRC/'hoops-anim.glb').read_bytes()).hexdigest(),
 'license':'CMU Graphics Lab Motion Capture Database: free use in research and commercial products; do not sell motion data separately. CMU motion is not CC0.',
 'acknowledgement':'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.'}}
 (OUT/'player-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
if __name__=='__main__':main()
