#!/usr/bin/env python3
"""Original deterministic VFX. Python 3.10+, Pillow, NumPy; no source images.

Run synthesize.py first, then this file. All writes stay beside this script.
RGBA is composed in premultiplied space and exported with straight alpha.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
TAU = math.tau
WARM = (255, 166, 61)
PALE = (255, 241, 198)
CYAN = (126, 223, 255)


class Tile:
    def __init__(self, size=128):
        self.size = size
        self.y, self.x = np.mgrid[:size, :size].astype(float) + .5
        self.rgb = np.zeros((size, size, 3), dtype=float)
        self.alpha = np.zeros((size, size), dtype=float)

    def over(self, color, alpha):
        a = np.clip(alpha, 0, 1)
        c = np.asarray(color, dtype=float) / 255
        self.rgb = c * a[..., None] + self.rgb * (1 - a[..., None])
        self.alpha = a + self.alpha * (1 - a)

    def glow(self, x, y, radius, color, opacity=1, stretch=1):
        d = ((self.x-x)/radius)**2 + ((self.y-y)/(radius*stretch))**2
        self.over(color, np.exp(-d*2.4) * opacity)

    def ring(self, x, y, radius, color, opacity=1, width=1.2, aspect=.74):
        d = np.hypot(self.x-x, (self.y-y)/aspect)
        a = np.exp(-((d-radius)/width)**2*1.5)*opacity
        self.over(color, a)

    def line(self, points, color, width=1.3, opacity=1, blur=0):
        im = Image.new('L', (self.size*3, self.size*3))
        ImageDraw.Draw(im).line([(round(x*3), round(y*3)) for x,y in points],
                               fill=round(255*opacity), width=max(1,round(width*3)), joint='curve')
        if blur:
            im = im.filter(ImageFilter.GaussianBlur(blur*3))
        mask = np.asarray(im.resize((self.size,self.size),Image.Resampling.LANCZOS))/255
        self.over(color, mask)

    def finish(self):
        # Exact transparent gutters; no RGB from a black or white matte.
        a = np.rint(self.alpha*255).astype('uint8')
        a[:3,:] = a[-3:,:] = a[:,:3] = a[:,-3:] = 0
        rgb = np.divide(self.rgb, self.alpha[...,None],
                        out=np.zeros_like(self.rgb), where=self.alpha[...,None]>.0001)
        out = np.dstack((np.rint(np.clip(rgb,0,1)*255).astype('uint8'), a))
        out[a==0] = 0
        return Image.fromarray(out)


def impact(frame, power):
    p = frame / 5
    s = (.52, .76, 1)[power]
    q = Tile()
    q.glow(64,64, (10+20*p)*s, WARM, .65*(1-p)**1.4)
    q.ring(64,64,(7+40*p)*s,CYAN,.8*(1-p)**1.2,width=1.7-.8*p)
    q.ring(64,64,(4+31*p)*s,WARM,.65*(1-p),width=.8)
    rng = np.random.default_rng(520+power)
    for i in range((9,13,17)[power]):
        a = rng.uniform(0,TAU)
        v = rng.uniform(19,45)*s
        r = 3*s+v*(.13+p*.9)
        length = (8-5*p)*s*rng.uniform(.6,1.2)
        x,y = 64+math.cos(a)*r,64+math.sin(a)*r*.83
        q.line([(x-math.cos(a)*length,y-math.sin(a)*length*.83),(x,y)],
               WARM,2.8*s, max(0,.95-p*.84),blur=.6)
        q.line([(x-math.cos(a)*length*.7,y-math.sin(a)*length*.7*.83),(x,y)],
               PALE,1.15*s,max(0,1-p*.9))
    if frame < 3:
        f = (1,.5,.12)[frame]
        q.glow(64,64,10*s,PALE,f)
        for a in [0,TAU/4,TAU/8,TAU*3/8]:
            length=(17 if a<TAU/4 else 9)*s*f
            q.line([(64-math.cos(a)*length,64-math.sin(a)*length),
                    (64+math.cos(a)*length,64+math.sin(a)*length)],PALE,1.8*s,f)
    return q.finish()


def absorb(frame):
    p=frame/6
    q=Tile()
    # Nose stays at the contact point. The incoming slug shrinks INTO the hull.
    q.glow(64,64,8+19*p,WARM,.55*(1-p))
    q.ring(64,64,3+20*p,WARM,.85*(1-p),width=1.9,aspect=.62)
    q.ring(64,64,2+12*p,(255,93,40),.65*(1-p),width=1.6,aspect=.62)
    if frame<4:
        length=15*(1-p)**2
        q.line([(64,64+length),(64,64)],CYAN,3.6*(1-p),1-p)
        q.line([(64,64+length*.8),(64,64)],PALE,1.4,1-p)
    q.glow(64,64,3.5,PALE,.95*(1-p)**1.6)
    return q.finish()


CRACKS = [([(64,64),(58,58),(61,49),(54,42)],1.2),
          ([(64,64),(74,60),(78,52),(86,50)],1.1),
          ([(64,64),(68,73),(64,82),(69,89)],1.3),
          ([(64,64),(53,68),(46,66),(40,72)],1.0),
          ([(61,49),(67,45),(68,39)],.6),
          ([(78,52),(76,43)],.6), ([(64,82),(57,85)],.6)]


def crack(_):
    q=Tile()
    q.glow(64,64,18,(24,22,31),.44)
    for pts,w in CRACKS:
        q.line(pts,(7,12,21),w+2,.88)
        q.line([(x+1,y+1) for x,y in pts],(210,205,194),w*.8,.56)
        q.line(pts,(255,146,66),w*.55,.54)
    q.glow(64,64,3.5,(255,117,45),.42)
    return q.finish()


def smoke(frame, heavy=False):
    q=Tile()
    # A stationary emitter and cyclic advected puffs. Phase wraps continuously.
    phase=frame/8
    for i in reversed(range(9 if heavy else 5)):
        age=(i/(9 if heavy else 5)+phase)%1
        x=64+math.sin(age*6+i*2)*age*12+age*8
        y=96-age*(70 if heavy else 62)
        radius=(5+age*(19 if heavy else 14))
        fade=math.sin(math.pi*age)**.8
        color=(61+age*36,66+age*38,82+age*35) if heavy else (159,175,191)
        # Soft, asymmetrical lobes and self-shadow, no opaque circle edges.
        q.glow(x,y,radius,color,fade*(.7 if heavy else .27),.85)
        q.glow(x-radius*.22,y-radius*.25,radius*.6,
               (121,129,146) if heavy else (203,217,225),fade*(.3 if heavy else .12))
        q.glow(x+radius*.25,y+radius*.2,radius*.55,(40,46,62),fade*(.38 if heavy else .05))
    return q.finish()


def electric(frame):
    q=Tile()
    rng=np.random.default_rng(992+frame)
    for branch in range(3):
        points=[(64,64)]
        a=branch*TAU/3+frame*.6
        for k in range(1,6):
            r=k*6.5
            points.append((64+math.cos(a)*r+rng.uniform(-5,5),
                           64+math.sin(a)*r+rng.uniform(-5,5)))
        q.line(points,(59,118,255),5,.48,blur=1.6)
        q.line(points,CYAN,1.8,.95)
        q.line(points, (228,250,255),.65,.95)
        if branch==1:
            x,y=points[3]
            q.line([(x,y),(x+8,y-3),(x+10,y-10)],CYAN,1,.8)
    q.glow(64,64,6,CYAN,.75)
    return q.finish()


def flame(frame):
    q=Tile()
    phase=frame/8*TAU
    q.glow(64,96,20,(255,101,28),.5)
    # Turbulent tapered plume; local +Y is down, emitter pivot = (64,96).
    v=(96-q.y)/48
    center=64+np.sin(v*9-phase)*v*7
    width=(1-np.clip(v,0,1))*(9+2*np.sin(v*15+phase))
    field=np.exp(-((q.x-center)/np.maximum(width,.3))**4)
    env=np.clip(v*12,0,1)*np.clip((1-v)*6,0,1)*(v>=0)*(v<1)
    q.over((255,91,24),field*env*.9)
    q.over((255,187,60),np.exp(-((q.x-center+1)/np.maximum(width*.6,.3))**4)*env*.94)
    q.over((255,246,184),np.exp(-((q.x-center+2)/np.maximum(width*.29,.3))**4)*env*np.clip(1-v*1.5,0,1))
    for k in range(3):
        a=(frame/8+k/3)%1
        q.glow(64+math.sin(k*3+a*5)*a*12,91-a*60,1.1,(255,208,112),math.sin(a*math.pi)*.8)
    return q.finish()


def explosion(frame):
    q=Tile(192)
    t=frame/10
    radius=10+58*(1-math.exp(-t*4))
    q.glow(96,96,19+53*t,(255,112,37),.65*(1-t))
    q.ring(96,96,8+77*t,CYAN,.86*(1-t)**1.6,width=2.2-1.5*t,aspect=.8)
    rng=np.random.default_rng(1008)
    for i in range(13):
        a=rng.uniform(0,TAU)
        r=radius*rng.uniform(.35,.76)
        x,y=96+math.cos(a)*r,96+math.sin(a)*r*.83
        size=(9+13*math.sin(t*math.pi))*rng.uniform(.7,1.3)
        smoke_amount=max(0,(t-.35)/.65)
        q.glow(x,y-t*16,size*1.16,(71,78,94),smoke_amount*(1-t)*1.5)
        q.glow(x,y,size,(255,93,24),max(0,1-t*1.22)*.94)
        q.glow(x-1,y-3,size*.66,(255,180,51),max(0,1-t*1.4))
        q.glow(x-2,y-4,size*.36,PALE,max(0,1-t*1.8))
    rng=np.random.default_rng(68)
    for i in range(21):
        a=rng.uniform(0,TAU)
        r=(8+70*t)*rng.uniform(.5,1)
        x,y=96+math.cos(a)*r,96+math.sin(a)*r+t*t*6
        q.line([(x,y),(x-math.cos(a)*(6-3*t),y-math.sin(a)*(6-3*t))],
               WARM,1.7,(1-t)**.7)
    if frame<3:
        q.glow(96,96,16,PALE,(1,.7,.18)[frame])
    # Final cel fades almost completely, then the one-shot is removed.
    if frame==9:
        q.rgb*=.12
        q.alpha*=.12
    return q.finish()


def file_info(path):
    data=(ROOT/path).read_bytes()
    return {'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


def main():
    clips={}
    atlases=[]
    groups=[('impacts.png',128,6,[
        ('impact-small',6,24,False,(64,64),lambda f:impact(f,0)),
        ('impact-medium',6,24,False,(64,64),lambda f:impact(f,1)),
        ('impact-large',6,24,False,(64,64),lambda f:impact(f,2)),
        ('absorb',6,24,False,(64,64),absorb)]),
        ('damage.png',128,8,[
        ('crack',1,1,True,(64,64),crack),
        ('smoke-light',8,12,True,(64,96),lambda f:smoke(f)),
        ('smoke-heavy',8,12,True,(64,96),lambda f:smoke(f,True)),
        ('electric',6,18,True,(64,64),electric),
        ('flame',8,12,True,(64,96),flame)]),
        ('explosion.png',192,5,[('explosion',10,20,False,(96,96),explosion)])]
    for name,size,cols,items in groups:
        count=sum(item[1] for item in items)
        atlas=Image.new('RGBA',(cols*size,math.ceil(count/cols)*size))
        index=0
        for key,n,fps,loop,pivot,draw in items:
            frames=[]
            for f in range(n):
                x,y=(index%cols)*size,(index//cols)*size
                atlas.paste(draw(f),(x,y))
                frames.append({'x':x,'y':y,'w':size,'h':size})
                index+=1
            clips[key]={'atlas':name,'frames':frames,'fps':fps,'loop':loop,
                        'durationMs':round(n/fps*1000),'pivot':list(pivot),
                        'blend':'source-over','space':'ship-local' if key!='explosion' else 'world',
                        'removeOnComplete':not loop}
        atlas.save(ROOT/name,optimize=True,compress_level=9)
        atlases.append({**file_info(name),'width':atlas.width,'height':atlas.height,
                        'format':'RGBA8','alpha':'straight','gutterPx':3,'frames':count})
    audio=json.loads((ROOT/'audio-metadata.json').read_text())
    manifest={
        'schemaVersion':1,'id':'alien-hits-v1','created':'2026-11-17',
        'repository':'roynaor-work/Bakasun','branch':'codex/alien-hits-v1',
        'runtimeIntegration':'not-connected; isolated asset package and preview only',
        'license':{'originalEffectsAudioCode':'CC0-1.0','previewShips':'Existing owner Meshy models; see LICENSE.txt'},
        'limits':{'atlasBytes':600000,'audioFileBytes':40000,'preview':[844,390]},
        'coordinates':{'origin':'top-left','x':'right','y':'down','rotation':'clockwise radians',
            'frameRects':'pixels; no trim, rotation or scaling in the atlas',
            'attachment':'world = ship.position + rotate(ship.angle, localContact * ship.scale)',
            'smokeAndFlame':'emit upward in authored local coordinates; counter-rotate for screen-up if desired'},
        'atlases':atlases,'clips':clips,'audio':audio,
        'impactPower':{'small':{'damageBelow':2,'clip':'impact-small','audio':'hit-01'},
                       'medium':{'damageBelow':4,'clip':'impact-medium','audio':'hit-02'},
                       'large':{'damageBelow':None,'clip':'impact-large','audio':'hit-03'},
                       'note':'Suggested mapping of actual dealt damage, including equipment modifiers.'},
        'damageStates':[
            {'id':'cracked','hpRatioAtMost':.8,'layers':['crack'],'onEnterAudio':'crack'},
            {'id':'light-smoke','hpRatioAtMost':.6,'layers':['crack','smoke-light']},
            {'id':'heavy-smoke','hpRatioAtMost':.4,'layers':['crack','smoke-heavy']},
            {'id':'electrical','hpRatioAtMost':.25,'layers':['crack','smoke-heavy','electric']},
            {'id':'burning','hpRatioAtMost':.1,'layers':['crack','smoke-heavy','electric','flame']},
            {'id':'destroyed','hpRatioAtMost':0,'layers':['explosion'],'onEnterAudio':'explosion'}],
        'integration':{
            'firstContact':'Use earliest swept segment contact (lowest t), including shields; apply once, release shot immediately and break regardless of shot.hp.',
            'contactPoint':'P = previousShot + t * (nextShot - previousShot). Convert P to ship-local coordinates before attaching absorb/crack.',
            'hit':'Start impact + absorb at contact; slug is only inside absorb, never a live projectile. Remove one-shots after 250 ms.',
            'damage':'Select the lowest HP threshold crossed; replace light smoke with heavy, retain crack; play crack sound only on first transition.',
            'death':'Hide ship and its local overlays immediately; play one explosion at last world position for 500 ms, then release it.',
            'pooling':'Suggested caps: 24 impact/absorb pairs, 5 overlays per ship, 4 death explosions; recycle and clear on entity reuse.',
            'rendering':'Normal alpha/source-over. Do not multiply damage overlays by the base sprite alpha: smoke must extend beyond the hull.',
            'audio':'OGG/Vorbis first, MP3 fallback; unlock on user gesture; choose one of three hit variants, crack once, explosion once. Suggested polyphony 6, master gain .55.'},
        'preview':{'file':'preview.html','size':[844,390],'ships':'preview-ships.png',
                   'shipsSource':'bake_preview.py reads existing assets/models/*.glb; geometry/materials unchanged',
                   'sourceProvenance':'../../assets/ultra-alien/provenance.json'},
        'files':[file_info(p) for p in ['impacts.png','damage.png','explosion.png','preview-ships.png']]+[
            file_info(p) for a in audio for p in a['sources']]}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'atlases':[(a['path'],a['bytes']) for a in atlases],
                      'clips':len(clips),'frames':sum(len(c['frames']) for c in clips.values())}))


if __name__=='__main__':
    main()
