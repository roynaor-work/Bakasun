"""Deterministic original texture authoring. Python 3 + Pillow + NumPy."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]/'textures'
root.mkdir(exist_ok=True)
rng=np.random.default_rng(7127)
n=1024
noise=rng.normal(0,1,(n,n))
grit=noise*6
coarse=np.kron(rng.normal(0,1,(128,128)),np.ones((8,8)))
coarse=(coarse+np.roll(coarse,3,0)+np.roll(coarse,3,1))/3
flecks=(rng.random((n,n))>.992)*25
v=np.clip(108+grit+coarse*3+flecks,45,159)
rgb=np.stack([v*.94,v*.98,v*1.035],-1).clip(0,255).astype('uint8')
Image.fromarray(rgb).save(root/'asphalt-color.webp',quality=88,method=6)
height=noise*.012+coarse*.025
height=height.reshape(512,2,512,2).mean(axis=(1,3))
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.8
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.8
normal=np.stack([-dx,-dy,np.ones_like(dx)],-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
Image.fromarray(((normal*.5+.5)*255).clip(0,255).astype('uint8')).save(root/'asphalt-normal.png',optimize=True)
rough=(220+noise*4).clip(0,255).astype('uint8')
Image.fromarray(np.stack([np.full_like(rough,255),rough,np.zeros_like(rough)],-1)).save(root/'asphalt-orm.webp',quality=85,method=6)
im=Image.new('RGB',(256,256));draw=ImageDraw.Draw(im)
colors=['#e9dec3','#bb8b6b','#eac8a0','#283443','#314f68','#d5d9d8','#c4e748','#cf755b']
for i,c in enumerate(colors):draw.rectangle((i*32,0,i*32+31,255),fill=c)
im.save(root/'spectator-atlas.png',optimize=True)
n=64;y,x=np.mgrid[-1:1:complex(n),-1:1:complex(n)]
alpha=(np.maximum(0,1-x*x-y*y)**2.4*(.85+.15*rng.random((n,n)))*210).astype('uint8')
rgba=np.zeros((n,n,4),dtype='uint8');rgba[:,:,:3]=245;rgba[:,:,3]=alpha
Image.fromarray(rgba).save(root/'tire-smoke.png',optimize=True)
print('TEXTURES_DONE',[(p.name,p.stat().st_size) for p in root.iterdir()])
