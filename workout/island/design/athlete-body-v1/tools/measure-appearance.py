#!/usr/bin/env python3
"""CC0-1.0. Measure the real Chromium captures, with no image retouching."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
browser = json.loads((ROOT / 'verification/browser.json').read_text())
rows = []
for pair in browser['comparisons']:
    a = np.asarray(Image.open(ROOT / pair['files']['left']).convert('RGB'), dtype=float)
    b = np.asarray(Image.open(ROOT / pair['files']['right']).convert('RGB'), dtype=float)
    assert a.shape == b.shape
    background = a[0, 0]
    assert np.array_equal(background, b[0, 0])
    # Ignore up to 10/255 of antialiasing at the silhouette boundary.
    ma = np.max(np.abs(a - background), axis=2) > 10
    mb = np.max(np.abs(b - background), axis=2) > 10
    intersection, union = ma & mb, ma | mb
    difference = np.abs(a - b)
    rows.append({
        'id': pair['id'], 'leftBody': pair['leftId'], 'rightBody': pair['rightId'],
        'normalizeHeight': pair['normalizeHeight'], 'sameUniform': pair['sameUniform'],
        'pixels': int(ma.size), 'leftForegroundPixels': int(ma.sum()),
        'rightForegroundPixels': int(mb.sum()), 'silhouetteIoU': float(intersection.sum() / union.sum()),
        'foregroundUnionMeanAbsoluteRGB_255': float(difference[union].mean()),
        'foregroundIntersectionRGB_RMSE_255': float(np.sqrt(((a[intersection] - b[intersection]) ** 2).mean())),
        'changedCanvasPixelsPercent': float((difference.max(axis=2) > 2).mean() * 100),
        'exactlyEqualPixelsPercent': float((difference.max(axis=2) == 0).mean() * 100),
        'backgroundRGB': background.astype(int).tolist(), 'files': pair['files'],
    })

frames = []
for sheet in browser['sheets']:
    image = np.asarray(Image.open(ROOT / sheet['path']).convert('RGB'))
    # The viewer uses four columns, two rows, 2px gaps and 33px captions.
    w = (sheet['width'] - 6) // 4
    h = (sheet['height'] - 2) // 2 - 33
    counts, clipped = [], []
    for i in range(8):
        x, y = (i % 4) * (w + 2), (i // 4) * (h + 35)
        tile = image[y:y + h, x:x + w]
        # Studio floor/background are light; these pixels belong to the actor.
        mask = tile.min(axis=2) < 150
        counts.append(int(mask.sum()))
        clipped.append(bool(mask[:2].any() or mask[-2:].any() or mask[:, :2].any() or mask[:, -2:].any()))
    assert min(counts) > 80, f"Empty actor tile: {sheet['path']}"
    assert not any(clipped), f"Actor touches frame edge: {sheet['path']}"
    frames.append({'path': sheet['path'], 'foregroundPixelsPerFrame': counts, 'clipped': clipped})

control = next(row for row in rows if row['id'] == 'control-identical-body')
assert control['exactlyEqualPixelsPercent'] == 100, 'Identical actor control must be pixel-identical'
report = {
    'schemaVersion': 1,
    'method': 'Two actual renders with the same orthographic camera, studio lights, exposure, PBR material, atlas, outline, skin, hair and vertex palette. Masks use a 10/255 RGB distance from the common background. IoU and pixel differences are image measurements, not a perceptual quality score.',
    'comparisons': rows, 'sheetCoverage': {'sheets': len(frames), 'frames': len(frames) * 8, 'rows': frames},
    'passed': browser['passed'] and len(frames) == 100,
}
(ROOT / 'verification/appearance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': report['passed'], 'comparisons': rows, 'sheets': len(frames)}, indent=2))
