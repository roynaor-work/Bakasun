"""Original unbranded equipment; Blender 4.3; metres, Z up -> glTF Y up.
Run: blender -b --python source/build_equipment.py
Reference search: existing fire-v7 hydrant and Kenney asset catalog; no meshes copied.
"""
import bpy, math, json, struct
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'models'; OUT.mkdir(exist_ok=True)
META=[]

def mat(name,hexcode,metal=0,rough=.42):
    rgb=tuple(int(hexcode[i:i+2],16)/255 for i in (0,2,4))
    # Hex inputs are display sRGB; Blender nodes store scene linear.
    rgb=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def init(name):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions): bpy.data.actions.remove(action)
    global M, ROOT
    M={'red':mat('enamel_fire_red','C72F34',.25,.29),'darkred':mat('enamel_shadow','8C1F29',.2,.35),'black':mat('rubber_charcoal','202D38',0,.72),'steel':mat('satin_stainless','B9C6CA',.75,.25),'brass':mat('brass_coupling','D5AD62',.7,.3),'cream':mat('hose_ivory','E9DCC0',0,.8),'white':mat('label_cream','FCF8E9',0,.65),'blue':mat('powder_blue','267FB1',.1,.35),'orange':mat('safety_orange','EE8736',.1,.45),'green':mat('gauge_safe','6DA77B',0,.6),'cloth':mat('silica_blanket','F6E8C9',0,.95)}
    ROOT=empty(name)

def empty(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc
    if parent:o.parent=parent
    return o

def finish(o,name,material,parent=None):
    o.name=name
    if material:o.data.materials.append(M[material])
    if parent:o.parent=parent
    else:o.parent=ROOT
    return o

def box(name,loc,size,material='red',parent=None,bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('edge_highlights','BEVEL');mod.width=bevel;mod.segments=1
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('weighted_corner_normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,material,parent)

def cyl(name,loc,r,depth,material='steel',axis=(0,0,1),n=16,parent=None,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=depth,end_fill_type='NGON',location=loc)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(axis))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    # side polygons smooth; caps flat
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return finish(o,name,material,parent)

def tube(name,points,r=.018,material='black',parent=None,resolution=5):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=r;data.bevel_resolution=1;data.resolution_u=1
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False)
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,material,parent)

def ring(name,loc,r,minor=.009,material='steel',axis=(0,0,1),parent=None,n=16):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=6,location=loc,major_radius=r,minor_radius=minor)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(axis))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,material,parent)

def text(name,s,loc,size=.06,material='white',parent=None):
    c=bpy.data.curves.new(name,'FONT');c.body=s;c.align_x='CENTER';c.align_y='CENTER';c.size=size;c.extrude=.0002
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object,name,material,parent)

def action(o,prop,keys):
    # Reuse one action per node: all channels must belong to the same use track.
    prior=o.animation_data.nla_tracks.get('use') if o.animation_data else None
    if prior:o.animation_data.action=prior.strips[0].action
    for frame,val in keys:
        setattr(o,prop,val);o.keyframe_insert(data_path=prop,frame=frame)
    a=o.animation_data.action;a.name='use_'+o.name
    for fc in a.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
    if not prior:
        t=o.animation_data.nla_tracks.new();t.name='use';t.strips.new(a.name,int(a.frame_range[0]),a)
    o.animation_data.action=None

def export(name,description,attachments,dimensions):
    bpy.context.scene.render.fps=24;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=49;bpy.context.scene.frame_set(1)
    for o in bpy.context.scene.objects:
        if o.type=='MESH':
            bpy.context.view_layer.objects.active=o
            mod=o.modifiers.new('triangulate','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
            # Material geometry is intentionally UV-free; remove unused loop UVs.
            for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=True,export_extras=True,export_cameras=False,export_lights=False,export_texcoords=False,export_normals=True,export_materials='EXPORT')
    b=(OUT/(name+'.glb')).read_bytes();jlen=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jlen]);tri=sum(g['accessors'][p['indices']]['count']//3 for n in g['nodes'] if 'mesh' in n for p in g['meshes'][n['mesh']]['primitives'])
    clips=[x['name'] for x in g.get('animations',[])];assert clips==['use'],clips
    def measured_bounds(frame):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        pts=[o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
        lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
        # glTF export rotates (x,y,z) -> (x,z,-y).
        return {'min':[round(lo[0],6),round(lo[2],6),round(-hi[1],6)],'max':[round(hi[0],6),round(hi[2],6),round(-lo[1],6)]}
    rest=measured_bounds(1);deployed=measured_bounds(49)
    dimensions=[round(b-a,6) for a,b in zip(rest['min'],rest['max'])]
    META.append({'id':name,'path':'models/'+name+'.glb','description':description,'triangles':tri,'bytes':len(b),'animations':clips,'durationSeconds':2,'dimensionsMeters':dimensions,'restBoundsMeters':rest,'useEndBoundsMeters':deployed,'attachments':attachments,'coordinates':'+Y up, +Z front; origin at base center','use':'Play use once, clamp final pose; reset mixer to initial pose before next use.'})

def extinguisher(kind):
    name='extinguisher-'+kind;init(name)
    label='blue' if kind=='powder' else 'cream'
    # spun-steel pressure body: foot, cylindrical shell, shouldered crown.
    cyl('rubber_foot',(0,0,.035),.137,.07,'black',n=20)
    cyl('pressure_shell',(0,0,.325),.133,.52,'red',n=24)
    cyl('domed_shoulder',(0,0,.615),.133,.09,'red',r2=.055,n=24)
    ring('rolled_bottom_seam',(0,0,.082),.13,.006,'darkred',n=24)
    ring('shoulder_seam',(0,0,.585),.132,.004,'darkred',n=24)
    cyl('neck',(0,0,.681),.035,.048,'brass')
    box('agent_label',(0,-.133,.36),(.155,.008,.24),label,bevel=.006)
    box('label_header',(0,-.14,.445),(.145,.003,.025),'white',bevel=0)
    text('agent_letter','P' if kind=='powder' else 'F',(0,-.14,.38),.105,'white' if kind=='powder' else 'red')
    for z,w in [(.295,.11),(.275,.085)]:box('instruction_stripe',(0,-.14,z),(w,.003,.008),'white' if kind=='powder' else 'darkred',bevel=0)
    cyl('valve',(0,0,.715),.035,.04,'brass',n=12)
    tube('fixed_handle',[(-.055,0,.735),(-.06,0,.79),(.11,0,.79),(.125,0,.752)],.013,'black')
    squeeze=empty('squeeze_lever',(0,0,.747),ROOT)
    box('trigger',(0.065,0,.038),(.17,.026,.015),'steel',squeeze,bevel=.004)
    action(squeeze,'rotation_euler',[(1,(0,0,0)),(9,(0,.22,0)),(39,(0,.22,0)),(49,(0,0,0))])
    # Pressure gauge faces player; safe green sector with needle.
    cyl('gauge_brass',(0,-.064,.708),.034,.03,'brass',axis=(0,-1,0),n=20)
    cyl('gauge_face',(0,-.081,.708),.028,.003,'white',axis=(0,-1,0),n=20)
    box('gauge_safe_band',(.009,-.084,.72),(.025,.002,.008),'green',bevel=0)
    needle=box('gauge_needle',(0,-.086,.715),(.003,.002,.026),'black',bevel=0);needle.rotation_euler[1]=-.5
    ring('pull_pin',(-.046,0,.726),.022,.004,'orange',axis=(0,1,0),n=12)
    tube('flexible_hose',[(.028,.02,.716),(.14,.02,.72),(.195,.015,.665),(.206,.01,.54),(.202,0,.38),(.184,-.02,.26)],.014,'black')
    cyl('hose_coupling',(.03,.018,.715),.023,.045,'brass',axis=(1,0,0))
    nozzle=empty('nozzle_use',(.18,-.02,.245),ROOT)
    cyl('discharge_nozzle',(0,0,-.04),.025,.11,'black',n=12,parent=nozzle,r2=.018 if kind=='powder' else .033)
    ring('nozzle_band',(0,0,-.095),.025,.004,'brass',parent=nozzle,n=12)
    empty('spray_origin',(0,0,-.105),nozzle).rotation_euler[0]=math.pi/2
    action(nozzle,'rotation_euler',[(1,(0,0,0)),(13,(-math.pi/2,0,.15)),(39,(-math.pi/2,0,.15)),(49,(0,0,0))])
    export(name,'Portable '+kind+' extinguisher with pressure gauge, safety pin, squeeze lever and deployable nozzle.',['spray_origin'],[.425,.285,.81])

def hose():
    init('wall-hose')
    box('cabinet_back',(0,.115,.55),(.92,.055,1.1),'darkred',bevel=.018)
    for x in [-.45,.45]:box('cabinet_side',(x,0,.55),(.035,.25,1.1),'red')
    for z in [.016,1.084]:box('cabinet_ledge',(0,0,z),(.9,.25,.035),'red')
    # Reel support and a helical hose visible through the open center.
    box('reel_axle_bracket',(0,.04,.57),(.15,.08,.45),'steel')
    reel=empty('reel_rotation',(0,-.025,.6),ROOT)
    for y in [-.045,.045]:
        cyl('reel_flange',(0,y,0),.34,.015,'red',axis=(0,1,0),n=24,parent=reel)
    points=[]
    for i in range(145):
        a=i/144*math.pi*8;r=.095+.205*i/144
        points.append((math.cos(a)*r,-.063,math.sin(a)*r))
    tube('coiled_hose',points,.023,'cream',reel)
    cyl('reel_hub',(0,-.102,0),.065,.06,'brass',axis=(0,1,0),parent=reel)
    for a in [0,math.pi*2/3,math.pi*4/3]:
        box('reel_hub_spoke',(math.sin(a)*.038,-.136,math.cos(a)*.038),(.014,.01,.065),'steel',reel,bevel=.002)
    action(reel,'rotation_euler',[(1,(0,0,0)),(13,(0,0,0)),(49,(0,math.pi*4,0))])
    door=empty('cabinet_door_hinge',(-.445,-.145,.015),ROOT)
    # Open center frame with latch, realistic handle and instruction plate.
    for x in [0,.875]:box('door_vertical',(x,0,.535),(.026,.025,1.06),'red',door)
    for z in [0,1.07]:box('door_horizontal',(.438,0,z),(.9,.025,.03),'red',door)
    box('door_plaque',(.438,-.016,.95),(.34,.01,.12),'white',door)
    text('door_label','HOSE',(.438,-.025,.95),.077,'red',door)
    box('door_pull',(.825,-.035,.55),(.018,.05,.13),'steel',door)
    action(door,'rotation_euler',[(1,(0,0,0)),(13,(0,0,-math.pi*.62)),(49,(0,0,-math.pi*.62))])
    # Deploy nozzle together with a visible straightening hose length.
    nozzle=empty('hose_nozzle',(.355,-.06,.22),ROOT)
    cyl('nozzle_grip',(0,0,.07),.036,.16,'black',parent=nozzle)
    cyl('nozzle_body',(0,0,.18),.042,.08,'brass',r2=.025,parent=nozzle)
    ring('nozzle_valve_handle',(0,0,.11),.05,.007,'red',axis=(0,1,0),parent=nozzle,n=12)
    empty('spray_origin',(0,0,.23),nozzle).rotation_euler[0]=-math.pi/2
    action(nozzle,'location',[(1,(.355,-.06,.22)),(13,(.36,-.12,.3)),(49,(.36,-.85,.36))])
    action(nozzle,'rotation_euler',[(1,(0,0,0)),(13,(math.pi/2,0,0)),(49,(math.pi/2,0,0))])
    deployed=empty('unreeled_hose',(.32,-.1,.2),ROOT)
    tube('hose_deployment',[(0,0,0),(.03,-.2,.025),(.04,-.45,.08),(.04,-.75,.16)],.022,'cream',deployed)
    action(deployed,'scale',[(1,(1,.01,1)),(13,(1,.1,1)),(49,(1,1,1))])
    export('wall-hose','Wall-mounted cabinet, framed hinge door, coiled hose reel and deployable brass nozzle.',['spray_origin'],[.94,.28,1.12])

def hydrant():
    init('hydrant')
    cyl('anchor_flange',(0,0,.035),.225,.07,'black',n=20)
    cyl('base_casting',(0,0,.115),.178,.14,'red',n=20)
    cyl('standpipe',(0,0,.4),.135,.5,'red',n=20)
    for z in [.205,.58]:ring('cast_body_seam',(0,0,z),.136,.009,'darkred',n=20)
    cyl('head',(0,0,.65),.168,.1,'red',n=20)
    cyl('domed_bonnet',(0,0,.735),.168,.1,'red',r2=.075,n=20)
    for a in range(6):
        ang=a*math.pi/3
        cyl('flange_bolt',(math.sin(ang)*.186,math.cos(ang)*.186,.08),.016,.023,'steel',n=6)
    for side in [-1,1]:
        cyl('side_outlet',(side*.166,0,.47),.071,.125,'red',axis=(1,0,0),n=16)
        cyl('side_cap',(side*.235,0,.47),.081,.035,'brass',axis=(1,0,0),n=12)
        cyl('cap_hex',(side*.26,0,.47),.025,.02,'steel',axis=(1,0,0),n=6)
        tube('cap_chain',[(side*.23,-.055,.47),(side*.25,-.08,.37),(side*.18,-.07,.29),(side*.13,-.045,.36)],.005,'steel')
    cyl('front_outlet',(0,-.151,.39),.093,.12,'red',axis=(0,1,0),n=20)
    cap=empty('front_cap',(0,-.225,.39),ROOT)
    cyl('coupling_cap',(0,0,0),.102,.045,'brass',axis=(0,1,0),n=16,parent=cap)
    cyl('coupling_hex',(0,-.03,0),.034,.025,'steel',axis=(0,1,0),n=6,parent=cap)
    action(cap,'location',[(1,(0,-.225,.39)),(9,(0,-.225,.39)),(25,(0,-.31,.39)),(49,(.18,-.31,.19))])
    action(cap,'rotation_euler',[(1,(0,0,0)),(9,(0,math.pi*2,0)),(25,(0,math.pi*4,0)),(49,(0,math.pi*4,.7))])
    valve=empty('valve_rotation',(0,0,.8),ROOT)
    cyl('valve_spindle',(0,0,0),.022,.055,'brass',n=8,parent=valve)
    cyl('valve_operating_nut',(0,0,.033),.03,.025,'steel',n=5,parent=valve)
    box('operating_wrench',(.045,0,.04),(.16,.018,.02),'steel',valve)
    action(valve,'rotation_euler',[(1,(0,0,0)),(25,(0,0,0)),(49,(0,0,math.pi*4))])
    empty('hose_outlet',(0,-.24,.39),ROOT)
    text('hydrant_mark','H',(0,-.14,.62),.1,'white')
    export('hydrant','Cast hydrant with chained side caps, removable front coupling and rotating operating wrench.',['hose_outlet'],[.54,.39,.85])

def blanket():
    init('fire-blanket')
    # Wall pouch sits left of blanket; a physical unfolding cloth with stitched border.
    box('storage_pouch',(0,.02,.29),(.3,.1,.58),'red',bevel=.025)
    box('pouch_lid',(0,-.042,.52),(.31,.018,.13),'darkred',bevel=.008)
    box('pouch_label',(0,-.045,.31),(.22,.008,.22),'white',bevel=.006)
    text('pouch_symbol','F',(0,-.052,.33),.14,'red')
    for x in [-.08,.08]:box('pull_tape',(x,-.056,.06),(.025,.014,.17),'black',bevel=.003)
    cloth=empty('blanket_unfold',(0,-.08,1.0),ROOT)
    # Deliberately shallow waves rather than a rigid cube; no scale-zero at idle.
    verts=[];faces=[];nx,nz=12,14
    for j in range(nz+1):
        for i in range(nx+1):
            x=(i/nx-.5)*.95;z=-j/nz*1.2;y=math.sin(i/nx*math.pi*6)*.023*(.45+.55*j/nz)
            verts.append((x,y,z))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new('woven_sheet');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('woven_fire_blanket',mesh);bpy.context.collection.objects.link(o);finish(o,'woven_fire_blanket','cloth',cloth)
    o.data.materials[0].use_nodes=True;o.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.98;o.data.materials[0].use_backface_culling=False
    # Both sides render; no extension needed, glTF material doubleSided true.
    for x in [-.465,.465]:box('orange_edge_binding',(x,0,-.6),(.017,.018,1.2),'orange',cloth,bevel=0)
    for z in [-.006,-1.194]:box('orange_edge_binding',(0,0,z),(.95,.018,.017),'orange',cloth,bevel=0)
    for x in [-.34,.34]:
        tube('grip_loop',[(x-.045,0,.0),(x-.045,0,.075),(x+.045,0,.075),(x+.045,0,.0)],.008,'black',cloth)
        empty('grip_'+('left' if x<0 else 'right'),(x,0,.06),cloth)
    action(cloth,'scale',[(1,(.25,1,.12)),(9,(.55,1,.38)),(25,(1,1,1)),(49,(1,1,1))])
    action(cloth,'location',[(1,(0,-.08,.5)),(9,(.3,-.15,.85)),(25,(.62,-.2,1.3)),(49,(.62,-.6,.85))])
    action(cloth,'rotation_euler',[(1,(0,0,0)),(25,(0,0,0)),(49,(-math.pi/2,0,0))])
    empty('cover_origin',(0,0,-.6),cloth)
    export('fire-blanket','Fire-resistant blanket in red pull-tab pouch; unfolds to full size then covers a small fire.',['cover_origin','grip_left','grip_right'],[1.2,.3,1.3])

extinguisher('powder');extinguisher('foam');hose();hydrant();blanket()
(BASE/'source'/'equipment.json').write_text(json.dumps({'assets':META,'originalWork':True,'references':[{'type':'existing_repository_reference','path':'workout/island/design/fire-v7/models/hydrant.glb','copied':False},{'url':'https://kenney.nl/assets','result':'Catalog search unavailable through execution proxy; original authored equipment meshes, no third-party asset copied.'}]},indent=2)+'\n')
print(json.dumps(META,indent=2))
