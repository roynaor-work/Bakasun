"""Original CC0 racing ceremony props. Run: blender -b -t 1 -P source/build-props.py.
All authoring dimensions are metres, +Y up, +Z front; xyz() converts to Blender.
"""
import bpy, math, json, os
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets'
OUT.mkdir(exist_ok=True)
C={
 'navy':('#101F32',0,.36),'ivory':('#F0F2EE',.08,.3),'gold':('#F1BE58',.76,.24),
 'silver':('#A9C0D4',.82,.28),'bronze':('#BF815A',.75,.31),'black':('#090F18',.15,.34),
 'white':('#FAFCFF',.05,.36),'teal':('#41DDD3',.28,.3),'red':('#F36456',.08,.44),
 'glass':('#174B3B',.12,.25),'foil':('#E5C475',.65,.22),'visor':('#213248',.7,.16),
}
def xyz(p): return (p[0],-p[2],p[1])
def linear(c): return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for db in (bpy.data.meshes,bpy.data.materials,bpy.data.curves,bpy.data.actions):
  for item in list(db):
   if item.users==0: db.remove(item)
 global M
 M={}
 for n,(h,metal,rough) in C.items():
  m=bpy.data.materials.new(n);m.diffuse_color=tuple(linear(int(h[i:i+2],16)/255) for i in (1,3,5))+(1,)
  m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;M[n]=m
 bpy.context.scene.render.fps=24

def material(o,name):o.data.materials.append(M[name]);return o

def bevel(o,r=.025,s=2):
 bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('Soft manufactured edges','BEVEL');m.width=r;m.segments=s
 bpy.ops.object.modifier_apply(modifier=m.name)
 o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def box(name,center,size,mat='navy',r=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);material(o,mat)
 if r:bevel(o,r)
 return o

def sphere(name,center,size,mat='gold',segments=24,rings=12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=xyz(center));o=bpy.context.object;o.name=name;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);material(o,mat)
 for p in o.data.polygons:p.use_smooth=True
 return o

def cylinder(name,center,radius,depth,mat='gold',axis=(0,1,0),vertices=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=xyz(center));o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(xyz(axis)).to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);material(o,mat);bevel(o,.004,2)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o

def lathe(name,profile,mat='gold',segments=40):
 v=[];f=[]
 for r,y in profile:
  for i in range(segments):
   a=i*math.tau/segments;v.append(xyz((r*math.cos(a),y,r*math.sin(a))))
 for j in range(len(profile)-1):
  for i in range(segments):
   k=j*segments+i;n=j*segments+(i+1)%segments;f.append((k+segments,n+segments,n,k))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);material(o,mat)
 for p in mesh.polygons:p.use_smooth=True
 return o

def tube(name,points,r=.012,mat='gold',res=3):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=2;cu.bevel_depth=r;cu.bevel_resolution=res;cu.resolution_u=2;cu.use_fill_caps=True
 poly=cu.splines.new('POLY');poly.points.add(len(points)-1)
 for p,co in zip(poly.points,points):p.co=(*xyz(co),1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);material(o,mat);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def mesh(name,v,f,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in v],[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);material(o,mat);return o

def text(name,value,center,size,mat='gold'):
 cu=bpy.data.curves.new(name,'FONT');cu.body=value;cu.size=size;cu.align_x='CENTER';cu.align_y='CENTER';cu.extrude=.0015;cu.bevel_depth=.0006;cu.bevel_resolution=1;cu.resolution_u=3
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.location=xyz(center);o.rotation_euler=(math.pi/2,0,0);material(o,mat);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def export(filename):
 bpy.ops.object.select_all(action='SELECT')
 for o in bpy.context.selected_objects:
  if o.type=='MESH':
   bpy.context.view_layer.objects.active=o
   for mod in list(o.modifiers):
    if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
 # One static mesh per asset, one primitive per material: fewer runtime draws.
 # Keep the animated flag hierarchy/morph targets independent.
 if filename!='checkered-flag.glb':
  bpy.ops.object.select_all(action='DESELECT')
  parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
  for o in parts:o.select_set(True)
  if parts:
   bpy.context.view_layer.objects.active=parts[0]
   bpy.ops.object.join()
   bpy.context.object.name=filename[:-4]+' / consolidated CC0 mesh'
 bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=False,export_yup=True,export_animations=True,export_morph=True,export_morph_normal=True,export_extras=True,export_copyright='Original racing-podium-v1 geometry. CC0-1.0.',export_materials='EXPORT',export_texcoords=False)
 print(filename,(OUT/filename).stat().st_size)

reset()
# Center-first competition arrangement, all standing surfaces horizontal.
box('Podium foundation',(0,.045,0),(3.62,.09,1.26),'navy',.045)
for rank,x,h,accent in [(1,0,.82,'gold'),(2,-1.18,.56,'silver'),(3,1.18,.36,'bronze')]:
 box(f'Place_{rank}_body',(x,h/2,0),(1.10,h,1.08),'ivory',.035)
 box(f'Place_{rank}_standing_surface',(x,h-.018,0),(1.11,.036,1.09),'navy',.014)
 box(f'Place_{rank}_front_inset',(x,h/2,.547),(.91,max(.19,h-.15),.018),'navy',.015)
 box(f'Place_{rank}_upper_trim',(x,h-.062,.559),(.91,.018,.009),accent,.004)
 text(f'Rank_{rank}',str(rank),(x,h*.48,.562),min(.36,h*.64),accent)
 for side in [-1,1]:box(f'Place_{rank}_foot_recess_{side}',(x+side*.4,.035,.43),(.09,.035,.1),'black',.005)
export('podium.glb')

reset()
# Trophy uses a solid open bowl: outer profile returns along its inner wall.
box('Trophy obsidian plinth',(0,-.105,0),(.205,.05,.165),'navy',.014)
box('Trophy gold plinth lip',(0,-.074,0),(.16,.012,.132),'gold',.005)
cylinder('Graspable trophy stem',(0,-.008,0),.024,.126,'gold')
lathe('Open trophy cup',[(.024,.05),(.055,.075),(.087,.11),(.126,.18),(.154,.285),(.158,.335),(.154,.355),(.142,.355),(.142,.335),(.137,.285),(.112,.19),(.071,.125),(.022,.105),(.0,.105)],'gold',40)
for side in [-1,1]:
 pts=[]
 for i in range(25):
  a=i/24*math.pi;pts.append((side*(.127+.071*math.sin(a)),.228+.099*math.cos(a),0))
 tube('Trophy sculpted handle '+str(side),pts,.012,'gold',2)
text('Trophy winner engraving','1',(0,-.103,.084),.031,'gold')
export('trophy.glb')

for name,metal in [('gold','gold'),('silver','silver'),('bronze','bronze')]:
 reset()
 # Ribbon origin fits a Neck socket: two lanyard pieces meet at chest.
 for side,col in [(-1,'teal'),(1,'navy')]:
  v=[(side*.055,0,-.005),(side*.081,-.007,-.005),(.023*side,-.189,.082),(-.002*side,-.184,.082)]
  o=mesh('Neck ribbon '+str(side),v,[(0,1,2,3),(3,2,1,0)],col)
 cylinder('Medal connector',(0,-.193,.084),.011,.009,metal,axis=(0,0,1),vertices=16)
 cylinder(name+' medal disc',(0,-.23,.09),.042,.008,metal,axis=(0,0,1),vertices=40)
 cylinder('Inset central disc',(0,-.23,.095),.033,.002,metal,axis=(0,0,1),vertices=40)
 text('Medal rank',{'gold':'1','silver':'2','bronze':'3'}[name],(0,-.23,.098),.038,'navy')
 export(name+'-medal.glb')

reset()
# Bottle neck is +Y; the origin is the palm at the middle of the bottle.
lathe('Unbranded celebration bottle',[(0,-.12),(.036,-.12),(.041,-.112),(.043,-.083),(.043,.057),(.037,.085),(.019,.116),(.014,.134),(.014,.204),(.016,.207),(.016,.219),(.012,.222),(0,.222)],'glass',32)
lathe('Gold foil bottle neck',[(.014,.145),(.0145,.17),(.015,.205),(.017,.208),(.017,.222),(.012,.224),(0,.224)],'foil',32)
# Plain geometric livery, no label text or borrowed mark.
lathe('Plain ivory label',[(.0433,-.067),(.0433,.026)],'ivory',32)
lathe('Label gold edge bottom',[(.0435,-.068),(.0435,-.064)],'gold',32)
lathe('Label gold edge top',[(.0435,.023),(.0435,.027)],'gold',32)
export('champagne.glb')

reset()
# Driver helmet: origin is a grip on the wearer's right side, center lies +X.
cx=.145;cy=.02
# Open-bottom shell made from spherical rows; visor covers front (+Z).
vv=[];ff=[];ns=40;nr=14
for j in range(nr+1):
 phi=.08+(math.pi*.67-.08)*j/nr
 for i in range(ns):
  a=i/ns*math.tau
  vv.append((cx+.145*math.sin(phi)*math.cos(a),cy+.145*math.cos(phi),.166*math.sin(phi)*math.sin(a)))
for j in range(nr):
 for i in range(ns):
  a=j*ns+i;b=j*ns+(i+1)%ns;ff.append((a,b,b+ns,a+ns))
o=mesh('Full-face helmet shell',vv,ff,'ivory')
for p in o.data.polygons:p.use_smooth=True
# Curved panoramic visor, dark reflective face, sits over upper face.
v=[];f=[];cols=24;rows=5
for j in range(rows+1):
 phi=math.pi*(.35+.16*j/rows)
 for i in range(cols+1):
  a=math.pi*(.1+.8*i/cols);v.append((cx+.148*math.sin(phi)*math.cos(a),cy+.147*math.cos(phi),.17*math.sin(phi)*math.sin(a)))
for j in range(rows):
 for i in range(cols):
  a=j*(cols+1)+i;f.append((a,a+1,a+cols+2,a+cols+1))
o=mesh('Panoramic smoked visor',v,f,'visor')
for p in o.data.polygons:p.use_smooth=True
# Chin guard and lower opening lip define a full-face helmet silhouette.
box('Helmet chin protection',(cx,cy-.077,.112),(.208,.057,.081),'ivory',.024)
box('Chin vent',(cx,cy-.076,.155),(.088,.015,.006),'navy',.005)
for sign in [-1,1]:
 cylinder('Visor pivot '+str(sign),(cx+sign*.142,cy+.012,.008),.02,.006,'gold',axis=(1,0,0),vertices=20)
# Crown racing stripe made of a surface strip following the crown.
v=[];f=[]
for i in range(21):
 a=-math.pi*.5+i/20*math.pi
 for x in [-.017,.017]:v.append((cx+x,cy+.148*math.cos(a),.169*math.sin(a)))
for i in range(20):a=i*2;f.append((a,a+1,a+3,a+2))
mesh('Single teal crown stripe',v,f,'teal')
export('helmet.glb')

reset()
# Two-sided cloth cells use a two-material checker weave, no texture.
cylinder('Flag weighted circular base',(0,.024,0),.18,.048,'navy')
cylinder('Flag pole',(0,1.38,0),.016,2.72,'silver',vertices=16)
sphere('Flag pole finial',(0,2.762,0),(.029,.029,.029),'gold',segments=12,rings=6)
NX=16;NY=10;v=[];f=[]
def clothpos(i,j,phase=0):
 x=.025+1.12*i/NX;y=2.70-.66*j/NY
 z=.09*(i/NX)*math.sin(2*math.pi*i/NX+phase)+.025*(i/NX)*math.sin(j/NY*math.pi*2+phase)
 return (x,y,z)
for j in range(NY+1):
 for i in range(NX+1):v.append(clothpos(i,j))
for j in range(NY):
 for i in range(NX):
  a=j*(NX+1)+i;f.append((a,a+1,a+NX+2,a+NX+1))
o=mesh('Checkered cloth / animated wind',v,f,'white');o.data.materials.append(M['black'])
for k,p in enumerate(o.data.polygons):
 i=k%NX;j=k//NX;p.material_index=(i//2+j//2)%2;p.use_smooth=True
# Normals are genuinely two-sided; glTF doubleSided material handles reverse view.
for n in ['white','black']:M[n].use_backface_culling=False
base=o.shape_key_add(name='Basis')
for label,phase in [('WindQuarter',math.pi*.5),('WindHalf',math.pi),('WindThreeQuarter',math.pi*1.5)]:
 sk=o.shape_key_add(name=label)
 for j in range(NY+1):
  for i in range(NX+1):sk.data[j*(NX+1)+i].co=xyz(clothpos(i,j,phase))
 for frame,value in [(1,0),(13,1 if label=='WindQuarter' else 0),(25,1 if label=='WindHalf' else 0),(37,1 if label=='WindThreeQuarter' else 0),(49,0)]:
  sk.value=value;sk.keyframe_insert('value',frame=frame)
if o.data.shape_keys.animation_data:o.data.shape_keys.animation_data.action.name='flag_wave'
bpy.context.scene.frame_end=49
export('checkered-flag.glb')

metadata={
 'schemaVersion':1,'units':'metres','up':'+Y','forward':'+Z','license':'CC0-1.0',
 'podium':{'file':'assets/podium.glb','origin':'floor at middle of winning step','standings':[{'place':1,'position':[0,.82,0]},{'place':2,'position':[-1.18,.56,0]},{'place':3,'position':[1.18,.36,0]}],'standingSize':[1.10,1.08]},
 'trophy':{'file':'assets/trophy.glb','origin':'stem grip; parent RightHand identity','bottom':-.13,'top':.355,'gripRadius':.024},
 'helmet':{'file':'assets/helmet.glb','origin':'right-side palm grip; parent RightHand identity','shellCenter':[.145,.02,0],'dimensions':[.29,.28,.33]},
 'champagne':{'file':'assets/champagne.glb','origin':'middle body palm grip','nozzle':[0,.224,0],'bottom':-.12,'top':.224,'sprayAxis':[0,1,0]},
 'medals':[{'place':i+1,'file':f'assets/{m}-medal.glb','origin':'neck front, ribbon descends -Y, face +Z','discCenter':[0,-.23,.09]} for i,m in enumerate(['gold','silver','bronze'])],
 'flag':{'file':'assets/checkered-flag.glb','origin':'pole ground','height':2.791,'clothWidth':1.12,'clip':'flag_wave','loop':True,'duration':2.0}
}
(ROOT/'props.json').write_text(json.dumps(metadata,indent=2)+'\n')
