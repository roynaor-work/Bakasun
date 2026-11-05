#!/usr/bin/env python3
"""Fit small facial features to each synthetic anatomical mesh in Blender.

The rig's helper eye centers are internal socket landmarks, not points on the
forehead. Eyebrows therefore need their own surface projection, rather than a
fixed Z offset from those socket centers. No skin topology is replaced here.
"""
import math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

class FaceSurface:
    def __init__(self, deformed_vertices, body_faces):
        self.vertices=np.asarray(deformed_vertices,dtype=float)
        self.bvh=BVHTree.FromPolygons(
            [Vector(p) for p in self.vertices],
            [list(f) for f in body_faces],
            all_triangles=False,
        )

    def front(self, x, y, eye_z=0.0):
        """Return the front skin point and normal at projected head coordinates."""
        point,normal,index,distance=self.bvh.ray_cast(
            Vector((float(x),float(y),float(eye_z)+.30)),Vector((0,0,-1)),.70)
        if point is None:return None,None
        return np.array(point,dtype=float),np.array(normal,dtype=float)

    def brow(self, center, side=None, points=8, width=.037, clearance=.0008):
        """Return (verts, quad faces, unit patch UVs) for a natural tapered brow.

        Eight longitudinal pairs give seven quads / fourteen triangles. Pass the
        unit UVs through character_atlas.rectuv('brows', u, v); bind to Head.
        Surface projection keeps all shapes visible in front of the skin after
        decimation while using only 0.8 mm of clearance.
        """
        c=np.asarray(center,dtype=float)
        sign=1 if (side=='l' or (side is None and c[0]>=0)) else -1
        vertices=[];faces=[];uvs=[]
        for i in range(points):
            t=i/(points-1)
            # Start at the inner brow and move toward the temple. The outer tail
            # is slightly lower and thinner; the middle follows the brow ridge.
            x=c[0]+sign*(t-.5)*width
            y=c[1]+.0175+.0030*math.sin(math.pi*t)-.0010*t+.00035*math.sin(t*17+.5)
            half=.0012*(1-t)+.00275*(math.sin(math.pi*t)**.60)+.0001
            for j,dy in enumerate((-half,half)):
                point,normal=self.front(x,y+dy,c[2])
                if point is None:
                    raise RuntimeError('Brow surface projection missed at '+str((x,y+dy)))
                point[2]+=clearance
                vertices.append(point)
            if i<points-1:
                faces.append([2*i,2*i+1,2*i+3,2*i+2])
                u0=t;u1=(i+1)/(points-1)
                uvs.append([(u0,0),(u0,1),(u1,1),(u1,0)])
        # Mirroring the brow changes winding. Both must face outward (+Z).
        for i,f in enumerate(faces):
            a,b,c=[np.asarray(vertices[k]) for k in f[:3]]
            if np.cross(b-a,c-a)[2]<0:
                faces[i]=list(reversed(f));uvs[i]=list(reversed(uvs[i]))
        return vertices,faces,uvs

    def lid_outline(self, center, radius=(.014,.0122,.014), samples=33):
        """Trace the actual skin opening against the proposed eye surface.

        The iris follows this opening's vertical midpoint. A sub-millimetre
        upper margin is fitted to the closed skin side of the boundary, so a
        separate floating arc cannot appear in front of the eyeball.
        """
        c=np.asarray(center);r=np.asarray(radius);upper=[];lower=[]
        def visible(x,y):
            u=((x-c[0])/r[0])**2+((y-c[1])/r[1])**2
            if u>=1:return False
            q,_=self.front(x,y,c[2])
            return q is None or c[2]+r[2]*math.sqrt(1-u)>q[2]+.0004
        for i in range(samples):
            x=c[0]+r[0]*.94*(2*i/(samples-1)-1)
            ys=np.linspace(c[1]-r[1]*.95,c[1]+r[1]*.95,65)
            open_ids=[k for k,y in enumerate(ys) if visible(x,y)]
            if not open_ids:continue
            lo,hi=open_ids[0],open_ids[-1]
            if lo==0 or hi==len(ys)-1:continue
            a,b=ys[hi],ys[hi+1]
            for _ in range(13):
                m=(a+b)*.5
                if visible(x,m):a=m
                else:b=m
            y=(a+b)*.5;q,n=self.front(x,y+.00013,c[2])
            if q is not None:upper.append((x,y,float(q[2]),n))
            a,b=ys[lo-1],ys[lo]
            for _ in range(13):
                m=(a+b)*.5
                if visible(x,m):b=m
                else:a=m
            y=(a+b)*.5;q,n=self.front(x,y-.00013,c[2])
            if q is not None:lower.append((x,y,float(q[2]),n))
        if len(upper)<8 or len(lower)<8:raise RuntimeError('Eye opening trace incomplete')
        core=lambda row:[q[1] for q in row if abs(q[0]-c[0])<.0045]
        opening_center=(float(np.mean(core(upper)))+float(np.mean(core(lower))))*.5
        return upper,lower,float(np.clip(opening_center-c[1],-.0020,.0020))

    def upper_lid_margin(self, outline):
        """Thin tapered lash-root line touching the anatomical upper eyelid."""
        vertices=[];faces=[];uvs=[]
        for i,(x,y,z,n) in enumerate(outline):
            t=i/(len(outline)-1);width=.00022+.00037*math.sin(math.pi*t)**.6
            outer,_=self.front(x,y+width,z)
            if outer is None:outer=np.array([x,y+width,z])
            vertices.extend([[x,y+.00006,z+.00022],(outer+np.array([0,0,.00022])).tolist()])
            if i:
                f=[2*i-2,2*i-1,2*i+1,2*i]
                uv=[((i-1)/(len(outline)-1),.35),((i-1)/(len(outline)-1),.65),(t,.65),(t,.35)]
                q=np.asarray([vertices[k] for k in f])
                if np.cross(q[1]-q[0],q[2]-q[0])[2]<0:f.reverse();uv.reverse()
                faces.append(f);uvs.append(uv)
        return vertices,faces,uvs

    def eye_opening(self, center, radius=(.014,.0122,.0134)):
        """Report projected lid skin depths alongside the proposed eyeball front.

        This diagnostic intentionally leaves the eye center unchanged. A ray
        through the anatomical opening sees the back socket; lid samples see the
        front face. Consumers can inspect the raw distances before moving an eye.
        """
        c=np.asarray(center,dtype=float);r=np.asarray(radius,dtype=float)
        samples=[]
        for dy in (-.008,-.004,0,.004,.008):
            for dx in (-.008,-.004,0,.004,.008):
                skin,_=self.front(c[0]+dx,c[1]+dy,c[2])
                u=(dx/r[0])**2+(dy/r[1])**2
                eye_front=c[2]+r[2]*math.sqrt(max(0,1-u))
                samples.append({'dx':dx,'dy':dy,
                    'skinZ':None if skin is None else float(skin[2]),
                    'eyeFrontZ':float(eye_front),
                    'eyeVisible':skin is None or eye_front>skin[2]})
        return samples
