"""Authored short hair groom on the synthetic anatomical head surface.

The opaque undercoat uses the actual head topology, clipped to a curved hairline.
Small alpha cards follow scalp raycasts and lift into short combed clumps. No scan,
portrait, branded haircut or external hair program is used.
"""
import math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def groomed_crop(person, dv, bodyfaces, eye_center, make_mesh, rectuv):
    style=person['hair']
    center=np.array([0.,eye_center[1]+.050,.012])
    bvh=BVHTree.FromPolygons([Vector(p) for p in dv],bodyfaces,all_triangles=False)
    rng=np.random.default_rng(3607+sum(ord(c) for c in person['id']))
    phase=(sum((i+1)*ord(c) for i,c in enumerate(person['id']))%127)*.071
    crown_y=float(np.max(dv[np.unique(np.concatenate(bodyfaces)),1]))

    def cap_offset(p):
        top=float(np.clip((p[1]-eye_center[1]-.045)/.085,0,1))
        base,volume={'crop':(.0022,.0014),'sweep':(.0027,.0035),'quiff':(.0030,.0065),'buzz':(.0007,.0005),'waves':(.0027,.0027),'short':(.0014,.0012),'coils':(.0048,.0065)}.get(style,(.0022,.0014))
        extra=0.
        if style=='quiff':extra=.006*top*max(0,min(1,(p[2]-center[2])/.085))
        elif style=='sweep':extra=.003*top*(.5+.5*math.tanh(-p[0]/.035))
        elif style=='waves':extra=.0010*top*math.sin(math.atan2(p[0],p[2]-center[2])*4+.7)
        # Coherent lock volume belongs to the filled undercoat as well as the
        # fine cards. Isolated high tips above an unchanged sphere read as a
        # wire halo; smooth centimetre-scale locks break the actual hair mass.
        x=float(p[0]);z=float(p[2]-center[2])
        field=.46*math.sin(x*160+phase*.3)+.34*math.sin(z*190-phase*.7)+.20*math.sin((x-z)*260+.5)
        tuft=(.5+.5*field)**1.7
        amplitude=.0004 if style=='buzz' else .0035 if style=='coils' else .0027
        extra+=top**.75*(.0004+amplitude*tuft)
        return base+volume*top+extra

    def hairline(p):
        az=math.atan2(p[0],p[2]-center[2]);a=abs(az)
        # A mature rounded hairline recedes at both front corners, then drops
        # toward the sideburn. The previous cosine cancellation made a ruler-
        # straight fringe across the forehead.
        if a<.65:y=eye_center[1]+.065+.013*(a/.65)**2
        elif a<1.40:
            t=(a-.65)/.75;t=t*t*(3-2*t)
            y=eye_center[1]+.078*(1-t)+.016*t
        else:
            t=(a-1.40)/(math.pi-1.40);t=t*t*(3-2*t)
            y=eye_center[1]+.016*(1-t)-.090*t
        y+=.0015*math.sin(az*5+.4)+.0007*math.sin(az*11)
        return y

    def clip_hairline(poly):
        result=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            fa=a[1]-hairline(a)-.004;fb=b[1]-hairline(b)-.004
            if fa>=0:result.append(a)
            if (fa>=0)!=(fb>=0):
                t=fa/(fa-fb);result.append(a+(b-a)*t)
        return result

    cv=[];cf=[];cu=[]
    for face in bodyfaces:
        q=[dv[i].copy() for i in face]
        if max(p[1] for p in q)<eye_center[1]-.11:continue
        poly=clip_hairline(q)
        if len(poly)<3:continue
        first=len(cv);uv=[]
        for p in poly:
            radial=(p-center)/np.array([.083,.12,.090])**2
            radial/=max(np.linalg.norm(radial),1e-8)
            top=np.clip((p[1]-eye_center[1]-.045)/.085,0,1)
            cv.append(p+radial*cap_offset(p))
            az=math.atan2(p[0],p[2]-center[2])
            # The bottom of the tile is a tapered root-coverage band. It must
            # track the curved anatomical edge rather than a global Y value.
            distance=max(0.,float(p[1]-hairline(p)-.004))
            # Keep the first six millimetres on the feathered root band. Above
            # it, distribute the remaining UV range over the whole local crown
            # height instead of clamping every high scalp vertex to one row.
            extent=max(.018,crown_y-hairline(p)-.004)
            v=distance/.030 if distance<.006 else .20+.80*(distance-.006)/max(.012,extent-.006)
            uv.append(rectuv('hair',az/(2*math.pi)+.5,np.clip(v,0,1)))
        cf.append(list(range(first,first+len(poly))));cu.append(uv)
    weights=np.zeros((len(cv),18));weights[:,5]=1
    undercoat=make_mesh('hair-scalp-undercoat',cv,cf,cu,weights)
    undercoat['hairCenter']=center.tolist();undercoat['atlasRegion']='hair'

    def surface(theta,az):
        d=np.array([math.sin(theta)*math.sin(az),math.cos(theta),math.sin(theta)*math.cos(az)])
        point,normal,_,_=bvh.ray_cast(Vector(center+d*.42),Vector(-d),.84)
        if point is None:return None,None
        q=np.array(point);n=np.array(normal)
        if np.dot(q-center,d)<.025:return None,None
        if np.dot(n,d)<0:n=-n
        n/=max(np.linalg.norm(n),1e-8)
        return q,n

    max_lateral=float(np.max(np.abs(np.asarray(cv)[:,0])))+.0035
    if style=='coils':
        return [undercoat,*_curly_cards(person,center,hairline,cap_offset,surface,make_mesh,rectuv,rng,max_lateral)]

    vv=[];ff=[];uu=[];clumps=0
    # Overlapping small clumps cover the scalp in several staggered layers.
    # Their geometry, rather than a few broad sheets, defines the crown silhouette.
    for column in range(52):
        az=-math.pi+2*math.pi*(column+.25)/52
        for layer in range(8):
            start=.035+.315*layer+rng.uniform(-.025,.025)
            a0=az+rng.uniform(-.019,.019)
            root,_=surface(start,a0)
            if root is None or root[1]<hairline(root)+.0015:continue
            length=rng.uniform(.13,.22) if style=='buzz' else rng.uniform(.26,.38)
            cluster=.5+.5*math.sin(a0*3+phase+start*2.4)
            crown=max(0.,1-start/1.25)
            volume=rng.uniform(.0003,.0010) if style=='buzz' else rng.uniform(.0010,.0025)*(1-.35*min(start/2,1))
            tip_lift=0. if style=='buzz' else crown*(.0005+.0010*cluster)
            width=rng.uniform(.0024,.0037)
            pts=[];ns=[];steps=5
            for j in range(steps+1):
                t=j/steps
                backwards=style=='quiff' and math.cos(a0)>.2 and start>.35
                theta=max(.025,start+length*t*(-1 if backwards else 1))
                sweep=.30 if style=='sweep' else .11
                aa=a0+sweep*math.sin(t*math.pi*.5)*(1-.25*min(start,2))
                if style=='waves':aa+=.035*math.sin(start*12+t*8)
                q,n=surface(theta,aa)
                if q is None or abs(q[0])>max_lateral:break
                edge=q[1]-hairline(q)
                if edge<-.0018:
                    if pts:
                        previous=pts[-1];previous_n=ns[-1]
                        e0=previous[1]-hairline(previous)
                        blend=np.clip((e0+.0018)/max(e0-edge,1e-7),0,1)
                        pts.append(previous+(q-previous)*blend);ns.append(previous_n*(1-blend)+n*blend)
                    break
                lift=cap_offset(q)+.0004+volume*math.sin(math.pi*(.08+.86*t))**1.15+tip_lift*t**1.4
                pts.append(q+n*lift);ns.append(n)
            if len(pts)<3:continue
            tile=clumps%8;clumps+=1;first=len(vv)
            for j,(p,n) in enumerate(zip(pts,ns)):
                tangent=pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]
                lateral=np.cross(n,tangent);lateral/=max(np.linalg.norm(lateral),1e-8)
                taper=1-.28*j/(len(pts)-1)
                vv.extend([p-lateral*width*.5*taper,p+lateral*width*.5*taper])
            for j in range(len(pts)-1):
                f=[first+j*2,first+j*2+1,first+j*2+3,first+j*2+2]
                a=tile/8+.005;b=(tile+1)/8-.005
                v0=j/(len(pts)-1);v1=(j+1)/(len(pts)-1)
                uv=[rectuv('wisps',a,v0),rectuv('wisps',b,v0),rectuv('wisps',b,v1),rectuv('wisps',a,v1)]
                for tri in [(0,1,2),(0,2,3)]:
                    ids=[f[k] for k in tri];tex=[uv[k] for k in tri]
                    q=np.array([vv[k] for k in ids]);radial=q.mean(0)-center
                    if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),radial)<0:ids=list(reversed(ids));tex=list(reversed(tex))
                    ff.append(ids);uu.append(tex)
    weights=np.zeros((len(vv),18));weights[:,5]=1
    cards=make_mesh('hair-groom-clumps',vv,ff,uu,weights)
    cards['hairCenter']=center.tolist();cards['groomClumps']=clumps;cards['atlasRegion']='wisps'
    vv=[];ff=[];uu=[]
    # A dedicated short fringe bridges the opaque root line into individual
    # ends. Regular crown sampling skipped these short ribbons in the prototype.
    for i in range(218):
        az=-math.pi+2*math.pi*(i+.35)/218+rng.uniform(-.010,.010)
        if math.sin(az*5+phase)>.25 and rng.random()<.20:continue
        lo=.25;hi=2.65
        for _ in range(18):
            mid=(lo+hi)*.5;q,_=surface(mid,az)
            if q is not None and q[1]>hairline(q):lo=mid
            else:hi=mid
        boundary=(lo+hi)*.5
        first=len(vv);pts=[];ns=[];steps=5
        start=boundary-rng.uniform(.055,.100)
        finish=boundary+rng.uniform(-.003,.016)
        for j in range(steps+1):
            t=j/steps;q,n=surface(start+(finish-start)*t,az+.018*math.sin(t*math.pi))
            if q is None or abs(q[0])>max_lateral:break
            lift=cap_offset(q)*(.70+.30*(1-t))+.0007*math.sin(math.pi*(.12+.82*t))
            pts.append(q+n*lift);ns.append(n)
        if len(pts)!=steps+1:continue
        width=rng.uniform(.0017,.0031);tile=(i+3)%8;clumps+=1
        for j,(q,n) in enumerate(zip(pts,ns)):
            tangent=pts[min(j+1,steps)]-pts[max(0,j-1)]
            lateral=np.cross(n,tangent);lateral/=max(np.linalg.norm(lateral),1e-8)
            taper=1-.38*j/steps
            vv.extend([q-lateral*width*.5*taper,q+lateral*width*.5*taper])
        for j in range(steps):
            f=[first+j*2,first+j*2+1,first+j*2+3,first+j*2+2]
            a=tile/8+.005;b=(tile+1)/8-.005
            uv=[rectuv('wisps',a,j/steps),rectuv('wisps',b,j/steps),rectuv('wisps',b,(j+1)/steps),rectuv('wisps',a,(j+1)/steps)]
            for tri in [(0,1,2),(0,2,3)]:
                ids=[f[k] for k in tri];tex=[uv[k] for k in tri]
                q=np.array([vv[k] for k in ids]);radial=q.mean(0)-center
                if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),radial)<0:ids=list(reversed(ids));tex=list(reversed(tex))
                ff.append(ids);uu.append(tex)
    weights=np.zeros((len(vv),18));weights[:,5]=1
    fringe=make_mesh('hair-fine-fringe',vv,ff,uu,weights)
    fringe['hairCenter']=center.tolist();fringe['atlasRegion']='wisps'
    return [undercoat,cards,fringe]


def _curly_cards(person,center,hairline,cap_offset,surface,make_mesh,rectuv,rng,max_lateral):
    """Dense small curved curl groups, with feathered edge groups and no stock cap."""
    vertices=[];faces=[];uvs=[];count=0
    def curl(root,n,small=False,phase=0.):
        nonlocal count
        tangent=np.cross(n,[0,1,0])
        if np.linalg.norm(tangent)<.08:tangent=np.cross(n,[1,0,0])
        tangent/=max(np.linalg.norm(tangent),1e-8);across=np.cross(n,tangent)
        radius=rng.uniform(.0018,.0030) if small else rng.uniform(.0023,.0038)
        # Open partial coils form attached small clumps. Full circles at the
        # foreground edge read as detached black wire loops on a phone.
        turns=rng.uniform(.24,.42) if small else rng.uniform(.32,.55);steps=7 if small else 8
        pts=[];width=rng.uniform(.0013,.0018);first=len(vertices);tile=count%8;count+=1
        for j in range(steps+1):
            t=j/steps;angle=phase+t*math.pi*2*turns
            offset=tangent*radius*(math.cos(angle)-math.cos(phase))+across*radius*(math.sin(angle)-math.sin(phase))
            cluster=.5+.5*math.sin(root[0]*72+root[2]*51+.9)
            amplitude=.00025 if small else .0006+.0008*cluster
            lift=cap_offset(root)+.0004+amplitude*math.sin(math.pi*t)
            pts.append(root+n*lift+offset)
        for j,p in enumerate(pts):
            direction=pts[min(j+1,steps)]-pts[max(0,j-1)]
            lateral=np.cross(n,direction);lateral/=max(np.linalg.norm(lateral),1e-8)
            taper=1-.35*j/steps
            vertices.extend([p-lateral*width*.5*taper,p+lateral*width*.5*taper])
        for j in range(steps):
            f=[first+j*2,first+j*2+1,first+j*2+3,first+j*2+2]
            a=tile/8+.005;b=(tile+1)/8-.005
            uv=[rectuv('wisps',a,j/steps),rectuv('wisps',b,j/steps),rectuv('wisps',b,(j+1)/steps),rectuv('wisps',a,(j+1)/steps)]
            for tri in [(0,1,2),(0,2,3)]:
                ids=[f[k] for k in tri];tex=[uv[k] for k in tri]
                q=np.array([vertices[k] for k in ids])
                if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),q.mean(0)-center)<0:ids.reverse();tex.reverse()
                faces.append(ids);uvs.append(tex)
    golden=math.pi*(3-math.sqrt(5))
    for i in range(430):
        theta=math.acos(1-2*(i+.5)/430);az=i*golden
        q,n=surface(theta,az)
        if q is None or abs(q[0])>max_lateral or q[1]<hairline(q)+.0045:continue
        curl(q,n,phase=rng.uniform(0,math.pi*2))
        curl(q+n*.0004,n,phase=rng.uniform(0,math.pi*2))
    weights=np.zeros((len(vertices),18));weights[:,5]=1
    crown=make_mesh('hair-groom-coils',vertices,faces,uvs,weights)
    crown['hairCenter']=center.tolist();crown['atlasRegion']='wisps';crown['groomClumps']=count
    vertices=[];faces=[];uvs=[]
    for i in range(106):
        az=-math.pi+2*math.pi*(i+.4)/106
        lo=.25;hi=2.65
        for _ in range(17):
            mid=(lo+hi)*.5;q,n=surface(mid,az)
            if q is not None and q[1]>hairline(q):lo=mid
            else:hi=mid
        q,n=surface((lo+hi)*.5-.040,az)
        if q is not None and abs(q[0])<=max_lateral:curl(q,n,small=True,phase=math.pi*.5+rng.uniform(-.15,.15))
    weights=np.zeros((len(vertices),18));weights[:,5]=1
    obj=make_mesh('hair-fine-coil-edge',vertices,faces,uvs,weights)
    obj['hairCenter']=center.tolist();obj['atlasRegion']='wisps';obj['groomClumps']=count-int(crown['groomClumps'])
    return [crown,obj]
