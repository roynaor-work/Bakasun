"""Blender 4.3.2: original sea props, metre units, exported glTF +Y up.

Four rocks and four floaters are supplied separately, plus a lighthouse.
The existing CC0 corvette is re-exported solely as a scale reference in preview.
No existing repository files are written.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
MODELS=ROOT/'models'
MODELS.mkdir(exist_ok=True)
PARTS=[]
PALETTE={
 'stone':(.27,.32,.34,1),'wet':(.095,.16,.18,1),'salt':(.63,.64,.57,1),
 'white':(.83,.79,.65,1),'red':(.59,.12,.075,1),'green':(.10,.36,.28,1),
 'rust':(.33,.16,.075,1),'iron':(.105,.15,.17,1),'wood':(.36,.24,.12,1),
 'rope':(.51,.43,.28,1),'glass':(.085,.27,.32,1),'gold':(.97,.58,.18,1)
}


def reset():
    PARTS.clear()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def paint(obj,color,roughness=.72):
    # One shared vertex-colour material. Variation is baked, not shader-dependent.
    mat=bpy.data.materials.get('SeaProps')
    if not mat:
        mat=bpy.data.materials.new('SeaProps');mat.use_nodes=True
        bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Roughness'].default_value=roughness
        bs.inputs['Metallic'].default_value=.12
        vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
        mat.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    c=PALETTE.get(color,color) if isinstance(color,str) else color
    for p in obj.data.polygons:
        for li in p.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            k=.94+.06*math.sin(co.x*8.7+co.y*5.1+co.z*6.2)
            attr.data[li].color=tuple(v*k for v in c[:3])+(1,)
    PARTS.append(obj)
    return obj


def mesh(name,vertices,faces,color):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    return paint(obj,color)


def box(name,location,size,color,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Soft worn edges','BEVEL');m.width=bevel;m.segments=2
        bpy.ops.object.modifier_apply(modifier=m.name)
    return paint(o,color)


def cone(name,z,r1,r2,h,color,n=32,x=0,y=0):
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r1,radius2=r2,depth=h,location=(x,y,z))
    o=bpy.context.object;o.name=name
    return paint(o,color)


def rod(name,a,b,r,color,n=8):
    a,b=Vector(a),Vector(b)
    o=cone(name,0,r,r,(b-a).length,color,n)
    o.location=(a+b)/2
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o


def torus(name,location,radius,minor,color,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,
        major_segments=32,minor_segments=8,location=location)
    o=bpy.context.object;o.name=name
    if rotation:o.rotation_euler=rotation
    return paint(o,color)


def rock_shape(seed,scale,offset=(0,0,0),name='Basalt'):
    rng=random.Random(seed);n=24;rings=9;verts=[];faces=[]
    phases=[rng.random()*math.tau for _ in range(4)]
    for j in range(rings):
        z=-.32+j/(rings-1)*1.3
        radial=(.9-.1*j/rings)*math.sin(.12+j/(rings-1)*2.8)**.6+.04
        for i in range(n):
            a=i/n*math.tau
            r=radial*(1+.16*math.sin(a*3+phases[0])+.09*math.cos(a*7+phases[1]+j*.29))
            r*=1+.05*math.sin(a*11-j*1.7)
            x=(math.cos(a)*r+.09*math.sin(j*.5))*scale[0]
            y=(math.sin(a)*r+.05*math.cos(j*.7))*scale[1]
            zz=z*scale[2]+.05*scale[2]*math.sin(a*4+j+phases[2])
            verts.append((x+offset[0],y+offset[1],zz+offset[2]))
    for j in range(rings-1):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;c=b+n;d=a+n
            faces.extend([(a,b,c),(a,c,d)])
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((rings-1)*n+i for i in range(n)))
    o=mesh(name,verts,faces,'stone')
    attr=o.data.color_attributes['Color']
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            if co.z<.24:color=PALETTE['wet']
            elif co.z<.6:color=PALETTE['salt']
            else:
                k=.75+.25*(.5+.5*math.sin(co.z*2.7+co.x*.6))
                color=tuple(k*v for v in PALETTE['stone'][:3])+(1,)
                if p.normal.z>.65:color=(.33,.37,.31,1)
            attr.data[li].color=color
    return o


def export(name,parts=None):
    parts=parts or list(PARTS)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    body=bpy.context.object;body.name=name
    body['units']='metres';body['waterlineMeters']=0
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    tri=body.modifiers.new('Explicit triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
    # No generated UVs/textures: everything is embedded vertex colour + core PBR.
    bpy.ops.export_scene.gltf(filepath=str(MODELS/(name+'.glb')),export_format='GLB',
        use_selection=True,export_yup=True,export_texcoords=False,export_normals=True,
        export_materials='EXPORT',export_extras=True,export_animations=False,
        export_cameras=False,export_lights=False,export_attributes=False)
    print('EXPORTED',name,len(body.data.polygons),'triangles')


def rocks():
    for name,seed,s in [('rock-skerry',30,(5.4,3.1,2.5)),('rock-stack',49,(2.7,2.4,7.5)),
                        ('rock-split',76,(4,3,4.3)),('rock-reef',92,(6,3.8,1.6))]:
        reset();rock_shape(seed,s)
        if name=='rock-split':rock_shape(80,(2.4,2.1,5),(-2.9,.7,-.3),'Detached crag')
        if name=='rock-reef':rock_shape(93,(2.4,1.9,1.9),(3,-2,0),'Reef tooth')
        export(name)


def buoy(name,color,kind):
    reset()
    cone('Submerged keel',-.26,.27,.55,.52,'iron',24)
    cone('Buoyant skirt',.11,.76,.66,.44,color,32)
    torus('Rubber fender',(0,0,.08),.69,.075,'iron')
    cone('Upper drum',.52,.55,.42,.42,'white',32)
    cone('Painted cap',.86,.42,.26,.3,color,24)
    if kind==0:
        cone('Mast',1.39,.08,.07,.96,'iron',16)
        cone('Can topmark',1.96,.19,.19,.28,color,16)
    else:
        cone('Mast',1.4,.07,.07,.92,'iron',16)
        cone('Cone topmark',1.95,.24,0,.39,color,16)
    for a in range(4):
        ang=a/4*math.tau
        rod('Guard',(math.cos(ang)*.32,math.sin(ang)*.32,.73),
            (math.cos(ang)*.16,math.sin(ang)*.16,1.7),.022,'iron',6)
    torus('Upper cage',(0,0,1.7),.16,.025,'iron')
    cone('Signal lens',1.7,.115,.115,.16,'gold',16)
    export(name)


def floaters():
    buoy('float-can-buoy','red',0);buoy('float-cone-buoy','green',1)
    reset()
    o=cone('Waterlogged timber',0,.27,.23,4.5,'wood',16)
    o.rotation_euler=(0,math.pi/2,.12);o.location.z=.09
    for pos in [-1.6,-.3,1.3]:
        o=torus('Rope binding',(pos,0,.09),.265,.024,'rope',(0,math.pi/2,0))
    rod('Broken branch',(.6,0,.12),(.8,.57,.4),.1,'wood',8)
    export('float-driftwood')
    reset()
    box('Floating crate',(0,0,.14),(1.4,1.12,.8),'wood',.035)
    for z in [-.12,.16,.43]:
        for side in [-1,1]:box('Horizontal slat',(0,side*.568,z),(1.41,.045,.055),'rope',.008)
    for x in [-.52,.52]:
        box('Iron strap',(x,0,.56),(.055,1.14,.035),'iron',.005)
        for side in [-1,1]:box('Strap edge',(x,side*.586,.14),(.055,.025,.82),'iron',.004)
    export('float-supply-crate')


def lighthouse():
    reset()
    rock_shape(511,(10,7,4.3),name='Rocky foundation')
    cone('Stone terrace',2.7,3.55,3.35,.65,'salt',40)
    for i in range(7):
        box('Approach step',(0,-3.1-i*.52,2.9-i*.34),(1.7,.62,.32),'salt',.06)
    # Five tapering bands with a red centre and a second upper band.
    for j in range(5):
        z=3.1+j*2.35
        cone('Tower band',z+1.175,2.15-j*.18,2.15-(j+1)*.18,2.35,
             'red' if j in [1,3] else 'white',48)
    cone('Cornice',15.1,1.67,1.67,.45,'white',48)
    cone('Lantern deck',15.43,2.12,2.12,.24,'iron',48)
    torus('Gallery lower rail',(0,0,15.8),1.93,.045,'iron')
    torus('Gallery handrail',(0,0,16.26),1.93,.045,'iron')
    for i in range(16):
        a=i/16*math.tau
        rod('Gallery stanchion',(math.cos(a)*1.93,math.sin(a)*1.93,15.55),
             (math.cos(a)*1.93,math.sin(a)*1.93,16.26),.036,'iron',6)
    cone('Lantern glazing',16.52,1.25,1.25,1.7,'glass',32)
    for i in range(8):
        a=i/8*math.tau
        rod('Lantern mullion',(math.cos(a)*1.29,math.sin(a)*1.29,15.67),
            (math.cos(a)*1.29,math.sin(a)*1.29,17.37),.052,'iron',6)
    cone('Roof eaves',17.5,1.65,1.65,.22,'iron',40)
    cone('Copper roof',18.06,1.65,.16,.9,'rust',40)
    cone('Finial',18.85,.1,.03,.7,'iron',12)
    for z in [6.1,10.8,13.3]:
        box('Window reveal',(0,-(2.15-(z-3.1)/2.35*.18)-.015,z),(.5,.13,.8),'iron',.04)
        box('Window pane',(0,-(2.15-(z-3.1)/2.35*.18)-.09,z),(.34,.04,.63),'glass',.015)
    box('Door surround',(0,-2.14,4.05),(.96,.19,1.9),'salt',.06)
    box('Weathered door',(0,-2.26,4.02),(.73,.09,1.65),'iron',.04)
    # The lantern stays a separate emissive primitive, with no glTF extension.
    core=box('Beacon lens',(0,-1.28,16.53),(.68,.1,.9),'gold',.04)
    mat=bpy.data.materials.new('Beacon amber');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(1,.61,.19,1)
    bs.inputs['Emission Color'].default_value=(1,.61,.19,1)
    bs.inputs['Emission Strength'].default_value=1
    bs.inputs['Roughness'].default_value=.38
    core.data.materials.clear();core.data.materials.append(mat)
    export('lighthouse')


rocks();floaters();lighthouse()
