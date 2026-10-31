"""Original unbranded sports footwear and alpine equipment, authored in metres.

Parts are modelled in the shared bind frame and weighted to existing joints only.
No third-party geometry, reference photographs, logos or scanned people are used.
"""
from __future__ import annotations
import math
import numpy as np


def _surface(mesh, rings, region, weights, color=None, cap=True):
    """Join equal-length closed rings; orient every face away from its local axis."""
    n = len(rings[0])
    vertices = [list(v) for ring in rings for v in ring]
    faces = []
    centers = [np.mean(ring, axis=0) for ring in rings]
    for row in range(len(rings) - 1):
        for j in range(n):
            k = (j + 1) % n
            faces.extend(((row*n+j, (row+1)*n+j, row*n+k),
                          (row*n+k, (row+1)*n+j, (row+1)*n+k)))
    if cap:
        lo, hi = len(vertices), len(vertices)+1
        vertices.extend((centers[0].tolist(), centers[-1].tolist()))
        for j in range(n):
            k = (j+1) % n
            faces.extend(((lo, k, j), (hi, (len(rings)-1)*n+j, (len(rings)-1)*n+k)))
    # A volume centroid gives a robust outward orientation for these convex parts.
    v = np.asarray(vertices)
    center = v.mean(axis=0)
    outward = []
    for face in faces:
        a, b, c = face
        norm = np.cross(v[b]-v[a], v[c]-v[a])
        if np.dot(norm, (v[a]+v[b]+v[c])/3-center) < 0:
            outward.append((a,c,b))
        else:
            outward.append(face)
    mesh.add(vertices, outward, region, weights, color=color)


def _line(mesh, points, radius, region, weights, color=None, segments=6):
    mesh.tube(points, radius, region, weights, segments=segments, color=color)


def _shoe_upper(mesh, x, weights, high_top=False):
    """An asymmetric shoe last: rounded heel, instep, low toe, flattened underside."""
    stations = [(-.123,.006,.070,.040),(-.115,.032,.101,.033),
                (-.093,.043,.121,.031),(-.061,.047,.127 if high_top else .113,.029),
                (-.025,.049,.114 if high_top else .101,.028),
                (.018,.052,.091,.027),(.060,.051,.079,.027),
                (.096,.044,.069,.029),(.116,.027,.059,.033),(.122,.004,.049,.040)]
    rings = []
    for z,width,top,bottom in stations:
        row=[]
        mid=(top+bottom)/2
        for j in range(20):
            a=2*math.pi*j/20
            row.append((x+width*math.cos(a), mid+(top-bottom)*.5*math.sin(a), z))
        rings.append(row)
    _surface(mesh,rings,'shoes',weights)


def _sole(mesh, x, weights, kind):
    # Raised toe and a tighter heel make the silhouette read as sports footwear.
    outline=[]
    for j in range(32):
        a=2*math.pi*j/32
        z=.003+.124*math.cos(a)
        width=.0515 if z>-.025 else .045
        outline.append((width*math.sin(a),z))
    rings=[]
    for y,s in ((.012,.96),(.018,1.02),(.030,1.0),(.034,.96)):
        rings.append([(x+px*s,y+max(0,pz-.065)*.10,pz) for px,pz in outline])
    _surface(mesh,rings,'soles',weights)
    # A thin welt breaks the upper/sole edge without a painted texture.
    _line(mesh,[(x+px,.032+max(0,pz-.065)*.10,pz) for px,pz in outline+outline[:1]],
          .0012,'preserve',weights,color='#263446',segments=5)
    if kind!='skier':
        # Individually modelled outsole lugs. Cleats retain clear studs in profile.
        stud_y=.008 if kind in ('soccer-player','goalkeeper') else .010
        for z in (-.087,-.046,.017,.066,.093):
            for side in (-1,1):
                sx=x+side*(.032 if z<.075 else .027)
                mesh.ellipsoid((sx,stud_y,z),(.0065,.006,.008),
                               'shoes' if kind!='basketball-player' else 'preserve',weights,
                               segments=8,rings=4,
                               color='#303C48' if kind=='basketball-player' else None)


def _shoe_details(mesh,x,weights,kind):
    basketball=kind=='basketball-player'
    # Separate padded tongue, heel counter and collar have actual volume.
    mesh.ellipsoid((x,.101,-.029),(.020,.010,.055),'accent',weights,segments=12,rings=6)
    mesh.ellipsoid((x,.083,-.111),(.030,.029,.010),'preserve',weights,
                   segments=12,rings=6,color='#293749')
    if basketball:
        # High ankle collar surrounds the bone with an open, dark padded rim.
        ring=[]
        for j in range(20):
            a=2*math.pi*j/20
            ring.append((x+.036*math.cos(a),.128+.004*math.sin(a),-.064+.035*math.sin(a)))
        _line(mesh,ring+ring[:1],.005,'accent',weights,segments=6)
        # Sculpted support panels on each side, distinct from any branded stripes.
        for side in (-1,1):
            mesh.ellipsoid((x+side*.045,.069,-.019),(.004,.019,.057),'preserve',weights,
                           segments=12,rings=6,color='#334153')
            _line(mesh,[(x+side*.046,.074,.064),(x+side*.049,.092,.008),
                        (x+side*.041,.119,-.062)],.002,'accent',weights)
    else:
        for side in (-1,1):
            # Curved original support panel seam, following the shoe last.
            _line(mesh,[(x+side*.041,.065,-.089),(x+side*.050,.063,-.018),
                        (x+side*.049,.057,.049),(x+side*.035,.053,.101)],
                  .0017,'accent',weights)
    # Five crossed lace runs with compact eyelets; no single painted lace stripe.
    for j in range(5):
        z=-.058+j*.020
        span=.021-j*.0008
        upper=float(np.interp(z,[-.061,-.025,.018,.060],
                              [.127 if basketball else .113,.114 if basketball else .101,.091,.079]))
        tongue=.101+.010*math.sqrt(max(0,1-((z+.029)/.055)**2))
        middle=max(upper,tongue)+.002
        # Eyelets sit on the curved upper; the crossing rests on the padded tongue.
        edge=(upper+.028)/2+(upper-.028)/2*math.sqrt(1-(span/.05)**2)+.0015
        for side in (-1,1):
            mesh.ellipsoid((x+side*(span+.002),edge-.001,z),(.0033,.0021,.0033),
                           'preserve',weights,segments=8,rings=4,color='#485665')
        _line(mesh,[(x-span,edge,z-.004),(x,middle,z+.002),
                    (x+span,edge,z+.007)],.0015,'soles',weights)
    # Toe-box stitching is a real narrow arc, not a logo or texture.
    arc=[]
    for j in range(13):
        a=math.pi*.13+math.pi*.74*j/12
        arc.append((x+.039*math.cos(a),.059+.005*math.sin(a),.073+.030*math.sin(a)))
    _line(mesh,arc,.0011,'accent',weights,segments=5)


def _ski_boot(mesh,x,weights):
    # Rigid shell heel, instep and taller ankle cuff, with a reinforced toe cap.
    rings=[]
    for y,rx,rz,cz in ((.029,.049,.112,.0),(.049,.049,.112,.0),
                       (.078,.045,.096,-.012),(.103,.039,.063,-.039),
                       (.145,.035,.043,-.062),(.167,.033,.040,-.062)):
        rings.append([(x+rx*math.cos(a),y,cz+rz*math.sin(a))
                      for a in np.linspace(0,2*math.pi,20,endpoint=False)])
    _surface(mesh,rings,'shoes',weights)
    mesh.ellipsoid((x,.058,.099),(.040,.025,.020),'preserve',weights,
                   segments=12,rings=6,color='#314459')
    # Three straps and individual buckle levers remain visible at preview scale.
    for y,z,span in ((.078,.050,.044),(.116,-.038,.037),(.148,-.056,.035)):
        _line(mesh,[(x-span,y,z-.008),(x,y+.008,z+.005),(x+span,y,z-.008)],
              .004,'accent',weights,segments=6)
        mesh.ellipsoid((x+span*.75,y+.005,z+.006),(.009,.005,.009),
                       'preserve',weights,segments=8,rings=4,color='#425464')
    # Cuff rim around the shin socket.
    rim=[(x+.034*math.cos(a),.168,-.062+.041*math.sin(a))
         for a in np.linspace(0,2*math.pi,20,endpoint=False)]
    _line(mesh,rim+rim[:1],.003,'soles',weights,segments=5)


def _ski(mesh,x,weights):
    # Cambered thin ski with a curved shovel, rounded tail, sidewalls and binding.
    stations=[(-.450,.006,.018),(-.439,.018,.014),(-.400,.021,.010),
              (-.260,.022,.009),(-.080,.021,.010),(.100,.022,.012),
              (.280,.026,.015),(.390,.028,.026),(.438,.022,.049),(.451,.005,.062)]
    rings=[]
    for z,w,y in stations:
        rings.append([(x-w,y-.005,z),(x+w,y-.005,z),(x+w,y+.005,z),(x-w,y+.005,z)])
    _surface(mesh,rings,'equipment',weights)
    # A thin top inlay on the tail and shovel uses the existing accent swatch.
    for start,end in ((-.40,-.14),(.15,.37)):
        pts=[]
        for z in np.linspace(start,end,7):
            y=float(np.interp(z,[s[0] for s in stations],[s[2] for s in stations]))
            pts.append((x,y+.006,z))
        _line(mesh,pts,.003,'accent',weights,segments=5)
    for z in (-.097,.084):
        mesh.ellipsoid((x,.026,z),(.036,.012,.021),'preserve',weights,
                       segments=12,rings=6,color='#344B5F')
        mesh.ellipsoid((x,.038,z),(.020,.009,.013),'accent',weights,
                       segments=10,rings=5)


def _helmet(mesh):
    weight={'Head':1.}
    # A crown cap with a genuinely open lower rim leaves the face readable.
    rings=[]
    for lat in np.linspace(0.075,math.pi/2,10):
        rings.append([(.089*math.sin(lat)*math.cos(a),
                       1.246+.096*math.cos(lat),
                       -.006+.102*math.sin(lat)*math.sin(a))
                      for a in np.linspace(0,2*math.pi,28,endpoint=False)])
    _surface(mesh,rings,'helmet',weight,cap=False)
    # Close only the tiny upper opening, retaining the open lower helmet rim.
    cap_vertices=[(0,1.342,-.006)]+rings[0]
    cap_faces=[(0,1+(j+1)%28,1+j) for j in range(28)]
    # Ring points run from +X toward +Z; reversed order faces upward in Y-up space.
    mesh.add(cap_vertices,cap_faces,'helmet',weight)
    rim=[(.089*math.cos(a),1.246,-.006+.102*math.sin(a))
         for a in np.linspace(0,2*math.pi,28,endpoint=False)]
    _line(mesh,rim+rim[:1],.0023,'preserve',weight,color='#334C5D',segments=5)
    # Vent channels sit on the upper shell rather than floating above its apex.
    for sx in (-.038,0,.038):
        pts=[]
        for z in np.linspace(-.040,.040,6):
            y=1.246+.096*math.sqrt(max(0,1-(sx/.089)**2-((z+.006)/.102)**2))+.0018
            pts.append((sx,y,z))
        _line(mesh,pts,.0032,'preserve',weight,color='#334C5D',segments=6)
    # Raised double goggles, with a frame, nose bridge and a solid tinted lens.
    for side in (-1,1):
        cx=side*.032
        mesh.ellipsoid((cx,1.284,.087),(.034,.023,.008),'accent',weight,
                       segments=16,rings=8)
        mesh.ellipsoid((cx,1.284,.094),(.028,.017,.004),'preserve',weight,
                       segments=16,rings=8,color='#9ACBCF')
        _line(mesh,[(side*.061,1.282,.082),(side*.079,1.280,.052),
                    (side*.086,1.275,.003)],.005,'preserve',weight,color='#334C5D',segments=6)
    _line(mesh,[(-.007,1.284,.093),(0,1.280,.097),(.007,1.284,.093)],
          .004,'accent',weight,segments=6)


def add_gear(mesh,model,rig):
    """Add footwear to all athletes; alpine safety equipment to the skier."""
    for side in ('Left','Right'):
        x=float(rig[side+'Foot'][0])
        weights={side+'Foot':1.}
        _sole(mesh,x,weights,model)
        if model=='skier':
            _ski_boot(mesh,x,weights)
            _ski(mesh,x,weights)
        else:
            _shoe_upper(mesh,x,weights,model=='basketball-player')
            _shoe_details(mesh,x,weights,model)
    if model=='skier':
        first_head_vertex=len(mesh.positions)
        _helmet(mesh)
        # Match the final head sculpt while retaining the original bind skeleton.
        for vertex in mesh.positions[first_head_vertex:]:
            vertex[0]*=.95
            vertex[1]=1.09+(vertex[1]-1.075)*.758
            vertex[2]*=.95
