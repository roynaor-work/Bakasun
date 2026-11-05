"""Original 16-frame stylized burst atlas, 512² RGBA; deterministic particles."""
from pathlib import Path
from PIL import Image, ImageFilter
import math, random
ROOT=Path(__file__).resolve().parents[1]
random.seed(761)
particles=[(random.random()*math.tau,.18+random.random()*.6,.12+random.random()*.13) for _ in range(15)]
atlas=Image.new('RGBA',(512,512))
for frame in range(16):
    u=frame/15
    image=Image.new('RGBA',(128,128))
    pixels=image.load()
    for y in range(128):
        for x in range(128):
            dx,dy=(x-63.5)/62,(y-63.5)/62
            r=math.hypot(dx,dy)
            core=max(0,1-r/(.12+u*.70))**2*(1-u)**.8
            puffs=0
            for angle,distance,size in particles:
                distance*=.08+u*.9
                rr=math.hypot(dx-math.cos(angle)*distance,dy-math.sin(angle)*distance)
                puffs=max(puffs,max(0,1-rr/(size*(.25+u*.75)))**1.5)
            strength=max(core,puffs*(1-u)**.7)
            if strength<.002:continue
            heat=max(0,1-r/(.2+u*.8))*(1-u*.5)
            color=(int(231+heat*23),int(126+heat*108),int(88+heat*95),int(min(1,strength*1.8)*255))
            pixels[x,y]=color
    image=image.filter(ImageFilter.GaussianBlur(.65))
    atlas.alpha_composite(image,((frame%4)*128,(frame//4)*128))
atlas.save(ROOT/'textures/effects-atlas.png',optimize=True)
