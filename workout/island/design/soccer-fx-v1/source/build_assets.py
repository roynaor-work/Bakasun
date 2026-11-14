#!/usr/bin/env python3
"""Original soccer VFX / Foley synthesis. SPDX-License-Identifier: CC0-1.0.

Run from any directory with Python 3, Pillow, NumPy, SciPy and FFmpeg (Vorbis,
LAME, loudnorm). Only this package's generated PNG, audio and manifest are written.
No downloaded images, samples, fonts or model-generated pixels are used.
"""
from pathlib import Path
import hashlib
import json
import math
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
RATE = 48000
TAU = 2 * math.pi
SPRITES = []
PALETTE = [(255, 197, 74), (73, 216, 255), (255, 111, 139),
           (112, 242, 174), (188, 152, 255), (255, 239, 170)]


def canvas(size):
    return Image.new('RGBA', (size * SCALE, size * SCALE))


def line(im, pts, color, width=1):
    ImageDraw.Draw(im).line([(x*SCALE, y*SCALE) for x, y in pts],
                           fill=color, width=max(1, round(width*SCALE)), joint='curve')


def ellipse(im, box, color, width=None):
    d = ImageDraw.Draw(im)
    box = tuple(v*SCALE for v in box)
    if width is None:
        d.ellipse(box, fill=color)
    else:
        d.ellipse(box, outline=color, width=max(1, round(width*SCALE)))


def poly(im, pts, color):
    ImageDraw.Draw(im).polygon([(x*SCALE, y*SCALE) for x, y in pts], fill=color)


def finish(im, size):
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    a = np.array(im)
    a[:2, :, :] = 0
    a[-2:, :, :] = 0
    a[:, :2, :] = 0
    a[:, -2:, :] = 0
    a[a[:, :, 3] == 0] = 0
    return Image.fromarray(a)


def save_sheet(name, frames, cols, fps, loop=False, blend='NormalBlending', anchor=(.5, .5)):
    size = frames[0].width
    rows = math.ceil(len(frames)/cols)
    sheet = Image.new('RGBA', (cols*size, rows*size))
    rects = []
    for i, frame in enumerate(frames):
        x, y = (i % cols)*size, (i//cols)*size
        sheet.paste(frame, (x, y))
        rects.append({'index': i, 'rect': [x, y, size, size],
                      'uv': [x/sheet.width, 1-(y+size)/sheet.height,
                             size/sheet.width, size/sheet.height]})
    path = ROOT/'sprites'/f'{name}.png'
    sheet.save(path, optimize=True)
    SPRITES.append({'id': name, 'file': str(path.relative_to(ROOT)),
                    'width': sheet.width, 'height': sheet.height,
                    'columns': cols, 'rows': rows, 'frameWidth': size,
                    'frameHeight': size, 'frameCount': len(frames), 'fps': fps,
                    'durationSeconds': round(len(frames)/fps, 4), 'loop': loop,
                    'blend': blend, 'anchor': list(anchor), 'paddingPixels': 2,
                    'frames': rects})


def turf(slide=False):
    rng = np.random.default_rng(102 if slide else 101)
    motes = rng.uniform(size=(13, 6))
    clouds = rng.uniform(size=(8, 4))
    frames = []
    yy, xx = np.mgrid[:64*SCALE, :64*SCALE] / SCALE
    for i in range(16):
        t = i/15
        opacity = (1-t*.96)**1.25
        alpha = np.zeros(xx.shape)
        for j, c in enumerate(clouds):
            side = -1 if j % 2 else 1
            cx = 31 + side*(3+14*t)*c[0] - (9*t if slide else 0)
            cy = 44 - (3+9*t)*c[1]
            rx, ry = 2.5+5*t+c[2]*2, 1.4+3*t+c[3]
            alpha += .18*opacity*np.exp(-((xx-cx)/rx)**2-((yy-cy)/ry)**2)
        a = np.zeros((*xx.shape, 4), dtype=np.uint8)
        a[:, :, :3] = (220, 199, 151)
        a[:, :, 3] = np.clip(alpha*255, 0, 230).astype(np.uint8)
        im = Image.fromarray(a)
        for j, p in enumerate(motes):
            side = -1 if j % 2 else 1
            x = 32 + side*(3+17*t)*(.4+p[0]*.6) - (10*t if slide else 0)
            y = 43 - (10+20*p[1])*t + 24*t*t
            ang = p[2]*TAU + t*(3+p[3]*4)
            length = (1.9+2*p[4])*(1-.55*t)
            ux, uy = math.cos(ang)*length, math.sin(ang)*length
            vx, vy = -math.sin(ang)*.7, math.cos(ang)*.7
            color = (105+int(p[5]*40), 171+int(p[4]*35), 69, int(245*opacity))
            poly(im, [(x-ux, y-uy), (x+vx, y+vy), (x+ux, y+uy),
                      (x-vx, y-vy)], color)
        frames.append(finish(im, 64))
    save_sheet('slide-turf' if slide else 'landing-turf', frames, 4, 24,
               anchor=(.5, .6875))


def confetti():
    particles = np.random.default_rng(220).uniform(size=(30, 6))
    frames = []
    for i in range(32):
        t = i/31
        im = canvas(64)
        fade = min(1, .35+t*9)*(1-t*.98)**.75
        for j, p in enumerate(particles):
            angle = p[0]*TAU
            reach = 2+(8+15*p[1])*math.sin(t*math.pi*.65)
            x = 32+math.cos(angle)*reach
            y = 36+math.sin(angle)*reach*.86 - 13*t + 12*t*t
            rot = p[2]*TAU + t*(4+8*p[3])
            w, h = 1.0+p[4], (.35+abs(math.cos(t*12+p[5]*TAU)))*1.8
            ux, uy = math.cos(rot)*w, math.sin(rot)*w
            vx, vy = -math.sin(rot)*h, math.cos(rot)*h
            c = PALETTE[j % len(PALETTE)]
            poly(im, [(x-ux-vx, y-uy-vy), (x+ux-vx, y+uy-vy),
                      (x+ux+vx, y+uy+vy), (x-ux+vx, y-uy+vy)], (*c, int(245*fade)))
            if j % 6 == 0:
                line(im, [(x-.9, y), (x+.9, y)], (255, 255, 225, int(200*fade)), .5)
        frames.append(finish(im, 64))
    save_sheet('goal-confetti', frames, 8, 24, blend='AdditiveBlending')


def net():
    frames = []
    for i in range(8):
        t = i/7
        im = canvas(128)
        def warp(x, y):
            dx, dy = x-64, y-64
            r = math.hypot(dx, dy)
            boundary = math.sin((x-10)/108*math.pi)*math.sin((y-10)/108*math.pi)
            displacement = 9*math.sin(11*t-r*.09)*math.exp(-3.5*t)*boundary
            return x + dx/60*displacement, y + dy/60*displacement
        for k in range(10, 119, 12):
            for horizontal in (False, True):
                pts = [warp(j, k) if horizontal else warp(k, j) for j in range(10, 119, 2)]
                line(im, pts, (204, 239, 245, 185), .8)
        frames.append(finish(im, 128))
    save_sheet('goal-net-ripple', frames, 8, 16)


def trail():
    yy, xx = np.mgrid[:32, :256]
    center = 15.5 + 1.2*np.sin(TAU*xx/255)
    width = 1.7 + .5*np.cos(TAU*xx/255)
    core = np.exp(-((yy-center)/width)**2)
    haze = .17*np.exp(-((yy-center)/5.2)**2)
    streak = .19*np.exp(-((yy-center-4)/.7)**2)*(1+.5*np.sin(TAU*xx/255))
    a = np.zeros((32, 256, 4), dtype=np.uint8)
    for ch, (cool, hot) in enumerate(zip((76, 198, 255), (229, 251, 255))):
        a[:, :, ch] = (cool+(hot-cool)*core).astype(np.uint8)
    a[:, :, 3] = np.clip((core*.7+haze+streak)*255, 0, 255).astype(np.uint8)
    a[:2] = a[-2:] = 0
    a[:, -1] = a[:, 0]
    a[a[:, :, 3] == 0] = 0
    path = ROOT/'sprites/ball-trail.png'
    Image.fromarray(a).save(path, optimize=True)
    SPRITES.append({'id': 'ball-trail', 'file': 'sprites/ball-trail.png',
                    'width': 256, 'height': 32, 'columns': 1, 'rows': 1,
                    'frameWidth': 256, 'frameHeight': 32, 'frameCount': 1,
                    'fps': 0, 'loop': True, 'blend': 'AdditiveBlending',
                    'anchor': [.5, .5], 'wrapS': 'RepeatWrapping',
                    'wrapT': 'ClampToEdgeWrapping', 'scrollUPerSecond': -2,
                    'seam': 'first and last RGBA columns identical',
                    'frames': [{'index': 0, 'rect': [0, 0, 256, 32], 'uv': [0, 0, 1, 1]}]})


def rings(click=False):
    frames = []
    for i in range(8):
        t = i/8
        im = canvas(64)
        if click:
            radius, opacity = 10+18*t, (1-t)**1.1
        else:
            radius, opacity = 23+1.6*math.sin(t*TAU), .8+.16*math.cos(t*TAU)
        c = (122, 255, 188)
        for offset, strength, width in [(1.2, .13, 4.4), (0, 1, 1.7), (-2.8, .32, .7)]:
            r = radius+offset
            ellipse(im, (32-r, 32-r, 32+r, 32+r), (*c, int(240*opacity*strength)), width)
        if not click:
            for angle in (0, math.pi/2, math.pi, math.pi*1.5):
                x, y = 32+radius*math.cos(angle), 32+radius*math.sin(angle)
                ellipse(im, (x-1.1, y-1.1, x+1.1, y+1.1), (224, 255, 235, int(240*opacity)))
        frames.append(finish(im, 64))
    save_sheet('click-ring' if click else 'selected-player-ring', frames, 8,
               20 if click else 8, loop=not click)


def kick():
    rays = np.random.default_rng(606).uniform(size=(12, 3))
    frames = []
    for i in range(6):
        t = i/5
        im = canvas(128)
        fade = (1-t*.98)**.7
        for j, p in enumerate(rays):
            angle = TAU*j/len(rays) + (p[0]-.5)*.15
            inner, outer = 10+23*t, 22+25*t+8*p[1]
            w = (2+p[2]*2)*(1-t*.7)
            ux, uy, vx, vy = math.cos(angle), math.sin(angle), -math.sin(angle), math.cos(angle)
            pts = [(64+ux*inner+vx*w, 64+uy*inner+vy*w),
                   (64+ux*outer, 64+uy*outer),
                   (64+ux*inner-vx*w, 64+uy*inner-vy*w)]
            poly(im, pts, (255, 218, 126, int(240*fade)))
            line(im, [(64+ux*(inner+2), 64+uy*(inner+2)),
                      (64+ux*(outer-1), 64+uy*(outer-1))], (255, 250, 220, int(250*fade)), 1)
        frames.append(finish(im, 128))
    save_sheet('power-kick', frames, 6, 30, blend='AdditiveBlending')


def ff(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *args],
                          check=True, capture_output=True)


def measure(path):
    result = ff(['-i', str(path), '-af', 'loudnorm=I=-16:TP=-2:LRA=7:print_format=json',
                 '-f', 'null', '-']).stderr.decode()
    j = json.loads(result[result.rfind('{'):result.rfind('}')+1])
    raw = ff(['-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-']).stdout
    samples = np.frombuffer(raw, dtype='<f4').astype(np.float64)
    spectrum = abs(np.fft.rfft(samples))**2
    weights = np.full(len(spectrum), 2.0)
    weights[0] = 1
    if len(samples) % 2 == 0:
        weights[-1] = 1
    spectrum *= weights
    freq = np.fft.rfftfreq(len(samples), 1/RATE)
    ratio = spectrum[(freq >= 2000) & (freq <= 5000)].sum()/spectrum.sum()
    return {'integratedLufs': float(j['input_i']), 'truePeakDbtp': float(j['input_tp']),
            'energy2To5KhzPercent': round(float(ratio)*100, 5),
            'decodedDurationSeconds': round(len(samples)/RATE, 5),
            'sampleRate': RATE, 'channels': 1}


def synth(name, seconds, seed):
    rng = np.random.default_rng(seed)
    t = np.arange(round(seconds*RATE))/RATE
    n = signal.sosfilt(signal.butter(4, 1250, fs=RATE, output='sos'), rng.standard_normal(len(t)))
    n /= np.std(n)
    attack = 1-np.exp(-t/.003)
    def tone(freq, decay, bend=0):
        phase = TAU*(freq*t + bend*.035*(1-np.exp(-t/.035)))
        return np.sin(phase)*np.exp(-t/decay)*attack
    if name == 'kick-soft':
        x = .72*tone(94, .11, 95)+.24*tone(430, .045)+.22*n*np.exp(-t/.045)*attack
    elif name == 'kick-strong':
        x = .84*tone(78, .17, 180)+.32*tone(225, .09)+.45*n*np.exp(-t/.065)*attack
    elif name == 'post-hit':
        x = (.55*tone(457, .24)+.25*tone(823, .17)+.14*tone(1291, .11)
             +.38*n*np.exp(-t/.035)*attack)
    elif name == 'crossbar-hit':
        x = (.6*tone(337, .33)+.24*tone(617, .23)+.13*tone(1103, .14)
             +.43*n*np.exp(-t/.04)*attack)
    elif name == 'ball-land':
        x = .73*tone(112, .14, 62)+.17*tone(278, .08)+.28*n*np.exp(-t/.055)*attack
    elif name == 'net-rustle':
        bursts = (np.exp(-((t-.07)/.07)**2)+.63*np.exp(-((t-.24)/.11)**2)
                  +.34*np.exp(-((t-.43)/.14)**2)+.13*np.exp(-((t-.65)/.12)**2))
        x = .32*n*bursts+.1*tone(165, .18)
    elif name == 'keeper-catch':
        second = np.maximum(t-.052, 0)
        double = np.sin(TAU*153*second)*(t >= .052)*(1-np.exp(-second/.005))*np.exp(-second/.09)
        x = .64*tone(87, .12, 70)+.3*double+.42*n*np.exp(-t/.09)*attack
    else:
        raise ValueError(name)
    # Gentle crest reduction, followed by steep high-frequency attenuation.
    x = signal.sosfilt(signal.butter(8, 1450, fs=RATE, output='sos'), np.tanh(x*1.7))
    x -= x.mean()
    fade = np.minimum(1, t/.004)*np.minimum(1, (seconds-t)/.09)
    return (x*fade).astype(np.float32)


def sounds():
    entries = []
    specs = [('kick-soft', .65), ('kick-strong', .8), ('post-hit', 1.0),
             ('crossbar-hit', 1.2), ('ball-land', .75), ('net-rustle', 1.0),
             ('keeper-catch', .85)]
    with tempfile.TemporaryDirectory(prefix='soccer-fx-') as folder:
        folder = Path(folder)
        for seed, (name, seconds) in enumerate(specs, 710):
            raw, normalized = folder/'raw.wav', folder/'normalized.wav'
            wavfile.write(raw, RATE, synth(name, seconds, seed))
            ff(['-y', '-v', 'error', '-i', str(raw), '-af', 'loudnorm=I=-16:TP=-2:LRA=7',
                '-ar', str(RATE), '-c:a', 'pcm_f32le', str(normalized)])
            files = []
            for ext, codec in [('ogg', ['-c:a', 'libvorbis', '-q:a', '6']),
                               ('mp3', ['-c:a', 'libmp3lame', '-b:a', '192k'])]:
                dest = ROOT/'audio'/f'{name}.{ext}'
                gain = 0.0
                for attempt in range(12):
                    ff(['-y', '-v', 'error', '-i', str(normalized), '-map_metadata', '-1',
                        '-af', f'volume={gain:.4f}dB,alimiter=limit=0.794328:level=false:latency=true',
                        '-ar', str(RATE), '-ac', '1', *codec, str(dest)])
                    measured = measure(dest)
                    if abs(measured['integratedLufs']+16) <= .1:
                        break
                    gain += -16-measured['integratedLufs']
                assert abs(measured['integratedLufs']+16) <= .1001, (name, measured)
                assert measured['energy2To5KhzPercent'] <= 8, (name, measured)
                assert measured['truePeakDbtp'] <= -1, (name, measured)
                files.append({'file': str(dest.relative_to(ROOT)), 'mimeType': 'audio/ogg' if ext == 'ogg' else 'audio/mpeg',
                              'codec': 'vorbis' if ext == 'ogg' else 'mp3', **measured})
                print(name, ext, measured, flush=True)
            entries.append({'id': name, 'loop': False, 'sourceDurationSeconds': seconds, 'files': files})
    return entries


def main():
    for d in ('sprites', 'audio'):
        (ROOT/d).mkdir(exist_ok=True)
    turf()
    turf(True)
    confetti()
    net()
    trail()
    rings()
    rings(True)
    kick()
    audio = sounds()
    manifest = {'id': 'soccer-fx-v1', 'version': 1, 'license': 'CC0-1.0',
                'provenance': 'LICENSES.md', 'generator': 'source/build_assets.py',
                'images': {'format': 'image/png', 'colorSpace': 'sRGB', 'alpha': 'straight',
                           'premultipliedAlpha': False, 'frameOrder': 'row-major, top-left first',
                           'uvOrigin': 'bottom-left (Three.js TextureLoader default flipY=true)',
                           'minFilter': 'LinearFilter', 'magFilter': 'LinearFilter',
                           'generateMipmaps': False, 'depthWrite': False,
                           'transparent': True, 'toneMapped': False,
                           'uvInsetPixels': .5, 'atlasWrap': 'ClampToEdgeWrapping'},
                'sprites': SPRITES, 'audio': audio,
                'audioPolicy': {'targetIntegratedLufs': -16, 'lufsTolerance': .1,
                                'maxTruePeakDbtp': -1, 'maxEnergy2To5KhzPercent': 8,
                                'energyMethod': 'one-sided Parseval-weighted FFT of the entire decoded mono signal; 2000 <= f <= 5000 divided by DC-to-Nyquist energy; no window',
                                'loudnessMethod': 'FFmpeg loudnorm input_i (EBU R128 / ITU-R BS.1770), measured after decoding each deliverable',
                                'whistles': False, 'speech': False, 'music': False}}
    for entry in [*SPRITES, *(f for a in audio for f in a['files'])]:
        data = (ROOT/entry['file']).read_bytes()
        entry['bytes'] = len(data)
        entry['sha256'] = hashlib.sha256(data).hexdigest()
    (ROOT/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
