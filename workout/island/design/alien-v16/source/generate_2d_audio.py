"""Original CC0-1.0 artwork and synthesis. Python 3, Pillow, NumPy, ffmpeg.

Run from any directory. Writes exclusively inside this asset package.
"""
from pathlib import Path
import io
import json
import math
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
S = 4
CYAN = '#71eaff'
PLASMA = dict(scout='#a1e5f5', heavy='#edb865', weaver='#c985ed',
              splitter='#a5e68a', carrier='#f58da5')
BONUS = dict(spread='#f8b45a', laser='#67dcff', rapid='#f4db66',
             shield='#79aaff', wing='#a3e58c', nova='#d59bff')
ANIMS = {}


def rgb(h):
    return tuple(bytes.fromhex(h.lstrip('#')))


class Art:
    def __init__(self, w, h):
        self.size = (w, h)
        self.im = Image.new('RGBA', (w*S, h*S))
        self.d = ImageDraw.Draw(self.im)

    def ellipse(self, xy, fill, width=None):
        xy = tuple(round(x*S) for x in xy)
        if width:
            self.d.ellipse(xy, outline=fill, width=round(width*S))
        else:
            self.d.ellipse(xy, fill=fill)

    def line(self, pts, color, width):
        self.d.line([(round(x*S), round(y*S)) for x,y in pts],
                    fill=color, width=max(1, round(width*S)), joint='curve')
        r = width/2
        for x,y in [pts[0], pts[-1]]:
            self.ellipse((x-r,y-r,x+r,y+r), color)

    def polygon(self, pts, color):
        self.d.polygon([(round(x*S), round(y*S)) for x,y in pts], fill=color)

    def glow(self, radius=3, intensity=.85):
        bloom = self.im.filter(ImageFilter.GaussianBlur(radius*S))
        bloom.putalpha(bloom.getchannel('A').point(lambda x: int(x*intensity)))
        self.im = Image.alpha_composite(bloom, self.im)
        self.d = ImageDraw.Draw(self.im)

    def finish(self):
        out = self.im.resize(self.size, Image.Resampling.LANCZOS)
        # Clear the outermost pixel and hidden RGB for clean sprite isolation.
        a = np.array(out)
        a[0,:,:] = a[-1,:,:] = a[:,0,:] = a[:,-1,:] = 0
        a[a[:,:,3] == 0] = 0
        return Image.fromarray(a)


def save(im, name):
    p = ROOT/name
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, optimize=True)


def animation(name, frames, fps, folder='sprites', loop=False, **extra):
    w,h = frames[0].size
    sheet = Image.new('RGBA', (w*len(frames), h))
    files = []
    for i, im in enumerate(frames):
        filename = f'{folder}/frames/{name}-{i:02}.png'
        save(im, filename)
        files.append(filename)
        sheet.paste(im, (w*i,0))
    path = f'{folder}/{name}.png'
    save(sheet,path)
    ANIMS[name] = dict(sheet=path, frames=files, frameWidth=w, frameHeight=h,
                       count=len(frames), columns=len(frames), rows=1,
                       fps=fps, loop=loop, anchor=[.5,.5], **extra)


def laser():
    frames=[]
    for f in range(4):
        a=Art(128,64)
        y=32
        a.line([(15,y),(110,y)], (*rgb(CYAN),95), 13+[0,1,-1,2][f])
        a.glow(5,1)
        a.line([(16,y),(111,y)], (*rgb(CYAN),210), 7)
        a.glow(2)
        a.line([(20,y),(109,y)], (255,255,255,255), [2.8,3.5,2.4,3.2][f])
        a.ellipse((105,28,113,36),(255,255,255,255))
        for x in [26+f*12,59+f*8]:
            a.line([(x,25-f%2),(x+10,25-f%2)], (*rgb(CYAN),140), .9)
        frames.append(a.finish())
    animation('player-laser',frames,24,loop=True,direction='+X')


def burst(name, n, impact=False):
    frames=[]
    for f in range(n):
        t=f/(n-1)
        a=Art(128,128)
        rad=(14+27*t) if impact else [19,33,26,15][f]
        alpha=int(255*(1-.85*t))
        count=9 if impact else 6
        pts=[]
        for i in range(count*2):
            ang=i*math.pi/count+.13
            r=rad*(1 if i%2==0 else .25)
            pts.append((64+math.cos(ang)*r,64+math.sin(ang)*r))
        a.polygon(pts,(*rgb(CYAN),alpha))
        a.glow(5)
        if impact:
            ring=10+32*t
            a.ellipse((64-ring,64-ring,64+ring,64+ring),(*rgb(CYAN),int(160*(1-t))),1.5)
            for i in range(7):
                ang=i*math.tau/7+.24
                start=17+18*t
                end=start+5+11*t
                a.line([(64+math.cos(ang)*start,64+math.sin(ang)*start),
                        (64+math.cos(ang)*end,64+math.sin(ang)*end)],
                       (219,252,255,alpha),max(.7,2.2*(1-t)))
        core=max(1.5,9*(1-t))
        a.ellipse((64-core,64-core,64+core,64+core),(255,255,255,alpha))
        a.glow(1.5)
        frames.append(a.finish())
    animation(name,frames,30,loop=False)


def plasma():
    for variant,color in PLASMA.items():
        frames=[]
        for f in range(4):
            a=Art(64,128)
            # Head points down (+image Y); the tail fades upward.
            for j in range(75):
                u=j/74
                y=15+j
                x=32+math.sin(u*8+f*math.pi/2)*2.2*(1-u)
                r=1+9*u
                a.ellipse((x-r,y-r,x+r,y+r),(*rgb(color),int(2+60*u*u)))
            a.glow(4)
            for j in range(38):
                u=j/37
                x=32+math.sin(u*9+f*math.pi/2)*1.5
                y=51+j
                r=1+5*u
                a.ellipse((x-r,y-r,x+r,y+r),(*rgb(color),int(15+140*u*u)))
            a.ellipse((22-f%2,78,42+f%2,100),(*rgb(color),235))
            a.glow(2.5)
            a.ellipse((27,83,37,95),(246,255,255,255))
            # A solid accent on the head keeps the supplied variant color exact.
            a.ellipse((24,85,27,92),(*rgb(color),255))
            frames.append(a.finish())
        animation(f'plasma-{variant}',frames,20,loop=True,direction='+Y',color=color)


def symbol(a,name,color):
    white=(240,251,255,255)
    if name=='spread':
        for ang in [-.6,0,.6]:
            x=48+math.sin(ang)*22; y=57-math.cos(ang)*22
            a.line([(48,62),(x,y)],white,3)
            a.polygon([(x,y-6),(x-4,y+3),(x+4,y+3)],white)
    elif name=='laser':
        a.line([(35,64),(60,32)],white,5)
        a.line([(28,57),(52,26)],(*rgb(color),255),1.8)
        a.polygon([(60,26),(62,31),(68,33),(62,35),(60,41),(58,35),(53,33),(58,31)],white)
    elif name=='rapid':
        for dx in [-9,10]:
            a.polygon([(49+dx,27),(36+dx,49),(46+dx,49),(40+dx,69),
                       (59+dx,44),(49+dx,44),(57+dx,27)],white)
    elif name=='shield':
        pts=[(48,27),(65,34),(62,54),(56,63),(48,69),(40,63),(34,54),(31,34),(48,27)]
        a.line(pts,white,3)
        a.line([(48,35),(48,60)],(*rgb(color),255),2)
        a.line([(38,44),(58,44)],(*rgb(color),255),2)
    elif name=='wing':
        a.polygon([(48,62),(28,44),(25,31),(44,41),(48,52),(52,41),
                   (71,31),(68,44),(48,62)],white)
        a.line([(31,39),(40,47)],(*rgb(color),255),2)
        a.line([(65,39),(56,47)],(*rgb(color),255),2)
    elif name=='nova':
        pts=[]
        for i in range(16):
            ang=i*math.pi/8
            r=23 if i%2==0 else 9
            pts.append((48+math.sin(ang)*r,48-math.cos(ang)*r))
        a.polygon(pts,white)
        a.ellipse((44,44,52,52),(*rgb(color),255))


def tokens():
    for name,color in BONUS.items():
        a=Art(96,96)
        a.ellipse((12,12,84,84),(*rgb(color),180),3)
        a.glow(4)
        a.ellipse((15,15,81,81),(13,23,43,245))
        a.ellipse((16,16,80,80),(*rgb(color),255),2)
        a.ellipse((21,21,75,75),(*rgb(color),100),.7)
        # Small highlights support a consistent polished token material.
        a.line([(31,22),(40,19),(49,18)],(244,253,255,220),1.3)
        symbol(a,name,color)
        a.glow(1.1,.5)
        save(a.finish(),f'icons/bonus-{name}.png')
    frames=[]
    for f in range(12):
        a=Art(96,96)
        a.ellipse((9,9,87,87),(70,150,178,65),3)
        # Twelve states include full and empty; use manifest.remainingFraction.
        remaining=1-f/11
        pts=[]
        for i in range(241):
            ang=-math.pi/2+math.tau*remaining*i/240
            pts.append((48+36*math.cos(ang),48+36*math.sin(ang)))
        if f<11:
            a.line(pts,(119,236,255,245),3)
            a.glow(2)
            a.ellipse((pts[-1][0]-2,pts[-1][1]-2,pts[-1][0]+2,pts[-1][1]+2),(250,255,255,255))
        frames.append(a.finish())
    animation('timer-ring',frames,0,'icons',False,
              remainingFraction=[round(1-f/11,8) for f in range(12)])


def texture(variant,color):
    # Original 4x4 material atlas: panel metal, light alloy, accent, recess,
    # luminous accent, warm trim, vents and reactor. No stock textures.
    palette=[(52,69,89),(169,192,204),rgb(color),(12,21,33),
             tuple(min(255,int(v*.6+102)) for v in rgb(color)),(223,179,93),
             (33,46,60),(235,250,255)]
    im=Image.new('RGB',(1024,1024))
    d=ImageDraw.Draw(im)
    for tile in range(16):
        x=(tile%4)*256;y=(tile//4)*256
        base=palette[tile%8]
        d.rectangle((x,y,x+255,y+255),fill=base)
        # Panel edge chamfers and inset geometry, broad enough for mipmaps.
        light=tuple(min(255,v+22) for v in base)
        dark=tuple(max(0,v-21) for v in base)
        d.rounded_rectangle((x+16,y+16,x+240,y+240),radius=18,outline=dark,width=5)
        d.line([(x+28,y+34),(x+34,y+28),(x+219,y+28)],fill=light,width=3)
        if tile%8 in (0,1,2,6):
            for k in range(5):
                yy=y+146+k*13
                d.line([(x+49,yy),(x+113,yy)],fill=dark,width=4)
            d.line([(x+154,y+211),(x+154,y+113),(x+207,y+61)],fill=dark,width=3)
            d.line([(x+160,y+211),(x+160,y+116),(x+211,y+66)],fill=light,width=2)
            for px,py in [(31,31),(225,31),(31,225),(225,225)]:
                d.ellipse((x+px-3,y+py-3,x+px+3,y+py+3),fill=dark)
        if tile%8==4:
            for k in range(5):
                xx=x+48+k*32
                d.rounded_rectangle((xx,y+47,xx+14,y+210),radius=6,fill=light)
    save(im,f'textures/{variant}-basecolor.png')


def synth():
    sr=48000
    rng=np.random.default_rng(16016)
    for name,dur in [('laser-zap',.15),('laser-hum-loop',1),('plasma-shot',.2),('boss-alarm',1)]:
        t=np.arange(round(sr*dur))/sr
        if name=='laser-zap':
            phase=2*np.pi*(1700*t-4400*t*t)
            sig=(np.sin(phase)+.24*np.sin(2.03*phase))*np.exp(-t*27)
        elif name=='laser-hum-loop':
            # Every component and modulation completes an integer number of
            # cycles in one second. No envelope, silence, or crossfade seam.
            sig=(.48*np.sin(2*np.pi*120*t)+.24*np.sin(2*np.pi*240*t+
                 .25*np.sin(2*np.pi*3*t))+.12*np.sin(2*np.pi*480*t))
            sig*=.91+.09*np.cos(2*np.pi*4*t)
        elif name=='plasma-shot':
            phase=2*np.pi*(780*t-1150*t*t)
            noise=rng.normal(0,.06,len(t))
            sig=(np.sin(phase+.8*np.sin(2*np.pi*65*t))+.3*np.sin(phase*.5)+noise)*np.exp(-t*19)
        else:
            freq=540+85*np.sin(2*np.pi*2*t)
            phase=2*np.pi*np.cumsum(freq)/sr
            sig=(np.sin(phase)+.18*np.sin(2*phase))*(.6+.4*np.sin(2*np.pi*2*t)**2)
        if name!='laser-hum-loop':
            fade=min(480,len(t)//8)
            sig[:fade]*=np.linspace(0,1,fade)**2
            sig[-fade:]*=np.linspace(1,0,fade)**2
        # Quiet arcade sounds with ample mixing headroom.
        sig=sig/np.max(np.abs(sig))*(.21 if name=='laser-hum-loop' else .5)
        pcm=(sig*32767).round().astype('<i2')
        buf=io.BytesIO()
        with wave.open(buf,'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg','-v','error','-y','-i','pipe:0','-map_metadata','-1',
                        '-c:a','libopus','-b:a','48k',str(ROOT/f'audio/{name}.ogg')],
                       input=buf.getvalue(),check=True)


if __name__=='__main__':
    laser(); burst('muzzle-flash',4); burst('impact-spark',6,True)
    plasma(); tokens(); synth()
    names=['boss-01-scout','boss-02-heavy','boss-03-weaver','boss-04-splitter',
           'boss-05-carrier','boss-06-carrier-elite']
    for i,name in enumerate(names):
        texture(name,list(PLASMA.values())[min(i,4)] if i<5 else '#b1a5ff')
    (ROOT/'animations.json').write_text(json.dumps(dict(
        license='CC0-1.0', origin='top-left', order='left-to-right',
        alpha='straight/unassociated', colorSpace='sRGB', animations=ANIMS),indent=2)+'\n')
    print('Generated sprite sheets, individual frames, icons, six textures and four OGG sounds.')
