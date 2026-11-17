#!/usr/bin/env python3
"""Original CC0 fire/smoke flipbooks. Python 3 + Pillow + NumPy; deterministic.

Each output is eight 128 px frames in a horizontal transparent RGBA strip.
No photographs, downloaded textures, AI media or external art are used.
"""
from pathlib import Path
import json
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'effects'
SIZE = 128
AA = 3
TAU = math.tau


def bezier(a, b, c, d, count=24):
    return [tuple((1-t)**3*a[k] + 3*(1-t)**2*t*b[k] + 3*(1-t)*t*t*c[k] + t**3*d[k]
                  for k in range(2)) for t in np.linspace(0, 1, count)]


def tongue(draw, cx, bottom, width, height, sway, color):
    """Tapering curved tongue with a hollow concave shoulder and a hooked tip."""
    tip = (cx+sway, bottom-height)
    left = bezier((cx-width*.49, bottom), (cx-width*.82, bottom-height*.33),
                  (cx-width*.07-sway*.25, bottom-height*.43), tip)
    right = bezier(tip, (cx+sway*.5+width*.15, bottom-height*.60),
                   (cx+width*.72, bottom-height*.28), (cx+width*.49, bottom))
    draw.polygon([(int(x*AA), int(y*AA)) for x,y in left+right], fill=color)


def fire(frame):
    phase = TAU*frame/8
    core = Image.new('RGBA', (SIZE*AA,SIZE*AA))
    d = ImageDraw.Draw(core)
    tongue(d,64,115,77,70,7*math.sin(phase),(219,48,10,222))
    tongue(d,44,112,32,68+6*math.sin(phase+1),-13+7*math.sin(phase+2),(246,70,12,245))
    tongue(d,82,114,32,72+7*math.sin(phase+3),11+8*math.sin(phase+4),(249,79,13,246))
    tongue(d,65,114,50,102+4*math.sin(phase),11*math.sin(phase),(255,114,19,255))
    tongue(d,52,114,32,68+8*math.sin(phase+1),-9*math.sin(phase+.8),(255,166,31,255))
    tongue(d,77,114,29,76+6*math.sin(phase+2),9*math.sin(phase+3),(255,175,34,255))
    tongue(d,63,115,38,78+5*math.sin(phase+4),5*math.sin(phase+.3),(255,205,63,255))
    tongue(d,67,115,23,52+4*math.sin(phase+1),-3*math.sin(phase+2),(255,238,142,255))
    tongue(d,62,115,14,33+3*math.sin(phase+2),4*math.sin(phase+3),(255,250,210,255))
    # Soft halo around the outer silhouette, with clear detailed inner tongues.
    halo = Image.new('RGBA', core.size, (255,91,9,0))
    halo.putalpha(core.getchannel('A').filter(ImageFilter.GaussianBlur(AA*3.1)).point(lambda x: int(x*.31)))
    halo.alpha_composite(core)
    # Small sparks advance upward and fade; their route is periodic at frame 8.
    sparks = ImageDraw.Draw(halo)
    for i in range(5):
        life = (frame/8+i*.21)%1
        x=37+i*13+math.sin(life*5+i)*4
        y=103-life*77
        opacity=int(230*math.sin(math.pi*life))
        radius=(1.15-life*.55)*AA
        sparks.ellipse((x*AA-radius,y*AA-radius,x*AA+radius,y*AA+radius), fill=(255,196,58,opacity))
    return halo.resize((SIZE,SIZE),Image.Resampling.LANCZOS)


def smoke(frame):
    # A continuous eight-frame cycle of soft, shaded lobes. Gaussian density
    # avoids rectangles/edge seams when 3D billboards overlap under ceilings.
    phase = TAU*frame/8
    rng = random.Random(917)
    y,x=np.mgrid[0:SIZE*AA,0:SIZE*AA].astype(np.float64)/AA
    density=np.zeros_like(x)
    light=np.zeros_like(x)
    for i in range(25):
        theta = rng.random()*TAU
        radial = math.sqrt(rng.random())
        cx=64+math.cos(theta)*radial*33+3*math.sin(phase+i*.71)
        cy=67+math.sin(theta)*radial*30+3*math.cos(phase+i*.49)
        sx=rng.uniform(7,15)*(1+.07*math.sin(phase+i))
        sy=sx*rng.uniform(.8,1.3)
        puff=np.exp(-.5*(((x-cx)/sx)**2+((y-cy)/sy)**2))
        density+=puff*rng.uniform(.55,1.05)
        light+=puff*(.5-.5*math.sin(theta))*.8
    alpha=(1-np.exp(-density*.66))
    # Fully transparent border remains after antialiasing, preventing atlas bleed.
    edge=np.clip(np.minimum.reduce([x-4,123-x,y-4,123-y])/9,0,1)
    alpha*=edge
    shade=48+28*np.clip(light/(density+.01),0,1)+8*np.sin(x*.11+y*.08+phase)*np.clip(density,0,1)
    rgba=np.empty((*x.shape,4),dtype=np.uint8)
    rgba[:,:,0]=np.clip(shade*.94,0,255)
    rgba[:,:,1]=np.clip(shade*.99,0,255)
    rgba[:,:,2]=np.clip(shade*1.08,0,255)
    rgba[:,:,3]=np.clip(alpha*188,0,255)
    return Image.fromarray(rgba).resize((SIZE,SIZE),Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for name,render in [('fire',fire),('smoke',smoke)]:
        strip=Image.new('RGBA',(SIZE*8,SIZE))
        for f in range(8):
            strip.alpha_composite(render(f),(SIZE*f,0))
        strip.save(OUT/f'{name}.png',optimize=True)
    data={
        'license':'CC0-1.0', 'generator':'source/build_atmosphere.py',
        'layout':'horizontal','frameCount':8,'frameWidth':128,'frameHeight':128,
        'colorSpace':'sRGB','alpha':'straight','seamGuardPixels':3,
        'frames':[{'index':i,'x':i*128,'y':0,'width':128,'height':128} for i in range(8)],
        'effects':{
            'fire':{'file':'effects/fire.png','fps':12,'blend':'normal','pivot':[.5,.9],
                    'usage':'Billboard at fire_<id>; animate UV x over 8 frames. Hidden outside burning state.'},
            'smoke':{'file':'effects/smoke.png','fps':8,'blend':'normal','pivot':[.5,.5],
                     'usage':'Layer at smoke anchors; grow radius/opacity and move toward ceiling with accumulated density.'}
        }
    }
    (OUT/'atmosphere.json').write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({name:(OUT/f'{name}.png').stat().st_size for name in ['fire','smoke']}))


if __name__=='__main__':
    main()
