#!/usr/bin/env python3
"""Build the isolated Island armory. Python 3.10+, Pillow, NumPy, FFmpeg.

No network, samples, fonts, or files outside this package are needed. The
image-generation source is committed; all animation, particles and sound are
deterministic. --check validates shipped assets without regenerating them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SIZE, SCALE, RATE = 256, 3, 44100
BASE = "43b27dc235387e3cb737aee9558cdf9d5fd5a262"
INK = "#382039"
COLORS = {"slingshot": "#f7b54b", "cannon": "#ff9255", "bow": "#69c9ad",
          "water": "#51cfe6", "purse": "#e6a2f4"}
LABELS = {"slingshot": "קלע צבעוני", "cannon": "תותח כבד", "bow": "קשת נוצות",
          "water": "רובה מים", "purse": "ארנק מטבעות"}
COUNTS = {"slingshot": 6, "cannon": 8, "bow": 6, "water": 6, "purse": 6}
DURATIONS = {"slingshot": [90, 100, 140, 55, 70, 95],
             "cannon": [90, 70, 80, 55, 65, 85, 100, 115],
             "bow": [90, 100, 140, 50, 70, 100],
             "water": [80, 70, 80, 55, 65, 90],
             "purse": [90, 90, 120, 60, 90, 100]}
RELEASE = 3
DESCRIPTIONS = {
    "slingshot": "גומי נמתח · 6 פריימים · שלושה צבעים",
    "cannon": "פגז כבד · עשן ירי · 8 פריימים",
    "bow": "מיתר נמתח · חץ עץ עם נוצות טורקיז",
    "water": "לחיצת הדק · טיפות ושובל בועות",
    "purse": "ארנק קופץ · מטבעות זהב · צלצול משעשע",
}


class Art:
    """Supersampled particle/component compositor in 256px coordinates."""
    def __init__(self):
        self.im = Image.new("RGBA", (SIZE * SCALE,) * 2)
        self.d = ImageDraw.Draw(self.im)

    def ellipse(self, box, fill, outline=None, width=1):
        self.d.ellipse(tuple(round(v * SCALE) for v in box), fill,
                       outline, round(width * SCALE))

    def line(self, pts, fill, width=2):
        self.d.line([(round(x * SCALE), round(y * SCALE)) for x, y in pts],
                    fill, round(width * SCALE), joint="curve")

    def polygon(self, pts, fill, outline=None, width=1):
        self.d.polygon([(round(x * SCALE), round(y * SCALE)) for x, y in pts],
                       fill, outline, round(width * SCALE))

    def paste(self, im, box, rotation=0):
        x, y, w, h = box
        layer = im.resize((round(w * SCALE), round(h * SCALE)), Image.Resampling.LANCZOS)
        if rotation:
            layer = layer.rotate(rotation, Image.Resampling.BICUBIC, expand=True)
            x -= (layer.width / SCALE - w) / 2
            y -= (layer.height / SCALE - h) / 2
        self.im.alpha_composite(layer, (round(x * SCALE), round(y * SCALE)))

    def finish(self):
        return self.im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def component_sources():
    """Extract the six uniformly placed generated components, preserving alpha."""
    sheet = Image.open(ROOT / "source/components.webp").convert("RGBA")
    w, h = sheet.width // 2, sheet.height // 3
    parts = {}
    for i, key in enumerate([*COUNTS, "arrow"]):
        cell = sheet.crop((i % 2 * w, i // 2 * h, (i % 2 + 1) * w, (i // 2 + 1) * h))
        # Bounding-box measurement ignores subvisible export noise; pixel alpha is preserved.
        bounds = cell.getchannel("A").point(lambda a: 255 if a > 48 else 0).getbbox()
        x0, y0, x1, y1 = bounds
        parts[key] = cell.crop((max(0, x0 - 2), max(0, y0 - 2), min(w, x1 + 2), min(h, y1 + 2)))
    return parts


def ball(a, cx, cy, r, color):
    a.ellipse((cx-r, cy-r, cx+r, cy+r), color, INK, max(1, r*.07))
    a.ellipse((cx-r*.65, cy-r*.7, cx+r*.6, cy+r*.4), color)
    a.ellipse((cx-r*.5, cy-r*.62, cx-r*.02, cy-r*.27), (255, 255, 245, 220))
    a.line([(cx-r*.43, cy+r*.56), (cx+r*.35, cy+r*.72)], (255, 255, 255, 105), max(1, r*.06))


def coin(a, cx=128, cy=128, r=43, angle=0):
    rx = max(r*.22, abs(math.cos(angle))*r)
    a.ellipse((cx-rx, cy-r, cx+rx, cy+r), "#b66b25", INK, 3)
    inset = min(4, rx*.25)
    a.ellipse((cx-rx+inset, cy-r+inset, cx+rx-inset, cy+r-inset), "#f8c552", "#ffe9a2", min(3,r*.1))
    a.ellipse((cx-rx*.65, cy-r*.72, cx+rx*.65, cy+r*.72), None, "#c0802d", 2)
    a.line([(cx-rx*.45, cy-r*.38), (cx, cy-r*.58), (cx+rx*.45, cy-r*.38),
            (cx+rx*.45, cy+r*.38), (cx, cy+r*.58), (cx-rx*.45, cy+r*.38),
            (cx-rx*.45, cy-r*.38)], "#fff0ad", 3)
    a.line([(cx, cy-r*.28), (cx, cy+r*.28)], "#c0802d", max(2, rx*.1))


def droplet(a, cx, cy, r, color="#3bc4ea", angle=0):
    pts = [(cx+r*1.4, cy), (cx-r*.25, cy-r*.8), (cx-r*.9, cy-r*.5),
           (cx-r, cy+r*.2), (cx-r*.45, cy+r*.7), (cx+r*.3, cy+r*.6)]
    if angle:
        ca, sa = math.cos(angle), math.sin(angle)
        pts = [(cx+(x-cx)*ca-(y-cy)*sa, cy+(x-cx)*sa+(y-cy)*ca) for x,y in pts]
    a.polygon(pts, color, "#176e98", 2)
    a.ellipse((cx-r*.55, cy-r*.42, cx-r*.08, cy-r*.12), "#e9ffff")


def star(a, cx, cy, r, color, arms=5, inner=.43, rot=0):
    pts = []
    for i in range(arms*2):
        angle = i*math.pi/arms + rot
        radius = r if i % 2 == 0 else r*inner
        pts.append((cx+math.cos(angle)*radius, cy+math.sin(angle)*radius))
    a.polygon(pts, color, INK, 1.7)


def smoke(a, cx, cy, r, seed=7, warm=False):
    rng = np.random.default_rng(seed)
    for i in range(10):
        angle = i*2.4
        dist = r*(.12+.58*i/10)
        x, y = cx+math.cos(angle)*dist, cy+math.sin(angle)*dist
        rad = r*rng.uniform(.28,.45)
        color = (239-i*6, 226-i*5, 202-i*4, 210) if warm else (183+i*5, 200+i*4, 202+i*4, 195)
        a.ellipse((x-rad, y-rad, x+rad, y+rad), color)


def projectile(key, parts, variant=0):
    a = Art()
    if key == "slingshot":
        ball(a, 128, 128, 43, ["#ff6c91", "#4bd2dd", "#b48cff"][variant])
    elif key == "cannon":
        # A heavy, pointed steel shell with brass driving bands, pointing +X.
        a.ellipse((65, 83, 188, 173), "#34465c", INK, 4)
        a.polygon([(152,84),(199,99),(219,128),(199,157),(152,172)], "#64788d", INK, 4)
        a.polygon([(160,91),(198,107),(210,125),(161,113)], "#b0c7d0")
        a.polygon([(70,85),(89,84),(89,172),(70,171)], "#dda642", INK, 3)
        a.line([(74,93),(82,93),(82,162)], "#ffe198", 4)
        a.line([(100,99),(144,99)], "#9aaec2", 5)
        a.polygon([(46,101),(66,111),(66,145),(46,155)], "#d29b40", INK, 3)
    elif key == "bow":
        ar = parts["arrow"]
        a.paste(ar, (18, 97, 220, 220*ar.height/ar.width))
    elif key == "water":
        droplet(a,128,128,42)
        droplet(a,66,97,12, "#7de8f6")
        droplet(a,58,153,8, "#9ceef8")
    else:
        coin(a)
    return a.finish()


def weapon_frame(key, index, parts):
    a = Art()
    body = parts[key]
    recoil = [0, -1, -3, -15, -10, -5, -2, -1][index]
    if key == "slingshot":
        # Projected front/rear tips; the leather pocket pulls left and releases right.
        pocket = [(91,82),(64,92),(37,103),(181,68),(106,74),(89,80)][index]
        rear, front = (112,43), (197,43)
        a.line([rear,pocket], INK,8)
        a.line([rear,pocket], "#d17b47",4)
        a.paste(body, (91,22,128,210))
        a.line([front,pocket], INK,8)
        a.line([front,pocket], "#eea064",4)
        if index < RELEASE:
            a.ellipse((pocket[0]-9,pocket[1]-6,pocket[0]+9,pocket[1]+8), "#6b3d35",INK,2)
            ball(a,pocket[0],pocket[1]-4,10,"#ff6c91")
        else:
            a.line([(pocket[0]-7,pocket[1]),(pocket[0]+7,pocket[1])], "#6b3d35",7)
    elif key == "cannon":
        w=200; h=w*body.height/body.width
        a.paste(body,(30+recoil,220-h+([0,0,0,-3,-1,1,0,0][index]),w,h),[0,.3,.7,2,1,-.4,.2,-.1][index])
        if index in (3,4,5):
            smoke(a,222,100,15+(index-3)*4, 51+index)
            if index == 3:
                star(a,232,103,12,"#ffe6a1",4,.35)
    elif key == "bow":
        a.paste(body,(78,18,78,218))
        pull = [153,119,80,184,145,154][index]
        a.line([(147,29),(pull,126),(149,226)],INK,4)
        a.line([(147,29),(pull,126),(149,226)],"#fff0c7",1.8)
        if index < RELEASE:
            ar=parts["arrow"]
            a.paste(ar,(pull-18,114,100,100*ar.height/ar.width))
    elif key == "water":
        w=211*(1+[0,-.006,-.018,-.04,-.016,.003][index]); h=w*body.height/body.width
        a.paste(body,(23+recoil*.35,217-h,w,h),[0,.3,.6,1.8,.8,-.15][index])
        if index in (3,4):
            droplet(a,235,103,6+(index-3)*2)
            droplet(a,225,85,3)
    else:
        sx=[1,1.05,1.1,.92,.97,1.01][index]
        sy=[1,.93,.83,1.05,1.01,.99][index]
        w,h=188*sx,181*sy
        a.paste(body,(128-w/2,234-h,w,h),[0,-2,-5,7,3,-1][index])
        if index in (2,3,4):
            coin(a,170+(index-2)*24,64-(index-2)*7,10+(index-2),index*.4)
            star(a,209,91,7,"#ffe3a0",4,.27)
    return a.finish()


def trail(key):
    a = Art()
    if key == "slingshot":
        for i,c in enumerate(["#ffd985","#ffaac6","#9eeaf2","#cdb7fc"]):
            x=48+i*43; ball(a,x,128+math.sin(i*2)*6,4+i*2,c)
        a.line([(45,153),(87,150),(132,145),(182,144)],(255,235,186,155),3)
    elif key == "cannon":
        for i in range(7):
            smoke(a,41+i*25,128+math.sin(i*2)*9,10+i*3,60+i)
    elif key == "bow":
        for i in range(4):
            a.line([(27+i*8,105+i*13),(189+i*7,110+i*11)],(144,228,206,100+i*35),2+i%2)
        star(a,212,124,6,"#f8eac0",4,.2)
    elif key == "water":
        for i in range(7):
            droplet(a,34+i*28,128+math.sin(i*1.6)*13,3+i*.95,"#8eeaf5")
        for x,y in [(82,92),(143,160),(190,96)]:
            a.ellipse((x-5,y-5,x+5,y+5),None,"#b8f7fb",1.8)
    else:
        for i in range(4):
            coin(a,47+i*52,128+math.sin(i*2)*10,10+i*2,i*.65)
            star(a,40+i*52,99-i%2*4,5,"#fff0bd",4,.25)
    return a.finish()


def impact(key, variant):
    """Four different silhouettes per weapon: burst, ring, scatter, directional."""
    a=Art(); rng=np.random.default_rng(500+list(COUNTS).index(key)*20+variant)
    tint=COLORS[key]; n=[9,12,7,10][variant]; phase=variant*.47
    if key == "cannon":
        smoke(a,128,137,72,81+variant,warm=True)
        star(a,128,128,[67,54,72,60][variant],"#ee693d",7+variant,.62,phase)
        star(a,128,126,43,"#ffb84f",7,.54,phase+.2)
        star(a,128,123,23,"#fff0bb",5,.6,phase+.4)
    elif key == "water":
        a.ellipse((80,97,179,164),(52,183,222,175),"#2fa4c8",3)
        star(a,128,130,48,"#7ee4f3",8,.48,phase)
        a.ellipse((109,111,143,140),"#cfffff")
    elif key == "purse":
        star(a,128,128,64,"#f8d571",7,.25,phase)
        for i in range(4):
            angle=phase+i*1.7
            coin(a,128+math.cos(angle)*43,128+math.sin(angle)*40,16+i*2,i+phase)
    elif key == "bow":
        star(a,128,128,38,"#e9bd75",7,.4,phase)
        a.ellipse((111,110,143,143),"#71513d",INK,2)
        for i in range(5):
            angle=i*1.3+phase
            x,y=128+math.cos(angle)*50,128+math.sin(angle)*50
            a.polygon([(x-4,y-9),(x+9,y-3),(x+3,y+9),(x-8,y+1)],"#b9824d",INK,1.5)
    else:
        star(a,128,128,51,"#ffe6af",8,.45,phase)
        for i,c in enumerate(["#ff80a4","#62dce3","#b79af5"]):
            angle=i*2.1+phase
            ball(a,128+math.cos(angle)*36,128+math.sin(angle)*31,11+i*2,c)
    if variant == 1:
        a.ellipse((52,52,204,204),None,tint,5)
        a.ellipse((65,65,191,191),None,(255,255,235,180),2)
    for i in range(n):
        angle=i*math.tau/n+phase; dist=rng.uniform(65,91)
        if variant == 3:
            dist*=.65+.4*math.cos(angle)
        x,y=128+math.cos(angle)*dist,128+math.sin(angle)*dist
        if key == "water":
            droplet(a,x,y,rng.uniform(4,9),"#7de9f5",angle)
        elif key == "purse" or (key == "slingshot" and i%3==0):
            star(a,x,y,rng.uniform(4,8),"#fff1b9",4,.24,angle)
        elif key == "cannon":
            a.line([(x,y),(x+math.cos(angle)*12,y+math.sin(angle)*12)],"#ffd386",4)
        else:
            ball(a,x,y,rng.uniform(3,6),tint)
    return a.finish()


def muzzle(key):
    a=Art()
    if key == "cannon":
        smoke(a,123,128,75,321)
        star(a,96,126,37,"#ffad50",7,.4)
        star(a,94,126,20,"#fff3c1",5,.46)
    elif key == "water":
        for i in range(8):
            droplet(a,59+i*19,128+math.sin(i*2.4)*17,4+i*.7)
    elif key == "purse":
        for i in range(4):
            coin(a,71+i*38,135-math.sin(i*.9)*42,12,i*.6)
            star(a,69+i*36,80,7,"#fff0bd",4,.25)
    else:
        for i in range(6):
            a.line([(76+i*13,82+i%2*66),(151+i*9,85+i%2*60)],(255,232,177,210),3)
        star(a,154,126,23,"#fff2c6",4,.23)
    return a.finish()


def lp(signal, hz):
    """One-pole low-pass with a zero initial condition (no external DSP dependency)."""
    alpha=1-math.exp(-math.tau*hz/RATE)
    out=np.empty_like(signal); previous=0.
    for i,v in enumerate(signal):
        previous+=alpha*(v-previous);out[i]=previous
    return out


def tone(t, start, end, decay, amp=1):
    # Integral of a linear frequency ramp; avoids discontinuous pitch jumps.
    return amp*np.sin(math.tau*(start*t+(end-start)*t*t/(2*max(t[-1],1/RATE))))*np.exp(-t/decay)


def synth(key, event, variant=0):
    firing=event == "fire"
    duration={"slingshot":.34,"cannon":.95,"bow":.31,"water":.44,"purse":.58}[key]
    if not firing: duration*=.78+variant*.055
    t=np.arange(round(RATE*duration))/RATE
    rng=np.random.default_rng(7300+list(COUNTS).index(key)*100+variant*7+(0 if firing else 53))
    white=rng.normal(0,1,len(t)); pitch=1+variant*.065
    if key == "slingshot":
        f=(370 if firing else 240)*pitch
        phase=math.tau*(f*t+f*.035*(1-np.exp(-t/.035)))
        signal=(np.sin(phase)+.3*np.sin(phase*2.02))*np.exp(-t/.074)
        signal+=.25*(white-lp(white,1500))*np.exp(-t/.012)
        if not firing: signal+=tone(t,165*pitch,70,.1,.5)
    elif key == "cannon":
        signal=2.2*lp(white,720 if firing else 1000)*np.exp(-t/.17)
        signal+=tone(t,105*pitch,32,.18,.9)+tone(t,56,29,.27,.5)
        signal+=.14*(white-lp(white,2500))*np.exp(-t/.016)
        if not firing: signal+=.22*lp(white,1700)*np.exp(-t/.3)
    elif key == "bow":
        signal=tone(t,680*pitch,480,.045,.85)+tone(t,1360*pitch,800,.023,.28)
        signal+=.3*(white-lp(white,1800))*np.exp(-t/.055)
        if not firing:
            signal=tone(t,195*pitch,115,.045,.8)+.8*lp(white,1250)*np.exp(-t/.026)
    elif key == "water":
        signal=.75*(lp(white,6500)-lp(white,650))*np.exp(-t/.075)
        for i in range(5):
            offset=.014+i*.049; s=np.maximum(t-offset,0)
            signal+=.28*np.sin(math.tau*(1100*pitch*s+130*(1-np.exp(-s/.02))))*np.exp(-s/.024)*(t>=offset)
        if not firing: signal+=tone(t,285*pitch,100,.05,.4)
    else:
        signal=np.zeros_like(t)
        # Inharmonic metal partials plus a comic rising "bloop" on purse release.
        for i in range(3 if firing else 2):
            offset=i*.062;s=np.maximum(t-offset,0)
            for ratio,amp,decay in [(1,.42,.09),(2.71,.22,.055),(4.09,.11,.035)]:
                signal+=amp*np.sin(math.tau*(1000+i*170)*pitch*ratio*s)*np.exp(-s/decay)*(t>=offset)
        if firing: signal+=tone(t,170,920,.13,.3)
    signal-=signal.mean()
    fade=min(round(RATE*.006),len(signal)//4)
    signal[:fade]*=np.sin(np.linspace(0,math.pi/2,fade))**2
    # At least 12ms of exact silence at the end, to avoid clicks between repeats.
    tail=round(RATE*.025);signal[-tail:]*=np.linspace(1,0,tail)**2
    signal[-round(RATE*.012):]=0
    signal*=.70/max(float(np.max(np.abs(signal))),1e-12)
    return np.round(signal*32767).astype("<i2")


def encode_audio(key,event,variant=0):
    pcm=synth(key,event,variant)
    suffix=event if event == "fire" else f"impact-{variant+1:02}"
    relative=f"audio/{key}/{suffix}"
    (ROOT / relative).parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="island-armory-") as tmp:
        wav=Path(tmp)/"original.wav"
        with wave.open(str(wav),"wb") as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm.tobytes())
        for ext,codec in [("ogg",["-c:a","libvorbis","-q:a","2"]),
                          ("mp3",["-c:a","libmp3lame","-b:a","48k","-write_xing","1"])]:
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(wav),
                            "-map_metadata","-1","-fflags","+bitexact",*codec,str(ROOT/f"{relative}.{ext}")],check=True)
    return {"ogg":f"{relative}.ogg","mp3":f"{relative}.mp3","durationMs":round(len(pcm)*1000/RATE),
            "sampleRate":RATE,"channels":1,"sourcePeakDbfs":round(20*math.log10(.7),2),
            "seed":7300+list(COUNTS).index(key)*100+variant*7+(0 if event=="fire" else 53)}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    parts=component_sources();frames={};weapons=[];atlases=[]
    for key,count in COUNTS.items():
        images=[]
        fire=[]
        for i in range(count):
            name=f"{key}/fire-{i:02}";fire.append(name);images.append((name,weapon_frame(key,i,parts)))
        projectiles=[]
        for v in range(3 if key=="slingshot" else 1):
            name=f"{key}/projectile-{v+1:02}";projectiles.append(name);images.append((name,projectile(key,parts,v)))
        trail_key=f"{key}/trail";images.append((trail_key,trail(key)))
        impacts=[]
        for v in range(4):
            name=f"{key}/impact-{v+1:02}";images.append((name,impact(key,v)))
            impacts.append({"frame":name,"audio":encode_audio(key,"impact",v),"durationMs":380 if key=="cannon" else 290})
        muzzle_key=f"{key}/muzzle";images.append((muzzle_key,muzzle(key)))
        assert len(images)<=16
        atlas=Image.new("RGBA",(1024,1024));atlas_path=f"atlases/{key}.png"
        for i,(name,im) in enumerate(images):
            file=f"sprites/{name}.png";path=ROOT/file;path.parent.mkdir(parents=True,exist_ok=True)
            im.save(path,optimize=True,compress_level=9)
            x,y=i%4*SIZE,i//4*SIZE
            atlas.paste(im,(x,y))  # no mask: preserve straight-alpha RGB and edge pixels exactly
            bbox=im.getchannel("A").getbbox()
            frames[name]={"file":file,"atlas":atlas_path,"rect":{"x":x,"y":y,"w":SIZE,"h":SIZE},
                          "sourceSize":{"w":SIZE,"h":SIZE},"pivot":{"x":128,"y":128},
                          "contentBounds":{"x":bbox[0],"y":bbox[1],"w":bbox[2]-bbox[0],"h":bbox[3]-bbox[1]}}
        path=ROOT/atlas_path;path.parent.mkdir(exist_ok=True)
        atlas.save(path,optimize=True,compress_level=9)
        atlases.append({"file":atlas_path,"width":1024,"height":1024,"cells":len(images),"bytes":path.stat().st_size})
        muzzle_pos={"slingshot":[191,70],"cannon":[230,100],"bow":[190,126],"water":[235,103],"purse":[205,62]}[key]
        weapons.append({"id":key,"nameHe":LABELS[key],"descriptionHe":DESCRIPTIONS[key],"accent":COLORS[key],
                        "atlas":atlas_path,"weapon":fire[0],
                        "fire":{"frames":fire,"durationsMs":DURATIONS[key],"releaseFrame":RELEASE,
                                "releaseAtMs":sum(DURATIONS[key][:RELEASE]),"loop":False},
                        "projectiles":projectiles,"trail":trail_key,"impacts":impacts,
                        "muzzle":{"frame":muzzle_key,"position":muzzle_pos,"durationMs":210 if key=="cannon" else 120},
                        "audio":{"fire":encode_audio(key,"fire")},
                        "preview":{"flightMs":760 if key=="cannon" else 630,"arcPx":48 if key=="cannon" else 25,
                                   "weaponSize":164,"projectileSize":60 if key=="cannon" else 48}})
    manifest={"schemaVersion":1,"id":"slingshot-cannon-v1","created":"2026-11-16",
              "repository":"roynaor-work/Bakasun","branch":"codex/slingshot-cannon-v1","baseCommit":BASE,
              "runtimeIntegration":"not-connected","license":"CC0-1.0 assets; MIT source code",
              "limits":{"spritePixels":256,"atlasPixels":1024,"pngBytes":600000,"audioFileBytes":60000},
              "coordinates":{"origin":"top-left","forward":"+X","pixelsPerFrame":256,
                             "alpha":"straight/unassociated","colorSpace":"sRGB","trimmed":False,
                             "paddingPx":8,"sampling":"linear, clamp-to-edge, no mipmaps; sample texel centers",
                             "projectileRotation":"0 radians points right; rotate projectile and trail to trajectory tangent"},
              "preview":{"file":"preview.html","viewport":{"width":844,"height":390}},
              "weapons":weapons,"atlases":atlases,"frames":frames,
              "provenance":{"visualComponents":"source/components.webp; original image_gen generation and transparent cleanup",
                            "effects":"Original deterministic geometry and compositing in synthesize.py",
                            "audio":"Original seeded additive/subtractive synthesis in synthesize.py; no sampled audio",
                            "details":"source/PROVENANCE.json"},
              "files":[]}
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and path.suffix in (".png",".ogg",".mp3",".webp") and "verification" not in path.parts:
            manifest["files"].append({"file":path.relative_to(ROOT).as_posix(),"bytes":path.stat().st_size,"sha256":digest(path)})
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Built {len(frames)} sprites, {len(atlases)} atlases, 50 encoded sounds.")


def check():
    m=json.loads((ROOT/"manifest.json").read_text());errors=[];audio_stats=[]
    def require(value,message):
        if not value:errors.append(message)
    require(len(m["weapons"])==5,"Expected five weapons")
    require(len(m["frames"])==69,"Expected 69 sprite frames")
    records={r["file"]:r for r in m["files"]}
    actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p.suffix in (".png",".ogg",".mp3",".webp") and "verification" not in p.parts}
    require(actual==set(records),"Manifest media inventory mismatch")
    for rel,r in records.items():
        path=ROOT/rel
        require(path.is_file(),f"Missing {rel}")
        if not path.is_file():continue
        require(path.stat().st_size==r["bytes"],f"Size mismatch: {rel}")
        require(digest(path)==r["sha256"],f"Hash mismatch: {rel}")
        if path.suffix==".png":
            im=Image.open(path)
            expected=(1024,1024) if rel.startswith("atlases/") else (256,256)
            require(im.size==expected and im.mode=="RGBA",f"PNG format: {rel}")
            require(path.stat().st_size<=600000,f"PNG budget: {rel}")
            require(im.getchannel("A").getextrema()[0]==0,f"No transparent pixels: {rel}")
        if path.suffix in (".ogg",".mp3"):
            require(path.stat().st_size<=60000,f"Audio budget: {rel}")
            decoded=subprocess.run(["ffmpeg","-v","error","-i",str(path),"-f","f32le","-ac","1","-ar",str(RATE),"pipe:1"],check=True,capture_output=True)
            pcm=np.frombuffer(decoded.stdout,dtype="<f4")
            probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-of","json",str(path)]))["streams"][0]
            require(probe["channels"]==1 and int(probe["sample_rate"])==RATE,f"Audio channel/rate: {rel}")
            peak=float(np.max(np.abs(pcm)));rms=float(np.sqrt(np.mean(pcm**2)))
            require(.05<peak<.98 and rms>.005,f"Audio silence/clipping: {rel}")
            require(abs(float(np.mean(pcm)))<.015,f"Audio DC offset: {rel}")
            require(len(pcm)/RATE<1.2,f"Audio duration: {rel}")
            audio_stats.append({"file":rel,"bytes":path.stat().st_size,"durationMs":round(len(pcm)*1000/RATE),
                                "decodedPeakDbfs":round(20*math.log10(peak),2),"rmsDbfs":round(20*math.log10(rms),2),
                                "codec":probe["codec_name"],"sampleRate":int(probe["sample_rate"]),"channels":probe["channels"]})
    atlases={a["file"]:Image.open(ROOT/a["file"]) for a in m["atlases"]}
    for name,f in m["frames"].items():
        r=f["rect"];im=Image.open(ROOT/f["file"])
        cell=atlases[f["atlas"]].crop((r["x"],r["y"],r["x"]+r["w"],r["y"]+r["h"]))
        require(im.tobytes()==cell.tobytes(),f"Atlas mismatch: {name}")
        b=im.getchannel("A").point(lambda a:255 if a>2 else 0).getbbox()
        require(b and min(b[0],b[1],256-b[2],256-b[3])>=8,f"Insufficient sprite padding: {name}: {b}")
    for weapon in m["weapons"]:
        key=weapon["id"];fire=weapon["fire"]
        require(len(fire["frames"])==COUNTS[key] and len(fire["durationsMs"])==COUNTS[key],f"Fire count: {key}")
        require(len(weapon["impacts"])==4,f"Impact count: {key}")
        require(len(weapon["projectiles"])==(3 if key=="slingshot" else 1),f"Projectile variants: {key}")
        require(len({records[m["frames"][n]["file"]]["sha256"] for n in fire["frames"]})==COUNTS[key],f"Duplicate firing frames: {key}")
        for ref in fire["frames"]+weapon["projectiles"]+[weapon["trail"],weapon["muzzle"]["frame"]]+[v["frame"] for v in weapon["impacts"]]:
            require(ref in m["frames"],f"Missing sprite reference: {ref}")
        require(fire["releaseAtMs"]==sum(fire["durationsMs"][:fire["releaseFrame"]]),f"Release timing: {key}")
        for clip in [weapon["audio"]["fire"]]+[v["audio"] for v in weapon["impacts"]]:
            for ext in ("ogg","mp3"):require(clip[ext] in records,f"Missing audio reference: {key}/{ext}")
    require(len(audio_stats)==50,"Expected 50 audio encodings")
    require(len({records[a["file"]]["sha256"] for a in audio_stats})==50,"Duplicate sound files")
    result={"passed":not errors,"spriteCount":len(m["frames"]),"atlasCount":len(m["atlases"]),
            "audioCount":len(audio_stats),"mediaBytes":sum(v["bytes"] for v in records.values()),
            "largestPngBytes":max(v["bytes"] for k,v in records.items() if k.endswith(".png")),
            "largestAudioBytes":max(v["bytes"] for k,v in records.items() if k.endswith((".ogg",".mp3"))),
            "errors":errors,"audio":audio_stats}
    (ROOT/"verification").mkdir(exist_ok=True)
    (ROOT/"verification/assets.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({k:v for k,v in result.items() if k!="audio"},ensure_ascii=False,indent=2))
    if errors:raise SystemExit(1)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check",action="store_true",help="validate existing delivery, including codec decode")
    args=parser.parse_args()
    if not args.check:build()
    check()
