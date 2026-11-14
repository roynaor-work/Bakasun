#!/usr/bin/env python3
"""Rebuild original, seeded Vulcan VFX and sound; never writes outside this folder.

Python 3.10+, Pillow, NumPy, SciPy; ffmpeg with libvorbis and libmp3lame.
  python3 synthesize.py                 # assets, manifest, measurable verification
  python3 synthesize.py --verify-only   # inspect shipped files without rebuilding
No recordings, downloaded samples, network access, or existing game edits.
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
from PIL import Image, ImageDraw, ImageFilter
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent
SR = 44100
TAU = math.tau
SEED = 231114
ATLAS_LIMIT = 600_000
AUDIO_LIMIT = 80_000
BASE_COMMIT = "19d9cdc5e3718236df5a2fc4d8b8c26c72007575"  # v23: independent fire controls


def dump(name, value):
    (ROOT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class Paint:
    """Author at 128 logical pixels; 4x supersampling preserves very small cores."""
    def __init__(self, size=128):
        self.size = size
        self.im = Image.new("RGBA", (size * 4, size * 4))

    def layer(self, callback, blur=0):
        layer = Image.new("RGBA", self.im.size)
        d = ImageDraw.Draw(layer)
        callback(d)
        if blur:
            layer = layer.filter(ImageFilter.GaussianBlur(blur * 4))
        self.im = Image.alpha_composite(self.im, layer)

    def ellipse(self, box, color, blur=0):
        self.layer(lambda d: d.ellipse(tuple(v * 4 for v in box), fill=color), blur)

    def line(self, pts, color, width=1, blur=0):
        self.layer(lambda d: d.line([(x * 4, y * 4) for x, y in pts], fill=color,
                                   width=max(1, round(width * 4)), joint="curve"), blur)

    def poly(self, pts, color, blur=0):
        self.layer(lambda d: d.polygon([(x * 4, y * 4) for x, y in pts], fill=color), blur)

    def arc(self, box, start, end, color, width=2, blur=0):
        self.layer(lambda d: d.arc(tuple(v * 4 for v in box), start=start, end=end,
                                  fill=color, width=max(1, round(width * 4))), blur)

    def finish(self, size):
        im = self.im.resize((size, size), Image.Resampling.LANCZOS)
        a = np.asarray(im).copy()
        # Two-pixel atlas gutters at 512; no edge truncation and no hidden matte.
        a[:2] = a[-2:] = 0
        a[:, :2] = a[:, -2:] = 0
        a[a[:, :, 3] == 0, :3] = 0
        return Image.fromarray(a)


def plasma(variant):
    p = Paint()
    width, length = [(5.2, 23), (8.2, 34), (11.2, 45)][variant]
    cx, cy = 64, 64
    p.ellipse((cx-width*2.1, cy-length*1.08, cx+width*2.1, cy+length*1.08), (255, 70, 8, 115), 5)
    p.poly([(cx, cy-length), (cx+width*.7, cy-length*.74), (cx+width, cy-length*.36),
            (cx+width*.7, cy+length*.5), (cx, cy+length), (cx-width*.7, cy+length*.5),
            (cx-width, cy-length*.36), (cx-width*.7, cy-length*.74)], (255, 122, 12, 235), .6)
    p.ellipse((cx-width*.6, cy-length*.83, cx+width*.6, cy+length*.47), (255, 213, 59, 255))
    p.ellipse((cx-width*.23, cy-length*.65, cx+width*.23, cy+length*.25), (255, 251, 209, 255))
    p.line([(cx, cy+length*.25), (cx, cy+length*.8)], (255, 185, 23, 200), 1.3)
    for side in [-1, 1]:
        p.line([(cx+side*(width+4), cy-8), (cx+side*(width+3), cy+12)], (255, 156, 35, 145), .7)
    return p


def muzzle(frame):
    p = Paint()
    phase = frame * TAU / 8
    p.ellipse((26, 26, 102, 102), (255, 70, 5, 65), 7)
    # Six spiral vanes advance 45 degrees per frame. Every frame is distinct.
    for k in range(6):
        a = phase + k * TAU / 6
        def xy(r, delta=0):
            return (64 + math.cos(a+delta)*r, 64 + math.sin(a+delta)*r)
        r = 37 + 6*math.sin(phase+k*1.7)
        pts = [xy(10, -.18), xy(r, -.25), xy(r*.77, .03), xy(16, .43)]
        p.poly(pts, (255, 106+12*k, 8, 175), 1.4)
        p.poly([xy(9, -.04), xy(r*.85, -.2), xy(17, .19)], (255, 218, 70, 248))
    p.ellipse((49, 49, 79, 79), (255, 181, 28, 255), 1)
    p.ellipse((57, 57, 71, 71), (255, 252, 218, 255))
    p.arc((42, 42, 86, 86), frame*45, frame*45+210, (255, 237, 126, 210), 1.4)
    return p


def heat(state):
    p = Paint()
    colors = [(107, 223, 193), (255, 188, 50), (255, 103, 23), (255, 65, 36)]
    color = colors[state]
    fills = [2, 10, 16, 18]
    # 300 degree open-bottom ring; ticks and lock icon also carry state without color.
    p.arc((15, 15, 113, 113), 120, 420, (35, 57, 72, 230), 5)
    for i in range(18):
        a = 120 + i*300/18
        lit = i < fills[state]
        c = (*color, 255) if lit else (66, 89, 103, 160)
        if lit:
            p.arc((15, 15, 113, 113), a+1, a+13, (*color, 115), 6, 2.6)
        p.arc((15, 15, 113, 113), a+1, a+13, c, 3.2)
    if state >= 2:
        for i in range(3):
            p.line([(54+i*10, 8), (58+i*10, 4)], (*color, 255), 2)
    if state == 3:
        p.arc((56, 93, 72, 111), 180, 360, (*color, 255), 2.6)
        p.poly([(54, 102), (74, 102), (74, 115), (54, 115)], (*color, 255))
        p.line([(64, 106), (64, 111)], (30, 16, 15, 255), 2)
    else:
        # One / two / three white bars remain recognizable at small scale.
        for i in range(state+1):
            x = 64 + (i-state/2)*7
            p.line([(x, 105), (x, 111)], (*color, 255), 2)
    return p


def steam(frame):
    p = Paint()
    u = frame / 5
    rng = np.random.default_rng(SEED+40)
    for side in [-1, 1]:
        for i in range(9):
            seed = rng.random(3)
            travel = 6 + 29*u + i*2
            x = 64 + side*(10+travel+seed[0]*7)
            y = 85 - 28*u - i*3 + seed[1]*9
            r = 2.5 + u*8 + seed[2]*3
            alpha = int((1-u*.9)*(82-i*4))
            p.ellipse((x-r, y-r*.8, x+r, y+r*.8), (180, 224, 230, alpha), 1.8+u*2)
            if frame < 4:
                p.line([(64+side*13, 85), (x, y)], (216, 244, 241, int(100*(1-u))), 1.3, 1)
    if frame == 0:
        p.arc((37, 63, 91, 102), 190, 350, (212, 249, 244, 180), 1.2)
    return p


def impact(variant, frame):
    p = Paint()
    u = frame / 3
    rng = np.random.default_rng(SEED+80+variant)
    p.ellipse((37-u*15, 37-u*15, 91+u*15, 91+u*15), (255, 106, 10, int(100*(1-u*.9))), 5)
    # Four authored silhouettes: fan, crown, diagonal fracture, circular shatter.
    n = [7, 10, 6, 12][variant]
    for i in range(n):
        a = i*TAU/n + variant*.51 + rng.uniform(-.22, .22)
        r = (14+u*29) * rng.uniform(.75, 1.2)
        if variant == 0:
            a = -math.pi*.94 + i*math.pi*.88/(n-1)
        if variant == 2:
            a = math.pi/4 + (i%2)*math.pi + rng.uniform(-.35,.35)
        x, y = 64+math.cos(a)*r, 64+math.sin(a)*r
        xi, yi = 64+math.cos(a)*r*.5, 64+math.sin(a)*r*.5
        p.line([(xi, yi), (x, y)], (255, 158, 29, int(255*(1-u*.75))), 2.8-u*1.8, .4)
        p.line([(x-math.cos(a)*4, y-math.sin(a)*4), (x, y)], (255, 245, 165, int(255*(1-u*.8))), 1.3)
    if frame < 3:
        r = 11*(1-u)+3
        p.ellipse((64-r,64-r,64+r,64+r), (255, 238, 151, int(255*(1-u*.6))), .7)
        p.ellipse((60,60,68,68), (255, 255, 229, int(255*(1-u))), .3)
    if variant in (1, 3):
        r=15+u*27
        p.arc((64-r,64-r,64+r,64+r), 10+variant*15, 325, (255, 174, 58, int(200*(1-u*.9))), 1.5-u*.7)
    return p


def make_atlases():
    specs = [
        ("plasma", 2, 256, [plasma(i) for i in range(3)], ["small", "medium", "large"], 0, False),
        ("muzzle", 4, 128, [muzzle(i) for i in range(8)], [f"spin-{i}" for i in range(8)], 40, True),
        ("heat", 2, 256, [heat(i) for i in range(4)], ["cold", "hot", "near-lock", "locked"], 0, False),
        ("steam", 4, 128, [steam(i) for i in range(6)], [f"vent-{i}" for i in range(6)], 1000/12, False),
        ("impact", 4, 128, [impact(v,f) for v in range(4) for f in range(4)],
         [f"{v}-{f}" for v in ("fan", "crown", "fracture", "shatter") for f in range(4)], 45, False),
    ]
    atlases = {}
    for name, columns, cell, painters, labels, duration, loop in specs:
        variants = {}
        for resolution in (256, 512):
            scale = resolution/512
            frame_size = round(cell*scale)
            sheet = Image.new("RGBA", (resolution, resolution))
            frames = []
            for i, painter in enumerate(painters):
                x, y = (i%columns)*frame_size, (i//columns)*frame_size
                sheet.paste(painter.finish(frame_size), (x,y))
                frames.append({"name":labels[i], "rect":[x,y,frame_size,frame_size],
                               "pivot":[.5,.5], "durationMs":duration})
            path = f"{name}-{resolution}.png"
            sheet.save(ROOT/path, optimize=True, compress_level=9)
            variants[str(resolution)] = {"path":path, "size":[resolution,resolution], "frames":frames}
        atlases[name] = {"loop":loop, "blend":"source-over" if name in ("heat","steam") else "lighter",
                         "alpha":"straight", "variants":variants}
    atlases["impact"]["animations"] = {v:list(range(i*4,i*4+4)) for i,v in enumerate(("fan","crown","fracture","shatter"))}
    return atlases


def bandlimit(x, cutoff=2400, stop=3200):
    f = np.fft.rfftfreq(len(x), 1/SR)
    gain = np.ones_like(f)
    knee = (f>cutoff)&(f<stop)
    gain[knee] = .5+.5*np.cos(math.pi*(f[knee]-cutoff)/(stop-cutoff))
    gain[f>=stop] = 0
    out = np.fft.irfft(np.fft.rfft(x)*gain, n=len(x))
    return out-out.mean()


def noise(n, seed, cutoff=1900):
    return bandlimit(np.random.default_rng(seed).normal(0,1,n), cutoff, cutoff+700)


def edge_fade(x, ms=12):
    n = min(round(SR*ms/1000),len(x)//2)
    fade = np.sin(np.linspace(0,math.pi/2,n))**2
    x[:n] *= fade
    x[-n:] *= fade[::-1]
    return x


def master(x, rms_db=-13, peak_db=-2):
    x = x * (10**(rms_db/20) / max(1e-9,np.sqrt(np.mean(x*x))))
    x *= min(1,10**(peak_db/20)/max(1e-9,np.max(np.abs(x))))
    return x


def sources():
    t = np.arange(round(1.5*SR))/SR
    # 15 gameplay ticks / 45 barrel pulses. All oscillators and noise are periodic
    # across 1.5 s; FFT filtering is circular, so the boundary is an ordinary sample.
    phase = (t*30)%1
    pulse = np.exp(-phase*10)*(1-np.exp(-phase*100))
    body = np.sin(TAU*100*t)*.48+np.sin(TAU*180*t)*.22+np.sin(TAU*300*t)*.1
    loop = bandlimit((.24+.76*pulse)*body + noise(len(t),SEED)*(.08+.6*pulse))
    # Round the crest before the final low-pass, retaining a thick sustained body.
    loop = master(bandlimit(np.tanh(loop*3.8)),-12,-2.4)
    # Rotate to a near-flat zero crossing, reducing lossy-codec seam sensitivity.
    score = np.abs(loop) + np.abs(np.roll(loop,-1)-loop)*4
    loop = np.roll(loop,-int(np.argmin(score)))
    # A tiny quiet valley is codec-safe even after lossy transform quantization.
    # 128 silent samples + 10 ms raised-cosine shoulders, inside the 1.5 s file.
    guard, shoulder = 128, 441
    ramp = np.sin(np.linspace(0,math.pi/2,shoulder))**2
    loop[:guard] = loop[-guard:] = 0
    loop[guard:guard+shoulder] *= ramp
    loop[-guard-shoulder:-guard] *= ramp[::-1]
    result = {"fire-loop":(loop,True,"Heavy rotary plasma fire; 15 ticks, 45 low barrel pulses",1.0)}
    for up in (True,False):
        t=np.arange(round(.4*SR))/SR
        u=t/.4
        freq=65+170*(u if up else 1-u)**1.35
        ph=TAU*np.cumsum(freq)/SR
        rotor=np.sin(ph)*.48+np.sin(ph*2)*.15+np.sin(ph*3)*.04
        rotor+=noise(len(t),SEED+(1 if up else 2),1400)*.12
        rotor*= (.2+.8*u) if up else (1-u)**.7
        x=edge_fade(master(bandlimit(rotor),-16,-3))
        result["spin-up" if up else "spin-down"]=(x,False,"Rotor RPM rises" if up else "Rotor RPM falls",.85)
    t=np.arange(round(.48*SR))/SR
    u=t/.48
    ph=TAU*(210*t-100*t*t)
    over=(np.sin(ph)*.6+np.sin(ph*1.5)*.16)*np.exp(-u*4)
    over+=noise(len(t),SEED+3,1100)*np.exp(-u*14)*.4
    result["overheat"]=(edge_fade(master(bandlimit(over),-15,-3)),False,"Dull thermal clutch / lock, no piercing alarm",.9)
    t=np.arange(round(.72*SR))/SR
    # A small mechanical shutoff, then an air release. No digital discontinuity.
    u=t/.72
    air=noise(len(t),SEED+4,1600)
    vent=np.clip((t-.07)/.035,0,1)*np.exp(-np.maximum(0,t-.1)*5)
    shut=np.sin(TAU*135*t)*np.exp(-t*45)
    cool=air*vent*.7+shut*.4
    result["cooldown"]=(edge_fade(master(bandlimit(cool),-16,-3)),False,"Mechanical shutoff followed by a soft compressed-air burst",.8)
    return result


def make_audio():
    result={}
    for name,(x,loop,description,gain) in sources().items():
        with tempfile.TemporaryDirectory(prefix=".vulcan-",dir=ROOT) as temp:
            source=Path(temp)/"source.wav"
            with wave.open(str(source),"wb") as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR)
                w.writeframes(np.round(x*32767).astype("<i2").tobytes())
            for extension,codec in (("ogg",["-c:a","libvorbis","-q:a","4","-avoid_negative_ts","make_zero"]),
                                    ("mp3",["-c:a","libmp3lame","-b:a","96k","-write_xing","1"])):
                subprocess.run(["ffmpeg","-v","error","-y","-i",str(source),"-map_metadata","-1",
                                *codec,"-fflags","+bitexact","-flags:a","+bitexact",
                                "-ar",str(SR),"-ac","1",str(ROOT/f"{name}.{extension}")],check=True)
        result[name]={"sources":{"ogg":f"{name}.ogg","mp3":f"{name}.mp3"},"seconds":len(x)/SR,
                      "samples":len(x),"sampleRate":SR,"channels":1,"loop":loop,"gain":gain,
                      "description":description,"crossfadeMs":40}
        if loop:
            result[name].update({"loopStart":0,"loopEnd":1.5,"playback":"decoded AudioBufferSourceNode; loop=true",
                                 "mp3Note":"Decode with encoder delay/padding applied; do not loop an HTMLAudio element."})
    return result


def decode(path):
    out=subprocess.run(["ffmpeg","-v","error","-i",str(path),"-f","f32le","-ac","1","-ar",str(SR),"pipe:1"],
                       check=True,capture_output=True).stdout
    return np.frombuffer(out,dtype="<f4").astype(float)


def audio_stats(x):
    energy=np.abs(np.fft.rfft(x))**2
    freq=np.fft.rfftfreq(len(x),1/SR)
    high=float(energy[freq>=4000].sum()/max(1e-20,energy.sum()))
    true_peak=float(np.max(np.abs(resample_poly(x,4,1))))
    return {"decodedSamples":len(x),"decodedSeconds":round(len(x)/SR,7),
            "peakDbFS":round(20*math.log10(max(1e-12,np.max(np.abs(x)))),3),
            "truePeakDbFS":round(20*math.log10(max(1e-12,true_peak)),3),
            "rmsDbFS":round(20*math.log10(max(1e-12,np.sqrt(np.mean(x*x)))),3),
            "dc":round(float(x.mean()),8),"energyAbove4kHzDb":round(10*math.log10(max(1e-15,high)),3),
            "boundaryStep":round(float(abs(x[0]-x[-1])),7),
            "interiorStepP99":round(float(np.quantile(np.abs(np.diff(x)),.99)),7),
            "first5msPeak":round(float(np.max(np.abs(x[:220]))),7),
            "last5msPeak":round(float(np.max(np.abs(x[-220:]))),7)}


def verify(manifest):
    checks=[]
    def require(condition, label):
        checks.append({"check":label,"pass":bool(condition)})
    images={}
    for name,atlas in manifest["atlases"].items():
        for size,v in atlas["variants"].items():
            path=ROOT/v["path"]
            im=Image.open(path).convert("RGBA")
            a=np.asarray(im)
            images[v["path"]]={"bytes":path.stat().st_size,"size":list(im.size),"frames":len(v["frames"])}
            require(path.stat().st_size<=ATLAS_LIMIT,f"{path.name}: <=600,000 bytes")
            require(im.size==(int(size),int(size)),f"{path.name}: {size} square")
            require(a[:,:,3].min()==0 and a[:,:,3].max()>(16 if name=="steam" else 200),
                    f"{path.name}: transparent with visible content")
            for frame in v["frames"]:
                x,y,w,h=frame["rect"]
                crop=a[y:y+h,x:x+w]
                require(x>=0 and y>=0 and x+w<=im.width and y+h<=im.height,f"{path.name}/{frame['name']}: bounds")
                require(np.any(crop[:,:,3]>8),f"{path.name}/{frame['name']}: nonempty")
                edges=np.concatenate([crop[:2].ravel(),crop[-2:].ravel(),crop[:,:2].ravel(),crop[:,-2:].ravel()])
                require(not edges.any(),f"{path.name}/{frame['name']}: transparent gutter")
            for f in manifest.get("files",[]):
                if f["path"]==path.name:
                    require(hashlib.sha256(path.read_bytes()).hexdigest()==f["sha256"],f"{path.name}: SHA-256")
    audio={}
    for name,cue in manifest["audio"].items():
        pair=sum((ROOT/p).stat().st_size for p in cue["sources"].values())
        require(pair<=AUDIO_LIMIT,f"{name}: ogg + mp3 together <=80,000 bytes")
        for ext,relative in cue["sources"].items():
            path=ROOT/relative
            x=decode(path)
            stats=audio_stats(x);stats["bytes"]=path.stat().st_size
            audio[relative]=stats
            require(path.stat().st_size<=AUDIO_LIMIT,f"{relative}: <=80,000 bytes")
            require(len(x)==cue["samples"],f"{relative}: exact requested decoded sample count")
            require(stats["truePeakDbFS"]<-.5,f"{relative}: no clipping incl. 4x true peak")
            require(stats["energyAbove4kHzDb"]<-45,f"{relative}: high-frequency energy below -45 dB")
            require(abs(stats["dc"])<.002,f"{relative}: no DC bias")
            if cue["loop"]:
                require(stats["boundaryStep"]<.001,f"{relative}: loop boundary <0.001 FS (-60 dBFS)")
                require(stats["boundaryStep"]<stats["interiorStepP99"],f"{relative}: seam quieter than normal signal steps")
            else:
                require(abs(x[0])<.005 and abs(x[-1])<.005,f"{relative}: faded start and end")
    for item in manifest["files"]:
        path=ROOT/item["path"]
        require(path.stat().st_size==item["bytes"],f"{path.name}: manifest bytes")
        require(hashlib.sha256(path.read_bytes()).hexdigest()==item["sha256"],f"{path.name}: manifest hash")
    report={"generatorSeed":SEED,"imageMetrics":images,"audioMetrics":audio,
            "passed":sum(c["pass"] for c in checks),"failed":sum(not c["pass"] for c in checks),"checks":checks}
    dump("verification.json",report)
    print(json.dumps({k:report[k] for k in ("passed","failed")},ensure_ascii=False))
    for check in checks:
        if not check["pass"]:
            print("FAIL:",check["check"])
    if report["failed"]:
        raise SystemExit(1)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify-only",action="store_true")
    args=ap.parse_args()
    if args.verify_only:
        verify(json.loads((ROOT/"manifest.json").read_text(encoding="utf-8")))
        return
    atlases=make_atlases()
    audio=make_audio()
    manifest={"schemaVersion":1,"id":"aliens-vulcan-v2","repository":"roynaor-work/Bakasun",
              "branch":"codex/aliens-vulcan-v2","baseCommit":BASE_COMMIT,"created":"2026-11-14",
              "license":"CC0-1.0","runtimeIntegration":"not-connected","generator":"synthesize.py",
              "seed":SEED,"preview":{"path":"preview.html","width":844,"height":390},
              "limits":{"atlasBytes":ATLAS_LIMIT,"audioFileBytes":AUDIO_LIMIT,"audioPairBytes":AUDIO_LIMIT},
              "coordinates":{"origin":"top-left","rect":"x,y,width,height; pixels",
                             "pivot":"normalized; centered","projectileForward":"negative Y",
                             "rotation":"clockwise radians in Canvas2D","textureFiltering":"linear; no mipmaps; clamp-to-edge"},
              "atlases":atlases,"audio":audio,
              "presentation":{"regularTicksPerSecond":5.6,"vulcanTicksPerSecond":10,"cosmeticPelletsPerTick":3,
                              "spreadDegrees":[-2,0,2],"trailSpeedPxPerSecond":520,
                              "plasmaDisplaySizes":[44,53,62],
                              "muzzleDisplaySize":64,"muzzleFPS":25,"muzzleRotationCycleMs":320,
                              "heatDisplaySize":106,"heatThresholds":[0,.5,.8,1],"lockedPriority":True,
                              "steamFPS":12,"steamLifetimeMs":500,"impactFPS":1000/45,"impactLifetimeMs":180,
                              "v23HeatShots":12,"v23LockSeconds":2,"v23RestSeconds":.5,"v23CoolSeconds":2,
                              "note":"Three visual pellets represent one existing v23 tick. Keep all existing hitboxes, damage, cadence and heat rules."},
              "integration":{"shotFlag":"shot.vulcan (v23)","heat":"model.vulcanHeat",
                             "locked":"model.vulcanLocked","vulcanActive":"model.vulcanOn",
                             "statePriority":["locked","near-lock","hot","cold"],
                             "audioStart":"spin-up; loop fades in over 40 ms from t=0.36 s",
                             "audioStop":"fade loop to zero over 40 ms; spin-down 0.4 s",
                             "overheat":"stop/fade loop; overheat once on lock edge; cooldown air cue; steam once",
                             "resume":"allow next trigger only after lock ends; do not repeat lock cue every frame",
                             "loop":"decode file into AudioBuffer; exact loop duration = decoded buffer.duration; master gain ramps",
                             "fallback":"OGG preferred, MP3 if decoding OGG fails; do not play both",
                             "lifecycle":"release sources on pagehide/visibility hidden/pause; audio unlocked by user gesture"},
              "files":[]}
    for pattern in ("*.png","*.ogg","*.mp3"):
        for path in sorted(ROOT.glob(pattern)):
            manifest["files"].append({"path":path.name,"bytes":path.stat().st_size,
                                      "sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    dump("manifest.json",manifest)
    verify(manifest)


if __name__=="__main__":
    main()
