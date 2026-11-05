"""Original basalt island, detached rock and motion2-compatible deck crew."""
import bpy, math, sys, json, random
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import geometry as g

def island():
    g.reset(0,'basalt-512.png');random.seed(71)
    # Concentric eroded terraces, with an asymmetric ridge rather than a cone.
    n=48;nr=12;vs=[(0,0,16)];rings=[]
    for j in range(1,nr+1):
        r=j/nr;ring=[]
        for i in range(n):
            a=i/n*math.tau
            wobble=1+.13*math.sin(a*3+.4)+.07*math.cos(a*7)
            x=math.cos(a)*r*38*wobble;y=math.sin(a)*r*30*wobble
            h=(1-r)**.75*19+math.sin(a*3+r*5)*(1-r)*4+math.cos(a*7-r*4)*(1-r)*2
            h+=math.exp(-((x+10)**2+(y-4)**2)/130)*10
            h-=math.exp(-((x-9)**2+(y+9)**2)/80)*5
            h=max(-1.4,h-1.3)
            ring.append(len(vs));vs.append((x,y,h))
        rings.append(ring)
    fs=[(0,rings[0][i],rings[0][(i+1)%n]) for i in range(n)]
    for a,b in zip(rings,rings[1:]):
        for i in range(n):
            k=(i+1)%n;fs.extend([(a[i],b[i],b[k]),(a[i],b[k],a[k])])
    o=g.mesh('Basalt island',vs,fs,0)
    # World aligned UV retains texture continuity across the whole mountain.
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(co.x/19,co.y/19)
    # Vertex colour differentiates salt-washed shore, moss and exposed ridge.
    attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            if co.z<2.7:color=(.84,.76,.55,1)
            elif p.normal.z>.7 and co.z<18:color=(.4,.53,.35,1)
            else:color=(.72,.73,.64,1)
            attr.data[li].color=color
    bs=g.MAT.node_tree.nodes.get('Principled BSDF');v=g.MAT.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color'
    mix=g.MAT.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    tex=next(n for n in g.MAT.node_tree.nodes if n.type=='TEX_IMAGE')
    g.MAT.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);g.MAT.node_tree.links.new(v.outputs['Color'],mix.inputs[2]);g.MAT.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    # Reuse basalt for crags; a few stone fins break the coastline silhouette.
    for x,y,z,s in [(16,8,7,7),(-12,9,14,8),(-22,-4,6,5),(28,3,2,4),(12,-22,1,4)]:
        g.sphere('Eroded crag',(x,y,z),(s*.7,s*.55,s*1.25),0,2)
    g.merge(g.PARTS,'island');g.PARTS.clear()
    g.export(g.ROOT/'assets/environment/island.glb',{'fictional':True,'radiusMeters':38,'role':'basalt island'})

def rock():
    g.reset(0,'basalt-512.png');random.seed(77)
    o=g.sphere('Sea stack',(0,0,1.1),(3.4,2.7,5.3),0,2)
    for v in o.data.vertices:
        v.co.x*=random.uniform(.88,1.1);v.co.y*=random.uniform(.88,1.1);v.co.z*=random.uniform(.91,1.08)
    g.merge(g.PARTS,'rock');g.export(g.ROOT/'assets/environment/rock.glb',{'role':'sea stack','fictional':True})

def crew():
    g.reset(0,'crew-256.png')
    skeleton=json.loads((g.ROOT/'assets/crew/canonical-skeleton.json').read_text());bones=skeleton['bones']
    world={}
    def bl(v):return Vector((v[0],-v[2],v[1]))
    for b in bones:
        world[b['name']]=bl(b['restTranslationMeters'])+(world[b['parent']] if b['parent'] else Vector((0,0,0)))
    # Each hard-surface part has a named rigid bone weight; joints overlap.
    def weight(o,name,tile):
        vg=o.vertex_groups.new(name=name);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
        uv=o.data.uv_layers.active
        for p in o.data.polygons:
            for li in p.loop_indices:
                old=uv.data[li].uv
                uv.data[li].uv=((tile%2+.12+(.76 if old.x>.5 else 0))/2,1-(tile//2+.12+(.76 if old.y>.5 else 0))/2)
        return o
    def bpart(name,bone,loc,size,tile):return weight(g.box(name,loc,size,tile,bevel=.015),bone,tile)
    hips=world['Hips'];chest=world['Chest'];head=world['Head']
    bpart('Work trousers','Hips',hips+Vector((0,0,-.03)),(.29,.21,.19),1)
    bpart('Uniform torso','Spine',world['Spine']+Vector((0,0,.04)),(.32,.2,.3),1)
    bpart('Life jacket','Chest',chest+Vector((0,-.015,-.01)),(.37,.26,.25),0)
    weight(g.sphere('Anonymous head',head+Vector((0,0,.07)),(.105,.095,.13),2,2),'Head',2)
    bpart('Work helmet','Head',head+Vector((0,0,.16)),(.23,.22,.09),0)
    bpart('Helmet brim','Head',head+Vector((0,-.035,.135)),(.25,.27,.026),3)
    for side in ('Left','Right'):
        for bone,child,radius,tile in [('Arm','ForeArm',.067,1),('ForeArm','Hand',.052,1),('UpLeg','Leg',.075,1),('Leg','Foot',.063,1)]:
            a=world[side+bone];b=world[side+child]
            weight(g.tube(side+bone,a,b,radius,tile,n=6),side+bone,tile)
        weight(g.sphere('Glove',world[side+'Hand']+Vector((0,0,-.035)),(.055,.055,.075),0,1),side+'Hand',0)
        bpart('Boot',side+'Foot',world[side+'Foot']+Vector((0,-.06,-.035)),(.14,.27,.095),3)
    body=g.merge(g.PARTS,'crew');g.PARTS.clear()
    arm=bpy.data.armatures.new('motion2_canonical_18');rig=bpy.data.objects.new('motion2_canonical_18',arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for b in bones:
        eb=arm.edit_bones.new(b['name']);eb.head=world[b['name']]
        children=[c for c in bones if c['parent']==b['name']]
        eb.tail=world[children[0]['name']] if children else eb.head+Vector((0,0,.08))
        if (eb.tail-eb.head).length<.001:eb.tail=eb.head+Vector((0,0,.08))
        if b['parent']:eb.parent=arm.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
    mod=body.modifiers.new('Canonical skin','ARMATURE');mod.object=rig;body.parent=rig
    rig['canonicalSource']='motion2/soccer.json';rig['canonicalBoneCount']=18
    # glTF exporter omits unweighted bones unless export_def_bones=False (set by helper).
    g.export(g.ROOT/'assets/crew/deck-crew.glb',{'role':'anonymous deck crew','fictional':True})

island();rock();crew()
print('World and canonical crew exported.')
