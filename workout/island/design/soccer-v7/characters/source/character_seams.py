"""Small sewn construction details fitted to the synthetic sports jersey."""
import math
import os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def tailored_hem(vertices, faces, face_uvs, skin, rectuv, shorts=None):
    """Replace the source garment's open side slits with a sewn lower panel.

    The original anatomical garment remains above the join. Its actual closed
    cross-section is lofted into a smooth bottom loop, instead of flattening a
    slit boundary into overlapping triangular tabs or concealing it behind a
    second surface.
    """
    vertices=np.asarray(vertices);skin=np.asarray(skin)
    edge_uses={}
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):
            edge=tuple(sorted((a,b)));edge_uses[edge]=edge_uses.get(edge,0)+1
    bottom={i for edge,n in edge_uses.items() if n==1 for i in edge if vertices[i,1]<1.0}
    if not bottom:raise RuntimeError('Garment has no bottom boundary')
    hem_y=float(np.median(vertices[list(bottom),1]))
    join_y=max(1.025,hem_y+.080)
    vv=[];ff=[];uu=[];ww=[];lookup={};cut=set()

    def vertex(q,w):
        key=tuple(np.round(q,7))
        if key not in lookup:
            lookup[key]=len(vv);vv.append(np.array(q));ww.append(np.array(w))
        return lookup[key]

    for face,tex in zip(faces,face_uvs):
        poly=[(vertices[i],np.asarray(t),skin[i]) for i,t in zip(face,tex)]
        clipped=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            da=a[0][1]-join_y;db=b[0][1]-join_y
            if da>=-1e-9:clipped.append(a)
            if (da>=0)!=(db>=0):
                t=da/(da-db);clipped.append(tuple(x+(y-x)*t for x,y in zip(a,b)))
        if len(clipped)<3:continue
        f=[];uv=[]
        for q,t,w in clipped:
            index=vertex(q,w);f.append(index);uv.append(t)
            if abs(q[1]-join_y)<1e-7:cut.add(index)
        ff.append(f);uu.append(uv)
    if len(cut)<16:raise RuntimeError('Garment hem join is not a closed cross-section')
    points=np.array([vv[i] for i in cut]);center=np.mean(points[:,[0,2]],0)
    order=sorted(cut,key=lambda i:math.atan2(vv[i][0]-center[0],vv[i][2]-center[1]))
    rx=float((np.max(points[:,0])-np.min(points[:,0]))*.5)
    rz=float((np.max(points[:,2])-np.min(points[:,2]))*.5)
    shorts_bvh=None
    if shorts is not None:
        shorts_bvh=BVHTree.FromPolygons([Vector(v.co[:]) for v in shorts.data.vertices],[list(p.vertices) for p in shorts.data.polygons],all_triangles=False)
    def outside_shorts(direction, fallback, y):
        distances=[]
        if shorts_bvh:
            for sample_y in (float(np.clip(y,.850,.895)),.865,.885,.895):
                origin=np.array([center[0],sample_y,center[1]])+direction*.45
                hit,_,_,_=shorts_bvh.ray_cast(Vector(origin),Vector(-direction),.9)
                if hit is not None:
                    radius=float(np.dot(np.array(hit)-[center[0],sample_y,center[1]],direction))
                    if radius>.04:distances.append(radius+.0075)
        return max(distances) if distances else fallback*1.16
    rows=[order]
    for row,t in enumerate((.24,.50,.76,1.0)):
        ring=[];blend=t*t*(3-2*t)
        for index in order:
            original=np.array(vv[index]);delta=original[[0,2]]-center
            a=math.atan2(delta[0],delta[1]);direction=np.array([math.sin(a),0,math.cos(a)])
            radius=outside_shorts(direction,float(np.linalg.norm(delta)),hem_y)
            smooth=center+direction[[0,2]]*radius
            xz=original[[0,2]]*(1-blend)+smooth*blend
            # Small cloth ease remains; no deep negative radial pleat reaches
            # the silhouette or opens the panel over the dark shorts.
            ease=.00065*math.sin(a*9+.8)*math.sin(math.pi*t)
            xz+=np.array([math.sin(a),math.cos(a)])*ease
            y=join_y+(hem_y-join_y)*t+.00055*t*math.sin(a*3+.5)
            if y<.912:
                clearance=outside_shorts(direction,radius,y)
                current=float(np.dot(xz-center,direction[[0,2]]))
                if current<clearance:xz=center+direction[[0,2]]*clearance
            q=np.array([xz[0],y,xz[1]])
            wt=float(np.clip((y-.88)/.16,0,1));w=np.zeros(18);w[1]=1-wt;w[2]=wt
            ring.append(vertex(q,w))
        rows.append(ring)
    # The returned lower panel shares its actual top-edge positions with the
    # retained source topology, so there is no hidden intersecting sleeve.
    for row in range(len(rows)-1):
        top,bottom_ring=rows[row],rows[row+1]
        for i in range(len(order)):
            j=(i+1)%len(order);f=[top[i],top[j],bottom_ring[j],bottom_ring[i]]
            q=np.array([vv[k] for k in f]);radial=q.mean(0)*[1,0,1]
            tex=[rectuv('shirt',i/len(order),.22-row*.045),rectuv('shirt',(i+1)/len(order),.22-row*.045),rectuv('shirt',(i+1)/len(order),.175-row*.045),rectuv('shirt',i/len(order),.175-row*.045)]
            if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),radial)<0:f.reverse();tex.reverse()
            ff.append(f);uu.append(tex)
    inner=[]
    for index in rows[-1]:
        q=np.array(vv[index]);radial=np.array([q[0]-center[0],0,q[2]-center[1]]);radial/=np.linalg.norm(radial)
        q-=radial*.0014;q[1]+=.005
        inner.append(vertex(q,ww[index]))
    for i in range(len(order)):
        j=(i+1)%len(order);f=[rows[-1][i],rows[-1][j],inner[j],inner[i]]
        tex=[rectuv('shirt',i/len(order),.02),rectuv('shirt',(i+1)/len(order),.02),rectuv('shirt',(i+1)/len(order),.03),rectuv('shirt',i/len(order),.03)]
        ff.append(f);uu.append(tex)
    return np.array(vv),ff,uu,np.array(ww)


def ensure_hem_clearance(shirt,shorts,ease=.0060):
    """Preserve jersey/shorts enclosure after cloth relaxation and QEM."""
    p=np.array([v.co[:] for v in shorts.data.vertices]);waist=p[(p[:,1]>.84)&(p[:,1]<.902)]
    center=(np.min(waist[:,[0,2]],0)+np.max(waist[:,[0,2]],0))*.5
    bvh=BVHTree.FromPolygons([Vector(v) for v in p],[list(f.vertices) for f in shorts.data.polygons],all_triangles=False)
    before=[];after=[];corrected=0
    for vertex in shirt.data.vertices:
        q=np.array(vertex.co[:])
        if not .840<q[1]<.905:continue
        delta=q[[0,2]]-center;r=float(np.linalg.norm(delta))
        if r<.03:continue
        d=np.array([delta[0]/r,0,delta[1]/r]);origin=np.array([center[0],q[1],center[1]])+d*.45
        hit,_,_,_=bvh.ray_cast(Vector(origin),Vector(-d),.9)
        if hit is None:continue
        surface=float(np.dot(np.array(hit)-[center[0],q[1],center[1]],d))
        clearance=r-surface;before.append(clearance)
        if clearance<ease:
            target=np.array([center[0],q[1],center[1]])+d*(surface+ease)
            vertex.co=target.tolist();corrected+=1;clearance=ease
        after.append(clearance)
    shirt.data.update()
    if not after:raise RuntimeError('No actual jersey/shorts waist overlap samples')
    if min(after)<ease-1e-7:raise RuntimeError('Jersey hem remains inside shorts')
    return {'hemEnclosureSamples':len(after),'hemCorrectedVertices':corrected,'hemMinimumRadialClearanceMeters':float(min(after)),'hemMinimumBeforeCorrectionMeters':float(min(before))}


def jersey_seams(person, shirt, make_mesh, rectuv):
    fitted_seams=os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18'
    mesh=shirt.data
    points=np.array([v.co[:] for v in mesh.vertices])
    normals=np.array([v.normal[:] for v in mesh.vertices])
    mesh.calc_loop_triangles()
    polygons=[list(t.vertices) for t in mesh.loop_triangles]
    bvh=BVHTree.FromPolygons([Vector(p) for p in points],polygons,all_triangles=True)
    skin=np.zeros((len(points),18))
    for vertex in mesh.vertices:
        for group in vertex.groups:
            if group.group<18:skin[vertex.index,group.group]=group.weight
    vv=[];ff=[];uu=[];ww=[]

    def append_quad(q, weights, uv, reference=None):
        first=len(vv);n=np.cross(q[1]-q[0],q[2]-q[0])
        radial=np.mean(q,0)*np.array([1,0,1]) if reference is None else reference
        order=[0,1,2,3] if np.dot(n,radial)>=0 else [3,2,1,0]
        vv.extend(q);ww.extend(weights);ff.append([first+i for i in order]);uu.append([uv[i] for i in order])

    def surface(x,y):
        hit,normal,index,_=bvh.ray_cast(Vector([x,y,.45]),Vector([0,0,-1]),.9)
        if hit is None:return None
        q=np.array(hit);n=np.array(normal)
        if n[2]<=0:
            if fitted_seams:return None
            n=-n
        ids=polygons[index]
        a,b,c=points[ids];u=b-a;v=c-a;delta=q-a
        d00=np.dot(u,u);d01=np.dot(u,v);d11=np.dot(v,v)
        d20=np.dot(delta,u);d21=np.dot(delta,v);denom=max(d00*d11-d01*d01,1e-14)
        beta=(d11*d20-d01*d21)/denom;gamma=(d00*d21-d01*d20)/denom
        factors=np.clip(np.array([1-beta-gamma,beta,gamma]),0,1);factors/=factors.sum()
        weights=factors@skin[ids];weights/=weights.sum()
        return q+n*(.0006 if fitted_seams else .0014),n,weights

    # The two subtle raglan seams are actual three-millimetre ribbons on the
    # garment surface, with the same synthetic jersey color and raised stitching.
    for side in [-1,1]:
        path=[]
        control=np.array([[.052,1.403],[.092,1.371],[.144,1.286],[.190,1.205]])
        for i in range(33):
            t=i/32
            p=(1-t)**3*control[0]+3*(1-t)**2*t*control[1]+3*(1-t)*t*t*control[2]+t**3*control[3]
            sample=surface(side*p[0],p[1])
            if sample is not None:path.append((t,*sample))
        for i in range(len(path)-1):
            ta,a,na,wa=path[i];tb,b,nb,wb=path[i+1]
            if tb-ta>.04:continue
            tangent=b-a
            if fitted_seams and (abs(tangent[2])>.007 or np.linalg.norm(tangent)>max(.003,2*np.linalg.norm(tangent[:2]))):continue
            la=np.cross(na,tangent);la/=max(np.linalg.norm(la),1e-8)
            lb=np.cross(nb,tangent);lb/=max(np.linalg.norm(lb),1e-8)
            q=[a-la*.0015,b-lb*.0015,b+lb*.0015,a+la*.0015]
            if fitted_seams:
                projected=[surface(p[0],p[1]) for p in q]
                if any(p is None for p in projected):continue
                if any(abs(p[0][2]-old[2])>.007 for p,old in zip(projected,q)):continue
                q=[p[0] for p in projected]
                seam_weights=[p[2] for p in projected]
            else:seam_weights=[wa,wb,wb,wa]
            append_quad(q,seam_weights,[rectuv('stitch',ta,0),rectuv('stitch',tb,0),rectuv('stitch',tb,1),rectuv('stitch',ta,1)],na+nb)

    # Preserve the sewn collar/cuff/hem line as separate topology. The main
    # cloth simplifier can then relax the panels without deleting tiny stitches.
    flat=shirt.get('garmentBoundaryEdges',[])
    for i in range(0,len(flat),2):
        ia=int(flat[i]);ib=int(flat[i+1]);a=points[ia];b=points[ib];mid=(a+b)*.5
        collar=mid[1]>1.34 and abs(mid[0])<.12
        hem=mid[1]<1.05
        cuff=abs(mid[0])>.16 and 1.05<mid[1]<1.25
        if not (collar or hem or cuff):continue
        inside=np.array([0,-.0018 if collar else .003,0])
        width=np.array([0,-.0026 if collar else .0026,0])
        qa=a+normals[ia]*.00075+inside;qb=b+normals[ib]*.00075+inside
        length=np.linalg.norm(b-a)
        ua=0.;ub=min(1,length/.04)
        append_quad([qa,qb,qb+width,qa+width],[skin[ia],skin[ib],skin[ib],skin[ia]],
                    [rectuv('stitch',ua,0),rectuv('stitch',ub,0),rectuv('stitch',ub,1),rectuv('stitch',ua,1)],normals[ia]+normals[ib])
    if not vv:return None
    obj=make_mesh('jersey-protected-seams',vv,ff,uu,np.asarray(ww))
    obj['surface']='Cloth';obj['atlasRegion']='stitch';obj['physicalSeamWidthMeters']=.003
    return obj


def jersey_hem_backing(person,shirt,make_mesh,rectuv):
    """Close the source casual-shirt side slit with a small hidden sewn facing."""
    mesh=shirt.data;points=np.array([v.co[:] for v in mesh.vertices])
    flat=shirt.get('garmentBoundaryEdges',[])
    ids={int(i) for i in flat if points[int(i),1]<1.02}
    if len(ids)<12:return None
    edge=points[sorted(ids)];center=edge[:,[0,2]].mean(0)
    base_y=float(np.median(edge[:,1]))
    angles=np.arctan2(edge[:,0]-center[0],edge[:,2]-center[1])
    radii=np.linalg.norm(edge[:,[0,2]]-center,axis=1)
    mesh.calc_loop_triangles();polys=[list(t.vertices) for t in mesh.loop_triangles]
    bvh=BVHTree.FromPolygons([Vector(p) for p in points],polys,all_triangles=True)
    vertices=[];faces=[];uv=[];weights=[];segments=64
    for row,dy in enumerate((-.002,.025,.060)):
        y=base_y+dy
        for i in range(segments):
            a=2*math.pi*i/segments;d=np.array([math.sin(a),0,math.cos(a)])
            distance=np.abs(np.angle(np.exp(1j*(angles-a))))
            near=np.argsort(distance)[:4];factor=1/np.maximum(distance[near],.01)**2;factor/=factor.sum()
            radius=float(factor@radii[near])
            origin=np.array([center[0],y,center[1]])+d*.45
            hit,_,_,_=bvh.ray_cast(Vector(origin),Vector(-d),.9)
            if hit is not None:
                measured=float(np.dot(np.array(hit)-[center[0],y,center[1]],d))
                if measured>.08:radius=measured
            q=np.array([center[0],y,center[1]])+d*max(.03,radius-.0014)
            vertices.append(q)
            t=float(np.clip((y-.88)/.16,0,1));w=np.zeros(18);w[1]=1-t;w[2]=t;weights.append(w)
    for row in range(2):
        for i in range(segments):
            j=(i+1)%segments
            f=[row*segments+i,row*segments+j,(row+1)*segments+j,(row+1)*segments+i]
            q=np.array([vertices[k] for k in f]);radial=q.mean(0)*[1,0,1]
            tex=[rectuv('shirt',i/segments,.02+row*.12),rectuv('shirt',(i+1)/segments,.02+row*.12),rectuv('shirt',(i+1)/segments,.14+row*.12),rectuv('shirt',i/segments,.14+row*.12)]
            if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),radial)<0:f.reverse();tex.reverse()
            faces.append(f);uv.append(tex)
    obj=make_mesh('jersey-hem-backing',vertices,faces,uv,np.array(weights),atlas_region='shirt',atlas_class='hem-backing')
    obj['surface']='Cloth';obj['sewnFacingHeightMeters']=.062
    return obj
