"""Far-only coherent scalp: weld the control islands, retain opaque tile interior."""
import math
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _snapshot(mesh):
    mesh.calc_loop_triangles()
    return ([v.co.copy() for v in mesh.vertices],[list(t.vertices) for t in mesh.loop_triangles])


def _components(mesh):
    adjacency={}
    for f in mesh.polygons:
        ids=list(f.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
    unseen=set(adjacency);counts=[]
    while unseen:
        stack=[unseen.pop()];n=0
        while stack:
            a=stack.pop();n+=1
            for b in adjacency[a]:
                if b in unseen:unseen.remove(b);stack.append(b)
        counts.append(n)
    return sorted(counts,reverse=True)


def prepare_far_cap(obj):
    before=len(obj.data.vertices);islands=_components(obj.data);source=_snapshot(obj.data)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    obj['coherentFarCap']=True
    return {'source':source,'verticesBeforeWeld':before,'verticesAfterWeld':len(obj.data.vertices),'islandsBeforeWeld':len(islands),'islandsAfterWeld':len(_components(obj.data)),'center':list(obj['hairCenter'])}


def finish_far_cap(obj,reference,rect):
    # The lower22% contains feathered near-view roots. Far mipmaps need a
    # solid scalp; the geometric hairline remains the original curved edge.
    a,b,c,d=rect
    for uv in obj.data.uv_layers.active.data:
        t=float(np.clip((uv.uv.y-b)/(d-b),0,1))
        uv.uv.y=b+(d-b)*(.28+.72*t)
    for p in obj.data.polygons:p.use_smooth=True
    obj.data.update()
    original=BVHTree.FromPolygons(*reference['source'],all_triangles=True)
    current=BVHTree.FromPolygons(*_snapshot(obj.data),all_triangles=True)
    center=np.asarray(reference['center']);samples=0;missed=[];errors=[]
    for theta in np.linspace(.06,1.12,9):
        for az in np.linspace(-math.pi,math.pi,25)[:-1]:
            direction=np.array([math.sin(theta)*math.sin(az),math.cos(theta),math.sin(theta)*math.cos(az)])
            start=center+direction*.45
            old,_,_,_=original.ray_cast(Vector(start),Vector(-direction),.9)
            if old is None:continue
            # Exclude only source boundary grazing samples, not crown patches.
            if old[1]<center[1]+.006:continue
            samples+=1
            new,_,_,_=current.ray_cast(Vector(start),Vector(-direction),.9)
            if new is None:missed.append([float(theta),float(az)])
            else:errors.append(float(np.linalg.norm(np.asarray(new)-np.asarray(old))))
    if samples<80:raise RuntimeError('Insufficient actual crown coverage probes')
    if missed:raise RuntimeError('Far cap lost actual source crown coverage: '+str(missed[:4]))
    if max(errors,default=0)>.008:raise RuntimeError('Far cap exceeds8mm geometric approximation bound')
    return {k:v for k,v in reference.items() if k not in ('source','center')}|{'trianglesAfterQEM':sum(len(p.vertices)-2 for p in obj.data.polygons),'islandsAfterQEM':len(_components(obj.data)),'crownRays':samples,'missedCrownRays':len(missed),'maximumCrownApproximationErrorMeters':max(errors,default=0),'farAtlasVIntervalNormalized':[.28,1.0],'sameHairCardsMaterial':True}
