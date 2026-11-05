"""בונה north/js/alt.js ממניפסטים של התמונות. הרצה מהריפו: python3 north/verification/deep-v1/make-alt.py"""
import json, os
R = os.path.join(os.path.dirname(__file__), '..', '..')
out = {}
def clean(f, t):  # בגיבור ובבאנרים מורידים את הקידומת ("באנר וויסקי — ")
    return t.split(' — ', 1)[1] if (f.startswith('hero') or f.startswith('banner-')) and ' — ' in t else t
for a in json.load(open(os.path.join(R, 'img/v2/manifest.json')))['assets']: out['img/v2/' + a['file']] = clean(a['file'], a.get('alt') or a.get('title'))
for a in json.load(open(os.path.join(R, 'img/v3/manifest.json')))['assets']: out['img/v3/' + a['file']] = a['alt']
open(os.path.join(R, 'js/alt.js'), 'w').write('/* תיאורי alt לתמונות, נוצר מ-img/v2/manifest.json ו-img/v3/manifest.json (verification/deep-v1/make-alt.py). */\nexport const ALT = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\nexport const altOf = (path, fallback = \'\') => ALT[path] || fallback;\n')
