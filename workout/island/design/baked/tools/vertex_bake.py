"""Optional BUILD-TIME color multiplication. Never writes the source GLB.
Blender -b --python tools/vertex_bake.py -- --asset ski-slope --out <new.glb> [--light]
Replaces existing COLOR_0 values, adds no geometry, attributes, maps or lights.
Large faces with few vertices cannot retain small shadows: compare before choosing.
"""
import argparse,sys,math
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]

def sample(im,uv):
    # Bilinear clamp-to-edge, matching the preview's image lookup at texel centres.
    w,h=im.size;pix=im.pixels
    x=max(0,min(w-1,uv[0]*w-.5));y=max(0,min(h-1,uv[1]*h-.5))
    x0,y0=math.floor(x),math.floor(y);x1,y1=min(x0+1,w-1),min(y0+1,h-1)
    fx,fy=x-x0,y-y0
    return (pix[4*(y0*w+x0)]*(1-fx)+pix[4*(y0*w+x1)]*fx)*(1-fy)+(pix[4*(y1*w+x0)]*(1-fx)+pix[4*(y1*w+x1)]*fx)*fy

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--asset',required=True,choices=['soccer-stadium','basketball-arena','ski-slope']);p.add_argument('--out',required=True);p.add_argument('--light',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve()
    source=ROOT/(a.asset+'-uv2.glb')
    if not source.exists():source=ROOT.parent/'models'/(a.asset+'.glb')
    if out==source.resolve() or out.parent==ROOT.parent/'models':raise ValueError('Choose a new output outside source models/')
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
    maps=[]
    for kind in (['ao','light'] if a.light else ['ao']):
        im=bpy.data.images.load(str(ROOT/(a.asset+'-'+kind+'.webp')));im.colorspace_settings.name='Non-Color';maps.append(im)
    uvindex=1 if a.asset=='soccer-stadium' else 0
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        uv=o.data.uv_layers[uvindex];colors=o.data.color_attributes[0]
        for loop in o.data.loops:
            factor=math.prod(sample(im,uv.data[loop.index].uv) for im in maps)
            d=colors.data[loop.index if colors.domain=='CORNER' else loop.vertex_index]
            r,g,b,alpha=d.color;d.color=(r*factor,g*factor,b*factor,alpha)
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,export_draco_position_quantization=16,export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=20,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
        export_extras=True,export_cameras=False,export_lights=False)
