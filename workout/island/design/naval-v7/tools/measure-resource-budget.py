"""Static payload accounting, distinct from measured driver/phone memory."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, struct

ROOT=Path(__file__).resolve().parents[1]
components={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
geometry=[]
for p in sorted((ROOT/'assets').rglob('*.glb')):
    binary=p.read_bytes();length=struct.unpack_from('<I',binary,12)[0]
    document=json.loads(binary[20:20+length]);used=set()
    for mesh in document.get('meshes',[]):
        for primitive in mesh['primitives']:
            used.update(primitive.get('attributes',{}).values())
            if 'indices' in primitive:used.add(primitive['indices'])
    size=sum(document['accessors'][i]['count']*widths[document['accessors'][i]['type']]*components[document['accessors'][i]['componentType']] for i in used)
    geometry.append({'file':str(p.relative_to(ROOT)),'compressedBytes':len(binary),'decodedAttributeAndIndexPayloadBytes':size,'uniqueAccessors':len(used)})

def rgba8_mips(w,h):
    total=0
    while True:
        total+=w*h*4
        if w==1 and h==1:return total
        w=max(1,w//2);h=max(1,h//2)

textures=[]
for p in sorted((ROOT/'assets/textures').glob('*.png')):
    data=p.read_bytes();w,h=struct.unpack_from('>II',data,16)
    copies=2 if p.name=='basalt-512.png' else 1
    mipmaps=p.name!='noise-128.png'
    payload=(rgba8_mips(w,h) if mipmaps else w*h*4)*copies
    textures.append({'file':str(p.relative_to(ROOT)),'width':w,'height':h,'fileBytes':len(data),'assumedFormat':'RGBA8','mipmaps':mipmaps,'runtimeCopies':copies,'estimatedResidentPayloadBytes':payload})

report={
    'at':datetime.now(timezone.utc).isoformat(),
    'sourceSha256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest(),
    'kind':'Static payload estimate; not GPU allocation, JS heap or physical phone measurement',
    'geometry':geometry,'textures':textures,
    'totals':{
        'glbBytes':sum(x['compressedBytes'] for x in geometry),
        'decodedAttributeAndIndexPayloadBytes':sum(x['decodedAttributeAndIndexPayloadBytes'] for x in geometry),
        'pngBytes':sum(x['fileBytes'] for x in textures),
        'estimatedResidentRgba8ImageBytes':sum(x['estimatedResidentPayloadBytes'] for x in textures),
        'twoPmremRgba16fTargetsBytes':2*336*256*8,
        'estimated1024ShadowColorAndDepthBytes':1024*1024*8,
    },
    'assumptions':[
        'All three ship LODs, island, rock and crew are decoded; shared turret geometry is counted once in stored buffers.',
        'Accessor component types/counts describe decoded attribute and index payload, before driver alignment or duplicate uploads.',
        'Images are estimated as RGBA8 with full mip chains except the non-mipped noise LUT.',
        'The two separate glTF scenery materials retain two basalt texture objects; crew/fleet images are shared.',
        'The shadow estimate assumes RGBA8 color plus a depth attachment padded to four bytes; it is disabled in low/adapted profiles.',
        'Excludes driver overhead, framebuffer/swapchain, JS strings, decoded CPU image copies, shader binaries and browser process memory.'
    ]
}
(ROOT/'verification/resource-budget.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['totals'],indent=2))
