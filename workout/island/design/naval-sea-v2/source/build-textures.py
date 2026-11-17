"""Deterministic, seamless sprite baking. Python 3 + NumPy + Pillow; no downloads.

Run from any working directory. Pixel/UV coordinates and playback contracts are
written by build-manifest.py, rather than inferred from sprite file names.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'textures'
OUT.mkdir(exist_ok=True)
TAU = math.tau


def png(name, pixels, colors=None):
    a = np.uint8(np.clip(pixels, 0, 255))
    image = Image.fromarray(a)
    if colors:
        image = image.quantize(colors=colors, dither=Image.Dither.NONE)
    path = OUT / (name + '.png')
    image.save(path, optimize=True, compress_level=9)
    assert path.stat().st_size <= 800_000, (name, path.stat().st_size)
    print(name, image.size, path.stat().st_size)
    return image.convert('RGBA')


def atlas(name, frames, columns, pad=4, colors=None):
    w, h = frames[0].size
    result = Image.new(frames[0].mode, (columns*(w+2*pad), math.ceil(len(frames)/columns)*(h+2*pad)))
    for i, frame in enumerate(frames):
        # Extruded edges protect atlas sampling; alpha FX have clear edge pixels.
        a = np.asarray(frame)
        a = np.pad(a, ((pad,pad),(pad,pad),(0,0)), mode='edge')
        result.paste(Image.fromarray(a), ((i%columns)*(w+2*pad), (i//columns)*(h+2*pad)))
    return png(name, np.asarray(result), colors)


def surface(n, phase, strength):
    u, v = np.meshgrid(np.linspace(0,1,n), np.linspace(0,1,n))
    height = np.zeros_like(u)
    dx = np.zeros_like(u)
    dy = np.zeros_like(u)
    # Integer wave vectors and temporal harmonics make x/y/time periodic.
    terms = [(1,2,1,.55,.2),(3,1,1,.26,1.4),(-2,4,2,.15,.5),
             (5,3,2,.085,2.3),(7,-2,3,.045,1.1),(-6,9,3,.028,4.4),
             (11,5,4,.014,2.1),(17,-9,5,.008,3.5),(23,13,6,.004,5.1)]
    for kx,ky,kt,amp,offset in terms:
        p = TAU*(kx*u+ky*v-kt*phase)+offset
        height += amp*np.sin(p)
        dx += amp*kx*np.cos(p)
        dy += amp*ky*np.cos(p)
    dx *= strength*.14
    dy *= strength*.14
    normal = np.stack((-dx, -dy, np.ones_like(dx)), -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    # Cool, deep water with softly lit ridges. Lighting is also computed in preview.
    light = np.clip(.45+height*.22+normal[:,:,1]*.5,0,1)
    deep = np.array([8,47,65])
    shallow = np.array([38,127,141])
    rgb = deep+(shallow-deep)*light[:,:,None]
    whitecap = np.clip((height-.58)*strength*.52,0,.28)
    rgb = rgb*(1-whitecap[:,:,None])+np.array([184,222,218])*whitecap[:,:,None]
    return rgb, (normal*.5+.5)*255


def water():
    for name,strength in [('calm',.38),('breeze',.82),('rough',1.42)]:
        colors, normals = [], []
        for i in range(16):
            c,n = surface(256, i/16, strength)
            colors.append(Image.fromarray(np.uint8(np.clip(c,0,255))))
            normals.append(Image.fromarray(np.uint8(np.clip(n,0,255))))
        atlas('water-'+name, colors, 4, 2, 128)
        atlas('water-'+name+'-normal', normals, 4, 2, 256)
        png('water-'+name+'-tile', np.asarray(colors[0]), 128)


def rgba(alpha, shade=1):
    alpha = np.clip(alpha,0,1)
    if np.isscalar(shade):
        shade = np.full_like(alpha, shade)
    # Straight-alpha; transparent pixels retain pale RGB to prevent black halos.
    c = np.stack((210+shade*37, 233+shade*20, 237+shade*18),-1)
    return Image.fromarray(np.uint8(np.dstack((np.clip(c,0,255),alpha*255))))


def wake():
    y,x = np.meshgrid(np.linspace(0,1,512),np.linspace(-1,1,256), indexing='ij')
    frames=[]
    for i in range(8):
        p = i/8
        envelope=np.sin(np.pi*y)**.6
        sides=np.exp(-((np.abs(x)-(.055+y*.76)) / (.025+y*.055))**2)
        bubbles=(np.sin(TAU*(y*19-p*2)+np.sin(x*32))*.5+.5)**3
        churn=np.exp(-(x/(.085+y*.31))**2)*(.20+.36*bubbles)
        ripples=np.maximum(0,np.sin(TAU*(y*27-p*3)+np.cos(x*26)))**6
        breakup=.55+.45*np.sin(x*103+np.sin(y*91-p*TAU))**2
        a=(sides*(.5+.3*ripples)+churn)*envelope*breakup
        a*=np.clip((1-np.abs(x))*20,0,1)
        frames.append(rgba(a))
    atlas('wake-8',frames,4)
    png('wake',np.asarray(frames[0]))


def foam():
    y,x=np.meshgrid(np.linspace(-1,1,128),np.linspace(0,1,512),indexing='ij')
    crest=.18*np.sin(TAU*x*3)+.08*np.sin(TAU*x*7)
    broken=.45+.55*np.sin(TAU*x*31+np.cos(y*22))**2
    a=np.exp(-((y-crest)/.22)**2)*broken
    a+=np.exp(-((y-crest+.34)/.16)**2)*.18
    a*=np.clip((1-np.abs(y))*12,0,1)
    png('foam-strip',np.asarray(rgba(a)))
    y,x=np.meshgrid(np.linspace(-1,1,256),np.linspace(-1,1,256),indexing='ij')
    r=np.hypot(x,y);theta=np.arctan2(y,x)
    ring=np.exp(-((r-.71-.035*np.sin(theta*9))/.07)**2)
    a=ring*(.35+.65*np.sin(theta*27+r*39)**2)*np.clip((1-r)*12,0,1)
    png('foam-ring',np.asarray(rgba(a*.8)))
    bubbles=np.maximum(0,np.sin(x*47+np.cos(y*29))*np.cos(y*61+np.sin(x*37)))**4
    a=np.exp(-r*r*4)*(.08+bubbles*.9)*np.clip((1-r)*8,0,1)
    png('foam-patch',np.asarray(rgba(a)))


def spray_frame(n,t,seed,column=False):
    h=n*2 if column else n
    y,x=np.meshgrid(np.linspace(1,0,h),np.linspace(-1,1,n),indexing='ij')
    a=np.zeros((h,n));rng=np.random.default_rng(seed)
    if t<=0 or t>=1:
        return rgba(a)
    # Ballistic, individually seeded droplets. Last frame is fully clear.
    for j in range(70 if column else 48):
        direction=rng.uniform(-1,1)
        vx=direction*(.56 if column else .95)
        vy=rng.uniform(.95,1.8)*(1.6 if column else 1)
        xx=vx*t
        yy=.07+vy*t-1.3*t*t
        width=rng.uniform(.009,.025)*(1-t*.5)
        height=width*(1.1+max(0,vy-2.6*t)*2.8)
        d=((x-xx)/width)**2+((y-yy)/height)**2
        a+=np.exp(-d*2)*max(0,(1-t)**.65)*rng.uniform(.5,.95)
    growth=np.sin(np.pi*min(1,t*1.8))
    if column:
        top=.1+min(.76,t*2.1)*(1-t*.57)
        radius=.085+.10*t
        shape=np.exp(-(x/(radius+.045*np.sin(y*29+seed)**2))**4)
        shape*=np.clip((top-y)*45,0,1)*np.clip((y-.025)*35,0,1)
        a+=shape*growth*(.65+.2*np.sin(y*84+x*47)**2)
        a+=np.exp(-((x/(.18+t*.11))**2+((y-top)/.065)**2))*growth*.4
        a+=np.exp(-((x/.32)**2+((y-.055)/.07)**2))*growth*.55
    else:
        crown=.09+(.28+.03*(seed%4))*np.sin(np.pi*min(1,t*1.5))
        r=np.abs(x)
        curve=.045+crown*np.clip(1-(r/(.12+.63*t))**2,0,1)
        a+=np.exp(-((y-curve)/(.018+.028*t))**2)*np.exp(-(r/(.12+.64*t))**8)*growth*.45
    a*=np.clip((1-np.abs(x))*18,0,1)*np.clip(y*42,0,1)*np.clip((1-y)*25,0,1)
    return rgba(np.clip(a,0,1),np.clip(y+.3,0,1))


def impacts():
    frames=[spray_frame(192,i/7,23+v*71) for v in range(4) for i in range(8)]
    atlas('impact-4x8',frames,8)
    frames=[spray_frame(192,i/11,613,True) for i in range(12)]
    atlas('near-miss-column-12',frames,4)


def sky():
    for name,stops in {
        'day':[(0,(35,85,119)),(.6,(104,171,190)),(1,(187,218,218))],
        'sunset':[(0,(30,38,70)),(.4,(96,69,106)),(.76,(206,118,114)),(1,(255,194,132))],
        'night':[(0,(3,8,23)),(.62,(12,25,51)),(1,(49,69,91))]
    }.items():
        y=np.linspace(0,1,256)
        c=np.array([np.interp(y,[s[0] for s in stops],[s[1][k] for s in stops]) for k in range(3)]).T
        a=np.repeat(c[:,None,:],512,axis=1)
        png('sky-'+name,a)
    y=np.linspace(-1,1,128)[:,None]
    fog=np.repeat(np.exp(-(y*2.65)**2)*.72,512,axis=1)
    png('horizon-fog',np.asarray(rgba(fog)))
    y,x=np.meshgrid(np.linspace(-1,1,128),np.linspace(-1,1,128),indexing='ij')
    r=np.hypot(x,y)
    a=np.clip((.52-r)*45,0,1)+np.exp(-r*r*8)*.16
    sun=np.dstack((np.full_like(r,255),np.full_like(r,216),np.full_like(r,163),np.clip(a,0,1)*255))
    png('sun-disc',sun)


if __name__=='__main__':
    water();wake();foam();impacts();sky()
