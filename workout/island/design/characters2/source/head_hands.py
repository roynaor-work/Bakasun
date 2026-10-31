"""Original compact athlete heads and five-finger hands, in the shared bind space.

All details are modeled surfaces. No portrait, scan, commercial game mesh or texture
was used. Facial pieces follow Head; fingers follow the existing Hand joints.
"""
from math import sin, cos, pi, exp, acos
import numpy as np


HEAD_WEIGHTS = {"Head": 1.0}


def _rings(mesh, rows, region, weights, segments=32, color=None, sculpt=None):
    """Horizontal oval sections (y, half-width, front-z, back-z), capped."""
    vertices, faces = [], []
    for y, rx, front, back in rows:
        mid = (front + back) * .5
        for j in range(segments):
            a = j * 2*pi/segments
            x, z = rx*sin(a), mid+(front-back)*.5*cos(a)
            if sculpt is not None:
                x, y1, z = sculpt(x, y, z, a)
            else:
                y1 = y
            vertices.append([x, y1, z])
    for k in range(len(rows)-1):
        for j in range(segments):
            a, b = k*segments+j, k*segments+(j+1)%segments
            c, d = a+segments, b+segments
            faces.extend([(a,b,c),(b,d,c)])
    bottom = len(vertices)
    vertices.append([0, rows[0][0], (rows[0][2]+rows[0][3])*.5])
    top = len(vertices)
    vertices.append([0, rows[-1][0], (rows[-1][2]+rows[-1][3])*.5])
    for j in range(segments):
        faces.append((bottom,(j+1)%segments,j))
        off=(len(rows)-1)*segments
        faces.append((top,off+j,off+(j+1)%segments))
    mesh.add(vertices, faces, region, weights, color=color)


def _face(mesh, model):
    width = {"soccer-player":1.00, "goalkeeper":1.055,
             "basketball-player":.96, "skier":.97}[model]
    # Cranial vault, temple, cheekbone, mandibular angle and compact chin.
    rows = [
        (1.075,.014,.043,-.011), (1.082,.031,.056,-.031),
        (1.095,.047,.062,-.047), (1.111,.057,.068,-.060),
        (1.128,.065,.072,-.072), (1.145,.070,.077,-.080),
        (1.160,.074,.079,-.085), (1.176,.077,.079,-.089),
        (1.192,.078,.080,-.091), (1.207,.077,.079,-.092),
        (1.220,.075,.079,-.090), (1.235,.074,.080,-.088),
        (1.250,.073,.078,-.084), (1.267,.068,.071,-.078),
        (1.283,.058,.058,-.066), (1.296,.045,.042,-.052),
        (1.307,.025,.021,-.033), (1.312,.005,-.002,-.012),
    ]
    def sculpt(x,y,z,a):
        x *= width
        forward = max(cos(a),0)**5
        # Modest orbital recesses and cheek planes; no painted fake shading.
        sockets = exp(-((abs(x)-.031)/.017)**2-((y-1.215)/.014)**2)
        cheek = exp(-((abs(x)-.042)/.018)**2-((y-1.182)/.019)**2)
        muzzle = exp(-(x/.029)**2-((y-1.143)/.021)**2)
        return x,y,z + forward*(-.0042*sockets+.0025*cheek+.0018*muzzle)
    _rings(mesh,[(y,rx*1,front,back) for y,rx,front,back in rows],
           "skin",HEAD_WEIGHTS,40,sculpt=sculpt)
    # Nose bridge has a distinct dorsum, alae and tip, with small underside nostrils.
    _rings(mesh,[
        (1.174,.005,.090,.076), (1.178,.011,.103,.076),
        (1.183,.012,.113,.077), (1.189,.010,.112,.078),
        (1.198,.008,.104,.078), (1.211,.006,.094,.078),
        (1.226,.004,.085,.078), (1.236,.002,.081,.077),
    ], "skin",HEAD_WEIGHTS,20)
    for sign in [-1,1]:
        mesh.ellipsoid([sign*.0106,1.179,.091],[.006,.0046,.006],
                       'skin',HEAD_WEIGHTS,segments=12,rings=6)
        mesh.ellipsoid([sign*.008,1.1766,.096],[.003,.0014,.0018],
                       'preserve_nostril',HEAD_WEIGHTS,segments=10,rings=4,color='#593C37')
    # Philtrum and lips: a thin closed neutral mouth, not a broad cartoon smile.
    mesh.tube([[-.023,1.1425,.078],[-.012,1.145,.081],[-.005,1.144,.082],
               [0,1.1457,.0826],[.005,1.144,.082],[.012,1.145,.081],[.023,1.1425,.078]],
              [.0007,.0016,.0019,.0017,.0019,.0016,.0007],
              'preserve_lip',HEAD_WEIGHTS,segments=8,color='#916451')
    mesh.tube([[-.022,1.1413,.079],[-.011,1.1401,.082],[0,1.1399,.083],
               [.011,1.1401,.082],[.022,1.1413,.079]],
              [.0007,.002,.0025,.002,.0007],
              'preserve_lip',HEAD_WEIGHTS,segments=8,color='#916451')
    mesh.tube([[-.021,1.142,.081],[-.010,1.1427,.084],[0,1.1423,.0845],
               [.010,1.1427,.084],[.021,1.142,.081]],
              [.0005,.00065,.0007,.00065,.0005],
              'preserve_mouth',HEAD_WEIGHTS,segments=6,color='#513A35')
    # Ears include the helix, concha and tragus, attached to the head, not floating.
    for sign in [-1,1]:
        mesh.ellipsoid([sign*.077*width,1.205,-.007],[.013,.021,.012],
                       'skin',HEAD_WEIGHTS,segments=14,rings=9)
        mesh.ellipsoid([sign*.083*width,1.205,.001],[.0065,.0135,.004],
                       'skin',HEAD_WEIGHTS,segments=12,rings=7)
        path=[]
        for a in np.linspace(-.65*pi,1.16*pi,15):
            path.append([sign*(.079*width+.008*cos(a)),1.205+.018*sin(a),.0025])
        mesh.tube(path,[.002]*len(path),'skin',HEAD_WEIGHTS,segments=7)
        mesh.ellipsoid([sign*.076*width,1.202,.006],[.004,.006,.0045],
                       'skin',HEAD_WEIGHTS,segments=10,rings=5)
    _eyes(mesh,model,width)


def _eyes(mesh,model,width):
    iris_color={'soccer-player':'#4E665B','goalkeeper':'#58696D',
                'basketball-player':'#5C4839','skier':'#776744'}[model]
    for sign in [-1,1]:
        cx=sign*.031*width
        mesh.ellipsoid([cx,1.215,.0765],[.0155,.0067,.0058],
                       'preserve_eyeWhite',HEAD_WEIGHTS,segments=20,rings=8,color='#E3E1D7')
        mesh.ellipsoid([cx,1.215,.0818],[.0042,.0048,.0016],
                       'preserve_iris',HEAD_WEIGHTS,segments=16,rings=7,color=iris_color)
        mesh.ellipsoid([cx,1.215,.0832],[.0018,.0025,.0008],
                       'preserve_pupil',HEAD_WEIGHTS,segments=12,rings=5,color='#172126')
        mesh.ellipsoid([cx-sign*.0012,1.2171,.0839],[.0008,.001,.00045],
                       'preserve_eyeGlint',HEAD_WEIGHTS,segments=8,rings=4,color='#F4F6F0')
        # Upper and lower lids partly cover the globe to give a focused almond eye.
        upper=[]; lower=[]
        for t in np.linspace(0,pi,11):
            dx=.0157*cos(t)
            upper.append([cx+dx,1.2148+.0061*sin(t),.0795+.0018*sin(t)])
            lower.append([cx+dx,1.215-.0049*sin(t),.0798+.0014*sin(t)])
        mesh.tube(upper,[.0013]*11,'skin',HEAD_WEIGHTS,segments=7)
        mesh.tube(lower,[.0012]*11,'skin',HEAD_WEIGHTS,segments=7)
        brow=[]
        for t in np.linspace(-1,1,10):
            brow.append([cx+sign*t*.017,1.233+.0035*(1-t*t)-.002*t,
                         .078-.004*abs(t)])
        mesh.tube(brow,[.0013+.0012*(1-abs(t)) for t in np.linspace(-1,1,10)],
                  'hair',HEAD_WEIGHTS,segments=8)


def _hair(mesh,model):
    """A continuous cap with a groomed silhouette and modeled directional ridges."""
    if model=='basketball-player':
        cy,ry,rx,rz=1.205,.119,.080,.089
        amplitude=.0025
    elif model=='soccer-player':
        cy,ry,rx,rz=1.207,.123,.081,.090
        amplitude=.0028
    elif model=='goalkeeper':
        cy,ry,rx,rz=1.207,.124,.085,.091
        amplitude=.002
    else:
        cy,ry,rx,rz=1.203,.120,.080,.089
        amplitude=.001
    segments, bands=40,12
    # A single crown pole survives Draco quantization without a collapsed ring.
    vertices=[[0,cy+ry,-.004]]
    for k in range(1,bands+1):
        u=k/bands
        for j in range(segments):
            a=j*2*pi/segments
            front=max(cos(a),0)
            back=max(-cos(a),0)
            hairline=1.205+.052*(front**2)-.038*(back**2)
            if model=='soccer-player':
                hairline+=.004*sin(a*2+.6)*front
            if model=='basketball-player':
                hairline+=.0025*cos(a*8)
            limit=acos(np.clip((hairline-cy)/ry,-.98,.98))
            p=u*limit
            ripple=amplitude*sin(p*19+a*7)**2*sin(p)
            quiff=.003*max(cos(a-.5),0)*sin(p)**2 if model=='soccer-player' else 0
            x=(rx+ripple)*sin(p)*sin(a)
            z=-.004+(rz+ripple)*sin(p)*cos(a)
            y=cy+(ry+quiff)*cos(p)
            vertices.append([x,y,z])
    # Fan from the crown to the first full ring, with outward-facing winding.
    faces=[(0,1+j,1+(j+1)%segments) for j in range(segments)]
    # Top-to-bottom ring order requires the opposite winding of the face loft.
    for k in range(bands-1):
        for j in range(segments):
            a=1+k*segments+j;b=1+k*segments+(j+1)%segments
            c=a+segments;d=b+segments
            faces.extend([(a,c,b),(b,c,d)])
    mesh.add(vertices,faces,'hair',HEAD_WEIGHTS)
    # Close-cropped temples blend into the same recolorable region.
    for sign in [-1,1]:
        mesh.tube([[sign*rx*.94,1.231,-.005],[sign*rx*.96,1.210,-.002],
                   [sign*rx*.94,1.189,.001]],
                  [.005,.004,.002],'hair',HEAD_WEIGHTS,segments=8)
    if model=='soccer-player':
        # Three swept locks with solid volume, never alpha cards.
        for shift in [-.020,0,.020]:
            mesh.tube([[shift-.012,1.314,.043],[shift-.002,1.324,.027],
                       [shift+.011,1.325,.006],[shift+.025,1.318,-.013]],
                      [.004,.006,.006,.0015],'hair',HEAD_WEIGHTS,segments=8)


def _hand(mesh,model,sign,rig):
    bone='LeftHand' if sign>0 else 'RightHand'
    weight={bone:1.0}
    origin=np.asarray(rig[bone],dtype=float)
    glove=model in ('goalkeeper','skier')
    region='gloves' if glove else 'skin'
    bulk=1.13 if model=='goalkeeper' else 1.04 if model=='skier' else 1.0
    def point(x,y=0,z=0):
        return (origin+np.array([sign*x,y,z])).tolist()
    # Gradually widening wrist and metacarpal volume; cuffs overlap the forearm.
    mesh.ellipsoid(point(.028,-.0005,-.001),[.034,.0235*bulk,.013*bulk],
                   region,weight,segments=16,rings=9)
    mesh.tube([point(-.013),point(.001),point(.016)],
              [(.014*bulk,.013*bulk),(.016*bulk,.014*bulk),(.019*bulk,.015*bulk)],
              region,weight,segments=12)
    # Four fingers: distinct spaces, proximal joint, two phalangeal bends and tip.
    for index,(y,length,radius) in enumerate([
            (.017,.053,.0062),(.003,.060,.0064),
            (-.011,.055,.0059),(-.024,.043,.0052)]):
        start=.046 if index<3 else .040
        pts=[point(start,y,0),point(start+length*.30,y+.001,-.0003),
             point(start+length*.66,y-.0005,-.002),
             point(start+length*.90,y-.0015,-.004),
             point(start+length,y-.002,-.0045)]
        radii=[radius*bulk,radius*1.02*bulk,radius*.91*bulk,
               radius*.79*bulk,radius*.24*bulk]
        mesh.tube(pts,radii,region,weight,segments=9)
        for frac in [.28,.64]:
            mesh.ellipsoid(point(start+length*frac,y-.001,.002),
                           [.0065,.0058*bulk,.0037*bulk],region,weight,segments=10,rings=5)
        if not glove:
            # Small flattened nail plates with rounded edges on the visible back.
            mesh.ellipsoid(point(start+length*.83,y-.001,.0027),
                           [.007,.0036,.0014],
                           'preserve_nail',weight,segments=10,rings=5,color='#B38B73')
        else:
            # Raised protective segment and narrow seam at each knuckle.
            mesh.tube([point(start+length*.22,y-radius*.7,.006*bulk),
                       point(start+length*.25,y,.008*bulk),
                       point(start+length*.22,y+radius*.7,.006*bulk)],
                      [.0013]*3,'accent',weight,segments=6)
    # Thumb is opposable, angled away from the index, with an independent silhouette.
    thumb=[point(.010,.018,-.001),point(.021,.032,-.001),
           point(.038,.039,-.004),point(.052,.041,-.005),point(.057,.040,-.006)]
    mesh.tube(thumb,[.010*bulk,.009*bulk,.0077*bulk,.0062*bulk,.0025*bulk],
              region,weight,segments=10)
    if glove:
        # Wrist strap, articulated backhand plate and a stitched edge; no logos.
        mesh.tube([point(-.006,-.017,.008),point(-.008,0,.016*bulk),point(-.006,.017,.008)],
                  [.0035]*3,'accent',weight,segments=8)
        mesh.ellipsoid(point(.022,0,.010),[.024,.016,.0035],
                       'gloves',weight,segments=12,rings=6)
    else:
        # Subtle tendons and a thenar mound stay within the skin palette.
        for y in [-.010,.003,.015]:
            mesh.tube([point(.008,y,.010),point(.026,y,.012),point(.043,y,.009)],
                      [.0008,.0011,.0007],'skin',weight,segments=6)


def add_head_hands(mesh,model,rig):
    """Add one invented face, volumetric groom and two five-finger hands."""
    first_head_vertex=len(mesh.positions)
    _face(mesh,model)
    _hair(mesh,model)
    # Compact adult proportions in the unchanged 20-joint bind space. The scalp
    # is short and rounded; the shared Head pivot remains inside the lower skull.
    # Keep the wrist/finger scale untouched by applying this before the hands.
    for vertex in mesh.positions[first_head_vertex:]:
        vertex[0] *= .95
        vertex[1] = 1.09+(vertex[1]-1.075)*.758
        vertex[2] *= .95
    for sign in [-1,1]:
        _hand(mesh,model,sign,rig)
