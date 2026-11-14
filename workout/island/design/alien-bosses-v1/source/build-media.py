"""Original deterministic RGBA game sprites and synthesized SFX (no samples)."""
from pathlib import Path
import json, math, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PALETTES = {'mothership': '#ff668f', 'cosmic-guardian': '#ffb547', 'space-crawler': '#f4773d'}
S = 3

def rgba(color, alpha=255):
    return tuple(int(color[i:i+2],16) for i in (1,3,5))+(alpha,)

def star(draw, x, y, r, color, rotation=0):
    pts=[]
    for i in range(10):
        t=rotation+i*math.pi/5-math.pi/2; rr=r if i%2==0 else r*.44
        pts.append((x+math.cos(t)*rr,y+math.sin(t)*rr))
    draw.polygon(pts, fill=color)

def effect(color, kind, frame):
    im=Image.new('RGBA',(128*S,128*S)); d=ImageDraw.Draw(im); t=frame/5
    def ellipse(x,y,rx,ry,fill=None,outline=None,width=2):
        d.ellipse(((x-rx)*S,(y-ry)*S,(x+rx)*S,(y+ry)*S),fill=fill,outline=outline,width=int(width*S))
    if kind=='explosion':
        # Six distinct stages: pop, bloom, separate soft chunks, drift, stars, fade.
        if frame<3: ellipse(64,64,8+frame*12,8+frame*12,rgba(color,200-frame*35))
        ellipse(64,64,12+t*41,12+t*41,None,rgba(color,round(230*(1-t)+10)),max(1,5*(1-t)))
        for j in range(8):
            a=j*math.pi/4+.16; r=7+40*t; x=64+math.cos(a)*r;y=64+math.sin(a)*r
            if frame<4:
                rr=(6-frame*.6)*S;cx=x*S;cy=y*S
                d.rounded_rectangle((cx-rr,cy-rr,cx+rr,cy+rr),radius=2*S,fill=rgba(color,round(235*(1-t))))
            else: star(d,x*S,y*S,(5-frame*.6)*S,rgba('#ffe6a1',round(210*(1-t)+18)),a)
        if frame<2: star(d,64*S,64*S,(16+frame*4)*S,rgba('#fff1cd'),.2)
    elif kind=='entrance':
        r=12+38*t;alpha=round(200*(math.sin(t*math.pi)*.7+.3))
        ellipse(64,76,r,r*.43,None,rgba(color,alpha),4*(1-t)+1)
        ellipse(64,76,r*.73,r*.31,None,rgba('#ffe6a1',alpha),1.5)
        for j in range(5):
            a=j*math.tau/5+t;star(d,(64+math.cos(a)*r)*S,(58+math.sin(a)*r*.6-12*t)*S,(3+2*math.sin(t*math.pi))*S,rgba(color,alpha),a)
    else:
        # Friendly warp swoosh and confetti, no burning wreck.
        for j in range(5):
            x=42+j*11;y=85-50*t-j*4
            d.line(((x-5)*S,(y+18)*S,x*S,y*S),fill=rgba(color,round(225*(1-t)+15)),width=max(1,round((4-3*t)*S)))
        ellipse(64,85,38*(1-t)+5,11*(1-t)+2,None,rgba('#ffe6a1',round(225*(1-t))),2)
        for j in range(3):star(d,(40+j*25)*S,(65-35*t-j*7)*S,4*S,rgba(color,round(215*(1-t)+15)),t)
    return im.resize((128,128),Image.Resampling.LANCZOS)

def projectile(name,color):
    im=Image.new('RGBA',(64*S,64*S));d=ImageDraw.Draw(im)
    if name=='mothership':
        d.rounded_rectangle((22*S,9*S,42*S,55*S),10*S,fill=rgba(color),outline=rgba('#ffe4c5'),width=2*S)
        d.rounded_rectangle((28*S,19*S,36*S,48*S),4*S,fill=rgba('#fff2dc'))
    elif name=='cosmic-guardian':
        d.ellipse((11*S,11*S,53*S,53*S),outline=rgba(color),width=8*S)
        d.ellipse((23*S,23*S,41*S,41*S),fill=rgba('#ffedc2'))
    else:
        d.polygon([(32*S,7*S),(52*S,32*S),(32*S,57*S),(12*S,32*S)],fill=rgba(color),outline=rgba('#ffdf97'),width=2*S)
        d.polygon([(32*S,20*S),(41*S,32*S),(32*S,44*S),(23*S,32*S)],fill=rgba('#fff1c7'))
    return im.resize((64,64),Image.Resampling.LANCZOS)

def make_sfx(name, index):
    sr=22050;dur={'entrance':1.10,'hit':.16,'explosion':.48,'death':1.0}[name]
    t=np.arange(round(sr*dur))/sr;rng=np.random.default_rng(4100+index)
    def tone(start,length,freq,gain=.25,slide=0):
        tt=t-start;active=(tt>=0)&(tt<length);u=np.maximum(0,tt)
        env=np.minimum(u/.012,1)*np.maximum(0,1-u/length)**1.7
        return active*env*gain*(np.sin(2*np.pi*(freq*u+.5*slide*u*u))+.15*np.sin(2*np.pi*freq*2*u))
    shift=[1,1.122462,1.259921][index]
    if name=='entrance':
        x=sum(tone(i*.14,.4,f*shift,.23) for i,f in enumerate([261.63,329.63,392,523.25]))
    elif name=='hit':x=tone(0,.15,620*shift,.36,-1900)
    elif name=='explosion':
        noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(14)/14,'same')
        x=tone(0,.35,170*shift,.34,-150)+noise*np.exp(-t*11)*np.minimum(t/.012,1)*.28+tone(.1,.27,440*shift,.10)
    else:x=sum(tone(i*.15,.45,f*shift,.20) for i,f in enumerate([523.25,659.25,783.99,1046.5]))
    # Click-free fade at both ends; max -6 dBFS, measured after each codec too.
    x*=np.minimum(t/.008,1)*np.minimum((dur-t)/.025,1)
    peak=np.max(np.abs(x));x*=.48/max(peak,1e-9)
    with tempfile.TemporaryDirectory(prefix='alien-sfx-') as tmp:
        wav=Path(tmp)/'input.wav'
        with wave.open(str(wav),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((x*32767).astype('<i2').tobytes())
        for ext,args in [('ogg',['-c:a','libvorbis','-q:a','2']),('mp3',['-c:a','libmp3lame','-b:a','48k','-write_xing','1'])]:
            out=ROOT/'audio'/f'{list(PALETTES)[index]}-{name}.{ext}'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),*args,'-map_metadata','-1',str(out)],check=True)
            assert out.stat().st_size<=80000

for directory in ['sprites','audio']:(ROOT/directory).mkdir(exist_ok=True)
for idx,(name,color) in enumerate(PALETTES.items()):
    projectile(name,color).save(ROOT/'sprites'/f'{name}-projectile.png')
    for kind in ['explosion','entrance','retreat']:
        atlas=Image.new('RGBA',(768,128))
        for frame in range(6):atlas.paste(effect(color,kind,frame),(frame*128,0))
        atlas.save(ROOT/'sprites'/f'{name}-{kind}.png')
    for cue in ['entrance','hit','explosion','death']:make_sfx(cue,idx)
print('Generated 12 transparent PNGs and 24 original OGG/MP3 files.')
