"""Blender 4.3 authoring. Only writes inside racing-v7.

Run from the repository root:
blender -b --factory-startup --python workout/island/design/racing-v7/source/build-assets.py
Source car: attributed CC-BY-4.0 Car Concept. The delivered set uses
the original detailed input via '-- cars original'; see source/README.md.
Engine coordinates: metres, +Y up, +Z forward. Blender: (x, -z, y).
"""
import bpy, math, json, random, hashlib, sys, os
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
SOURCE = REPO / 'assets/racing/sport-coupe.glb'
if not SOURCE.exists():
    SOURCE = ROOT.parents[1] / 'assets/racing/sport-coupe.glb'
LEGACY_SOURCE=SOURCE
USE_ORIGINAL=False
CANON = json.loads((ROOT.parent / 'motion2/soccer.json').read_text())['skeleton']['bones']
random.seed(7127)

def xyz(v): return (v[0], -v[2], v[1])
def engine(v): return Vector((v.x, v.z, -v.y))
def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for d in list(bpy.data.materials):
        if d.users == 0: bpy.data.materials.remove(d)

def material(name, color, rough=.6, metal=0, emission=0, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p=m.node_tree.nodes.get('Principled BSDF')
    rgb=tuple(int(color[i:i+2],16)/255 for i in (1,3,5)) if isinstance(color,str) else color
    linear=lambda c:c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
    rgb=tuple(linear(c) for c in rgb[:3])
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    p.inputs['Coat Weight'].default_value=coat
    p.inputs['Coat Roughness'].default_value=.13
    if emission:
        p.inputs['Emission Color'].default_value=(*rgb,1)
        p.inputs['Emission Strength'].default_value=emission
    return m

def mesh(name, vertices, faces, mat, smooth=False, uvs=None):
    data=bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    o=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(o)
    if mat: data.materials.append(mat)
    if smooth:
        for p in data.polygons: p.use_smooth=True
    if uvs:
        layer=data.uv_layers.new(name='UVMap')
        for poly in data.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv=uvs[data.loops[li].vertex_index]
    return o

def box(name, pos, scale, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    o=bpy.context.object; o.name=name
    o.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons: p.use_smooth=True
        normal=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return o

def cylinder(name, pos, radius, depth, mat, segments=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=depth,location=xyz(pos))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def cone(name,pos,r1,r2,depth,mat,segments=9):
    bpy.ops.mesh.primitive_cone_add(vertices=segments,radius1=r1,radius2=r2,depth=depth,location=xyz(pos))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    return o

def sphere(name,pos,scale,mat,seg=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=xyz(pos))
    o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

def export(path):
    path=ROOT/path;path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,
        export_extras=True,export_animations=True,export_materials='EXPORT',
        export_def_bones=False,export_skins=True,export_all_influences=False,
        export_apply=False,export_image_format='AUTO')

CAR_SPECS=[
    dict(id='apex',name='Apex / קופה',color='#14c6b8',width=1.,length=1.,height=1.,roofshift=0.,kind='coupe',wing=.16),
    dict(id='velour',name='Velour / GT',color='#ef6c32',width=.97,length=1.18,height=1.27,roofshift=-.43,kind='gt',wing=.08),
    dict(id='prism',name='Prism / טריז',color='#8b5cf6',width=1.10,length=1.08,height=.76,roofshift=.20,kind='wedge',wing=.23),
    dict(id='solis',name='Solis / רודסטר',color='#e8dfc4',width=1.01,length=.97,height=1.,roofshift=0.,kind='roadster',wing=.10),
    dict(id='vector',name='Vector / מסלול',color='#c2e940',width=1.10,length=1.02,height=.98,roofshift=-.06,kind='track',wing=.58),
]

def car_transform(v,s):
    x,y,z=v
    z-=.23846
    roof=max(0.,min(1.,(y-.72)/.25))
    x*=s['width']
    z=z*s['length']+s['roofshift']*roof
    y=.65+(y-.65)*s['height'] if y>.65 else y
    if s['kind']=='wedge' and y>.65:
        y-=max(0,z-.7)*.025
    return Vector((x,y,z))

def make_car(s,lod):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    if USE_ORIGINAL:
        excluded={'BodyWindshieldWipers','BodyWindshieldWipersBase','BodyHoodInterior01','BodyHoodInterior02','BodyHoodUnder'}
        keep=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Body') and o.name not in excluded]
        for o in list(bpy.context.scene.objects):
            if o.type=='MESH' and o not in keep:bpy.data.objects.remove(o,do_unlink=True)
        body=join(keep,'Body')
        world=body.matrix_world.copy();body.parent=None;body.matrix_world=world
        for o in list(bpy.context.scene.objects):
            if o!=body:bpy.data.objects.remove(o,do_unlink=True)
        # Source wheel pivots are kept in the normalized units used by the current game.
        for name,center in [('WheelFrontL',(.975493,.383759,1.485681)),('WheelFrontR',(-.976675,.383759,1.483968)),('WheelRearL',(.982514,.383759,-1.314062)),('WheelRearR',(-.981705,.383759,-1.314062))]:
            o=mesh(name,[(0,0,0),(.001,0,0),(0,.001,0)],[(0,1,2)],None);o.location=xyz(center)
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Bake the source transforms before deformations, then restore independent wheel origins.
    for o in objects:
        world_before=o.matrix_world.copy();o.parent=None;o.matrix_world=world_before
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        # Blender rotates custom split normals along with the source object axes.
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        world=o.matrix_world.copy()
        original_center=engine(o.matrix_world.translation)
        new_center=car_transform(original_center,s) if o.name.startswith('Wheel') else Vector((0,0,0))
        for v in o.data.vertices:
            p=car_transform(engine(world@v.co),s)
            if o.name.startswith('Wheel'):
                # Keep wheels circular; vehicle changes affect wheelbase and track, not tire shape.
                p=new_center+(engine(world@v.co)-original_center)
                p.y=original_center.y+(engine(world@v.co).y-original_center.y)
            v.co=Vector(xyz(p-new_center))
        o.matrix_world=Matrix.Translation(Vector(xyz(new_center)))
        o.data.update()
        if o.name=='Body' and s['kind']=='roadster':
            import bmesh
            bm=bmesh.new();bm.from_mesh(o.data)
            remove=[f for f in bm.faces if engine(f.calc_center_median()).y>.91 and -.95<engine(f.calc_center_median()).z<.48]
            bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(o.data);bm.free()
    mats={
        'glass':material('Glass • reflective smoked', '#243d57',.085,.78,coat=1),
        'trim':material('Trim • graphite', '#111a24',.44,.35),
        'accent':material('Accent • satin carbon', '#263440',.36,.6),
        'paint':material('Paint • recolorable',s['color'],.22,.62,coat=1),
        'signal':material('Signal • amber','#ff9e36',.25,.12,2),
        'brake':material('Lamp • rear','#ff2348',.22,.1,3),
        'head':material('Lamp • front','#dbf5ff',.2,.15,4),
        'alloy':material('Wheel • forged alloy','#a4b6c8',.24,.95),
        'rubber':material('Wheel • unbranded rubber','#151b21',.86,0),
        'metal':material('Metal • brushed','#607384',.32,.85),
    }
    for o in objects:
        for i,m in enumerate(o.data.materials):
            n=m.name
            key=('glass' if 'glass' in n.lower() or n=='Mirror' else 'paint' if 'Paint 1' in n else 'accent' if 'Paint 2' in n else
                'signal' if 'Signallight' in n else 'brake' if 'Brakelight' in n else 'head' if 'Headlight' in n else
                'alloy' if 'alloy' in n else 'rubber' if 'rubber' in n else 'metal' if 'metal' in n else 'trim')
            o.data.materials[i]=mats[key]
        ratio=(([.17,.065,.018] if USE_ORIGINAL else [.61,.27,.075])[lod] if o.name=='Body' else [.42,.20,.075][lod])
        mod=o.modifiers.new('LOD controlled simplification','DECIMATE');mod.ratio=ratio
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        o['lod']=lod
        if o.name.startswith('Wheel'):
            o['spinAxis']='X';o['radiusMeters']=.384
    # Replace the heavily simplified source spokes with clean authored wheel meshes.
    # The detailed licensed body remains the source, while the wheel design is original.
    for old in [o for o in objects if o.name.startswith('Wheel')]:
        name=old.name;center=engine(old.matrix_world.translation)
        bpy.data.objects.remove(old,do_unlink=True)
        make_wheel(name,center,s,lod,mats)
    body=bpy.data.objects.get('Body')
    extras=[]
    width=1.07*s['width']; back=-1.69*s['length']; front=2.14*s['length']
    # Body-specific aero geometry; never logos or borrowed decals.
    extras.append(box('Carbon front splitter',(0,.145,front-.08),(width*1.86,.05,.25),mats['accent'],.018))
    for sign in [-1,1]:
        extras.append(box('Lower sill',(sign*width,.19,-.12),( .09,.115,2.06*s['length']),mats['accent'],.025))
        # Thin running lights sit above the original detailed headlamp cavities.
        extras.append(box('Signature running light',(sign*.79*s['width'],.59*s['height'],front+.047),(.48,.033,.035),mats['head'],.01))
        extras.append(box('Rear light signature',(sign*.70*s['width'],.66*s['height'],back-.035),(.53,.038,.04),mats['brake'],.01))
        if lod<2:
            for i in range(3 if s['kind']!='track' else 5):
                extras.append(box('Cooling louvre',(sign*.77*s['width'],.774*s['height'],-1.12+i*.073),(.27,.02,.026),mats['trim'],.004))
        extras.append(box('Wing pedestal',(sign*.68*s['width'],.78*s['height']+s['wing']/2,back+.09),(.055,s['wing'],.095),mats['accent'],.012))
    if s['kind']!='roadster':
        extras.append(box('Aerofoil',(0,.80*s['height']+s['wing'],back+.08),(width*2.0,.055,.34),mats['accent'],.035))
    if s['kind']=='track':
        for sign in [-1,1]:
            extras.append(box('Wing endplate',(sign*width,.82*s['height']+s['wing'],back+.08),(.028,.25,.40),mats['paint'],.015))
            for i in range(2):
                extras.append(box('Dive plane',(sign*(width-.03),.32+i*.12,front-.08),(.24,.028,.29),mats['accent'],.01))
    if s['kind']=='gt':
        extras.append(box('Long hood vent',(0,.775,1.15*s['length']),(.33,.018,.58),mats['accent'],.025))
    if s['kind']=='wedge':
        for sign in [-1,1]:extras.append(box('Side intake accent',(sign*1.115,.49,-.67),(.035,.22,.43),mats['trim'],.035))
    if s['kind']=='roadster':
        extras.append(box('Open cockpit',(0,.81,-.25),(1.28,.16,1.20),mats['trim'],.11))
        for sign in [-1,1]:
            extras.append(box('Sport seat',(sign*.35,.94,-.54),(.39,.42,.24),mats['accent'],.07))
            extras.append(box('Roll hoop',(sign*.37,1.16,-.75),(.49,.08,.08),mats['metal'],.035))
            for xx in [-.20,.20]:extras.append(box('Roll hoop support',(sign*.37+xx,1.03,-.75),(.06,.27,.07),mats['metal'],.018))
    # Attach added geometry to the static Body while retaining the source material partitions.
    body=join([body]+extras,'Body')
    body['vehicle']=s['id'];body['forward']='+Z';body['units']='metres'
    export(Path(f'assets/cars/{s["id"]}-lod{lod}.glb'))

def make_wheel(name,center,s,lod,mats):
    parts=[];seg=[36,24,14][lod]
    def lathe(label,profile,mat):
        vs=[];fs=[]
        for x,r in profile:
            for i in range(seg):
                a=i*math.tau/seg;vs.append((x,r*math.cos(a),r*math.sin(a)))
        for j in range(len(profile)):
            for i in range(seg):
                a=j*seg+i;b=j*seg+(i+1)%seg;c=((j+1)%len(profile))*seg+(i+1)%seg;d=((j+1)%len(profile))*seg+i
                fs.append((a,b,c,d))
        parts.append(mesh(label,vs,fs,mat,True))
    profile=[(-.14,.285),(-.137,.33),(-.10,.372),(-.06,.384),(.06,.384),(.10,.372),(.137,.33),(.14,.285)]
    if lod==2:profile=[(-.14,.29),(-.10,.384),(.10,.384),(.14,.29)]
    lathe('Tire • plain sidewall',profile,mats['rubber'])
    color={'apex':'#a4b6c8','velour':'#b38b53','prism':'#4c596e','solis':'#b3b6b1','vector':'#59646e'}[s['id']]
    rim=material('Wheel • '+s['id'],color,.27,.88)
    lathe('Rim lip',[(-.143,.263),(-.143,.297),(.143,.297),(.143,.263)],rim)
    if lod<2:lathe('Brake disc',[(-.11,.065),(-.11,.247),(.11,.247),(.11,.065)],mats['metal'])
    count={'apex':5,'velour':7,'prism':6,'solis':5,'vector':5}[s['id']]
    split=s['id'] in ['apex','vector'] and lod<2
    for side in [-1,1]:
        for i in range(count):
            for sub in ([-1,1] if split else [0]):
                angle=i*math.tau/count+sub*.06
                spread=.04 if split else .075
                coords=[]
                for x in [side*.14,side*.095]:
                    for r,a in [(.055,angle-.12),(.278,angle+.06-spread),(.278,angle+.06+spread),(.055,angle+.12)]:
                        coords.append((x,r*math.cos(a),r*math.sin(a)))
                parts.append(mesh('Forged spoke',coords,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],rim,False))
    lathe('Hub cap',[(-.153,0),(-.153,.065),(.153,.065),(.153,0)],rim)
    o=join(parts,name);o.location=xyz(center);o['spinAxis']='X';o['radiusMeters']=.384;o['lod']=lod
    return o

TRACKS={
 'neon':dict(name='רובע הלילה',subtitle='NEON QUARTER',width=11.5,color='#d6f34a',
  points=[[-125,0,-110],[-28,.4,-158],[105,1,-137],[175,.2,-55],[140,0,48],[178,.4,125],[70,.8,170],[-35,0,132],[-143,0,150],[-185,.3,50],[-145,0,-32]]),
 'coast':dict(name='דרך החוף',subtitle='SOLSTICE COAST',width=11.8,color='#ffb66b',
  points=[[-125,3,-120],[-50,5,-175],[55,8,-156],[145,10,-90],[173,5,10],[125,2,95],[39,1,165],[-43,2,135],[-115,4,155],[-172,5,58],[-167,3,-50]]),
 'ridge':dict(name='מעבר הפסגה',subtitle='CLOUDLINE RIDGE',width=10.8,color='#87c7ff',
  points=[[-130,4,-125],[-30,14,-172],[78,27,-160],[145,34,-87],[87,29,-30],[153,22,41],[118,17,131],[24,11,167],[-57,6,107],[-144,0,147],[-177,0,56],[-128,2,-26]]),
}

def catmull(points,u):
    n=len(points);t=(u%1)*n;i=int(t);t-=i
    p0,p1,p2,p3=[points[(i+k)%n] for k in [-1,0,1,2]]
    return Vector([.5*((2*p1[j])+(-p0[j]+p2[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t*t+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t*t*t) for j in range(3)])

def make_track(key,s):
    clear()
    n=640
    samples=[];dist=0;last=None
    for i in range(n+1):
        u=i/n;p=catmull(s['points'],u);t=(catmull(s['points'],u+.0001)-catmull(s['points'],u-.0001)).normalized()
        normal=Vector((t.z,0,-t.x)).normalized()
        if last is not None:dist+=(p-last).length
        samples.append(dict(p=list(p),t=list(t),n=list(normal),s=dist));last=p
    s['length']=round(dist,3);s['samples']=samples;s['id']=key
    asphalt=material('Road • asphalt','#364554' if key=='neon' else '#565d62',.59 if key=='neon' else .92,.20 if key=='neon' else .03)
    verge=material('Verge • '+key,{'neon':'#202e37','coast':'#b1a574','ridge':'#657970'}[key],1)
    terrainmat=material('Terrain • '+key,'#ffffff',1)
    def ribbon(name,offsets,mat,height=0,terrain=False):
        verts=[];uv=[];faces=[]
        for i,a in enumerate(samples):
            p=Vector(a['p']);normal=Vector(a['n'])
            for off in offsets:
                v=p+normal*off
                y=height
                if terrain:
                    fade=min(1,max(0,(abs(off)-10)/45))
                    wave=(math.sin(v.x*.035)+math.cos(v.z*.029))*4
                    y-=.4+fade*(7+wave) if key=='coast' else .4-fade*(3+wave)
                v.y+=y
                verts.append(v);uv.append((off/4,a['s']/4))
            if i:
                for j in range(len(offsets)-1):
                    a0=(i-1)*len(offsets)+j;b0=i*len(offsets)+j
                    faces.append((a0,b0,b0+1,a0+1))
        return mesh(name,verts,faces,mat,True,uv)
    ribbon('Road',[-s['width']/2,0,s['width']/2],asphalt,.015)
    ribbon('Shoulder',[-s['width']/2-2.8,-s['width']/2,s['width']/2,s['width']/2+2.8],verge,-.05)
    # Continuous terrain, constrained to the road near the shoulder. Coast slopes down
    # into the sea on the exterior side; the ridge has a complete interior landmass.
    from mathutils.kdtree import KDTree
    kd=KDTree(n)
    for i,a in enumerate(samples[:-1]):kd.insert((a['p'][0],0,a['p'][2]),i)
    kd.balance()
    verts=[];faces=[];colors=[];steps=68;extent=420
    palettes={'neon':[(.075,.115,.15),(.12,.16,.18)],'coast':[(.35,.44,.28),(.68,.57,.38)],'ridge':[(.29,.39,.33),(.48,.53,.52)]}
    for iz in range(steps+1):
        z=-extent+2*extent*iz/steps
        for ix in range(steps+1):
            x=-extent+2*extent*ix/steps
            _,idx,d=kd.find((x,0,z));a=samples[idx];road_y=a['p'][1]
            signed=(x-a['p'][0])*a['n'][0]+(z-a['p'][2])*a['n'][2]
            noise=math.sin(x*.024)*math.cos(z*.019)+.4*math.sin(x*.063+z*.029)
            blend=max(0,min(1,(d-25)/30));blend=blend*blend*(3-2*blend)
            if key=='coast':
                base=(5+noise*4) if signed<0 else -6.5-noise
                if signed>0:blend=max(0,min(1,(d-8)/26));blend=blend*blend*(3-2*blend)
            elif key=='ridge':base=6+noise*12+12*math.sin(x*.008+1)*math.cos(z*.009)
            else:base=-.8+noise*.3
            y=(road_y-.22)*(1-blend)+base*blend
            verts.append((x,y,z))
            mix=max(0,min(1,(noise+1.2)/2.4))*.65
            if key=='coast' and signed>0:mix=max(mix,min(1,(d-8)/14))
            c1,c2=palettes[key];c=[c1[j]*(1-mix)+c2[j]*mix for j in range(3)]
            linear=lambda c:c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
            colors.append(tuple(linear(k) for k in c)+(1,))
            if ix and iz:
                b=iz*(steps+1)+ix;faces.append((b-steps-2,b-1,b,b-steps-1))
    terrain=mesh('Terrain',verts,faces,terrainmat,True)
    color=terrain.data.color_attributes.new(name='TerrainColor',type='FLOAT_COLOR',domain='POINT')
    for item,c in zip(color.data,colors):item.color=c
    node=terrainmat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='TerrainColor'
    terrainmat.node_tree.links.new(node.outputs['Color'],terrainmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    export(Path(f'assets/tracks/{key}.glb'))
    (ROOT/f'assets/tracks/{key}.json').write_text(json.dumps(s,separators=(',',':'),ensure_ascii=False)+'\n')

def make_props():
    clear()
    metal=material('Prop • satin steel','#344755',.6,.7)
    bark=material('Prop • bark','#695643',1)
    leaves=material('Prop • palm leaves','#48866a',.95)
    needles=material('Prop • pine needles','#345e5b',1)
    rock=material('Prop • limestone','#8c999a',1)
    concrete=material('Prop • concrete','#51616c',1)
    warm=material('Prop • warm windows','#ffd8a1',.65,.1,1.1)
    blue=material('Prop • cool windows','#62bddd',.55,.2,.85)
    white=material('Prop • ivory','#ddd7c0',.7)
    amber=material('Prop • lamp','#ffe1a6',.2,.1,3)
    def start():return set(bpy.context.scene.objects)
    def finish(before,name):
        o=join(list(set(bpy.context.scene.objects)-before),name)
        o['prototype']=True;return o
    before=start()
    cylinder('Palm trunk',(0,4.5,0),.26,9,bark,9)
    for i in range(9):
        angle=i*math.tau/9
        # Curving fronds with a central rib and widening silhouette.
        vs=[];fs=[]
        for j in range(6):
            r=j*.83;y=9.5+math.sin(j/5*math.pi)*.75-j*j*.09
            w=math.sin(j/5*math.pi)*.55
            for sign in [-1,1]:vs.append((math.cos(angle)*r+math.sin(angle)*w*sign,y,math.sin(angle)*r-math.cos(angle)*w*sign))
            if j:fs.append((2*j-2,2*j,2*j+1,2*j-1))
        mesh('Palm frond',vs,fs,leaves,True)
    finish(before,'Palm')
    before=start()
    cylinder('Pine trunk',(0,2.5,0),.18,5,bark,7)
    for y,r,h in [(3.0,2.0,4.4),(4.7,1.6,3.8),(6.3,1.05,3.1)]:cone('Pine branches',(0,y,0),r,0,h,needles,9)
    finish(before,'Pine')
    before=start()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=xyz((0,.8,0)))
    o=bpy.context.object;o.name='Weathered rock';o.scale=(2.6,1.9,1.8);o.data.materials.append(rock)
    for v in o.data.vertices:v.co*=.86+random.random()*.26
    finish(before,'Rock')
    before=start()
    box('Rail',(0,.91,0),(.13,.29,4.2),metal)
    box('Rail lower',(0,.63,0),(.10,.16,4.2),metal)
    for z in [-1.7,1.7]:box('Rail post',(0,.47,z),(.16,1.14,.15),metal)
    finish(before,'Guardrail')
    before=start()
    cylinder('Lamp pole',(0,4.25,0),.075,8.7,metal,8)
    box('Lamp arm',(.85,8.5,0),(1.8,.12,.14),metal,.03)
    box('Lamp housing',(1.55,8.48,0),(.92,.12,.41),metal,.03)
    box('Lamp emitter',(1.55,8.41,0),(.76,.023,.32),amber)
    finish(before,'Streetlamp')
    for index in range(3):
        before=start();w=[14,10,19][index];h=[43,69,30][index];d=[12,12,16][index]
        box('Tower',(0,h/2,0),(w,h,d),concrete,.15)
        box('Tower rooftop',(0,h+.7,0),(w*.6,1.4,d*.65),metal,.12)
        # Window strips, using only two emissive materials across all towers.
        for side in [-1,1]:
            for row in range(int(h//3.5)-1):
                for col in range(int(w//2.7)):
                    if random.random()<.28:continue
                    x=-w/2+1.5+col*2.6
                    y=3+row*3.5;z=side*(d/2+.016)
                    vs=[(x-.625,y-.775,z),(x+.625,y-.775,z),(x+.625,y+.775,z),(x-.625,y+.775,z)]
                    mesh('Window',vs,[(0,1,2,3) if side>0 else (3,2,1,0)],warm if (row+col)%3 else blue)
            for row in range(int(h//3.5)-1):
                for col in range(int(d//2.7)):
                    if random.random()<.4:continue
                    z=-d/2+1.5+col*2.6
                    x=side*(w/2+.016);y=3+row*3.5
                    vs=[(x,y-.775,z-.625),(x,y-.775,z+.625),(x,y+.775,z+.625),(x,y+.775,z-.625)]
                    mesh('Window side',vs,[(3,2,1,0) if side>0 else (0,1,2,3)],blue if col%2 else warm)
        finish(before,f'Building{index}')
    before=start()
    cylinder('Beacon base',(0,9,0),1.65,18,white,16)
    cylinder('Beacon red band',(0,12,0),1.70,2,material('Prop • terracotta','#dc755c',.8),16)
    cylinder('Beacon gallery',(0,18.3,0),2.5,.45,metal,16)
    cylinder('Beacon lantern',(0,19.7,0),1.5,2.5,blue,12)
    cone('Beacon roof',(0,21.6,0),2.4,0,1.5,metal,16)
    finish(before,'Lighthouse')
    before=start()
    box('Grandstand footing',(0,-.12,-1.6),(24,.4,5.5),concrete)
    for i in range(4):box('Grandstand tier',(0,.65+i*.6,-i*1.3),(24,.36,1.5),concrete,.06)
    for x in [-12.2,12.2]:box('Grandstand support',(x,1.55,-1.8),(.23,3.1,5.5),metal)
    finish(before,'Grandstand')
    export(Path('assets/tracks/props.glb'))

def make_crowd():
    clear()
    # One atlas, a true canonical 18-bone hierarchy, and deforming vertex weights.
    skin=material('Spectator • one atlas','#ffffff',.9)
    image=bpy.data.images.load(str(ROOT/'textures/spectator-atlas.png'))
    tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    skin.node_tree.links.new(tex.outputs['Color'],skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    armdata=bpy.data.armatures.new('Canonical 18');arm=bpy.data.objects.new('SpectatorRig',armdata)
    bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm
    arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    positions={};bones={}
    for b in CANON:
        p=Vector(b['restTranslationMeters'])+(positions[b['parent']] if b['parent'] else Vector((0,0,0)))
        positions[b['name']]=p
        e=armdata.edit_bones.new(b['name']);e.head=xyz(p);e.tail=xyz(p+Vector((0,.08,0)))
        if b['parent']:e.parent=bones[b['parent']]
        bones[b['name']]=e
    bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
    parts=[]
    def part(o,bone,tile):
        vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
        # Map every primitive into a safe swatch interior. The same atlas contains all colors.
        layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for uv in layer.data:uv.uv=(tile/8+.065,.5)
        parts.append(o)
    part(sphere('Head',(0,1.54,0),(.115,.15,.11),skin), 'Head',1)
    part(sphere('Hair',(0,1.64,-.018),(.119,.07,.111),skin),'Head',3)
    part(sphere('Torso',(0,1.15,0),(.19,.26,.105),skin),'Chest',0)
    part(sphere('Waist',(0,.89,0),(.15,.12,.10),skin),'Hips',4)
    for sign,side in [(1,'Left'),(-1,'Right')]:
        part(sphere('Upper arm',(sign*.205,1.16,0),(.065,.15,.065),skin),side+'Arm',0)
        part(sphere('Forearm',(sign*.205,.91,0),(.048,.14,.048),skin),side+'ForeArm',1)
        part(sphere('Hand',(sign*.205,.75,0),(.052,.065,.043),skin),side+'Hand',1)
        part(sphere('Thigh',(sign*.10,.67,0),(.075,.23,.077),skin),side+'UpLeg',4)
        part(sphere('Shin',(sign*.10,.29,0),(.058,.20,.060),skin),side+'Leg',4)
        part(box('Shoe',(sign*.10,.055,.055),(.14,.10,.25),skin,.025),side+'Foot',5)
    o=join(parts,'Spectator');o.parent=arm
    bpy.context.view_layer.objects.active=o
    simplify=o.modifiers.new('Crowd mobile LOD','DECIMATE');simplify.ratio=.18
    bpy.ops.object.modifier_apply(modifier=simplify.name)
    mod=o.modifiers.new('Canonical skin','ARMATURE');mod.object=arm
    o.parent=None
    # Export all 18 canonical nodes even where helper bones have no direct vertices.
    for b in CANON:
        if b['name'] not in o.vertex_groups:o.vertex_groups.new(name=b['name'])
    arm['canonicalSource']='motion2/soccer.json';arm['boneCount']=18
    export(Path('assets/crowd/spectator.glb'))

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    selected=args or ['cars','tracks','props','crowd']
    if 'original' in selected:
        USE_ORIGINAL=True
        SOURCE=Path(os.environ.get('RACING_SOURCE_GLB','/tmp/racing-v7-CarConcept.glb'))
        if not SOURCE.exists():raise FileNotFoundError('Download the attributed CarConcept source first; see source/README.md')
    if 'cars' in selected:
        for s in CAR_SPECS:
            chosen=[c['id'] for c in CAR_SPECS if c['id'] in selected]
            if chosen and s['id'] not in chosen:continue
            for lod in range(3):make_car(s,lod)
        (ROOT/'assets/cars/catalog.json').write_text(json.dumps(CAR_SPECS,indent=2,ensure_ascii=False)+'\n')
        (ROOT/'source/car-provenance.json').write_text(json.dumps({'sourceFile':SOURCE.name,'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceURL':'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept','license':'CC-BY-4.0','directOriginal':USE_ORIGINAL,'excluded':'all non-Body meshes, wipers and hidden hood parts; no source textures exported','modifications':'body deformation per catalog, independent original wheel designs, neutral PBR materials, original aero additions, 3 geometry LODs, Draco compression'},indent=2)+'\n')
    if 'tracks' in selected:
        for key,s in TRACKS.items():make_track(key,s)
    if 'props' in selected:make_props()
    if 'crowd' in selected:make_crowd()
    print('RACING_V7_AUTHORING_DONE')
