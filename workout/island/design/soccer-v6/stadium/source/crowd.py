"""Bake six crowd poses from the repository's original CC0 athlete.

Input is an uncompressed copy prepared by build.mjs --decode. Output authoring
intermediates live in /tmp. The final crowd atlas is a render of real geometry.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

ROOT=Path(__file__).resolve().parents[1]
TMP=Path('/tmp/stadium-v6-tools'); TMP.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(TMP/'player-raw.glb'))
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.animation_data_clear()
for p in rig.pose.bones:
    p.rotation_mode='QUATERNION'; p.rotation_quaternion=Quaternion(); p.location=(0,0,0); p.scale=(1,1,1)
bpy.context.view_layer.update()

scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=False
scene.render.resolution_x=128; scene.render.resolution_y=256; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.world.color=(.22,.22,.22)
scene.view_settings.view_transform='AgX'
bpy.ops.object.camera_add(location=(.20,-4,1.0)); cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.92))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=2.18; scene.camera=cam
for pos,energy,size in [((-3,-4,6),340,5),((3,1,4),450,4)]:
    bpy.ops.object.light_add(type='AREA',location=pos); light=bpy.context.object
    light.data.energy=energy; light.data.shape='DISK'; light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()

original=[tuple(c.color) for c in mesh.data.color_attributes['Color'].data]
def aim(name,direction):
    p=rig.pose.bones[name]
    q=(p.tail-p.head).normalized().rotation_difference(Vector(direction).normalized())
    p.matrix=Matrix.Translation(p.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-p.head) @ p.matrix
    bpy.context.view_layer.update()
palette=[(.035,.20,.25),(.53,.40,.18),(.47,.10,.07),(.58,.64,.62),(.075,.11,.16),(.20,.28,.17)]
all_data=[]
for variant in range(6):
    for p in rig.pose.bones:
        p.rotation_quaternion=Quaternion();p.location=(0,0,0);p.scale=(1,1,1)
    # Aim the imported bone axes in armature space; six distinct cheering poses.
    for side,sgn in [('Left',1),('Right',-1)]:
        raised=variant==2 or (variant in [1,3,5] and sgn==(-1 if variant!=5 else 1))
        aim(side+'Arm',(sgn*(.52 if raised else .26),-.10,.85 if raised else -.96))
        aim(side+'ForeArm',(sgn*(.12 if raised else .18),-.25,.97 if raised else -.94))
        if variant==4: aim(side+'ForeArm',(-sgn*.65,-.65,.43))
    for i,c in enumerate(mesh.data.color_attributes['Color'].data):
        r,g,b,a=original[i]
        # The source shirt is the bright cyan region; retain hair and shorts.
        c.color=(*palette[variant],a) if g>.20 and b>.23 and r<.10 else (r,g,b,a)
    bpy.context.view_layer.update()
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=bpy.data.meshes.new_from_object(evaluated)
    obj=bpy.data.objects.new('crowd_%02d'%variant,data); scene.collection.objects.link(obj)
    # Bake the source's complete world transform, then make the body 1.8m tall.
    data.transform(mesh.matrix_world)
    zmin=min(v.co.z for v in data.vertices); zmax=max(v.co.z for v in data.vertices)
    scale=1.8/(zmax-zmin)
    for v in data.vertices: v.co=Vector((v.co.x*scale,v.co.y*scale,(v.co.z-zmin)*scale))
    mesh.hide_render=True; obj.hide_render=False
    scene.render.filepath=str(TMP/('crowd-%d.png'%variant))
    bpy.ops.render.render(write_still=True)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    dec=obj.modifiers.new('Crowd mobile LOD','DECIMATE'); dec.ratio=.0069
    bpy.ops.object.modifier_apply(modifier=dec.name)
    data=obj.data; data.calc_loop_triangles(); color=data.color_attributes.get('Color')
    pos=[]; normals=[]; colors=[]
    for tri in data.loop_triangles:
        for li in tri.loops:
            vi=data.loops[li].vertex_index; v=data.vertices[vi]
            pos.extend([v.co.x,v.co.z,-v.co.y]); n=v.normal; normals.extend([n.x,n.z,-n.y])
            col=color.data[li if color.domain=='CORNER' else vi].color if color else (.2,.3,.35,1)
            colors.extend(col[:3])
    all_data.append(dict(name='spectator_%d'%variant,position=pos,normal=normals,color=colors,triangles=len(data.loop_triangles)))
    print('CROWD',variant,len(data.loop_triangles),flush=True)
    bpy.data.objects.remove(obj,do_unlink=True); mesh.hide_render=False
(TMP/'crowd.json').write_text(json.dumps(all_data,separators=(',',':')))
print('CROWD_BAKE_COMPLETE',flush=True)
