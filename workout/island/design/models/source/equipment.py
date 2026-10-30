"""Original low-poly sports equipment; run with Blender 5.2 and common.py."""
import bpy, math, os, sys, argparse
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import reset, paint, box, cylinder, polyline, ring, mesh, join, anchor, finalize

TAU=math.tau

def center_base():
    """Move the complete asset, including anchors, to its bottom footprint centre."""
    obs=list(bpy.context.scene.objects)
    vs=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices]
    lo=Vector(tuple(min(v[k] for v in vs) for k in range(3)))
    hi=Vector(tuple(max(v[k] for v in vs) for k in range(3)))
    offset=Vector((-(lo.x+hi.x)/2, -(lo.y+hi.y)/2, -lo.z))
    for o in obs: o.location+=offset
    bpy.context.view_layer.update()

def goal(outdir):
    reset()
    # Clear opening: post centres ±3.72, radius .06; underside of bar 2.44.
    fy=-.94; by=.94
    join('goal_post',[
        cylinder('post_left',(-3.72,fy,0),(-3.72,fy,2.50),.06,'white',12),
        cylinder('post_right',(3.72,fy,0),(3.72,fy,2.50),.06,'white',12)])
    cylinder('crossbar',(-3.72,fy,2.50),(3.72,fy,2.50),.06,'white',12)
    supports=[]
    for x in (-3.72,3.72):
        supports.append(polyline('rear_support',[(x,fy,.06),(x,by,.06),(x,by,2.30),(x,fy,2.50)],.032,'steel',6))
    supports.append(cylinder('rear_base',(-3.72,by,.06),(3.72,by,.06),.032,'steel',6))
    join('goal_support',supports)
    cords=[]
    # 0.31m net squares are legible in a phone-sized render.
    for i in range(25):
        x=-3.66+7.32*i/24
        cords.append(polyline('cord',[(x,fy,2.43),(x,by,2.27),(x,by,.07)],.009,'cream',4))
    for j in range(9):
        z=.07+2.20*j/8
        cords.append(cylinder('cord',(-3.66,by,z),(3.66,by,z),.009,'cream',4))
        for x in (-3.66,3.66):
            cords.append(cylinder('cord',(x,fy,z),(x,by,z),.009,'cream',4))
    for j in range(1,6):
        y=fy+(by-fy)*j/6
        z=2.43-.16*j/6
        cords.append(cylinder('cord',(-3.66,y,z),(3.66,y,z),.009,'cream',4))
        for x in (-3.66,3.66):
            cords.append(cylinder('cord',(x,y,.07),(x,y,z),.009,'cream',4))
    join('net',cords)
    anchor('anchor_goal_center',(0,fy,1.22))
    anchor('anchor_ball_spot',(0,fy-11,.11))
    anchor('anchor_goal_line_left',(-3.66,fy,0)); anchor('anchor_goal_line_right',(3.66,fy,0))
    center_base()
    return finalize('soccer-goal',outdir,'equipment',
        'Inner opening 7.32 × 2.44m. Ball spot is a conventional penalty spot 11m in front of the goal line.',view=(1.05,-1.7,.85))

def hoop(outdir):
    reset()
    box('base',(0,.55,.09),(1.12,1.22,.18),'navy',.045)
    box('base_pad',(0,.55,.23),(.88,1,.12),'mint',.035)
    cylinder('support_post',(0,.77,.29),(0,.77,3.78),.075,'steel',8)
    box('post_pad',(0,.72,1.05),(.29,.26,1.52),'navy',.025)
    cylinder('backboard_arm',(0,.77,3.42),(0,-.05,3.42),.065,'steel',8)
    # Rim centre is exactly 3.05m, and the ring inner diameter is .45m.
    box('backboard',(0,-.075,3.425),(1.80,.10,1.05),'white',.025)
    edges=[]
    for x in (-.895,.895): edges.append(box('edge',(x,-.137,3.425),(.035,.018,1.04),'navy'))
    for z in (2.9125,3.9375): edges.append(box('edge',(0,-.137,z),(1.80,.018,.035),'navy'))
    join('backboard_frame',edges)
    marks=[]
    for x in (-.295,.295): marks.append(box('target_line',(x,-.139,3.27),(.025,.018,.45),'coral'))
    for z in (3.055,3.495): marks.append(box('target_line',(0,-.139,z),(.59,.018,.025),'coral'))
    join('backboard_target',marks)
    cy=-.50
    ring('rim',(0,cy,3.05),.235,.01,'orange',32,6)
    box('rim_mount',(0,-.21,3.05),(.12,.16,.035),'orange',.008)
    cords=[]; n=12
    for i in range(n):
        a=TAU*i/n; b=TAU*(i+.5)/n; c=TAU*(i+1)/n
        p=(.23*math.cos(a),cy+.23*math.sin(a),3.035)
        q=(.155*math.cos(b),cy+.155*math.sin(b),2.76)
        r=(.105*math.cos(c),cy+.105*math.sin(c),2.60)
        cords.append(polyline('cord',[p,q,r],.005,'cream',4))
        q2=(.155*math.cos(a-TAU*.5/n),cy+.155*math.sin(a-TAU*.5/n),2.76)
        cords.append(polyline('cord',[p,q2,r],.005,'cream',4))
    join('net',cords)
    anchor('anchor_rim_center',(0,cy,3.05)); anchor('anchor_backboard_center',(0,-.125,3.425))
    anchor('anchor_ball_spot',(0,cy-4.2,.12)); anchor('anchor_mount',(0,.77,0))
    center_base()
    return finalize('basketball-hoop',outdir,'equipment','Rim centre 3.05m, clear rim diameter .45m; backboard 1.80 × 1.05m.',view=(1.15,-1.8,1))

def soccer_ball(outdir):
    reset()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
    ico=bpy.context.object; orig=[v.co.copy() for v in ico.data.vertices]
    triangles=[tuple(p.vertices) for p in ico.data.polygons]
    bpy.data.objects.remove(ico,do_unlink=True)
    neighbors={i:set() for i in range(len(orig))}
    for tri in triangles:
        for i in tri:
            neighbors[i].update(set(tri)-{i})
    directed={}; verts=[]
    for i in range(len(orig)):
        for j in sorted(neighbors[i]):
            directed[(i,j)]=len(verts); verts.append((orig[i]*2+orig[j])/3)
    r=verts[0].length; verts=[v/r*.11 for v in verts]
    # Put an antipodal pair on the vertical axis: exact .22m height, resting on Z=0.
    rot=verts[0].normalized().rotation_difference(Vector((0,0,1)))
    verts=[rot@v+Vector((0,0,.11)) for v in verts]
    faces=[]; colors=[]
    for a,b,c in triangles:
        faces.append([directed[(a,b)],directed[(b,a)],directed[(b,c)],directed[(c,b)],directed[(c,a)],directed[(a,c)]])
        colors.append('white')
    for i,ng in neighbors.items():
        ids=[directed[(i,j)] for j in ng]
        center=sum((verts[k] for k in ids),Vector())/len(ids)
        normal=(rot@orig[i]).normalized()
        u=(verts[ids[0]]-center).normalized(); v=normal.cross(u)
        ids.sort(key=lambda k:math.atan2((verts[k]-center).dot(v),(verts[k]-center).dot(u)))
        faces.append(ids); colors.append('dark')
    # Ensure outward face winding independently of the source icosphere's ordering.
    center=Vector((0,0,.11))
    for f in faces:
        a,b,c=(verts[k] for k in f[:3])
        if (b-a).cross(c-a).dot(a-center)<0:f.reverse()
    mesh('soccer_ball',verts,faces,'white',colors)
    anchor('anchor_ball_center',(0,0,.11)); anchor('anchor_ball_spot',(0,0,0))
    center_base()
    return finalize('soccer-ball',outdir,'equipment','Original truncated-icosahedron ball: 12 dark pentagons, 20 light hexagons; diameter .22m.',view=(1.2,-1.6,.9))

def basketball(outdir):
    reset(); radius=.12; seam_r=.0018; center=.1236
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=radius,location=(0,0,center))
    ball=bpy.context.object;ball.name='basketball';paint(ball,'orange')
    seams=[]
    # Two perpendicular great circles plus the characteristic bowed side channels.
    for plane in ('xy','xz','yz'):
        pts=[]
        for i in range(48):
            t=TAU*i/48; a=.1218*math.cos(t); b=.1218*math.sin(t)
            pts.append((a,b,center) if plane=='xy' else ((a,0,center+b) if plane=='xz' else (0,a,center+b)))
        seams.append(polyline('seam',pts,seam_r,'dark',4,closed=True))
    for sign in (-1,1):
        pts=[]
        for i in range(49):
            t=-math.pi/2+math.pi*i/48
            z=math.sin(t); s=math.cos(t)
            phi=sign*(math.pi/4+.22*math.cos(2*t))
            pts.append((.1218*s*math.cos(phi),.1218*s*math.sin(phi),center+.1218*z))
        seams.append(polyline('seam',pts,seam_r,'dark',4))
    join('seams',seams)
    anchor('anchor_ball_center',(0,0,center)); anchor('anchor_ball_spot',(0,0,0))
    center_base()
    return finalize('basketball',outdir,'equipment','Faceted .24m ball with separate geometric dark seams; no image textures.',view=(1.2,-1.6,1))

def board_mesh(name,x,length,width,color,tip=.07):
    """Bevelled, rounded-end plank, with raised nose and tail; lower face at Z=0."""
    # 16 silhouette vertices preserve a rounded board shape at low polygon count.
    outline=[]
    for i in range(8):
        a=math.pi*i/7
        outline.append((width*.5*math.cos(a),length*.5-width*.5+width*.5*math.sin(a)))
    for i in range(8):
        a=math.pi+math.pi*i/7
        outline.append((width*.5*math.cos(a),-length*.5+width*.5+width*.5*math.sin(a)))
    verts=[]
    for layer in (0,1):
        for px,py in outline:
            lift=tip*max(0,(abs(py)/(length*.5)-.75)/.25)**2
            verts.append((x+px,py,.016*layer+lift))
    n=len(outline);faces=[list(reversed(range(n))),list(range(n,2*n))]
    for i in range(n): faces.append([i,(i+1)%n,(i+1)%n+n,i+n])
    colors=['navy',color]+['navy']*n
    return mesh(name,verts,faces,color,colors)

def skis(outdir):
    reset()
    for x,side in ((-.18,'left'),(.18,'right')):
        board_mesh('ski_'+side,x,1.70,.12,'mint',.07)
        # Two broad colour blocks at each end remain readable in a thumbnail.
        box('ski_accent_'+side,(x,-.53,.020),(.105,.22,.009),'coral',.008)
        box('ski_tip_accent_'+side,(x,.53,.020),(.105,.16,.009),'cream',.008)
        pieces=[box('binding',(x,-.12,.044),(.092,.10,.052),'navy',.008),
                box('binding',(x,.11,.045),(.09,.12,.054),'navy',.008),
                box('binding',(x,0,.037),(.065,.13,.026),'steel',.008)]
        join('binding_'+side,pieces)
        anchor('anchor_boot_'+side,(x,0,.071))
    anchor('anchor_mount_left',(-.18,0,.071));anchor('anchor_mount_right',(.18,0,.071))
    center_base()
    return finalize('skis',outdir,'equipment','Pair of 1.70m skis with separate left/right meshes and bindings.',view=(1.2,-1.45,2.4))

def snowboard(outdir):
    reset();board_mesh('snowboard',0,1.50,.29,'purple',.065)
    box('nose_accent',(0,.43,.024),(.255,.16,.012),'amber',.025)
    box('tail_accent',(0,-.43,.024),(.255,.20,.012),'coral',.025)
    for y,label in ((-.23,'rear'),(.23,'front')):
        o=box('binding_'+label,(0,y,.055),(.17,.16,.068),'navy',.018)
        o.rotation_euler.z=math.radians(-15 if y<0 else 15)
        box('strap_'+label,(0,y,.10),(.15,.055,.026),'cream',.012)
        anchor('anchor_boot_'+label,(0,y,.114))
    center_base()
    return finalize('snowboard',outdir,'equipment','Original 1.50m snowboard with two separately named bindings.',view=(1.2,-1.45,2.4))

def poles(outdir):
    reset()
    for x,side in ((-.17,'left'),(.17,'right')):
        pieces=[cylinder('shaft',(x,0,.015),(x,0,1.18),.009,'steel',8),
                cylinder('grip',(x,0,1.05),(x,0,1.20),.023,'coral',8),
                cylinder('tip',(x,0,0),(x,0,.07),.012,'dark',6,radius2=.006),
                ring('basket',(x,0,.12),.047,.008,'navy',12,4)]
        join('pole_'+side,pieces)
        # Stylized closed wrist loop, deliberately no logos or text.
        polyline('strap_'+side,[(x+.02,0,1.15),(x+.07,0,1.18),(x+.09,0,1.09),(x+.04,0,1.04),(x+.02,0,1.15)],.006,'navy',4)
        anchor('anchor_grip_'+side,(x,0,1.13))
    center_base()
    return finalize('ski-poles',outdir,'equipment','Pair of 1.20m poles with named pole_left/pole_right and grip anchors.',view=(1.5,-2,.9))

def build(outdir):
    return [fn(outdir) for fn in (goal,hoop,soccer_ball,basketball,skis,snowboard,poles)]

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True)
    build(parser.parse_args(args).out)
