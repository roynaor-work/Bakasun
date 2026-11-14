"""Original deterministic city weather sprites. Python 3 + Pillow + NumPy.

python3 workout/island/design/city-weather-v1/source/build.py
All writes are confined to this new asset package. No downloaded art, fonts,
models, or generative-image services are used to make the effect textures.
"""
from pathlib import Path
import hashlib
import json
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SS = 3
SIZE = 1024
LIMIT = 600_000  # Decimal KB, stricter than 600 KiB.
PALETTE = {"grass": "#789f67", "sand": "#e8d3a6", "sea": "#237e87",
           "stone": "#b5ab8e", "cream": "#fff4dc", "teal": "#287a83",
           "coral": "#c68469", "gold": "#eac276", "ink": "#314c59"}
atlases = {}
effects = {}


def rgba(value, alpha=255):
    return tuple(int(value[i:i+2], 16) for i in (1, 3, 5)) + (int(max(0, min(255, alpha))),)


def mix(a,b,t):
    values=[round(x+(y-x)*t) for x,y in zip(rgba(a)[:3],rgba(b)[:3])]
    return "#"+"".join(f"{v:02x}" for v in values)


class Art:
    def __init__(self, w, h):
        self.size = (w, h)
        self.image = Image.new("RGBA", (w*SS, h*SS))
        self.d = ImageDraw.Draw(self.image)

    def ellipse(self, box, color, alpha=255):
        self.d.ellipse(tuple(round(x*SS) for x in box), fill=rgba(color, alpha))

    def polygon(self, points, color, alpha=255):
        self.d.polygon([(round(x*SS), round(y*SS)) for x, y in points], fill=rgba(color, alpha))

    def line(self, points, color, width=1, alpha=255):
        self.d.line([(round(x*SS), round(y*SS)) for x, y in points],
                    fill=rgba(color, alpha), width=max(1, round(width*SS)), joint="curve")

    def curve(self, points, color, width=1, alpha=255):
        # Cubic Bezier, sampled at subpixel precision for consistent silhouettes.
        a, b, c, d = points
        self.line([((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0],
                    (1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1])
                   for t in np.linspace(0, 1, 32)], color, width, alpha)

    def finish(self):
        return self.image.resize(self.size, Image.Resampling.LANCZOS)


def glow(image, radius=2.6, gain=.4):
    blurred = image.filter(ImageFilter.GaussianBlur(radius))
    blurred.putalpha(blurred.getchannel("A").point(lambda a: round(a*gain)))
    return Image.alpha_composite(blurred, image)


def sparkle(art, x, y, radius, color, alpha=255):
    art.polygon([(x,y-radius),(x+radius*.26,y-radius*.26),(x+radius,y),
                 (x+radius*.26,y+radius*.26),(x,y+radius),(x-radius*.26,y+radius*.26),
                 (x-radius,y),(x-radius*.26,y-radius*.26)], color, alpha)


def new_atlas(name):
    atlases[name] = {"image": Image.new("RGBA", (SIZE,SIZE)), "frames": {}}


def add(effect, image, atlas, x, y, cell_w, cell_h, **meta):
    """Two pixels of extrusion around an untrimmed frame, no rotation."""
    assert image.mode == "RGBA"
    normalized=np.array(image)
    normalized[normalized[:,:,3]==0,:3]=0
    image=Image.fromarray(normalized)
    w, h = image.size
    assert w == cell_w-4 and h == cell_h-4
    record = atlases[atlas]
    canvas = record["image"]
    canvas.paste(image, (x+2,y+2))
    # Extrude edge texels, including alpha, to avoid linear sampling fringes.
    canvas.paste(image.crop((0,0,w,1)).resize((w,2),Image.Resampling.NEAREST),(x+2,y))
    canvas.paste(image.crop((0,h-1,w,h)).resize((w,2),Image.Resampling.NEAREST),(x+2,y+h+2))
    canvas.paste(image.crop((0,0,1,h)).resize((2,h),Image.Resampling.NEAREST),(x,y+2))
    canvas.paste(image.crop((w-1,0,w,h)).resize((2,h),Image.Resampling.NEAREST),(x+w+2,y+2))
    for dx,dy,sx,sy in [(0,0,0,0),(w+2,0,w-1,0),(0,h+2,0,h-1),(w+2,h+2,w-1,h-1)]:
        canvas.paste(image.getpixel((sx,sy)),(x+dx,y+dy,x+dx+2,y+dy+2))
    if effect not in effects:
        effects[effect] = {"atlas": atlas, "frames": [], "fps": 0, "loop": False,
                           "pivot": [.5,.5], "layer": "foreground", "blend": "source-over", **meta}
    index = len(effects[effect]["frames"])
    key = f"{effect}/{index:02d}"
    file = f"sprites/{key}.png"
    target = ROOT / file
    target.parent.mkdir(parents=True,exist_ok=True)
    image.save(target, optimize=True, compress_level=9)
    frame = {"id": key, "rect": [x+2,y+2,w,h], "file": file,
             "sourceSize": [w,h], "trimmed": False, "rotated": False}
    effects[effect]["frames"].append(frame)
    record["frames"][key] = {"frame": {"x":x+2,"y":y+2,"w":w,"h":h},
        "rotated":False,"trimmed":False,"spriteSourceSize":{"x":0,"y":0,"w":w,"h":h},
        "sourceSize":{"w":w,"h":h}, "pivot":{"x":.5,"y":.5}}


def rain(n, count):
    art = Art(124,124)
    rng = random.Random(831)
    for _ in range(count):
        x = (rng.random()*124 - n*15.5) % 124
        y = (rng.random()*124 + n*31) % 124
        length = rng.uniform(8,17)
        alpha = rng.randint(55,155)
        for dx in (-124,0,124):
            for dy in (-124,0,124):
                art.line([(x+dx,y+dy),(x+dx-length*.5,y+dy+length)], "#c9e5e9",1,alpha)
                art.line([(x+dx,y+dy),(x+dx-length*.25,y+dy+length*.5)], "#f1f7ec",.55,alpha*.6)
    return art.finish()


def snow(n):
    art = Art(124,124)
    rng = random.Random(134)
    for i in range(21):
        phase=rng.random()*math.tau
        x=(rng.random()*124+4*math.sin(phase+n*math.tau/8))%124
        y=(rng.random()*124+n*15.5)%124
        radius=rng.uniform(.8,2.1)
        alpha=rng.randint(145,240)
        for dx in (-124,0,124):
            for dy in (-124,0,124):
                xx,yy=x+dx,y+dy
                art.ellipse((xx-radius,yy-radius,xx+radius,yy+radius),"#fff4dc",alpha)
                if i%5==0:
                    for angle in (0,math.pi/3,2*math.pi/3):
                        a,b=math.cos(angle)*3,math.sin(angle)*3
                        art.line([(xx-a,yy-b),(xx+a,yy+b)],"#e7f5f4",.65,210)
    return art.finish()


def fog(n):
    y,x=np.mgrid[0:124,0:500]
    phase=n*math.tau/4
    # Periodic on both axes; analytic haze rather than opaque cloud cards.
    wave=(np.sin(x/500*math.tau+phase)*.28 +
          np.sin(x/500*math.tau*2-y/124*math.tau+phase)*.18 +
          np.cos(y/124*math.tau)*.3+.48)
    data=np.empty((124,500,4),np.uint8)
    data[:,:,:3]=[218,232,222]
    data[:,:,3]=np.clip(wave*78+28,0,120).astype(np.uint8)
    return Image.fromarray(data)


def stars(n):
    art=Art(252,252)
    rng=random.Random(849)
    for i in range(40):
        x,y=rng.uniform(8,244),rng.uniform(8,244)
        alpha=145+90*math.sin(n*math.tau/4+i*2.4)
        r=rng.uniform(.55,1.25)
        if i%9==0:sparkle(art,x,y,3.5,"#fff4dc",alpha)
        else:art.ellipse((x-r,y-r,x+r,y+r),"#e7ede0",alpha)
    return glow(art.finish(),1.4,.25)


def gradient(stops, night=False):
    width,height=844,390
    data=np.empty((height,width,4),np.uint8)
    for y in range(height):
        t=y/(height-1)
        a,b=next((a,b) for a,b in zip(stops,stops[1:]) if a[0]<=t<=b[0])
        blend=(t-a[0])/(b[0]-a[0])
        ca,cb=np.array(rgba(a[1])[:3]),np.array(rgba(b[1])[:3])
        data[y,:,:3]=np.round(ca+(cb-ca)*blend)
        data[y,:,3]=255
    result=Image.fromarray(data)
    if not night:
        light=Art(width,height)
        # A restrained setting sun, matching the cream and sand city materials.
        light.ellipse((596,94,636,134),"#fff4dc",220)
        result=Image.alpha_composite(result,glow(light.finish(),18,.22))
    return result


def cloud(kind):
    art=Art(252,124)
    # Layered, soft sculptural forms with a warm lower plane and no dark outline.
    forms=[[(36,59,112,105),(70,30,153,107),(118,48,202,108),(161,65,223,108)],
           [(22,65,105,107),(62,43,137,108),(102,25,184,108),(154,58,235,108)],
           [(34,61,109,104),(83,41,159,106),(125,61,213,106)]][kind]
    for b in forms:art.ellipse(b,"#b9cfca",225)
    for x1,y1,x2,y2 in forms:art.ellipse((x1,y1,x2,y2-10),"#eceddb",245)
    for x1,y1,x2,y2 in forms[:-1]:art.ellipse((x1+5,y1+2,x2-12,y2-22),"#fff4dc",230)
    return art.finish().filter(ImageFilter.GaussianBlur(.5))


def bird(n):
    art=Art(124,124)
    flap=math.sin(n*math.tau/8)
    wing_y=56-flap*27
    # A small distant gull silhouette: the city has no reusable bird mesh.
    art.polygon([(60,65),(48,60),(16,wing_y),(30,wing_y+12),(55,72),(68,72)],"#587777")
    art.polygon([(62,64),(75,58),(110,wing_y-3),(98,wing_y+12),(70,73),(60,74)],"#314c59")
    art.ellipse((53,62,77,76),"#e8d3a6")
    art.ellipse((67,60,78,70),"#fff4dc")
    art.polygon([(76,64),(86,67),(76,69)],"#c68469")
    art.polygon([(55,69),(39,74),(53,75)],"#314c59")
    return art.finish()


def butterfly(n, color):
    art=Art(124,124)
    span=9+29*(.5+.5*math.cos(n*math.tau/8))
    for side in (-1,1):
        cx=62+side*span*.62
        art.ellipse((cx-span*.63,31,cx+span*.63,70),color)
        art.ellipse((cx-span*.48,63,cx+span*.48,92),color)
        art.ellipse((cx-span*.43,36,cx+span*.3,59),mix(color,"#fff4dc",.32))
        for dx,dy in [(0,43),(.3,53),(.2,77)]:
            x=cx+side*span*dx
            art.ellipse((x-2,dy-2,x+2,dy+2),"#fff4dc",210)
        art.line([(62,60),(cx,40)],mix(color,"#314c59",.24),.8)
    art.ellipse((59,51,65,83),"#314c59")
    art.ellipse((58,47,66,56),"#314c59")
    for side in (-1,1):art.curve([(62,51),(62+side*3,43),(62+side*9,40),(62+side*10,44)],"#314c59",1.1)
    return art.finish()


def balloon(n, color):
    art=Art(124,124)
    sway=3*math.sin(n*math.tau/4)
    # String and knot stay at a stable anchor while the envelope rocks gently.
    art.curve([(62+sway,79),(52-sway,94),(75+sway,105),(60,118)],"#8e947f",1.2,210)
    art.ellipse((31+sway,9,91+sway,79),color)
    # Faceted inset shadow, restrained glossy highlight.
    art.polygon([(74+sway,17),(89+sway,34),(88+sway,58),(65+sway,79),(72+sway,59)],mix(color,"#314c59",.22))
    art.ellipse((40+sway,17,57+sway,45),mix(color,"#fff4dc",.42))
    art.ellipse((43+sway,19,50+sway,31),mix(color,"#fff4dc",.58))
    art.polygon([(62+sway,76),(56+sway,84),(67+sway,84)],color)
    return art.finish()


def confetti(n, color):
    art=Art(60,60)
    angle=n*math.tau/8
    rng=random.Random(491)
    for i in range(5):
        x,y=rng.uniform(10,50),rng.uniform(10,50)
        turn=angle+i*.8
        half=1.1+2.3*abs(math.cos(turn))
        pts=[(-half,-5),(half,-5),(half,5),(-half,5)]
        art.polygon([(x+a*math.cos(turn)-b*math.sin(turn),y+a*math.sin(turn)+b*math.cos(turn)) for a,b in pts],color)
        art.line([(x,y-3),(x+math.sin(turn)*2,y)],"#fff4dc",.8,110)
    return art.finish()


FIREWORKS=[("peony-gold","#eac276"),("chrysanthemum-coral","#df947d"),
           ("ring-teal","#75c9bd"),("willow-gold","#d9b76e"),("heart-coral","#df947d")]


def firework(kind, n, color):
    art=Art(248,248)
    if n<2:
        y=211-n*59
        art.line([(124,234),(124,y+5)],color,1.6,150)
        sparkle(art,124,y,4,"#fff4dc")
        for k in range(6):art.ellipse((121-k%2,y+10+k*3,123+k%2,y+12+k*3),color,180-k*22)
        return glow(art.finish(),2,.35)
    if n==2:
        sparkle(art,124,110,11,"#fff4dc",240)
        sparkle(art,124,110,19,color,90)
        return glow(art.finish(),3,.4)
    t=(n-2)/9
    radius=99*(1-math.exp(-3*t))
    alpha=255*max(.02,(1-t)**.68)
    rng=random.Random(761+kind*41)
    count=[48,48,46,34,56][kind]

    def position(i,u):
        angle=i/count*math.tau-math.pi/2
        speed=1 if kind in (2,4) else .76+.24*math.sin(i*7.13)**2
        r=radius*u*speed
        if kind==4:
            a=angle+math.pi/2
            hx=16*math.sin(a)**3/18
            hy=-(13*math.cos(a)-5*math.cos(2*a)-2*math.cos(3*a)-math.cos(4*a))/18
            return 124+hx*r,104+hy*r+7*t*t
        if kind==3:
            return 124+math.cos(angle)*r*.88,91+math.sin(angle)*r*.58+u*u*t*66
        if kind==1:angle+=u*.2*math.sin(i*2.3)
        return 124+math.cos(angle)*r,110+math.sin(angle)*r*(.67 if kind==2 else .83)+t*t*12

    for i in range(count):
        head=position(i,1)
        tail=.62 if kind==3 else .78
        shade=color if i%4 else "#fff4dc"
        points=[position(i,u) for u in np.linspace(tail,1,9)]
        art.line(points,shade,2.4,alpha*.22)
        art.line(points,shade,1.1,alpha*.72)
        art.ellipse((head[0]-1.1,head[1]-1.1,head[0]+1.1,head[1]+1.1),"#fff4dc",alpha)
        if kind in (0,1) and i%2==0:
            a=rng.random()*math.tau;r=radius*rng.uniform(.28,.65)
            x,y=124+math.cos(a)*r,110+math.sin(a)*r
            art.ellipse((x-.8,y-.8,x+.8,y+.8),shade,alpha*.65)
        if n in (5,7,9) and i%11==0:sparkle(art,*head,2.6,shade,alpha)
    return glow(art.finish(),2.6,.35)


def main():
    for name in ["weather","ambient","sky"]+[f"fireworks-{i+1:02d}" for i in range(5)]:new_atlas(name)
    for row,(name,count) in enumerate([("rain-light",14),("rain-medium",36),("rain-heavy",72)]):
        for n in range(8):add(name,rain(n,count),"weather",n*128,row*128,128,128,
            fps=12,loop=True,layer="precipitation",tile=True,particlesPerTile=count,
            recommendedOpacity=[.65,.78,.9][row],displayTileSize=[186,186])
    for n in range(8):add("snow",snow(n),"weather",n*128,384,128,128,
        fps=4,loop=True,layer="precipitation",tile=True,displayTileSize=[186,186],recommendedOpacity=.8)
    for n in range(4):add("fog",fog(n),"weather",n%2*512,512+n//2*128,504,128,
        fps=1,loop=True,layer="haze",tile=True,crossfade=True,displayTileSize=[844,210],recommendedOpacity=.68)
    for n in range(4):add("stars",stars(n),"weather",n*256,768,256,256,
        fps=2,loop=True,layer="sky-detail",tile=True,displayTileSize=[252,252],recommendedOpacity=.7)
    sunset=[[0,"#537585"],[.25,"#b6a296"],[.46,"#efc59e"],[.7,"#e8d3a6"],[1,"#e8d3a6"]]
    night=[[0,"#122936"],[.28,"#244653"],[.54,"#40656b"],[1,"#65887f"]]
    add("sky-sunset",gradient(sunset),"sky",0,0,848,394,layer="background",gradientStops=sunset,opaqueContent=True)
    add("sky-night",gradient(night,True),"sky",0,396,848,394,layer="background",gradientStops=night,opaqueContent=True)
    for n in range(3):add(f"cloud-{n+1}",cloud(n),"ambient",n*256,0,256,128,layer="clouds",recommendedWidth=190)
    for n in range(8):add("birds",bird(n),"ambient",n*128,128,128,128,fps=10,loop=True,layer="life",recommendedWidth=39)
    colors=[("coral",PALETTE["coral"]),("gold",PALETTE["gold"]),("teal",PALETTE["teal"])]
    for row,(name,color) in enumerate(colors):
        for n in range(8):add(f"butterflies-{name}",butterfly(n,color),"ambient",n*128,256+row*128,128,128,
            fps=12,loop=True,layer="life",recommendedWidth=27,color=color)
    for row,(name,color) in enumerate(colors):
        for n in range(4):
            i=row*4+n
            add(f"balloons-{name}",balloon(n,color),"ambient",i%8*128,640+i//8*128,128,128,
                fps=3,loop=True,layer="celebration",recommendedWidth=66,color=color)
    for row,(name,color) in enumerate(colors):
        for n in range(8):
            i=row*8+n
            add(f"confetti-{name}",confetti(n,color),"ambient",i%16*64,896+i//16*64,64,64,
                fps=10,loop=True,layer="celebration",recommendedWidth=42,color=color)
    for i,(name,color) in enumerate(FIREWORKS):
        for n in range(12):add(f"fireworks-{name}",firework(i,n,color),f"fireworks-{i+1:02d}",
            n%4*256,n//4*256,252,252,fps=12,loop=False,layer="fireworks",color=color,
            recommendedWidth=206,durationMs=1000,minRepeatIntervalMs=3000)

    manifest={"schemaVersion":1,"id":"city-weather-v1","version":"1.0.0",
        "referenceCommit":"11fef2fb98eec4173381346caee94f2930f9cffa",
        "preview":{"file":"preview.html","viewport":[844,390],"cityReference":"preview/city-reference.png",
                   "referenceOnly":True,"requiresIntegration":True},
        "license":"LICENSE.txt","colorSpace":"sRGB","alphaMode":"straight",
        "premultiplyAlphaOnUpload":False,"atlasSize":[1024,1024],"maxAtlasBytes":LIMIT,
        "paddingPx":2,"extrudedEdges":True,"texture":{"filter":"linear","wrap":"clamp-to-edge","mipmaps":False},
        "coordinateSystem":"top-left; rect = [x,y,width,height]; pivot normalized to the untrimmed frame",
        "palette":PALETTE,"layerOrder":["background","sky-detail","clouds","city","life","fireworks","haze","precipitation","celebration","ui"],
        "integration":{"sky":"Draw opaque gradients behind the city, or use the gradient stops in the existing sky shader.",
            "tiling":"Repeat cropped frame content, never the entire atlas. Display sizes are CSS pixels at 844x390.",
            "time":"Loop frame = floor(elapsedSeconds * fps) % frames.length. Once: stop after frames.length/fps seconds.",
            "fog":"Crossfade adjacent frames. Use a shallow horizon/depth mask to keep buildings readable.",
            "motion":"Honor prefers-reduced-motion: use static weather and omit fireworks, confetti and balloon drift.",
            "depth":"Birds and butterflies are ambient billboards. Apply world/depth occlusion if placed among buildings.",
            "gpu":"All textures use normal source-over; disable depthWrite for translucent billboards. Keep UI above effects.",
            "memory":"Each RGBA8 atlas occupies 4 MiB decoded. Load weather + ambient on demand; only load a selected firework and sky when needed."},
        "atlases":{},"effects":effects}
    for name,record in atlases.items():
        folder=ROOT/"atlases";folder.mkdir(exist_ok=True)
        dest=folder/f"{name}.png"
        # Clear RGB outside alpha to prevent color fringes in straight-alpha sampling.
        arr=np.array(record["image"]);arr[arr[:,:,3]==0,:3]=0
        Image.fromarray(arr).save(dest,optimize=True,compress_level=9)
        size=dest.stat().st_size
        assert size<=LIMIT,(name,size)
        entry={"file":f"atlases/{name}.png","size":[SIZE,SIZE],"bytes":size,
               "sha256":hashlib.sha256(dest.read_bytes()).hexdigest(),"format":"RGBA8 PNG",
               "frames":len(record["frames"]),"metadata":f"atlases/{name}.json"}
        manifest["atlases"][name]=entry
        (folder/f"{name}.json").write_text(json.dumps({"frames":record["frames"],"meta":{
            "app":"city-weather-v1 original deterministic authoring","version":"1.0.0",
            "image":f"{name}.png","format":"RGBA8888","size":{"w":SIZE,"h":SIZE},"scale":"1"}},indent=2)+"\n")
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    # Classic scripts let the review HTML open via file:// as well as HTTP.
    (ROOT/"preview-data.js").write_text("window.CITY_WEATHER_MANIFEST="+json.dumps(manifest,ensure_ascii=False,separators=(",",":"))+";\n")
    print(json.dumps({"atlases":{n:a["bytes"] for n,a in manifest["atlases"].items()},
                      "effects":len(effects),"frames":sum(len(v["frames"]) for v in effects.values())},indent=2))


if __name__=="__main__":main()
