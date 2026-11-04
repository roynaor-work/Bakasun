"""Original brand-free arena, with reusable MakeHuman garment/crowd assets.
blender -b -t 4 --python workout/island/design/hoops-v5/source/build.py
World contract in the exported GLBs: X length, Y up, Z width; metres.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ISLAND = ROOT.parents[1]
OUT = ROOT/'models'
OUT.mkdir(exist_ok=True)
R = random.Random(504)
materials, pools, stats = {}, {}, []

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    materials.clear()
    pools.clear()

def material(name, color, rough=.7, metal=0, texture=None, normal=None, roughmap=None, emission=0, alpha=1):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color, alpha)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,alpha)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    p.inputs['Alpha'].default_value=alpha
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1)
        p.inputs['Emission Strength'].default_value=emission
    def image(file, noncolor=False):
        node=m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image=bpy.data.images.load(str(ROOT/'textures'/file),check_existing=True)
        if noncolor: node.image.colorspace_settings.name='Non-Color'
        return node
    if texture:
        t=image(texture)
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        if emission:m.node_tree.links.new(t.outputs['Color'],p.inputs['Emission Color'])
        if name=='crowd':
            m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
            m.surface_render_method='DITHERED'
            m.alpha_threshold=.35
            m.use_backface_culling=False
    if normal:
        t=image(normal,True)
        bump=m.node_tree.nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value=.55
        m.node_tree.links.new(t.outputs['Color'],bump.inputs['Color'])
        m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    if roughmap:
        t=image(roughmap,True)
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Roughness'])
    if name=='maple':
        p.inputs['Coat Weight'].default_value=.72
        p.inputs['Coat Roughness'].default_value=.16
    if alpha<1:
        m.surface_render_method='DITHERED'
        m.use_backface_culling=False
    # Bake gentle row falloff into COLOR_0; use it in the graph so glTF keeps it.
    if name not in ['maple','display','ribbon'] and not name.startswith('fabric-') and name!='pebbled-leather':
        vertex=m.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='COLOR_0'
        multiply=m.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY'
        multiply.inputs[0].default_value=1
        multiply.inputs[1].default_value=(*color,alpha)
        if p.inputs['Base Color'].is_linked:
            source=p.inputs['Base Color'].links[0].from_socket
            m.node_tree.links.new(source,multiply.inputs[1])
        m.node_tree.links.new(vertex.outputs['Color'],multiply.inputs[2])
        if texture:m.node_tree.links.new(multiply.outputs[0],p.inputs['Base Color'])
        else:m.node_tree.links.new(vertex.outputs['Color'],p.inputs['Base Color'])
    materials[name]=m
    return m

def add(name, mat, verts, faces, uv=None, shade=1):
    key=(name,mat)
    if key not in pools:pools[key]={'v':[],'f':[],'uv':[],'c':[]}
    p=pools[key]; base=len(p['v'])
    p['v'].extend(verts);p['f'].extend(tuple(base+i for i in f) for f in faces)
    p['uv'].extend(uv if uv else [(0,0)]*len(verts))
    p['c'].extend([(shade,shade,shade,1)]*len(verts))

def quad(name,mat,a,b,c,d,uv=None,shade=1):
    add(name,mat,[a,b,c,d],[(0,1,2),(0,2,3)],uv or [(0,0),(1,0),(1,1),(0,1)],shade)

def box(name,mat,p,s,angle=0,shade=1):
    verts=[];co,si=math.cos(angle),math.sin(angle)
    for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        x,y,z=dx*s[0]/2,dy*s[1]/2,dz*s[2]/2
        verts.append((p[0]+x*co+z*si,p[1]+y,p[2]-x*si+z*co))
    add(name,mat,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],shade=shade)

def floor(name,mat,x0,x1,z0,z1,y,repeat=None):
    uv=None if repeat is None else [(x0/repeat,z0/repeat),(x0/repeat,z1/repeat),(x1/repeat,z1/repeat),(x1/repeat,z0/repeat)]
    quad(name,mat,(x0,y,z0),(x0,y,z1),(x1,y,z1),(x1,y,z0),uv)

def strip(name,mat,points,w,y):
    for a,b in zip(points,points[1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];l=math.hypot(dx,dz)
        if not l:continue
        nx,nz=-dz*w/l/2,dx*w/l/2
        quad(name,mat,(a[0]+nx,y,a[1]+nz),(b[0]+nx,y,b[1]+nz),
             (b[0]-nx,y,b[1]-nz),(a[0]-nx,y,a[1]-nz))

def arc(x,z,r,a,b,n=64):
    return [(x+math.cos(a+(b-a)*i/n)*r,z+math.sin(a+(b-a)*i/n)*r) for i in range(n+1)]

def cylinder(name,mat,a,b,r,n=7):
    va,vb=Vector(a),Vector(b);direction=(vb-va).normalized()
    tangent=direction.cross(Vector((0,1,0)) if abs(direction.y)<.9 else Vector((1,0,0))).normalized()
    bitangent=direction.cross(tangent)
    vs=[]
    for center in [va,vb]:
        for i in range(n):vs.append(tuple(center+r*(math.cos(i*math.tau/n)*tangent+math.sin(i*math.tau/n)*bitangent)))
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    add(name,mat,vs,fs)

def flush():
    objects=[]
    for (name,mat),p in pools.items():
        me=bpy.data.meshes.new(name)
        me.from_pydata([(x,-z,y) for x,y,z in p['v']],[],p['f']);me.update()
        me.uv_layers.new(name='UVMap')
        me.color_attributes.new(name='COLOR_0',type='BYTE_COLOR',domain='CORNER')
        base_color=materials[mat].diffuse_color
        textured=any(n.type=='TEX_IMAGE' for n in materials[mat].node_tree.nodes)
        uv_values=[];color_values=[]
        for poly in me.polygons:
            for loop in poly.loop_indices:
                vi=me.loops[loop].vertex_index
                uv_values.extend(p['uv'][vi])
                shade=p['c'][vi]
                color_values.extend(shade if textured else tuple(shade[k]*base_color[k] for k in range(4)))
        # Reacquire RNA layers after all custom-data allocation. A cached UV
        # layer handle can address the wrong layer after adding a colour layer.
        me.uv_layers['UVMap'].data.foreach_set('uv',uv_values)
        me.color_attributes['COLOR_0'].data.foreach_set('color',color_values)
        ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
        me.materials.append(materials[mat]);objects.append(ob)
    pools.clear()
    return objects

def anchor(name,position):
    ob=bpy.data.objects.new(name,None);ob.location=(position[0],-position[2],position[1]);bpy.context.collection.objects.link(ob)

def export(name):
    bpy.context.view_layer.update()
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.export_scene.gltf(
        filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,
        export_animations=True,export_force_sampling=True,export_image_format='AUTO',
        export_cameras=False,export_lights=False,export_extras=True,
        export_tangents=True,export_morph_normal=False,
        export_vertex_color='MATERIAL',export_all_vertex_colors=True)
    stats.append({'file':'models/'+name+'.glb','trianglesAuthoring':triangles})
    print('EXPORTED',name,triangles,flush=True)

def ring(row):
    x,z,r=18.3+row*.86,10.6+row*.86,4+row*.19
    points=[]
    for cx,cz,a in [(x-r,z-r,0),(-x+r,z-r,90),(-x+r,-z+r,180),(x-r,-z+r,270)]:
        for j in range(10):
            t=math.radians(a+j*10)
            points.append((cx+r*math.cos(t),cz+r*math.sin(t)))
    return points

def samples(path,spacing=.63):
    result=[]
    for a,b in zip(path,path[1:]+path[:1]):
        n=max(1,round(math.dist(a,b)/spacing))
        for i in range(n):result.append((a[0]+(b[0]-a[0])*(i+.5)/n,a[1]+(b[1]-a[1])*(i+.5)/n))
    return result

# ---------------- court, true NBA dimensions without league artwork ----------------
clear()
material('maple',(1,1,1),.38,texture='maple-color.jpg',normal='maple-normal.png',roughmap='maple-roughness.png')
material('teal',(.018,.083,.105),.46)
material('ink',(.006,.017,.025),.55)
material('ivory',(.88,.87,.79),.43)
material('gold',(.57,.39,.16),.44)
floor('court-apron','ink',-18,18,-11,11,-.018)
floor('court-surface','maple',-14.325,14.325,-7.62,7.62,0,4)
hx,hz,rx,fx=14.325,7.62,12.75,8.535
for side in [-1,1]:
    floor('painted-keys','teal',min(side*fx,side*hx),max(side*fx,side*hx),-2.44,2.44,.003)
    strip('court-lines','ivory',[(side*hx,-2.44),(side*fx,-2.44),(side*fx,2.44),(side*hx,2.44)],.05,.009)
    a=math.pi/2 if side==1 else -math.pi/2
    strip('court-lines','ivory',arc(side*fx,0,1.83,a,a+math.pi),.05,.009)
    for k in range(12):strip('court-lines','ivory',arc(side*fx,0,1.83,a+math.pi+k*math.pi/12,a+math.pi+(k+.55)*math.pi/12,5),.05,.009)
    angle=math.asin(6.7/7.24)
    a,b=(math.pi-angle,math.pi+angle) if side==1 else (-angle,angle)
    strip('court-lines','ivory',arc(side*rx,0,7.24,a,b),.05,.009)
    for s in [-1,1]:
        strip('court-lines','ivory',[(side*hx,s*6.7),(side*(rx-math.sqrt(7.24**2-6.7**2)),s*6.7)],.05,.009)
        for d in [1.1,2,3,4]:strip('court-lines','ivory',[(side*(hx-d),s*2.44),(side*(hx-d),s*2.66)],.05,.009)
    strip('court-lines','ivory',arc(side*rx,0,1.22,a=math.pi/2 if side==1 else -math.pi/2,b=math.pi*1.5 if side==1 else math.pi/2,n=32),.05,.009)
strip('court-lines','ivory',[(-hx,-hz),(-hx,hz),(hx,hz),(hx,-hz),(-hx,-hz)],.05,.009)
strip('court-lines','ivory',[(0,-hz),(0,hz)],.05,.009)
strip('court-lines','ivory',arc(0,0,1.83,0,math.tau),.05,.009)
strip('center-mark','teal',[(0,-1.45),(.85,0),(0,1.45),(-.85,0),(0,-1.45)],.20,.008)
strip('center-mark','gold',[(0,-1.05),(.60,0),(0,1.05),(-.60,0),(0,-1.05)],.07,.010)
anchor('center',(0,0,0));anchor('rim-home',(-12.75,3.048,0));anchor('rim-away',(12.75,3.048,0))
flush();export('court')

# ---------------- seating bowl, roof, practical lights, benches ----------------
clear()
for name,c,rough,metal in [('concrete',(.11,.14,.17),.9,0),('seat',(.021,.047,.071),.61,0),
 ('steel',(.026,.040,.052),.4,.65),('dark',(.008,.014,.022),.7,0),
 ('teal',(.018,.12,.145),.65,0),('ivory',(.73,.70,.59),.9,0),('rail',(.18,.24,.28),.35,.72)]:
    material(name,c,rough,metal)
material('practical',(.75,.85,1),.4,emission=5)
material('gold-light',(.65,.34,.09),.4,emission=2.1)
material('display',(1,1,1),.6,texture='scoreboard.png',emission=1)
material('ribbon',(1,1,1),.6,texture='ribbon.png',emission=.8)
spots=[]
for row in range(14):
    step=.32+row*.61+(1.4 if row>=8 else 0)
    inner=ring(row-.6);outer=ring(row+.45)
    for i in range(len(inner)):
        j=(i+1)%len(inner)
        a,b,c,d=inner[i],inner[j],outer[j],outer[i]
        quad('stand-treads','concrete',(a[0],step,a[1]),(b[0],step,b[1]),(c[0],step,c[1]),(d[0],step,d[1]),shade=.88-row*.023)
        quad('stand-risers','concrete',(a[0],step-.61,a[1]),(b[0],step-.61,b[1]),(b[0],step,b[1]),(a[0],step,a[1]),shade=.6)
    for index,(x,z) in enumerate(samples(ring(row))):
        if (abs(x)<1.25 or abs(abs(x)-11)<.65) and abs(z)>10:continue
        if abs(z)<1.2 and abs(x)>17:continue
        face=math.atan2(-x,-z)
        co,si=math.cos(face),math.sin(face)
        def seatpoint(dx,dy,dz):return (x+dx*co+dz*si,step+dy,z-dx*si+dz*co)
        shade=R.uniform(.76,1)*(1-row*.024)
        quad('seats','seat',seatpoint(-.235,.43,-.20),seatpoint(-.235,.43,.23),seatpoint(.235,.43,.23),seatpoint(.235,.43,-.20),shade=shade)
        quad('seats','seat',seatpoint(-.235,.43,-.23),seatpoint(.235,.43,-.23),seatpoint(.235,.96,-.29),seatpoint(-.235,.96,-.29),shade=shade)
        if row<3:
            for side in [-1,1]:box('seat-legs','steel',seatpoint(side*.19,.21,0),(.027,.42,.03))
        if R.random()>.09:
            spots.append({'x':x,'y':step+.035,'z':z,'face':face,'row':row,'variant':R.randrange(24),'cheer':R.random()<.18})

# Vertical bowl backing, upper concourse and accent rings.
inner,outer=ring(14),ring(15)
for i in range(len(inner)):
    j=(i+1)%len(inner);a,b=inner[i],inner[j]
    quad('arena-shell','dark',(a[0],0,a[1]),(b[0],0,b[1]),(b[0],18,b[1]),(a[0],18,a[1]))
for row,y in [(7.85,6.4),(14.4,12.5)]:
    path=ring(row)
    for i,a in enumerate(path):
        b=path[(i+1)%len(path)]
        quad('led-ribbons','ribbon',(a[0],y,a[1]),(b[0],y,b[1]),(b[0],y+.50,b[1]),(a[0],y+.50,a[1]),[(0,0),(max(.2,math.dist(a,b)/5),0),(max(.2,math.dist(a,b)/5),1),(0,1)])

# A fully enclosed roof high above broadcast cameras; no view-specific cutout.
box('roof','dark',(0,19.1,0),(66,.35,50))
for x in range(-28,29,8):
    for z in [-24.5,24.5]:box('roof-columns','steel',(x,13.8,z),(.38,10.4,.38))
    for yy in [17.9,18.9]:cylinder('roof-trusses','steel',(x,yy,-23),(x,yy,23),.085,6)
    for z in range(-22,22,2):cylinder('roof-trusses','steel',(x,17.9,z),(x,18.9,z+2),.048,5)
for z in [-17,-8,0,8,17]:cylinder('roof-trusses','steel',(-31,18.4,z),(31,18.4,z),.08,6)
for x in [-12,-6,0,6,12]:
    for z in [-7,7]:
        box('fixture-housings','steel',(x,17.8,z),(2,.25,.8))
        floor('light-panels','practical',x-.86,x+.86,z-.29,z+.29,17.65)
        # Underside normals for fixtures.
        p=pools[('light-panels','practical')];p['f'][-2:]=[tuple(reversed(f)) for f in p['f'][-2:]]
        cylinder('fixture-cables','steel',(x,17.9,z),(x,19,z),.018,5)

# Suspended four-sided scoreboard, plus compact end-zone displays.
box('scoreboard-housing','dark',(0,11.25,0),(6.8,3.5,3.7))
box('scoreboard-trim','teal',(0,9.47,0),(7.1,.16,4))
for x in [-2.7,2.7]:cylinder('scoreboard-cables','steel',(x,13,-1.3),(x,19,-1.3),.024,6)
for z in [-1.859,1.859]:
    xs=[-3.22,3.22] if z>0 else [3.22,-3.22]
    quad('scoreboard-screen','display',(xs[0],9.7,z),(xs[1],9.7,z),(xs[1],12.85,z),(xs[0],12.85,z))
for x in [-3.409,3.409]:
    zs=[1.7,-1.7] if x>0 else [-1.7,1.7]
    quad('scoreboard-ends','display',(x,10.45,zs[0]),(x,10.45,zs[1]),(x,12.2,zs[1]),(x,12.2,zs[0]))
for x in [-22.8,22.8]:
    box('end-displays','dark',(x,9,0),(.25,2.8,6))
    zs=[2.8,-2.8] if x<0 else [-2.8,2.8]
    quad('end-screens','display',(x+( .14 if x<0 else -.14),7.7,zs[0]),(x+(.14 if x<0 else -.14),7.7,zs[1]),(x+(.14 if x<0 else -.14),10.3,zs[1]),(x+(.14 if x<0 else -.14),10.3,zs[0]))

# Both team benches share a sideline, separated by the scorer's table.
for team,cx in enumerate([-8.8,8.8]):
    for i in range(9):
        x=cx+(i-4)*.67;z=-9.3
        box('bench-cushions','teal' if team==0 else 'ivory',(x,.48,z),(.54,.12,.49))
        box('bench-backs','teal' if team==0 else 'ivory',(x,.94,z-.26),(.54,.72,.08))
        for dx in [-.20,.20]:box('bench-frames','steel',(x+dx,.24,z),(.027,.47,.45))
        if i%3==0:box('bench-towels','ivory',(x,.80,z-.20),(.24,.44,.04))
    box('coolers','ivory',(cx+3.6,.44,-9.6),(.62,.88,.66))
box('scorer-table','dark',(0,.57,-9.6),(5.5,1.14,.82))
quad('table-ribbon','ribbon',(-2.69,.12,-9.17),(2.69,.12,-9.17),(2.69,1.05,-9.17),(-2.69,1.05,-9.17))
for x in [-1.6,0,1.6]:box('table-monitors','steel',(x,1.34,-9.64),(.55,.37,.08))
for x in [-16,16]:
    for z in [-8.8,8.8]:box('courtside-barrier','teal',(x,.46,z),(2.1,.9,.38))
flush();export('arena')
(ROOT/'crowd-layout.json').write_text(json.dumps(spots,separators=(',',':'))+'\n')

# ---------------- seated/cheering atlas cards with portable morph motion ----------------
clear();material('crowd',(1,1,1),1,texture='crowd-atlas.png')
for sp in spots:
    x,y,z,face=sp['x'],sp['y'],sp['z'],sp['face']
    variant=sp['variant'];column=variant%4*2+int(sp['cheer']);row=variant//4
    # Half-texel gutters prevent a neighbouring spectator bleeding into the card.
    u0,u1=column/8+.001,(column+1)/8-.001
    v0,v1=1-(row+1)/6+.001,1-row/6-.001
    dx,dz=math.cos(face)*.52,-math.sin(face)*.52
    quad('crowd-cards','crowd',(x-dx,y,z-dz),(x+dx,y,z+dz),(x+dx,y+1.56,z+dz),(x-dx,y+1.56,z-dz),
         [(u0,v0),(u1,v0),(u1,v1),(u0,v1)],shade=.92-sp['row']*.027)
ob=flush()[0]
ob.shape_key_add(name='Basis')
a=ob.shape_key_add(name='SwaySin');b=ob.shape_key_add(name='SwayCos')
for i,v in enumerate(ob.data.vertices):
    sp=spots[i//4];phase=sp['x']*.67+sp['z']*1.31
    # Anchor feet; head/shoulders sway and rise independently across the bowl.
    k=1 if i%4>=2 else .08
    a.data[i].co.x += math.sin(phase)*.028*k
    a.data[i].co.z += math.cos(phase)*.043*k
    b.data[i].co.x += math.cos(phase)*.028*k
    b.data[i].co.z -= math.sin(phase)*.043*k
for key in [a,b]:key.slider_min=-1;key.slider_max=1
for frame,av,bv in [(1,1,0),(31,0,1),(61,-1,0),(91,0,-1),(121,1,0)]:
    for key,value in [(a,av),(b,bv)]:key.value=value;key.keyframe_insert(data_path='value',frame=frame)
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=121;bpy.context.scene.render.fps=30
ob.data.shape_keys.animation_data.action.name='Crowd_Sway_4s'
bpy.context.scene.frame_set(1)
export('crowd')

# ---------------- basket assemblies: glass, padding, torus and diamond nets ----------------
clear()
for name,c,r,m in [('pad',(.013,.09,.115),.8,0),('steel',(.09,.14,.17),.35,.7),('white',(.85,.86,.80),.55,0),('rim',(.79,.16,.025),.32,.55)]:material(name,c,r,m)
material('glass',(.7,.86,.88),.07,alpha=.16)
material('shot-display',(1,1,1),.6,texture='shot-clock.png',emission=.9)
for side in [-1,1]:
    bx=side*13.125;rx=side*12.75;base=side*16.05
    box('stanchion-pads','pad',(base,.62,0),(1.7,1.24,1.75))
    box('stanchion-pads','pad',(base-side*.48,1.78,0),(.53,2.24,.70))
    cylinder('basket-support','steel',(base,3.17,0),(bx,3.58,0),.10,8)
    cylinder('basket-brace','steel',(base,2.1,0),(bx,3.52,0),.055,7)
    box('backboard-glass','glass',(bx,3.56,0),(.025,1.067,1.829))
    for z in [-.9145,.9145]:box('board-frame','white',(bx,3.56,z),(.05,1.10,.035))
    for y in [3.0265,4.0935]:box('board-frame','white',(bx,y,0),(.05,.035,1.829))
    for z in [-.295,.295]:box('board-target','white',(bx-side*.02,3.30,z),(.015,.45,.045))
    for y in [3.075,3.525]:box('board-target','white',(bx-side*.02,y,0),(.015,.045,.59))
    for i in range(48):
        a0,a1=math.tau*i/48,math.tau*(i+1)/48
        cylinder('rim','rim',(rx+math.cos(a0)*.2286,3.048,math.sin(a0)*.2286),(rx+math.cos(a1)*.2286,3.048,math.sin(a1)*.2286),.0175,7)
    for row in range(6):
        y0,y1=3.03-row*.064,3.03-(row+1)*.064
        r0,r1=.222-row*.017,.222-(row+1)*.017
        for i in range(12):
            a0=(i+(row%2)*.5)*math.tau/12
            for shift in [-.5,.5]:
                a1=a0+shift*math.tau/12
                cylinder('net','white',(rx+math.cos(a0)*r0,y0,math.sin(a0)*r0),(rx+math.cos(a1)*r1,y1,math.sin(a1)*r1),.004,4)
    box('shot-clock-case','steel',(bx,4.42,0),(.16,.46,.62))
    zs=[-.28,.28] if side==1 else [.28,-.28]
    xx=bx-side*.09
    quad('shot-clock-screen','shot-display',(xx,4.23,zs[0]),(xx,4.23,zs[1]),(xx,4.61,zs[1]),(xx,4.61,zs[0]))
    # Display is a generic fixed showroom clock, not simulation data.
    anchor('rim-'+('home' if side<0 else 'away'),(rx,3.048,0))
flush();export('hoops')

# ---------------- 24 cm ball, shared leather maps ----------------
clear();m=material('pebbled-leather',(1,1,1),.77,texture='leather-color.jpg',normal='leather-normal.png')
bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=.12)
ball=bpy.context.object;ball.name='basketball';ball.data.materials.append(m)
for p in ball.data.polygons:p.use_smooth=True
export('ball')

# ---------------- two real garment surfaces with numbered woven textures ----------------
clear()
bpy.ops.import_scene.gltf(filepath=str(ISLAND/'assets/models/hoops-guard.glb'))
jersey=next(o for o in bpy.context.scene.objects if o.type=='MESH' and any(m and m.name.split('.')[0]=='Jersey' for m in o.data.materials))
jersey.modifiers.clear();jersey.parent=None
jersey.matrix_world.identity()
for o in list(bpy.context.scene.objects):
    if o!=jersey:bpy.data.objects.remove(o,do_unlink=True)
for index,team in enumerate(['deep-teal','warm-ivory']):
    ob=jersey if index==0 else jersey.copy()
    if index:ob.data=jersey.data.copy();bpy.context.collection.objects.link(ob)
    ob.name='jersey-'+team;ob.animation_data_clear();ob.vertex_groups.clear()
    ob.data.materials.clear();ob.data.materials.append(material('fabric-'+team,(1,1,1),.94,texture='jersey-'+team+'.jpg'))
    # Keep the original front/back UV layout; centre both garments at local Y=.9.
    lo=min(v.co.z for v in ob.data.vertices);hi=max(v.co.z for v in ob.data.vertices)
    ob.location=(index*.95-.475,0,.9-(hi+lo)/2)
    # Original trim vertex masks are shader data, not a displayed vertex colour.
    for attr in list(ob.data.color_attributes):ob.data.color_attributes.remove(attr)
    solid=ob.modifiers.new('fabric-thickness','SOLIDIFY');solid.thickness=.004
export('uniforms')
(ROOT/'verification/authoring.json').write_text(json.dumps({'units':'metres','up':'Y','court':[28.65,15.24],'spectators':len(spots),'assets':stats},indent=2)+'\n')
