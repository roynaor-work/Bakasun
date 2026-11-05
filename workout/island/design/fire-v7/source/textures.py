"""Original deterministic technical atlases; no external images or AI training data.

Material tiles have eight-pixel gutters. Particle sheets have 16 independent
frames and transparent gutters. Maximum side length is exactly 1024 pixels.
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter, zoom
from mesh import COLORS, PALETTE

ROOT=Path(__file__).resolve().parents[1]
RNG=np.random.default_rng(7105)


def material_atlas(kind, overrides=None, size=512):
    cell=size//8;out=Image.new('RGB',(size,size),'#283540');draw=ImageDraw.Draw(out)
    overrides=overrides or {}
    for i,color in enumerate(COLORS):
        rgb=np.array(Image.new('RGB',(1,1),overrides.get(color,PALETTE[color])).getpixel((0,0)),float)
        yy,xx=np.mgrid[0:cell,0:cell]
        grain=RNG.normal(0,1.5,(cell,cell))
        cloud=gaussian_filter(RNG.normal(0,1,(cell,cell)),7)*22
        shade=grain+cloud
        if color=='brick':
            mortar=((yy%28)<2)|(((xx+((yy//28)%2)*30)%60)<2)
            shade+=np.where(mortar,-18,0)
        elif color in ['suit','navy','hose']:
            shade+=(np.sin(xx*math.pi)*np.cos(yy*math.pi))*.8
            shade+=np.sin(xx*1.7+yy*.4)*.6
        elif color in ['steel','metalDark']:
            shade+=np.sin(yy*1.2)*2.4
            if kind=='vehicle':shade+=np.where(((xx+yy)%18<2)|((xx-yy)%18<2),5,0)
        elif color in ['roof','wood']:
            shade+=np.where((yy%18)<2,-10,0)+np.sin(xx*.5+yy*.08)*2
        elif color in ['glass']:
            shade+=8*(1-yy/cell)+4*np.sin((xx+yy)*.015)
        elif color=='asphalt':
            shade+=RNG.normal(0,3,(cell,cell))
        tile=np.clip(rgb[None,None,:]+shade[:,:,None],0,255).astype(np.uint8)
        out.paste(Image.fromarray(tile),(i%8*cell,i//8*cell))
    out.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(ROOT/'textures'/f'{kind}-atlas.png',optimize=True)


def particles(kind,size):
    cell=size//4;out=np.zeros((size,size,4),np.uint8)
    for frame in range(16):
        yy,xx=np.mgrid[0:cell,0:cell]/cell
        x=xx*2-1;y=1-yy
        phase=frame/16*math.tau
        # Band-limited independent noise at three scales gives coherent volume.
        noise=np.zeros((cell,cell))
        for n,amp in [(5,.50),(11,.23),(23,.12)]:
            grid=RNG.normal(0,1,(n,n));noise+=zoom(grid,(cell/n,cell/n),order=3)[:cell,:cell]*amp
        if kind=='flame':
            bend=.10*np.sin(y*9+phase)+.055*np.sin(y*21-phase*2)
            width=.31*(1-y)**.58+.015
            core=np.exp(-((x-bend)/np.maximum(width,.02))**2*2.3)
            tongue=np.clip((1-y)*1.4+noise*.20,0,1)
            alpha=core*tongue*np.clip(y*30,0,1)*np.clip((.93-y)*16,0,1)
            heat=np.clip(core*(1-y*.7)+noise*.14,0,1)
            rgb=np.stack([np.ones_like(x),.19+.72*heat,.015+.42*heat**4],axis=-1)
            alpha=np.clip(alpha*1.65,0,1)
        elif kind in ['smoke','steam']:
            r=np.sqrt((x/.76)**2+((y-.5)/.39)**2)
            density=np.clip((1-r)*2.7+noise*.40,0,1)
            alpha=density*np.clip((1-r)*3,0,1)*(.64 if kind=='smoke' else .30)
            light=np.clip(.75+noise*.17+(1-y)*.08,.35,.95)
            base=np.array([.68,.66,.67]) if kind=='smoke' else np.array([.88,.96,1.0])
            rgb=base[None,None,:]*light[:,:,None]
        elif kind=='water':
            r=np.sqrt((x/.35)**2+((y-.5)/.39)**2)
            alpha=np.exp(-r**3*2)*.85
            rgb=np.zeros((cell,cell,3))+np.array([.60,.86,.99])
        else:
            r=np.sqrt(x*x+((y-.5)*2)**2)
            alpha=np.exp(-r*7)*np.clip(1-r,0,1)
            rgb=np.zeros((cell,cell,3))+np.array([1,.47,.12])
        edge=(xx>.045)&(xx<.955)&(yy>.045)&(yy<.955)
        alpha*=edge
        rgba=np.concatenate([np.clip(rgb*255,0,255).astype(np.uint8),np.clip(alpha*255,0,255).astype(np.uint8)[:,:,None]],axis=-1)
        out[frame//4*cell:(frame//4+1)*cell,frame%4*cell:(frame%4+1)*cell]=rgba
    Image.fromarray(out).save(ROOT/'particles'/f'{kind}-{size}.png',optimize=True)


def sky():
    width,height=1024,512
    yy,xx=np.mgrid[0:height,0:width]
    t=yy/height
    top=np.array([25,32,48]);horizon=np.array([166,91,64])
    mix=np.clip((t-.12)/.88,0,1)**1.8
    rgb=top[None,None,:]*(1-mix[:,:,None])+horizon[None,None,:]*mix[:,:,None]
    cloud=gaussian_filter(RNG.random((height,width)),15)
    cloud=(cloud-cloud.min())/(cloud.max()-cloud.min())
    veil=(np.clip(cloud-.4,0,1)*60*np.sin(t*math.pi))[:,:,None]
    rgb=np.clip(rgb-veil,0,255).astype(np.uint8)
    Image.fromarray(rgb).save(ROOT/'textures'/'fire-sky.jpg',quality=88,optimize=True)


if __name__=='__main__':
    (ROOT/'textures').mkdir(exist_ok=True);(ROOT/'particles').mkdir(exist_ok=True)
    material_atlas('environment');material_atlas('vehicle')
    material_atlas('crew-nozzle',{'suit':'#B6A274','skin':'#BD865E','red':'#C54038'})
    material_atlas('crew-tool',{'suit':'#394C56','skin':'#86573F','yellow':'#E7C64F'})
    material_atlas('crew-command',{'suit':'#AA8F62','skin':'#DEB18C','yellow':'#ECE6D2'})
    for k in ['flame','smoke','steam','water','ember']:
        for s in [256,512,1024]:particles(k,s)
    sky()
    print('5 material atlases, 15 particle sheets, 1 sky',flush=True)
