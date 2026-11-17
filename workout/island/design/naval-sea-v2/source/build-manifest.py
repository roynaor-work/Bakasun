"""Inventory with exact frame rectangles, SHA-256, units and playback rules."""
from pathlib import Path
from PIL import Image
import hashlib,json,struct

ROOT=Path(__file__).resolve().parents[1]
assets=[]


def add(path,kind,**extra):
    raw=(ROOT/path).read_bytes()
    record=dict(id=Path(path).stem,path=path,kind=kind,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),license='CC0-1.0',**extra)
    if path.endswith('.png'):
        im=Image.open(ROOT/path)
        record.update(width=im.width,height=im.height,format='PNG',alpha='straight' if 'A' in im.convert('RGBA').getbands() and im.convert('RGBA').getextrema()[3][0]<255 else 'opaque')
    else:
        length=struct.unpack_from('<I',raw,12)[0]
        doc=json.loads(raw[20:20+length])
        tris=0
        for node in doc.get('nodes',[]):
            if 'mesh' not in node:continue
            for p in doc['meshes'][node['mesh']]['primitives']:
                tris+=doc['accessors'][p['indices']]['count']//3
        record.update(triangles=tris,units='metres',upAxis='+Y',forwardAxis='-Z',waterlineMeters=0,embedded=True)
    assets.append(record)
    return record


def animation(name,w,h,count,cols,pad,seconds,loop,**extra):
    a=add('textures/'+name+'.png','atlas',colorSpace='linear' if name.endswith('-normal') else 'sRGB',
        frameWidth=w,frameHeight=h,frameCount=count,columns=cols,rows=(count+cols-1)//cols,padding=pad,
        durationSeconds=seconds,fps=count/seconds,loop=loop,filter='linear',mipmaps=False,**extra)
    a['frames']=[]
    for i in range(count):
        x=(i%cols)*(w+2*pad)+pad;y=(i//cols)*(h+2*pad)+pad
        # UVs include half-texel inset; V is WebGL bottom-left after texture flipY.
        a['frames'].append(dict(index=i,rect=[x,y,w,h],uv=[(x+.5)/a['width'],1-(y+h-.5)/a['height'],(w-1)/a['width'],(h-1)/a['height']]))
    return a


for name,he,mult in [('calm','רגוע',.38),('breeze','בינוני',.82),('rough','סוער',1.42)]:
    for suffix in ['', '-normal']:
        animation('water-'+name+suffix,256,256,16,4,2,4,True,label=he,spatialRepeat=['x','y'],
            crossfadeFrames=True,strength=mult,normalConvention='OpenGL +Y' if suffix else None)
    add('textures/water-'+name+'-tile.png','texture',colorSpace='sRGB',spatialRepeat=['x','y'],filter='linear',mipmaps=True)
animation('wake-8',256,512,8,4,4,1,True,orientation='bow at top; stern trail expands toward bottom',pivot=[.5,0],crossfadeFrames=True)
add('textures/wake.png','texture',colorSpace='sRGB',pivot=[.5,0],orientation='bow at top')
for name,repeat in [('foam-strip',['x']),('foam-ring',[]),('foam-patch',[])]:
    add('textures/'+name+'.png','texture',colorSpace='sRGB',spatialRepeat=repeat,pivot=[.5,.5])
a=animation('impact-4x8',192,192,32,8,4,1.0,False,pivot=[.5,1],billboard='upright camera-facing; base at impact point')
a.pop('fps');a.pop('durationSeconds')
a['clips']=[dict(id='splash-'+str(i+1),startFrame=i*8,frameCount=8,durationSeconds=.8,fps=10,loop=False,seed=23+i*71) for i in range(4)]
animation('near-miss-column-12',192,384,12,4,4,1.2,False,pivot=[.5,1],billboard='upright camera-facing; base at sea level',worldSizeMeters=[9,18])
for name in ['day','sunset','night']:
    add('textures/sky-'+name+'.png','sky',colorSpace='sRGB',spatialRepeat=['x'],gradientDirection='top to horizon')
add('textures/horizon-fog.png','texture',colorSpace='sRGB',spatialRepeat=['x'],blend='normal',depthWrite=False)
add('textures/sun-disc.png','texture',colorSpace='sRGB',blend='normal',depthWrite=False)
for file in sorted((ROOT/'models').glob('*.glb')):
    add('models/'+file.name,'model',role='lighthouse' if file.stem=='lighthouse' else 'rock' if file.stem.startswith('rock') else 'floater')
reference=add('source/reference-corvette.glb','reference-model',role='preview scale reference only',source='workout/island/assets/naval-v7/ships/corvette-lod1.glb')
reference['forwardAxis']='+Z'
manifest=dict(schemaVersion=1,id='naval-sea-v2',title='מצר הדמדומים — ים וסביבה',version='2.0.0',
    created='2026-11-17',baseCommit='43b27dc235387e3cb737aee9558cdf9d5fd5a262',
    license='CC0-1.0',atlasBudgetBytes=800000,preview=dict(path='preview.html',viewport=[844,390],offline=True),
    coordinates=dict(units='metres',up='+Y',seaPlane='XZ',seaLevel=0,pngRectOrigin='top-left',uvOrigin='bottom-left',alpha='straight'),
    sampling=dict(atlasMipmaps=False,atlasWrap='clamp-to-edge',tileRepeat='fract local frame UV before atlas mapping',
        frameTime='phase = (seconds % durationSeconds) / durationSeconds * frameCount; mix floor and next (mod count)',
        normalMap='linear / NoColorSpace; tangent +Z is up from plane, +Y is local V',
        oneShot='clip index = min(floor(ageSeconds * fps), frameCount-1); remove after duration'),
    assets=assets)
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(len(assets),'assets;',sum(a['bytes'] for a in assets),'bytes; max atlas',max(a['bytes'] for a in assets if a['kind']=='atlas'))
