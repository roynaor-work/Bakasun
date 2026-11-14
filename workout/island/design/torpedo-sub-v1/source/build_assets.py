#!/usr/bin/env python3
"""Original CC0 game assets. Run with Python 3, NumPy, SciPy, Pillow and FFmpeg.

Writes only generated assets and manifest.json beside this source directory.
No network calls, downloaded media, compression extensions or runtime dependencies.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage, signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
SPRITES = []
MODELS = []
AUDIO = []


def metadata(path):
    data = (ROOT / path).read_bytes()
    return {"file": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def color(hex_value):
    # glTF baseColorFactor is linear, unlike authored sRGB hex values.
    c = np.array([int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4).tolist() + [1]


class Geometry:
    def __init__(self):
        self.faces = []

    def triangle(self, a, b, c, material):
        self.faces.append((a, b, c, material))

    def lathe(self, profile, material, segments=12):
        # Profile proceeds from tail toward +Z nose. Outward CCW winding.
        for (z0, r0), (z1, r1) in zip(profile, profile[1:]):
            for k in range(segments):
                a, b = k * math.tau / segments, (k + 1) * math.tau / segments
                p = (r0 * math.cos(a), r0 * math.sin(a), z0)
                q = (r0 * math.cos(b), r0 * math.sin(b), z0)
                r = (r1 * math.cos(a), r1 * math.sin(a), z1)
                s = (r1 * math.cos(b), r1 * math.sin(b), z1)
                if r0 > 0:
                    self.triangle(p, q, r, material)
                if r1 > 0:
                    self.triangle(q, s, r, material)

    def prism(self, outline, thickness, material, angle=0, z_offset=0):
        # A pitched polygon in XY with thickness in Z; used for fins and blades.
        def p(x, y, z):
            return (x * math.cos(angle) - y * math.sin(angle),
                    x * math.sin(angle) + y * math.cos(angle), z + z_offset)
        lo = [p(x, y, -thickness / 2 + x * .12) for x, y in outline]
        hi = [p(x, y, thickness / 2 + x * .12) for x, y in outline]
        for k in range(1, len(outline) - 1):
            self.triangle(lo[0], lo[k + 1], lo[k], material)
            self.triangle(hi[0], hi[k], hi[k + 1], material)
        for k in range(len(outline)):
            j = (k + 1) % len(outline)
            self.triangle(lo[k], lo[j], hi[j], material)
            self.triangle(lo[k], hi[j], hi[k], material)


def model(enemy=False):
    palette = ['e9be69', '258b8a', 'fff0cc', '354c58']
    if enemy:
        palette = ['dc7758', '733e54', 'ffe3b0', '354251']
    hull, prop = Geometry(), Geometry()
    hull.lathe([(-1.44, 0), (-1.35, .11), (-.98, .27),
                (-.6, .29), (.8, .29), (.99, .27)], 0)
    hull.lathe([(.99, .27), (1.25, .23), (1.47, .12), (1.55, 0)], 2)
    for z in [-.68, .78]:
        hull.lathe([(z - .045, .294), (z + .045, .294)], 1)
    # Four rounded-looking low-poly tail planes; an intentionally toy-like silhouette.
    fin = [(.14, -.16), (.46, -.10), (.46, .05), (.17, .14)]
    for k in range(4):
        hull.prism(fin, .20, 1, k * math.pi / 2, -1.10)
    prop.lathe([(-.13, 0), (-.10, .09), (.10, .09), (.13, 0)], 3, 8)
    blade = [(.065, -.035), (.18, -.13), (.39, -.09), (.43, .02), (.27, .095), (.09, .06)]
    for k in range(3):
        prop.prism(blade, .035, 2, k * math.tau / 3)

    doc = {"asset": {"version": "2.0", "generator": "Original Torpedo Sub v1 authoring",
                      "copyright": "CC0-1.0; see LICENSES.md"},
           "scene": 0, "scenes": [{"nodes": [0]}],
           "nodes": [{"name": "torpedo", "children": [1, 2, 3, 4]},
                     {"name": "hull", "mesh": 0},
                     {"name": "propeller", "mesh": 1, "translation": [0, 0, -1.55]},
                     {"name": "nose", "translation": [0, 0, 1.55]},
                     {"name": "wake", "translation": [0, 0, -1.72]}],
           "materials": [{"name": n, "pbrMetallicRoughness": {
               "baseColorFactor": color(c), "metallicFactor": 0, "roughnessFactor": .72}}
               for n, c in zip(['body', 'team_accent', 'cream', 'mechanical'], palette)],
           "meshes": [], "accessors": [], "bufferViews": []}
    blob = bytearray()

    def accessor(values, components, kind, target=None):
        arr = np.asarray(values, dtype='<f4' if kind == 5126 else '<u2')
        while len(blob) % 4:
            blob.append(0)
        view = {"buffer": 0, "byteOffset": len(blob), "byteLength": arr.nbytes}
        if target:
            view['target'] = target
        doc['bufferViews'].append(view)
        blob.extend(arr.tobytes())
        count = arr.size // components
        data = {"bufferView": len(doc['bufferViews']) - 1, "componentType": kind,
                "count": count, "type": {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[components]}
        if kind == 5126:
            shaped = arr.reshape(count, components)
            data.update(min=shaped.min(axis=0).tolist(), max=shaped.max(axis=0).tolist())
        doc['accessors'].append(data)
        return len(doc['accessors']) - 1

    for mesh_name, geometry in [('hull', hull), ('propeller', prop)]:
        primitives = []
        for mat in sorted(set(f[3] for f in geometry.faces)):
            pos, normals = [], []
            for a, b, c, m in geometry.faces:
                if mat != m:
                    continue
                normal = np.cross(np.subtract(b, a), np.subtract(c, a))
                normal /= np.linalg.norm(normal)
                pos.extend([a, b, c])
                normals.extend([normal] * 3)
            primitives.append({"attributes": {"POSITION": accessor(pos, 3, 5126, 34962),
                                               "NORMAL": accessor(normals, 3, 5126, 34962)},
                               "indices": accessor(range(len(pos)), 1, 5123, 34963), "material": mat})
        doc['meshes'].append({"name": mesh_name, "primitives": primitives})
    times = np.linspace(0, .5, 9)
    rotations = [[0, 0, math.sin(math.pi * t / .5), math.cos(math.pi * t / .5)] for t in times]
    doc['animations'] = [{"name": "propeller_spin", "samplers": [
        {"input": accessor(times, 1, 5126), "output": accessor(rotations, 4, 5126), "interpolation": "LINEAR"}],
        "channels": [{"sampler": 0, "target": {"node": 2, "path": "rotation"}}]}]
    # One turn in .5 s: quaternion = sin(angle/2), cos(angle/2), every 45 degrees.
    doc['buffers'] = [{"byteLength": len(blob)}]
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    glb = struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(encoded) + 8 + len(blob))
    glb += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
    glb += struct.pack('<II', len(blob), 0x004e4942) + blob
    name = 'torpedo-enemy' if enemy else 'torpedo-player'
    path = f'models/{name}.glb'
    (ROOT / path).write_bytes(glb)
    MODELS.append({"id": name, **metadata(path), "triangles": len(hull.faces) + len(prop.faces),
                   "dimensionsMeters": [.92, .92, 3.23], "paletteSrgb": palette,
                   "propeller": {"node": "propeller", "axis": "+Z", "pivotMeters": [0, 0, -1.55],
                                 "clip": "propeller_spin", "durationSeconds": .5, "loop": True},
                   "anchors": {"nose": [0, 0, 1.55], "wake": [0, 0, -1.72]}})


def canvas(w, h):
    im = Image.new('RGBA', (w * 3, h * 3))
    return im, ImageDraw.Draw(im), 3


def bubble(draw, x, y, r, alpha, scale):
    if r <= 0 or alpha < 1:
        return
    x, y, r = x * scale, y * scale, r * scale
    draw.ellipse((x-r, y-r, x+r, y+r), fill=(102, 202, 207, int(alpha * .13)),
                 outline=(172, 237, 228, int(alpha * .7)), width=max(2, int(scale * 1.1)))
    draw.arc((x-r*.72, y-r*.72, x+r*.72, y+r*.72), 205, 290,
             fill=(255, 245, 211, int(alpha)), width=max(2, int(scale * 1.3)))


def frame(kind, index, count, w, h):
    im, d, s = canvas(w, h)
    phase = index / count
    rng = np.random.default_rng(230)
    if kind in ['bubble-trail', 'bubbles-rise']:
        for _ in range(24 if kind == 'bubble-trail' else 13):
            x, y, r, speed = rng.random(4)
            if kind == 'bubble-trail':
                x = (x + phase) % 1
                y = .5 + (y-.5) * .38 + .035 * math.sin(math.tau*(phase+x))
                for shift in [-1, 0, 1]:
                    bubble(d, (x+shift)*w, y*h, 2.3+r*8, 110+r*130, s)
            else:
                y = (y - phase) % 1
                x = .22 + x*.56 + .05 * math.sin(math.tau*(phase+speed))
                fade = math.sin(math.pi*y)**.55
                bubble(d, x*w, y*h, 3+r*10, (140+r*100)*fade, s)
    elif kind == 'sonar-ring':
        t = index / (count-1)
        radius = (.12 + .32*t) * w
        alpha = int(230 * math.sin(math.pi*t)**.65)
        for extra, fade, width in [(0, 1, 3), (-7, .3, 2), (6, .14, 5)]:
            r = radius+extra
            d.ellipse(((w/2-r)*s, (h/2-r)*s, (w/2+r)*s, (h/2+r)*s),
                      outline=(177, 240, 211, int(alpha*fade)), width=width*s)
    elif kind == 'launch-flash':
        t = index/(count-1)
        a = math.sin(math.pi*t)**.7
        for j in range(3):
            r = (9 + t*45)*(1-j*.22)
            d.regular_polygon((w*.5*s, h*.5*s, r*s), n_sides=8, rotation=22.5,
                              fill=(int(154+j*42), 238, 214, int(a*(45+j*55))))
        for k in range(8):
            ang = k*math.tau/8
            bubble(d, w*.5+math.cos(ang)*t*86, h*.5+math.sin(ang)*t*86,
                   2+t*5, 220*a, s)
    elif kind == 'underwater-explosion':
        t = index/(count-1)
        waterline = h*.64
        fade = max(0, 1-t)**.55
        # A compact underwater pressure cloud below an ivory/aqua water column.
        for k in range(14):
            ang = rng.uniform(0, math.tau)
            radial = (8+28*t)*rng.uniform(.5, 1)
            x = w*.5+math.cos(ang)*radial
            y = waterline+12+math.sin(ang)*radial*.65-t*6
            r = (4+9*math.sin(math.pi*t)) * rng.uniform(.6, 1)
            bubble(d, x, y, r, 215*fade*min(1,t*8), s)
        height = h*.56 * math.sin(math.pi*min(1,t*1.18))**.8
        spread = w*(.08+.33*t)
        # Bent ribbons crest and fall outward: a fountain silhouette rather than a flame.
        for k in [-2, 2, -1, 1, 0]:
            base = np.array([w*.5+k*2, waterline+3])
            control = np.array([w*.5+k*3, waterline-height*(1.27-.06*abs(k))])
            tip = np.array([w*.5+k*spread*.64, waterline-height*(.82-.12*abs(k))])
            left, right = [], []
            for u in np.linspace(0,1,18):
                point = (1-u)**2*base+2*(1-u)*u*control+u*u*tip
                radius = (6.5-3*u)*(1-.13*abs(k))
                left.append(((point[0]-radius)*s,point[1]*s))
                right.append(((point[0]+radius)*s,point[1]*s))
            d.polygon(left+right[::-1], fill=(127+abs(k)*14,224+abs(k)*5,215,int(220*fade)))
            d.line([(x+2*s,y) for x,y in left[3:14]],fill=(239,247,215,int(165*fade)),width=2*s)
            r=(3.5-.5*abs(k))*s
            d.ellipse((tip[0]*s-r,tip[1]*s-r,tip[0]*s+r,tip[1]*s+r),fill=(204,244,220,int(230*fade)))
        for k in range(12):
            x = w*.5 + (k-5.5) * (2+5*t)
            y = waterline - height*.7*math.sin(math.pi*(k+.5)/12) + t*t*25
            r = (2.2+math.sin(k*1.7)**2*2)*fade
            bubble(d, x, y, r, 240*fade*min(1,t*10), s)
        rw, rh = (8+t*42)*s, (2+t*5)*s
        d.ellipse((w*.5*s-rw, waterline*s-rh, w*.5*s+rw, waterline*s+rh),
                  outline=(239, 249, 216, int(225*fade*min(1,t*12))), width=2*s)
    return im.resize((w, h), Image.Resampling.LANCZOS)


def bleed(im):
    # Straight alpha with RGB edge dilation prevents black fringes in bilinear filtering.
    arr = np.array(im)
    mask = arr[:,:,3] == 0
    if not mask.all():
        indices = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
        arr[mask,:3] = arr[tuple(indices[:,mask])][:,:3]
    return Image.fromarray(arr)


def sheet(name, cols, rows, w, h, fps, loop, plane, size, pivot=(.5,.5)):
    atlas = Image.new('RGBA', (cols*w, rows*h))
    count = cols*rows
    for i in range(count):
        cell = frame(name, i, count, w, h)
        # Keep every cell's sampling border transparent (including repeating trail endpoints).
        d = ImageDraw.Draw(cell)
        d.rectangle((0, 0, w-1, h-1), outline=(0,0,0,0), width=4)
        atlas.paste(bleed(cell), (i%cols*w, i//cols*h))
    path = f'sprites/{name}.png'
    atlas.save(ROOT / path, optimize=True)
    SPRITES.append({"id": name, **metadata(path), "imageSize": [cols*w, rows*h],
                    "grid": [cols, rows], "frameSize": [w,h], "frameCount": count,
                    "fps": fps, "durationSeconds": count/fps, "loop": loop,
                    "frameOrder": "row-major, left-to-right, top-to-bottom, zero-based",
                    "alpha": "straight", "blend": "normal", "colorSpace": "sRGB",
                    "paddingPixels": 4, "mipmaps": False, "filter": "linear/clamp",
                    "plane": plane, "sizeMeters": size, "pivotNormalizedTopLeft": list(pivot),
                    "frames": [{"index": i, "rect": [i%cols*w,i//cols*h,w,h],
                                "uvTopLeft": [i%cols/cols,i//cols/rows,1/cols,1/rows]}
                               for i in range(count)]})


def decals():
    im, d, s = canvas(256,512)
    points = [(128+math.sin(a)*34, 256+math.cos(a)*188) for a in np.linspace(0,math.tau,32,endpoint=False)]
    d.polygon([(x*s,y*s) for x,y in points], fill=(14,48,64,150))
    d.polygon([(x*s,y*s) for x,y in [(106,368),(59,409),(59,434),(197,434),(197,409),(150,368)]], fill=(14,48,64,145))
    d.rounded_rectangle((114*s,177*s,149*s,277*s), radius=12*s, fill=(12,42,58,195))
    d.ellipse((109*s,438*s,147*s,460*s), fill=(14,48,64,125))
    im = im.filter(ImageFilter.GaussianBlur(2*s)).resize((256,512), Image.Resampling.LANCZOS)
    path = 'sprites/submarine-shadow.png'
    bleed(im).save(ROOT / path, optimize=True)
    SPRITES.append({"id": "submarine-shadow", **metadata(path), "imageSize": [256,512],
                    "frameCount": 1, "grid": [1,1], "frameSize": [256,512], "alpha": "straight",
                    "blend": "normal", "plane": "XZ surface decal", "sizeMeters": [3.5,7],
                    "noseDirection": "image top maps to world +Z", "mipmaps": False})
    im, d, s = canvas(256,64)
    for i in range(8):
        x = 16+i*32
        d.ellipse(((x-5)*s,27*s,(x+5)*s,37*s), fill=(255,201,119,245))
        d.ellipse(((x-2)*s,29*s,(x+2)*s,33*s), fill=(255,242,199,255))
    im.resize((256,64),Image.Resampling.LANCZOS).save(ROOT/'sprites/enemy-warning-line.png',optimize=True)
    SPRITES.append({"id": "enemy-warning-line", **metadata('sprites/enemy-warning-line.png'),
                    "imageSize": [256,64], "frameCount": 1, "grid": [1,1], "frameSize": [256,64],
                    "alpha": "straight", "blend": "normal", "plane": "XZ water surface",
                    "sizeMeters": [8,.65], "repeatU": True, "scrollCyclesPerSecond": .4,
                    "recommendedWarningSeconds": 1.25, "mipmaps": False})


def loudness(path):
    p = subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
                        'loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],
                       capture_output=True,check=True,text=True)
    start = p.stderr.rfind('{')
    return json.loads(p.stderr[start:p.stderr.rfind('}')+1])


def synth(name, seconds):
    n = round(seconds*SR)
    t = np.arange(n)/SR
    rng = np.random.default_rng(119)
    noise = rng.normal(0,1,n)
    smooth = signal.sosfilt(signal.butter(2,1800,fs=SR,output='sos'),noise)
    if name == 'torpedo-launch':
        env = (1-np.exp(-t*65))*np.exp(-t*5)
        x = env*(.45*smooth + .32*np.sin(math.tau*(175*t-28*t*t)))
        x += .12*np.sin(math.tau*340*t)*np.exp(-t*12)
    elif name == 'torpedo-engine-loop':
        # Exact integer periods over four seconds, including circular filtered noise.
        freq = np.fft.rfftfreq(n,1/SR)
        texture = np.fft.irfft(np.fft.rfft(noise)/(1+(freq/720)**4),n=n)
        x = (.24*np.sin(math.tau*96*t)+.13*np.sin(math.tau*192*t)+.06*np.sin(math.tau*288*t))
        x *= 1+.10*np.sin(math.tau*8*t)
        x += texture*.08
    elif name == 'underwater-explosion':
        env = (1-np.exp(-t*75))*np.exp(-t*2.7)
        low = signal.sosfilt(signal.butter(2,650,fs=SR,output='sos'),noise)
        x = env*(low*1.6+.35*np.sin(math.tau*(68*t-7*t*t)))
        x += .2*smooth*np.exp(-((t-.32)/.15)**2)
    elif name == 'sonar-ping':
        x = np.zeros(n)
        for delay,amp in [(0,1),(.18,.27),(.36,.11)]:
            u = np.maximum(t-delay,0)
            env = (t>=delay)*(1-np.exp(-u*120))*np.exp(-u*6)
            x += amp*env*(.5*np.sin(math.tau*740*u)+.10*np.sin(math.tau*1480*u))
    else:
        x = np.zeros(n)
        for k in range(10):
            start = .06+k*.16+rng.uniform(0,.045)
            u = np.maximum(0,t-start)
            env = (t>=start)*(1-np.exp(-u*150))*np.exp(-u*20)
            x += env*np.sin(math.tau*(rng.uniform(260,700)*u+400*u*u))*.33
        x += smooth*.015*np.sin(math.pi*t/seconds)**2
    x = np.tanh(x*2)
    if not name.endswith('loop'):
        fade = min(round(.025*SR),n//2)
        x[:fade] *= np.linspace(0,1,fade)
        x[-fade:] *= np.linspace(1,0,fade)
    return x.astype(np.float32)


def audio(name,seconds,loop=False):
    with tempfile.TemporaryDirectory(prefix='torpedo-audio-') as temp:
        source = Path(temp)/'source.wav'
        wavfile.write(source,SR,synth(name,seconds))
        measured = loudness(source)
        normal = (f"loudnorm=I=-16:TP=-1.5:LRA=7:measured_I={measured['input_i']}:"
                  f"measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:"
                  f"measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true")
        normalized = Path(temp)/'normalized.wav'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af',normal,
                        '-ar',str(SR),'-c:a','pcm_f32le',str(normalized)],check=True)
        formats=[]
        for ext,codec,options in [('ogg','libvorbis',['-q:a','6']),('mp3','libmp3lame',['-b:a','192k'])]:
            dest = ROOT/f'audio/{name}.{ext}'
            gain=0
            for _ in range(3):
                subprocess.run(['ffmpeg','-v','error','-y','-i',str(normalized),'-af',f'volume={gain}dB',
                                '-map_metadata','-1','-ar',str(SR),'-ac','1','-c:a',codec,*options,str(dest)],check=True)
                m=loudness(dest)
                delta=-16-float(m['input_i'])
                if abs(delta)<.04:
                    break
                gain+=delta
            decoded=subprocess.run(['ffmpeg','-v','error','-i',str(dest),'-f','f32le','-acodec','pcm_f32le','-'],
                                   check=True,capture_output=True).stdout
            samples=np.frombuffer(decoded,dtype='<f4')
            item={**metadata(f'audio/{name}.{ext}'), 'codec':codec, 'integratedLufs':float(m['input_i']),
                  'truePeakDbtp':float(m['input_tp']), 'decodedSamples':len(samples),
                  'decodedSeconds':len(samples)/SR}
            if loop:
                item['seamStep']=float(abs(samples[-1]-samples[0]))
                item['largestInternalStep']=float(np.max(abs(np.diff(samples))))
            formats.append(item)
        AUDIO.append({'id':name,'durationSeconds':seconds,'sampleRate':SR,'channels':1,
                      'loop':loop,'loopStartSeconds':0 if loop else None,
                      'loopEndSeconds':seconds if loop else None,'targetLufs':-16,'formats':formats})


def main():
    for directory in ['models','sprites','audio']:
        (ROOT/directory).mkdir(exist_ok=True)
    model(False)
    model(True)
    sheet('bubble-trail',4,2,256,256,12,True,'billboard below water; local +U is +Z',[3, .8])
    sheet('bubbles-rise',4,2,256,256,12,True,'vertical billboard; motion +Y',[1.5,2.8])
    sheet('sonar-ring',4,3,256,256,12,True,'XZ water surface',[8,8])
    sheet('underwater-explosion',8,4,128,256,20,False,'vertical billboard crossing water surface',[5,10],(.5,.64))
    sheet('launch-flash',4,2,256,256,24,False,'billboard at submerged tube muzzle',[1.6,1.6])
    decals()
    for name,seconds,loop in [('torpedo-launch',.9,False),('torpedo-engine-loop',4,True),
                              ('underwater-explosion',2.2,False),('sonar-ping',1.4,False),('bubbles',1.8,False)]:
        audio(name,seconds,loop)
    manifest={'schemaVersion':1,'id':'torpedo-sub-v1','license':'CC0-1.0','licenseFile':'LICENSES.md',
              'units':'metres','up':'+Y','forward':'+Z','handedness':'right',
              'style':'warm low-poly; fictional, unbranded, no baked text',
              'compression':'none; no Draco, Meshopt, KTX or external model resources',
              'models':MODELS,'sprites':SPRITES,'audio':AUDIO,
              'integration':{'scope':'assets and isolated preview only; runtime game changes deferred',
                             'submergedDamageAcceptedFrom':['torpedo'],
                             'submergedDamageRejectedFrom':['shell','bullet','missile'],
                             'canStaySubmerged':True,'submergedWeapon':'torpedo',
                             'waterlineY':0,'torpedoSuggestedCenterY':-1.2,
                             'surfaceDecalY':.025,'depthWriteForTransparentSprites':False,
                             'enemySequenceSeconds':{'warning':0,'launch':1.25,'warningEnds':1.25},
                             'engineLoopHint':'decodeAudioData + AudioBufferSourceNode.loop; use decoded sample range',
                             'atlasUvHint':'rectangles use top-left image coordinates; invert V for bottom-left APIs; never repeat the entire atlas'},
              'authoring':{'source':'source/build_assets.py','mediaSources':'original procedural geometry, vector/raster shapes and audio synthesis; no external samples'}}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'models':[(m['id'],m['triangles']) for m in MODELS],
                      'sprites':len(SPRITES),'audio':[(a['id'],[f['integratedLufs'] for f in a['formats']]) for a in AUDIO]}))


if __name__=='__main__':
    main()
