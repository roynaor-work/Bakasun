"""Original faceted winter scenery; no downloaded meshes, images or fonts.

Run with Blender: blender -b --python ski_environment.py -- --out <models>
Native authoring uses metres and Z up; common.finalize exports glTF Y up.
"""
import argparse
import math
import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import reset, mesh, box, cylinder, polyline, join, anchor, finalize


def slope(outdir):
    reset()
    nx, ny = 5, 9
    vertices = []
    for j in range(ny):
        y = -12 + 24*j/(ny-1)
        for i in range(nx):
            x = -7 + 14*i/(nx-1)
            # A broad readable snow surface, with shallow banked shoulders.
            z = .25 + (y+12)*.25 + .1*(abs(x)/7)**2
            vertices.append((x, y, z))
    faces, colors = [], []
    for j in range(ny-1):
        for i in range(nx-1):
            a = j*nx+i
            faces.extend([(a, a+1, a+nx+1), (a, a+nx+1, a+nx)])
            colors.extend(['snow' if i in (0, 3) else 'white']*2)
    mesh('slope_surface', vertices, faces, face_colors=colors)
    # Ordered perimeter with a matching flat underside makes a closed wedge.
    perimeter = list(range(nx))
    perimeter += [j*nx+nx-1 for j in range(1, ny)]
    perimeter += [(ny-1)*nx+i for i in range(nx-2, -1, -1)]
    perimeter += [j*nx for j in range(ny-2, 0, -1)]
    top = [vertices[i] for i in perimeter]
    sides = top + [(p[0], p[1], 0) for p in top]
    n = len(top)
    side_faces, side_colors = [], []
    for i in range(n):
        j = (i+1) % n
        side_faces.extend([(i, n+i, n+j), (i, n+j, j)])
        side_colors.extend(['ice' if i % 3 else 'steel']*2)
    side_faces.append(tuple(range(2*n-1, n-1, -1)))
    side_colors.append('steel')
    join('slope_body', [mesh('slope_sides', sides, side_faces, face_colors=side_colors)])
    # Raised shoulder edges remain separate from the clear central ski line.
    edges, markers = [], []
    for x in (-6.65, 6.65):
        points = [(x, y, .25+(y+12)*.25+.22) for y in (-12, -8, -4, 0, 4, 8, 12)]
        edges.append(polyline('piste_edge', points, .14, 'snow', vertices=6))
        for y in (-9, -3, 3, 9):
            z = .25+(y+12)*.25+.1*(abs(x)/7)**2
            markers.append(cylinder('piste_marker', (x, y, z), (x, y, z+.85), .045, 'coral'))
            markers.append(cylinder('marker_cap', (x, y, z+.63), (x, y, z+.86), .047, 'amber'))
    join('piste_edges', edges)
    join('piste_markers', markers)
    anchor('anchor_route_start', (0, 12, 6.25))
    anchor('anchor_route_end', (0, -12, .25))
    anchor('anchor_gate_center', (0, 0, 3.25))
    anchor('anchor_route_mid', (0, 0, 3.25))
    return finalize('ski-slope', outdir, 'large',
        '14 x 24 m snow piste, 6 m descent. Clear central route; +Z glTF is downhill. '
        'Route anchors lie on the snow surface; base root is under the wedge.',
        view=(1.25, -1.55, 1.0))


def slalom(outdir):
    reset()
    poles, feet = [], []
    for x in (-1.5, 1.5):
        poles.append(cylinder('gate_pole', (x, 0, 0), (x, 0, 2.35), .035, 'coral'))
        poles.append(cylinder('gate_pole_tip', (x, 0, 2.12), (x, 0, 2.35), .037, 'amber'))
        feet.append(box('gate_foot', (x, 0, .035), (.18, .22, .07), 'navy', bevel=.025))
    join('gate_poles', poles)
    join('gate_feet', feet)
    # Thin solid panel avoids one-sided cloth vanishing from behind.
    panel = box('gate_banner', (0, 0, 1.68), (2.95, .035, .78), 'coral')
    accents = []
    for y in (-.019, .019):
        accents.append(mesh('banner_accent', [(-.8,y,1.29),(-.25,y,1.29),(.32,y,2.07),(-.23,y,2.07)],
            [(0,1,2,3) if y<0 else (3,2,1,0)], 'cream'))
        accents.append(mesh('banner_accent', [(.43,y,1.29),(.7,y,1.29),(1.27,y,2.07),(1.0,y,2.07)],
            [(0,1,2,3) if y<0 else (3,2,1,0)], 'mint'))
    join('banner_stripes', accents)
    anchor('anchor_gate_center', (0, 0, 0))
    anchor('anchor_pole_left', (-1.5, 0, 0))
    anchor('anchor_pole_right', (1.5, 0, 0))
    anchor('anchor_banner_center', (0, 0, 1.68))
    return finalize('slalom-gate', outdir, 'equipment',
        '3 m between pole centres; 2.35 m tall. Original unlettered gate banner.', view=(1.2,-2.8,1.1))


def foliage_layer(name, base_z, tip_z, radius, sides, rotation, lean, snow=True, variation=0):
    """A faceted irregular crown with snow painted as geometric upper patches."""
    rim = []
    for i in range(sides):
        t=rotation+2*math.pi*i/sides
        r=radius*(1 + .055*math.sin(i*2.7+variation))
        rim.append((math.cos(t)*r, math.sin(t)*r, base_z + .08*math.sin(i*1.9)))
    tip=(lean[0], lean[1], tip_z)
    verts=rim+[tip, (0,0,base_z+.07)]
    faces=[]
    shades=[]
    for i in range(sides):
        faces.append((i,(i+1)%sides,sides)); shades.append('pine' if i%3 else 'mint')
        faces.append((sides+1,(i+1)%sides,i)); shades.append('pine')
    green=mesh(name, verts, faces, face_colors=shades)
    result=[green]
    if snow:
        # Snow skirts cover upper 65% of each face and dip at alternating tips.
        sv=[(tip[0],tip[1],tip[2]+.008)]
        for i,p in enumerate(rim):
            f=.68 + .07*math.sin(i*2.3+variation)
            sv.append((tip[0]+(p[0]-tip[0])*f*1.012,
                       tip[1]+(p[1]-tip[1])*f*1.012,
                       tip[2]+(p[2]-tip[2])*f+.025))
        sf=[(0,i+1,(i+1)%sides+1) for i in range(sides)]
        result.append(mesh(name+'_snow',sv,sf,face_colors=['white' if i%3 else 'snow' for i in range(sides)]))
    return result


def fir(outdir, variant):
    reset()
    configs={
        'a': {'height':4.4,'layers':[(.6,2.55,1.22),(1.55,3.35,.96),(2.6,4.4,.64)],'sides':7,'lean':(.04,0)},
        'b': {'height':5.2,'layers':[(.7,2.55,.94),(1.6,3.45,.83),(2.65,4.35,.61),(3.7,5.2,.42)],'sides':6,'lean':(-.09,.03)},
        'c': {'height':3.25,'layers':[(.43,1.95,1.23),(1.25,2.6,.99),(2.05,3.25,.57)],'sides':8,'lean':(.02,-.04)},
    }
    c=configs[variant]
    cylinder('trunk',(0,0,0),(0,0,c['height']*.75),.13 if variant!='b' else .105,'wood',vertices=7,radius2=.075)
    foliage=[]
    for j,(bottom,top,r) in enumerate(c['layers']):
        foliage += foliage_layer('boughs',bottom,top,r,c['sides'],j*.17,c['lean'],snow=True,variation=j+ord(variant))
    join('foliage',foliage)
    anchor('anchor_trunk_base',(0,0,0))
    anchor('anchor_tree_tip',(c['lean'][0],c['lean'][1],c['height']))
    # The asymmetric crowns retain their natural silhouette, while the root sits
    # exactly below the horizontal footprint centre. Move anchors with the tree.
    bpy.context.view_layer.update()
    verts=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
    centre=[(min(v[i] for v in verts)+max(v[i] for v in verts))/2 for i in range(2)]
    for o in bpy.context.scene.objects:
        o.location.x-=centre[0]
        o.location.y-=centre[1]
    bpy.context.view_layer.update()
    return finalize('fir-'+variant,outdir,'equipment',
        'Original '+{'a':'broad layered','b':'tall narrow','c':'short full'}[variant]+' winter fir, faceted boughs with geometric snow caps.',
        view=(1.4,-2,1.0))


def rock(outdir):
    reset()
    # Offset rings form an asymmetric boulder with a flat, centred ground contact.
    rings=[(.0,.57,.42),(.32,.75,.56),(.85,.56,.41),(1.19,.29,.24)]
    verts=[]
    for j,(z,rx,ry) in enumerate(rings):
        for i in range(7):
            t=2*math.pi*i/7
            r=1+.08*math.sin(i*3.1+j*.8)
            verts.append((math.cos(t)*rx*r+.04*j,math.sin(t)*ry*r-.025*j,z+.045*math.sin(i*2) if j>0 else z))
    faces=[tuple(range(6,-1,-1))]
    colors=['steel']
    for j in range(3):
        for i in range(7):
            a=j*7+i; b=j*7+(i+1)%7
            faces.extend([(a,b,b+7),(a,b+7,a+7)])
            colors.extend([('grey','steel','ice')[(i+j)%3],('grey','steel','ice')[(i+j+1)%3]])
    verts.append((.06,-.04,1.37))
    for i in range(7):
        faces.append((21+i,21+(i+1)%7,28)); colors.append('snow' if i<4 else 'grey')
    o=mesh('rock_body',verts,faces,face_colors=colors)
    # Place the centre of the whole footprint at the root without changing its height.
    lo=[min(v.co[i] for v in o.data.vertices) for i in range(2)]
    hi=[max(v.co[i] for v in o.data.vertices) for i in range(2)]
    shift=[(lo[i]+hi[i])/2 for i in range(2)]
    for v in o.data.vertices: v.co.x-=shift[0]; v.co.y-=shift[1]
    anchor('anchor_rock_top',(.06-shift[0],-.04-shift[1],1.37))
    return finalize('rock',outdir,'equipment','Original faceted winter boulder with pale upper facets and flat ground contact.')


def fence(outdir):
    reset()
    posts=[]
    for x in (-1.5,1.5):
        posts.append(cylinder('fence_post',(x,0,0),(x,0,1.18),.037,'navy'))
        posts.append(cylinder('fence_post_cap',(x,0,1.08),(x,0,1.2),.04,'amber'))
    join('fence_posts',posts)
    strands=[]
    # Open square safety web; cords remain legible in a phone-sized silhouette.
    for j in range(5):
        z=.19+j*.18
        strands.append(cylinder('fence_cord',(-1.5,0,z),(1.5,0,z),.016,'coral',vertices=5))
    for i in range(16):
        x=-1.5+i*.2
        strands.append(cylinder('fence_cord',(x,0,.19),(x,0,.91),.014,'coral',vertices=5))
    join('fence_net',strands)
    join('fence_rails',[
        cylinder('top_band',(-1.5,0,1.0),(1.5,0,1.0),.025,'orange',vertices=6),
        cylinder('bottom_band',(-1.5,0,.13),(1.5,0,.13),.025,'orange',vertices=6)])
    anchor('anchor_connect_left',(-1.5,0,0))
    anchor('anchor_connect_right',(1.5,0,0))
    anchor('anchor_fence_center',(0,0,.6))
    return finalize('fence',outdir,'equipment','3 m between connection anchors; 1.2 m high original open safety fence.',view=(1.15,-3,1.1))


def build(outdir):
    return [slope(outdir),slalom(outdir),fir(outdir,'a'),fir(outdir,'b'),fir(outdir,'c'),rock(outdir),fence(outdir)]


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',required=True)
    parser.add_argument('--asset',choices=['all','firs','fir-a','fir-b','fir-c'],default='all')
    opts=parser.parse_args(args)
    if opts.asset=='all':
        build(opts.out)
    else:
        for variant in ('a','b','c') if opts.asset=='firs' else (opts.asset[-1],):
            fir(opts.out,variant)
