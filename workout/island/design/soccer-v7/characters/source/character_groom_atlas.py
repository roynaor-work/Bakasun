#!/usr/bin/env python3
"""Original feathered hair undercoat textures for fictional football characters.

No photos or external pixel data are used. Curved straight-hair groups and small
curly arcs are authored in texture space, then converted to restrained tangent
normals. The opaque interior closes the scalp beneath separate silhouette cards; the
root boundary fades through connected tapered groups instead of a hard stencil.
The helper returns PIL RGBA/RGB images and a NumPy roughness array. CC0-1.0.
"""
import math
import os
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from collections import deque


def _normal(height, maximum_slope=.34):
    dy,dx=np.gradient(np.asarray(height,dtype=float))
    slope=np.sqrt(dx*dx+dy*dy)
    scale=np.minimum(1.0,maximum_slope/np.maximum(slope,1e-9))
    dx*=scale;dy*=scale
    n=np.stack((-dx,dy,np.ones_like(dx)),axis=-1)
    n/=np.maximum(np.linalg.norm(n,axis=-1,keepdims=True),1e-9)
    return Image.fromarray(np.clip(np.round((n*.5+.5)*255),0,255).astype(np.uint8),'RGB')


def _straight_groups(style,w,h,rng):
    """Dense independent bent yarns avoid a repeating sinusoidal comb pattern."""
    supersample=3
    image=Image.new('L',(w*supersample,h*supersample),28)
    draw=ImageDraw.Draw(image)
    count=max(1,round(w*h/14))
    sweep=.46 if style in ('sweep','quiff') else .16 if style=='short' else .03
    for _ in range(count):
        x=float(rng.uniform(-12,w+12));y=float(rng.uniform(-24,h+24))
        length=float(rng.uniform(8,23))
        lean=sweep+float(rng.normal(0,.17))
        bend=float(rng.uniform(-2.3,2.3))*(1.35 if style=='waves' else 1.0)
        width=float(rng.uniform(.55,1.30))
        strength=int(rng.integers(105,240))
        points=[]
        for i in range(9):
            t=i/8
            points.append(((x+lean*length*t+bend*math.sin(math.pi*t))*supersample,
                           (y-length*t)*supersample))
        draw.line(points,fill=strength,width=max(1,round(width*supersample)),joint='curve')
    return image.resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.40))


def _curly_groups(w,h,rng):
    """Short irregular 2--4 pixel arcs form dense small coils, without dot fill."""
    supersample=3
    image=Image.new('L',(w*supersample,h*supersample),24)
    draw=ImageDraw.Draw(image)
    count=max(1,round(w*h/21))
    for _ in range(count):
        x=float(rng.uniform(-5,w+5));y=float(rng.uniform(-5,h+5))
        radius=float(rng.uniform(2.0,4.0))
        aspect=float(rng.uniform(.70,1.16))
        rotation=float(rng.uniform(0,2*math.pi))
        sweep=float(rng.uniform(math.pi*.92,math.pi*1.75))
        start=float(rng.uniform(0,2*math.pi))
        strength=int(rng.integers(110,242))
        width=float(rng.uniform(.65,1.05))
        points=[]
        for i in range(19):
            theta=start+sweep*i/18
            a=radius*math.cos(theta);b=radius*aspect*math.sin(theta)
            px=x+a*math.cos(rotation)-b*math.sin(rotation)
            py=y+a*math.sin(rotation)+b*math.cos(rotation)
            points.append((px*supersample,py*supersample))
        draw.line(points,fill=strength,width=max(1,round(width*supersample)),joint='curve')
    return image.resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.43))


def _smoothstep(value):
    value=np.clip(value,0,1)
    return value*value*(3-2*value)


def _hairline_coverage(style,w,h,rng):
    """Connected curved root groups feather the lower 17--22% of the tile.

    The caller maps distance above the curved anatomical hairline to texture V.
    Image bottom is v0. Each stroke connects to the opaque interior, so alpha
    creates small tapering groups rather than floating dark stipple fragments.
    """
    fraction=.22 if style=='coils' else .17 if style=='buzz' else .205
    rows=max(2,min(h,round(h*fraction)))
    scale=4
    band=Image.new('L',(w*scale,rows*scale),0)
    count=max(8,round(w/1.25))
    for i in range(count):
        root=(i+.5)*w/count+float(rng.uniform(-.22,.22))
        tip_v=float(rng.uniform(.001,.075))
        length=max(.35,min(1.,1-tip_v/fraction))
        lean=float(rng.uniform(-1.1,1.1))
        bend=float(rng.uniform(-1.0,1.0))
        root_width=float(rng.uniform(1.7,3.1))
        stroke=Image.new('L',band.size,0);draw=ImageDraw.Draw(stroke)
        previous=None
        for step in range(19):
            t=step/18
            x=root+lean*t+bend*math.sin(math.pi*t)
            if style=='coils':x+=.45*math.sin(t*math.pi*2)
            y=(rows-1)*length*t
            width=root_width*(1-t)**.68+.05
            alpha=255*(1-float(_smoothstep((t-.76)/.24)))
            current=(x,y,width,alpha)
            if previous is not None:
                px,py,pw,pa=previous
                for offset in (-w,0,w):
                    polygon=[((px+offset-pw*.5)*scale,py*scale),
                             ((px+offset+pw*.5)*scale,py*scale),
                             ((x+offset+width*.5)*scale,y*scale),
                             ((x+offset-width*.5)*scale,y*scale)]
                    draw.polygon(polygon,fill=round((pa+alpha)*.5))
            previous=current
        band=ImageChops.lighter(band,stroke)
    band=band.resize((w,rows),Image.Resampling.LANCZOS)
    alpha=np.asarray(band,dtype=float)
    # Uneven inter-group density joins the opaque core without introducing a
    # straight horizontal opacity threshold or a repeated wave across the brow.
    noise=Image.fromarray(rng.integers(0,256,(1,w),dtype=np.uint8),'L')
    noise=noise.resize((w,rows),Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(1.3))
    noise=np.asarray(noise,dtype=float);noise-=noise.mean()
    noise=np.clip(noise/max(float(noise.std())*2,1),-1,1)
    v=np.linspace(fraction,0,rows)[:,None]
    background=_smoothstep((v-fraction*(.72+noise*.06))/(fraction*.28))*255
    alpha=np.maximum(alpha,background)
    alpha[0:2]=255;alpha[-1]=0
    # Discard any isolated over-threshold texel islands introduced by resampling.
    # Eight-neighbor connectivity preserves diagonal fine strand tips.
    mask=alpha>=64;connected=np.zeros(mask.shape,dtype=bool)
    pending=deque((0,x) for x in range(w) if mask[0,x])
    connected[0]=mask[0]
    while pending:
        y,x=pending.popleft()
        for dy in (-1,0,1):
            yy=y+dy
            if yy<0 or yy>=rows:continue
            for dx in (-1,0,1):
                xx=x+dx
                if xx<0 or xx>=w or connected[yy,xx] or not mask[yy,xx]:continue
                connected[yy,xx]=True;pending.append((yy,xx))
    alpha[mask&~connected]=0
    result=np.full((h,w),255,dtype=np.uint8)
    result[-rows:]=np.clip(np.round(alpha),0,255).astype(np.uint8)
    return result


def undercoat_patch(person,w,h,rng):
    """Return (root-feathered RGBA pigment, RGB normal, roughness[height,width]).

    The caller owns the UV rectangle. A 378x261 patch is the intended near-view
    allocation. Height amplitude .60 yields readable groups; normal slopes are
    limited to .34, or about 9.7 degrees after normalScale=.5. Albedo variations
    stay at only a few RGB levels, avoiding stripes and broad baked highlights.
    """
    w=int(w);h=int(h)
    if w<2 or h<2:raise ValueError('Hair undercoat needs at least 2x2 texels')
    style=person.get('hair','crop')
    curly=style=='coils'
    groups=_curly_groups(w,h,rng) if curly else _straight_groups(style,w,h,rng)
    values=np.asarray(groups,dtype=float)/255
    # Remove only very broad accidental density drift. The small authored coils
    # and fiber groups retain their local raised shape and tangent direction.
    density=np.asarray(groups.filter(ImageFilter.GaussianBlur(10)),dtype=float)/255
    fine=values-density
    height=values*.60
    normal=_normal(height,maximum_slope=.34 if curly else .29)
    color=np.array(person.get('hairColor',(27,20,16)),dtype=float)
    pigment=color+np.array((2.4,1.2,.2))
    enhanced=os.environ.get('SOCCER_CHARACTER_HAIR_TEXTURE_VARIANT','16')=='20'
    variation=np.clip(fine*(24.0 if enhanced else 8.0),-7.0 if enhanced else -2.4,7.0 if enhanced else 2.4)
    rgb=np.clip(pigment[None,None,:]+variation[...,None],0,255)
    rgba=np.empty((h,w,4),dtype=np.uint8)
    rgba[...,:3]=np.round(rgb).astype(np.uint8)
    rgba[...,3]=_hairline_coverage(style,w,h,rng)
    rough=np.clip(214-fine*3.0,211,217)
    return Image.fromarray(rgba,'RGBA'),normal,rough
