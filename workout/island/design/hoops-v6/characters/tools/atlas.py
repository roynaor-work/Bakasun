"""Pack repository MakeHuman surface maps into 1024 px character PBR atlases.

Run with system Python (Pillow + NumPy). Pixel rectangles use top-left origin.
UV mapping for a tile (x,y,w,h): (u*w+x, v*h+1024-y-h)/1024.
The lower atlas half is neutral cloth, suitable for runtime team tinting.
"""
from pathlib import Path
import io, json, math, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[4]
SOURCE = REPO / 'workout/island/design/hoops-v4/assets/players'
TILES = {
    'skin': [0, 0, 512, 512],
    'shoes': [512, 0, 256, 256],
    'hair': [768, 0, 256, 256],
    'eyes': [512, 256, 128, 128],
    'eyebrows': [640, 256, 128, 128],
    'eyelashes': [768, 256, 128, 128],
    'solid': [896, 256, 128, 128],
    'jersey': [0, 512, 512, 512],
    'shorts': [512, 512, 512, 512],
}
PROFILES = {'pg': ('pg', '01'), 'sg': ('sg', '02'), 'sf': ('sf', '03'),
            'pf': ('pf', '04'), 'c': ('c', '05'), 'referee': ('sg', None)}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'

def images_from_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+size])
    binary = data[28+size:]
    result = {}
    for im in gltf.get('images', []):
        view = gltf['bufferViews'][im['bufferView']]
        start = view.get('byteOffset', 0)
        result[im['name']] = Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGBA')
    return result

def choose(images, keys):
    for k in keys:
        for name, value in images.items():
            if k in name.lower():
                return value
    return None

def put(base, label, img, alpha=False):
    x, y, w, h = TILES[label]
    if img is None:
        img = Image.new('RGBA', (w, h), (34, 25, 23, 255))
    else:
        img = img.resize((w, h), Image.Resampling.LANCZOS)
    if label == 'skin':
        # Source CC0 atlas includes a vertical author website outside UV islands.
        # Keep attribution in LICENSES; remove lettering from the visual atlas.
        patch = img.crop((w-22, 0, w-12, h)).resize((12, h))
        img.paste(patch, (w-12, 0))
    if not alpha:
        img.putalpha(255)
    base.paste(img, (x, y))

def cloth_tile(number, referee=False, shorts=False):
    y, x = np.mgrid[0:512, 0:512]
    weave = 2.0*np.sin(x*math.pi/2)*np.cos(y*math.pi/2)
    folds = 5.5*np.sin(x*.041 + .8*np.sin(y*.017)) + 3*np.sin(y*.047 + x*.004)
    shade = np.clip(237 + weave + folds, 214, 251).astype(np.uint8)
    rgba = np.stack([shade, shade, shade, np.full_like(shade,255)],axis=-1)
    tile = Image.fromarray(rgba)
    draw = ImageDraw.Draw(tile)
    if referee and not shorts:
        # Generic alternating official stripes; no badge or lettering.
        for xx in range(-32, 544, 64):
            draw.rectangle((xx,0,xx+30,511),fill=(30,34,39,255))
    elif referee and shorts:
        tile = Image.new('RGBA', (512,512),(36,40,45,255))
        draw = ImageDraw.Draw(tile)
    # Tailored side piping and two stitched hem lines.
    piping=(68,71,75,255) if referee else (188,190,191,255)
    for xx in [13,18,494,499]:
        draw.line([(xx,0),(xx+int(4*math.sin(xx)),511)], fill=piping,width=2)
    for yy in [491,497]:
        draw.line((12,yy,500,yy), fill=piping,width=2)
    if shorts:
        draw.rectangle((0,0,511,20),fill=(168,171,175,255) if not referee else (27,31,36,255))
        draw.line((256,22,247,68),fill=(218,220,220,255),width=3)
        draw.line((256,22,266,69),fill=(218,220,220,255),width=3)
        if number:
            f=ImageFont.truetype(FONT,74)
            draw.text((360,348),number,font=f,fill=(30,36,44,255),stroke_width=1)
    elif number:
        font=ImageFont.truetype(FONT,187)
        bounds=draw.textbbox((0,0),number,font=font,stroke_width=4)
        px=(512-(bounds[2]-bounds[0]))/2-bounds[0]
        py=176-bounds[1]
        draw.text((px,py),number,font=font,fill=(23,30,40,255),stroke_width=4,stroke_fill=(107,111,117,255))
    return tile

def normal_and_orm(profile):
    yy, xx = np.mgrid[0:1024, 0:1024]
    height=np.zeros((1024,1024),dtype=float)
    # Smooth micro relief in the source skin region; independent deterministic pores.
    sy,sx=np.mgrid[0:512,0:512]
    height[:512,:512]=.035*(np.sin(sx*1.19+sy*.83)+np.sin(sx*.73-sy*1.31))
    # Tangent space weave runs at 4-pixel thread spacing, with seam ridges.
    for tile in ['jersey','shorts']:
        tx,ty,tw,th=TILES[tile]
        y,x=np.mgrid[0:th,0:tw]
        h=.14*np.sin(x*math.pi/2)*np.sin(y*math.pi/2)+.045*np.sin(x*math.pi)
        for seam in [14,18,494,498]:
            h += .40*np.exp(-((x-seam)/1.5)**2)
        for seam in [491,497]:
            h += .40*np.exp(-((y-seam)/1.5)**2)
        height[ty:ty+th,tx:tx+tw]=h
    gy,gx=np.gradient(height)
    nx=-gx; ny=gy; nz=np.ones_like(gx)
    norm=np.sqrt(nx*nx+ny*ny+nz*nz)
    out=np.clip((np.stack([nx/norm,ny/norm,nz/norm],axis=-1)*.5+.5)*255,0,255).astype(np.uint8)
    normal=Image.fromarray(out,'RGB')
    orm=np.zeros((1024,1024,3),dtype=np.uint8);orm[:,:,0]=255;orm[:,:,1]=216
    orm[:512,:512,1]=135
    x,y,w,h=TILES['hair'];orm[y:y+h,x:x+w,1]=190
    x,y,w,h=TILES['eyes'];orm[y:y+h,x:x+w,1]=54
    x,y,w,h=TILES['shoes'];orm[y:y+h,x:x+w,1]=166
    return normal,Image.fromarray(orm,'RGB')

def main():
    output=ROOT/'textures';output.mkdir(parents=True,exist_ok=True)
    for profile,(source,number) in PROFILES.items():
        images=images_from_glb(SOURCE/(source+'.glb'))
        if profile == 'sf':
            # v4 omitted the forward eyebrow image during its material cleanup.
            # Restore the original matching alpha card texture without changing UVs.
            original = images_from_glb(REPO/'workout/island/assets/models/hoops-forward.glb')
            for key, value in original.items():
                if 'eyebrow' in key.lower() and key not in images:
                    images[key] = value
        base=Image.new('RGBA',(1024,1024),(40,31,29,255))
        skin=choose(images,['male_diffuse'])
        if profile=='c' and skin is not None:
            # Keep source pores, brows and features while separating skin shading.
            rgb=ImageEnhance.Color(skin.convert('RGB')).enhance(.88)
            skin=ImageEnhance.Brightness(rgb).enhance(1.08).convert('RGBA')
        put(base,'skin',skin)
        put(base,'shoes',choose(images,['shoes06']))
        put(base,'hair',choose(images,['afro_diffuse','short04','short02','short01']),True)
        put(base,'eyes',choose(images,['brown_eye']))
        put(base,'eyebrows',choose(images,['eyebrow']),True)
        put(base,'eyelashes',choose(images,['eyelashes']),True)
        put(base,'solid',None)
        put(base,'jersey',cloth_tile(number,profile=='referee',False))
        put(base,'shorts',cloth_tile(number,profile=='referee',True))
        normal,orm=normal_and_orm(profile)
        base.save(output/(profile+'-basecolor.png'),optimize=True)
        normal.save(output/(profile+'-normal.png'),optimize=True)
        orm.save(output/(profile+'-orm.png'),optimize=True)
        print(profile,[(suffix,(output/(profile+'-'+suffix+'.png')).stat().st_size) for suffix in ['basecolor','normal','orm']])
    layout={
        'dimensions':[1024,1024],'pixelOrigin':'top-left','uvOrigin':'bottom-left',
        'tiles':TILES,'uvTransform':'u=(x+u*w)/1024; v=(1024-y-h+v*h)/1024',
        'teamMask':'Delivered glTF uv.y > 0.5; preserve near-black number and referee stripes','sourceBlenderMask':'uv.y < 0.5',
        'maps':{'basecolor':'sRGB RGBA; alpha mask for hair/brows/lashes only','normal':'linear tangent-space OpenGL +Y','orm':'linear: R ambient occlusion, G roughness, B metallic'},
        'cloth':'Neutral white with woven normal, side seam and hem relief. Team tint is applied at runtime.',
        'numbers':{key:value[1] for key,value in PROFILES.items()},
        'source':'Repository hoops-v4 MakeHuman textures; see parent LICENSES.md',
    }
    (output/'tiles.json').write_text(json.dumps(layout,indent=2)+'\n')

if __name__=='__main__':main()
