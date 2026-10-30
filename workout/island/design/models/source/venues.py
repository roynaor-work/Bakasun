"""Original open-roof venue shells, designed for a readable elevated phone camera."""
import math, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *

def octagon(x,y,c):
    return [(-x+c,-y),(x-c,-y),(x,-y+c),(x,y-c),(x-c,y),(-x+c,y),(-x,y-c),(-x,-y+c)]

def band(name,inner,outer,z0,z1,color):
    # Annular solid with no hidden fill across the playable opening.
    verts=[(x,y,z) for pts,z in ((inner,z0),(outer,z0),(inner,z1),(outer,z1)) for x,y in pts]
    faces=[]
    for i in range(8):
        j=(i+1)%8
        faces.extend([(16+i,24+i,24+j,16+j),(i,j,8+j,8+i),(i,16+i,16+j,j),(8+i,8+j,24+j,24+i)])
    return mesh(name,verts,faces,color)

def rectangle_lines(name,w,l,z,color='white',width=.08):
    return polyline(name,[(-w/2,-l/2,z),(w/2,-l/2,z),(w/2,l/2,z),(-w/2,l/2,z)],width/2,color,4,True)

def arc(name,c,r,z,color='white',steps=48,start=0,end=2*math.pi,width=.08):
    pts=[(c[0]+r*math.cos(start+(end-start)*i/steps),c[1]+r*math.sin(start+(end-start)*i/steps),z) for i in range(steps+1)]
    return polyline(name,pts,width/2,color,4)

def truss(name,a,b,r=.09,color='cream'):
    return cylinder(name,a,b,r,color,6)

def stadium(outdir):
    reset(); structural=[]; seats=[]; rails=[]; roofs=[]; beams=[]; lamps=[]
    # Pitch is a texture-ready flat surface, with no blades, turf geometry or image dependency.
    pitch=mesh('pitch_surface',[(-34,-52.5,.04),(34,-52.5,.04),(34,52.5,.04),(-34,52.5,.04)],[(0,1,2,3)],'white')
    pitch['uv_layout']='full_surface_0_1'; pitch['suggested_texture']='../environment/textures/grass-mown.webp'
    pitch['surface_size_m']=[68,105]
    structural.append(band('concourse',octagon(35,54,3),octagon(48,67,9),0,.48,'navy'))
    for row in range(7):
        ix,iy=35.5+row*1.35,54.5+row*1.35
        structural.append(band('tier',octagon(ix,iy,4+row*.55),octagon(ix+1.4,iy+1.4,4.6+row*.55),.48,row*1.16+1.15,'steel'))
        seats.append(band('seat_row',octagon(ix+.25,iy+.25,4.2+row*.55),octagon(ix+1.17,iy+1.17,4.6+row*.55),row*1.16+1.16,row*1.16+1.42,['mint','coral','cream','mint','navy','cream','mint'][row]))
    # Clearly contrasting stair aisles break broad colour bands without seat-sized visual noise.
    for x in (-22,0,22):
        for sign in (-1,1):
            for row in range(7):
                rails.append(box('aisle',(x,sign*(55.2+row*1.35),row*1.16+1.48),(1.7,1.42,.08),'cream'))
    for y in (-37,-13,13,37):
        for sign in (-1,1):
            for row in range(7): rails.append(box('aisle',(sign*(36.2+row*1.35),y,row*1.16+1.48),(1.42,1.7,.08),'cream'))
    for sign in (-1,1):
        roofs.append(box('roof',(sign*45.1,0,11.5),(7.2,109,.32),'mint',.15))
        roofs.append(box('roof',(0,sign*64.2,11.5),(79,5.8,.32),'cream',.15))
        for y in (-48,-24,0,24,48):
            beams += [truss('roof_column',(sign*47,y,.5),(sign*47,y,11.4),.24,'navy'),truss('roof_brace',(sign*47,y,8.4),(sign*41.5,y,11.3),.13)]
    for sx in (-1,1):
        for sy in (-1,1):
            x,y=sx*41,sy*59
            beams.append(truss('light_mast',(x,y,0),(x,y,16),.27,'navy'))
            housing=box('light_housing',(x,y,16),(5.6,.65,1.7),'navy',.1); lamps.append(housing)
            for col in range(4):
                for row in range(2): lamps.append(box('light_panel',(x-2.05+col*1.36,y-.35,15.56+row*.84),(1.05,.12,.58),'cream',.05))
    join('stand_shell',structural); join('seating',seats); join('aisles',rails); join('roof',roofs); join('beams',beams); join('floodlights',lamps)
    marks=[rectangle_lines('touchlines',68,105,.07,width=.14),polyline('halfway_line',[(-34,0,.07),(34,0,.07)],.07,'white',4),arc('center_circle',(0,0),9.15,.07,width=.14)]
    for sy in (-1,1):
        for w,d in ((40.32,16.5),(18.32,5.5)):
            marks.append(polyline('penalty_area',[(-w/2,sy*52.5,.07),(-w/2,sy*(52.5-d),.07),(w/2,sy*(52.5-d),.07),(w/2,sy*52.5,.07)],.07,'white',4))
        marks.append(cylinder('penalty_spot',(0,sy*41.5,.04),(0,sy*41.5,.08),.19,'white',12))
        anchor('anchor_goal_'+('north' if sy==1 else 'south'),(0,sy*52.5,.04))
        anchor('anchor_ball_spot_'+('north' if sy==1 else 'south'),(0,sy*41.5,.04))
    join('field_markings',marks); anchor('anchor_ball_spot',(0,0,.04)); anchor('anchor_field_center',(0,0,.04))
    finalize('soccer-stadium',outdir,'large','Single open-roof stadium shell; 68 x 105 m flat pitch, no grass geometry or embedded grass image.',view=(1.2,-1.5,1.35))

def digit(parts,cx,y,z,value,scale=.25):
    codes={'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg'}
    # Seven-segment scoreboard: fictional unbranded starting score 00:00.
    layout={'a':(0,1,1,.15),'b':(.5,.5,.15,1),'c':(.5,-.5,.15,1),'d':(0,-1,1,.15),'e':(-.5,-.5,.15,1),'f':(-.5,.5,.15,1),'g':(0,0,1,.15)}
    for s in codes[str(value)]:
        dx,dz,w,h=layout[s]; parts.append(box('segment',(cx+dx*scale,y,z+dz*scale),(w*scale,.04,h*scale),'amber'))

def arena(outdir):
    reset(); shell=[]; seats=[]; beams=[]; roof=[]
    mesh('court_surface',[(-7.5,-14,0),(7.5,-14,0),(7.5,14,0),(-7.5,14,0)],[(0,1,2,3)],'wood')
    shell.append(band('surround',octagon(7.7,14.3,.5),octagon(15.3,22,3),0,.3,'navy'))
    for row in range(5):
        ix,iy=8.4+row*1.15,15+row*1.15
        shell.append(band('tier',octagon(ix,iy,1.4+row*.2),octagon(ix+1.2,iy+1.2,1.6+row*.2),.3,.8+row*.85,'steel'))
        seats.append(band('seat_row',octagon(ix+.2,iy+.2,1.5+row*.2),octagon(ix+1.02,iy+1.02,1.7+row*.2),.82+row*.85,1.08+row*.85,['purple','amber','purple','cream','purple'][row]))
    for sign in (-1,1):
        roof.append(box('canopy',(sign*14,0,7),(2.8,36,.3),'purple',.12))
        for y in (-17,-8,0,8,17):
            beams.append(truss('column',(sign*15,y,.3),(sign*15,y,7),.16,'navy'))
            beams.append(truss('brace',(sign*15,y,5.6),(sign*12.6,y,7),.09,'cream'))
    for sign in (-1,1):
        roof.append(box('end_canopy',(0,sign*20,7),(28,2.8,.3),'cream',.12))
        beams.append(truss('end_beam',(-13,sign*19.2,6.8),(13,sign*19.2,6.8),.14,'navy'))
    join('arena_shell',shell); join('seating',seats); join('beams',beams); join('roof',roof)
    lines=[rectangle_lines('court_boundary',15,28,.026,width=.05),polyline('halfway_line',[(-7.5,0,.026),(7.5,0,.026)],.025,'cream',4),arc('center_circle',(0,0),1.8,.026,'cream',48,width=.05)]
    for sy in (-1,1):
        lines.append(polyline('key',[(-2.45,sy*14,.026),(-2.45,sy*8.2,.026),(2.45,sy*8.2,.026),(2.45,sy*14,.026)],.025,'cream',4))
        lines.append(arc('free_throw',(0,sy*8.2),1.8,.026,'cream',32,width=.05))
        lines.append(arc('three_point',(0,sy*12.425),6.75,.026,'cream',48,0 if sy<0 else math.pi,math.pi if sy<0 else 2*math.pi,width=.05))
    join('court_markings',lines)
    # Backboard/rim frame is built into shell at both ends. Standalone hoop remains separate.
    frames=[]; boards=[]; rims=[]
    for sy in (-1,1):
        frames.append(box('basket_base',(0,sy*15.7,.25),(1.2,1.7,.5),'purple',.10))
        frames.append(truss('basket_support',(0,sy*15.7,.5),(0,sy*15.7,4.2),.12,'navy'))
        frames.append(truss('basket_arm',(0,sy*15.7,4.2),(0,sy*12.85,3.7),.10,'navy'))
        boards.append(box('backboard',(0,sy*12.85,3.675),(1.8,.1,1.05),'cream',.025))
        rims.append(ring('rim',(0,sy*12.425,3.05),.244,.019,'coral',32,6))
        anchor('anchor_rim_center_'+('north' if sy>0 else 'south'),(0,sy*12.425,3.05))
    join('basket_frame',frames); join('backboard',boards); join('rim',rims)
    board=[box('scoreboard_body',(0,19,5.3),(5,.25,1.8),'navy',.1)]
    for x in (-1.55,-.7,.7,1.55): digit(board,x,18.84,5.3,0,.48)
    for z in (5.08,5.52): board.append(box('colon',(0,18.84,z),(.10,.05,.10),'coral'))
    join('scoreboard',board)
    anchor('anchor_ball_spot',(0,0,0)); anchor('anchor_free_throw_north',(0,8.2,0)); anchor('anchor_free_throw_south',(0,-8.2,0))
    anchor('anchor_scoreboard_center',(0,19,5.3))
    finalize('basketball-arena',outdir,'large','Open-roof arena, 15 x 28 m court, stands, scoreboard and two basket frames. Rim world height 3.05 m.',view=(1.3,-1.65,1.5))

def build(outdir):
    stadium(outdir); arena(outdir)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(); p.add_argument('--out',required=True)
    build(p.parse_args(sys.argv[sys.argv.index('--')+1:]).out)
