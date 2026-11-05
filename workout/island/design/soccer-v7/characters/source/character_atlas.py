#!/usr/bin/env python3
"""1024-square PBR UV atlas for fictional canonical football athletes.

Anatomical skin and hair source pixels: CC0 MakeHuman system asset data already
versioned in soccer-v6/characters/source/makehuman. No person is represented.
One UV layout; base color RGBA, tangent normal RGB and packed AO/rough/metal RGB.
UV rectangles use Blender/glTF's conventional lower-left UV coordinates here;
the GLB writer performs the image-origin conversion once, when exporting UVs.
"""
from pathlib import Path
import math
from functools import lru_cache
import os
import hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1] / 'soccer-v6' / 'characters' / 'source' / 'makehuman'
TEXTURES = ROOT / 'textures'
SKIN_CACHE = Path(os.environ.get('SOCCER_AUTHORING_SKIN_CACHE','/tmp/soccer-v7-authoring-skin'))
SIZE = 1024
FACE_CROP = (.78, .32, .99, .65)
SHIRT_UV_BOUNDS = (.0185, .5952, .9240, .9815)
RECT = {
    'face': (.015, .46, .60, .99),
    'skin': (.015, .015, .40, .27),
    'scalp': (.015, .275, .40, .300),
    'shirt': (.62, .56, .99, .99),
    'shorts': (.62, .36, .99, .54),
    'socks': (.42, .015, .60, .20),
    'boots': (.42, .22, .60, .44),
    'stitch': (.42, .445, .60, .455),
    'hair': (.62, .085, .99, .34),
    'wisps': (.62, .015, .99, .075),
    'eyes': (.015, .31, .155, .435),
    'brows': (.015, .438, .40, .455),
    'gloves': (.17, .31, .40, .435),
}
KITS = {
    'kit-a': ((20, 108, 112), (18, 48, 57), (20, 108, 112)),
    'kit-b': ((218, 145, 46), (38, 44, 49), (218, 145, 46)),
    'keeper': ((170, 196, 73), (35, 44, 43), (170, 196, 73)),
    'referee': ((188, 195, 201), (35, 39, 45), (35, 39, 45)),
}

def rectuv(kind, u, v):
    a,b,c,d=RECT[kind]
    return (a+(c-a)*float(u), b+(d-b)*float(v))

def skin_uv(u, v, prefer_face=True):
    """Preserve original oral/eyelid islands outside the enlarged head island."""
    a,b,c,d=FACE_CROP
    if prefer_face and a <= u <= c and b <= v <= d:
        return rectuv('face', (u-a)/(c-a), (v-b)/(d-b))
    return rectuv('skin', u, v)

def skin_source_info():
    result=[]
    for dark in (False,True):
        original=SKIN_CACHE/('young_darkskinned_male_diffuse.png' if dark else 'young_lightskinned_male_diffuse.png')
        path=original if original.exists() else SOURCE/('skin-dark-diffuse.png' if dark else 'skin-diffuse.png')
        with Image.open(path) as image:dimensions=list(image.size)
        result.append({'file':path.name,'authoringOnly':True,'cacheSource':original.exists(),'dimensions':dimensions,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return result

def hair_style(person):
    return {'crop':'short04','coils':'afro01','sweep':'short02','quiff':'short03',
            'buzz':'short01','waves':'short04','short':'short01'}[person['hair']]

def _box(kind):
    a,b,c,d=RECT[kind]
    return tuple(round(x) for x in (a*SIZE,(1-d)*SIZE,c*SIZE,(1-b)*SIZE))

def _normal(height, strength=1.0):
    dy,dx=np.gradient(height.astype(float))
    n=np.stack((-dx*strength,dy*strength,np.ones_like(dx)),axis=-1)
    n/=np.linalg.norm(n,axis=-1)[...,None]
    return np.clip(np.round((n*.5+.5)*255),0,255).astype(np.uint8)

def _rgb(arr):
    return Image.fromarray(np.clip(np.round(arr),0,255).astype(np.uint8),'RGB')

def _skin_source(person, kind, dims):
    dark=person['heritage'][0]>.5
    original=SKIN_CACHE/('young_darkskinned_male_diffuse.png' if dark else 'young_lightskinned_male_diffuse.png')
    path=original if original.exists() else SOURCE/('skin-dark-diffuse.png' if dark else 'skin-diffuse.png')
    image=Image.open(path).convert('RGB')
    # Remove the source-file credit strip from unused UV padding. Provenance
    # belongs in documentation, and is never visible as branding on an athlete.
    draw=ImageDraw.Draw(image)
    x=round(image.width*.975); y=round(image.height*.75)
    fill=image.getpixel((round(image.width*.96),round(image.height*.75)))
    draw.rectangle((x,y,image.width,image.height),fill=fill)
    if kind=='face':
        a,b,c,d=FACE_CROP
        image=image.crop((round(a*image.width), round((1-d)*image.height),
                          round(c*image.width), round((1-b)*image.height)))
    image=image.resize(dims,Image.Resampling.LANCZOS)
    arr=np.asarray(image,dtype=float)
    reference=np.array((109,75,58) if dark else (226,176,145),dtype=float)
    # Keep pores, freckles, lip coloration and the subtle cheek/nose variation.
    # Tame only extreme baked lighting so the render lighting supplies the form.
    tinted=arr/reference*np.array(person['skin'],dtype=float)
    return image,np.clip(tinted,0,255)

def normalize_shirt_uv(u, v):
    a,b,c,d=SHIRT_UV_BOUNDS
    return ((float(u)-a)/(c-a),(float(v)-b)/(d-b))

@lru_cache(maxsize=1)
def _shirt_seam_lines():
    """UV paths of the source jersey's real boundaries and split seams.

    The suit source also contains jeans. Their UVs end below .59, while the
    connected shirt islands occupy .5952..9815 in V. Both sides of a split UV
    edge are retained, making the seam line continuous on the sewn surface.
    """
    path=Path(__file__).resolve().parent/'cc0-clothing'/'male_casualsuit06.obj'
    uv=[];faces=[]
    for line in path.read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='vt':uv.append(tuple(map(float,a[1:3])))
        elif a[0]=='f':
            vertices=[];texcoords=[]
            for pair in a[1:]:
                parts=pair.split('/')
                vertices.append(int(parts[0])-1);texcoords.append(int(parts[1])-1)
            if min(uv[i][1] for i in texcoords)>.59:
                faces.append((vertices,texcoords))
    uses={}
    for vertices,texcoords in faces:
        for i,(a,b) in enumerate(zip(vertices,vertices[1:]+vertices[:1])):
            ta=texcoords[i];tb=texcoords[(i+1)%len(vertices)]
            if a>b:a,b=b,a;ta,tb=tb,ta
            uses.setdefault((a,b),[]).append((uv[ta],uv[tb]))
    result=[]
    for edge,rows in uses.items():
        boundary=len(rows)==1
        split=len(rows)>1 and any(not np.allclose(rows[0],row,atol=1e-6) for row in rows[1:])
        if boundary or split:
            for a,b in rows:
                result.append((normalize_shirt_uv(*a),normalize_shirt_uv(*b),boundary))
    return tuple(result)

def _shirt_seam_mask(w, h):
    scale=4
    image=Image.new('L',(w*scale,h*scale),0);draw=ImageDraw.Draw(image)
    for a,b,boundary in _shirt_seam_lines():
        points=[(u*(w-1)*scale,(1-v)*(h-1)*scale) for u,v in (a,b)]
        draw.line(points,fill=255,width=round((1.35 if boundary else 1.10)*scale))
    return image.resize((w,h),Image.Resampling.LANCZOS)

def _cloth(kind, color, w, h):
    if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18'):
        from character_cloth17 import cloth_patch
        seam=_shirt_seam_mask(w,h) if kind=='shirt' else None
        return cloth_patch(kind,color,w,h,seam)
    yy,xx=np.mgrid[:h,:w];u=xx/max(w-1,1);v=yy/max(h-1,1)
    # Tangent micro-knit follows continuous yarns. Color variation stays small;
    # the knit reads through normals, rather than bright isolated dot noise.
    fiber=.70*np.sin(xx*1.70+.45*np.sin(yy*2.20))+.30*np.sin(yy*2.20)
    broad=np.sin(u*math.pi*7+np.sin(v*math.pi*3))*np.sin(v*math.pi*2)**2
    if kind=='socks':
        broad=.3*np.cos(xx*.34);fiber+=np.sin(xx*1.12)*.8
    shading=.30*fiber+1.2*broad
    col=np.clip(np.array(color)[None,None,:]+shading[...,None],0,255)
    height=fiber*(.09 if kind=='shirt' else .035)+broad*(.70 if kind=='shirt' else .30)
    if kind=='shirt':
        # Actual pattern edges, including collar, cuffs, hem, shoulders and sides.
        # No arbitrary quarter-U lines cut through the jersey's chest panel.
        seam=_shirt_seam_mask(w,h)
        core=np.asarray(seam.filter(ImageFilter.GaussianBlur(.45)),dtype=float)/255
        halo=np.asarray(seam.filter(ImageFilter.GaussianBlur(1.25)),dtype=float)/255
        height+=halo*.33-core*.30
        col-=core[...,None]*np.array(color)[None,None,:]*.025
        col+=halo[...,None]*np.array(color)[None,None,:]*.010
    else:
        # Shorts/socks retain cylindrical garment UVs: quarter-U is each side.
        for fraction in (.25,.75):
            seamx=round(fraction*(w-1));d=xx-seamx
            groove=np.exp(-(d/1.45)**2)
            height-=groove*.25;col-=groove[...,None]*3.2
        for hem in (5,9,h-7,h-11):
            d=yy-hem;line=np.exp(-(d/.6)**2)
            height+=line*.12
            col+=line[...,None]*1.5
    normal=_normal(height,1.8)
    rough=np.clip(218+fiber*3.2,0,255)
    return _rgb(col),Image.fromarray(normal,'RGB'),rough

def _pad(image,box,pixels=3):
    """Extend edge colors into gutters to keep mipmapped UV borders clean."""
    x0,y0,x1,y1=box
    for n in range(1,pixels+1):
        if x0-n>=0:image.paste(image.crop((x0,y0,x0+1,y1)),(x0-n,y0))
        if x1+n<=SIZE:image.paste(image.crop((x1-1,y0,x1,y1)),(x1+n-1,y0))
        if y0-n>=0:image.paste(image.crop((x0,y0,x1,y0+1)),(x0,y0-n))
        if y1+n<=SIZE:image.paste(image.crop((x0,y1-1,x1,y1)),(x0,y1+n-1))

def _brow_patch(person, w, h, rng):
    """Feathered individual brow hairs, supersampled for the narrow UV strip.

    There is no opaque fill: every visible pixel comes from short overlapping
    hair strokes. The central undercoat remains dense enough for alphaTest .25,
    while roots/tails and upper edges keep irregular strand silhouettes.
    """
    # Tenfold sampling preserves the difference between .40 and .32 px fibers.
    # At the old sixfold scale both rounded to nearly the same broad stroke.
    scale=10
    image=Image.new('RGBA',(w*scale,h*scale),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    hair=np.array(person['hairColor'],dtype=float)
    volume_brow=os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24')=='27'
    for layer,count in ((0,int(w*(.95 if volume_brow else 1.04))),(1,int(w*(.80 if volume_brow else 1.16)))):
        for i in range(count):
            t=(i+rng.uniform(.05,.95))/count
            x=t*(w-1)
            taper=math.sin(math.pi*t)**.38
            root=h*(.69+.045*math.sin(t*17+.4)+rng.uniform(-.05,.05)) if volume_brow else h*(.66+rng.uniform(-.055,.055))
            length=h*(rng.uniform(.22,.38) if layer==0 else rng.uniform(.38,.90))*taper if volume_brow else h*(rng.uniform(.24,.40) if layer==0 else rng.uniform(.34,.72))*taper
            # From the inner root toward the outer tail the hairs lean outward.
            lean=(.30+2.0*t)*rng.uniform(.55,1.15)
            bend=rng.uniform(-.35,.35)+.20*t
            shade=rng.uniform(-3,7)
            color=tuple(np.clip(np.round(hair+shade),0,255).astype(int))
            alpha=int(rng.uniform(240,255))
            width=(.45 if layer==0 else .36) if volume_brow else (.40 if layer==0 else .32)
            # Curved strokes have robust lower roots and tapered, irregular tips;
            # there is no rectangular fill or repeated solid upper contour.
            for segment in range(8):
                a=segment/8;b=(segment+1)/8
                points=[]
                for s in (a,b):
                    points.append(((x+lean*s+bend*math.sin(math.pi*s))*scale,
                                   (root-length*s)*scale))
                thickness=max(1,round(scale*width*(1-.12*b)))
                opacity=round(alpha*(1-.16*b**3))
                draw.line(points,fill=color+(opacity,),width=thickness)
    image=image.resize((w,h),Image.Resampling.LANCZOS)
    arr=np.array(image,dtype=float)
    yy,xx=np.mgrid[:h,:w]
    edge=np.sin(math.pi*(yy+.5)/h)**.20
    tail=np.sin(math.pi*(xx+.5)/w)**.20
    arr[...,3]*=edge*tail
    # Preserve warm pigment in the transparent fringe to avoid dark mip halos.
    empty=arr[...,3]<1
    arr[empty,:3]=hair
    return Image.fromarray(np.clip(np.round(arr),0,255).astype(np.uint8),'RGBA')

def _wisps_patch(person, w, h, rng):
    """Eight independent transparent tiles for curved flyaway hair ribbons.

    Tile U is [tile/8,(tile+1)/8]; root is v0 and feathered tips point toward v1.
    Five to seven readable tapered strand groups occupy each tile. Each tile
    keeps three transparent pixels at the sides to prevent neighboring tiles
    leaking into a ribbon through bilinear filtering or mipmaps.
    """
    scale=6
    image=Image.new('RGBA',(w*scale,h*scale),(0,0,0,0))
    draw=ImageDraw.Draw(image)
    hair=np.array(person['hairColor'],dtype=float)
    for tile in range(8):
        left=tile*w/8;right=(tile+1)*w/8
        count=int(rng.integers(5,8))
        for i in range(count):
            root=left+3+(i+.5)*(right-left-6)/count+rng.uniform(-.35,.35)
            length=float(rng.uniform(.65,1.0))
            lean=float(rng.uniform(-2.8,2.8))
            bend=float(rng.uniform(-2.2,2.2))
            root_width=float(rng.uniform(4.0,6.0))
            color=np.clip(hair*rng.uniform(.86,1.16)+np.array((2.5,1.0,0.0)),0,255)
            previous=None
            for step in range(31):
                t=step/30
                x=root+lean*t+bend*math.sin(math.pi*t)
                # Continue roots beyond v0 so the last image row remains dense
                # after supersampling; h-1 left a transparent one-texel seam.
                y=(h+1)*(1-length*t)
                width=root_width*(1-t)**.72+.07
                x=max(left+3+width*.5,min(right-3-width*.5,x))
                alpha=245*(1-max(0,(t-.72)/.28)**1.25)
                current=(x,y,width,alpha)
                if previous is not None:
                    px,py,pw,pa=previous
                    polygon=[((px-pw*.5)*scale,py*scale),
                             ((px+pw*.5)*scale,py*scale),
                             ((x+width*.5)*scale,y*scale),
                             ((x-width*.5)*scale,y*scale)]
                    draw.polygon(polygon,fill=tuple(np.round(color).astype(int))+(int((pa+alpha)*.5),))
                previous=current
    image=image.resize((w,h),Image.Resampling.LANCZOS)
    arr=np.array(image,dtype=float)
    empty=arr[...,3]<1;arr[empty,:3]=hair
    return Image.fromarray(np.clip(np.round(arr),0,255).astype(np.uint8),'RGBA')

def atlas(person, kit):
    TEXTURES.mkdir(parents=True,exist_ok=True)
    key=person['id']+'-'+kit
    shirt,shorts,socks=KITS[kit]
    base=Image.new('RGBA',(SIZE,SIZE),(70,68,65,255))
    normal=Image.new('RGB',(SIZE,SIZE),(128,128,255))
    orm=Image.new('RGB',(SIZE,SIZE),(255,185,0))
    seed=1901+sum((i+1)*ord(ch) for i,ch in enumerate(person['id']))
    rng=np.random.default_rng(seed)
    for kind in ('face','skin','shirt','shorts','socks','boots','stitch','scalp','hair','wisps','brows','gloves','eyes'):
        x0,y0,x1,y1=B=_box(kind);w=x1-x0;h=y1-y0
        yy,xx=np.mgrid[:h,:w]
        patch=Image.new('RGBA',(w,h),(100,100,100,255))
        nrm=Image.new('RGB',(w,h),(128,128,255))
        rough=np.full((h,w),185.,dtype=float);ao=np.full((h,w),255.,dtype=float)
        if kind in ('skin','face'):
            source,col=_skin_source(person,kind,(w,h))
            # Fine pores come from the CC0 diffuse's detail, never random blotches.
            lumin=np.asarray(source.convert('L'),float)
            low=np.asarray(source.convert('L').filter(ImageFilter.GaussianBlur(1.25)),float)
            pore=(lumin-low)*(.0105 if kind=='face' else .0065)
            nrm=Image.fromarray(_normal(pore,.75),'RGB')
            rough=174+(low-lumin)*.065
            if kind=='face':
                a,b,c,d=FACE_CROP
                su=a+(c-a)*xx/max(w-1,1);sv=d-(d-b)*yy/max(h-1,1)
                forehead=np.exp(-((su-.8056)/.022)**2-((sv-.4832)/.090)**2)
                nose=np.exp(-((su-.8660)/.027)**2-((sv-.4832)/.025)**2)
                chin=np.exp(-((su-.9640)/.018)**2-((sv-.4832)/.055)**2)
                rough-=27*forehead+36*nose+12*chin
            # Restrained specular variation keeps skin distinct from cotton.
            rough+=np.asarray(Image.fromarray(rng.integers(0,12,(h,w),dtype=np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(float)-6
            patch=_rgb(col).convert('RGBA')
        elif kind in ('shirt','shorts','socks'):
            col={'shirt':shirt,'shorts':shorts,'socks':socks}[kind]
            color_img,nrm,rough=_cloth(kind,col,w,h);patch=color_img.convert('RGBA')
        elif kind=='scalp':
            if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18':
                # Current grooms sample 'hair'. Their unused legacy scalp tile
                # becomes same-hue rib knit only for the isolated cloth18 band.
                from character_cloth17 import rib_patch18
                patch,nrm,rough=rib_patch18(shirt,w,h)
            else:
                # Opaque close-cropped roots lie beneath silhouette hair cards.
                # The undercoat has no alpha holes and follows a fine combed grain.
                grain=.55*np.sin(xx*2.45+.65*np.sin(yy*1.42)+.28*np.sin(xx*.33+yy*.74))+.25*np.sin(xx*1.75+yy*.69)+.20*np.sin(xx*2.98-yy*.83)
                pigment=np.array(person['hairColor'],dtype=float)+np.array((2.5,1.0,0.0))
                col=pigment[None,None,:]+grain[...,None]*1.3+(.7*np.sin(yy*.31+xx*.035))[...,None]
                patch=_rgb(col).convert('RGBA')
                nrm=Image.fromarray(_normal(grain*.025,1.3),'RGB')
                rough=np.clip(214+grain*3,205,222)
        elif kind=='hair':
            if not person.get('legacyHairCards',False):
                from character_groom_atlas import undercoat_patch
                patch,nrm,rough=undercoat_patch(person,w,h,rng)
            else:
                style=hair_style(person)
                image=Image.open(next((SOURCE/'hair'/style).glob('*diffuse.png'))).convert('RGBA').resize((w,h),Image.Resampling.LANCZOS)
                arr=np.asarray(image,dtype=float)
                lum=arr[...,:3].mean(2)
                # Source strands retain their alpha silhouette. A warm brown base
                # and high roughness prevent dark cards turning slate/silver under
                # the studio key light; micro normals break up each broad ribbon.
                color=np.array(person['hairColor'])[None,None,:]
                strand_tone=(.88+np.clip(lum,0,150)*.0025)[...,None]
                warmth=(1-np.clip(lum/100,0,1))[...,None]*np.array((2.5,1.0,0.0))
                arr[...,:3]=np.clip(color*strand_tone+warmth,0,255)
                arr[...,3]=np.clip(arr[...,3],0,255)
                patch=Image.fromarray(arr.astype(np.uint8),'RGBA')
                hairheight=(lum-np.asarray(image.convert('L').filter(ImageFilter.GaussianBlur(1.15)),float))*.0060
                nrm=Image.fromarray(_normal(hairheight,.95),'RGB')
                rough=np.clip(208+(1-np.clip(lum/180,0,1))*8,198,219)
        elif kind=='wisps':
            patch=_wisps_patch(person,w,h,rng);rough[:]=197
            fiber=np.asarray(patch.getchannel('A'),dtype=float)/255
            nrm=Image.fromarray(_normal(fiber*.065,.65),'RGB')
        elif kind=='brows':
            patch=_brow_patch(person,w,h,rng);rough[:]=204
        elif kind=='stitch':
            if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18'):
                from character_cloth17 import stitch_patch
                patch,nrm,rough=stitch_patch(shirt,w,h)
            else:
                # A small physical seam ribbon maps length to U and width to V.
                v=yy/max(h-1,1);u=xx/max(w-1,1)
                edge=np.sin(math.pi*v)**.65
                thread=(np.mod(xx,6)<2).astype(float)
                twin=np.exp(-((v-.28)/.12)**2)+np.exp(-((v-.72)/.12)**2)
                col=np.array(shirt)[None,None,:]*(1-.075*edge[...,None])
                col=np.broadcast_to(col,(h,w,3)).copy()
                col+=np.array(shirt)[None,None,:]*(twin*thread*.065)[...,None]
                patch=_rgb(col).convert('RGBA')
                height=.23*edge+.07*twin*thread
                nrm=Image.fromarray(_normal(height,1.4),'RGB');rough[:]=218
        elif kind=='boots':
            u=xx/max(w-1,1);v=yy/max(h-1,1)
            grain=(np.sin(xx*1.42)*np.cos(yy*1.67))*.7
            panels=2.8*np.exp(-((u-.5)/.28)**2)
            arr=np.clip(np.array((25,31,35))+grain[...,None]+panels[...,None],0,255)
            patch=_rgb(arr).convert('RGBA');rough[:]=125
            height=.008*grain
            # A stitched upper panel, no branded stripe/trade dress.
            for f in (.18,.82):
                line=np.exp(-((u-f)/.008)**2);height+=line*.1
            nrm=Image.fromarray(_normal(height,2),'RGB')
        elif kind=='gloves':
            u=xx/max(w-1,1);v=1-yy/max(h-1,1)
            grain=.8*np.sin(xx*1.8)*np.cos(yy*1.8)
            col=np.array((226,231,224))+grain[...,None]
            height=.02*np.sin(xx*1.8)*np.cos(yy*1.8)
            if person['role']=='goalkeeper':
                cuff=np.exp(-((v-.82)/.07)**8)
                col=col*(1-cuff[...,None])+np.array((42,54,54))*cuff[...,None]
                edge=np.exp(-((v-.71)/.018)**2);col-=edge[...,None]*20
                height+=.18*cuff
                for stripe in (.18,.38,.62,.82):
                    groove=np.exp(-((u-stripe)/.010)**2)*np.exp(-((v-.40)/.29)**6)
                    col-=groove[...,None]*22;height-=groove*.20
            patch=_rgb(col).convert('RGBA');rough[:]=164
            nrm=Image.fromarray(_normal(height,1.6),'RGB')
        elif kind=='eyes':
            # Map as a projected iris disk over an actual eyeball, behind lid rims.
            cx=(w-1)*.5;cy=(h-1)*.5
            # The mesh projects each sphere axis into ±.44 of this patch.
            # A .49 radius in sphere coordinates gives a 13.7 mm iris on
            # a 28 mm globe; patch aspect ratio must not stretch that disk.
            dx=(xx-cx)/(w*.44);dy=(yy-cy)/(h*.44)
            rad=np.sqrt(dx*dx+dy*dy)/.49;angle=np.arctan2(dy,dx)
            sclera=np.array((183,183,177),dtype=float)
            if np.mean(person['skin'])<100:
                sclera+=np.array((-5,-4,-2))
            arr=np.broadcast_to(sclera,(h,w,3)).copy()
            arr-=np.clip((rad-.8),0,1)[...,None]*10
            iris=rad<=1.0;pupil=rad<.32;limbus=(rad>.9)&iris
            striation=(np.sin(angle*35+rad*7)+np.sin(angle*63-rad*4))*.5
            iris_color=np.array(person['eye'],dtype=float)*1.18+4
            iris_col=iris_color+(striation*9+(1-rad)*5)[...,None]
            arr[iris]=np.clip(iris_col[iris],0,255);arr[limbus]*=.62;arr[pupil]=(7,9,10)
            # Subtle static upper-lid occlusion complements the coarse mobile
            # shadow map; the bright corneal reflection remains entirely physical.
            upper=np.clip((-dy-.05)/.70,0,1)
            arr*=1-.095*upper[...,None]
            # Reflections belong to the PBR light; no painted white catchlight.
            patch=_rgb(arr).convert('RGBA')
            rough[:]=139;rough[iris]=77
            # Eyes reserve ORM.R for corneal clearcoat coverage; their material
            # disables AO. The sclera retains a matte wet surface without a
            # broad white coat reflection across the whole exposed globe.
            ao=np.clip(np.round(np.clip((1.12-rad)/.10,0,1)*16)/16*255,0,255)
        orm_arr=np.zeros((h,w,3),dtype=np.uint8)
        orm_arr[...,0]=np.clip(ao,0,255);orm_arr[...,1]=np.clip(np.round(rough),0,255)
        base.paste(patch,B[:2]);normal.paste(nrm,B[:2]);orm.paste(Image.fromarray(orm_arr,'RGB'),B[:2])
        _pad(base,B);_pad(normal,B);_pad(orm,B)
    files={
        'basecolor':TEXTURES/(key+'-basecolor.webp'),
        'normal':TEXTURES/(person['id']+'-normal.png'),
        'orm':TEXTURES/(person['id']+'-orm.png'),
    }
    # Six-bit diffuse precision and restrained normal/roughness quantization
    # retain visible surface detail while keeping each embedded atlas mobile-sized.
    diffuse=np.array(base);diffuse[...,:3]=np.clip(np.round(diffuse[...,:3]/4)*4,0,255)
    # Preserve eight-bit dark hair pigments. Four-level rounding made subtle
    # root grain turn into visible broad bands on the close-up undercoat.
    original=np.array(base)
    for kind in ('scalp','hair','wisps','brows'):
        x0,y0,x1,y1=_box(kind);diffuse[y0:y1,x0:x1,:3]=original[y0:y1,x0:x1,:3]
    x0,y0,x1,y1=_box('face')
    diffuse[y0:y1,x0:x1,:3]=np.clip(np.round(original[y0:y1,x0:x1,:3]/2)*2,0,255)
    tangent=np.array(normal);tangent[...,:2]=np.clip(np.round(tangent[...,:2]/4)*4,0,255)
    packed=np.array(orm);packed[...,1]=np.clip(np.round(packed[...,1]/8)*8,0,255)
    Image.fromarray(diffuse,'RGBA').save(files['basecolor'],format='WEBP',quality=98,method=6,exact=True,alpha_quality=100)
    # PNG palettes shrink downloads without changing runtime texture dimensions.
    # Normal quantization keeps 256 representative directions; no spatial dither
    # is introduced, which would add artificial shading noise.
    Image.fromarray(tangent,'RGB').quantize(
        colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE
    ).save(files['normal'],optimize=True)
    # Packed AO/roughness/metal uses few colors. Build its palette explicitly
    # so each decoded RGB texel stays bit-for-bit identical to the packed map.
    colors,inverse=np.unique(packed.reshape(-1,3),axis=0,return_inverse=True)
    if len(colors)<=256:
        indexed=Image.fromarray(inverse.reshape(SIZE,SIZE).astype(np.uint8),'P')
        palette=np.zeros((256,3),dtype=np.uint8);palette[:len(colors)]=colors
        indexed.putpalette(palette.flatten().tolist())
        indexed.save(files['orm'],optimize=True)
    else:
        Image.fromarray(packed,'RGB').save(files['orm'],optimize=True)
    return {key:str(path.relative_to(ROOT)) for key,path in files.items()}

if __name__=='__main__':
    import json
    person=dict(id='atlas-inspection',skin=(177,123,91),heritage=(.12,.1,.78),hair='crop',hairColor=(27,20,16),eye=(67,45,26))
    print(json.dumps(atlas(person,'kit-a'),indent=2))
