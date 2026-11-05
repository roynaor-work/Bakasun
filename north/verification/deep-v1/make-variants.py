"""יוצר עותקים קטנים (WebP) מתמונות north/img/v2 ו-north/img/v3 לתיקייה north/img/s/<גרסה>/<שם>-<רוחב>.webp.
המקור לא משתנה. הרצה מתוך הריפו: python3 north/verification/deep-v1/make-variants.py"""
import glob, os
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'img')
WIDTHS = {'portrait': (240, 480, 800), 'hero': (640, 1024, 1440), 'banner': (640, 1024)}
Q = {240: 74, 480: 72, 640: 70, 800: 70, 1024: 68, 1440: 66}
total = 0
for v in ('v2', 'v3'):
    for f in sorted(glob.glob(os.path.join(ROOT, v, '*.webp'))):
        name = os.path.basename(f)[:-5]
        im = Image.open(f); w, h = im.size
        kind = 'hero' if name == 'hero' else 'banner' if name.startswith('banner-') else 'portrait'
        out = os.path.join(ROOT, 's', v); os.makedirs(out, exist_ok=True)
        for tw in WIDTHS[kind]:
            if tw >= w: continue
            r = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
            p = os.path.join(out, f'{name}-{tw}.webp'); r.save(p, 'WEBP', quality=Q[tw], method=6)
            total += os.path.getsize(p)
print('variants bytes', total)
