#!/usr/bin/env python3
"""Build the original open-wheel asset with Blender 4.3+ (no external assets).

    blender -b --python build_model.py
    blender -b --python build_model.py -- --render

Geometry helpers use the delivered glTF frame: metres, Y up, forward +Z.
Blender receives (x, -z, y); the glTF export converts it back to (x, y, z).
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
TAU = math.tau
PAINT = None


def bvec(v):
    return Vector((v[0], -v[2], v[1]))


def material(name, color, metallic=0.0, roughness=0.4):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def mesh(name, verts, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name + "Mesh")
    data.from_pydata([bvec(v) for v in verts], [], faces)
    data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    # Consistent outward normals for custom closed hulls and revolved parts.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def join(name, objects, pivot=(0.0, 0.0, 0.0)):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = objects[0]
    obj.name = name
    bpy.context.scene.cursor.location = bvec(pivot)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    obj.select_set(False)
    return obj


def box(name, center, size, mat, bevel=0.0):
    x, y, z = center
    a, b, c = (v * 0.5 for v in size)
    verts = [(x + i*a, y + j*b, z + k*c)
             for i, j, k in [(-1,-1,-1), (1,-1,-1), (1,1,-1), (-1,1,-1),
                             (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1)]]
    faces = [(0,3,2,1), (4,5,6,7), (0,1,5,4), (1,2,6,5),
             (2,3,7,6), (3,0,4,7)]
    obj = mesh(name, verts, faces, mat)
    if bevel:
        modifier = obj.modifiers.new("Soft machined edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.affect = "EDGES"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def loft(name, sections, mat, smooth=True):
    """Eight-corner rounded rectangular sections: (z, halfwidth, bottom, top)."""
    verts = []
    for z, w, bottom, top in sections:
        h = top - bottom
        verts.extend([(w*.70,top,z), (-w*.70,top,z), (-w,top-h*.22,z),
                      (-w,bottom+h*.2,z), (-w*.7,bottom,z), (w*.7,bottom,z),
                      (w,bottom+h*.2,z), (w,top-h*.22,z)])
    faces = [tuple(reversed(range(8)))]
    for i in range(len(sections)-1):
        for j in range(8):
            faces.append((i*8+j, i*8+(j+1)%8, (i+1)*8+(j+1)%8, (i+1)*8+j))
    faces.append(tuple(range((len(sections)-1)*8, len(sections)*8)))
    return mesh(name, verts, faces, mat, smooth)


def rod(name, start, end, radius, mat, segments=10):
    p, q = Vector(start), Vector(end)
    axis = (q-p).normalized()
    tangent = axis.cross(Vector((0,1,0)))
    if tangent.length < .01:
        tangent = axis.cross(Vector((1,0,0)))
    tangent.normalize()
    bitangent = axis.cross(tangent).normalized()
    verts = [tuple(center + radius*(math.cos(i*TAU/segments)*tangent +
                                    math.sin(i*TAU/segments)*bitangent))
             for center in (p,q) for i in range(segments)]
    faces = [tuple(reversed(range(segments))), tuple(range(segments,2*segments))]
    faces.extend((i,(i+1)%segments,(i+1)%segments+segments,i+segments)
                 for i in range(segments))
    return mesh(name, verts, faces, mat, True)


def ring_x(name, center, profile, mat, segments=40):
    """Closed surface of revolution around a wheel's local X axle."""
    cx, cy, cz = center
    verts = [(cx+x, cy+r*math.cos(i*TAU/segments), cz+r*math.sin(i*TAU/segments))
             for x,r in profile for i in range(segments)]
    faces = []
    for j in range(len(profile)):
        for i in range(segments):
            faces.append((j*segments+i, j*segments+(i+1)%segments,
                          ((j+1)%len(profile))*segments+(i+1)%segments,
                          ((j+1)%len(profile))*segments+i))
    return mesh(name, verts, faces, mat, True)


def ellipsoid(name, center, radii, mat, segments=24, rings=12):
    cx,cy,cz = center
    rx,ry,rz = radii
    verts = [(cx,cy+ry,cz)]
    for j in range(1,rings):
        theta = math.pi*j/rings
        for i in range(segments):
            phi = TAU*i/segments
            verts.append((cx+rx*math.sin(theta)*math.cos(phi),cy+ry*math.cos(theta),
                          cz+rz*math.sin(theta)*math.sin(phi)))
    verts.append((cx,cy-ry,cz))
    faces = []
    for i in range(segments):
        faces.append((0,1+i,1+(i+1)%segments))
    for j in range(rings-2):
        for i in range(segments):
            a=1+j*segments+i
            b=1+j*segments+(i+1)%segments
            faces.append((a,a+segments,b+segments,b))
    pole=len(verts)-1
    base=1+(rings-2)*segments
    for i in range(segments):
        faces.append((pole,base+(i+1)%segments,base+i))
    return mesh(name, verts, faces, mat, True)


def wing(name, span, z0, chord, height, mat, sweep=.05):
    """A cambered closed airfoil with swept outboard sections."""
    xs=[-span/2,-span*.28,0,span*.28,span/2]
    # Leading edge is +Z. Eight points describe each closed airfoil section.
    profile=[(1,.00),(.90,.025),(.50,.045),(.0,.075),
             (.0,.035),(.5,.003),(.9,-.006),(1,-.012)]
    verts=[]
    for x in xs:
        tip=abs(x)/(span/2)
        for t,dy in profile:
            verts.append((x,height+dy+.018*tip**2,z0+t*chord-sweep*tip))
    faces=[tuple(reversed(range(8)))]
    for j in range(len(xs)-1):
        faces.extend((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i)
                     for i in range(8))
    faces.append(tuple(range(32,40)))
    return mesh(name,verts,faces,mat,True)


def wheel(name, x, y, z, width, radius, rubber, graphite, alloy, brake, lug):
    # Tread extrema are at cardinal vertices, so the delivered tyres touch Y=0.
    p=[(-width/2,.185),(-width/2,radius-.060),(-width/2+.018,radius-.018),
       (-width/2+.045,radius),(width/2-.045,radius),
       (width/2-.018,radius-.018),(width/2,radius-.060),(width/2,.185)]
    parts=[ring_x(name,(x,y,z),p,rubber,48)]
    for side in [-1,1]:
        fx=x+side*(width/2+.001)
        rim=[(-.008,.177),(-.008,.194),(.008,.194),(.008,.177)]
        parts.append(ring_x("Rim",(fx,y,z),rim,alloy,24))
        parts.append(rod("Brake disc",(fx-side*.026,y,z),(fx-side*.018,y,z),.166,brake,20))
        parts.append(rod("Hub",(fx-side*.015,y,z),(fx+side*.012,y,z),.057,graphite,12))
        for i in range(8):
            a=TAU*i/8
            parts.append(rod("Forged spoke",(fx,y+.047*math.cos(a),z+.047*math.sin(a)),
                             (fx,y+.177*math.cos(a+.13),z+.177*math.sin(a+.13)),.012,alloy,4))
        parts.append(rod("Center lock",(fx,y,z),(fx+side*.021,y,z),.029,lug,6))
    obj=join(name,parts,(x,y,z))
    obj["axle"]="Local X; metres; pivot at wheel centre"
    return obj


def build():
    global PAINT
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.materials):
        bpy.data.materials.remove(old)
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    scene.unit_settings.scale_length=1.0
    PAINT=material("Paint 1",(.015,.48,.39),.48,.25)
    PAINT.node_tree.nodes.get("Principled BSDF").inputs["Coat Weight"].default_value=.42
    graphite=material("Graphite",(.019,.026,.034),.30,.32)
    rubber=material("Slick Rubber",(.022,.025,.029),.0,.76)
    alloy=material("Forged Alloy",(.29,.34,.37),.88,.25)
    brake=material("Brake Carbon",(.080,.087,.090),.45,.62)
    lug=material("Center Lock",(.58,.34,.12),.80,.25)
    seat=material("Cockpit Interior",(.013,.018,.021),.0,.87)
    helmet=material("Helmet Ceramic",(.83,.90,.92),.16,.24)
    visor=material("Visor",(.022,.066,.100),.70,.16)
    red=material("Rear Safety Light",(.8,.02,.005),.15,.3)
    red.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value=(1,.025,.002,1)
    red.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value=1.5

    # The floor is deliberately below the cockpit: no roof or filled opening.
    floor=loft("Floor",[(-1.95,.32,.100,.145),(-1.30,.65,.10,.145),
                            (-.35,.70,.10,.145),(.65,.36,.10,.145),(1.58,.15,.10,.145)],graphite,False)
    body_parts=[loft("Nose",[(.31,.273,.16,.61),(.67,.235,.17,.57),
                              (1.18,.156,.20,.49),(1.71,.105,.23,.40),
                              (2.02,.087,.24,.34),(2.08,.055,.26,.32)],PAINT)]
    # Sidepods: upper shoulders flare around a separate open central cockpit.
    for sign in [-1,1]:
        pod=loft("Sidepod",[(-1.61,.17,.16,.31),(-1.12,.26,.16,.45),
                            (-.65,.28,.16,.50),(-.16,.25,.17,.53),
                            (.13,.17,.22,.52)],PAINT)
        # Translate each local loft and pull its upper aft end inward.
        for v in pod.data.vertices:
            v.co.x += sign*.365
        body_parts.append(pod)
    body_parts.append(loft("Engine cover",[(-1.82,.08,.16,.33),(-1.44,.16,.16,.48),
                                           (-1.04,.215,.17,.66),(-.73,.225,.18,.70),
                                           (-.58,.215,.18,.66)],PAINT))
    # Rolled shoulders frame a visible, recessed cockpit opening from -.58 to +.31.
    for sign in [-1,1]:
        rail=loft("Cockpit rim",[(-.61,.052,.49,.63),(-.40,.048,.49,.625),
                                 (-.02,.045,.49,.62),(.25,.047,.48,.605),
                                 (.36,.041,.47,.585)],PAINT)
        for v in rail.data.vertices:
            v.co.x+=sign*.235
        body_parts.append(rail)
    body=join("Body",body_parts)
    body["paint_material"]="Paint 1"
    body["design"]="Original unbranded open-wheel formula car"
    # Intakes are inset dark mouths on the sidepod shoulders.
    intakes=[]
    for sign in [-1,1]:
        intakes.append(box("Intake",(sign*.422,.407,.146),(.248,.115,.022),graphite,.018))
        for z in [-.70,-.82,-.94]:
            intakes.append(box("Cooling slot",(sign*.51,.485,z),(.16,.009,.029),graphite,.006))
    join("Intakes",intakes)
    # Dark tub, seat and dashboard remain visibly below the surrounding rim.
    cockpit_parts=[box("Tub floor",(0,.265,-.12),(.395,.07,.88),seat,.025),
                   box("Seat back",(0,.438,-.47),(.33,.30,.08),seat,.035),
                   box("Dashboard",(0,.48,.285),(.36,.13,.08),graphite,.025)]
    for sign in [-1,1]:
        cockpit_parts.append(box("Inner cockpit wall",(sign*.194,.387,-.12),(.032,.23,.78),seat,.009))
    join("Cockpit",cockpit_parts)
    # A separate small steering wheel sits in front of the helmet.
    steering=[]
    points=[(-.12,.53,.19),(-.10,.58,.19),(.10,.58,.19),(.12,.53,.19),(.09,.485,.19),(-.09,.485,.19)]
    for p,q in zip(points,points[1:]+points[:1]):
        steering.append(rod("Steering rim",p,q,.012,graphite,8))
    steering.append(box("Steering hub",(0,.534,.19),(.085,.055,.025),graphite,.008))
    join("SteeringWheel",steering)
    # Driver's shoulders stay below the rim; helmet and curved visor face +Z.
    ellipsoid("Driver",(0,.45,-.245),(.165,.13,.155),graphite,20,8)
    helmet_parts=[ellipsoid("Shell",(0,.695,-.235),(.123,.142,.137),helmet,28,14)]
    # Visor patch on the forward spherical cap, with no texture or branding.
    verts=[]
    for j in range(4):
        theta=1.09+j*.15
        for i in range(15):
            phi=.18+math.pi*i/14*.88
            verts.append((.125*math.sin(theta)*math.cos(phi),.695+.144*math.cos(theta),
                          -.235+.140*math.sin(theta)*math.sin(phi)))
    faces=[(j*15+i,j*15+i+1,(j+1)*15+i+1,(j+1)*15+i) for j in range(3) for i in range(14)]
    helmet_parts.append(mesh("Visor",verts,faces,visor,True))
    helmet_parts.append(rod("Helmet vent",(-.045,.625,-.107),(.045,.625,-.107),.008,graphite,8))
    join("Helmet",helmet_parts)
    # Open roll hoop behind the head. Its negative space reads from every angle.
    hoop=[]
    path=[(-.18,.59,-.53),(-.14,.85,-.56),(0,.96,-.57),(.14,.85,-.56),(.18,.59,-.53)]
    for a,b in zip(path,path[1:]):
        hoop.append(rod("Roll hoop",a,b,.028,graphite,10))
    join("RollHoop",hoop)
    # A low shark fin flows down the rear cover, behind the open roll hoop.
    fin=mesh("EngineFin",[(0,.67,-.64),(0,.81,-.83),(0,.42,-1.64),
                           (.018,.67,-.64),(.018,.81,-.83),(.018,.42,-1.64)],
             [(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],PAINT)

    front=[wing("Main front plane",1.98,1.86,.44,.160,PAINT,.0),
           wing("Front flap",1.91,1.68,.24,.245,graphite,.03),
           # This inboard flap ends before the exposed front tyres (x=+/-.705).
           wing("Upper front flap",1.34,1.55,.19,.315,PAINT,.055)]
    for sign in [-1,1]:
        front.append(box("Front endplate",(sign*.985,.27,1.925),(.030,.27,.66),PAINT,.009))
        front.append(rod("Wing stay",(sign*.075,.29,1.94),(sign*.075,.17,2.04),.018,graphite,8))
    join("FrontWing",front)
    # Rear wing's trailing edge determines the -2.30m longitudinal bound.
    rear=[wing("Rear main plane",1.30,-2.30,.37,.855,PAINT,0),
          wing("Rear upper flap",1.30,-2.28,.205,1.015,graphite,0)]
    for sign in [-1,1]:
        rear.append(box("Rear endplate",(sign*.660,.910,-2.055),(.028,.365,.49),PAINT,.012))
        rear.append(rod("Rear pylon",(sign*.19,.21,-1.78),(sign*.19,.865,-2.12),.025,graphite,8))
    join("RearWing",rear)
    diffuser=[box("Diffuser",(0,.177,-1.77),(.85,.06,.48),graphite,.01)]
    for x in [-.37,-.185,0,.185,.37]:
        diffuser.append(box("Diffuser strake",(x,.185,-1.865),(.012,.15,.39),graphite))
    join("Diffuser",diffuser)
    box("RainLight",(0,.32,-1.997),(.09,.055,.025),red,.009)

    suspension=[]
    for z,track,cy in [(1.25,.85,.34),(-1.31,.83,.36)]:
        for sign in [-1,1]:
            for h in [.245,.405]:
                for delta in [-.24,.24]:
                    suspension.append(rod("Wishbone",(sign*.24,h,z+delta),(sign*track,cy,z),.014,graphite,8))
            suspension.append(rod("Pushrod",(sign*.285,.51,z-.08),(sign*.77,.255,z),.012,alloy,8))
            suspension.append(rod("Track rod",(sign*.22,.33,z+.12),(sign*.78,.33,z+.06),.010,graphite,8))
    join("Suspension",suspension)
    for label,sign in [("L",1),("R",-1)]:
        wheel("WheelFront"+label,sign*.85,.34,1.25,.29,.34,rubber,graphite,alloy,brake,lug)
        wheel("WheelRear"+label,sign*.83,.36,-1.31,.35,.36,rubber,graphite,alloy,brake,lug)

    # Export a single identity root, with independent wheel transforms.
    root=bpy.data.objects.new("Formula",None)
    bpy.context.collection.objects.link(root)
    root["length_m"]=4.6
    root["forward"]="+Z"
    root["up"]="+Y"
    root["origin"]="ground; centered X/Z"
    root["license"]="CC0-1.0; original procedural geometry; no external assets"
    for obj in list(scene.objects):
        if obj.type=="MESH":
            obj.parent=root
    bpy.context.view_layer.update()
    # Apply explicit triangulation before export: budget is the delivered topology.
    for obj in scene.objects:
        if obj.type=="MESH":
            mod=obj.modifiers.new("Delivered triangles","TRIANGULATE")
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
    triangles=sum(len(o.data.polygons) for o in scene.objects if o.type=="MESH")
    assert triangles<=12000, f"Triangle budget exceeded: {triangles}"
    bounds=[o.matrix_world@v.co for o in scene.objects if o.type=="MESH" for v in o.data.vertices]
    assert abs(max(-v.y for v in bounds)-2.3)<1e-5
    assert abs(min(-v.y for v in bounds)+2.3)<1e-5
    bpy.ops.export_scene.gltf(filepath=str(HERE/"formula.glb"),export_format="GLB",
                              export_yup=True,export_apply=True,export_extras=True,
                              export_materials="EXPORT",export_cameras=False,
                              export_lights=False,export_animations=False)
    print(f"EXPORTED formula.glb: {triangles:,} triangles")
    return root


def render_preview():
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=96
    # Some packaged Blender builds omit OpenImageDenoise; remain portable.
    scene.cycles.use_denoising=False
    scene.render.resolution_x=1600
    scene.render.resolution_y=1200
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(HERE/"preview.png")
    scene.world.color=(.15,.15,.15)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.19,.22,.27,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.45
    mat=material("Preview Ground",(.075,.09,.115),.10,.52)
    box("Preview Ground",(0,-.055,0),(200,.10,200),mat)
    def area(name,position,power,size,color):
        light=bpy.data.lights.new(name,"AREA")
        light.energy=power
        light.shape="DISK"
        light.size=size
        light.color=color
        obj=bpy.data.objects.new(name,light)
        bpy.context.collection.objects.link(obj)
        obj.location=bvec(position)
        obj.rotation_euler=(bvec((0,.2,0))-obj.location).to_track_quat("-Z","Y").to_euler()
    area("Large softbox",(1,6,4),1600,6,(.88,.94,1))
    area("Warm edge",(-4,3,-3),1400,5,(1,.79,.59))
    area("Side fill",(4,2,-3),1100,4,(.54,.76,1))
    camera=bpy.data.cameras.new("Preview Camera")
    obj=bpy.data.objects.new("Preview Camera",camera)
    bpy.context.collection.objects.link(obj)
    obj.location=bvec((6.5,4.8,7.0))
    obj.rotation_euler=(bvec((0,.35,0))-obj.location).to_track_quat("-Z","Y").to_euler()
    camera.type="ORTHO"
    camera.ortho_scale=5.8
    scene.camera=obj
    scene.view_settings.view_transform="AgX"
    bpy.ops.render.render(write_still=True)


if __name__=="__main__":
    import sys
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    build()
    if args.render:
        render_preview()
