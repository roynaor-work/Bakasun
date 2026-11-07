"""CC0 original low-poly seated fans. Run with blender -b -t 2 -P source/fans.py.

One orthographic render: eight columns, two rows, paired down/up poses.
No photographs, named people, imported meshes, fonts or generative images.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=False
scene.render.resolution_x=1024
scene.render.resolution_y=512
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard'
scene.world.color=(.23,.23,.23)


def mat(name,c):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*c,1)
    return m


def ball(p,scale,m):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=p)
    o=bpy.context.object
    o.scale=scale
    o.data.materials.append(m)
    return o


def limb(a,b,r,m):
    d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r*.85,radius2=r,depth=d.length,location=(Vector(a)+Vector(b))/2)
    o=bpy.context.object
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(m)
    ball(a,(r,r,r),m)
    ball(b,(r*.86,r*.86,r*.86),m)


colors=[(.18,.56,.63),(.91,.48,.28),(.88,.73,.34),(.56,.44,.72),
        (.23,.52,.37),(.82,.82,.73),(.68,.30,.36),(.27,.44,.70)]
skins=[(.64,.40,.26),(.85,.63,.43),(.39,.23,.16),(.73,.49,.32),
       (.9,.7,.52),(.48,.30,.21),(.76,.52,.37),(.58,.36,.23)]
for variant in range(8):
    for pose in range(2):
        idx=variant*2+pose
        cx=(idx%8-3.5)*1.1
        base=(1-idx//8)*2.2
        def p(x,y,z): return (cx+x,y,base+z)
        shirt=mat('original shirt',colors[variant])
        skin=mat('featureless skin',skins[variant])
        hair=mat('hair',(.055+variant*.012,.045+variant*.008,.04))
        pants=mat('trousers',(.07+variant%3*.035,.12,.18))
        shoe=mat('shoes',(.79,.80,.75))
        # Bent knees and upright torso: physically seated on a .40m seat.
        for side in (-1,1):
            hip=p(side*.105,0,.52)
            knee=p(side*.14,-.31,.48)
            ankle=p(side*.14,-.32,.1)
            limb(hip,knee,.083,pants)
            limb(knee,ankle,.066,pants)
            ball(p(side*.14,-.39,.065),(.09,.15,.06),shoe)
        ball(p(0,0,.81),(.23,.14,.31),shirt)
        limb(p(0,0,1.02),p(0,0,1.14),.075,skin)
        ball(p(0,-.015,1.26),(.135,.12,.17),skin)
        ball(p(0,.02,1.36),(.141,.125,.095+variant%3*.02),hair)
        if variant in (1,4,7):
            ball(p(.12,.05,1.19),(.09,.11,.14),hair)
        for side in (-1,1):
            shoulder=p(side*.2,0,.98)
            elbow=p(side*(.32 if pose else .27),-.025 if pose else -.16,1.27 if pose else .73)
            hand=p(side*(.37 if pose else .16),-.05 if pose else -.32,1.67 if pose else .60)
            limb(shoulder,elbow,.075,shirt)
            limb(elbow,hand,.048,skin)
            ball(hand,(.055,.043,.072),skin)
        if variant%2==0:
            accent=mat('contrast collar',(.9,.88,.77))
            limb(p(-.06,-.12,1.05),p(.06,-.12,1.05),.018,accent)

bpy.ops.object.camera_add(location=(0,-20,2.12))
camera=bpy.context.object
camera.rotation_euler=(math.pi/2,0,0)
camera.data.type='ORTHO'
camera.data.ortho_scale=8.8
scene.camera=camera

for pos,power,size,color in [((-3,-7,9),1200,8,(1,.83,.65)),((6,-4,5),750,7,(.65,.78,1)),((0,4,8),1000,6,(1,.7,.42))]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=bpy.context.object
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.data.color=color
    light.rotation_euler=(Vector((0,0,2))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(ROOT/'runtime/crowd-atlas.png')
bpy.ops.wm.save_as_mainfile(filepath='/tmp/tennis-stadium-fans.blend')
bpy.ops.render.render(write_still=True)
