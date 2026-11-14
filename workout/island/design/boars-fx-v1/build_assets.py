#!/usr/bin/env python3
"""Build exact 256px sprites and untrimmed 1024px atlases from local sources.

Pillow is required. Boar artwork is a checked-in generated cutout, not drawn in
code. All simple effect shapes are original, deterministic vector constructions.
Run synthesize.py first. This script only writes inside this asset package.
"""
from pathlib import Path
import hashlib
import json
import math

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SCALE = 3
SIZE = 256
INK = '#714c2f'
GOLD = '#ffd66c'
CREAM = '#fff6c7'
ORANGE = '#ed983e'
TEAL = '#75e4df'


def canvas():
    return Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))


def polygon(im, points, color):
    ImageDraw.Draw(im).polygon([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=color)


def ellipse(im, box, color, outline=None, width=1):
    ImageDraw.Draw(im).ellipse(tuple(round(v * SCALE) for v in box), fill=color,
                              outline=outline, width=round(width * SCALE))


def line(im, points, color, width=3):
    d = ImageDraw.Draw(im)
    points = [(round(x * SCALE), round(y * SCALE)) for x, y in points]
    d.line(points, fill=color, width=round(width * SCALE), joint='curve')
    radius = width * SCALE / 2
    for x, y in [points[0], points[-1]]:
        d.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)


def star(im, x, y, radius, color, points=5, rotation=-math.pi / 2, inner=.46):
    coords = []
    for i in range(points * 2):
        angle = rotation + i * math.pi / points
        r = radius if i % 2 == 0 else radius * inner
        coords.append((x + math.cos(angle) * r, y + math.sin(angle) * r))
    polygon(im, coords, color)


def finish(im):
    return im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def muzzle(frame):
    im = canvas()
    length, height = [(58, 25), (146, 72), (181, 84), (138, 63), (86, 41), (35, 18)][frame]
    x, y = 46, 128
    shape = [(x, y), (x+length*.27, y-height*.40), (x+length*.27, y-height),
             (x+length*.54, y-height*.44), (x+length*.82, y-height*.64),
             (x+length*.77, y-height*.13), (x+length, y),
             (x+length*.73, y+height*.17), (x+length*.83, y+height*.65),
             (x+length*.5, y+height*.45), (x+length*.27, y+height*.88),
             (x+length*.25, y+height*.32)]
    polygon(im, shape, ORANGE)
    polygon(im, [(x+(px-x)*.82, y+(py-y)*.73) for px, py in shape], GOLD)
    polygon(im, [(x+(px-x)*.59, y+(py-y)*.37) for px, py in shape], CREAM)
    if frame in (1, 2, 3):
        for sx, sy, angle in [(190, 57, -.5), (215, 187, .5), (130, 30, -1.1)]:
            line(im, [(sx, sy), (sx+9*math.cos(angle), sy+9*math.sin(angle))], GOLD, 4)
    return finish(im)


def projectile(kind):
    im = canvas()
    colors = [(GOLD, CREAM), (TEAL, '#edffff'), ('#f7ae80', '#fff4d6')]
    outer, core = colors[kind]
    if kind == 0:
        polygon(im, [(18, 128), (174, 115), (220, 128), (174, 141)], outer)
        line(im, [(92, 128), (209, 128)], core, 9)
        line(im, [(44, 111), (109, 111)], '#f3b64f', 3)
        line(im, [(30, 146), (102, 146)], '#f3b64f', 3)
    elif kind == 1:
        for k, x in enumerate([29, 62, 99, 139]):
            r = 3 + k * 2
            ellipse(im, (x-r, 128-r, x+r, 128+r), outer)
        line(im, [(141, 128), (213, 128)], outer, 24)
        line(im, [(156, 124), (210, 124)], core, 8)
    else:
        for k in range(5):
            star(im, 32+k*35, 128+math.sin(k*1.9)*11, 5+k*2, outer, 4)
        ellipse(im, (185, 116, 222, 140), outer)
        ellipse(im, (195, 119, 218, 130), core)
    return finish(im)


def hit(kind, frame):
    im = canvas()
    p = [0.0, .34, .68, 1.0][frame]
    radius = 25 + p * 66
    if kind == 'dust':
        for k in range(7):
            a = math.pi*2*k/7 + .2
            x, y = 128+math.cos(a)*radius*.68, 138+math.sin(a)*radius*.54
            r = (26-p*12) * (1 + .1*math.cos(k*4))
            ellipse(im, (x-r, y-r, x+r, y+r), '#d9bc85', INK, 1.5)
            ellipse(im, (x-r*.7, y-r*.75, x+r*.3, y+r*.1), '#f2dbac')
    elif kind == 'stars':
        for k in range(6):
            a = k*math.pi/3 - .3
            x, y = 128+math.cos(a)*radius, 136+math.sin(a)*radius*.77
            star(im, x, y, 18-p*8, GOLD if k%2 else TEAL, rotation=a+p)
            star(im, x-1, y-2, 7-p*4, CREAM, rotation=a+p)
        if frame < 2:
            star(im, 128, 136, 26-frame*9, CREAM, 4)
    elif kind == 'burst':
        star(im, 128, 136, radius, ORANGE, 9, rotation=.1+frame*.06, inner=.65)
        star(im, 128, 136, radius*.77, GOLD, 9, rotation=.1+frame*.06, inner=.63)
        star(im, 128, 136, radius*.43, CREAM, 7, inner=.69)
        for k in range(5):
            a = k*math.pi*.4
            x,y=128+math.cos(a)*(radius+12),136+math.sin(a)*(radius+12)
            ellipse(im, (x-4,y-4,x+4,y+4), GOLD)
    else:
        ellipse(im, (128-radius, 136-radius*.76, 128+radius, 136+radius*.76), None, '#edb468', 9-frame)
        for k in range(8):
            a=k*math.pi/4
            r=radius+15
            line(im, [(128+math.cos(a)*r,136+math.sin(a)*r*.8),
                      (128+math.cos(a)*(r+10),136+math.sin(a)*(r+10)*.8)], GOLD if k%2 else TEAL, 5)
        if frame < 2:
            star(im,128,136,34-frame*15,CREAM,6)
    if frame == 3:
        im.putalpha(im.getchannel('A').point(lambda value: round(value * .38)))
    return finish(im)


def miss(kind, frame):
    im = canvas()
    p = frame / 3
    # All variants are quieter, lower and earth-coloured compared with a hit.
    ellipse(im, (83-p*22, 178-p*8, 173+p*22, 188+p*8), None, '#a58b59', 3)
    if kind == 'dust':
        for k in range(5):
            x=128+(k-2)*(13+p*14)
            y=177-math.sin(k+1)*7-p*33
            r=12+math.sin(k*2)*3+p*5
            ellipse(im,(x-r,y-r,x+r,y+r),'#d9c398')
            ellipse(im,(x-r*.6,y-r*.6,x+r*.3,y),'#efdfb9')
    elif kind == 'pebbles':
        for k in range(7):
            x=128+(k-3)*(10+p*20)
            y=177-(1-abs(k-3)/4)*(22+math.sin(p*math.pi)*55)
            polygon(im,[(x-5,y-2),(x-1,y-6),(x+6,y-2),(x+3,y+4),(x-5,y+3)], '#b79a64')
            line(im,[(x,y+13),(x-(k-3)*1.2,y+22)],'#dac69a',2)
    else:
        for k in range(6):
            x=128+(k-2.5)*(12+p*22)
            y=181-math.sin(math.pi*(k+.5)/6)*(20+math.sin(p*math.pi)*49)
            line(im,[(x,y),(x-(k-2.5)*2,y+11)],'#e4ce96',5)
            ellipse(im,(x-3,y-4,x+3,y+2),'#f4e4b9')
    if frame == 3:
        im.putalpha(im.getchannel('A').point(lambda value: round(value * .28)))
    return finish(im)


def boar(cell):
    sheet=Image.open(ROOT / 'source/boar-poses.webp').convert('RGBA')
    x,y=cell%4*256,cell//4*256
    cut=sheet.crop((x,y,x+256,y+256))
    # Mechanical crop/scale only. The generated alpha is retained unchanged.
    bbox=cut.getchannel('A').point(lambda a: 255 if a>=24 else 0).getbbox()
    cut=cut.crop(bbox)
    factor=min(224/cut.width,204/cut.height)
    cut=cut.resize((round(cut.width*factor),round(cut.height*factor)),Image.Resampling.LANCZOS)
    im=Image.new('RGBA',(256,256))
    im.paste(cut,(128-cut.width//2,216-cut.height))
    return im


def file_info(path):
    return {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    frames=[]
    animations={}
    def add(name, images, timings, pivot=(.5,.53125), sound=None, loop=False, blend='normal'):
        ids=[]
        for index,im in enumerate(images):
            fid=f'{name}-{index+1:02d}'
            path=ROOT/'png'/f'{fid}.png'
            path.parent.mkdir(exist_ok=True)
            im.save(path,optimize=True)
            frames.append({'id':fid,'image':im,'pivot':list(pivot),'file':file_info(path)})
            ids.append(fid)
        animations[name]={'frames':ids,'frameDurationsMs':timings,'durationMs':sum(timings),
                          'loop':loop,'pivot':list(pivot),'blend':blend,'sound':sound}
    add('muzzle',[muzzle(i) for i in range(6)],[18,22,25,25,30,30],(.1796875,.5),
        'shot-cork',blend='additive')
    for k,name in enumerate(['gold','aqua','comet']):
        add('projectile-'+name,[projectile(k)],[100],(.84375,.5),loop=True)
    for kind in ['dust','stars','burst','pop']:
        add('hit-'+kind,[hit(kind,i) for i in range(4)],[45,65,90,110],sound='hit-'+kind)
    for kind in ['dust','pebbles','sand']:
        add('miss-'+kind,[miss(kind,i) for i in range(4)],[45,75,95,115],(.5,.71875),'miss-sand')
    add('boar-idle',[boar(0)],[1000],(.5,.84375),loop=True)
    add('boar-fall',[boar(i) for i in [1,2,3,4]],[90,120,170,360],(.5,.84375),'fall-squeak-roll')
    add('boar-side-hit',[boar(i) for i in [5,1,7]],[65,95,160],(.5,.84375),'hit-pop')
    atlases=[]
    frame_records={}
    for offset in range(0,len(frames),16):
        atlas=Image.new('RGBA',(1024,1024))
        aid=f'boars-fx-{offset//16+1:02d}'
        for i,entry in enumerate(frames[offset:offset+16]):
            x,y=i%4*256,i//4*256
            atlas.paste(entry['image'],(x,y))
            frame_records[entry['id']]={**entry['file'],'atlas':aid,'rect':{'x':x,'y':y,'w':256,'h':256},
                                      'sourceSize':{'w':256,'h':256},'pivot':entry['pivot'],
                                      'trimmed':False,'rotated':False}
        # One shared RGBA palette per atlas also keeps all standalone crops
        # byte-for-byte identical to their atlas region after decoding.
        atlas=atlas.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
        for i,entry in enumerate(frames[offset:offset+16]):
            x,y=i%4*256,i//4*256
            sprite_path=ROOT/'png'/f"{entry['id']}.png"
            atlas.crop((x,y,x+256,y+256)).save(sprite_path,optimize=True)
            frame_records[entry['id']].update(file_info(sprite_path))
        path=ROOT/'atlases'/f'{aid}.png'
        path.parent.mkdir(exist_ok=True)
        atlas.save(path,optimize=True)
        if path.stat().st_size>600000:
            raise RuntimeError(f'{path.name} exceeds 600 KB')
        atlases.append({'id':aid,**file_info(path),'width':1024,'height':1024})
    sounds=json.loads((ROOT/'audio/index.json').read_text())
    manifest={
        'schemaVersion':1,'id':'boars-fx-v1','titleHe':'אי החזירים — אפקטים שמרגישים',
        'version':'1.0.0','created':'2026-11-14','license':'CC0-1.0','baseUrl':'./',
        'scope':'Review-only standalone assets; no gameplay files changed.',
        'budgets':{'spritePixels':256,'atlasPixels':1024,'pngMaxBytes':600000,'atlasMaxBytes':600000,
                   'audioMaxBytesPerFile':60000,'audioMaxBytesPerCuePair':60000},
        'rendering':{'colorSpace':'sRGB','alpha':'straight','frameSize':[256,256],
                     'atlasLayout':'4x4 untrimmed 256px cells; no rotation',
                     'filter':'linear','mipmaps':False,'transparentMarginPixelsMin':4,
                     'uvOrigin':'top-left','pivotUnits':'normalized, top-left origin',
                     'muzzleDirection':'+X','projectileDirection':'+X','boarFacing':'left',
                     'groundPivot':[.5,.84375],'depthWrite':False},
        'atlases':atlases,'frames':frame_records,'animations':animations,
        'audio':{'sampleRate':sounds['sampleRate'],'channels':1,
                 'prefer':'ogg','fallback':'mp3','polyphony':6,'masterGain':.72,
                 'voiceCooldownMs':800,'randomPolicy':'shuffle bag; avoid immediate repeats',
                 'sounds':{s['id']:s for s in sounds['sounds']}},
        'events':{
            'shot':{'visual':['muzzle'],'projectileVariants':['projectile-gold','projectile-aqua','projectile-comet'],
                    'soundVariants':['shot-cork','shot-pew','shot-bubble'],'projectileSpeedPxPerSec':1100},
            'hit':{'visualVariants':['hit-dust','hit-stars','hit-burst','hit-pop'],
                   'soundVariants':['hit-dust','hit-stars','hit-burst','hit-pop'],'reaction':'boar-side-hit','pairByIndex':True},
            'miss':{'visualVariants':['miss-dust','miss-pebbles','miss-sand'],'sound':'miss-sand'},
            'fall':{'visual':'boar-fall','sound':'fall-squeak-roll','holdLastFrameMs':360,
                    'note':'Keep final resting pose until despawn; do not snap to standing.'},
            'voice':{'soundVariants':['pig-oink','pig-double','pig-snort','pig-hiccup','pig-chuckle']}},
        'provenance':{'effects':'Original deterministic shapes in build_assets.py',
                      'boar':{'method':'OpenAI image generation, followed by background-removal edit',
                              'source':file_info(ROOT/'source/boar-poses.webp'),
                              'generationIds':['80c8a1eb-6de7-438d-a4c4-6086d6c40145','1c86ce35-143c-49e6-9605-eb00a1177c03'],
                              'processing':'Mechanical 4x2 crop, uniform resize and foot alignment. No external character asset.'},
                      'audio':{'method':sounds['method'],'seed':sounds['seed'],'recordings':False}},
    }
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(frames)} transparent sprites, {len(atlases)} atlases, {len(animations)} animations.')


if __name__=='__main__':
    main()
