"""Candidate-only anatomical upper-sock fitting; boot geometry is untouched.

Upper ring points follow the actual anatomical knee/calf surface and inherit its
barycentric weights. Matching the hidden skin at the cuff prevents the old fixed
25%-thigh blend from opening a tent in deep flexion. One UV layout and existing
Cloth material are retained. No files are written by this helper.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def fit_upper_sock(vertices,weights,anatomy,anatomy_weights,body_faces,center_x,full_fit_y=.40):
    positions=np.asarray(vertices,dtype=float).copy()
    result=np.asarray(weights,dtype=float).copy()
    triangles=[]
    for face in body_faces:
        q=anatomy[face]
        # A long radial ray can begin inside the opposite calf. Isolate the
        # actual fitted leg before raycasting; a whole-body BVH cross-binds the
        # inner cuff to the other knee during deep flexion.
        if np.mean(q[:,0])*center_x<=0 or np.min(q[:,1])>.56 or np.max(q[:,1])<.32:continue
        for j in range(1,len(face)-1):triangles.append([face[0],face[j],face[j+1]])
    triangles=np.asarray(triangles,dtype=int)
    bvh=BVHTree.FromPolygons([Vector(p) for p in anatomy],triangles.tolist(),all_triangles=True)
    samples=[]
    for i,p in enumerate(positions):
        if p[1]<.34:continue
        radial=p-np.array([center_x,p[1],0.]);radial/=max(np.linalg.norm(radial),1e-9)
        origin=np.array([center_x,p[1],0.])+radial*.24
        hit,normal,index,_=bvh.ray_cast(Vector(origin),Vector(-radial),.48)
        if hit is None:raise RuntimeError('Anatomical upper sock fit missed calf/knee')
        hit=np.asarray(hit);normal=np.asarray(normal)
        if np.dot(normal,radial)<0:normal=-normal
        a,b,c=anatomy[triangles[index]]
        matrix=np.stack((b-a,c-a),axis=-1)
        uv=np.linalg.lstsq(matrix,hit-a,rcond=None)[0]
        factors=np.clip([1-uv.sum(),uv[0],uv[1]],0,1);factors/=sum(factors)
        skin=factors@anatomy_weights[triangles[index]];skin/=skin.sum()
        foreign=[15,16,17] if center_x>0 else [12,13,14]
        if float(np.max(skin[foreign]))>1e-6:raise RuntimeError('Upper sock sampled the opposite leg skin')
        target=hit+normal*.0018
        blend=np.clip((p[1]-.34)/(full_fit_y-.34),0,1)
        positions[i]=p*(1-blend)+target*blend
        result[i]=result[i]*(1-blend)+skin*blend;result[i]/=result[i].sum()
        samples.append({'y':float(p[1]),'outwardClearanceMeters':.0018,'skinWeightDifference':float(np.max(np.abs(result[i]-skin)))})
    if not samples:raise RuntimeError('No upper sock fit samples')
    return positions,result,{'samples':len(samples),'fitBeginsY':.34,'fullFitY':full_fit_y,'anatomicalClearanceMeters':.0018,'topRingMaximumSkinWeightDifference':max(s['skinWeightDifference'] for s in samples if s['y']>full_fit_y-.005)}
