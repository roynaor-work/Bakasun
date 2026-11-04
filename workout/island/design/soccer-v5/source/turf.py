"""One original, deterministic 1024px full-pitch albedo (no repeating tiles)."""
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
(root/'textures').mkdir(exist_ok=True)
rng = np.random.default_rng(20261104)
y,x = np.mgrid[:1024,:1024]
stripes = ((y//92)%2)*7
grain = rng.normal(0,1.8,(1024,1024))
variation = 2*np.sin(x/171) + 1.8*np.cos((x+y)/211)
base = np.stack([35+stripes*.50+variation+grain,
                 103+stripes+variation+grain,
                 65+stripes*.65+variation+grain],axis=-1)
# A few fine, directional blades at a scale that survives a mobile game camera.
for _ in range(4200):
    cx,cy = rng.integers(0,1020,2)
    base[cy:cy+3,cx,:] += [3,6,2]
Image.fromarray(np.uint8(np.clip(base,0,255))).save(root/'textures/turf.jpg',quality=89,subsampling=0)
print('textures/turf.jpg:',(root/'textures/turf.jpg').stat().st_size,'bytes')
