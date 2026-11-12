"""Original CC0-1.0 boss models. Run with Blender 4.3+ --background --python.

Coordinates below use glTF axes: X right, Y up, Z forward. The conversion to
Blender happens only in xyz(). No reference geometry is copied.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
NAMES=['boss-01-scout','boss-02-heavy','boss-03-weaver','boss-04-splitter',
       'boss-05-carrier','boss-06-carrier-elite']
COLORS=['a1e5f5','edb865','c985ed','a5e68a','f58da5','b1a5ff']
MATS=[]


def xyz(p):
    x,y,z=p
    return (x,-z,y)


def parent(obj,p):
    obj.parent=p
    return obj


def empty(name,loc=(0,0,0),p=None):
    o=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(o)
    o.location=xyz(loc)
    if p: parent(o,p)
    return o


def finish(o,mat,p,bevel=0):
    bpy.context.view_layer.objects.active=o
    o.select_set(True)
    if bevel:
        mod=o.modifiers.new('Small machined bevel','BEVEL')
        mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Explicit atlas UVs. A panel tile has a generous 16px edge gutter.
    if not o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')
    uv=o.data.uv_layers.active.data
    tile=mat%8
    col=tile%4;row=tile//4
    for poly in o.data.polygons:
        normal=poly.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        axes=[i for i in range(3) if i!=axis]
        vals=[o.data.vertices[o.data.loops[k].vertex_index].co for k in poly.loop_indices]
        low=[min(v[a] for v in vals) for a in axes]
        high=[max(v[a] for v in vals) for a in axes]
        for k in poly.loop_indices:
            v=o.data.vertices[o.data.loops[k].vertex_index].co
            u=(v[axes[0]]-low[0])/max(.00001,high[0]-low[0])
            w=(v[axes[1]]-low[1])/max(.00001,high[1]-low[1])
            uv[k].uv=((col+.08+.84*u)/4,1-(row+.08+.84*w)/4)
    o.data.materials.clear();o.data.materials.append(MATS[mat])
    if p: parent(o,p)
    o.select_set(False)
    return o


def prism(name,outline,bottom,top,mat,p,bevel=.035):
    # outline uses X/Z. Reversed Blender XY order gives outward top normals.
    pts=[xyz((x,bottom,z)) for x,z in outline]+[xyz((x,top,z)) for x,z in outline]
    n=len(outline)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(pts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    # Recalculate orientation robustly for mirrored/concave outlines.
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    return finish(o,mat,p,bevel)


def box(name,loc,size,mat,p,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc))
    o=bpy.context.object;o.name=name
    o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,p,bevel if min(size)>.25 else 0)


def cylinder(name,loc,radius,depth,mat,p,axis='Y',vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=xyz(loc))
    o=bpy.context.object;o.name=name
    if axis=='Z':
        o.rotation_euler.x=math.pi/2
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    return finish(o,mat,p)


def ring(name,loc,major,minor,mat,p):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,
        location=xyz(loc),major_radius=major,minor_radius=minor)
    o=bpy.context.object;o.name=name
    return finish(o,mat,p)


def mirrored(outline,sign):
    return [(sign*x,z) for x,z in outline]


def make_materials(name,color):
    global MATS
    MATS=[]
    image=bpy.data.images.load(str(ROOT/f'textures/{name}-basecolor.png'),check_existing=False)
    names=['Hull titanium','Porcelain armor','Type accent','Recess',
           'Reactor emission','Warm trim','Vent steel','Core light']
    for i,label in enumerate(names):
        m=bpy.data.materials.new(label);m.use_nodes=True
        nodes=m.node_tree.nodes;bs=nodes.get('Principled BSDF')
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
        m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        bs.inputs['Metallic'].default_value=.62 if i in (0,1,2,6) else .2
        bs.inputs['Roughness'].default_value=.36 if i!=3 else .6
        if i in (4,7):
            m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color'])
            bs.inputs['Emission Strength'].default_value=1
        MATS.append(m)


def assemble(index):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    name=NAMES[index]
    make_materials(name,COLORS[index])
    root=empty('Boss_Ship')
    root['license']='CC0-1.0';root['units']='meters';root['forward']='+Z';root['up']='+Y'
    root['stage']=min(index+1,5);root['variant']=name
    root['reference']='assets/alien-v13/player-ship.glb; axes/pivot/units only'
    # Six silhouettes are authored separately, sharing only mechanical details.
    hulls=[
      [(-.85,-2.1),(.85,-2.1),(1.15,-.4),(.5,2.75),(0,3.1),(-.5,2.75),(-1.15,-.4)],
      [(-1.7,-2.45),(1.7,-2.45),(1.9,-1.3),(1.6,1.8),(.85,2.3),(-.85,2.3),(-1.6,1.8),(-1.9,-1.3)],
      [(-.7,-2.2),(.7,-2.2),(1.2,-.4),(.75,1.35),(0,2.5),(-.75,1.35),(-1.2,-.4)],
      [(-1.55,-2.45),(1.55,-2.45),(1.55,-1),(.8,.1),(-.8,.1),(-1.55,-1)],
      [(-1.35,-2.45),(1.35,-2.45),(1.5,-1.6),(1.2,1.65),(.7,2.3),(-.7,2.3),(-1.2,1.65),(-1.5,-1.6)],
      [(-1.1,-2.45),(1.1,-2.45),(1.55,-1.1),(1.25,1.4),(0,3.1),(-1.25,1.4),(-1.55,-1.1)]
    ]
    prism('Keel',hulls[index],0,.48,3,root)
    prism('Central armor',hulls[index],.48,.78,0,root)
    outlines=[
      [(1,-1.6),(3.7,-2.45),(3.45,-.5),(1.25,1.5)],
      [(1.4,-2.1),(3.35,-2.45),(3.7,-1.6),(3.5,1.7),(2.9,2.6),(1.4,1.5)],
      [(.8,-1.1),(2.1,-2.45),(3.7,-1.25),(3.4,1.8),(2.5,3.1),(2.85,.5),(1.4,.6)],
      [(1,-2.2),(2.5,-2.45),(3.7,-1.5),(3.3,1.8),(2.25,3.1),(1.35,2.55),(.75,.25)],
      [(1,-1.5),(3.7,-1.85),(3.7,2.2),(3.1,3.1),(2.3,2.7),(2.3,.4),(1,.25)],
      [(1,-1.3),(2.4,-2.45),(3.7,-1.4),(3.1,.1),(3.65,1.75),(2.5,2.85),(1.1,1.4)]
    ]
    for s,side in [(-1,'L'),(1,'R')]:
        outline=mirrored(outlines[index],s)
        prism(f'Wing {side}',outline,.3,.66,0,root)
        # Smaller top plate exposes a dark chassis bevel around the edge.
        cx=sum(p[0] for p in outline)/len(outline);cz=sum(p[1] for p in outline)/len(outline)
        inset=[(cx+(x-cx)*.87,cz+(z-cz)*.87) for x,z in outline]
        prism(f'Wing armor {side}',inset,.68,.83,1,root)
        box(f'Accent rail {side}',(s*2.85,.87,-.25),(.16,.07,1.5),2,root,.025)
        for k in range(3):
            box(f'Cooling vent {side} {k}',(s*(1.9+k*.19),.88,-1.1),(.1,.035,.5),6,root,.01)
        cylinder(f'Engine shell {side}',(s*2.35,.55,-1.85),.32,1,6,root,'Z')
        cylinder(f'Engine light {side}',(s*2.35,.55,-2.37),.23,.06,4,root,'Z')
    # Core is a mesh at the reactor center; glTF clients can pulse/rotate it.
    core=empty('Core',(0,1.02,-.25),root)
    core['role']='reactor';core['rotation_axis']='+Y'
    cylinder('Core lower socket',(0,-.13,0),.77,.23,3,core,vertices=16)
    ring('Core collar',(0,0,0),.67,.11,5,core)
    cylinder('Core prism',(0,.08,0),.48,.25,4,core,vertices=12)
    cylinder('Core cap',(0,.22,0),.27,.04,7,core,vertices=12)
    for k in range(6):
        ang=math.tau*k/6
        box(f'Core latch {k}',(.85*math.cos(ang),-.03,.85*math.sin(ang)),(.17,.11,.18),2,core,.02)
    # Turret meshes remain children of separate local pivots. Muzzle +Z.
    for s,side in [(-1,'L'),(1,'R')]:
        turret=empty(f'Turret_{side}',(s*2.65,.86,1.0),root)
        turret['rotation_axis']='+Y';turret['firing_axis']='+Z'
        cylinder(f'Turret bearing {side}',(0,0,0),.36,.16,6,turret)
        box(f'Turret shroud {side}',(0,.2,.04),(.52,.33,.7),0,turret,.065)
        cylinder(f'Turret barrel {side}',(0,.2,.57),.13,.75,6,turret,'Z')
        cylinder(f'Turret muzzle {side}',(0,.2,.96),.105,.06,4,turret,'Z')
        empty(f'Muzzle_{side}',(0,.2,1.01),turret)
    # Per-role features: front fork, armor stack, crescent fins, twin booms,
    # hangar doors, and a crown-shaped elite rear array.
    if index==0:
        prism('Arrow deck',[(-.45,.9),(.45,.9),(0,2.9)],.81,1.13,2,root)
    elif index==1:
        for s in [-1,1]:
            box('Armor shoulder',(s*1.15,1.05,.15),(.65,.45,2.5),1,root,.1)
        box('Command armor',(0,1.35,-1.3),(1.2,.48,.7),2,root,.1)
    elif index==2:
        for s in [-1,1]:
            prism('Crescent fin',mirrored([(2.5,-1.8),(3.3,-1.2),(2.9,1),(2.6,.3)],s),.86,1.3,2,root)
    elif index==3:
        for s in [-1,1]:
            prism('Split forward boom',mirrored([(.45,-.3),(1.35,-.3),(1.6,2.6),(.85,3.1)],s),.55,.98,2,root)
            cylinder('Secondary reactor',(s*1.1,1.05,1.1),.27,.12,4,root)
    elif index==4:
        for s in [-1,1]:
            box('Hangar roof',(s*2.94,1.05,.3),(.85,.34,2.15),2,root,.08)
            for k in range(4):
                box('Hangar door rib',(s*2.94,1.24,-.4+k*.43),(.68,.035,.08),1,root,.01)
    else:
        for s in [-1,1]:
            prism('Crown blade',mirrored([(1,-2),(1.9,-2.35),(2.25,-1.3),(1.45,-.5)],s),.8,1.65,2,root)
        prism('Crown central blade',[(-.3,-2.35),(.3,-2.35),(.25,-.75),(-.25,-.75)],.8,1.96,1,root)
    # Scale and ground the whole assembly once, keeping a root identity pivot.
    # Exact reference envelope width 7.4m, length 5.55m; maximum height <=1.96m.
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    corners=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    low=Vector([min(v[i] for v in corners) for i in range(3)])
    high=Vector([max(v[i] for v in corners) for i in range(3)])
    factors=Vector((7.4/(high.x-low.x),5.55/(high.y-low.y),min(1,1.96/(high.z-low.z))))
    center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    # Bake world geometry into local coordinates around each named pivot.
    matrices={o:o.matrix_world.copy() for o in bpy.context.scene.objects}
    origins={o:Vector(tuple((matrices[o].translation[i]-center[i])*factors[i] for i in range(3))) for o in bpy.context.scene.objects}
    for o in meshes:
        m=matrices[o]
        for vert in o.data.vertices:
            world=m@vert.co
            vert.co=Vector(tuple((world[i]-center[i])*factors[i] for i in range(3)))-origins[o]
    for o in bpy.context.scene.objects:
        o.rotation_euler=(0,0,0);o.scale=(1,1,1)
        o.location=origins[o]-(origins[o.parent] if o.parent else Vector((0,0,0)))
    # Root must stay exactly at the same ground-plane origin as Player_Ship.
    offset=root.location.copy()
    for child in root.children:child.location+=offset
    root.location=(0,0,0)
    bpy.context.view_layer.update()
    # Batch static meshes by pivot to reduce draw calls and glTF JSON overhead.
    for pivot in [root,core]+[o for o in root.children if o.name.startswith('Turret_')]:
        parts=[o for o in pivot.children if o.type=='MESH']
        if not parts:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0]
        bpy.ops.object.join()
        parts[0].name=pivot.name+'_Geometry'
    bpy.ops.object.select_all(action='SELECT')
    path=ROOT/f'models/{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_draco_mesh_compression_enable=False,export_extras=True,
        export_yup=True,export_cameras=False,export_lights=False,
        export_animations=False,export_normals=True,export_texcoords=True,
        export_materials='EXPORT',export_image_format='AUTO')
    print('EXPORTED',name,path.stat().st_size)
    # Review render; camera/lights are not included in exported assets.
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.render.resolution_x=640;scene.render.resolution_y=520;scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.view_settings.view_transform='AgX'
    scene.world.color=(.18,.18,.18)
    for loc,power,size in [((3,-4,10),1500,8),((-6,-1,5),1100,7),((1,6,7),1700,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
        light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(8,-10,12))
    cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.6))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=10;scene.camera=cam
    scene.render.filepath=str(ROOT/f'verification/{name}.png')
    bpy.ops.render.render(write_still=True)


if __name__=='__main__':
    for i in range(6):assemble(i)
