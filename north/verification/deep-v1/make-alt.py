"""בונה north/js/alt.js ממניפסטים (v2, v3, v4) של התמונות. הרצה מהריפו: python3 north/verification/deep-v1/make-alt.py"""
import json, os
R = os.path.join(os.path.dirname(__file__), '..', '..')
out = {}
def clean(f, t):  # בגיבור ובבאנרים מורידים את הקידומת ("באנר וויסקי — ")
    return t.split(' — ', 1)[1] if (f.startswith('hero') or f.startswith('banner-')) and ' — ' in t else t
for a in json.load(open(os.path.join(R, 'img/v2/manifest.json')))['assets']: out['img/v2/' + a['file']] = clean(a['file'], a.get('alt') or a.get('title'))
for a in json.load(open(os.path.join(R, 'img/v3/manifest.json')))['assets']: out['img/v3/' + a['file']] = a['alt']
# v4 (north/img/v4): אין alt במניפסט, לכן כאן: מה רואים בכל מארז (לפי התכולה ב-products.js וצפייה בכל תמונה) + תיאור הזווית. אין גבינה במארז יין וגבינות.
V4 = {
 'single-malt': 'בקבוק סינגל מאלט, שתי כוסות כבדות וכרטיס ברכה בקופסת עץ עם קש',
 'flask': 'פלאסק נירוסטה, בקבוק קטן של בורבון ומשפך בקופסה שחורה',
 'shaker': 'שייקר בוסטון, ג׳יגר, כפית בר, בקבוק ג׳ין, ארבעה בקבוקי טוניק וכרטיס מתכונים',
 'old-fashioned': 'בקבוק בורבון, ביטרס, קוביות סוכר, תבנית קרח ושתי כוסות רוקס בקופסת עץ',
 'birthday': 'בקבוק מבעבע, קופסת פרלינים, נר ריחני וכרטיס ברכה',
 'spa': 'בקבוק רוזה, שמפו, מפיץ ריח, נר וסבון',
 'honey': 'בקבוק יין אדום, צנצנת דבש, חטיפי אגוזים וטבלת שוקולד בסלסלת קש',
 'wine-cheese': 'בקבוק יין אדום, בקבוק יין לבן, קרקרים, ריבה, זיתים וקרש הגשה מעץ',
 'gin-tonic': 'בקבוק ג׳ין, ארבעה בקבוקי טוניק, שתי כוסות קופה וערכת תבלינים',
 'irish': 'בקבוק וויסקי אירי, בקבוק ליקר קרם ושתי כוסות',
 'home-bar': 'בקבוקי וויסקי, ג׳ין ווודקה, ג׳יגר וספר קוקטיילים בארגז עץ',
 'choc-wine': 'בקבוק יין קינוח, שתי כוסות קטנות וקופסת פרלינים',
}
ROLE = {'product': 'צילום המארז', 'mood': 'אווירה', 'inside': 'מבפנים', 'packaging': 'אריזה סגורה עם סרט', 'use': 'בשימוש', 'scale': 'יחס גודל להמחשה'}
for a in json.load(open(os.path.join(R, 'img/v4/manifest.json')))['assets']:
    f = a['file']
    if f.startswith('banner-'): continue  # באנרים: alt בקוד (BANNER_ALT ב-app.js)
    i, r = f[:-5].rsplit('-', 1)
    out['img/v4/' + f] = V4[i] + ' · ' + ROLE[r]
open(os.path.join(R, 'js/alt.js'), 'w').write('/* תיאורי alt לתמונות, נוצר מ-img/v2, v3 ו-v4 (verification/deep-v1/make-alt.py). */\nexport const ALT = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\nexport const altOf = (path, fallback = \'\') => ALT[path] || fallback;\n')
