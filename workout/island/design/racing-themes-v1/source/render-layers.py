"""Original periodic 3D scenery. Blender 4.3.2, CPU Cycles; no downloads.

blender -b --factory-startup --python source/render-layers.py -- /tmp/racing-themes-renders
Only the output directory supplied on the command line is written.
"""
import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

OUT = Path(sys.argv[sys.argv.index('--') + 1])
OUT.mkdir(parents=True, exist_ok=True)
PERIOD = 40
THEMES = {
    'city-night': {'ground': '#18283c', 'far': '#314257', 'mid': '#26374b', 'near': '#1b2b38', 'leaf': '#284c44', 'sun': '#8bb7fa', 'fill': '#748eae', 'energy': 1.2},
    'desert': {'ground': '#cf9b65', 'far': '#b99b8f', 'mid': '#ca8760', 'near': '#d6a875', 'leaf': '#6b7951', 'sun': '#ffe0ad', 'fill': '#c7d5db', 'energy': 2.2},
    'snow': {'ground': '#dbe9ed', 'far': '#96b1c3', 'mid': '#86a0b5', 'near': '#d8e6e9', 'leaf': '#405d61', 'sun': '#ffe7c0', 'fill': '#b5cee5', 'energy': 2.0},
    'coast': {'ground': '#e2c99d', 'far': '#8daeb2', 'mid': '#4c9198', 'near': '#d7bf8f', 'leaf': '#557650', 'sun': '#ffe0ad', 'fill': '#c0d4df', 'energy': 2.2},
}


def linear(c):
    vals = [int(c[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals)


def material(name, color, roughness=.85, metal=0, glow=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*linear(color), 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    if glow:
        p.inputs['Emission Color'].default_value = (*linear(color), 1)
        p.inputs['Emission Strength'].default_value = glow
    return m


def apply(obj, mat):
    obj.data.materials.append(mat)
    return obj


def cube(loc, size, mat, bevel=0):
    # Direct mesh construction avoids an expensive dependency-graph update for
    # every small skyline window.
    x,y,z = (v/2 for v in size)
    mesh = bpy.data.meshes.new('box')
    mesh.from_pydata([(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                      (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[],
                     [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    o = bpy.data.objects.new('box',mesh)
    bpy.context.collection.objects.link(o)
    o.location = loc
    apply(o, mat)
    if bevel:
        mod = o.modifiers.new('soft corners', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        o.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return o


def cone(loc, radius, depth, mat, top=0, vertices=9):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=top, depth=depth, location=loc)
    return apply(bpy.context.object, mat)


def ellipsoid(loc, scale, mat, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    return apply(o, mat)


def bar(a, b, radius, mat):
    a, b = Vector(a), Vector(b)
    d = b-a
    o = cone((a+b)/2, radius, d.length, mat, radius, 8)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def setup(theme, width=1024, height=256, scale=40, target=3):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 48
    s.cycles.use_denoising = False
    s.cycles.max_bounces = 3
    s.cycles.transparent_max_bounces = 2
    s.render.threads_mode = 'FIXED'
    s.render.threads = 8
    s.render.resolution_x, s.render.resolution_y = width, height
    s.render.resolution_percentage = 100
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.image_settings.color_depth = '8'
    s.render.image_settings.compression = 65
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.view_settings.exposure = 0
    s.view_settings.gamma = 1
    s.world.use_nodes = True
    s.world.node_tree.nodes['Background'].inputs[0].default_value = (*linear(theme['fill']), 1)
    s.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    bpy.ops.object.light_add(type='SUN', location=(-10, -15, 20))
    light = bpy.context.object
    light.data.energy = theme['energy']
    light.data.angle = math.radians(12)
    light.data.color = linear(theme['sun'])
    light.rotation_euler = (math.radians(24), math.radians(-32), math.radians(-25))
    bpy.ops.object.camera_add(location=(0, -35, target + 3.5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, target))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = scale
    s.camera = camera
    return s


def pine(x, y, h, leaf, trunk, snow=None):
    cone((x, y, h*.3), h*.045, h*.6, trunk, h*.035)
    for j, (z, r) in enumerate(((.4,.3),(.59,.24),(.76,.17))):
        cone((x,y,h*z),h*r,h*.55,leaf,vertices=9)
        if snow:
            cone((x,y,h*(z+.065)),h*r*.92,h*.45,snow,vertices=9)


def palm(x, y, h, leaf, trunk):
    bar((x,y,0),(x+.35,y,h*.95),h*.045,trunk)
    for j in range(7):
        angle = j*math.tau/7
        dx, dy = math.cos(angle), math.sin(angle)
        base=(x+.35,y,h*.95)
        tip=(x+.35+dx*h*.48,y+dy*h*.48,h*.77)
        ridge=(x+.35+dx*h*.25,y+dy*h*.25,h*1.08)
        verts=[base,(ridge[0]-dy*h*.09,ridge[1]+dx*h*.09,ridge[2]),tip,(ridge[0]+dy*h*.09,ridge[1]-dx*h*.09,ridge[2])]
        mesh=bpy.data.meshes.new('palm frond')
        mesh.from_pydata(verts,[],[(0,1,2),(0,2,3)])
        o=bpy.data.objects.new('palm frond',mesh)
        bpy.context.collection.objects.link(o)
        apply(o,leaf)


def mountain_range(offset, rock, snow):
    """A continuous, irregular ridgeline with angled snow fields, not cones."""
    verts=[]
    nx=65
    for row in range(5):
        for i in range(nx):
            x=-20+40*i/(nx-1)
            angle=(x+20)/40*math.tau
            ridge=2.3+1.6*math.sin(angle*3+.2)+.85*math.sin(angle*7+1.2)+.45*math.sin(angle*13+.7)
            h=max(.8,ridge)
            z=[-.6,.7+h*.27,1.4+h*.92,1.1+h*.72,-.4][row]
            if row in (1,2,3):z+=.25*math.sin(angle*(5+row)+row)
            verts.append((x+offset,row*3.2,z))
    faces=[]
    for row in range(4):
        for i in range(nx-1):
            a=row*nx+i;b=a+1;c=a+nx;d=c+1
            faces.extend([(a,b,d),(a,d,c)] if (i+row)%2 else [(a,b,c),(b,d,c)])
    mesh=bpy.data.meshes.new('continuous alpine ridge')
    mesh.from_pydata(verts,[],faces)
    obj=bpy.data.objects.new('continuous alpine ridge',mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(rock);obj.data.materials.append(snow)
    for p in obj.data.polygons:
        z=sum(verts[i][2] for i in p.vertices)/len(p.vertices)
        p.material_index=1 if z>2.85 and (p.index%7!=0 or z>3.7) else 0


def mesa(x,y,k,h,materials):
    verts=[];n=11
    for j,(z,r) in enumerate(((-.7,3),(.5,2.65),(h*.65,1.85),(h,1.65))):
        for i in range(n):
            angle=i*math.tau/n
            radius=r*k*(1+.09*math.sin(i*3.1+j*.7))
            verts.append((x+math.cos(angle)*radius,y+math.sin(angle)*radius,z))
    faces=[]
    for row in range(3):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    faces.append(tuple(range(3*n,4*n)))
    mesh=bpy.data.meshes.new('eroded stratified mesa');mesh.from_pydata(verts,[],faces)
    obj=bpy.data.objects.new('eroded stratified mesa',mesh);bpy.context.collection.objects.link(obj)
    for m in materials:obj.data.materials.append(m)
    for p in obj.data.polygons:p.material_index=min(len(materials)-1,p.index//n)


def render(theme_id, layer):
    t = THEMES[theme_id]
    s = setup(t)
    rng = random.Random(7127 + list(THEMES).index(theme_id)*100 + layer)
    ground = material('ground',t['ground'] if layer==2 else t[['far','mid'][layer]])
    rock = material('scenery',t[['far','mid','near'][layer]])
    leaf = material('foliage',t['leaf'])
    trunk = material('trunk','#735b48')
    snow = material('snow','#eef3f1')
    amber = material('warm windows','#f5dcb0',glow=.65)
    cyan = material('cool windows','#8ed7e4',glow=.8)
    cube((0,6,-4.7),(160,32,8),ground)
    # Geometry is repeated outside the camera as well, including shadow casters.
    # Orthographic projection and directional light keep the X period invariant.
    settings=[]
    count = (9 if theme_id=='desert' else 19,14,11)[layer]
    strata=[material('mesa lower','#ad8976'),material('mesa middle','#bb9681'),material('mesa upper','#c6a08b'),material('mesa top','#d2b398')]
    for i in range(count):
        settings.append((-20+(i+.3+rng.random()*.4)*40/count, rng.uniform(-1,5), rng.uniform(.7,1.3), rng.random()))
    for offset in (-40,0,40):
        if theme_id=='snow' and layer==0:
            mountain_range(offset,rock,snow)
            continue
        for i,(x,y,k,r) in enumerate(settings):
            x += offset
            if theme_id=='city-night':
                h = ((2.3+4.8*r) if layer==0 else (1.6+2.7*r) if layer==1 else (.6+1.2*r))
                w = (.9+1.1*k) if layer<2 else (2.1+k)
                depth=1.2+k*.7
                cube((x,y,h/2-.6),(w,depth,h),rock,.045)
                if layer<2:
                    cube((x,y,h-.51),(w*.75,depth*.8,.16),rock,.025)
                if layer==1 or layer==0:
                    for iz in range(1,int(h/.44)):
                        for ix in range(max(1,int(w/.46))):
                            if (i+iz*7+ix*3)%5==0: continue
                            cube((x-w*.34+ix*.46,y-depth/2-.012,iz*.44-.45),(.13,.023,.21),cyan if (i+iz)%3==0 else amber)
                elif i%2==0:
                    ellipsoid((x,y-.8,.9),(1.1,.65,.85),leaf)
                    cube((x,y-1.9,.05),(w,.035,.045),cyan)
            elif theme_id=='desert':
                if layer==0:
                    mesa(x,y,k,2.2+r*2.7,strata)
                elif layer==1:
                    ellipsoid((x,y,-.2),(4.8*k,3*k,1.2+r*1.7),rock,3)
                else:
                    ellipsoid((x,y,-.45),(3*k,1.8*k,.5+r*.5),rock)
                    if i%2==0:
                        ellipsoid((x+.7,y-1,.2),(.5*k,.4*k,.5),leaf)
                        ellipsoid((x-.6,y-1.6,-.1),(.7,.5,.4),rock)
            elif theme_id=='snow':
                if layer==0:
                    h=3.1+r*3.7
                    cone((x,y,h/2-.65),2.5*k,h,rock,vertices=6)
                    cone((x,y,h*.79-.65),1.17*k,h*.42,snow,vertices=6)
                elif layer==1:
                    ellipsoid((x,y,-.35),(3.3*k,2*k,.9),snow)
                    pine(x,y,2.1+r*1.6,leaf,trunk,snow)
                else:
                    ellipsoid((x,y,-.25),(2.9*k,1.8*k,.55+r*.6),snow,3)
                    if i%3==0: pine(x,y,1.2+r,leaf,trunk,snow)
            elif theme_id=='coast':
                if layer==0:
                    ellipsoid((x,y,-.65),(3.7*k,2*k,1.1+r*1.4),rock)
                    if i%3==0: palm(x,y,1.8+k,leaf,trunk)
                elif layer==1:
                    ellipsoid((x,y,-.8),(4.2*k,3*k,.7+r*.7),rock)
                    for j in range(2):
                        cube((x+j*.6,y-2-j*.25,-.45+j*.08),(1.3+k,.08,.035),material('wave','#a2c9c5'))
                else:
                    ellipsoid((x,y,-.2),(3.8*k,2*k,.7+r*.7),ground,3)
                    if i%3==0: palm(x,y,1.8+r*1.2,leaf,trunk)
    s.render.filepath=str(OUT/f'{theme_id}-layer-{layer}.png')
    bpy.ops.render.render(write_still=True)


def barrier(theme_id):
    t=THEMES[theme_id]
    s=setup(t,512,128,8,target=.75)
    metal=material('steel','#62717a' if theme_id!='city-night' else '#263e53',roughness=.5,metal=.5)
    dark=material('posts','#364751',roughness=.7,metal=.3)
    reflector=material('reflector','#ffb660' if theme_id!='city-night' else '#71d9ed',glow=.3)
    concrete=material('sandstone concrete','#d6b58b')
    timber=material('warm timber','#92704e')
    for offset in (-8,0,8):
        if theme_id=='desert':
            cube((offset,0,.52),(8,.44,1.04),concrete,.06)
            cube((offset,-.24,.92),(8,.035,.09),reflector)
            for x in (-3,-1,1,3): cube((offset+x,-.25,.4),(.035,.025,.7),dark)
        else:
            for z in (.58,.96): cube((offset,0,z),(8,.17,.14),metal,.02)
            for x in (-3,-1,1,3):
                cube((offset+x,.04,.49),(.14,.22,.98),timber if theme_id=='coast' else dark,.015)
                cube((offset+x,-.12,.99),(.095,.035,.10),reflector,.008)
                if theme_id=='snow': cube((offset+x,-.01,1.08),(.25,.3,.07),material('snow cap','#edf3f3'),.025)
    s.render.filepath=str(OUT/f'{theme_id}-barrier.png')
    bpy.ops.render.render(write_still=True)


for theme_id in THEMES:
    if len(sys.argv)>sys.argv.index('--')+2 and theme_id not in sys.argv[sys.argv.index('--')+2:]:continue
    for layer in range(3): render(theme_id,layer)
    barrier(theme_id)
print('RENDERED',OUT)
