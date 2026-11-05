"""Compact anatomical cheek curvature and fiber-brow candidate; no file writes."""
import math
import numpy as np


def smooth(value):
    x=np.clip(value,0,1)
    return x*x*(3-2*x)


def cheek_curvature(face,eye_centres):
    eyes=np.asarray(eye_centres,dtype=float);ey=float(np.mean(eyes[:,1]))
    maximum=0.;moved=0
    for vertex in face.data.vertices:
        p=np.array(vertex.co[:]);x,y,z=p;ax=abs(x)
        if z<.018 or y<1.44 or ax>.090:continue
        n=np.array(vertex.normal[:]);n[1]*=.12
        if n[2]<=.12:continue
        n/=max(float(np.linalg.norm(n)),1e-9)
        r1=((ax-.051)/.030)**2+((y-(ey-.043))/.041)**2
        r2=((ax-.061)/.025)**2+((y-(ey-.073))/.039)**2
        malar=max(0.,1-r1)**2;outer=max(0.,1-r2)**2
        amount=.00235*malar+.00130*outer
        # Nose, lip commissures and eye rims receive no cheek displacement.
        amount*=float(smooth((ax-.027)/.013))
        lip=math.sqrt((x/.044)**2+((y-(ey-.105))/.026)**2)
        amount*=float(smooth((lip-1)/.28))
        for e in eyes:
            orbit=math.sqrt(((x-e[0])/.020)**2+((y-e[1])/.016)**2)
            amount*=float(smooth((orbit-1)/.35))
        amount*=float(smooth((y-1.44)/.04))*float(smooth((z-.018)/.025))
        if amount>1e-8:
            vertex.co=(p+n*amount).tolist();moved+=1;maximum=max(maximum,amount)
    face.data.update()
    return {'kind':'two compact C1 anatomical malar/outer-cheek pads','maximumDisplacementMeters':maximum,'verticesMoved':moved,'eyesNoseLipNeckGates':True,'eyeHeight':ey}


def boundary_crease(midpoint,eye_centres):
    p=np.asarray(midpoint);eyes=np.asarray(eye_centres);ey=float(np.mean(eyes[:,1]))
    if p[1]<1.44:return 1.
    if any(abs(p[0]-e[0])<.023 and abs(p[1]-e[1])<.020 for e in eyes):return 1.
    if abs(p[0])<.048 and ey-.140<p[1]<ey-.078:return .45
    if abs(p[0])<.027 and ey-.085<p[1]<ey-.025:return .60
    return 1.


def brow_volume(surface,center,side,width=.037,points=26):
    c=np.asarray(center);sign=1 if side=='l' else -1;vv=[];ff=[];uv=[]
    for i in range(points):
        t=i/(points-1)
        x=c[0]+sign*(t-.5)*width
        y=c[1]+.0175+.0030*math.sin(math.pi*t)-.001*t+.00035*math.sin(t*17+.5)
        y+=.00022*math.sin(t*21+.4)
        half=.0040*(.78+.22*math.sin(math.pi*t))*(1-.65*t**3)
        half*=1+.10*math.sin(t*17+.7)+.06*math.sin(t*29+.4)
        for j in range(5):
            v=j/4;dy=(2*v-1)*half
            p,n=surface.front(x,y+dy,c[2])
            if p is None:raise RuntimeError('Volume brow missed actual facial skin')
            p=np.asarray(p);n=np.asarray(n);n/=max(float(np.linalg.norm(n)),1e-9)
            p+=n*(.00065+.00065*math.sin(math.pi*v)**1.1)
            vv.append(p.tolist())
        if i:
            for j in range(4):
                f=[(i-1)*5+j,i*5+j,i*5+j+1,(i-1)*5+j+1]
                tex=[((i-1)/(points-1),j/4),(t,j/4),(t,(j+1)/4),((i-1)/(points-1),(j+1)/4)]
                q=np.asarray([vv[k] for k in f])
                if np.cross(q[1]-q[0],q[2]-q[0])[2]<0:f.reverse();tex.reverse()
                ff.append(f);uv.append(tex)
    return vv,ff,uv
