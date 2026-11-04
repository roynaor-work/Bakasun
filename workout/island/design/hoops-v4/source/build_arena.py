"""Build original unbranded hoops-v4 arena, seated crowd, ball and regulation hoop.

Run: blender -b -t 6 --python workout/island/design/hoops-v4/source/build_arena.py
Models2 venue authoring is reused read-only. All outputs stay in hoops-v4/assets.
Coordinates in this source are Blender Z up, -Y forward; GLB is Y up, +Z forward.
"""
import hashlib, importlib.util, json, math, random, sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.dont_write_bytecode = True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
DESIGN=ROOT.parent
spec=importlib.util.spec_from_file_location('hoops_v4_venue_base',DESIGN/'models2/source/build.py')
base=importlib.util.module_from_spec(spec); spec.loader.exec_module(base)
OUT=ROOT/'assets'; OUT.mkdir(parents=True,exist_ok=True)
RNG=random.Random(20261102)
TEAM_COLORS={'home':'#D3543F','away':'#248C91'}

class Bulk:
    def __init__(self): self.vertices=[]; self.faces=[]; self.colors=[]; self.detail=1
    def add(self,vs,fs,color):
        offset=len(self.vertices)
        self.vertices.extend(vs); self.faces.extend(tuple(offset+j for j in f) for f in fs)
        self.colors.extend([color]*len(fs))
    def ellipsoid(self,p,r,color,segments=8,rings=5):
        if not self.detail: segments=min(segments,6); rings=min(rings,3)
        vs=[]
        for j in range(rings+1):
            lat=-math.pi/2+math.pi*j/rings
            for i in range(segments):
                a=math.tau*i/segments
                vs.append((p[0]+r[0]*math.cos(lat)*math.cos(a),p[1]+r[1]*math.cos(lat)*math.sin(a),p[2]+r[2]*math.sin(lat)))
        fs=[]
        for j in range(rings):
            for i in range(segments):
                k=j*segments+i; n=j*segments+(i+1)%segments
                if j==0: fs.append((k,n+segments,k+segments))
                elif j==rings-1: fs.append((k,n,k+segments))
                else: fs.append((k,n,n+segments,k+segments))
        self.add(vs,fs,color)
    def tube(self,a,b,r,color,r2=None,segments=6):
        if not self.detail: segments=4
        a,b=Vector(a),Vector(b); n=(b-a).normalized(); t=n.cross(Vector((.123,.345,.937))).normalized(); u=n.cross(t)
        vs=[]
        for p,radius in ((a,r),(b,r if r2 is None else r2)):
            vs.extend(p+radius*(t*math.cos(math.tau*i/segments)+u*math.sin(math.tau*i/segments)) for i in range(segments))
        fs=[tuple(range(segments-1,-1,-1)),tuple(range(segments,2*segments))]
        fs.extend((i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments))
        self.add(vs,fs,color)
    def finish(self,name): return base.mesh(name,self.vertices,self.faces,face_colors=self.colors)


def crowd():
    mesh=Bulk(); count=0; variants={'raised_arms':0,'clapping':0,'resting':0}
    skins=['#E4B38C','#C88D63','#9C6548','#714937','#B77A59','#EDC3A3']
    hair=['#241F20','#49382C','#745037','#C38B4F','#99938A']
    clothes=['#D3543F','#248C91','#EAC9A0','#D9E4E3','#43586B','#C59855']
    def fan(x,y,z,rotation,seed):
        nonlocal count
        rng=random.Random(seed); co,si=math.cos(rotation),math.sin(rotation)
        scale=rng.uniform(.91,1.07)
        def p(v):
            a,b,c=v; return (x+scale*(co*a-si*b),y+scale*(si*a+co*b),z+scale*c)
        def ball(loc,r,color,**kw): mesh.ellipsoid(p(loc),tuple(scale*t for t in r),color,**kw)
        def limb(a,b,r,color,r2=None): mesh.tube(p(a),p(b),scale*r,color,None if r2 is None else scale*r2)
        skin=rng.choice(skins); h=rng.choice(hair); shirt=clothes[(seed+seed//5)%len(clothes)]
        trousers=rng.choice(['#283848','#3E4D5E','#666B6B']); shoe='#E4DDD2' if seed%3 else '#28313E'
        # Seat is at local .23m. Legs point inward toward the court (-Y).
        ball((0,-.015,.37),(.20,.13,.23),shirt,segments=8,rings=4)
        ball((0,-.02,.59),(.205,.135,.19),shirt,segments=8,rings=4)
        limb((0,-.025,.70),(0,-.025,.77),.062,skin)
        ball((0,-.025,.88),(.105,.095,.13),skin,segments=8,rings=5)
        ball((0,.002,.954),(.108,.092,.065),h,segments=8,rings=3)
        # Dark eyes remain visible at medium camera distance.
        for sx in (-1,1): ball((sx*.040,-.114,.899),(.012,.007,.012),'#251E1D',segments=4,rings=2)
        for sx in (-1,1):
            hip=(sx*.10,-.025,.31); knee=(sx*.11,-.36,.27); ankle=(sx*.115,-.38,.065-.04/scale)
            limb(hip,knee,.077,trousers,.064); limb(knee,ankle,.060,trousers,.046)
            ball((sx*.115,-.435,.045-.04/scale),(.071,.13,.045),shoe,segments=6,rings=3)
        pose=seed%11
        if pose in (0,1):
            variants['raised_arms']+=1
            for sx in (-1,1):
                shoulder=(sx*.18,0,.63); elbow=(sx*.32,-.015,.87); hand=(sx*.29,-.035,1.10)
                limb(shoulder,elbow,.057,shirt,.047); limb(elbow,hand,.042,skin,.032)
                ball(hand,(.04,.033,.055),skin,segments=6,rings=3)
        elif pose in (2,3,4):
            variants['clapping']+=1
            for sx in (-1,1):
                shoulder=(sx*.18,0,.63); elbow=(sx*.25,-.18,.48); hand=(sx*.04,-.32,.65)
                limb(shoulder,elbow,.057,shirt,.047); limb(elbow,hand,.042,skin,.032)
                ball(hand,(.04,.033,.055),skin,segments=6,rings=3)
        else:
            variants['resting']+=1
            for sx in (-1,1):
                shoulder=(sx*.18,0,.63); elbow=(sx*.24,-.09,.40); hand=(sx*.13,-.30,.34)
                limb(shoulder,elbow,.057,shirt,.047); limb(elbow,hand,.042,skin,.032)
                ball(hand,(.04,.033,.055),skin,segments=6,rings=3)
        count+=1
    for row in range(5):
        mesh.detail=1 if row<2 else 0
        x=11.5+row*1.15; y=17.45+row*1.15; z=.84+row*.85
        for sign in (-1,1):
            for i in range(-21,22):
                if abs(i)%11 not in (0,1) and RNG.random()>.17:
                    fan(sign*x,i*.67,z,-sign*math.pi/2,20261102+count*31)
            for i in range(-14,15):
                if abs(i)%10 not in (0,1) and RNG.random()>.17:
                    fan(i*.67,sign*y,z,0 if sign>0 else math.pi,20261102+count*31)
    obj=mesh.finish('seated_crowd'); obj['spectator_count']=count; obj['static_pose_variants']=list(variants)
    obj['stand_rows']=5; obj['row_step_m']=.85
    obj['skin_palette_count']=len(skins); obj['shirt_palette_count']=len(clothes)
    return {'spectators':count,'poses':variants,'skinColors':len(skins),'shirtColors':len(clothes),'geometry':'merged 3D bodies; no billboards or portraits','rows':5,'rowStepM':.85,'seatPlaneOffsetM':.23,'shoeSoleAboveRowM':0.0,'sideSeatOutwardCorrectionM':.40,'minimumShoeSupportInsetM':.04,'rearRowsReducedTessellation':True}


def correct_side_chairs():
    original=base.chair
    def inward(parts,x,y,z,color,rotation=0,scale=1):
        if abs(abs(rotation)-math.pi/2)<1e-6:
            rotation=-rotation
            if abs(x)>10.0: x+=math.copysign(.40,x)
        return original(parts,x,y,z,color,rotation,scale)
    base.chair=inward


def prepare_arena():
    correct_side_chairs(); base.arena()
    # Retire broad placeholder seat bands: individual seats and bodies now occupy these rows.
    base.remove('seating')
    # Color-only team identity matches the player kit palette.
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH': continue
        attr=obj.data.color_attributes.get('COLOR_0')
        if attr and obj.name in ('painted_keys','team_benches'):
            for poly in obj.data.polygons:
                world=obj.matrix_world@poly.center
                color=TEAM_COLORS['home' if world.y<0 else 'away']
                # recolor team zones, preserve dark scorer table and supporting beams.
                if obj.name=='painted_keys':
                    for li in poly.loop_indices: attr.data[li].color=base.rgba(color)
    arena_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in arena_meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=arena_meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for o in arena_meshes: o.data.update()
    base.bake_vertex_ao(arena_meshes,1.4)
    counts=crowd()
    base.anchor('anchor_court_center',(0,0,.035))
    for name,loc in [('east',(13.4,0,2.5)),('west',(-13.4,0,2.5)),('north',(0,19.75,2.5)),('south',(0,-19.75,2.5))]:
        a=base.anchor('anchor_stand_'+name,loc); a['row_count']=5; a['row_step_m']=.85
    for role,x in [('PG',-2.8),('SG',-1.4),('SF',0),('PF',1.4),('C',2.8)]:
        base.anchor('anchor_lineup_'+role,(x,0,.035))
    return counts


def prepare_ball():
    base.reset(); parts=[]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.1185)
    sphere=bpy.context.object; sphere.name='ball_leather'
    base.paint(sphere,'#CE6A2B')
    for poly in sphere.data.polygons: poly.use_smooth=True
    parts.append(sphere)
    # Four inset black great circles form recognisable basketball panels.
    for axis,angle in [('X',0),('Y',math.pi/2),('X',math.pi/2),('Y',math.pi/4)]:
        seam=base.ring('ball_seam',(0,0,0),.1184,.0016,'#2A211D',48,4)
        setattr(seam.rotation_euler,axis.lower(),angle); parts.append(seam)
    base.join('basketball',parts)
    base.anchor('anchor_ball_center',(0,0,0))
    return {'radiusM':.12,'diameterM':.24,'surface':'panelled orange basketball; seams are geometry; no image dependency'}


def prepare_hoop():
    base.reset(); parts=[]
    parts.append(base.box('basket_base',(0,3.275,.25),(1.2,1.7,.5),'#248C91',.10))
    parts.append(base.cylinder('basket_support',(0,3.275,.5),(0,3.275,4.2),.12,'navy'))
    parts.append(base.cylinder('basket_arm',(0,3.275,4.2),(0,.425,3.7),.10,'navy'))
    parts.append(base.box('backboard',(0,.425,3.675),(1.8,.1,1.05),'#EAE7D9',.025))
    for x in (-.30,.30): parts.append(base.box('backboard_target',(x,.36,3.36),(.035,.025,.45),'#D3543F'))
    for z in (3.15,3.58): parts.append(base.box('backboard_target',(0,.36,z),(.63,.025,.035),'#D3543F'))
    parts.append(base.ring('rim',(0,0,3.05),.244,.019,'#D3543F',40,6))
    for i in range(12):
        a=math.tau*i/12; b=a+math.pi/12
        parts.append(base.polyline('net_cord',[(.23*math.cos(a),.23*math.sin(a),3.032),(.15*math.cos(b),.15*math.sin(b),2.75),(.11*math.cos(a),.11*math.sin(a),2.60)],.005,'cream',4))
    for z,r in ((2.76,.15),(2.60,.11)): parts.append(base.ring('net_band',(0,0,z),r,.005,'cream',24,4))
    base.join('hoop_frame',parts)
    base.anchor('anchor_rim_center',(0,0,3.05)); base.anchor('anchor_mount',(0,3.275,0))
    return {'rimHeightM':3.05,'rimInnerDiameterM':.45,'backboardSizeM':[1.8,1.05],'facing':'+Z','rimCenter':[0,3.05,0]}


def export(name,details):
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    root=base.anchor('asset_root',(0,0,0)); root['asset_id']='hoops-v4-'+name; root['units']='metres'; root['license']='repository permissions; see LICENSES.md'; root['version']=4
    for o in list(bpy.context.scene.objects):
        if o!=root: o.parent=root
    bpy.context.scene.unit_settings.system='METRIC'; bpy.context.scene.unit_settings.scale_length=1
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    def gl(p): return [round(p[0],6),round(p[2],6),round(-p[1],6)]
    lo=[min(p[i] for p in points) for i in range(3)]; hi=[max(p[i] for p in points) for i in range(3)]
    anchors={o.name:gl(o.location) for o in bpy.context.scene.objects if o.type=='EMPTY' and o!=root}
    report={'id':name,'units':'metres','up':'+Y','forward':'+Z','details':details,
      'bounds':[[lo[0],lo[2],-hi[1]],[hi[0],hi[2],-lo[1]]],
      'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
      'meshes':len(meshes),'textures':0,'anchors':anchors,'objects':sorted(o.name for o in meshes)}
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,
      export_materials='EXPORT',export_vertex_color='MATERIAL',export_all_vertex_colors=True,
      export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False,export_extras=True)
    (OUT/(name+'.authoring.json')).write_text(json.dumps(report,indent=2)+'\n')
    print('EXPORTED',name,report['triangles'],(OUT/(name+'.glb')).stat().st_size,flush=True)
    return report


def main():
    reports={}
    for name,builder in [('arena',prepare_arena),('ball',prepare_ball),('hoop',prepare_hoop)]: reports[name]=export(name,builder())
    sources=['models2/source/build.py','models/source/common.py','models/source/venues.py']
    provenance={'package':'hoops-v4-arena','license':'repository permissions; no blanket CC0 grant','authoring':'Original repository venue geometry reused and extended; deterministic 3D spectators and ball/hoop original additions',
      'tools':{'Blender':bpy.app.version_string,'seed':20261102},
      'sources':[{ 'path':'../../'+p,'sha256':hashlib.sha256((DESIGN/p).read_bytes()).hexdigest()} for p in sources],
      'assets':reports,'compression':'Run source/compress_arena.mjs after authoring; Blender outputs are intermediates'}
    (OUT/'arena-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')

if __name__=='__main__': main()
