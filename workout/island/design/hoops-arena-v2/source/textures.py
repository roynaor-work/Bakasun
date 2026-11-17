"""Original, deterministic lacquered maple PBR tiles. No image downloads.
python3 workout/island/design/hoops-arena-v2/source/textures.py
Requires numpy and Pillow; writes only inside this package.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'textures'
OUT.mkdir(exist_ok=True)
N = 1024
rng = np.random.default_rng(20261117)
y, x = np.mgrid[0:N, 0:N].astype(float)
# A 4.0 x 4.0 metre repeat, with 32 narrow maple staves. Everything in this
# expression is periodic: the wrap has the same joint as an interior stave.
stave = (y // 32).astype(int)
grain = np.zeros((N, N))
tones = np.zeros((N, N))
joints = np.zeros((N, N))
for row in range(32):
    sl = slice(row * 32, (row + 1) * 32)
    xx = x[sl]
    yy = y[sl] - row * 32
    phase = rng.uniform(0, 2*np.pi)
    wave = 1.7*np.sin(xx*2*np.pi/N + phase) + .7*np.sin(xx*8*np.pi/N + phase)
    growth = np.sin(yy*.53 + wave + phase)
    pores = np.sin(yy*2.4 + wave*1.3 + phase) * np.sin(xx*.025+phase)
    # Uneven annual rings and fine rays run along the stave, not across it.
    rings = np.exp(-((np.sin(yy*.83 + wave*.8 + phase))/.15)**2)
    rays = np.sin(yy*4.7 + wave*.5 + .20*np.sin(xx*.18))
    grain[sl] = growth*2.8 + pores*.9 - rings*3.2 + rays*.35
    # Four end-grain joints per stave; ends stagger between adjacent staves.
    cuts = sorted(set([0, N, *rng.choice(np.arange(90, 950), 3, replace=False)]))
    for a, b in zip(cuts[:-1], cuts[1:]):
        tones[sl, a:b] = rng.normal(0, 8.0)
        if a:
            joints[sl, a:a+1] = .55
    joints[sl][(yy < 1)] = .62
    # Slight edge darkening under a continuous varnish, not deep open cracks.
    tones[sl] -= 1.4*np.exp(-np.minimum(yy, 32-yy)/1.1)

joints[:,0] = .55
fine = rng.normal(0, .65, (N, N))
tone = tones + grain + fine - joints*20
rgb = np.stack([202 + tone, 157 + tone*.84, 98 + tone*.61], axis=-1)
rgb = np.uint8(np.clip(rgb, 0, 255))
Image.fromarray(rgb).save(OUT/'maple-albedo.jpg', quality=88, subsampling=0, optimize=True)

# Fine, deliberately low-relief normals preserve the look of varnished wood.
height = grain*.12 - joints*.42
gx = (np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))*.085
gy = (np.roll(height, -1, axis=0)-np.roll(height, 1, axis=0))*.085
normal = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal = np.uint8(np.clip((normal*.5+.5)*255, 0, 255))
Image.fromarray(normal).resize((512, 512), Image.Resampling.LANCZOS).save(OUT/'maple-normal.png', optimize=True)

rough = np.clip(69 + tones*.25 + grain*.35 + joints*9, 55, 91)
orm = np.stack([np.full_like(rough, 255), rough, np.zeros_like(rough)], axis=-1)
Image.fromarray(np.uint8(orm)).resize((512, 512), Image.Resampling.LANCZOS).save(OUT/'maple-orm.png', optimize=True)

if __name__ == '__main__':
    for p in sorted(OUT.iterdir()):
        assert p.stat().st_size <= 200_000, f'Tile exceeds 200KB: {p.name}'
        print(p.name, p.stat().st_size)
