"""Original deterministic 512px turf microtexture and OpenGL tangent normal.

No mirrored quadrants or copied photo patches. The image describes 4m of turf;
nonperiodic field variation and mowing are vertex colours in the pitch mesh.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
rng = np.random.default_rng(20261102)
yy, xx = np.mgrid[:SIZE, :SIZE]

def periodic_noise(scale):
    # Fourier low-pass of independent noise is periodic by construction.
    f = np.fft.fftfreq(SIZE)
    kernel = np.exp(-2*np.pi*np.pi*scale*scale*(f[:,None]**2+f[None,:]**2))
    n = np.fft.ifft2(np.fft.fft2(rng.normal(size=(SIZE,SIZE)))*kernel).real
    return n/max(n.std(),1e-8)

def main():
    fine = periodic_noise(.7)
    thatch = periodic_noise(2.8)
    long = periodic_noise(10)
    height = .11*fine + .13*thatch
    # Short, irregular, wrapped blade strokes, without large identifiable motifs.
    blades = np.zeros((SIZE,SIZE))
    for _ in range(19000):
        x,y=rng.integers(0,SIZE,2); length=rng.integers(2,8)
        slant=rng.uniform(-.65,.65); strength=rng.uniform(.10,.65)
        for k in range(length):
            blades[(y+k)%SIZE,(x+round(k*slant))%SIZE]+=strength*np.sin(np.pi*(k+1)/(length+1))
    height += blades*.16
    grain = .019*fine+.014*thatch+.007*long+.027*blades
    rgb=np.clip(np.array([.56,.68,.38])[None,None,:]+grain[:,:,None]*np.array([.7,1,.44]),0,1)
    Image.fromarray(np.uint8(rgb*255),'RGB').save(ROOT/'textures/turf-color.jpg',quality=92,subsampling=0)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.25
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.25
    normal=np.stack((-dx,dy,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255),'RGB').save(ROOT/'textures/turf-normal.png',optimize=True)
    report={'seed':20261102,'size':[SIZE,SIZE],'tileMetres':4,'normalConvention':'OpenGL +Y, linear data; glTF flipY=false',
      'edgeMeanAbsRGB':{'x':float(np.abs(rgb[:,0]-rgb[:,-1]).mean()),'y':float(np.abs(rgb[0]-rgb[-1]).mean())},
      'adjacentMeanAbsRGB':float(np.abs(rgb[:,1:]-rgb[:,:-1]).mean()),
      'mowing':'14 world-space bands of 7.5m; not contained in the repeated texture',
      'macro':'Nonperiodic analytic vertex colour on the entire 68x105m surface; seed 20261102'}
    (ROOT/'verification/texture-build.json').write_text(json.dumps(report,indent=2)+'\n')
    print(report)

if __name__=='__main__': main()
