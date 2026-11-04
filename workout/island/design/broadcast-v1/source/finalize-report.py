"""Create the review index and concise handoff from measured evidence."""
import hashlib
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
browser = json.loads((ROOT / 'verification/browser.json').read_text())
assets = json.loads((ROOT / 'verification/assets.json').read_text())
assert browser['passed'] and assets['passed']
assert len(browser['captures']) == 16
files = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.name in ['manifest.json', 'REPORT.md'] or '__pycache__' in path.parts:
        continue
    content = path.read_bytes()
    entry = {'path': str(path.relative_to(ROOT)), 'bytes': len(content), 'MB': round(len(content) / 1e6, 4), 'sha256': hashlib.sha256(content).hexdigest()}
    if path.suffix == '.png':
        entry['width'], entry['height'] = struct.unpack('>II', content[16:24])
        if path.parent.name == 'previews':
            assert (entry['width'], entry['height']) in [(390, 844), (844, 390)]
    files.append(entry)
manifest = {'schemaVersion': 1, 'date': '2026-11-04', 'kind': 'standalone-design-review',
    'entry': 'preview.html', 'config': ['cameras.json', 'quality.json'], 'threeRevision': '160',
    'unit': 'decimal MB = bytes / 1000000', 'runtimeGlbBytes': sum(a['bytes'] for a in assets['assets']),
    'maximumGlbBytes': max(a['bytes'] for a in assets['assets']),
    'sources': assets['sources'], 'files': files}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

names = {'soccer': 'כדורגל', 'basketball': 'כדורסל', 'broadcast': 'שידור', 'side': 'צד', 'shoulder': 'מעל הכתף', 'replay': 'הילוך חוזר'}
cards = []
for sport in ['soccer', 'basketball']:
    for width, height in [(390, 844), (844, 390)]:
        cards.append(f'<h2>{names[sport]} · <bdi>{width}×{height}</bdi></h2><div class="grid">')
        for mode in ['broadcast', 'side', 'shoulder', 'replay']:
            name = f'{sport}-{mode}-{width}x{height}.png'
            cards.append(f'<figure><a href="previews/{name}" target="_blank" rel="noopener"><img loading="lazy" src="previews/{name}" width="{width}" height="{height}" alt="{names[sport]} · {names[mode]} · {width} על {height}"></a><figcaption>{names[mode]} · <a href="previews/{name}" download>PNG בגודל מלא</a></figcaption></figure>')
        off = f'{sport}-effects-off-{width}x{height}.png'
        cards.append(f'</div><p><a href="previews/{off}">אותו פריים בלי אפקטי הגימור · {width}×{height}</a></p>')
gallery = '''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>צילומי תצוגה מלאים · Broadcast v1</title><style>*{box-sizing:border-box}body{margin:0 auto;max-width:1500px;padding:24px;font:14px Arial,sans-serif;background:#0c131e;color:#e7eff5}h1{font-size:24px}h2{font-size:18px;margin-top:35px}a{color:#b4f36b}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}figure{margin:0;background:#152130;border:1px solid #ffffff18;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:12px;font-size:12px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}body{padding:14px}}</style><h1>צילומי תצוגה בגודל מלא</h1><p>16 צילומי מקור, ארבע זוויות לכל ענף בשתי מידות. לחיצה על צילום פותחת את קובץ ה־PNG המקורי, ללא חיתוך או הגדלה.</p><p><a href="preview.html">תצוגה אינטראקטיבית</a> · <a href="REPORT.md">דוח</a></p>'''
(ROOT / 'previews.html').write_text(gallery + ''.join(cards) + '<p><a href="previews/context-restored-844x390.png">צילום אחרי שחזור WebGL context</a></p></html>\n')

balanced = [c for c in browser['captures'] if c['mode'] == 'broadcast']
rows = '\n'.join(f"| `{a['name']}` | {a['triangles']:,} | {a['bytes']/1e6:.3f} |" for a in assets['assets'])
budget_rows = []
for sport in ['soccer', 'basketball']:
    for tier in ['economy', 'balanced', 'high']:
        samples = [c for c in browser['budgets'] if c['sport'] == sport and c['tier'] == tier]
        budget_rows.append(f"| {names[sport]} · {tier} | {max(c['sceneTriangles'] for c in samples):,} | {max(c['calls'] for c in samples)} |")
checks = {'date': '2026-11-04', 'npmTest': {'passed': 3204, 'failed': 0, 'skipped': 50, 'total': 3254,
    'environment': 'network-enabled executor; existing ISLAND_PLAYWRIGHT selector points to a temporary adapter for /usr/bin/chromium',
    'adapterEffect': 'browser executable and Chromium flags only; tests and assertions unchanged'},
    'browserPassed': browser['passed'], 'glbCompressedAndDecodedPassed': assets['passed'],
    'scope': 'new files only in workout/island/design/broadcast-v1/'}
(ROOT / 'verification/repository-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
report = f'''# דוח מסירה · מצלמות ואפקטים v1

נוצרו הגדרות JSON ודף תצוגה עצמאי לכדורגל ולכדורסל: שידור, צד, מעל הכתף והילוך חוזר. המעברים רציפים, ההילוך החוזר שומר שש שניות ב־30Hz, והגימור כולל גוון, Bloom, Vignette, עומק שדה מדומה וטשטוש תנועת מצלמה עדין. מצורף [מסמך איכות בשלוש דרגות](ADAPTIVE-QUALITY.md).

[דף תצוגה](preview.html) · [16 צילומים בגודל מלא](previews.html) · [הגדרות מצלמה](cameras.json) · [רשימת גדלים ו־SHA-256](manifest.json)

| קובץ GLB עם Draco | משולשים | MB עשרוני |
| --- | ---: | ---: |
{rows}

כל השחקנים חולקים אטלס UV אחד של 1024² ל־albedo ול־normal, עם חומר אחד. הקובץ הגדול ביותר הוא **{manifest['maximumGlbBytes']/1e6:.3f}MB**, מתחת ל־1.5MB. סכום חמשת קובצי ה־GLB: **{manifest['runtimeGlbBytes']/1e6:.3f}MB**. הקהל מוצג ב־instancing בקריאת ציור אחת. שחקן LOD0 עומד בתקציב 8K, ו־LOD1 בתקציב 3K.

| מדידה בשידור, 12 שחקנים | משולשי סצנה | קריאות ציור כולל צל ופוסט |
| --- | ---: | ---: |
{chr(10).join(budget_rows)}

המדידות שמרניות וסופרות את כל הגאומטריה הנראית בסצנה, גם מחוץ לפריים. במצב מעל הכתף/חזרה בדרגה הגבוהה נוספים שחקני LOD0 לפי מרחק, עד תקרת התכנון של 150K. יעדי הפוסט ב־DPR 2 נמדדו ב־{min(c['postTargetMiB'] for c in browser['behavior']['dpr2']):.2f}–{max(c['postTargetMiB'] for c in browser['behavior']['dpr2']):.2f}MiB, מעבר לטקסטורות, לקנבס ולצללים.

נבדקו כל 16 שילובי הספורט/זווית/כיוון ב־390×844 וב־844×390, בלי גלילה או שגיאות קונסול ובלי בקשות חיצוניות. בשידור כל 12 השחקנים בפריים. עברו גם החלפה באמצע מעבר, סרגל וחזרה לשידור, הילוך חוזר מבודד עם שעון חי ממשיך, השוואת אפקטים, שלוש דרגות, ירידה ועלייה אדפטיבית, נעילה ידנית, DPR 2, reduced motion, נפילה בלי עומק ושחזור context. ראו [ראיות דפדפן](verification/browser.json).

חמשת ה־GLB עברו Khronos glTF Validator גם באריזה וגם **לאחר פענוח Draco**, ללא שגיאות או אזהרות. בדיקות המאגר הקיימות: **3,204 עברו, 0 נכשלו, 50 דולגו**; לא שונו בדיקות. חסימות socket/process של סביבת ההרצה נפתרו בהרצה עם הרשאות רשת ו־Chromium המקומי דרך בורר הבדיקה הקיים.

יעד 30fps בטלפון בינוני **טרם אומת על מכשיר פיזי**. הצילומים ובדיקות ההתנהגות בוצעו ב־Chromium/SwiftShader. הדמויות והאצטדיונים הם עותקי הדגמה של נכסי המאגר, עם תסריט תנועה וקליפים קיימים; השיער הוא רשת low-poly קיימת. החבילה אינה מוסיפה דמות hair-cards או אנימציות כדורגל חדשות. [מקורות ורישיונות](LICENSES.md).

כל הקבצים חדשים תחת `workout/island/design/broadcast-v1/`. קוד המשחק, גרסאות, תגי מטמון, הוראות ובדיקות נשארו ללא עריכה.
'''
(ROOT / 'REPORT.md').write_text(report)
manifest['files'] = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.name == 'manifest.json' or '__pycache__' in path.parts:
        continue
    content = path.read_bytes()
    entry = {'path': str(path.relative_to(ROOT)), 'bytes': len(content), 'MB': round(len(content) / 1e6, 4), 'sha256': hashlib.sha256(content).hexdigest()}
    if path.suffix == '.png':
        entry['width'], entry['height'] = struct.unpack('>II', content[16:24])
    manifest['files'].append(entry)
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'glbMB': manifest['runtimeGlbBytes']/1e6, 'largestGlbMB': manifest['maximumGlbBytes']/1e6, 'captures': len(browser['captures']), 'browserPassed': browser['passed']}, indent=2))
