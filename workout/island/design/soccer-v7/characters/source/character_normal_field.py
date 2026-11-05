"""Project fine hair-card normals onto a filled, smoothly displaced undercoat.

The field is authoring-only. It changes no positions, UVs, weights or topology,
and introduces no runtime shader, material, texture or draw call.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class HairNormalField:
    def __init__(self, obj):
        mesh=obj.data;mesh.calc_loop_triangles()
        self.points=np.array([v.co[:] for v in mesh.vertices],dtype=float)
        self.center=np.array(obj.get('hairCenter',[0,1.65,.012]),dtype=float)
        sums={}
        for face in mesh.polygons:
            area_normal=np.array(face.normal[:])*face.area
            for index in face.vertices:
                key=tuple(round(float(x),6) for x in mesh.vertices[index].co)
                sums[key]=sums.get(key,np.zeros(3))+area_normal
        normals=[]
        for point in self.points:
            key=tuple(round(float(x),6) for x in point)
            n=sums.get(key,point-self.center)
            if np.linalg.norm(n)<1e-8:n=point-self.center
            normals.append(n/max(float(np.linalg.norm(n)),1e-8))
        self.normals=np.array(normals)
        self.triangles=[list(t.vertices) for t in mesh.loop_triangles]
        self.bvh=BVHTree.FromPolygons([Vector(p) for p in self.points],self.triangles,all_triangles=True)

    def sample(self, point):
        hit,_,index,_=self.bvh.find_nearest(Vector(point))
        if hit is None:
            n=(np.asarray(point)-self.center)/np.array([.100,.125,.108])**2
            return (n/max(float(np.linalg.norm(n)),1e-8)).tolist()
        ids=self.triangles[index];a,b,c=self.points[ids]
        u=b-a;v=c-a;d=np.asarray(hit)-a
        d00=np.dot(u,u);d01=np.dot(u,v);d11=np.dot(v,v);den=d00*d11-d01*d01
        if abs(den)<1e-16:factors=np.array([1.,0.,0.])
        else:
            beta=(d11*np.dot(d,u)-d01*np.dot(d,v))/den
            gamma=(d00*np.dot(d,v)-d01*np.dot(d,u))/den
            factors=np.clip([1-beta-gamma,beta,gamma],0,1);factors/=factors.sum()
        n=factors@self.normals[ids]
        return (n/max(float(np.linalg.norm(n)),1e-8)).tolist()
