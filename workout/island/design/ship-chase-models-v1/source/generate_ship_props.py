# SPDX-License-Identifier: CC0-1.0
# Original geometry authored for ship-chase-models-v1. No external art or textures.
# Rebuild: blender -b --python source/generate_ship_props.py
from pathlib import Path
import bpy, bmesh, math
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'runtime'
OUT.mkdir(exist_ok=True)


def material(name, color, metallic=0, roughness=.45, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def fresh():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for data in list(bpy.data.materials):
        bpy.data.materials.remove(data)


def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    # Recalculate each closed component outward; keep intentional one-sided reflectors.
    bm=bmesh.new()
    bm.from_mesh(data)
    if not any(e.is_boundary for e in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def bevel(obj, width=.04):
    mod = obj.modifiers.new('soft edges', 'BEVEL')
    mod.width = width
    mod.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, loc, size, mat, bevel_width=0, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel_width:
        bevel(obj, bevel_width)
    if parent:
        obj.parent=parent
    return obj


def empty(name, loc=(0,0,0), parent=None):
    o=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(o)
    o.location=loc
    o.parent=parent
    return o


def cylinder(name, center, radius, length, mat, axis='Y', sides=12, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=length, location=center)
    obj=bpy.context.object
    obj.name=name
    if axis=='Y': obj.rotation_euler[0]=math.pi/2
    elif axis=='X': obj.rotation_euler[1]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    obj.data.materials.append(mat)
    # Smooth only curved walls, preserve flat end caps.
    for p in obj.data.polygons:
        p.use_smooth=len(p.vertices)==4
    if parent: obj.parent=parent
    return obj


def tube(name, y0, y1, cx, cz, outer, inner, mat, parent=None, n=12):
    verts=[]
    for y,r in [(y0,outer),(y1,outer),(y0,inner),(y1,inner)]:
        verts += [(cx+r*math.cos(i*2*math.pi/n),y,cz+r*math.sin(i*2*math.pi/n)) for i in range(n)]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    if y1 > y0:
        faces=[tuple(reversed(f)) for f in faces]
    return mesh(name,verts,faces,mat,parent)


def loft(name, rings, mat, n=8):
    # Cross sections are (Blender forward coordinate, half-width, vertical center, half-height).
    verts=[]
    for y,w,z,h in rings:
        for i in range(n):
            a=math.pi/8+i*2*math.pi/n
            verts.append((w*math.cos(a),y,z+h*math.sin(a)))
    faces=[]
    for r in range(len(rings)-1):
        for i in range(n):
            j=(i+1)%n
            faces.append((r*n+i,(r+1)*n+i,(r+1)*n+j,r*n+j))
    faces += [tuple(reversed(range(n))),tuple((len(rings)-1)*n+i for i in range(n))]
    return mesh(name,verts,faces,mat)


def wedge(name, outline, zlow, zhigh, mat):
    verts=[(x,y,zlow) for x,y in outline]+[(x,y,zhigh) for x,y in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat)


def merge_static(root):
    # Merge by material within each exact pivot, without collapsing animated groups.
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    keys=sorted(set((o.parent,o.data.materials[0]) for o in meshes), key=lambda k: ((k[0].name if k[0] else ''),k[1].name))
    groups=[(parent,mat,[o for o in meshes if o.parent==parent and o.data.materials[0]==mat]) for parent,mat in keys]
    for parent,mat,objs in groups:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1: bpy.ops.object.join()
        o=bpy.context.object
        o.name=(parent.name if parent else 'Static')+'_'+mat.name
        o.parent=parent or root
    for o in list(bpy.context.scene.objects):
        if o != root and o.parent is None: o.parent=root


def export(name, root):
    root['license']='CC0-1.0'
    root['source']='source/generate_ship_props.py'
    root['units']='meters'
    root['forward']='+Z'
    root['up']='+Y'
    merge_static(root)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_apply=True,
        export_extras=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',
        export_cameras=False,export_lights=False,export_animations=False,export_draco_mesh_compression_enable=False)
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    coords=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
    bounds=[max(v[i] for v in coords)-min(v[i] for v in coords) for i in range(3)]
    print('MODEL',name,'triangles',tris,'bytes',(OUT/(name+'.glb')).stat().st_size,'blenderXYZ',bounds)


def ship():
    fresh()
    hull=material('Porcelain alloy',(.69,.78,.83),.42,.3)
    navy=material('Deep petrol',(.025,.13,.18),.52,.29)
    edge=material('Dark titanium',(.10,.14,.18),.8,.34)
    metal=material('Barrel steel',(.31,.38,.43),.85,.28)
    glass=material('Blue canopy',(.04,.30,.40),.65,.17)
    amber=material('Signal amber',(.97,.39,.075),.25,.32)
    dark=material('Aperture black',(.008,.014,.019),.2,.65)
    glow=material('Engine cyan',(.06,.72,.88),.2,.28,.8)
    root=empty('Player_Ship')
    loft('fuselage',[(-3.1,.08,.58,.09),(-2.45,.55,.69,.28),(-.9,.87,.71,.42),(.9,.83,.65,.36),(2.2,.51,.62,.25),(2.45,.40,.61,.22)],hull)
    loft('upper deck',[(-2.8,.05,.88,.02),(-1.0,.55,1.0,.09),(1.5,.45,.95,.07),(2.1,.15,.87,.02)],navy)
    loft('glass canopy',[(-1.85,.18,1.06,.12),(-1.0,.49,1.18,.36),(.05,.47,1.18,.36),(.68,.28,1.05,.17)],glass)
    # Canopy sill and rear bridge keep a distinct cockpit silhouette.
    box('canopy rear frame',(0,.59,1.12),(.7,.11,.31),navy,.025)
    for s in [-1,1]:
        outline=[(s*.6,-1.2),(s*1.9,-.65),(s*3.7,.95),(s*3.55,1.65),(s*1.4,1.45),(s*.7,1.9)]
        if s<0: outline.reverse()
        wedge('swept wing',outline,.38,.55,hull)
        inset=[(s*1.0,-.55),(s*1.8,-.2),(s*3.3,1.13),(s*2.85,1.28),(s*1.12,.83)]
        if s<0: inset.reverse()
        wedge('wing petrol panel',inset,.552,.568,navy)
        tipmark=[(s*3.20,1.00),(s*3.50,1.19),(s*3.38,1.42),(s*3.06,1.24)]
        if s<0: tipmark.reverse()
        wedge('wing amber marker',tipmark,.571,.584,amber)
        # Vertical stabilizer at each aft engine, blade made explicitly to avoid logos.
        finverts=[(s*.98,1.1,.84),(s*.98,1.7,1.96),(s*.98,2.34,1.45),(s*.98,2.40,.77),
                  (s*1.06,1.1,.84),(s*1.06,1.7,1.96),(s*1.06,2.34,1.45),(s*1.06,2.40,.77)]
        mesh('tail blade',finverts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],navy)
        cylinder('engine pod',(s*1.05,1.32,.62),.38,1.75,hull,sides=12)
        tube('engine nozzle',1.91,2.38,s*1.05,.62,.31,.235,edge,n=12)
        cylinder('engine aperture',(s*1.05,2.17,.62),.226,.025,dark,sides=12)
        cylinder('engine glow',(s*1.05,2.185,.62),.156,.03,glow,sides=12)
        for j in range(3): box('heat vent',(s*.63,.88+j*.22,.997),(.23,.09,.018),edge,.009)
        # A fixed mount and rear breech, followed by a complete independent six-tube rotor.
        x=s*2.17; z=.63
        box('cannon pylon',(x,.34,.46),(.32,.55,.35),edge,.035)
        cylinder('fixed breech',(x,-.05,z),.25,.77,navy,sides=12)
        rotor=empty('Barrel_L' if s<0 else 'Barrel_R',(x,-.34,z))
        rotor['spin_axis']='+Z'
        # Children use pivot-local coordinates so the exported pivot has no corrective rotation.
        for i in range(6):
            a=math.tau*i/6
            bx=.145*math.cos(a); bz=.145*math.sin(a)
            tube('six steel barrels',-.04,-1.82,bx,bz,.053,.031,metal,parent=rotor,n=8)
            cylinder('dark bore',(bx,-1.72,bz),.03,.01,dark,sides=8,parent=rotor)
        cylinder('rotor hub',(0,-.91,0),.073,1.78,edge,sides=10,parent=rotor)
        for y in [-.14,-1.24,-1.68]: tube('rotor collar',y-.05,y+.05,0,0,.218,.187,edge,parent=rotor,n=12)
        muzzle=empty('Muzzle_L' if s<0 else 'Muzzle_R',(x,-2.18,z))
        muzzle['firing_axis']='+Z'
        muzzle['note']='Stationary rotor-axis firing point at front plane; sibling of Barrel pivot.'
        # Thin rectangular tip light, asymmetrical in depth to make travel orientation legible.
        box('navigation lamp',(s*3.50,1.47,.61),(.14,.10,.07),glow,.02)
    # Belly landing runners keep the physical minimum at zero without fragile landing legs.
    for x in [-.48,.48]: box('belly runner',(x,.27,.13),(.20,1.9,.26),edge,.05)
    export('player-ship',root)


def clip(poly, axis, bound, keep_greater):
    result=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ia=(a[axis]>=bound) if keep_greater else (a[axis]<=bound)
        ib=(b[axis]>=bound) if keep_greater else (b[axis]<=bound)
        if ia: result.append(a)
        if ia!=ib:
            t=(bound-a[axis])/(b[axis]-a[axis])
            result.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(2)))
    return result


def roadblock():
    fresh()
    white=material('Reflective ivory',(.90,.93,.91),.08,.43)
    orange=material('Safety coral',(.98,.24,.055),.05,.43)
    metal=material('Galvanized stand',(.38,.46,.50),.65,.44)
    rubber=material('Rubber feet',(.06,.085,.09),.05,.7)
    root=empty('Roadblock')
    box('reflective board',(0,0,1.01),(2.8,.16,.56),white,.045)
    for x in [-.99,.99]:
        box('upright',(x,0,.63),(.095,.09,1.16),metal,.015)
        box('stand foot',(x,0,.055),(.19,.85,.11),rubber,.03)
        box('foot brace',(x,0,.17),(.11,.49,.14),metal,.02)
    for side in [-1,1]:
        for x in [-1.65,-1.05,-.45,.15,.75,1.35]:
            poly=[(x-.17,.75),(x+.10,.75),(x+.49,1.27),(x+.22,1.27)]
            for axis,bound,greater in [(0,-1.35,True),(0,1.35,False),(1,.75,True),(1,1.27,False)]:
                if poly: poly=clip(poly,axis,bound,greater)
            if len(poly)>2:
                verts=[(a,side*.081,b) for a,b in poly]
                mesh('diagonal reflector',verts,[tuple(range(len(verts))) if side<0 else tuple(reversed(range(len(verts))))],orange)
    for x in [-1.27,1.27]:
        cylinder('board rivet',(x,-.089,1.0),.028,.018,metal,sides=8)
        cylinder('board rear rivet',(x,.089,1.0),.028,.018,metal,sides=8)
    export('roadblock',root)


def cone():
    fresh()
    orange=material('Safety orange',(.98,.25,.045),.05,.46)
    white=material('Reflective band',(.94,.96,.91),.08,.35)
    rubber=material('Weighted base',(.065,.085,.09),.05,.72)
    root=empty('Cone')
    box('weighted base',(0,0,.05),(.46,.46,.10),rubber,.045)
    n=16
    # A closed tapered cone with one wide white band; material boundaries share exact profile.
    bands=[(.09,.175),(.29,.126),(.43,.091),(.68,.030)]
    for i,mat in enumerate([orange,white,orange]):
        z0,r0=bands[i];z1,r1=bands[i+1]
        verts=[(r*math.cos(j*math.tau/n),r*math.sin(j*math.tau/n),z) for z,r in [(z0,r0),(z1,r1)] for j in range(n)]
        faces=[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        if i==0: faces.append(tuple(reversed(range(n))))
        if i==2: faces.append(tuple(range(n,2*n)))
        o=mesh('cone band',verts,faces,mat)
        for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    export('cone',root)


if __name__=='__main__':
    ship()
    roadblock()
    cone()
