"""Build the articulated, fictional chase truck with Blender 4.3.

Run: blender --background --python scripts/generate_truck.py
Original geometry, adapted from the CC0 visual design/palette of the repository's
fire-v7/source/vehicles.py and mesh.py. Those files are never imported or changed.
No brands, insignia, licence plates, decals, text, textures, or external assets.
Authoring coordinates throughout this file are metres, Y up, +Z forward.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "models" / "fire-truck.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 24

PALETTE = {
    "RedPaint": "#B82535", "RedShade": "#791E2D", "Ivory": "#E9E3CC",
    "SafetyGold": "#EED354", "Rubber": "#202B30", "Charcoal": "#17232D",
    "Steel": "#9DAEAE", "SteelShade": "#536774", "Glass": "#294D61",
    "HoseCanvas": "#D6B46A", "BeaconRed": "#F44344", "Headlamp": "#FFE5B0",
    "Amber": "#F38337",
}

def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

MATERIALS = {}
for name, hx in PALETTE.items():
    rgba = tuple(linear(int(hx[i:i+2], 16) / 255) for i in (1, 3, 5)) + (1,)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = .66
    if name in ("Steel", "SteelShade"):
        bsdf.inputs["Metallic"].default_value = .52
        bsdf.inputs["Roughness"].default_value = .44
    if name == "Rubber":
        bsdf.inputs["Roughness"].default_value = .97
    if name == "Glass":
        bsdf.inputs["Roughness"].default_value = .24
        bsdf.inputs["Metallic"].default_value = .22
    if name in ("BeaconRed", "Headlamp", "Amber"):
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = .9 if name == "BeaconRed" else .35
    MATERIALS[name] = m

def xyz(v):
    """Y-up author coordinates -> Blender Z-up; export converts them back."""
    return (v[0], -v[2], v[1])

def group(name, parent=None, at=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(at)
    obj["authorAxes"] = "+Y up; +Z forward; metres"
    return obj

class Shape:
    """Surface modeller, with outward winding and material-batched static parts."""
    def __init__(self):
        self.vertices, self.faces, self.colors, self.smooth = [], [], [], []

    def add(self, vertices, faces, color, smooth=False):
        first = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(first + i for i in face) for face in faces)
        self.colors.extend([color] * len(faces))
        self.smooth.extend([smooth] * len(faces))

    def box(self, center, size, color, bevel=0):
        half = [s / 2 for s in size]
        if not bevel:
            vertices = [(center[0] + x*half[0], center[1] + y*half[1], center[2] + z*half[2])
                        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                      (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
            faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
            self.add(vertices, faces, color)
            return
        b = min(bevel, min(half) * .8)
        vertices, faces = [], []
        def face(points, normal):
            if (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).dot(Vector(normal)) < 0:
                points.reverse()
            faces.append(tuple(range(len(vertices), len(vertices)+len(points))))
            vertices.extend(tuple(p[i]+center[i] for i in range(3)) for p in points)
        for axis in range(3):
            others = [i for i in range(3) if i != axis]
            for sign in (-1,1):
                points=[]
                for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    p=[0.,0.,0.]; p[axis]=sign*half[axis]
                    p[others[0]]=u*(half[others[0]]-b); p[others[1]]=v*(half[others[1]]-b)
                    points.append(p)
                n=[0.,0.,0.]; n[axis]=sign; face(points,n)
        for along in range(3):
            a,c=[i for i in range(3) if i != along]
            for sa in (-1,1):
                for sc in (-1,1):
                    points=[]
                    for end, which in [(-1,0),(1,0),(1,1),(-1,1)]:
                        p=[0.,0.,0.];p[along]=end*(half[along]-b)
                        p[a]=sa*(half[a]-(b if which else 0))
                        p[c]=sc*(half[c]-(0 if which else b));points.append(p)
                    n=[0.,0.,0.];n[a]=sa;n[c]=sc;face(points,n)
        for sx in (-1,1):
            for sy in (-1,1):
                for sz in (-1,1):
                    signs=(sx,sy,sz);points=[]
                    for axis in range(3):
                        p=[signs[i]*(half[i]-b) for i in range(3)]
                        p[axis]=signs[axis]*half[axis];points.append(p)
                    face(points,signs)
        self.add(vertices, faces, color)

    def cylinder(self, a, b, radius, color, segments=12, r2=None):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        helper=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0))
        u=axis.cross(helper).normalized(); v=axis.cross(u).normalized()
        r2=radius if r2 is None else r2
        vertices=[tuple(c + r*(math.cos(i*math.tau/segments)*u + math.sin(i*math.tau/segments)*v))
                  for c,r in ((a,radius),(b,r2)) for i in range(segments)]
        faces=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
        faces += [tuple(range(segments-1,-1,-1)), tuple(range(segments,2*segments))]
        self.add(vertices,faces,color)

    def torus(self, center, radius, tube, color, major=12, minor=4):
        # Reel axis X. Surface starts with an outward quad on the upper rim.
        vertices=[]
        for i in range(major):
            a=math.tau*i/major
            for j in range(minor):
                b=math.tau*j/minor
                vertices.append((center[0]+tube*math.sin(b),
                                 center[1]+(radius+tube*math.cos(b))*math.cos(a),
                                 center[2]+(radius+tube*math.cos(b))*math.sin(a)))
        faces=[]
        for i in range(major):
            for j in range(minor):
                faces.append((i*minor+j,i*minor+(j+1)%minor,
                              ((i+1)%major)*minor+(j+1)%minor,((i+1)%major)*minor+j))
        self.add(vertices,[tuple(reversed(face)) for face in faces],color)

    def object(self, name, parent, at=(0,0,0)):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([xyz(v) for v in self.vertices],[],self.faces)
        mesh.update()
        mats=list(dict.fromkeys(self.colors))
        for c in mats:mesh.materials.append(MATERIALS[c])
        for polygon,c,smooth in zip(mesh.polygons,self.colors,self.smooth):
            polygon.material_index=mats.index(c);polygon.use_smooth=smooth
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent=parent;obj.location=xyz(at)
        return obj

root=group("FireTruckRoot")
root["provenance"]="Original CC0 geometry; visual adaptation of fire-v7 CC0 fictional rescue vehicles"
root["wheelRadiusMeters"]=.52
root["front"]="+Z"
root["groundY"]=0.
body=Shape()
body.box((0,.72,0),(2.12,.38,6.18),"Charcoal",.035)
body.box((0,1.57,2.07),(2.34,1.77,2.24),"RedPaint",.14)
body.box((0,2.46,2.07),(2.37,.16,2.28),"RedShade",.04)
body.box((0,1.49,-1.12),(2.32,1.72,4.12),"RedPaint",.09)
body.box((0,2.40,-1.12),(2.19,.13,4.03),"SteelShade")
body.box((0,2.02,3.207),(2.11,.78,.045),"Charcoal",.035)
for side in (-1,1):
    body.box((side*.533,2.03,3.237),(.94,.65,.025),"Glass")
    body.box((side*1.18,2.01,2.17),(.025,.65,1.46),"Glass")
    body.box((side*1.20,1.47,2.08),(.028,.17,2.03),"Ivory")
    body.box((side*1.204,1.02,2.08),(.031,.075,2.03),"SafetyGold")
    body.box((side*1.207,1.18,1.20),(.025,.78,.025),"RedShade")
    body.box((side*1.217,1.64,1.48),(.045,.045,.23),"SteelShade")
    body.cylinder((side*1.14,1.98,2.95),(side*1.42,1.98,3.0),.025,"SteelShade",6)
    body.box((side*1.44,2.00,3.0),(.14,.30,.16),"Charcoal")
    body.box((side*1.44,2.01,3.087),(.105,.235,.022),"Steel")
    body.box((side*1.19,.60,1.41),(.30,.065,.61),"SteelShade")
    body.box((side*1.19,.80,1.41),(.30,.065,.61),"SteelShade")
    body.box((side*.86,1.25,3.245),(.43,.28,.075),"Charcoal")
    for dx in (-.10,.10):body.box((side*.86+dx,1.25,3.294),(.14,.16,.025),"Headlamp")
    body.box((side*1.08,1.59,3.246),(.10,.12,.035),"Amber")
    for i,z in enumerate((-.03,-1.08,-2.15)):
        body.box((side*1.183,1.43,z),(.035,1.10,.94),"SteelShade")
        body.box((side*1.208,1.45,z),(.025,1.00,.86),"Steel")
        body.box((side*1.229,1.00,z),(.02,.055,.24),"Charcoal")
    body.box((side*1.21,2.05,-1.12),(.03,.14,4.03),"Ivory")
    body.box((side*1.213,1.86,-1.12),(.035,.065,4.03),"SafetyGold")
    body.cylinder((side*.98,2.50,-3.01),(side*.98,2.50,.71),.033,"Steel",6)
    body.box((side*.96,1.11,-3.215),(.18,.16,.03),"BeaconRed")
    body.box((side*.96,1.33,-3.215),(.18,.13,.03),"Amber")
body.box((0,.88,3.30),(2.44,.23,.24),"SteelShade",.035)
body.box((0,.83,-3.25),(2.43,.22,.24),"SteelShade")
body.box((0,1.30,3.25),(.86,.32,.045),"Charcoal")
for y in (1.22,1.30,1.38):body.box((0,y,3.282),(.78,.021,.022),"Steel")
body.box((0,2.59,1.83),(1.70,.09,.30),"SteelShade")
body.cylinder((0,2.51,-2.1),(0,2.63,-2.1),.48,"SteelShade",12)
body.box((1.18,2.40,-.56),(.30,.15,.20),"SteelShade")
# Compact pump station: coloured couplings and pressure dials, no written gauges.
body.box((-1.25,1.39,.31),(.055,.71,.77),"Charcoal")
for z in (.08,.32,.56):
    body.cylinder((-1.29,1.58,z),(-1.32,1.58,z),.074,"Ivory",6)
    body.cylinder((-1.28,1.25,z),(-1.40,1.25,z),.057,"Steel",6)
body.object("Body",root)

WHEEL_RADIUS=.52
for axle,z in (("Front",2.10),("Rear",-1.98)):
    for side,label in ((-1,"Left"),(1,"Right")):
        wheel=group("Wheel"+axle+label,root,(side*1.12,WHEEL_RADIUS,z))
        wheel["radiusMeters"]=WHEEL_RADIUS
        wheel["rollAxis"]="X"
        s=Shape()
        s.cylinder((-.20,0,0),(.20,0,0),WHEEL_RADIUS,"Rubber",12)
        outer=side*.208
        s.cylinder((outer,0,0),(outer+side*.035,0,0),.328,"Steel",12)
        s.cylinder((outer+side*.038,0,0),(outer+side*.068,0,0),.135,"SteelShade",8)
        # Asymmetric rim tabs make actual wheel roll visible at chase distance.
        for offset in (-.195,.195):
            s.box((outer+side*.04,offset,0),(.025,.055,.31),"SteelShade")
        s.box((outer+side*.046,.27,0),(.025,.045,.10),"SafetyGold")
        s.object("Tyre"+axle+label,wheel)

ladder_yaw=group("LadderYaw",root,(0,2.64,-2.10))
ladder_pitch=group("LadderPitch",ladder_yaw)
base=Shape()
for side in (-1,1):base.box((side*.40,.06,1.66),(.075,.11,3.50),"Steel")
for i in range(10):base.box((0,.06,.12+i*.35),(.79,.060,.065),"SteelShade")
base.object("LadderBase",ladder_pitch)
fold=group("LadderFoldPivot",ladder_pitch,(0,.19,3.31))
fold.rotation_mode="XYZ";fold.rotation_euler.x=math.pi
extension=group("LadderExtension",fold)
upper=Shape()
for side in (-1,1):upper.box((side*.30,0,1.39),(.065,.10,2.94),"Steel")
for i in range(8):upper.box((0,0,.13+i*.37),(.60,.055,.060),"SteelShade")
upper.object("LadderUpper",extension)

reel=group("HoseReel",root,(1.32,1.17,.16))
s=Shape()
s.cylinder((-.15,0,0),(.15,0,0),.23,"RedShade",12)
for x in (-.08,.04):s.torus((x,0,0),.265,.042,"HoseCanvas",12,4)
s.cylinder((.15,0,0),(.23,0,0),.085,"Steel",8)
s.object("HoseCoil",reel)
nozzle=group("HoseNozzlePivot",root,(1.28,2.48,-.56))
s=Shape()
s.cylinder((0,0,-.28),(0,0,.18),.068,"SteelShade",8)
s.cylinder((0,0,.18),(0,0,.36),.088,"Steel",8,r2=.052)
s.box((0,-.13,-.03),(.08,.22,.12),"Charcoal")
s.object("HoseNozzle",nozzle)

for side,label in ((-1,"Left"),(1,"Right")):
    s=Shape()
    s.cylinder((0,0,0),(0,.20,0),.18,"BeaconRed",12,r2=.145)
    s.object("Beacon"+label,root,(side*.59,2.64,1.83))

def animate(obj,name,path,samples,interpolation="LINEAR"):
    obj.animation_data_create()
    action=bpy.data.actions.new(name+"_"+obj.name)
    obj.animation_data.action=action
    for source_frame,value in samples:
        frame=source_frame-1  # glTF clips start at t=0, with no 1/24 s dead frame.
        setattr(obj,path,value)
        obj.keyframe_insert(data_path=path,frame=frame)
    for fcurve in action.fcurves:
        for key in fcurve.keyframe_points:key.interpolation=interpolation
    obj.animation_data.action=None
    track=obj.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,int(samples[0][0])-1,action)
    strip.name=name
    # Animation is opt-in: the exported bind pose remains road-ready and stowed.
    track.mute=True

for obj in [o for o in bpy.context.scene.objects if o.name.startswith("Wheel")]:
    obj.rotation_mode="XYZ"
    animate(obj,"WheelRoll","rotation_euler",[(1,(0,0,0)),(25,(math.tau,0,0))])
animate(ladder_yaw,"LadderDeploy","rotation_euler",[(1,(0,0,0)),(73,(0,0,.16))])
animate(ladder_pitch,"LadderDeploy","rotation_euler",[(1,(0,0,0)),(73,(-.80,0,0))])
animate(fold,"LadderDeploy","rotation_euler",[(1,(math.pi,0,0)),(25,(math.pi,0,0)),(73,(0,0,0))])
animate(extension,"LadderDeploy","location",[(1,(0,0,0)),(49,(0,0,0)),(73,xyz((0,0,.50)))])
animate(nozzle,"HoseAim","rotation_euler",[(1,(0,0,0)),(25,(-.20,0,-.25)),(49,(0,0,0))])
for obj in [bpy.data.objects["BeaconLeft"],bpy.data.objects["BeaconRight"]]:
    left=obj.name.endswith("Left")
    on=(1,1,1);off=(.08,.08,.08)
    animate(obj,"BeaconFlash","scale",[(1,on if left else off),(13,off if left else on),(25,on if left else off)],"CONSTANT")

# Reset each authored bind transform after inserting keyframes.
for obj in [o for o in bpy.context.scene.objects if o.name.startswith("Wheel")]:obj.rotation_euler=(0,0,0)
ladder_yaw.rotation_euler=(0,0,0);ladder_pitch.rotation_euler=(0,0,0)
fold.rotation_euler=(math.pi,0,0);extension.location=(0,0,0);nozzle.rotation_euler=(0,0,0)
for name in ("BeaconLeft","BeaconRight"):bpy.data.objects[name].scale=(1,1,1)
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()

# Derive geometry evidence from authored mesh triangles, before animation export.
mesh_objects=[o for o in bpy.context.scene.objects if o.type=="MESH"]
triangle_count=0
for obj in mesh_objects:
    obj.data.calc_loop_triangles();triangle_count+=len(obj.data.loop_triangles)
corners=[obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
corners=[(p.x,p.z,-p.y) for p in corners]
bounds=[[min(p[i] for p in corners) for i in range(3)],[max(p[i] for p in corners) for i in range(3)]]
assert 2300 <= triangle_count <= 2700, f"Triangle budget: {triangle_count}"

# Export NLA tracks grouped by shared track name into four core glTF animations.
for obj in bpy.context.scene.objects:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:track.mute=False
OUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format="GLB",export_yup=True,
    export_animations=True,export_animation_mode="NLA_TRACKS",export_nla_strips=True,
    export_force_sampling=True,export_frame_range=False,export_extras=True,
    export_materials="EXPORT",export_cameras=False,export_lights=False)
evidence={"asset":"models/fire-truck.glb","triangles":triangle_count,
    "bytes":OUT.stat().st_size,"boundsMeters":bounds,
    "dimensionsMeters":[round(bounds[1][i]-bounds[0][i],5) for i in range(3)],
    "wheelRadiusMeters":WHEEL_RADIUS,"up":"+Y","forward":"+Z","groundY":0,
    "animationSeconds":{"WheelRoll":1,"LadderDeploy":3,"HoseAim":2,"BeaconFlash":1},
    "provenance":"CC0 original geometry, adapted from repository fire-v7 CC0 fictional rescue vehicle style/palette",
    "generator":"Blender 4.3.2; scripts/generate_truck.py"}
(ROOT/"verification").mkdir(exist_ok=True)
evidence.update({
    "restPose":"road-ready, ladder folded, all wheels grounded",
    "hierarchy":{
        "FireTruckRoot":["Body","WheelFrontLeft","WheelFrontRight","WheelRearLeft","WheelRearRight",
                         "LadderYaw","HoseReel","HoseNozzlePivot","BeaconLeft","BeaconRight"],
        "LadderYaw":["LadderPitch"],"LadderPitch":["LadderBase","LadderFoldPivot"],
        "LadderFoldPivot":["LadderExtension"],"LadderExtension":["LadderUpper"]},
    "wheelPivots":{"names":["WheelFrontLeft","WheelFrontRight","WheelRearLeft","WheelRearRight"],
        "radiusMeters":.52,"localRollAxis":"X","forwardRollRadiansPerMeter":1/.52,
        "frontAxleZ":2.10,"rearAxleZ":-1.98,"centerAbsX":1.12,"centerY":.52},
    "ladderPivots":{
        "LadderYaw":{"axis":"Y","restRadians":0,"clipFinalRadians":.16,"suggestedLimitsRadians":[-.6,.6]},
        "LadderPitch":{"axis":"X","restRadians":0,"clipFinalRadians":-.8,"suggestedLimitsRadians":[-1.05,0]},
        "LadderFoldPivot":{"axis":"X","restRadians":math.pi,"clipFinalRadians":0,"limitsRadians":[0,math.pi]},
        "LadderExtension":{"axis":"local Z","restMeters":0,"clipFinalMeters":.5,"limitsMeters":[0,.5]}},
    "animationPlayback":{
        "WheelRoll":{"loop":True,"durationSeconds":1,"use":"Optional constant-speed loop; use wheel pivots and distance/.52 for road-matched rolling"},
        "LadderDeploy":{"loop":False,"clampWhenFinished":True,"durationSeconds":3,"reverseToStow":True},
        "HoseAim":{"loop":True,"durationSeconds":2,"use":"Optional display sweep; direct HoseNozzlePivot aiming may replace it"},
        "BeaconFlash":{"loop":True,"durationSeconds":1,"use":"LINEAR scale pulses; restore both nodes to scale1 when driving separate cloned emissive materials","reducedMotion":"Skip flash clip; keep both lamps steadily emissive"}},
    "emissiveNodes":["BeaconLeft","BeaconRight"],
    "beaconMaterialNote":"Clone each node material before independent emissiveIntensity changes; red tail lamps share the source material.",
    "groundingNote":"Tyres are 12-sided regular cylinders with an exact bottom vertex at Y0; radius .52."
})
(ROOT/"verification"/"truck-authoring.json").write_text(json.dumps(evidence,indent=2)+"\n")
print("TRUCK_GEOMETRY",json.dumps(evidence))

if "--render" in sys.argv:
    # Independent asset inspection image; exported GLB above has no studio gear.
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:track.mute=True
    for name in ("BeaconLeft","BeaconRight"):bpy.data.objects[name].scale=(1,1,1)
    scene=bpy.context.scene
    scene.render.engine="CYCLES";scene.cycles.samples=32;scene.cycles.use_denoising=False
    scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new("StudioWorld");scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.76,.82,.85,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.7
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
    ground=bpy.context.object;ground.name="StudioGround"
    mat=bpy.data.materials.new("StudioGround");mat.diffuse_color=(.70,.77,.79,1);ground.data.materials.append(mat)
    for loc,power,size in [((-5,-6,10),1200,6),((6,4,7),800,5)]:
        lamp=bpy.data.lights.new("StudioArea","AREA");lamp.energy=power;lamp.shape="DISK";lamp.size=size
        obj=bpy.data.objects.new("StudioArea",lamp);bpy.context.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector((0,0,1.2))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.cameras.new("StudioCamera");obj=bpy.data.objects.new("StudioCamera",camera)
    bpy.context.collection.objects.link(obj);obj.location=(7,-9,6.6)
    obj.rotation_euler=(Vector((0,0,1.4))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera.type="ORTHO";camera.ortho_scale=8.9;scene.camera=obj
    scene.view_settings.view_transform="Standard"
    scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(ROOT/"verification"/"truck-studio.png")
    bpy.ops.render.render(write_still=True)
