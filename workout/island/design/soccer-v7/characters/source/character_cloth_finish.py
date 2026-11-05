"""One bounded jersey finish: restore collar smoothing and two upper folds.

Call after fitted_shirt, before enhance_jersey and protected seam generation.
Only vertex positions change. Topology, UVs, materials and canonical weights
remain intact; no atlas, material, bone or triangle is added.

The full anatomical reference is diagnostic, because hidden skin is intentionally
cut away or inset in the delivered asset. Clearance repair uses the OUTERMOST
delivered Skin hit on a local outward ray. This avoids selecting an inset
underlay behind the visible neck, and never inflates cloth merely to clear
hidden reference anatomy. Visible Skin arrays must be supplied explicitly.

Collar smoothing is two original .68/.32 loop steps, capped at .8 mm. The
delivered-Skin rest target is 2.25 mm, leaving room for neck flexion. Any
additional delivered-Skin repair is bounded to 7.5 mm and recorded separately.
Two short asymmetric shoulder ridges lie above the existing y=1.31 fold cutoff;
their 2.3/2.6 mm peaks move along the original cloth normal only. The hem and
cuffs are untouched. This helper performs no filesystem writes.
"""
import heapq
import math
import numpy as np


def _unit(v):
    size=float(np.linalg.norm(v))
    if size<1e-12:raise ValueError('Cloth finish received a degenerate normal')
    return np.asarray(v,dtype=float)/size


def _smoothstep(a,b,x):
    t=float(np.clip((x-a)/(b-a),0,1))
    return t*t*(3-2*t)


def finish_jersey(shirt,skin_vertices,skin_faces,*,visible_skin_vertices=None,visible_skin_faces=None):
    """Finish one untouched shirt; return reference AND delivered-Skin metrics."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    if shirt.get('clothFinishing31Applied',False):
        raise ValueError('Cloth finishing is a single authoring pass')
    if visible_skin_vertices is None or visible_skin_faces is None:
        raise ValueError('Delivered Skin is required; hidden anatomy alone cannot justify collar inflation')
    mesh=shirt.data;mesh.update()
    original=np.array([v.co[:] for v in mesh.vertices],dtype=float)
    normals=np.array([v.normal[:] for v in mesh.vertices],dtype=float)
    points=original.copy();faces=[list(p.vertices) for p in mesh.polygons]
    uv_before=np.array([v.uv[:] for v in mesh.uv_layers.active.data])
    weights_before=[[(g.group,float(g.weight)) for g in v.groups] for v in mesh.vertices]
    flat=shirt.get('garmentBoundaryEdges',[])
    edges=[tuple(map(int,flat[i:i+2])) for i in range(0,len(flat),2)]
    boundary={i for edge in edges for i in edge}
    collar={i for i in boundary if original[i,1]>1.34 and abs(original[i,0])<.12}
    if len(collar)<24:raise ValueError('Cloth finish could not identify the actual collar boundary')
    adjacency=[set() for _ in points]
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):adjacency[a].add(b);adjacency[b].add(a)
    loop={i:set() for i in collar}
    for a,b in edges:
        if a in collar and b in collar:loop[a].add(b);loop[b].add(a)
    if any(len(v)!=2 for v in loop.values()):raise ValueError('Cloth finish collar is not a closed loop')
    full=BVHTree.FromPolygons([Vector(v) for v in skin_vertices],skin_faces,all_triangles=False)
    visible=BVHTree.FromPolygons([Vector(v) for v in visible_skin_vertices],visible_skin_faces,all_triangles=False)

    def reference(point):
        hit,n,index,d=full.find_nearest(Vector(point))
        if hit is None:raise ValueError('Missing local anatomical reference')
        n=_unit(np.array(n));return float(np.dot(point-np.array(hit),n)),n

    def delivered(point):
        _,axis=reference(point)
        hit,n,index,d=visible.ray_cast(Vector(point+axis*.030),Vector(-axis),.060)
        if hit is None:return None
        n=_unit(np.array(n))
        if np.dot(n,axis)<.20:return None
        # First hit from outside is the delivered exterior, rather than the
        # nearest inset underlay. Plane distance uses its actual face normal.
        return float(np.dot(point-np.array(hit),n)),n,float(d)

    def minimum_reference(ids,values):
        return float(min(reference(values[i])[0] for i in ids))

    def minimum_delivered(ids,values):
        values=[delivered(values[i]) for i in ids];values=[v[0] for v in values if v is not None]
        return float(min(values)) if values else None

    def guarded(point):
        start=point.copy();q=point.copy()
        for _ in range(8):
            sample=delivered(q)
            if sample is None:
                raise ValueError('Missing delivered Skin exterior at a collar vertex; reference-only inflation is forbidden')
            distance,n,_=sample
            if distance>=.00225-1e-7:return q,float(np.linalg.norm(q-start))
            q+=n*(.00225-distance+.000001)
            if np.linalg.norm(q-start)>.0075:
                raise ValueError('Delivered-Skin collar repair exceeds the bounded 7.5 mm prototype')
        raise ValueError('Delivered-Skin collar guard did not converge')

    before_reference=minimum_reference(collar,original)
    before_visible=minimum_delivered(collar,original)
    for _ in range(2):
        updates={i:.68*points[i]+.32*points[list(loop[i])].mean(0) for i in collar}
        for i,q in updates.items():
            delta=q-original[i];length=float(np.linalg.norm(delta))
            points[i]=original[i]+delta*min(1.,.0008/max(length,1e-12))
    smooth_displacement=points-original
    collar_repairs=[]
    for i in collar:
        points[i],repair=guarded(points[i]);collar_repairs.append(repair)
    # Blend the repaired edge into two connected surface rings; no detached
    # replacement ring and no new topology can conceal the original join.
    first={j for i in collar for j in adjacency[i]}-boundary
    second={j for i in first for j in adjacency[i]}-boundary-first
    collar_delta=points-original
    for ids,factor,seeds in ((first,.45,collar),(second,.16,first)):
        for i in ids:
            sources=adjacency[i]&seeds
            if sources:points[i]+=np.mean(collar_delta[list(sources)],0)*factor
        collar_delta=points-original
    collar_region=collar|first|second
    transition_repairs=[]
    for i in first|second:
        # Do not repair a previously hidden torso surface just because it is
        # near an inset underlay. Preserve existing clearance unless this pass
        # moved the surface closer than its own delivered-Skin baseline.
        old=delivered(original[i]);new=delivered(points[i])
        if old is not None and new is not None and new[0]<min(.0015,old[0])-1e-7:
            n=new[1];correction=min(.0015,old[0])-new[0]+.000001
            if correction>.0075:raise ValueError('Cloth transition repair exceeds local bound')
            points[i]+=n*correction;transition_repairs.append(correction)
    # One short upper tension ridge on each side. No periodic waves, negative
    # troughs, waist edit or extra deformation at collar/cuff boundary vertices.
    fold=np.zeros_like(points)
    for i,point in enumerate(original):
        x,y,z=point
        if i in collar_region or i in boundary or not 1.312<y<1.375 or z<.020:continue
        side=1 if x>=0 else -1
        center=.112 if side>0 else .116
        line_y=1.339-.46*(abs(x)-center)+(0 if side>0 else .002)
        across=(y-line_y)/(.0080 if side>0 else .0085)
        along=(abs(x)-center)/.042
        amount=(.0026 if side>0 else .0023)*math.exp(-across*across-along**4)
        amount*=_smoothstep(1.312,1.321,y)*(1-_smoothstep(1.362,1.375,y))*_smoothstep(.020,.055,z)
        if amount<.00001:continue
        fold[i]=_unit(normals[i])*amount
        points[i]+=fold[i]
    moved=np.linalg.norm(points-original,axis=1)>.000001
    if not np.any(moved):raise ValueError('Cloth finish produced no bounded surface changes')
    folds=np.linalg.norm(fold,axis=1)>.00001
    dots=np.sum(fold*normals,axis=1)
    if np.any(dots< -1e-10):raise ValueError('Upper tension fold points into the original cloth')
    if np.any(np.linalg.norm(points[list(boundary-collar)]-original[list(boundary-collar)],axis=1)>1e-10):
        raise ValueError('Cloth finish changed a cuff or hem boundary')
    after_visible=minimum_delivered(collar,points)
    if after_visible is None or after_visible<.00225-.000002:
        raise ValueError('Cloth finish did not preserve the delivered-Skin rest target')
    triangle_cosines=[]
    for face in faces:
        if not np.any(moved[face]):continue
        for j in range(1,len(face)-1):
            ids=[face[0],face[j],face[j+1]];before=original[ids];after=points[ids]
            old_n=np.cross(before[1]-before[0],before[2]-before[0]);new_n=np.cross(after[1]-after[0],after[2]-after[0])
            a=float(np.linalg.norm(old_n));b=float(np.linalg.norm(new_n))
            if a<1e-12:continue
            if b<1e-12:raise ValueError('Cloth finish collapsed an existing surface triangle')
            cosine=float(np.dot(old_n,new_n)/(a*b))
            if cosine<=0:raise ValueError('Cloth finish inverted an existing surface triangle')
            triangle_cosines.append(cosine)
    # All guards complete before the first write to the Blender mesh.
    for vertex,point in zip(mesh.vertices,points):vertex.co=point.tolist()
    mesh.update()
    if len(mesh.vertices)!=len(original) or [list(p.vertices) for p in mesh.polygons]!=faces:
        raise ValueError('Cloth finish changed topology')
    if not np.array_equal(uv_before,np.array([v.uv[:] for v in mesh.uv_layers.active.data])):
        raise ValueError('Cloth finish changed UVs')
    if weights_before!=[[(g.group,float(g.weight)) for g in v.groups] for v in mesh.vertices]:
        raise ValueError('Cloth finish changed canonical weights')
    metrics={
        'kind':'bounded-collar-and-two-upper-tension-folds31',
        'vertices':len(points),'triangles':sum(len(f)-2 for f in faces),
        'topologyUnchanged':True,'uvUnchanged':True,'weightsUnchanged':True,'materialsUnchanged':True,
        'collarVertices':len(collar),'collarTransitionVertices':len(first|second),
        'collarSmoothingMaximumMeters':float(np.max(np.linalg.norm(smooth_displacement,axis=1))),
        'collarVisibleSkinRepairMaximumMeters':float(max(collar_repairs,default=0.)),
        'collarDeliveredSkinRestTargetMeters':.00225,
        'collarTransitionRepairMaximumMeters':float(max(transition_repairs,default=0.)),
        'collarFullReferenceMinimumBeforeMeters':before_reference,
        'collarFullReferenceMinimumAfterMeters':minimum_reference(collar,points),
        'collarDeliveredSkinMinimumBeforeMeters':before_visible,
        'collarDeliveredSkinMinimumAfterMeters':after_visible,
        'collarDeliveredSkinSamples':len(collar),
        'modifiedTriangleMinimumOriginalNormalCosine':float(min(triangle_cosines,default=1.)),
        'clearanceMethod':'outermost delivered Skin hit on local reference-normal ray; full reference diagnostic only',
        'deliveredSkinIncludes':{'vertices':len(visible_skin_vertices),'faces':len(visible_skin_faces)},
        'folds':2,'foldAffectedVertices':int(np.sum(folds)),
        'foldMaximumOffsetMeters':float(np.max(np.linalg.norm(fold,axis=1))),
        'foldMinimumOriginalNormalDotMeters':float(np.min(dots[folds])) if np.any(folds) else 0.,
        'cuffHemMaximumDisplacementMeters':0.,'allMovedVertices':int(np.sum(moved)),
        'maximumTotalDisplacementMeters':float(np.max(np.linalg.norm(points-original,axis=1))),
    }
    shirt['clothFinishing31Applied']=True
    return metrics
