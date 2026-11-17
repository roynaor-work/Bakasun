"""Original brandless aerial engine, metres; Blender 4.3, reproducible GLB.
References inspected: the repository's CC0 fire-truck-512 and fire-v7
engine-ladder source. No geometry or textures are copied from those assets.
Run: blender -b --python source/build_truck.py
"""
import bpy, math, json, struct
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for x in list(bpy.data.materials): bpy.data.materials.remove(x)
scene=bpy.context.scene; scene.render.fps=24
MAT={}
def material(name,color,metal=0,rough=.5,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    MAT[name]=m;return m
material('crimson_enamel',(.66,.018,.028),.28,.29)
material('deep_red',(.24,.008,.016),.25,.36)
material('silver_brushed',(.55,.62,.67),.78,.33)
material('silver_highlight',(.82,.89,.91),.75,.24)
material('gunmetal',(.052,.073,.086),.64,.4)
material('rubber',(.014,.019,.023),0,.88)
material('rubber_edge',(.032,.043,.05),0,.78)
material('glass',(.045,.19,.24),.4,.17)
material('glass_glint',(.36,.62,.66),.55,.21)
material('ivory',(.92,.94,.89),.12,.37)
material('safety_lime',(.91,.91,.12),.12,.41)
material('hose_canvas',(.55,.42,.25),0,.88)
material('hose_dark',(.075,.11,.12),0,.82)
material('lamp_white',(.87,.97,1),.05,.24,1.6)
material('lamp_amber',(1,.32,.025),.05,.3,.8)
material('lens_blue',(.025,.12,.56),.1,.23)
material('lens_red',(.58,.005,.014),.1,.23)
material('flash_blue',(.08,.53,1),0,.2,2.5)
material('flash_red',(1,.04,.025),0,.2,2.5)
BATCH={}
def empty(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=loc;o.parent=parent;return o
truck=empty('fire_truck');truck['asset_id']='fire-truck';truck['front']='+Z';truck['units']='metres';truck['legacy_model']=False
body=empty('body',parent=truck)
def mesh(name,verts,faces,mat,parent=body,smooth=False):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.parent=parent;o.data.materials.append(MAT[mat])
    if smooth:
        for p in d.polygons:p.use_smooth=True
    BATCH.setdefault(parent,[]).append(o);return o
def box(name,loc,dims,mat,parent=body,bevel=0):
    x,y,z=loc;a,b,c=[d/2 for d in dims]
    # Thin applied trim uses a single outward face instead of twelve hidden triangles.
    axis=min(range(3),key=lambda i:dims[i])
    if dims[axis]<=.03 and not bevel:
        if axis==0:
            xx=x+(a if x>=0 else -a);points=[(xx,y-b,z-c),(xx,y+b,z-c),(xx,y+b,z+c),(xx,y-b,z+c)]
            if x<0:points.reverse()
        elif axis==1:
            yy=y+(b if y>0 else -b);points=[(x-a,yy,z-c),(x-a,yy,z+c),(x+a,yy,z+c),(x+a,yy,z-c)]
            if y>0:points.reverse()
        else:
            zz=z+c;points=[(x-a,y-b,zz),(x+a,y-b,zz),(x+a,y+b,zz),(x-a,y+b,zz)]
        return mesh(name,points,[(0,1,2,3)],mat,parent)
    v=[(x+sx*a,y+sy*b,z+sz*c) for sx,sy,sz in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    f=[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
    o=mesh(name,v,f,mat,parent)
    if bevel:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        m=o.modifiers.new('edge_highlights','BEVEL');m.width=bevel;m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name);o.select_set(False)
    return o
def poly(name,pts,mat,parent=body):return mesh(name,pts,[tuple(range(len(pts)))],mat,parent)
def cylinder(name,a,b,r,mat,segments=10,parent=body,caps=True):
    a=Vector(a);b=Vector(b);n=(b-a).normalized();u=n.cross(Vector((0,0,1)))
    if u.length<.01:u=n.cross(Vector((0,1,0)))
    u.normalize();v=n.cross(u)
    vs=[tuple(p+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))) for p in [a,b] for i in range(segments)]
    fs=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    if caps:fs += [tuple(reversed(range(segments))),tuple(range(segments,segments*2))]
    return mesh(name,vs,fs,mat,parent)
def beam(name,a,b,w,mat,parent=body):
    a=Vector(a);b=Vector(b);n=(b-a).normalized();u=n.cross(Vector((0,0,1)))
    if u.length<.01:u=n.cross(Vector((0,1,0)))
    u.normalize();u*=w/2;v=n.cross(u)
    vs=[tuple(p+su*u+sv*v) for p in [a,b] for su,sv in [(-1,-1),(-1,1),(1,1),(1,-1)]]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent)
# Main chassis, carefully shaped semi-forward-control cab, and apparatus body.
box('chassis',(0,0,.67),(2.1,6.92,.29),'gunmetal',bevel=.045)
# x-extruded cab profile: hood, raked windscreen, long crew compartment.
yz=[(-3.58,.86),(-3.58,1.50),(-3.17,1.70),(-2.88,2.52),(-1.04,2.52),(-1.04,.86)]
v=[(x,y,z) for x in [-1.17,1.17] for y,z in yz];n=len(yz)
f=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh('sculpted_crew_cab',v,f,'crimson_enamel')
box('cab_roof',(0,-1.99,2.55),(2.34,1.92,.13),'deep_red',bevel=.05)
box('hood_lid',(0,-3.37,1.61),(2.25,.50,.10),'crimson_enamel',bevel=.035)
box('rear_apparatus',(0,1.18,1.72),(2.36,4.42,1.20),'crimson_enamel',bevel=.065)
box('rear_deck',(0,1.18,2.37),(2.39,4.44,.13),'gunmetal',bevel=.035)
# Split windshield lies on the raked front face.
for s in [-1,1]:
    x0=.045*s;x1=1.06*s
    poly('windshield_seal',[(x0,-3.165,1.735),(x1,-3.165,1.735),(x1,-2.914,2.445),(x0,-2.914,2.445)],'rubber')
    poly('windshield',[(x0+.035*s,-3.155,1.77),(x1-.035*s,-3.155,1.77),(x1-.035*s,-2.928,2.408),(x0+.035*s,-2.928,2.408)],'glass')
    poly('windshield_glint',[(s*.13,-2.948,2.366),(s*.94,-2.948,2.366),(s*.94,-2.932,2.408),(s*.13,-2.932,2.408)],'glass_glint')
    beam('wiper',(s*.20,-3.165,1.79),(s*.85,-3.105,1.95),.022,'gunmetal')
    # Front and crew windows, dark seals and purposeful door cuts.
    x=s*1.181
    for k,(ya,yb) in enumerate([(-2.99,-2.08),(-1.98,-1.23)]):
        ztop=2.425
        pts=[(x,ya,1.76),(x,yb,1.76),(x,yb,ztop),(x,ya+(.23 if k==0 else 0),ztop)]
        poly('side_window_seal',pts,'rubber')
        pts=[(x+s*.003,ya+.055,1.81),(x+s*.003,yb-.055,1.81),(x+s*.003,yb-.055,ztop-.055),(x+s*.003,ya+(.26 if k==0 else .055),ztop-.055)]
        poly('side_glass',pts,'glass')
        box('door_seam',(x,ya,1.36),(.012,.024,.65),'deep_red')
        box('door_handle',(x+s*.023,yb-.14,1.65),(.035,.19,.045),'silver_highlight')
    box('cab_ivory_stripe',(s*1.187,-2.10,1.51),(.024,1.92,.14),'ivory')
    box('cab_lime_stripe',(s*1.20,-2.10,1.34),(.022,1.92,.075),'safety_lime')
    # Mirrors, step plates, amber running lamps.
    beam('mirror_arm',(s*1.16,-2.95,2.08),(s*1.40,-3.02,2.08),.04,'gunmetal')
    box('mirror_housing',(s*1.43,-3.00,2.07),(.14,.13,.28),'gunmetal',bevel=.022)
    box('mirror_face',(s*1.43,-2.926,2.07),(.10,.018,.21),'silver_highlight')
    for z in [.60,.80]:box('crew_step',(s*1.22,-1.28,z),(.27,.51,.06),'silver_brushed')
# Nose: recess, grille, hood details, dual headlamps and brushed bumper.
box('front_grille',(0,-3.594,1.20),(1.05,.045,.37),'gunmetal',bevel=.025)
for z in [1.08,1.19,1.30]:box('grille_slat',(0,-3.625,z),(.96,.025,.035),'silver_brushed')
box('front_bumper',(0,-3.72,.82),(2.46,.28,.23),'silver_brushed',bevel=.045)
box('bumper_rubber',(0,-3.878,.85),(1.23,.025,.11),'rubber')
for s in [-1,1]:
    box('lamp_recess',(s*.86,-3.596,1.22),(.43,.045,.36),'gunmetal')
    for dx in [-.10,.10]:box('front_headlight',(s*.86+dx,-3.628,1.26),(.15,.026,.17),'lamp_white')
    box('front_indicator',(s*.86,-3.628,1.085),(.32,.026,.07),'lamp_amber')
    box('hood_corner',(s*1.08,-3.58,1.56),(.10,.035,.10),'lamp_amber')
# Lockers: silver shutter panels, recessed edges, pulls, stripe.
for s in [-1,1]:
    for i,y in enumerate([-.31,.99,2.38]):
        w=1.18 if i<2 else 1.40
        box('locker_recess',(s*1.194,y,1.73),(.025,w,1.02),'deep_red')
        box('locker_shutter',(s*1.213,y,1.75),(.028,w-.065,.92),'silver_brushed')
        for zz in [1.48,1.72,1.96]:box('shutter_rib',(s*1.232,y,zz),(.014,w-.09,.018),'gunmetal')
        box('locker_handle',(s*1.25,y,1.33),(.045,.32,.055),'gunmetal')
    box('body_lime_stripe',(s*1.211,1.18,2.226),(.025,4.28,.10),'safety_lime')
    for y in [-.84,.45,1.77,3.28]:box('side_marker',(s*1.231,y,1.12),(.025,.12,.055),'lamp_amber')
# Rear panel, reflective chevrons, lamps and access tread.
box('rear_bumper',(0,3.49,.83),(2.46,.25,.22),'silver_brushed',bevel=.035)
box('rear_step',(0,3.56,.95),(1.1,.40,.06),'gunmetal')
box('rear_dark_panel',(0,3.406,1.66),(1.86,.035,.93),'deep_red')
for s in [-1,1]:
    for j in range(3):
        x=s*(.19+j*.29);z=1.44+j*.15
        beam('reflective_chevron',(x,3.434,z),(x+s*.24,3.434,z+.13),.11,'safety_lime')
    for z,mat in [(1.32,'lens_red'),(1.57,'lamp_amber'),(1.82,'lamp_white')]:box('rear_lamp',(s*1.03,3.432,z),(.16,.028,.15),mat)
# Wheel assemblies: open alloy spoke ring + visibly shouldered tyres. Rolling pivots.
wheel_pivots=[]
for axle,y in enumerate([-2.45,1.36,2.57]):
    for s in [-1,1]:
        p=empty('wheel_'+str(axle)+'_'+('left' if s<0 else 'right'),(s*1.16,y,.50),truck);wheel_pivots.append(p)
        seg=12;profile=[(-.18,.33),(-.14,.50),(.14,.50),(.18,.33)]
        verts=[(xx,r*math.sin(i*math.tau/seg),r*math.cos(i*math.tau/seg)) for xx,r in profile for i in range(seg)]
        faces=[(j*seg+i,j*seg+(i+1)%seg,((j+1)%4)*seg+(i+1)%seg,((j+1)%4)*seg+i) for j in range(4) for i in range(seg)]
        mesh('all_terrain_tyre',verts,faces,'rubber',p)
        x=s*.186
        # An alloy face with six solid spokes and six dark apertures.
        for i in range(seg):
            a=i*math.tau/seg;b=(i+1)*math.tau/seg
            poly('alloy_spoke',[(x,0,0),(x,.325*math.sin(a),.325*math.cos(a)),(x,.325*math.sin(b),.325*math.cos(b))], 'silver_highlight' if i%2==0 else 'gunmetal',p)
        cylinder('hub',(s*.185,0,0),(s*.225,0,0),.13,'silver_brushed',segments=8,parent=p)
        # Fender lip, upper semicircle. Plane outer ring, deliberately open wheel well.
        vx=[]
        for r in [.535,.615]:
            vx += [(s*1.354,y+r*math.cos(i*math.pi/6),.50+r*math.sin(i*math.pi/6)) for i in range(7)]
        mesh('wheel_arch',vx,[(i,i+1,i+8,i+7) for i in range(6)],'gunmetal')
# Roof suction hoses with visible metallic couplings.
for x in [-.98,.98]:
    cylinder('suction_hose',(x,-.53,2.53),(x,2.98,2.53),.085,'hose_dark',segments=8)
    for y in [-.53,2.98]:cylinder('hose_coupling',(x,y-.06,2.53),(x,y+.06,2.53),.115,'silver_brushed',segments=8)
# Folded canvas hose beds at the rear; strap bands.
for x in [-.46,0,.46]:
    box('folded_hose',(x,1.10,2.52),(.32,2.5,.18),'hose_canvas')
    for y in [.15,1.95]:box('hose_strap',(x,y,2.62),(.34,.08,.025),'ivory')
# Visible pump control panel, pressure gauge, valves and outlet anchor.
box('pump_panel',(-1.274,-.43,1.72),(.07,.84,.69),'gunmetal')
cylinder('pressure_gauge',(-1.318,-.43,1.90),(-1.339,-.43,1.90),.12,'ivory',segments=12)
beam('gauge_needle',(-1.345,-.43,1.90),(-1.345,-.48,1.96),.014,'deep_red')
for y in [-.66,-.20]:
    cylinder('hose_socket',(-1.31,y,1.51),(-1.45,y,1.51),.075,'silver_brushed',segments=8)
    box('valve_handle',(-1.32,y,1.66),(.045,.17,.035),'crimson_enamel')
empty('hose_outlet',(-1.48,-.20,1.51),truck)
# Pivot base and real three-stage truss ladder: open rails, cross-rungs, diagonals.
cylinder('turntable',(0,2.44,2.44),(0,2.44,2.66),.57,'gunmetal',segments=12)
box('turntable_cap',(0,2.44,2.70),(1.17,.69,.14),'deep_red',bevel=.04)
ladder=empty('ladder_elevation',(0,2.44,2.80),truck)
cylinder('elevation_hinge',(-.65,0,0),(.65,0,0),.17,'silver_brushed',segments=10,parent=ladder)
stage1=empty('ladder_stage_1',(0,0,0),ladder)
stage2=empty('ladder_stage_2',(0,-.14,.13),stage1)
stage3=empty('ladder_stage_3',(0,-.14,.13),stage2)
for k,(stage,half,rungs) in enumerate([(stage1,.47,13),(stage2,.365,12),(stage3,.26,11)]):
    length=4.95-k*.10
    # Each side is a proper open frame. Outer stage includes triangulated webs.
    for s in [-1,1]:
        box('ladder_rail',(s*half,-length/2,0),(.065,length,.075),'silver_highlight',stage)
        if k<2:
            box('ladder_lower_rail',(s*half,-length/2,-.19),(.05,length,.05),'silver_brushed',stage)
            for j in range(5):
                y0=-.12-j*(length-.24)/5;y1=-.12-(j+1)*(length-.24)/5
                beam('truss_diagonal',(s*half,y0,-.19 if j%2==0 else 0),(s*half,y1,0 if j%2==0 else -.19),.025,'silver_brushed',stage)
    for j in range(rungs):
        y=-.16-j*(length-.32)/(rungs-1)
        box('ladder_rung',(0,y,.015),(2*half,.058,.055),'gunmetal',stage)
    # Guide shoes around the rails at the extension joints.
    if k<2:
        for s in [-1,1]:box('telescopic_guide',(s*half,-length+.10,-.045),(.13,.22,.19),'gunmetal',stage)
    else:
        for s in [-1,1]:box('tip_end_cap',(s*half,-length,.005),(.077,.10,.09),'deep_red',stage)
empty('ladder_tip',(0,-4.87,.29),stage3)
# A compact manual water monitor mounted at ladder tip, aligned with ladder axis.
beam('tip_monitor',(0,-4.55,.04),(0,-4.55,.29),.07,'deep_red',stage3)
cylinder('tip_nozzle',(0,-4.55,.29),(0,-4.87,.29),.055,'silver_brushed',segments=8,parent=stage3)
# Four retractable stabilizers support the aerial during use; feet reach ground.
outriggers=[]
for s in [-1,1]:
    for i,y in enumerate([-.67,2.98]):
        p=empty('outrigger_'+str(s)+'_'+str(i),(s*1.04,y,.57),truck);outriggers.append((p,s,y))
        box('stabilizer_beam',(0,0,.06),(.46,.24,.18),'silver_brushed',p)
        box('stabilizer_leg',(s*.21,0,-.12),(.12,.22,.38),'deep_red',p)
        box('stabilizer_foot',(s*.21,0,-.32),(.40,.34,.07),'gunmetal',p)
# Physical warning lenses stay in place; inner emissive chips pulse independently.
box('lightbar_mount',(0,-1.91,2.69),(1.87,.25,.10),'gunmetal',bevel=.025)
flashers=[]
for s in [-1,1]:
    box('beacon_lens',(s*.72,-1.91,2.81),(.40,.30,.19),'lens_blue' if s<0 else 'lens_red')
    p=empty('beacon_flash_'+str(s),(s*.72,-2.07,2.81),truck);flashers.append(p)
    box('beacon_emissive_chip',(0,0,0),(.28,.014,.11),'flash_blue' if s<0 else 'flash_red',p)
# Merge static parts by articulated parent, retaining useful stable hierarchy.
for parent,objects in list(BATCH.items()):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    joined=bpy.context.object;joined.name=parent.name+'_geometry';joined.parent=parent
# NLA tracks with matching names merge channels into the four specified glTF clips.
def clip(obj,name,keys,path):
    obj.animation_data_create();a=bpy.data.actions.new(name+'__'+obj.name);obj.animation_data.action=a
    for frame,val in keys:
        setattr(obj,path,val);obj.keyframe_insert(data_path=path,frame=frame)
    for f in a.fcurves:
        for k in f.keyframe_points:k.interpolation='LINEAR'
    obj.animation_data.action=None;t=obj.animation_data.nla_tracks.new();t.name=name
    t.strips.new(name,1,a);return a
for p in wheel_pivots:
    p.rotation_mode='XYZ';clip(p,'drive',[(1,(0,0,0)),(49,(math.tau*2,0,0))],'rotation_euler');p.rotation_euler=(0,0,0)
ladder.rotation_mode='XYZ'
for name,reverse in [('ladder_extend',False),('ladder_retract',True)]:
    angle=math.radians(-62)
    clip(ladder,name,[(1,(angle if reverse else 0,0,0)),(49,(angle,0,0)),(97,(0 if reverse else angle,0,0))],'rotation_euler')
    for p,delay in [(stage2,25),(stage3,49)]:
        rest=(0,-.14,.13);extended=(0,-3.54,.13)
        if reverse: keys=[(1,extended),(98-delay,rest),(97,rest)]
        else:keys=[(1,rest),(delay,rest),(97,extended)]
        clip(p,name,keys,'location');p.location=rest
ladder.rotation_euler=(0,0,0)
for p,s,y in outriggers:
    rest=(s*1.04,y,.57);deployed=(s*1.88,y,.355)
    clip(p,'ladder_extend',[(1,rest),(25,deployed),(97,deployed)],'location')
    clip(p,'ladder_retract',[(1,deployed),(73,deployed),(97,rest)],'location')
    p.location=rest
for i,p in enumerate(flashers):
    keys=[]
    for f in [1,3,5,7,9,11,13,15,17,19,21,23,25]:
        on=((f//2+i)%2)==0;keys.append((f,(1,1,1) if on else (.015,.015,.015)))
    a=clip(p,'lights',keys,'scale')
    for fc in a.fcurves:
        for k in fc.keyframe_points:k.interpolation='CONSTANT'
    p.scale=(1,1,1)
# Evaluate rest, then export only authored geometry with portable glTF core channels.
for o in bpy.data.objects:
    if o.animation_data:
        for t in o.animation_data.nla_tracks:t.mute=True
scene.frame_set(1);bpy.context.view_layer.update()
for o in bpy.data.objects:
    if o.animation_data:
        for t in o.animation_data.nla_tracks:t.mute=False
out=ROOT/'models/fire-truck.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_animations=True,
    export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_frame_range=False,export_anim_slide_to_zero=True,
    export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_extras=True,
    export_cameras=False,export_lights=False,export_texcoords=False,export_normals=True)
# Metadata is measured from final GLB, counting referenced mesh instances.
b=out.read_bytes();size=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+size])
# Blender evaluates overlapping NLA tracks for its node defaults; explicitly
# restore the portable stowed pose without altering any animation samples.
for node in g['nodes']:
    name=node.get('name','')
    if name=='ladder_elevation':node.pop('rotation',None)
    if name in ['ladder_stage_2','ladder_stage_3']:node['translation']=[0,.13,.14]
    if name.startswith('beacon_flash_'):node.pop('scale',None)
    if name.startswith('outrigger_') and not name.endswith('_geometry'):
        s=-1 if name.split('_')[1]=='-1' else 1;y=-.67 if name.endswith('_0') else 2.98
        node['translation']=[s*1.04,.57,-y]
js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
remaining=b[20+size:]
b=struct.pack('<III',0x46546c67,2,20+len(js)+len(remaining))+struct.pack('<II',len(js),0x4e4f534a)+js+remaining
out.write_bytes(b)
tri=0
for n in g['nodes']:
    if 'mesh' in n:
        for p in g['meshes'][n['mesh']]['primitives']:
            tri+=g['accessors'][p['indices']]['count']//3
info={'file':'models/fire-truck.glb','bytes':len(b),'triangles':tri,'clips':[a['name'] for a in g.get('animations',[])],
      'front':'+Z','up':'+Y','units':'metres','origin':'ground at wheel contact, centred on chassis',
      'attachments':['ladder_tip','hose_outlet'],'stabilizers':{'count':4,'deployment':'included in ladder_extend and ladder_retract'},'ladder':{'stages':3,'rungs':[13,12,11],'elevationDegrees':62,'extensionPerStageMeters':3.4},
      'animationNotes':{'drive':'2 s wheel-roll loop, in place; translate fire_truck along +Z at 3.14 m/s',
                        'ladder_extend':'4 s; raise base, then telescope overlapping nested truss stages',
                        'ladder_retract':'4 s inverse deployment; play once, clamp last frame',
                        'lights':'1 s alternating emissive chip visibility loop; opaque housings remain'},
      'provenance':'Original mesh and materials; existing repository truck assets inspected as references only; no copied geometry, textures or third-party marks.'}
(ROOT/'source/truck.json').write_text(json.dumps(info,indent=2)+'\n')
print('TRUCK_RESULT',json.dumps(info))
if not 2500<=tri<=3500:raise RuntimeError('Truck triangle budget failed: '+str(tri))
