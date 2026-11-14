"""Original low-poly chase kit. Run: blender -b -t 1 --python scripts/generate_environment.py

Author coordinates: metres, Y up, +Z travel; converted to Blender internally.
Style/palette informed by the repository's original CC0 fire-v7/source assets.
No copied external models, text, logos, textures, or dependencies beyond Blender.
Geometry, motion and source are CC0-1.0. Blender 4.3.2 glTF 2.0 exporter.
"""
from pathlib import Path
import bpy, bmesh, math, json, struct
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models'
OUT.mkdir(parents=True, exist_ok=True)
PALETTE = {
    'asphalt':'#48545B', 'grass':'#829C7A', 'curb':'#BFC4B6', 'line':'#E9E3CC',
    'steel':'#9DAEAE', 'dark':'#29383E', 'glass':'#294D61', 'rubber':'#202B30',
    'cream':'#E9E3CC', 'red':'#B82535', 'orange':'#E68944', 'yellow':'#E7BE6D',
    'teal':'#3D8585', 'blue':'#537A9D', 'plaster':'#C5AC8A', 'brick':'#A56D55',
    'roof':'#73524C', 'soot':'#4C4842', 'wood':'#98765A', 'lamp':'#FFE7A0',
    'flame':'#F66B2C', 'flameLight':'#FFBE4D', 'flameCore':'#FFE09A',
}

def convert(p): return (p[0], -p[2], p[1])
def linear(v): return v/12.92 if v < .04045 else ((v+.055)/1.055)**2.4

class Kit:
    def __init__(self,name):
        bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
        for data in list(bpy.data.meshes):
            if data.users == 0: bpy.data.meshes.remove(data)
        for data in list(bpy.data.materials):
            if data.users == 0: bpy.data.materials.remove(data)
        self.name=name; self.groups={}; self.parts={}; self.materials={}; self.anchors={};self.initially_hidden=[]
        bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=48;bpy.context.scene.render.fps=24
        self.root=self.group(name)
    def group(self,name,parent=None,at=(0,0,0)):
        o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
        o.parent=parent; o.location=convert(at); self.groups[name]=o
        return o
    def anchor(self,name,at,parent=None):
        self.anchors[name]=list(at)
        o=self.group(name,parent or self.root,at); o['role']='integration-anchor'; return o
    def material(self,key):
        if key in self.materials: return self.materials[key]
        h=PALETTE[key].lstrip('#'); c=[linear(int(h[i:i+2],16)/255) for i in (0,2,4)]
        m=bpy.data.materials.new(key); m.diffuse_color=(*c,1); m.use_nodes=True
        m.use_backface_culling=key!='glass'
        bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*c,1)
        bs.inputs['Roughness'].default_value=.80 if key not in ('steel','glass') else .36
        bs.inputs['Metallic'].default_value=.5 if key=='steel' else 0
        if key in ('lamp','flame','flameLight','flameCore'):
            bs.inputs['Emission Color'].default_value=(*c,1)
            bs.inputs['Emission Strength'].default_value=.8
        self.materials[key]=m; return m
    def mesh(self,verts,faces,mat,parent=None):
        parent=parent or self.root
        key=(parent.name,mat); bucket=self.parts.setdefault(key,[[],[]]); start=len(bucket[0])
        bucket[0].extend(convert(v) for v in verts)
        bucket[1].extend(tuple(start+i for i in f) for f in faces)
    def box(self,c,s,mat,parent=None):
        x,y,z=c; w,h,d=[v/2 for v in s]
        v=[(x+sx*w,y+sy*h,z+sz*d) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.mesh(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],mat,parent)
    def cylinder(self,a,b,r,mat,parent=None,n=10,r2=None):
        a=Vector(a); b=Vector(b); axis=(b-a).normalized()
        temp=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0))
        u=axis.cross(temp).normalized(); v=axis.cross(u).normalized(); verts=[]
        for center,rad in [(a,r),(b,r if r2 is None else r2)]:
            for i in range(n): verts.append(center+rad*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v))
        self.mesh(verts,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,parent)
    def strip(self,path,width,y,mat,parent=None,depth=.035,tangents=None):
        verts=[]
        for i,p in enumerate(path):
            tangent=Vector(tangents[i]) if tangents else Vector(path[min(i+1,len(path)-1)])-Vector(path[max(i-1,0)])
            tangent.normalize(); side=Vector((-tangent[1],tangent[0]))*width/2
            for yy in [y-depth,y]:
                for sign in [-1,1]: verts.append((p[0]+side[0]*sign,yy,p[1]+side[1]*sign))
        faces=[(0,2,3,1),(len(verts)-4,len(verts)-3,len(verts)-1,len(verts)-2)]
        for i in range(len(path)-1):
            a=i*4;b=(i+1)*4
            faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
        self.mesh(verts,faces,mat,parent)
    def prism_x(self,profile,width,mat,parent=None):
        n=len(profile); verts=[(sx*width/2,y,z) for sx in [-1,1] for y,z in profile]
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
        faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
        self.mesh(verts,faces,mat,parent)
    def finish(self,filename,extra=None):
        for (parent,mat),(verts,faces) in self.parts.items():
            mesh=bpy.data.meshes.new(parent+'_'+mat); mesh.from_pydata(verts,[],faces); mesh.update()
            bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
            o=bpy.data.objects.new(parent+'_'+mat,mesh);bpy.context.collection.objects.link(o)
            o.parent=self.groups[parent];o.data.materials.append(self.material(mat))
        bpy.context.scene.frame_set(0)
        bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',export_yup=True,export_normals=True,export_materials='EXPORT',export_animations=True,export_animation_mode='NLA_TRACKS',export_extras=True,export_cameras=False,export_lights=False)
        if self.initially_hidden:
            # Blender flattens a zero parent scale into every descendant on
            # export. Hide only the state-root glTF nodes after exporting all
            # transforms at identity, so setting that root to 1 really reveals
            # its complete subtree. Binary geometry and accessors stay intact.
            path=OUT/filename;data=path.read_bytes();json_size=struct.unpack_from('<I',data,12)[0]
            doc=json.loads(data[20:20+json_size])
            for node in doc['nodes']:
                if node.get('name') in self.initially_hidden:node['scale']=[0,0,0]
            encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
            rest=data[20+json_size:];length=20+len(encoded)+len(rest)
            path.write_bytes(struct.pack('<III',0x46546c67,2,length)+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+rest)
        triangles=0
        for o in bpy.context.scene.objects:
            if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
        spec={'file':'models/'+filename,'triangles':triangles,'anchors':self.anchors,'nodeNames':sorted(self.groups),'bytes':(OUT/filename).stat().st_size}
        if extra:spec.update(extra)
        return spec

def action_track(obj,name,keys):
    for frame,loc,yaw in keys:
        obj.location=convert(loc);obj.rotation_euler=(0,0,yaw)
        obj.keyframe_insert(data_path='location',frame=frame);obj.keyframe_insert(data_path='rotation_euler',frame=frame)
    act=obj.animation_data.action;act.name=name+'Action'
    for fc in act.fcurves:
        for kp in fc.keyframe_points:kp.interpolation='LINEAR'
    tr=obj.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,0,act)
    obj.animation_data.action=None

def road(kind):
    k=Kit('Road'+kind.title());k.box((0,-.13,0),(6,.22,6),'grass')
    if kind in ('right','left'):
        sign=1 if kind=='right' else -1
        angles=[i*math.pi/32 for i in range(17)]
        path=[(sign*(3-3*math.cos(a)),-3+3*math.sin(a)) for a in angles]
        tangents=[(sign*math.sin(a),math.cos(a)) for a in angles]
        k.strip(path,5.2,0,'asphalt',tangents=tangents)
        for offset in [-2.64,2.64]:
            r=3+offset
            curb=[(sign*(3-r*math.cos(a)),-3+r*math.sin(a)) for a in [i*math.pi/32 for i in range(17)]]
            k.strip(curb,.10,.075,'curb',depth=.12,tangents=tangents)
        for i in range(0,16,4):k.strip(path[i:i+3],.075,.008,'line',depth=.006)
        ports={'in':[0,0,-3],'out':[sign*3,0,0]};length=3*math.pi/2
    else:
        k.box((0,-.02,0),(5.2,.04,6),'asphalt')
        if kind=='cross':k.box((0,-.015,0),(6,.03,5.2),'asphalt')
        for side in [-1,1]:
            if kind=='cross':
                for end in [-1,1]:k.box((side*2.66,.04,end*2.84),(.12,.12,.32),'curb')
            else:k.box((side*2.66,.04,0),(.12,.12,6),'curb')
        for z in [-2.5,-.9,.9,2.5]:
            if kind!='cross' or abs(z)>2:k.box((0,.006,z),(.075,.012,.7),'line')
        if kind=='cross':
            for x in [-2.5,2.5]:k.box((x,.009,0),(.7,.012,.075),'line')
            for z in [-2.3,2.3]:
                for x in [-1.95,-1.35,-.75,.75,1.35,1.95]:k.box((x,.01,z),(.3,.012,.42),'line')
        if kind=='bridge':
            k.box((0,-.31,0),(5.85,.34,6),'steel')
            for side in [-1,1]:
                for y in [.42,.86]:k.box((side*2.8,y,0),(.12,.09,6),'steel')
                for z in [-2.8,-1.4,0,1.4,2.8]:k.box((side*2.8,.45,z),(.12,.9,.12),'dark')
                for z in [-2.1,2.1]:k.box((side*2.1,-1.1,z),(.45,1.6,.6),'curb')
        if kind=='tunnel':
            for label,z,depth in [('PortalFront',-2.8,.4),('PortalBack',2.8,.4),('TunnelRoof',0,5.2)]:
                g=k.group(label,k.root);verts=[];n=16
                for zz in [z-depth/2,z+depth/2]:
                    for rad in [2.78,3.0]:
                        for i in range(n+1):
                            a=i*math.pi/n;verts.append((rad*math.cos(a),1.1+rad*math.sin(a),zz))
                p=n+1;faces=[]
                for i in range(n):faces.extend([(i,i+1,p+i+1,p+i),(2*p+i,3*p+i,3*p+i+1,2*p+i+1),(i,2*p+i,2*p+i+1,i+1),(p+i,p+i+1,3*p+i+1,3*p+i)])
                faces.extend([(0,p,3*p,2*p),(p-1,3*p-1,4*p-1,2*p-1)])
                k.mesh(verts,faces,'curb' if label!='TunnelRoof' else 'dark',g)
                for side in [-1,1]:k.box((side*2.9,.55,z),(.24,1.1,depth),'curb',g)
            for side in [-1,1]:
                for z in [-2.3,0,2.3]:k.box((side*2.65,1.5,z),(.12,.18,.36),'lamp')
        ports={'in':[0,0,-3],'out':[0,0,3]};length=6
        if kind=='cross':ports.update(left=[-3,0,0],right=[3,0,0])
    k.anchor('PortIn',ports['in']);k.anchor('PortOut',ports['out'])
    return k.finish('road-'+kind+'.glb',{'ports':ports,'roadWidth':5.2,'laneCenters':[-1.3,1.3],'centerlineLength':length,'surfaceY':0})

def civilian(kind,color):
    k=Kit('CivilianRoot');specs={'hatch':(1.48,3.25,1.32),'sedan':(1.58,3.85,1.27),'van':(1.66,3.9,1.92),'compact':(1.36,2.75,1.40)}
    w,d,h=specs[kind];wheelr=.31 if kind!='van' else .34
    k.box((0,.39,0),(w*.89,.23,d*.91),'dark')
    # Distinct car profiles, with sloped bonnets and window pillars.
    k.prism_x([(.42,-d*.5),(.78,-d*.5),(.91,-d*.37),(.94,d*.37),(.78,d*.5),(.42,d*.5)],w,color)
    if kind=='sedan':cabin=[(.91,-.95),(h,-.56),(h,.55),(.91,1.03)]
    elif kind=='van':cabin=[(.9,-1.75),(h,-1.75),(h,1.0),(.98,1.7)]
    elif kind=='compact':cabin=[(.86,-1.02),(h,-.68),(h,.49),(.9,.91)]
    else:cabin=[(.9,-1.29),(h,-1.04),(h,.48),(.94,.95)]
    k.prism_x(cabin,w*.92,color)
    # Side glass as inset faceted quadrilateral patches, avoiding opaque blockers.
    lowz=cabin[0][1];highz=cabin[-1][1];rearTop=cabin[1][1];frontTop=cabin[2][1]
    for side in [-1,1]:
        x=side*(w*.46+.008)
        k.mesh([(x,.99,lowz+.14),(x,h-.10,rearTop+.08),(x,h-.10,frontTop-.08),(x,1.0,highz-.14)],[(0,1,2,3)],'glass')
        k.box((side*(w*.46+.012),(h+1)/2,-.11),(.025,h-1+.04,.055),color)
        k.box((side*(w*.50+.025),.94,-.30),(.04,.045,.18),'steel')
        k.box((side*(w*.53),1.02,.73),(.12,.13,.18),color)
    # Windscreen / rear window follow the profile angle and remain text-free.
    for i in [0,2]:
        (ya,za),(yb,zb)=cabin[i],cabin[i+1]
        k.mesh([(-w*.39,ya+.035,za-.008 if i==0 else za+.008),(w*.39,ya+.035,za-.008 if i==0 else za+.008),(w*.39,yb-.035,zb-.008 if i==0 else zb+.008),(-w*.39,yb-.035,zb-.008 if i==0 else zb+.008)],[(0,1,2,3)],'glass')
    for front in [-1,1]:
        z=front*(d*.5+.012);k.box((0,.45,z),(w*.95,.12,.08),'steel')
        for side in [-1,1]:k.box((side*w*.34,.72,z+front*.035),(w*.22,.17,.03),'lamp' if front==1 else 'red')
    for front in [-1,1]:
        for side in [-1,1]:
            name='Wheel'+('Front' if front==1 else 'Rear')+('Left' if side==-1 else 'Right')
            g=k.group(name,k.root,(side*w*.48,wheelr,front*d*.31))
            k.cylinder((-.13,0,0),(.13,0,0),wheelr,'rubber',g,n=12)
            k.cylinder((side*.135,0,0),(side*.15,0,0),wheelr*.57,'steel',g,n=8)
            k.box((side*.157,0,0),(.018,wheelr*.75,.07),'dark',g)
    # Wrapper motion can continue forward independently while this local root yields.
    action_track(k.root,'YieldRight',[(0,(0,0,0),0),(12,(.34,0,0),.12),(29,(1.1,0,0),0),(48,(1.1,0,0),0)])
    return k.finish('car-'+kind+'.glb',{'dimensions':[w,h,d],'wheelRadius':wheelr,'animation':{'name':'YieldRight','duration':2,'translation':[1.1,0,0],'finish':'hold last frame; reverse to return'},'axis':'+Z forward'})

def cone():
    k=Kit('ConeRoot');k.box((0,.045,0),(.49,.09,.49),'rubber')
    for lo,hi,rlo,rhi,mat in [(.09,.26,.19,.14,'orange'),(.26,.36,.14,.111,'cream'),(.36,.59,.111,.018,'orange')]:k.cylinder((0,lo,0),(0,hi,0),rlo,mat,n=8,r2=rhi)
    return k.finish('cone.glb')

def lamp():
    k=Kit('StreetLampRoot');k.box((0,.12,0),(.46,.24,.46),'curb')
    k.cylinder((0,.24,0),(0,4.8,0),.075,'steel',n=8,r2=.045)
    k.cylinder((0,4.8,0),(.9,4.8,0),.055,'steel',n=8)
    k.box((.87,4.77,0),(.65,.17,.31),'dark');k.box((.87,4.67,0),(.52,.035,.24),'lamp')
    k.anchor('LightAnchor',(.87,4.62,0));return k.finish('street-lamp.glb')

def flame(k,parent,center,size,mat,phase):
    # Height exceeds widest diameter by 2:1: a thin pointed tongue rather
    # than an opaque bulb. The asymmetric rising spine bends into the tip.
    verts=[];n=7;rings=[(0,.18,0),(.15,.25,.025),(.40,.205,-.015),(.66,.12,.055),(.85,.05,.125),(1,.004,.17)]
    for j,(y,r,lean) in enumerate(rings):
        for i in range(n):
            a=i*math.tau/n+phase
            verts.append((center[0]+size*(math.cos(a)*r+lean),center[1]+size*y,center[2]+size*math.sin(a)*r*.65))
    faces=[tuple(range(n-1,-1,-1)),tuple(range((len(rings)-1)*n,len(rings)*n))]
    for j in range(len(rings)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    k.mesh(verts,faces,mat,parent)

def house():
    k=Kit('BurningHouseRoot');front=k.group('CutawayFront',k.root);roof=k.group('Roof',k.root)
    k.box((0,.08,0),(7.4,.16,6.5),'curb');k.box((0,.175,0),(6.95,.03,6.12),'wood')
    # Real hollow room with unobstructed door aperture; front can be hidden for entry.
    for side in [-1,1]:k.box((side*3.4,1.98,0),(.22,3.64,6.2),'brick')
    k.box((0,1.98,3.0),(6.8,3.64,.22),'plaster')
    for side in [-1,1]:k.box((side*2.13,1.98,-3.0),(2.54,3.64,.22),'plaster',front)
    k.box((0,3.13,-3.0),(1.72,1.34,.22),'plaster',front)
    for side in [-1,1]:k.box((side*.82,1.32,-3.15),(.13,2.32,.17),'cream',front)
    k.box((0,2.5,-3.15),(1.77,.14,.17),'cream',front)
    # Deep open doorway and a hinged door resting open against the inner wall.
    door=k.group('DoorHinge',k.root,(-.73,.18,-2.9));door.rotation_euler.z=-math.pi/2
    k.box((.72,1.08,0),(1.44,2.16,.075),'wood',door)
    k.box((1.29,1.05,-.055),(.08,.08,.06),'steel',door)
    for side in [-1,1]:
        x=side*2.08
        k.box((x,2.05,-3.14),(1.38,1.37,.12),'cream',front)
        k.box((x,2.05,-3.212),(1.17,1.15,.035),'glass',front)
        k.box((x,2.05,-3.24),(.055,1.17,.03),'cream',front)
        k.box((x,1.31,-3.2),(1.62,.13,.28),'soot',front)
        k.box((x,2.84,-3.14),(1.62,.25,.045),'soot',front)
    # Gable is real roof geometry, removed together with the roof in cutaway mode.
    k.prism_x([(3.75,-3.35),(3.75,3.35),(3.92,3.35),(5.3,0),(3.92,-3.35)],7.5,'roof',roof)
    # Two thin roof seams and a chimney make the silhouette legible from above.
    for x in [-2,0,2]:k.box((x,4.17,1.8),(.04,.04,2.4),'wood',roof)
    k.box((2.25,4.75,1.2),(.67,1.65,.68),'brick',roof);k.box((2.25,5.61,1.2),(.8,.14,.8),'soot',roof)
    # Interior furnishings maintain readable targets without blocking player entry.
    k.box((-2.15,.51,1.2),(1.25,.65,2.15),'soot')
    k.box((-2.55,.98,1.2),(.45,.45,2.15),'wood')
    k.box((1.65,.77,1.45),(1.55,.13,1.15),'wood')
    for x in [1.1,2.2]:
        for z in [1.1,1.8]:k.box((x,.43,z),(.09,.67,.09),'dark')
    k.box((0,1.02,2.64),(1.1,1.7,.48),'soot')
    targets=[(-1.8,.2,.8),(1.7,.2,1.2),(0,.2,2.1)]
    for i,p in enumerate(targets,1):k.anchor('FireTarget'+str(i),p)
    for label,size in [('Low',.64),('Medium',1.18),('High',2.15)]:
        parent=k.group('Flames'+label,k.root);parent['flameState']=label.lower();parent['initialVisible']=label=='High'
        for i,c in enumerate(targets,1):
            g=k.group('Target'+str(i)+label,parent)
            flame(k,g,c,size,'flame',i*.4)
            flame(k,g,(c[0]-.21*size,c[1]+.02,c[2]+.025*size),size*.68,'flame',i*.9+1.2)
            flame(k,g,(c[0]-.05*size,c[1]+.025,c[2]-.17*size),size*.70,'flameLight',i*.9)
            flame(k,g,(c[0]-.03*size,c[1]+.03,c[2]-.29*size),size*.39,'flameCore',i*.9)
            # Exterior tongues remain visible through the opaque roof/façade.
            # Linked to the same target groups, so all evidence of that source
            # disappears together when extinguished in the interior preview.
            external=[(-2.08,1.31,-3.38),(2.08,1.31,-3.38),(0,3.85,-.2)][i-1]
            exterior=k.group('ExteriorTarget'+str(i)+label,g)
            flame(k,exterior,external,size,'flame',i*.7)
            flame(k,exterior,(external[0]-.21*size,external[1]+.02,external[2]+.025*size),size*.68,'flame',i*.9+1.2)
            flame(k,exterior,(external[0]-.05*size,external[1]+.025,external[2]-.17*size),size*.70,'flameLight',i*.9)
            flame(k,exterior,(external[0]-.03*size,external[1]+.03,external[2]-.29*size),size*.39,'flameCore',i*.9)
        if label!='High':k.initially_hidden.append(parent.name)
    k.anchor('Doorway',(0,.16,-3.15));k.anchor('InteriorAnchor',(0,.16,0));k.anchor('TruckStop',(0,0,-7.4))
    return k.finish('house-burning.glb',{'flameStates':{'low':'FlamesLow','medium':'FlamesMedium','high':'FlamesHigh'},'defaultFlameState':'high','cutawayHide':['CutawayFront','Roof'],'selectState':'set chosen parent scale to 1; other flame parents to 0','front':'-Z','dimensions':[7.5,6,6.8]})

inventory=[]
for kind in ['straight','right','left','cross','bridge','tunnel']:inventory.append(road(kind))
for kind,color in [('hatch','teal'),('sedan','blue'),('van','cream'),('compact','orange')]:inventory.append(civilian(kind,color))
inventory.extend([cone(),lamp(),house()])
qa=ROOT/'verification';qa.mkdir(exist_ok=True)
(qa/'environment-source.json').write_text(json.dumps({'generator':'Blender 4.3.2','units':'metres','axes':'Y up, +Z forward','assets':inventory},indent=2)+'\n')
(qa/'environment-authoring.json').write_text(json.dumps({
    'generator':'scripts/generate_environment.py',
    'source':'Original CC0 geometry informed by fire-v7 original asset palette; no external models.',
    'axes':{'up':'+Y','vehicleForward':'+Z','houseFront':'-Z','units':'metres'},
    'roads':{'tileSize':[6,6],'surfaceY':0,'carriagewayWidth':5.2,'laneWidth':2.6,'laneCenters':[-1.3,1.3],
             'incomingDirection':[0,0,1], 'curveRadius':3,'curveAngleDegrees':90,
             'centerlineFormula':{'right':'[3-3*cos(t),0,-3+3*sin(t)], t=0..PI/2','left':'[-3+3*cos(t),0,-3+3*sin(t)], t=0..PI/2'},
             'assets':{a['file'].split('/')[-1]:{key:a[key] for key in ['ports','centerlineLength']} for a in inventory if a['file'].startswith('models/road-')},
             'tunnel':{'clearanceY':3.88,'cutawayHide':['TunnelRoof'],'portalNodes':['PortalFront','PortalBack']},
             'bridge':{'surfaceY':0,'supportBottomY':-1.9}},
    'civilians':{'root':'CivilianRoot','wheelNodes':['WheelFrontLeft','WheelFrontRight','WheelRearLeft','WheelRearRight'],
                 'wheelAxis':'+X','yieldClip':'YieldRight','yieldDurationSeconds':2,'yieldDistance':1.1,'peakYawRadians':.12,
                 'wheelRadius':{'hatch':.31,'sedan':.31,'compact':.31,'van':.34},'finish':'ClampWhenFinished/LoopOnce, reverse to return'},
    'house':{'root':'BurningHouseRoot','front':'-Z','doorAnchor':{'node':'Doorway','position':[0,.16,-3.15]},
             'interiorAnchor':{'node':'InteriorAnchor','position':[0,.16,0]},'truckStopAnchor':{'node':'TruckStop','position':[0,0,-7.4]},
             'cutawayHide':['CutawayFront','Roof'],'interiorHidePrefix':'ExteriorTarget','flameStateNodes':['FlamesLow','FlamesMedium','FlamesHigh'],
             'defaultState':'high','selection':'Set chosen flame-state scale to 1 and remaining scales to 0.',
             'targets':[{'node':'FireTarget'+str(i+1),'position':p,'stateNodes':['Target'+str(i+1)+s for s in ['Low','Medium','High']]} for i,p in enumerate([[-1.8,.2,.8],[1.7,.2,1.2],[0,.2,2.1]])],
             'flameDesign':'Each target contains interior flames plus an exterior window or roof tongue; hide corresponding target groups in all three states on suppression.'}
},indent=2)+'\n')
print('ENVIRONMENT COMPLETE:',len(inventory),'GLBs',sum(a['triangles'] for a in inventory),'triangles')
