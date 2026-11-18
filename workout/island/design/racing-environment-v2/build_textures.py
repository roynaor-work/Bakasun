#!/usr/bin/env python3
"""Original racing material library, authored procedurally for this pack.

CC0-1.0. Source: this file; no photographs, downloaded art or fonts.
Requires Python 3, NumPy and Pillow. Run from any directory. All outputs stay
beside this source. WebP is lossless, so the mathematically matched borders
survive decoding byte for byte. Surface maps use an inclusive periodic lattice.
"""
from pathlib import Path
import hashlib
import json
import math
import random

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE / "textures"
N = 256
SEED = 20261107
U, V = np.meshgrid(np.linspace(0, 1, N), np.linspace(0, 1, N))
INFO = []


def noise(cells, seed):
    """Smooth toroidal value noise, including identical first and last samples."""
    rng = np.random.default_rng(seed)
    grid = rng.uniform(-1, 1, (cells, cells))
    p = np.linspace(0, cells, N)
    i = np.floor(p).astype(int) % cells
    t = p % 1
    t = t * t * (3 - 2 * t)
    a = grid[i[:, None], i[None, :]]
    b = grid[i[:, None], (i[None, :] + 1) % cells]
    c = grid[(i[:, None] + 1) % cells, i[None, :]]
    d = grid[(i[:, None] + 1) % cells, (i[None, :] + 1) % cells]
    return (a * (1-t[None, :]) + b*t[None, :])*(1-t[:, None]) + (c*(1-t[None, :]) + d*t[None, :])*t[:, None]


def color(base, detail, gain=(1, 1, 1)):
    return np.clip(np.asarray(base)[None, None, :] + detail[:, :, None]*np.asarray(gain), 0, 255)


def periodic_edges(a):
    a[-1, :, :] = a[0, :, :]
    a[:, -1, :] = a[:, 0, :]
    return a


def save(name, a, role, meters, roughness=.9, tiled=True, space="sRGB", recipe=""):
    a = np.asarray(a)
    if a.dtype != np.uint8:
        # Two-unit colour quantization keeps grain compact without block artifacts.
        a = (np.rint(np.clip(a, 0, 255)/2)*2).clip(0, 255).astype(np.uint8)
    if tiled:
        periodic_edges(a)
    im = Image.fromarray(a)
    path = OUT / f"{name}.webp"
    im.save(path, format="WEBP", lossless=True, method=6, exact=True)
    decoded = np.asarray(Image.open(path).convert("RGB"))
    seam = max(int(np.abs(decoded[0].astype(int)-decoded[-1].astype(int)).max()), int(np.abs(decoded[:,0].astype(int)-decoded[:,-1].astype(int)).max())) if tiled else None
    INFO.append(dict(file=f"textures/{path.name}", width=im.width, height=im.height,
                     type="normal" if space == "linear" else "baseColor", colorSpace=space,
                     tileable=tiled, tileMeters=meters, roughness=roughness, bytes=path.stat().st_size,
                     edgeMaxDelta=seam, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                     source="build_textures.py", license="CC0-1.0", recipe=recipe))
    print(f"{path.name:27} {path.stat().st_size:7,} B  edge delta {seam}")
    return a


def torus_shape(draw, kind, box, fill, outline=None, width=1):
    """Raster a feature with all eight wrapped neighbours, never a clipped seam."""
    x0,y0,x1,y1 = box
    for dx in (-N+1, 0, N-1):
        for dy in (-N+1, 0, N-1):
            getattr(draw, kind)((x0+dx,y0+dy,x1+dx,y1+dy), fill=fill, outline=outline, width=width)


def torus_line(draw, points, fill, width=1):
    for dx in (-N+1, 0, N-1):
        for dy in (-N+1, 0, N-1):
            draw.line([(x+dx,y+dy) for x,y in points], fill=fill, width=width)


def asphalt():
    coarse = noise(4, SEED)*3 + noise(18, SEED+1)*4
    aggregate = noise(92, SEED+2)
    grain = np.round(aggregate*3)*2
    fine = coarse + grain
    a = color((58, 64, 68), fine)
    # Subtle pale mineral inclusions, carried by a toroidal field.
    a += (aggregate > .62)[:, :, None]*8
    clean = save("asphalt-clean", a, "Clean fine aggregate circuit asphalt", [4,4], .94,
                 recipe="Periodic 4/18/92-cell value noise and quantized mineral aggregate.")
    rubber = np.zeros((N,N))
    for center in (.33,.57):
        dist = np.minimum(np.abs(U-center-.045*np.sin(2*math.pi*V)), 1-np.abs(U-center-.045*np.sin(2*math.pi*V)))
        band = np.exp(-(dist/.032)**6)
        tread = .72+.28*(np.sin(2*math.pi*V*29+.4*np.sin(U*math.pi*8))>-.25)
        rubber += band*tread*(.82+.18*noise(9,SEED+3))
    save("asphalt-skid", a-rubber[:,:,None]*np.array([20,21,20]),
         "Asphalt with paired continuous rubber arcs", [4,4], .92,
         recipe="Clean asphalt plus two periodic sinusoidal rubber tracks with tread interruptions.")
    pits = color((68,75,80), coarse + grain*.8)
    stains = (noise(3,SEED+4)>.31)*(noise(5,SEED+5)+1)*3
    pits -= stains[:,:,None]
    save("asphalt-pits", pits, "Paddock / pit-lane asphalt with restrained oil mottling", [4,4], .9,
         recipe="Periodic compacted aggregate with low contrast oil stains; no painted branding.")


def kerb():
    red = (np.cos(U*math.pi*4) >= 0).astype(float)
    paint = np.array((222,222,207))[None,None,:]*(1-red[:,:,None]) + np.array((183,44,37))[None,None,:]*red[:,:,None]
    wear = noise(6,SEED+10)*5 + noise(73,SEED+11)*5
    ridge = 3*np.cos(V*math.pi*4)
    paint += (wear+ridge)[:,:,None]
    save("kerb-red-white", paint, "Red-white raised kerb paint", [2,1], .82,
         recipe="Four alternating periodic paint bands with concrete grain; stripes cross U.")
    # Height derivatives are analytic on the inclusive periodic lattice. The small
    # high-frequency component suggests brushed paint without heavy visual bumps.
    dx = -.011*8*math.pi*np.sin(U*math.pi*8)
    dy = -.045*4*math.pi*np.sin(V*math.pi*4) -.004*24*math.pi*np.sin(V*math.pi*24)
    normal = np.stack((-dx, -dy, np.ones_like(U)), axis=2)
    normal /= np.linalg.norm(normal,axis=2)[:,:,None]
    encoded = np.rint((normal*.5+.5)*255).astype(np.uint8)
    save("kerb-normal", encoded, "Kerb tangent-space normal (+Y/OpenGL)", [2,1], .82,
         space="linear", recipe="Analytic derivative of periodic kerb ribs; RGB tangent normal, positive green Y.")


def gravel():
    a = color((148,135,110), noise(4,SEED+20)*10+noise(40,SEED+21)*6).astype(np.uint8)
    im=Image.fromarray(a); d=ImageDraw.Draw(im); rng=random.Random(SEED+22)
    palette=[(173,159,133),(190,177,151),(141,133,115),(165,158,138),(204,189,155),(157,144,117),(115,112,101)]
    for _ in range(1450):
        x,y=rng.randrange(N-1),rng.randrange(N-1); rx,ry=rng.randrange(1,4),rng.randrange(1,3)
        c=palette[rng.randrange(len(palette))]
        torus_shape(d,"ellipse",(x-rx,y-ry,x+rx,y+ry),tuple(max(0,v-28) for v in c))
        torus_shape(d,"ellipse",(x-rx,y-ry,x+rx-1,y+ry-1),c)
    save("gravel-runoff", np.asarray(im).copy(), "Rounded dry runoff gravel", [2,2], .99,
         recipe="1,450 original toroidally wrapped pebble ellipses over periodic sand.")


def grasses():
    for i,base in enumerate(((73,106,46),(88,111,48),(53,92,52)),1):
        a = color(base, noise(4,SEED+30+i)*9+noise(20,SEED+34+i)*5, (1,1,.65))
        im=Image.fromarray(np.clip(a,0,255).astype(np.uint8)); d=ImageDraw.Draw(im); rng=random.Random(SEED+40+i)
        for k in range(3800):
            x,y=rng.randrange(N-1),rng.randrange(N-1)
            tilt=rng.choice((-2,-1,1,2)); length=rng.randrange(2,6)
            delta=rng.choice((-13,-7,4,10,17))
            c=tuple(max(0,min(255,v+delta)) for v in base)
            torus_line(d,[(x,y),(x+tilt,y-length)],c)
        save(f"grass-{i:02}", np.asarray(im).copy(), ("Circuit turf / cool green","Circuit turf / dry olive","Circuit turf / deep shaded")[i-1], [2,2], .99,
             recipe="Periodic low frequency turf field plus 3,800 independently drawn wrapped grass blades.")


def concrete():
    a = color((153,157,153),noise(3,SEED+50)*10+noise(24,SEED+51)*6+noise(95,SEED+52)*4)
    # Shallow casting seams meet at both borders and a restrained aggregate field.
    seam = np.exp(-(np.sin(math.pi*V*2)/.045)**2)
    a -= seam[:,:,None]*12
    a -= (noise(92,SEED+53)>.65)[:,:,None]*14
    save("concrete-barrier", a,"Cast concrete protection wall",[4,2],.97,
         recipe="Periodic cement mottling, pores and shallow casting seams, no baked directional light.")


def tires():
    # Continuous zigzag tread whose edges reconnect in U and V.
    treadphase = (V*8 + np.abs(((U*4+.5)%1)-.5)*.7)%1
    grooves=(treadphase<.16).astype(float)
    a=color((39,42,43),noise(6,SEED+60)*3+noise(65,SEED+61)*2)
    a-=grooves[:,:,None]*10
    a+=((treadphase>.18)&(treadphase<.25))[:,:,None]*4
    save("tire-barrier",a,"Rubber barrier tire tread",[1,1],.94,
         recipe="Periodic four-column chevron tread with original rubber grain; no sidewall lettering.")


def paints():
    grain=noise(8,SEED+70)*3+noise(81,SEED+71)*5
    wear=(noise(50,SEED+72)>.61)[:,:,None]
    for name,base in (("white",(227,228,215)),("yellow",(226,180,43))):
        a=color(base,grain)
        a-=wear*11
        save(f"paint-{name}",a,f"{name.title()} circuit line paint (opaque strip material)",[1,1],.86,
             recipe="Original periodic worn paint surface; use on a narrow strip mesh, not an alpha decal.")


def crowd():
    im=Image.new("RGB",(512,256),(37,49,63)); d=ImageDraw.Draw(im); rng=random.Random(SEED+80)
    shirts=[(223,78,56),(226,183,71),(90,153,169),(224,224,206),(106,114,184),(74,155,124)]
    skins=[(228,179,139),(190,130,94),(132,84,63),(244,201,158)]
    for row in range(7):
        y0=16+row*32
        d.rectangle((0,y0,511,y0+31),fill=(40+row,53+row,66+row))
        d.line((0,y0+30,511,y0+30),fill=(80,93,103),width=2)
        for person in range(28):
            x=person*18+10+rng.choice((-1,0,1)); y=y0+12+rng.choice((-1,0,1))
            shirt=shirts[rng.randrange(len(shirts))]; skin=skins[rng.randrange(len(skins))]
            hair=rng.choice(((39,31,28),(89,63,42),(179,139,67),(47,47,48)))
            # Every figure is imagined: simple ink outlines, no reference likeness.
            d.rounded_rectangle((x-5,y+4,x+5,y+17),radius=3,fill=(21,30,40))
            d.polygon([(x-4,y+5),(x+4,y+5),(x+5,y+13),(x-5,y+13)],fill=shirt)
            d.line((x-3,y+15,x-4,y+23),fill=(23,34,48),width=3)
            d.line((x+3,y+15,x+4,y+23),fill=(23,34,48),width=3)
            d.ellipse((x-4,y-3,x+4,y+5),fill=(24,28,33))
            d.ellipse((x-3,y-2,x+3,y+5),fill=skin)
            d.pieslice((x-4,y-4,x+4,y+4),180,350,fill=hair)
            # Small highlights read as illustration at track-side distances.
            d.line((x-2,y+7,x-2,y+12),fill=tuple(min(255,v+20) for v in shirt),width=1)
            cheering=(person+row)%5==0
            if cheering:
                d.line((x-5,y+7,x-8,y-1),fill=shirt,width=3)
                d.ellipse((x-9,y-4,x-6,y-1),fill=skin)
                d.line((x+5,y+7,x+8,y),fill=shirt,width=3)
                d.ellipse((x+7,y-3,x+10,y),fill=skin)
            else:
                d.line((x-5,y+7,x-6,y+13),fill=shirt,width=2)
                d.line((x+5,y+7,x+6,y+13),fill=shirt,width=2)
    save("crowd-atlas", np.asarray(im).copy(),"Seven rows of anonymous original cartoon spectators",None,.96,tiled=False,
         recipe="196 invented ink-and-flat-colour spectators drawn from primitive strokes; no photos or real identities. Seven 32px bands begin at image y=16.")
    INFO[-1]["bandsTopLeftPixels"]=[[0,16+row*32,512,48+row*32] for row in range(7)]
    INFO[-1]["gltfVRange"]=[[round((16+row*32)/256,6),round((48+row*32)/256,6)] for row in range(7)]


def sponsor():
    im=Image.new("RGB",(512,256),(25,44,58)); d=ImageDraw.Draw(im)
    d.rectangle((10,10,501,245),outline=(234,170,58),width=5)
    d.polygon([(15,15),(132,15),(15,132)],fill=(40,62,75))
    d.polygon([(496,240),(379,240),(496,123)],fill=(40,62,75))
    # Bespoke capital-letter outlines. No installed or downloaded font is used.
    glyphs={
      "R":[[(0,1),(0,0),(0.66,0),(0.88,.12),(.88,.43),(.65,.55),(0,.55)],[(.48,.55),(.94,1)]],
      "A":[[(0,1),(.43,0),(.62,0),(1,1)],[(.22,.62),(.8,.62)]],
      "C":[[(.95,.16),(.75,0),(.18,0),(0,.2),(0,.8),(.18,1),(.75,1),(.95,.84)]],
      "E":[[(.9,0),(0,0),(0,1),(.9,1)],[(0,.48),(.75,.48)]]}
    for j,char in enumerate("RACE"):
        x=60+j*102; y=83
        for stroke in glyphs[char]:
            pts=[(round(x+u*76),round(y+v*92)) for u,v in stroke]
            d.line(pts,fill=(237,234,213),width=12,joint="curve")
            for p in (pts[0],pts[-1]):d.ellipse((p[0]-5,p[1]-5,p[0]+5,p[1]+5),fill=(237,234,213))
    d.rectangle((62,195,447,201),fill=(234,170,58))
    for j in range(6):
        x=193+j*22
        d.polygon([(x,39),(x+12,39),(x+5,52),(x-7,52)],fill=(234,170,58))
    save("sponsor-race",np.asarray(im).copy(),"Generic RACE board artwork",None,.8,tiled=False,
         recipe="Original navy/orange geometry and bespoke RACE letter strokes; no font file, brand or external source.")


def main():
    OUT.mkdir(exist_ok=True)
    asphalt(); kerb(); gravel(); grasses(); concrete(); tires(); paints(); crowd(); sponsor()
    result=dict(generator="build_textures.py",seed=SEED,license="CC0-1.0",textures=INFO,
                totalBytes=sum(t["bytes"] for t in INFO),normalConvention="OpenGL tangent space +Y; do not apply sRGB decoding",
                edgeMethod="Inclusive periodic noise lattice and wrapped raster features; lossless encoding retains identical opposite border pixels.")
    (HERE/"textures-info.json").write_text(json.dumps(result,indent=2)+"\n")
    print(f"Total texture bytes: {result['totalBytes']:,}")

if __name__ == "__main__":
    main()
