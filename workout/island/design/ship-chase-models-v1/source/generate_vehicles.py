#!/usr/bin/env python3
"""Original CC0 vehicle geometry. Run with Blender 4.3+: blender -b -t 1 -P this_file.

No downloaded geometry, images, fonts, logos or textures are used. Blender design
space is metres, +Z up, -Y forward; glTF export gives +Y up, +Z forward.
Wheel pivot empties have identity rotation and turn about their local X axis.
L means -X, R means +X; front wheel pivots are at +Z in the exported glTF.
The numeric base colors below are intentional linear PBR color components.
"""
from pathlib import Path
import math
import bpy
import bmesh

OUT = Path(__file__).resolve().parents[1] / "runtime"
OUT.mkdir(exist_ok=True)


def material(name, color, metallic=0, roughness=.4, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        p.inputs["Emission Color"].default_value = (*color, 1)
        p.inputs["Emission Strength"].default_value = emission
    return m


def mesh(name, verts, faces, mat, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    ob.parent = parent or ROOT
    return ob


def empty(name, position=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.location = position
    ob.parent = parent
    return ob


def box(name, center, size, mat, bevel=0, parent=None):
    x, y, z = center
    a, b, c = [v / 2 for v in size]
    vs = [(x+i*a, y+j*b, z+k*c) for i, j, k in
          [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
           (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    ob = mesh(name, vs, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat, parent)
    if bevel:
        mod = ob.modifiers.new("Edge chamfer", 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def loft(name, sections, mat):
    # y, half-width, bottom, shoulder-height: eight-sided cross sections.
    vs = []
    for y, w, lo, hi in sections:
        vs += [(x, y, z) for x, z in [(-w*.88,lo),(w*.88,lo),(w,lo+.08),
              (w,hi-.09),(w*.84,hi),(-w*.84,hi),(-w,hi-.09),(-w,lo+.08)]]
    fs = [tuple(reversed(range(8))), tuple(range(len(vs)-8,len(vs)))]
    for a in range(len(sections)-1):
        for j in range(8):
            fs.append((a*8+j,a*8+(j+1)%8,(a+1)*8+(j+1)%8,(a+1)*8+j))
    return mesh(name, vs, fs, mat)


def wheel_wells(ob, wheel_y, radius):
    for y in wheel_y:
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius+.055,
            depth=5, location=(0,y,radius), rotation=(0,math.pi/2,0))
        cutter = bpy.context.object
        mod = ob.modifiers.new("Open wheel well", 'BOOLEAN')
        mod.operation='DIFFERENCE'
        mod.solver='EXACT'
        mod.object=cutter
        bpy.context.view_layer.objects.active=ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)


def arch(x, y, radius, mat):
    vs=[]
    # A trim band only around the opening's upper half, outside the tire.
    for r in (radius+.055, radius+.09):
        for i in range(11):
            theta=i*math.pi/10
            vs.append((x, y+r*math.cos(theta), radius+r*math.sin(theta)))
    mesh("Fender trim", vs, [(i,i+1,12+i,11+i) for i in range(10)], mat)


def wheel(name, x, y, radius, width=.24):
    pivot=empty(name,(x,y,radius),ROOT)
    pivot["rotation_axis"]="X"
    pivot["radius_m"]=radius
    n=16
    rings=[(-width/2,radius*.83),(-width*.34,radius),(width*.34,radius),(width/2,radius*.83)]
    vs=[(ax,math.cos(i*2*math.pi/n)*r,math.sin(i*2*math.pi/n)*r) for ax,r in rings for i in range(n)]
    fs=[]
    for j in range(3):
        fs += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for i in range(n)]
    fs += [tuple(reversed(range(n))), tuple(range(3*n,4*n))]
    mesh("Tire",vs,fs,M['rubber'],pivot)
    # Flat rim annulus plus five asymmetrical spokes visibly rotate.
    for side in (-1,1):
        ax=side*(width/2+.003)
        vs=[(ax,math.cos(i*2*math.pi/n)*r,math.sin(i*2*math.pi/n)*r)
            for r in (radius*.48,radius*.76) for i in range(n)]
        mesh("Rim lip",vs,[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)],M['alloy'],pivot)
        for k in range(5):
            a=k*math.tau/5+.21
            radial=radius*.45
            verts=[]
            for r,theta in [(radius*.12,a-.35),(radius*.68,a-.09),(radius*.68,a+.12),(radius*.12,a+.35)]:
                verts.append((ax+.001*side,math.cos(theta)*r,math.sin(theta)*r))
            mesh("Spoke",verts,[(0,1,2,3)],M['alloy'],pivot)
        box("Hub",(ax+side*.006,0,0),(.02,radius*.24,radius*.24),M['hub'],parent=pivot)
    return pivot


def wheels(track, ys, radius, width=.24):
    for x, side in [(-track/2,'L'),(track/2,'R')]:
        for y, row in [(ys[0],'F'),(ys[1],'R')]:
            wheel('Wheel_'+row+side,x,y,radius,width)
            arch(x+(.13 if x>0 else -.13),y,radius,M['trim'])


def panel(name, verts, mat):
    return mesh(name,verts,[tuple(range(len(verts)))],mat)


def cabin(front, roof_front, roof_rear, rear, base, top, half_width, roof_width, color, two_doors=False):
    # Metal frame and roof. Glazing is offset from this shell, with visible pillars.
    vs=[(-half_width,front,base),(half_width,front,base),(half_width,rear,base),(-half_width,rear,base),
        (-roof_width,roof_front,top),(roof_width,roof_front,top),(roof_width,roof_rear,top),(-roof_width,roof_rear,top)]
    mesh("Cabin frame",vs,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],color)
    panel("Windshield",[(-half_width*.91,front-.006,base+.065),(half_width*.91,front-.006,base+.065),
            (roof_width*.90,roof_front-.009,top-.065),(-roof_width*.90,roof_front-.009,top-.065)],M['glass'])
    panel("Rear glass",[(half_width*.90,rear+.006,base+.065),(-half_width*.90,rear+.006,base+.065),
            (-roof_width*.88,roof_rear+.008,top-.065),(roof_width*.88,roof_rear+.008,top-.065)],M['glass'])
    # Side panels lie on the side surface; glass shell at z-dependent width.
    def width_at(z): return half_width+(roof_width-half_width)*(z-base)/(top-base)+.006
    for s in (-1,1):
        za=base+.07; zb=top-.065
        wa=width_at(za)*s; wb=width_at(zb)*s
        if two_doors:
            panel("Side glass",[(wa,front+.13,za),(wa,rear-.14,za),(wb,roof_rear-.06,zb),(wb,roof_front+.07,zb)],M['glass'])
        else:
            split=(roof_front+roof_rear)/2
            panel("Front side glass",[(wa,front+.13,za),(wa,split-.045,za),(wb,split-.045,zb),(wb,roof_front+.07,zb)],M['glass'])
            panel("Rear side glass",[(wa,split+.045,za),(wa,rear-.14,za),(wb,roof_rear-.06,zb),(wb,split+.045,zb)],M['glass'])


def face_lights(front_y, rear_y, width, z, wide=False):
    for s in (-1,1):
        box("Headlight",(s*width*.69,front_y-.014,z),(.42 if wide else .32,.045,.13),M['white_light'],.025)
        box("Tail lamp",(s*width*.74,rear_y+.015,z),(.24,.045,.14),M['red_light'],.018)


def details(front_y,rear_y,width,z):
    box("Front bumper",(0,front_y,z-.16),(width*1.90,.14,.15),M['trim'],.035)
    box("Rear bumper",(0,rear_y,z-.16),(width*1.90,.13,.13),M['trim'],.03)
    box("Grille shadow",(0,front_y-.06,z),(.82,.035,.24),M['trim'])
    for dz in (-.07,0,.07):
        box("Grille slat",(0,front_y-.081,z+dz),(.77,.02,.021),M['alloy'])
    box("Rear inset",(0,rear_y+.07,z),(.39,.02,.18),M['trim'],.02)


def handles(half_width,ys,z):
    for s in (-1,1):
        for y in ys:
            box("Door handle",(s*(half_width+.006),y,z),(.022,.21,.038),M['alloy'],.009)


def mirrors(half_width,y,z):
    for s in (-1,1):
        box("Mirror arm",(s*(half_width+.055),y,z),(.16,.055,.055),M['trim'])
        box("Mirror housing",(s*(half_width+.12),y,z+.03),(.16,.20,.12),M['paint'],.025)
        box("Mirror face",(s*(half_width+.12),y+.102,z+.03),(.13,.008,.078),M['alloy'])


def start(name,paint):
    global ROOT,M
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials): bpy.data.materials.remove(mat)
    ROOT=empty(name)
    ROOT["license"]="CC0-1.0"
    ROOT["source"]="Original procedural geometry; source/generate_vehicles.py"
    ROOT["units"]="metres"
    ROOT["forward"]="+Z in glTF"
    ROOT["wheel_axis"]="local +X"
    M={
        'paint':material('Body paint',paint,.38,.29),
        'trim':material('Dark trim',(.025,.040,.052),.25,.42),
        'rubber':material('Tire rubber',(.018,.024,.029),0,.85),
        'alloy':material('Brushed alloy',(.52,.60,.64),.80,.27),
        'hub':material('Hub dark',(.10,.15,.18),.65,.34),
        'glass':material('Blue tinted glazing',(.036,.11,.16),.5,.14),
        'white_light':material('Warm headlamps',(.88,.94,.83),.1,.22,.25),
        'red_light':material('Red lens',(.72,.035,.03),.1,.28,.25),
        'blue_light':material('Blue lens',(.02,.22,1.0),.1,.23,.9),
        'roof_red':material('Roof red lens',(1,.035,.035),.1,.23,.9),
        'accent':material('Accent',(.08,.24,.28),.3,.4),
        'amber':material('Amber lens',(1,.40,.035),0,.3,.4),
    }


def finish(filename):
    # Merge static geometry by material, retain wheel and light pivots untouched.
    static=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==ROOT]
    static_groups={mat:[o for o in static if o.data.materials[0]==mat]
                   for mat in sorted({o.data.materials[0] for o in static},key=lambda m:m.name)}
    for mat,group in static_groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group: o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        group[0].name='Body_'+mat.name.replace(' ','_')
    # Merge each wheel's pieces per material to keep draw calls bounded.
    for p in [o for o in ROOT.children if o.name.startswith('Wheel_')]:
        items=[o for o in p.children if o.type=='MESH']
        wheel_groups={mat:[o for o in items if o.data.materials[0]==mat]
                      for mat in sorted({o.data.materials[0] for o in items},key=lambda m:m.name)}
        for mat,group in wheel_groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in group:o.select_set(True)
            bpy.context.view_layer.objects.active=group[0]
            if len(group)>1:bpy.ops.object.join()
            group[0].name=p.name+'_'+mat.name.replace(' ','_')
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:o.select_set(True)
    # Triangulate explicitly for reproducible measured triangle count.
    for o in bpy.context.scene.objects:
        if o.type=='MESH':
            mod=o.modifiers.new('Delivery triangles','TRIANGULATE')
            bpy.context.view_layer.objects.active=o
            bpy.ops.object.modifier_apply(modifier=mod.name)
    tris=sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',
        use_selection=True,export_yup=True,export_texcoords=False,export_normals=True,
        export_materials='EXPORT',export_animations=False,export_extras=True,
        export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
    print('VEHICLE_METRICS',filename,tris,'triangles',(OUT/filename).stat().st_size,'bytes')
    if tris>3000 or (OUT/filename).stat().st_size>300000:
        raise RuntimeError('Delivery budget exceeded: '+filename)


def police():
    start('Police_Car',(.80,.87,.86))
    body=loft('Sculpted sedan shell',[(-2.29,.72,.30,.79),(-2.05,.90,.29,.97),(-1.0,.93,.29,1.03),
        (.9,.93,.29,1.03),(1.97,.89,.30,.97),(2.22,.75,.34,.84)],M['paint'])
    wheel_wells(body,(-1.40,1.36),.345)
    wheels(1.75,(-1.40,1.36),.345)
    cabin(-.96,-.37,.65,1.25,1.01,1.54,.82,.66,M['paint'])
    # Navy hood and deck preserve the familiar patrol silhouette without insignia.
    panel('Hood', [(-.76,-1.96,.981),(.76,-1.96,.981),(.77,-1.03,1.033),(-.77,-1.03,1.033)],M['accent'])
    box('Roof light base',(0,.10,1.585),(1.22,.30,.075),M['trim'],.025)
    for x,name,key in [(-.35,'Light_R','roof_red'),(.35,'Light_B','blue_light')]:
        p=empty(name,(x,.10,1.67),ROOT)
        p['role']='roof beacon; animate emissiveIntensity'
        box(name+'_lens',(0,0,0),(.51,.26,.14),M[key],.035,parent=p)
    handles(.91,(-.05,.87),.93)
    mirrors(.83,-.65,1.08)
    details(-2.30,2.23,.88,.66)
    face_lights(-2.30,2.23,.88,.80,True)
    finish('police-car.glb')


def sport():
    start('Sports_Car',(.95,.23,.055))
    body=loft('Coupe shell',[(-2.22,.72,.25,.61),(-1.90,.91,.24,.79),(-.78,.96,.24,.87),
        (.84,.96,.24,.89),(1.93,.91,.25,.82),(2.15,.78,.29,.73)],M['paint'])
    wheel_wells(body,(-1.35,1.30),.33)
    wheels(1.80,(-1.35,1.30),.33,.25)
    cabin(-.70,-.13,.63,1.27,.86,1.26,.80,.63,M['paint'],True)
    for x in (-.15,.15):
        panel('Hood accent',[(x-.05,-1.85,.798),(x+.05,-1.85,.798),(x+.05,-.82,.870),(x-.05,-.82,.870)],M['trim'])
    box('Front splitter',(0,-2.18,.31),(1.74,.21,.065),M['trim'],.02)
    box('Rear wing',(0,1.82,1.02),(1.65,.22,.065),M['trim'],.025)
    for x in (-.58,.58):box('Wing support',(x,1.82,.91),(.055,.07,.20),M['trim'])
    handles(.93,(.57,),.81)
    mirrors(.81,-.40,.96)
    details(-2.23,2.16,.86,.51)
    face_lights(-2.23,2.16,.87,.65,True)
    finish('sports-car.glb')


def pickup():
    start('Pickup',(.07,.40,.43))
    body=loft('Pickup lower shell',[(-2.52,.78,.36,.93),(-2.27,.96,.33,1.10),(-.95,.99,.33,1.14),
        (1.99,.99,.34,1.11),(2.47,.88,.40,1.01)],M['paint'])
    wheel_wells(body,(-1.64,1.58),.42)
    wheels(1.88,(-1.64,1.58),.42,.29)
    cabin(-1.10,-.66,.22,.54,1.12,1.90,.87,.73,M['paint'],True)
    box('Open bed floor',(0,1.45,1.10),(1.65,1.73,.055),M['trim'])
    for s in (-1,1):
        box('Bed side rail',(s*.91,1.47,1.27),(.14,1.82,.35),M['paint'],.035)
        box('Bed rail cap',(s*.91,1.47,1.46),(.15,1.84,.035),M['trim'])
        box('Step rail',(s*1.01,-.30,.48),(.12,1.30,.095),M['alloy'],.02)
    box('Tailgate',(0,2.35,1.27),(1.75,.14,.35),M['paint'],.025)
    box('Tailgate handle',(0,2.428,1.34),(.26,.025,.045),M['trim'])
    for x in (-.57,-.29,0,.29,.57):
        box('Bed floor rib',(x,1.48,1.14),(.025,1.60,.025),M['hub'])
    handles(.97,(.23,),1.04)
    mirrors(.88,-.80,1.32)
    details(-2.53,2.48,.93,.75)
    face_lights(-2.53,2.48,.94,.94,True)
    finish('pickup.glb')


def boss():
    start('Armored_Boss',(.24,.25,.39))
    body=loft('Armored chassis',[(-2.67,.80,.40,1.08),(-2.35,1.01,.36,1.30),(-1.05,1.05,.36,1.34),
        (2.24,1.05,.38,1.31),(2.58,.96,.44,1.20)],M['paint'])
    wheel_wells(body,(-1.64,1.66),.46)
    wheels(2.0,(-1.64,1.66),.46,.33)
    # Sloped cab and bevelled strongbox, substantial yet rounded, no weaponry.
    cabin(-2.22,-1.65,-.79,-.62,1.29,2.12,.91,.76,M['paint'],True)
    box('Cargo safe',(0,1.01,1.73),(2.02,3.31,1.16),M['paint'],.12)
    box('Roof armor',(0,1.0,2.325),(1.87,3.11,.07),M['trim'],.025)
    for s in (-1,1):
        box('Side armor insert',(s*1.017,1.0,1.77),(.028,2.72,.57),M['accent'],.015)
        box('Side armor lower trim',(s*1.037,1.0,1.46),(.035,2.68,.055),M['alloy'])
        for y in (-.12,.66,1.44,2.20):
            box('Armor bolt',(s*1.044,y,1.99),(.028,.065,.065),M['alloy'])
        box('Step rail',(s*1.08,-1.02,.66),(.16,1.22,.12),M['trim'],.025)
    for x in (-.49,.49):
        box('Safe rear door',(x,2.678,1.73),(.90,.025,.86),M['accent'],.035)
        box('Safe lock rail',(x,2.703,1.73),(.045,.025,.62),M['alloy'])
    box('Front protection',(0,-2.73,.80),(1.99,.16,.17),M['alloy'],.035)
    for x in (-.88,.88):box('Bumper upright',(x,-2.74,.98),(.075,.12,.40),M['alloy'],.02)
    for x in (-.60,0,.60):box('Amber marker',(x,-1.64,2.155),(.14,.07,.06),M['amber'],.015)
    handles(1.01,(-.86,),1.25)
    mirrors(.92,-1.73,1.60)
    details(-2.68,2.70,1.0,.95)
    face_lights(-2.68,2.71,.97,1.13,True)
    finish('armored-boss.glb')


police()
sport()
pickup()
boss()
