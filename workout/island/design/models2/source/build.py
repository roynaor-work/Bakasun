"""Additive v2 art package. Run from any directory with Blender 4.3+.

Reuses the repository's original modelling helpers and contracts, never writes
to models/, environment/ or baked/. Coordinates here are metres, Blender Z-up.
"""
import argparse, json, math, os, random, sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
DESIGN = HERE.parent.parent
sys.path.insert(0, str(DESIGN / 'models/source'))
from common import *
import venues, ski_environment as winter

# Bulk stadium geometry avoids thousands of context-dependent bpy operators.
_bevel_box = box
def box(name,loc,size,color,bevel=0):
    if bevel: return _bevel_box(name,loc,size,color,bevel)
    vertices=[(sx*size[0]/2,sy*size[1]/2,sz*size[2]/2)
              for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                               (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    o=mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],color)
    o.location=loc
    return o

def cylinder(name,a,b,radius,color,vertices=8,radius2=None):
    a,b=Vector(a),Vector(b); n=(b-a).normalized()
    t=n.cross(Vector((.123,.345,.937))).normalized(); u=n.cross(t)
    points=[]
    for center,r in ((a,radius),(b,radius if radius2 is None else radius2)):
        points += [center+r*(t*math.cos(math.tau*i/vertices)+u*math.sin(math.tau*i/vertices)) for i in range(vertices)]
    faces=[tuple(range(vertices-1,-1,-1)),tuple(range(vertices,2*vertices))]
    faces += [(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    return mesh(name,points,faces,color)

import common
common.cylinder=cylinder
venues.box=box; venues.cylinder=cylinder
winter.box=box; winter.cylinder=cylinder

# Build the original scene without exporting it; retain every named component
# and every original anchor, including the original end-wall scoreboard.
venues.finalize = winter.finalize = lambda *args, **kwargs: None
RNG = random.Random(20261031)


def remove(name):
    obj = bpy.data.objects.get(name)
    if obj: bpy.data.objects.remove(obj, do_unlink=True)


def combine(name, parts):
    if bpy.data.objects.get(name): parts = [bpy.data.objects[name]] + parts
    return join(name, parts)


def flat_lines(name, paths, width, z, color='white'):
    vertices=[]; faces=[]
    for points in paths:
        for a,b in zip(points,points[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1]; length=math.hypot(dx,dy)
            if length<1e-7: continue
            nx,ny=-dy/length*width/2,dx/length*width/2
            i=len(vertices)
            vertices += [(a[0]+nx,a[1]+ny,z),(a[0]-nx,a[1]-ny,z),
                         (b[0]-nx,b[1]-ny,z),(b[0]+nx,b[1]+ny,z)]
            faces.append((i,i+1,i+2,i+3))
    return mesh(name,vertices,faces,color)


def circle_path(x,y,r,start=0,end=math.tau,steps=96):
    return [(x+r*math.cos(start+(end-start)*i/steps),y+r*math.sin(start+(end-start)*i/steps)) for i in range(steps+1)]


def arena_lines():
    paths=[[(-7.5,-14),(7.5,-14),(7.5,14),(-7.5,14),(-7.5,-14)],
           [(-7.5,0),(7.5,0)],circle_path(0,0,1.8)]
    for sign in (-1,1):
        paths.append([(-2.45,sign*14),(-2.45,sign*8.2),(2.45,sign*8.2),(2.45,sign*14)])
        paths.append(circle_path(0,sign*8.2,1.8))
        start=0 if sign<0 else math.pi
        paths.append(circle_path(0,sign*12.425,6.75,start,start+math.pi))
        for x in (-6.75,6.75): paths.append([(x,sign*12.425),(x,sign*14)])
    remove('court_markings')
    flat_lines('court_markings',paths,.10,.035)


def stadium_lines():
    paths=[[(-34,-52.5),(34,-52.5),(34,52.5),(-34,52.5),(-34,-52.5)],
           [(-34,0),(34,0)],circle_path(0,0,9.15)]
    for sign in (-1,1):
        for w,d in ((40.32,16.5),(18.32,5.5)):
            paths.append([(-w/2,sign*52.5),(-w/2,sign*(52.5-d)),(w/2,sign*(52.5-d)),(w/2,sign*52.5)])
        paths.append(circle_path(0,sign*41.5,.18,steps=16))
    remove('field_markings')
    flat_lines('field_markings',paths,.22,.075)


def plank_mesh():
    # Actual parquet boards with staggered ends and visible fine joints. No image.
    vertices, faces, colors = [], [], []
    for row in range(60):
        x0 = -7.5 + row * .25
        y = -14
        while y < 14 - 1e-5:
            length = min(1.25 if y == -14 and row % 2 else 2.5, 14-y)
            a = len(vertices)
            vertices += [(x0+.007,y+.007,.008),(x0+.243,y+.007,.008),
                         (x0+.243,y+length-.007,.008),(x0+.007,y+length-.007,.008)]
            faces.append((a,a+1,a+2,a+3))
            colors.append(RNG.choice(['#C99257','#D5A46B','#DAB17A','#C79A62','#E1B680']))
            y += length
    return mesh('parquet_boards', vertices, faces, face_colors=colors)


def chair(parts, x, y, z, color, rotation=0, scale=1):
    # Seat pan + back, with open space underneath rather than solid colour bands.
    for dy,dz,size in [(0,.18,(.44,.44,.10)),(.19,.44,(.44,.07,.47))]:
        o=box('seat',(x-math.sin(rotation)*dy*scale,y+math.cos(rotation)*dy*scale,z+dz*scale),
              tuple(v*scale for v in size),color)
        o.rotation_euler.z=rotation
        parts.append(o)


def bench(parts, x, y, color, count=6, direction=1, scale=1):
    for i in range(count): chair(parts,x,y+(i-(count-1)/2)*.56*scale,.14,color, -direction*math.pi/2,scale)
    parts.append(box('bench_beam',(x,y,.18),(.38,count*.56*scale,.12),'steel'))
    for dy in (-count*.20*scale,count*.20*scale):
        parts.append(box('bench_foot',(x,y+dy,.10),(.50,.12,.20),'navy'))


def arena():
    venues.arena('unused')
    # Move the stand perimeter outward, leaving room for teams and safety runoff.
    for name in ('arena_shell','seating','roof','beams'):
        o=bpy.data.objects[name]
        bpy.context.view_layer.update()
        for v in o.data.vertices:
            p=o.matrix_world@v.co
            if abs(p.x)>7.6: p.x += math.copysign(2.4,p.x)
            if abs(p.y)>14.2: p.y += math.copysign(1.8,p.y)
            v.co=o.matrix_world.inverted()@p
    combine('court_surface',[plank_mesh()])
    box('court_runoff',(0,0,-.06),(20.2,32.2,.10),'navy')
    keys=[]
    for sign in (-1,1):
        keys.append(box('painted_key',(0,sign*11.1,.012),(4.90,5.8,.012),'mint'))
    join('painted_keys',keys)
    arena_lines()
    seats=[]; stairs=[]; rail=[]
    for row in range(5):
        x=11.1+row*1.15; y=17.45+row*1.15; z=.84+row*.85
        for sign in (-1,1):
            for i in range(-21,22):
                if abs(i)%11 not in (0,1): chair(seats,sign*x,i*.67,z,['purple','cream','purple','amber','purple'][row],sign*math.pi/2)
            for i in range(-14,15):
                if abs(i)%10 not in (0,1): chair(seats,i*.67,sign*y,z,'purple' if row%3 else 'amber',0 if sign>0 else math.pi)
            for sy in (-1,1):
                for half in (0,1):
                    stairs.append(box('stair',(sign*(10.8+row*1.15+half*.55),sy*7.4,.79+row*.85+half*.40),(.58,1.0,.16),'cream'))
            for i in (-13,0,13):
                stairs.append(box('stair',(i*.67,sign*y,z+.08),(1.0,1.1,.16),'cream'))
        if row==0:
            for sign in (-1,1):
                rail.append(cylinder('handrail',(sign*10.65,-14,1.15),(sign*10.65,14,1.15),.035,'steel',6))
    join('individual_seats',seats); join('stand_stairs',stairs); join('handrails',rail)
    teams=[]
    for sign,color in ((-1,'coral'),(1,'mint')):
        bench(teams,sign*8.8,sign*5.8,color,direction=sign)
        anchor('anchor_team_'+('home' if sign<0 else 'away'),(sign*8.8,sign*5.8,0))
        teams.append(box('team_zone',(sign*8.8,sign*5.8,.018),(1.35,5.2,.025),color))
    teams.append(box('scorer_table',(-8.8,0,.60),(.80,2.8,1.0),'purple',.06))
    join('team_benches',teams)
    lights=[]; trusses=[]
    for sy in (-1,1):
        y=sy*7.7
        # Open longitudinal sightlines; raised side trusses and short inward bars.
        for x in (-16.5,16.5):
            trusses.append(cylinder('light_truss',(x,-18,8.0),(x,18,8.0),.09,'navy',6))
            trusses.append(cylinder('truss_extension',(x,y,6.9),(x,y,8.4),.09,'navy',6))
        for z in (8.1,8.6): trusses.append(cylinder('cross_truss',(-16.5,y,z),(16.5,y,z),.065,'steel',6))
        for i in range(11):
            trusses.append(cylinder('cross_brace',(-16.5+i*3,y,8.1),(-13.5+i*3,y,8.6),.035,'navy',5))
        for x in (-12,-6,0,6,12):
            trusses.append(cylinder('lighting_beam',(x-1.6,y,8.3),(x+1.6,y,8.3),.07,'steel',6))
            for dx in (-1,0,1):
                lights.append(box('light_housing',(x+dx,y,8.22),(.65,.35,.18),'navy'))
                lights.append(box('light_lens',(x+dx,y,8.11),(.54,.29,.04),'cream'))
    join('lighting_trusses',trusses); join('floodlights',lights)
    hanging=[]
    for axis in range(4):
        # Build identical readable panels on all four faces of the suspended cube.
        panel=[box('score_panel',(0,-1.25,6.15),(2.55,.16,1.40),'navy',.04)]
        for x in (-.80,-.30,.30,.80): venues.digit(panel,x,-1.35,6.20,0,.29)
        for o in panel:
            o.rotation_euler.z=axis*math.pi/2
            o.location=Vector((-math.sin(axis*math.pi/2)*o.location.y+math.cos(axis*math.pi/2)*o.location.x,
                               math.cos(axis*math.pi/2)*o.location.y+math.sin(axis*math.pi/2)*o.location.x,o.location.z))
        hanging += panel
    for x in (-.9,.9):
        for y in (-.9,.9): hanging.append(cylinder('suspension',(x,y,6.9),(x,y,9.2),.025,'steel',6))
    hanging.append(cylinder('scoreboard_truss',(-16.5,0,9.2),(16.5,0,9.2),.08,'navy',6))
    for x in (-16.5,16.5): hanging.append(cylinder('score_truss_column',(x,0,6.9),(x,0,9.2),.10,'navy',6))
    hanging.append(box('score_cap',(0,0,6.96),(2.8,2.8,.16),'purple'))
    hanging.append(box('score_bottom',(0,0,5.45),(2.75,2.75,.12),'purple'))
    join('hanging_scoreboard',hanging); anchor('anchor_hanging_scoreboard_center',(0,0,6.15))
    nets=[]; targets=[]
    for sign in (-1,1):
        cy=sign*12.425
        for i in range(12):
            a=math.tau*i/12; b=a+math.pi/12
            nets.append(polyline('cord',[(.23*math.cos(a),cy+.23*math.sin(a),3.03),(.15*math.cos(b),cy+.15*math.sin(b),2.75),(.10*math.cos(a),cy+.10*math.sin(a),2.60)],.006,'cream',4))
        for z,r in ((2.76,.15),(2.60,.10)): nets.append(ring('net_band',(0,cy,z),r,.005,'cream',24,4))
        for x in (-.30,.30): targets.append(box('board_target',(x,sign*12.79,3.36),(.035,.025,.45),'coral'))
        for z in (3.15,3.58): targets.append(box('board_target',(0,sign*12.79,z),(.63,.025,.035),'coral'))
    join('net',nets); join('backboard_target',targets)


def stadium():
    venues.stadium('unused')
    # Broad tonal mowing stripes form the pitch's base colour, no external image.
    pitch=bpy.data.objects['pitch_surface']; paint(pitch,'#3F925E')
    stripes=[]
    for i in range(14):
        stripes.append(box('mown_stripe',(0,-52.5+(i+.5)*7.5,.045),(68,7.5,.006),'#519F66' if i%2 else '#3F925E'))
    combine('pitch_surface',stripes)
    stadium_lines()
    upper=[]; chairs=[]; aisles=[]
    upper.append(venues.band('upper_concourse',venues.octagon(46,65,8),venues.octagon(55,74,11),8.5,9.0,'navy'))
    for row in range(5):
        x=47+row*1.4; y=66+row*1.4; z=9.1+row*1.15
        upper.append(venues.band('upper_tier',venues.octagon(x,y,9),venues.octagon(x+1.5,y+1.5,9.7),9,z,'steel'))
        for sign in (-1,1):
            for i in range(-42,43):
                if abs(i)%14>1: chair(chairs,sign*(x+.65),i*1.30,z,'mint' if row%3 else 'cream',sign*math.pi/2,1.65)
            for i in range(-29,30):
                if abs(i)%12>1: chair(chairs,i*1.30,sign*(y+.65),z,'coral' if row%3==1 else 'mint',0 if sign>0 else math.pi,1.65)
            for y0 in (-36,-18,0,18,36): aisles.append(box('upper_aisle',(sign*(x+.7),y0,z+.12),(1.4,2.1,.15),'cream'))
    join('upper_stands',upper); join('upper_seats',chairs); join('upper_aisles',aisles)
    # Partial cantilever covers outside rows only, leaving the pitch visible.
    remove('roof'); roof=[]; supports=[]
    for sign in (-1,1):
        roof.append(box('partial_roof',(sign*53,0,18.0),(7.7,135,.24),'mint',.05))
        roof.append(box('end_roof',(0,sign*72,18.0),(94,5.0,.24),'cream',.05))
        for y in (-60,-40,-20,0,20,40,60):
            supports += [cylinder('column',(sign*56,y,0),(sign*56,y,18),.22,'navy',6),
                         cylinder('cantilever',(sign*56,y,15),(sign*49,y,17.8),.13,'cream',6)]
    join('roof',roof); combine('beams',supports)
    adverts=[]; flags=[]; dugouts=[]
    for sign in (-1,1):
        for i in range(15):
            color=['purple','mint','coral','amber'][i%4]
            adverts.append(box('blank_ad_board',(sign*34.9,(i-7)*6.8,.65),(.18,5.9,1.05),color))
            # Abstract blocks, with no lettering or insignia.
            adverts.append(box('ad_block',(sign*34.79,(i-7)*6.8-.8,.65),(.03,1.5,.68),'cream'))
        for x in (-34,34):
            flags.append(cylinder('corner_pole',(x,sign*52.5,.05),(x,sign*52.5,1.55),.035,'cream',6))
            flags.append(mesh('corner_flag',[(x,sign*52.5,1.55),(x+.65,sign*52.5,1.40),(x,sign*52.5,1.10)],[(0,1,2),(2,1,0)],'coral'))
            anchor('anchor_corner_'+str(sign)+'_'+str(x),(x,sign*52.5,.04))
        bench(dugouts,sign*36.1,0,'coral' if sign<0 else 'mint',count=10,direction=sign,scale=1.25)
        dugouts += [box('dugout_roof',(sign*36.1,0,2.6),(2.9,8.2,.15),'purple'),
                    box('dugout_back',(sign*37.45,0,1.45),(.12,8.2,2.4),'navy')]
        anchor('anchor_substitutes_'+('home' if sign<0 else 'away'),(sign*36.1,0,.04))
    join('advertising_boards',adverts); join('corner_flags',flags); join('substitute_benches',dugouts)
    posts=[]; bars=[]; nets=[]
    for sign in (-1,1):
        y=sign*52.5; by=y+sign*2
        for x in (-3.72,3.72): posts.append(cylinder('post',(x,y,.04),(x,y,2.54),.06,'white',12))
        bars.append(cylinder('bar',(-3.72,y,2.54),(3.72,y,2.54),.06,'white',12))
        for i in range(25):
            x=-3.66+i*7.32/24
            nets.append(polyline('cord',[(x,y,2.48),(x,by,2.31),(x,by,.12)],.012,'cream',4))
        for j in range(9): nets.append(cylinder('cord',(-3.66,by,.12+j*.27),(3.66,by,.12+j*.27),.012,'cream',4))
    join('goal_post',posts); join('crossbar',bars); join('net',nets)


def fir_parts(x=0,y=0,z=0,variant=0,scale=1):
    parts=[cylinder('trunk',(x,y,z),(x,y,z+3.0*scale),.12*scale,'wood',7)]
    height=(4.4,5.2,3.25)[variant]
    for j in range(4):
        bottom=(.55+j*.75)*height/4.4; top=(2.35+j*.68)*height/4.4
        layer=winter.foliage_layer('boughs',bottom,top,(1.35-j*.27)*(1 if variant!=1 else .74),8,j*.37,(.03,0),True,j+variant)
        for o in layer:
            for v in o.data.vertices: v.co=Vector((x,y,z))+v.co*scale
        parts += layer
    return parts


def rock_parts(x=0,y=0,z=0,scale=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,z+.42*scale))
    o=bpy.context.object; o.name='boulder'
    o.scale=(.84*scale,.62*scale,.63*scale)
    for v in o.data.vertices: v.co *= 1+.10*math.sin(v.index*7.3)
    paint(o,'grey',['snow' if p.normal.z>.35 else ('steel' if p.index%3 else 'grey') for p in o.data.polygons])
    return o


def gate_parts(y,z,color):
    p=[]
    for x in (-2.5,2.5):
        p.append(box('gate_column',(x,y,z+1.8),(.26,.35,3.6),color,.04))
        p.append(box('gate_pad',(x,y,z+.55),(.44,.52,1.10),'navy',.04))
    p.append(box('blank_gate_header',(0,y,z+3.35),(5.3,.38,.65),color,.04))
    for x in (-1.7,0,1.7): p.append(box('gate_block',(x,y-.20,z+3.35),(.50,.03,.30),'cream'))
    return p


def sign_parts(x=0,y=0,z=0):
    return [cylinder('sign_post',(x,y,z),(x,y,z+1.9),.055,'wood',6),
            box('snow_sign',(x,y,z+1.65),(1.3,.12,.62),'purple',.04),
            mesh('direction_arrow',[(x-.40,y-.066,z+1.65),(x+.16,y-.066,z+1.65),(x+.16,y-.066,z+1.85),
                                    (x+.48,y-.066,z+1.65),(x+.16,y-.066,z+1.45),(x+.16,y-.066,z+1.61),(x-.40,y-.066,z+1.61)],
                 [(6,5,4,3,2,1,0)],'cream')]


def tower_parts(x=0,y=0,z=0):
    p=[box('tower_foot',(x,y,z+.18),(1.6,1.6,.36),'steel',.08),
       cylinder('lift_pylon',(x,y,z+.25),(x,y,z+6.8),.23,'navy',8),
       box('lift_crossbeam',(x,y,z+6.7),(5.2,.45,.35),'steel')]
    for dx in (-2.15,2.15):
        for dy in (-.42,0,.42):
            o=ring('sheave',(x+dx,y+dy,z+6.75),.22,.055,'navy',12,4)
            o.rotation_euler.y=math.pi/2; p.append(o)
    for dx in (-.38,.38):
        p.append(cylinder('ladder_rail',(x+dx,y-.35,z+.3),(x+dx,y-.35,z+6.3),.025,'steel',5))
    for i in range(16): p.append(cylinder('rung',(x-.38,y-.35,z+.5+i*.35),(x+.38,y-.35,z+.5+i*.35),.025,'steel',5))
    return p


def slope():
    winter.slope('unused')
    # A second uphill 24m section meets the original start exactly. This keeps
    # every original anchor intact and the asset's base at Z=0.
    vs=[]; fs=[]; cs=[]
    for j in range(9):
        y=12+j*3
        for i in range(5):
            x=-7+i*3.5; vs.append((x,y,6.25+(y-12)*.25+.1*(abs(x)/7)**2))
    for j in range(8):
        for i in range(4):
            a=j*5+i; fs.append((a,a+1,a+6,a+5)); cs.append('snow' if i in (0,3) else 'white')
    mesh('slope_surface_upper',vs,fs,face_colors=cs)
    mesh('upper_slope_body',[(-7,12,6.35),(7,12,6.35),(-7,36,12.35),(7,36,12.35),(-7,12,0),(7,12,0),(-7,36,0),(7,36,0)],
         [(0,2,6,4),(3,1,5,7),(2,3,7,6),(4,6,7,5)],'ice')
    anchor('anchor_route_start_v2',(0,36,12.25)); anchor('anchor_segment_join',(0,12,6.25))
    anchor('anchor_route_end_v2',(0,-12,.25))
    banks=[]
    for side in (-1,1):
        vertices=[]
        for y in (-12,0,12,24,36):
            for x in (side*7,side*13): vertices.append((x,y,.25+(y+12)*.25+.10))
        banks.append(mesh('snow_bank',vertices,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],'snow'))
    join('snow_banks',banks)
    join('start_gate',gate_parts(35,12,'mint')); join('finish_gate',gate_parts(-11,.50,'coral'))
    anchor('anchor_start_gate',(0,35,12)); anchor('anchor_finish_gate',(0,-11,.50))
    trees=[]; rocks=[]; fences=[]; signs=[]
    for side in (-1,1):
        for i in range(14):
            y=-10+i*3.45; z=.25+(y+12)*.25
            trees += fir_parts(side*(8.3+(i%3)*1.1),y,z,i%3,.70+(i%4)*.13)
            if i%3==0: rocks.append(rock_parts(side*7.8,y+1,z,(.4,.8,1.2)[(i//3)%3]))
        for i in range(16):
            y=-11+i*3; z=.25+(y+12)*.25
            for x in (side*6.7,):
                fences.append(cylinder('fence_post',(x,y,z),(x,y,z+1.15),.04,'navy',6))
                for h in (.3,.65,1.0): fences.append(cylinder('safety_cord',(x,y,z+h),(x,y+3,z+.75+h),.025,'coral',5))
        for y in (1,22): signs += sign_parts(side*7.4,y,.25+(y+12)*.25)
    join('winter_firs',trees); join('winter_rocks',rocks); join('safety_fences',fences); join('snow_signs',signs)
    join('lift_tower',tower_parts(-10.3,18,7.75)); anchor('anchor_lift_tower',(-10.3,18,7.75))
    cable=[]
    for x in (-12.45,-8.15): cable.append(cylinder('lift_cable',(x,-12,7.0),(x,36,19.0),.025,'navy',6))
    join('lift_cables',cable)
    course=[]
    for y,side,color in ((4,-1,'coral'),(23,1,'mint')):
        z=.25+(y+12)*.25
        for x in (side*2.8-1.0,side*2.8+1.0): course.append(cylinder('slalom_pole',(x,y,z),(x,y,z+1.6),.035,color,6))
        course.append(box('slalom_panel',(side*2.8,y,z+1.3),(2.0,.04,.50),color))
    join('course_gates',course)


def bake_vertex_ao(meshes, reach):
    """Eight deterministic hemisphere rays per face, quantized to 8 AO levels.
    Baked into COLOR_0: no new UV dependency or runtime AO texture/draw pass.
    Old baked/ atlases intentionally cannot be reused on this new topology.
    """
    vertices=[]; faces=[]
    for o in meshes:
        offset=len(vertices); vertices += [v.co.copy() for v in o.data.vertices]
        faces += [tuple(offset+i for i in p.vertices) for p in o.data.polygons]
    bvh=BVHTree.FromPolygons(vertices,faces)
    for o in meshes:
        attr=o.data.color_attributes.get('COLOR_0')
        for p in o.data.polygons:
            n=p.normal.normalized(); tangent=n.cross(Vector((.13,.27,1))).normalized()
            bitangent=n.cross(tangent); center=p.center+n*.008
            hits=0
            for i in range(8):
                angle=i*2.399963; r=math.sqrt((i+.5)/8)
                d=tangent*(r*math.cos(angle))+bitangent*(r*math.sin(angle))+n*math.sqrt(1-r*r)
                if bvh.ray_cast(center,d,reach)[0] is not None: hits+=1
            factor=1-.32*hits/8
            for li in p.loop_indices:
                c=attr.data[li].color
                attr.data[li].color=(c[0]*factor,c[1]*factor,c[2]*factor,c[3])


def export_asset(name,out):
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Recalculate winding normals, then refresh polygon centres for AO.
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes: o.data.update()
    bake_vertex_ao(meshes,4 if name=='soccer-stadium' else 1.4)
    root=anchor('asset_root',(0,0,0)); root['asset_id']=name; root['units']='metres'; root['version']=2
    if not bpy.data.objects.get('anchor_origin'): anchor('anchor_origin',(0,0,0))
    for o in list(bpy.context.scene.objects):
        if o!=root: o.parent=root
    def gl(p): return [round(p[0],6),round(p[2],6),round(-p[1],6)]
    metadata={'id':name,'units':'metres','up':'+Y','forward':'+Z','baseCommit':'3853d282b6dd7719db49a864fec4286dc7b63cb0',
              'objects':sorted(o.name for o in meshes),
              'anchors':{o.name:gl(o.location) for o in bpy.context.scene.objects if o.type=='EMPTY' and o!=root},
              'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
              'drawCallsEstimate':len(meshes),'textures':0,'ao':'8-ray face AO in COLOR_0; bounded 0.68–1.0'}
    (out/(name+'.authoring.json')).write_text(json.dumps(metadata,indent=2)+'\n')
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',export_yup=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,
        export_draco_position_quantization=16,export_draco_normal_quantization=10,export_draco_color_quantization=8,
        export_materials='EXPORT',export_vertex_color='MATERIAL',export_all_vertex_colors=True,
        export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False,export_extras=True)
    print('DELIVERED',name,metadata['triangles'],(out/(name+'.glb')).stat().st_size,flush=True)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--out',default=str(HERE.parent)); parser.add_argument('--asset')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out).resolve(); out.mkdir(parents=True,exist_ok=True)
    builders={'basketball-arena':arena,'soccer-stadium':stadium,'ski-slope':slope,
              'fence':lambda:winter.fence('unused'),'slalom-gate':lambda:winter.slalom('unused')}
    for i,c in enumerate('abc'):
        def tree(i=i):
            winter.fir('unused','abc'[i])
        builders['fir-'+c]=tree
    for density,count in [('sparse',3),('medium',7),('dense',13)]:
        def forest(count=count):
            reset(); parts=[]
            # All densities occupy the same patch of ground. Increasing count
            # must increase density rather than simply make a larger forest.
            positions=[(0,0),(-3.6,-2.6),(3.6,2.6),(-3.6,2.6),(3.6,-2.6),(0,-2.6),(0,2.6),
                       (-3.6,0),(3.6,0),(-1.8,-1.3),(1.8,-1.3),(-1.8,1.3),(1.8,1.3)]
            for i in range(count):
                x,y=positions[i]
                parts += fir_parts(x,y,0,i%3,.8+(i%3)*.15)
            join('forest',parts); anchor('anchor_trunk_base',(0,0,0))
        builders['fir-'+density]=forest
    for suffix,scale in [('small',.45),('',1),('large',1.8)]:
        def rock(scale=scale):
            winter.rock('unused')
            for o in bpy.context.scene.objects:
                if o.type=='MESH':
                    for v in o.data.vertices: v.co*=scale
                else: o.location*=scale
        builders['rock'+('-'+suffix if suffix else '')]=rock
    for name,color in [('start-gate','mint'),('finish-gate','coral')]:
        def gate(color=color):
            reset(); join('gate_frame',gate_parts(0,0,color)); anchor('anchor_gate_center',(0,0,0))
        builders[name]=gate
    def sign():
        reset(); join('snow_sign',sign_parts()); anchor('anchor_mount',(0,0,0))
    def tower():
        reset(); join('lift_tower',tower_parts()); anchor('anchor_mount',(0,0,0)); anchor('anchor_cable_left',(-2.15,0,6.75)); anchor('anchor_cable_right',(2.15,0,6.75))
    builders['snow-sign']=sign; builders['lift-tower']=tower
    for name,fn in builders.items():
        if args.asset and name not in args.asset.split(','): continue
        fn(); export_asset(name,out)


if __name__=='__main__': main()
