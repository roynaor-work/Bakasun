#!/usr/bin/env python3
"""Original deterministic game assets. Python 3 + numpy + Pillow + FFmpeg.

Run from any directory. All persistent outputs stay beside this script.
No recordings, stock art, network downloads, or changes to game files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SEED = 240117
RATE = 22050
TILE = 128
MAX_AUDIO = 50_000
MAX_ATLAS = 600_000


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


MATERIALS = [
    {"name": "blackened-steel", "pbrMetallicRoughness": {
        "baseColorFactor": [.075, .095, .115, 1], "metallicFactor": .88, "roughnessFactor": .32}},
    {"name": "copper-driving-band", "pbrMetallicRoughness": {
        "baseColorFactor": [.66, .29, .115, 1], "metallicFactor": .94, "roughnessFactor": .27}},
    {"name": "machined-tip", "pbrMetallicRoughness": {
        "baseColorFactor": [.24, .27, .29, 1], "metallicFactor": .9, "roughnessFactor": .24}},
]


class Mesh:
    """Small uncompressed GLB writer: flat triangles, explicit outward normals."""
    def __init__(self):
        self.groups = {}

    def tri(self, a, b, c, material=0):
        a, b, c = np.array([a, b, c], dtype=float)
        n = np.cross(b-a, c-a)
        if np.linalg.norm(n) < 1e-10:
            return
        n /= np.linalg.norm(n)
        group = self.groups.setdefault(material, [])
        group.extend([(a.tolist(), n.tolist()), (b.tolist(), n.tolist()), (c.tolist(), n.tolist())])

    def lathe(self, profile, segments=16, bands=()):
        # Profile is (z, radius); the projectile nose points along +Z.
        rings = [[(r*math.cos(a*2*math.pi/segments), r*math.sin(a*2*math.pi/segments), z)
                  for a in range(segments)] for z, r in profile]
        for j in range(len(rings)-1):
            for i in range(segments):
                k = (i+1) % segments
                mat = 1 if j in bands else 0
                self.tri(rings[j][i], rings[j][k], rings[j+1][i], mat)
                self.tri(rings[j][k], rings[j+1][k], rings[j+1][i], mat)
        for i in range(segments):
            k = (i+1) % segments
            self.tri((0, 0, profile[0][0]), rings[0][k], rings[0][i], 2)
            self.tri((0, 0, profile[-1][0]), rings[-1][i], rings[-1][k], 2)

    def fin(self, angle):
        # Closed, bevel-free game silhouette; eight triangles per fin.
        ca, sa = math.cos(angle), math.sin(angle)
        points = [(r*ca-t*sa, r*sa+t*ca, z) for t in [-.014, .014]
                  for r, z in [(.045, -.48), (.23, -.48), (.12, -.17)]]
        self.tri(points[0], points[2], points[1])
        self.tri(points[3], points[4], points[5])
        for i, j in [(0, 1), (1, 2), (2, 0)]:
            self.tri(points[i], points[j], points[i+3])
            self.tri(points[j], points[j+3], points[i+3])

    def save(self, name, materials=MATERIALS):
        blob = bytearray()
        views, accessors, primitives = [], [], []
        all_positions = []
        for material, verts in sorted(self.groups.items()):
            attrs = {}
            for key, column in [("POSITION", 0), ("NORMAL", 1)]:
                values = np.array([v[column] for v in verts], dtype="<f4")
                offset = len(blob)
                blob.extend(values.tobytes())
                views.append({"buffer": 0, "byteOffset": offset, "byteLength": values.nbytes, "target": 34962})
                accessor = {"bufferView": len(views)-1, "componentType": 5126,
                            "count": len(values), "type": "VEC3"}
                if key == "POSITION":
                    accessor.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
                    all_positions.extend(values.tolist())
                accessors.append(accessor)
                attrs[key] = len(accessors)-1
            primitives.append({"attributes": attrs, "material": material, "mode": 4})
        triangles = sum(len(g)//3 for g in self.groups.values())
        doc = {"asset": {"version": "2.0", "generator": "Bakasun original weapons-v2 / synthesize.py"},
               "scene": 0, "scenes": [{"nodes": [0]}],
               "nodes": [{"name": name, "mesh": 0}],
               "meshes": [{"name": name, "primitives": primitives}],
               "materials": materials, "accessors": accessors, "bufferViews": views,
               "buffers": [{"byteLength": len(blob)}],
               "extras": {"triangles": triangles, "forward": "+Z", "up": "+Y", "license": "CC0-1.0"}}
        header = json.dumps(doc, separators=(",", ":")).encode()
        header += b" " * (-len(header) % 4)
        blob += b"\0" * (-len(blob) % 4)
        binary = struct.pack("<III", 0x46546C67, 2, 28+len(header)+len(blob))
        binary += struct.pack("<I4s", len(header), b"JSON") + header
        binary += struct.pack("<I4s", len(blob), b"BIN\0") + blob
        path = ROOT / "models" / (name + ".glb")
        path.write_bytes(binary)
        positions = np.array(all_positions)
        return {"file": path.relative_to(ROOT).as_posix(), "triangles": triangles,
                "bounds": {"min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()}}


def models():
    regular = Mesh()
    regular.lathe([(-.45, .125), (-.42, .155), (-.29, .155), (-.275, .169),
                   (-.20, .169), (-.185, .155), (.16, .155), (.31, .108), (.46, .018)], bands=(2, 3, 4))
    large = Mesh()
    large.lathe([(-.59, .19), (-.56, .225), (-.37, .225), (-.35, .24),
                 (-.25, .24), (-.23, .225), (.19, .225), (.34, .19), (.48, .105), (.59, .025)], bands=(2, 3, 4))
    mortar = Mesh()
    mortar.lathe([(-.46, .042), (-.23, .06), (-.13, .16), (-.04, .22),
                  (.045, .229), (.10, .216), (.22, .165), (.34, .08), (.385, .018)],
                 segments=12, bands=(3, 4))
    for i in range(4):
        mortar.fin(i*math.pi/2)
    result = {"cannon": regular.save("shell-regular"), "cannon2": large.save("shell-large"),
              "cannon3": mortar.save("shell-mortar")}
    assert all(m["triangles"] <= 400 for m in result.values())
    # Concave geometry, not just a painted black disc. Origin is ground height.
    crater = Mesh()
    profile = [(0, -.18), (.18, -.19), (.48, -.09), (.75, .055), (1, 0)]
    for j in range(len(profile)-1):
        for i in range(20):
            a, b = i*math.tau/20, (i+1)*math.tau/20
            r, y = profile[j]
            R, Y = profile[j+1]
            va, vb = (r*math.cos(a), y, r*math.sin(a)), (r*math.cos(b), y, r*math.sin(b))
            vc, vd = (R*math.cos(a), Y, R*math.sin(a)), (R*math.cos(b), Y, R*math.sin(b))
            crater.tri(va, vb, vc, 0 if j < 2 else 1)
            crater.tri(vb, vd, vc, 0 if j < 2 else 1)
    result["crater"] = crater.save("ground-crater", [
        {"name": "scorched-bowl", "pbrMetallicRoughness": {"baseColorFactor": [.075, .057, .038, 1], "roughnessFactor": 1}},
        {"name": "broken-sand-rim", "pbrMetallicRoughness": {"baseColorFactor": [.31, .235, .14, 1], "roughnessFactor": 1}}])
    return result


class Paint:
    def __init__(self):
        self.y, self.x = np.mgrid[-1:1:256j, -1:1:256j]
        self.rgb = np.zeros((256, 256, 3), dtype=float)
        self.alpha = np.zeros((256, 256), dtype=float)

    def over(self, mask, color, opacity=1):
        a = np.clip(mask*opacity, 0, 1)
        out = a + self.alpha*(1-a)
        self.rgb = (np.array(color)[None, None, :]*a[..., None] + self.rgb*self.alpha[..., None]*(1-a[..., None])) / np.maximum(out[..., None], 1e-9)
        self.alpha = out

    def puff(self, x, y, rx, ry, color, opacity=1, hard=2):
        d = ((self.x-x)/rx)**2+((self.y-y)/ry)**2
        self.over(np.exp(-d*hard), color, opacity)

    def streak(self, x, y, length, angle, color, opacity=1, width=.012):
        dx, dy = self.x-x, self.y-y
        u = dx*math.cos(angle)+dy*math.sin(angle)
        v = -dx*math.sin(angle)+dy*math.cos(angle)
        self.over(np.exp(-v*v/(width*width))*np.clip(1-abs(u)/length, 0, 1), color, opacity)

    def image(self):
        rgba = np.concatenate([self.rgb, self.alpha[..., None]*255], axis=2)
        image = Image.fromarray(np.clip(rgba, 0, 255).astype("uint8"), "RGBA").resize((TILE, TILE), Image.Resampling.LANCZOS)
        data = np.array(image)
        # Four transparent pixels protect all frames from filtering/bleeding.
        data[:4] = data[-4:] = 0
        data[:, :4] = data[:, -4:] = 0
        data[data[:, :, 3] < 4] = 0
        return Image.fromarray(data)


def atlas():
    sheet = Image.new("RGBA", (1024, 2048))
    sequences = {}

    def sequence(name, row, count, fps, blend, draw, pivot=(.5, .5)):
        frames = []
        for i in range(count):
            p = Paint()
            draw(p, i, count)
            sheet.paste(p.image(), (i*TILE, row*TILE))
            frames.append({"x": i*TILE, "y": row*TILE, "w": TILE, "h": TILE})
        sequences[name] = {"frames": frames, "fps": fps, "loop": False, "blend": blend,
                           "pivot": list(pivot), "durationSeconds": count/fps}

    def explosion(style):
        def draw(p, i, n):
            t = i/n
            rng = np.random.default_rng(SEED+style)
            for k in range(14):
                a, rad = rng.uniform(0, math.tau), rng.uniform(.12, .54)
                x, y = math.cos(a)*rad*(.4+.7*t), math.sin(a)*rad*(.4+.7*t)-t*.20
                r = .16+.21*t+rng.uniform(0, .07)
                p.puff(x, y, r, r*(1+style*.1), [55+17*k%30, 52+11*k%24, 48+7*k%22],
                       min(.82, .35+t)*((1-t)**.65), 2.5)
            if i < 6:
                fire = (1-t)**1.4
                for k in range(13):
                    a = k*math.tau/13+style*.4
                    rad = (.10+.32*t)*(1+.22*math.sin(k*7))
                    p.puff(math.cos(a)*rad, math.sin(a)*rad*.85-.10*t,
                           .14+.04*t, .20, [255, 95+35*(k%3), 19], fire*.92)
                p.puff(0, -.02, .18+.1*t, .20+.1*t, [255, 220, 128], fire)
                p.puff(0, -.03, .08, .10, [255, 254, 227], fire)
            r = np.hypot(p.x, p.y*2.3-.37)
            ring = np.exp(-((r-(.12+.65*t))/.028)**2)
            p.over(ring, [255, 196, 109], (1-t)*.5)
            for k in range(17):
                a = rng.uniform(0, math.tau)
                rad = (.16+.65*t)*rng.uniform(.6, 1)
                p.streak(math.cos(a)*rad, math.sin(a)*rad-.1*t, .04+.04*t, a,
                         [255, 196, 106], (1-t)*.9, .009)
        return draw

    def smoke(p, i, n):
        t = i/(n-1)
        for k in range(13):
            a = k*2.4
            r = .12+.16*t
            p.puff(math.cos(a)*(.12+.30*t), math.sin(a)*(.10+.21*t)-t*.18,
                   r, r*1.15, [130+k*3, 128+k*3, 118+k*3], .45*(1-t*.75), 2)

    def trail(p, i, n):
        t = i/(n-1)
        for k in range(10):
            x = .60-k*.13
            p.puff(x, math.sin(k*2.7+t*2)*.07, .09+k*.012, .035+k*.016,
                   [155, 150, 136], .58*(1-k/12)*(1-t*.7))

    pellets = [(0, -.18), (.1, .13), (-.14, .04), (.23, -.04), (-.21, -.16), (.02, .30), (-.28, .21), (.31, .24)]

    def cloud(p, i, n):
        t = i/(n-1)
        for k in range(11):
            x = -.6+k*.112
            p.puff(x, math.sin(k*3.1)*(.03+.12*t), .12+.05*t,
                   .04+(x+.6)*(.15+.17*t), [176, 163, 136], .15*(1-t*.65))
        for k, (x, y) in enumerate(pellets):
            x = -.54+t*.97+x*(.3+t*.8)
            y = y*(.5+t)
            p.streak(x-.06, y, .07, .04*math.sin(k), [218, 195, 143], .55*(1-t*.45), .008)
            p.puff(x, y, .026, .026, [78, 74, 66], .99, 4)
            p.puff(x-.006, y-.007, .013, .012, [255, 239, 195], .95, 4)

    def impact(variant):
        def draw(p, i, n):
            t = i/(n-1)
            rng = np.random.default_rng(SEED+400+variant)
            # Several separate contact points in each variation, never a single star.
            for j in range(5+variant):
                x, y = rng.uniform(-.48, .48, 2)
                p.puff(x, y-t*.1, .10+t*.15, .09+t*.14, [133, 117, 88], .50*(1-t*.8))
                for k in range(3):
                    a = rng.uniform(0, math.tau)
                    p.streak(x+math.cos(a)*t*.16, y+math.sin(a)*t*.16,
                             .05+t*.08, a, [255, 176+variant*12, 86], (1-t)*.95, .009)
                p.puff(x, y, .025, .025, [255, 245, 211], (1-t), 4)
        return draw

    def flash(p, i, n, wide=True):
        t = i/n
        for k in range(7):
            a = (-.65+k*.217) if wide else (-.25+k*.083)
            x, y = -.26+(.43+.18*math.sin(k*4))*math.cos(a), .59*math.sin(a)
            p.puff(x, y, .32, .075, [255, 141, 39], (1-t)*.87)
            p.streak(x*.65, y*.8, .30, a, [255, 215, 136], (1-t)*.95, .05)
        p.puff(-.23, 0, .20, .17 if wide else .10, [255, 251, 217], 1-t)

    def crater(p, i, n):
        x, y = p.x, p.y
        angle = np.arctan2(y, x)
        r = np.hypot(x, y)*(1+.055*np.sin(angle*9+i)+.03*np.sin(angle*17))
        p.over(np.exp(-((r-.57)/.13)**2), [124, 91, 54], .8)
        p.over(np.clip((.57-r)/.07, 0, 1), [32, 27, 22], .96)
        p.over(np.exp(-((r-.49)/.045)**2)*np.clip(-y*3, 0, 1), [15, 14, 12], .8)
        p.over(np.exp(-((r-.60)/.04)**2)*np.clip(y*3, 0, 1), [194, 150, 88], .72)
        for k in range(14):
            a = k*2.399+i
            p.streak(math.cos(a)*.68, math.sin(a)*.68, .09, a, [44, 34, 23], .75, .012)

    def pellet(p, i, n):
        p.streak(-.15, 0, .52, 0, [221, 187, 118] if i != 2 else [171, 201, 218], .65, .019)
        p.puff(.27, .015, [.13, .17, .24][i], [.13, .17, .045][i], [92, 62, 50] if i == 1 else [66, 72, 78], 1, 4)
        p.puff(.25, -.02, .065 if i != 2 else .17, .045 if i != 2 else .018, [241, 237, 220], .95, 4)

    for i, key in enumerate(["explosion-regular", "explosion-large", "explosion-mortar"]):
        sequence(key, i, 8, 16, "normal", explosion(i))
    sequence("cannon-smoke", 3, 6, 12, "normal", smoke)
    sequence("shell-trail", 4, 6, 16, "normal", trail)
    sequence("shotgun-cloud", 5, 6, 24, "normal", cloud)
    for i in range(4):
        sequence("shotgun-impact-"+str(i+1), 6+i, 4, 24, "normal", impact(i))
    sequence("shotgun-muzzle", 10, 4, 40, "additive", flash, (.25, .5))
    sequence("ground-crater", 11, 3, 1, "normal", crater)
    sequences["ground-crater"]["staticVariants"] = True
    sequence("pellet", 12, 3, 1, "normal", pellet)
    sequences["pellet"]["staticVariants"] = True
    sequence("cannon-muzzle", 13, 4, 32, "additive", lambda p, i, n: flash(p, i, n, False), (.25, .5))
    path = ROOT / "textures/weapons-atlas.png"
    # Quantize channels independently: 64 alpha levels keep smoke smooth even
    # when a shared indexed palette would spend its entries on flame colours.
    rgba = np.array(sheet).astype(float)
    rgba[:, :, :3] = np.clip(np.rint(rgba[:, :, :3]/8)*8, 0, 255)
    rgba[:, :, 3] = np.clip(np.rint(rgba[:, :, 3]/4)*4, 0, 255)
    reduced = Image.fromarray(rgba.astype('uint8'), 'RGBA')
    reduced.save(path, optimize=True)
    if path.stat().st_size > MAX_ATLAS:
        reduced.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    assert path.stat().st_size <= MAX_ATLAS
    return {"file": "textures/weapons-atlas.png", "width": 1024, "height": 2048,
            "tileSize": TILE, "gutterPixels": 4, "alpha": "straight", "colorSpace": "sRGB",
            "origin": "top-left", "sequences": sequences}


def lowpass(x, frequency):
    # Deterministic frequency-domain filter; padded to avoid circular tail wrap.
    size = 1 << (len(x)*2-1).bit_length()
    spectrum = np.fft.rfft(x, size)
    hz = np.fft.rfftfreq(size, 1/RATE)
    return np.fft.irfft(spectrum/(1+(hz/frequency)**4), size)[:len(x)]


def audio():
    if not shutil.which("ffmpeg"):
        raise SystemExit("FFmpeg is required (libvorbis and libmp3lame encoders).")
    result = {}
    definitions = {
        "cannon": (1.05, 70, 31, 1450, .64),
        "cannon2": (1.35, 51, 24, 1050, .83),
        "cannon3": (.72, 136, 44, 850, .35),
        "shotgun": (.56, 112, 45, 3900, .16),
        "shotgun2": (.73, 85, 33, 2900, .24),
        "shotgun3": (.42, 184, 72, 5700, .10),
        "impact-cannon": (.82, 64, 27, 1800, .46),
        "impact-cannon2": (1.10, 45, 22, 1450, .60),
        "impact-cannon3": (.94, 74, 30, 2050, .50),
    }
    for i in range(4):
        definitions["impact-shotgun-"+str(i+1)] = (.19+i*.025, 170+i*24, 75, 3700+i*410, .055)
    definitions.update({"shellWhistle": (.65, 1150, 570, 3500, .18),
                        "mortarWhistle": (.93, 1700, 380, 2800, .24)})
    with tempfile.TemporaryDirectory(prefix="boars-weapons-v2-") as temp:
        for index, (name, (duration, f0, f1, cutoff, tail)) in enumerate(definitions.items()):
            rng = np.random.default_rng(SEED+index*101)
            t = np.arange(round(duration*RATE))/RATE
            noise = rng.uniform(-1, 1, len(t))
            filtered = lowpass(noise, cutoff)
            body = np.sin(math.tau*(f1*t+(f0-f1)*.055*(1-np.exp(-t/.055))))
            if "Whistle" in name:
                phase = math.tau*(f0*t+(f1-f0)*t*t/(2*duration))
                signal = (.65*np.sin(phase)+.14*np.sin(phase*1.012)+.16*filtered)*np.sin(math.pi*t/duration)**.8
                peak = .36
            else:
                signal = .63*body*np.exp(-t/(.065+tail*.3))
                signal += filtered*np.exp(-t/(.035+tail*.20))*(1.4 if "shotgun" in name else 1)
                signal += lowpass(noise, 360)*tail*np.exp(-t/(.16+tail*.3))
                signal += (noise-filtered)*.3*np.exp(-t/.009)
                if name.startswith("shotgun"):
                    # Two dry mechanical clicks, original filtered impulses.
                    for when in [duration*.67, duration*.83]:
                        u = np.maximum(0, t-when)
                        signal += (t >= when)*(noise-filtered)*.25*np.exp(-u/.008)
                if name.startswith("impact-shotgun"):
                    signal *= .5
                    for k in range(5):
                        when = .007+k*.011+index*.0004
                        u = np.maximum(0, t-when)
                        signal += (t >= when)*noise*.45*np.exp(-u/.007)
                # Leave codec headroom: Vorbis/MP3 may overshoot PCM peaks.
                peak = .64 if name.startswith("impact-shotgun") else .74
            signal *= np.minimum(t/.0018, 1)*np.minimum((duration-t)/.025, 1)
            signal = np.tanh(signal*1.4)
            signal *= peak/max(float(np.max(abs(signal))), 1e-8)
            pcm = np.round(signal*32767).astype("<i2")
            wav = Path(temp) / (name+".wav")
            with wave.open(str(wav), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(RATE)
                handle.writeframes(pcm.tobytes())
            encodings = {}
            for suffix, codec in [("ogg", "libvorbis"), ("mp3", "libmp3lame")]:
                path = ROOT / "audio" / (name+"."+suffix)
                cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                       "-map_metadata", "-1", "-ac", "1", "-ar", str(RATE), "-c:a", codec]
                cmd += ["-q:a", "2"] if suffix == "ogg" else ["-b:a", "48k", "-write_xing", "0"]
                if suffix == "ogg":
                    cmd += ["-fflags", "+bitexact", "-flags:a", "+bitexact", "-serial_offset", str(index)]
                cmd.append(str(path))
                subprocess.run(cmd, check=True)
                assert path.stat().st_size <= MAX_AUDIO
                encodings[suffix] = path.relative_to(ROOT).as_posix()
            result[name] = {"sources": encodings, "sourceDurationSeconds": duration,
                            "sampleRate": RATE, "channels": 1, "sourcePeakDbFS": round(20*math.log10(peak), 2),
                            "seed": SEED+index*101, "provenance": "original procedural synthesis"}
    return result


def inventory():
    return {p.relative_to(ROOT).as_posix(): {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for folder in ["models", "textures", "audio"] for p in sorted((ROOT/folder).iterdir()) if p.is_file()}


def validate(manifest):
    """Validate delivered bytes, not just the authoring metadata."""
    checks = []
    for key, item in manifest["models"].items():
        path = ROOT/item["file"]
        binary = path.read_bytes()
        magic, version, size = struct.unpack_from("<III", binary)
        assert magic == 0x46546C67 and version == 2 and size == len(binary)
        length, kind = struct.unpack_from("<I4s", binary, 12)
        assert kind == b"JSON"
        gltf = json.loads(binary[20:20+length])
        tris = sum(gltf["accessors"][p["attributes"]["POSITION"]]["count"]//3
                   for mesh in gltf["meshes"] for p in mesh["primitives"])
        assert tris == item["triangles"] and tris <= 400
        assert not any("uri" in b for b in gltf["buffers"])
        for accessor in gltf["accessors"]:
            view = gltf["bufferViews"][accessor["bufferView"]]
            start = 28+length+view.get("byteOffset", 0)
            values = np.frombuffer(binary, dtype="<f4", count=accessor["count"]*3, offset=start).reshape(-1, 3)
            assert np.isfinite(values).all()
            if "min" not in accessor:
                assert np.allclose(np.linalg.norm(values, axis=1), 1, atol=1e-5)
        checks.append({"asset": key, "triangles": tris, "validGLB": True})
    atlas_path = ROOT/manifest["atlas"]["file"]
    rgba = np.array(Image.open(atlas_path).convert("RGBA"))
    assert atlas_path.stat().st_size <= MAX_ATLAS and rgba.shape == (2048, 1024, 4)
    assert rgba[:, :, 3].min() == 0 and rgba[:, :, 3].max() > 240
    frame_count = 0
    for key, seq in manifest["atlas"]["sequences"].items():
        hashes = set()
        for rect in seq["frames"]:
            x, y, w, h = (rect[k] for k in ["x", "y", "w", "h"])
            tile = rgba[y:y+h, x:x+w]
            assert tile.shape == (TILE, TILE, 4)
            assert not tile[:4, :, 3].any() and not tile[-4:, :, 3].any()
            assert not tile[:, :4, 3].any() and not tile[:, -4:, 3].any()
            assert tile[:, :, 3].max() > 0
            hashes.add(hashlib.sha256(tile.tobytes()).hexdigest())
            frame_count += 1
        assert len(hashes) == len(seq["frames"]), key
    decoded_audio = []
    for key, clip in manifest["audio"].items():
        for codec, rel in clip["sources"].items():
            path = ROOT/rel
            assert path.stat().st_size <= MAX_AUDIO
            decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"])
            samples = np.frombuffer(decoded, dtype="<f4")
            assert np.isfinite(samples).all() and len(samples) > 1000
            peak = float(np.max(abs(samples)))
            assert .01 < peak < .99, (key, codec, peak)
            assert abs(len(samples)/RATE-clip["sourceDurationSeconds"]) < .10
            decoded_audio.append({"asset": key, "codec": codec, "bytes": path.stat().st_size,
                                  "decodedPeak": round(peak, 5), "decodedDurationSeconds": round(len(samples)/RATE, 4)})
    assert inventory() == manifest["files"], "Manifest hashes do not match delivered assets"
    result = {"passed": True, "seed": SEED, "models": checks, "atlasBytes": atlas_path.stat().st_size,
              "atlasFrames": frame_count, "atlasTransparentGutters": True,
              "audio": decoded_audio, "limitsBytes": {"audioPerFile": MAX_AUDIO, "atlas": MAX_ATLAS}}
    write_json(ROOT/"verification/asset-validation.json", result)
    print(json.dumps({"passed": True, "models": checks, "atlasBytes": atlas_path.stat().st_size,
                      "frames": frame_count, "audioFiles": len(decoded_audio)}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="Inspect existing delivered files without regenerating")
    args = parser.parse_args()
    if args.validate_only:
        validate(json.loads((ROOT/"manifest.json").read_text()))
        return
    for folder in ["models", "textures", "audio", "verification"]:
        (ROOT/folder).mkdir(exist_ok=True)
    model_info, atlas_info, audio_info = models(), atlas(), audio()
    weapons = {}
    for index, key in enumerate(["cannon", "cannon2", "cannon3"]):
        weapons[key] = {"model": key, "fireAudio": key, "flightAudio": "mortarWhistle" if index == 2 else "shellWhistle",
                        "impactAudio": "impact-"+key, "explosion": ["explosion-regular", "explosion-large", "explosion-mortar"][index],
                        "smoke": "cannon-smoke", "trail": "shell-trail", "muzzle": "cannon-muzzle",
                        "crater": "ground-crater", "craterVariant": index,
                        "preview": {"flightSeconds": [.70, .82, 1.12][index], "arcHeight": [.7, .85, 1.85][index],
                                    "effectScale": [1, 1.35, 1.12][index]}}
    for index, key in enumerate(["shotgun", "shotgun2", "shotgun3"]):
        weapons[key] = {"fireAudio": key, "cloud": "shotgun-cloud", "pellet": "pellet", "pelletVariant": index,
                        "muzzle": "shotgun-muzzle", "impactVariations": ["shotgun-impact-"+str(i+1) for i in range(4)],
                        "impactAudioVariations": ["impact-shotgun-"+str(i+1) for i in range(4)],
                        "preview": {"pellets": 8, "flightSeconds": [.24, .27, .21][index], "effectScale": [1, 1.2, .85][index]}}
    manifest = {"schemaVersion": 1, "pack": "boars-weapons-v2", "license": "CC0-1.0", "sourceLicense": "MIT", "seed": SEED,
                "baseCommit": "43b27dc235387e3cb737aee9558cdf9d5fd5a262",
                "scope": "Design assets and isolated preview only; no game integration",
                "coordinates": {"units": "game meters; scale by existing weapon radius", "up": "+Y", "forward": "+Z", "origin": "shell visual center"},
                "limits": {"shellTriangles": 400, "audioBytesPerFile": MAX_AUDIO, "atlasBytes": MAX_ATLAS},
                "models": model_info, "atlas": atlas_info, "audio": audio_info, "weapons": weapons,
                "preview": {"html": "preview.html", "viewport": [844, 390], "module": "preview.mjs",
                            "dependencies": ["../../vendor/three.module.js", "../../vendor/GLTFLoader.js",
                                             "../../vendor/DRACOLoader.js", "../../vendor/draco/draco_wasm_wrapper.js",
                                             "../../vendor/draco/draco_decoder.wasm", "../defense-v7/models/boar-amber-lod1.glb"],
                            "note": "Dependencies are read-only repository references; serve the repository root via HTTP."},
                "files": inventory()}
    write_json(ROOT/"manifest.json", manifest)
    validate(manifest)


if __name__ == "__main__":
    main()
