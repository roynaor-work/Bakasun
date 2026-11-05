"""Bake the existing analytic sin(u)*cos(v) highlight into a periodic lookup.

The viewer still applies the same two world-space phase coordinates. A linear
texture sample replaces two per-pixel transcendental operations and smoothstep.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import json,hashlib
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
side=512
u=(np.arange(side)+.5)/side*2*np.pi
v=(1-(np.arange(side)+.5)/side)*2*np.pi
ripple=np.sin(u[None,:])*np.cos(v[:,None])
t=np.clip((ripple-.87)/.13,0,1)
pixels=np.rint(t*t*(3-2*t)*255).astype(np.uint8)
path=ROOT/'textures/water-wave.png'
Image.fromarray(pixels).save(path,optimize=True)
# Independent random phase interpolation against the exact analytic expression.
rng=np.random.default_rng(761);test=rng.random((100000,2));phase=test*side-.5
x0=np.floor(phase[:,0]).astype(int);y0=np.floor(phase[:,1]).astype(int)
fx=phase[:,0]-x0;fy=phase[:,1]-y0
field=np.flipud(pixels).astype(float)/255
sample=(field[y0%side,x0%side]*(1-fx)*(1-fy)+field[y0%side,(x0+1)%side]*fx*(1-fy)+field[(y0+1)%side,x0%side]*(1-fx)*fy+field[(y0+1)%side,(x0+1)%side]*fx*fy)
wave=np.sin(test[:,0]*2*np.pi)*np.cos(test[:,1]*2*np.pi)
exact=np.clip((wave-.87)/.13,0,1);exact=exact*exact*(3-2*exact)
error=np.abs(sample-exact)
report={'generatedUTC':datetime.now(timezone.utc).isoformat(),'file':'textures/water-wave.png','size':[side,side],'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
 'method':'100,000 deterministic random phase pairs; repeat bilinear lookup versus analytic smoothstep(.87,1,sin(u)*cos(v)). Values are linear, no sRGB transform.',
 'maxHighlightError':float(error.max()),'meanHighlightError':float(error.mean()),'maxLinearColorError':float(error.max()*.13),'pass':bool(error.max()*.13<.001)}
(ROOT/'verification/water-map.json').write_text(json.dumps(report,indent=2))
assert report['pass'],report
print(json.dumps(report))
