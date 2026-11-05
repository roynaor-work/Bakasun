"""Deterministic 1K court materials, no photographic or external source images."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'textures';OUT.mkdir(exist_ok=True)
rng=np.random.default_rng(7011)
yy,xx=np.mgrid[:1024,:1024]
for name,color in [('hard',(68,105,115)),('clay',(173,91,58)),('grass',(73,106,57))]:
 noise=rng.normal(0,1,(1024,1024))
 broad=np.array(Image.fromarray(np.uint8(rng.uniform(0,255,(64,64)))).resize((1024,1024),Image.Resampling.BICUBIC),float)/255-.5
 if name=='hard':detail=noise*2.6+broad*2.0
 elif name=='clay':
  grain=np.maximum(0,noise-1.1)*6
  detail=noise*3.2+broad*7+grain
 else:
  blades=np.sin(xx*1.7+np.sin(yy*.7))*2+np.sin(xx*3.1+yy*.12)*1.5
  detail=noise*3+broad*5+blades
 rgb=np.clip(np.array(color)[None,None,:]+detail[:,:,None],0,255).astype('uint8')
 Image.fromarray(rgb).save(OUT/(name+'-court.jpg'),quality=90,optimize=True,subsampling=0)
 gy,gx=np.gradient(detail)
 strength=.025 if name=='hard' else .05 if name=='clay' else .075
 n=np.stack((-gx*strength,gy*strength,np.ones_like(gx)),axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
 Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))).resize((512,512),Image.Resampling.LANCZOS).save(OUT/(name+'-normal.jpg'),quality=80,optimize=True,subsampling=0)
 print(name,(OUT/(name+'-court.jpg')).stat().st_size,flush=True)
net=Image.new('RGBA',(512,512),(255,255,255,0));draw=ImageDraw.Draw(net)
for i in range(0,512,32):
 draw.line((i,0,i,511),fill=(255,255,255,255),width=1)
 draw.line((0,i,511,i),fill=(255,255,255,255),width=1)
net.save(OUT/'net-weave.png',optimize=True)
