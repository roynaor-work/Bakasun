#!/usr/bin/env python3
"""Build the delivery report from completed, independently produced evidence."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

root = Path(__file__).resolve().parent.parent

def read(name):
    return json.loads((root / name).read_text())

names = ['asset-validation', 'baked-validation', 'motion-validation',
         'dribble-physics', 'skin-validation', 'skin-baked-validation',
         'retarget-motion2', 'fall-garment-probes', 'framing', 'offline', 'benchmark', 'repository-tests']
reports = {name: read(f'verification/{name}.json') for name in names}
failed = [name for name, report in reports.items() if report.get('pass') is not True]
if failed:
    raise SystemExit('Cannot publish a completed report with failing evidence: ' + ', '.join(failed))
weights = read('verification/weights.json')
work = read('verification/worklog.json')
if len(work['iterations']) < 6 or not work['iterations'][-1].get('visualAcceptance'):
    raise SystemExit('The final visual iteration has not been accepted.')
def verify_files(entries, label):
    for entry in entries:
        p = root / entry['file']
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != entry['sha256']:
            raise SystemExit(f'Stale {label} evidence for {entry["file"]}')

verify_files(weights['models'], 'weights')
verify_files(weights['sidecars'], 'texture sources')
verify_files(reports['asset-validation']['assets'], 'decoded assets')
verify_files(reports['baked-validation']['assets'], 'baked clips')
verify_files(reports['motion-validation']['inputs'], 'motion')
verify_files(reports['framing']['inputs'], 'default camera framing')
verify_files(reports['skin-validation']['inputs'], 'live skin')
verify_files(reports['skin-baked-validation']['inputs'], 'baked skin')
verify_files([reports['offline']['document']], 'offline document')
final_capture = read(f"iterations/{work['iterations'][-1]['iteration']}/capture.json")
verify_files([e for e in final_capture['inputs'] if
              e['file'].startswith(('models/', 'textures/', 'vendor/')) or
              e['file'] in ['source/motion.mjs', 'preview.mjs', 'preview.css',
                            'index.html', 'rig.json', 'model-authoring.json']], 'final render')
# Documentation is allowed to change during measurement; render inputs are not.
verify_files([e for e in reports['benchmark']['inputs'] if
              e['file'].startswith(('models/', 'textures/', 'vendor/')) or
              e['file'] in ['source/motion.mjs', 'preview.mjs', 'preview.css',
                            'index.html', 'rig.json', 'model-authoring.json']], 'benchmark')
now = datetime.now(timezone.utc)
start = datetime.fromisoformat(work['startedAtUtc'].replace('Z', '+00:00'))
duration = (now - start).total_seconds()
if duration < 7200:
    raise SystemExit('The requested continuous working period has not reached two hours.')
work['finishedAtUtc'] = now.isoformat()
work['measuredWorkSeconds'] = round(duration)
work['measuredWorkHours'] = round(duration / 3600, 3)
work['allAutomatedChecksPass'] = True
work['physicalPhoneFPSValidated'] = False
(root / 'verification/worklog.json').write_text(json.dumps(work, indent=2) + '\n')

model_rows = '\n'.join(
    f"| `{m['file']}` | {m['triangles']:,} | {m['bytes']:,} | {m['MB']:.3f} | "
    f"{sum(t['bytes'] for t in m['textures']) / 1e6:.3f} |"
    for m in weights['models'])
texture_rows = '\n'.join(
    f"| `{p['file']}` | {p['bytes']:,} | {p['MB']:.3f} |"
    for p in weights['sidecars'])
iteration_rows = '\n'.join(
    f"| [{i['iteration']}](iterations/{i['iteration']}/CRITIQUE.md) | {i['screenshots']} | "
    f"{'עברו סעיפי הביקורת' if i.get('visualAcceptance') else 'נמצאו כשלים והופק תיקון'} |"
    for i in work['iterations'])
bench = reports['benchmark']
performance_rows = []
for size in ['390x844', '844x390']:
    for view in ['near', 'far']:
        selected = [r for r in bench['records'] if
                    f"{r['viewport']['width']}x{r['viewport']['height']}" == size
                    and r['scenario']['view'] == view]
        fps = [r['fps'] for r in selected]
        triangles = [r['diagnostics']['renderer']['triangles'] for r in selected]
        calls = [r['diagnostics']['renderer']['calls'] for r in selected]
        performance_rows.append(f"| {size} | {'דמות קרובה' if view == 'near' else 'סגל וקהל 240'} | "
                                f"{len(selected)} | {min(fps):.1f} | {median(fps):.1f} | {max(fps):.1f} | "
                                f"{min(triangles):,}–{max(triangles):,} | {min(calls)}–{max(calls)} |")
performance_rows = '\n'.join(performance_rows)
largest = sorted(((p.stat().st_size, p) for p in root.rglob('*') if p.is_file()), reverse=True)[:8]
largest_rows = '\n'.join(f"| `{p.relative_to(root)}` | " +
                         (f"כ־{size / 1e6:.1f}" if p.name == 'standalone.html' else f"{size / 1e6:.3f}") +
                         ' |' for size, p in largest)
motion = reports['motion-validation']
continuity_max = max(r['maxVelocityResidualMetersPerSecond'] for r in motion['continuity'])
skin = reports['skin-baked-validation']
skin_max = max(r['maxHandPenetration'] for r in skin['records'])
skin_gap = max(r['maxNearestHandSurfaceGap'] for r in skin['records'])
max_model = max(m['bytes'] for m in weights['models'])
checks = '\n'.join(f"| [`{name}.json`](verification/{name}.json) | " +
                   ('108 מקרי מדידה הושלמו; אינו אימות 30fps בטלפון' if name == 'benchmark' else 'עבר') +
                   ' |' for name in names)

text = f'''# דוח מסירה — דמויות כדורסל 07

חמישה שחקנים בדויים PG–C ושופט; 12 קובצי GLB עם Draco, שני LOD לכל דמות ו־27 קליפים בכל קובץ. גוף ופנים ממקור MakeHuman מקומי, גובה 1.78–2.20 מ׳, מסה לפי עמדה, מדים ממוספרים, נעליים, שיער ופיאות ושרוולי לחץ. שתי פלטות צבע בלבד. כל הקבצים חדשים ונמצאים בתיקיית המסירה; לא נערך קוד קיים ולא בוצע מיזוג.

[פתיחת התצוגה המקומית](standalone.html) · [השוואת הסבבים](review.html) · [הפעלה ושחזור](README.md) · [מקורות ורישיונות](LICENSES.md)

## זמן ועבודת ביקורת

התחלה שמרנית מתועדת: {work['startedAtUtc']}. השלמת הבדיקות והדוח: {now.isoformat()}. משך עבודה רציפה מתועד: **{duration / 3600:.2f} שעות**. נבנו ורונדרו {len(work['iterations'])} סבבים; לא הוסקה עבודה מתאריך שם הענף. הזמנים והגיבובים נמצאים ב־[`worklog.json`](verification/worklog.json) וב־`capture.json` בכל סבב.

| סבב | צילומי ליבה | תוצאה |
| --- | ---: | --- |
{iteration_rows}

כל סבב כולל 390×844 ו־844×390, גוף מקרוב וסגל מרחוק. בסבבים המאוחרים נוספו פנים, ידיים וגב של כל שש הדמויות; בסבב המסירה נבדקה גם קבוצת השמנת. גיליונות הפעולה ורצפי המעבר נשמרו בתוך תיקיות הסבבים. סבב 01 מסומן כצילום ראשוני שלא נשמר נקי משינוי מקביל; מסבב 02 הצילום נעשה מעותק קפוא. ארכיוני `SOURCE-SNAPSHOT.zip` משמרים את מקורות הטקסט של סבבי הליבה, וה־GLB והמפות מזוהים בגיבובים.

הכשלים שהובילו לשינוי כוללים UV בפנים ובבד, עיניים בוהקות, מרפקים, מגע בגב כף היד במקום בכף, חדירת סוליות ורשת הנפילה לרצפה, שיער מפוסל, מכפלות פתוחות, מכנסי שופט, ריצה שנקראה כהליכה, וקפיצה זעירה בפתרון הקימה מנפילה. הייצוא נבדק גם בין מפתחות, בכל הדמויות ובשני ה־LOD.

## ציון עצמי וביקורת עצמאית

| פריט | ציון מתוך 10 | ראיות ומה עדיין מגביל |
| --- | ---: | --- |
| שוני בין העמדות | 8.5 | אותה מצלמה וקו רצפה, גובה ומסה שונים, שש צלליות; אין סימולציית שריר דינמית |
| פנים | 8 | תקריבי שש הדמויות, אנטומיה, עיניים, שפתיים, אוזניים ופיאות; עפעפיים, נקבוביות ושיער פשוטים מהפקת ספורט מסחרית גדולה |
| בד | 8 | אריג בנורמל, מספרים, צווארון, תפירה ומכפלות; אין סימולציית בד או קפלים דינמיים |
| ידיים על הכדור | 8 | משטחי כף יד מדודים, אגודל נגדי, grip morphs כולל NORMAL ובדיקת קודקודים בפועל; שלד 18 אינו מאפשר אצבעות עצמאיות בכל פעולה |
| מעברים | 8 | צילום מעבר בשתי המידות, {len(motion['continuity'])} מקרי מהירות עם הפרעות ומעברי קליטה; נדרש הבקר המצורף לשימור המגע |
| מצלמה ומסגור | 8 | 648 מקרי מצלמה וגיליונות סבב 11; המסגור שמרני בפעולות גבוהות וכפתורי התחתית מכסים מעט פרטי קרקע |

הרפרנס הוא **NBA LIVE** כפי שביקש המשתמש. אלה ציוני חבילת דמויות לנייד במסגרת מגבלות המשקל, האטלס והשלד. אין כאן בדיקת שוויון באותה סצנה מול המשחק המסחרי, ואין טענה לשוויון במראה הפנים, בלכידת תנועה או במערכת המשחק המלאה. [REFERENCE.md](REFERENCE.md) מפרט מה נבדק בפועל ומה לא היה זמין לעיון.

## משקלי מודלים

MB הוא מיליון בתים. עמודת הטקסטורות כלולה כבר בגודל ה־GLB ואינה תוספת לו. כל קובץ כולל 27 קליפים; הגדול ביותר {max_model:,} בתים, מתחת ל־1,500,000.

| קובץ | משולשים מפוענחים | בתים | MB | טקסטורות מוטבעות MB |
| --- | ---: | ---: | ---: | ---: |
{model_rows}

פריסת אטלס אחת לכל דמות: צבע 1024×1024 ונורמל 1024×1024 באותה פריסה. מפות הצבע המוטבעות WebP; עותקי PNG משמשים לעריכה. שני ה־LOD משתפים מפות בתצוגה; נורמל הבד משותף לכל הסגל. הנתונים והגיבובים המלאים נמצאים ב־[`weights.json`](verification/weights.json).

| אטלס או פריסה לעריכה | בתים | MB |
| --- | ---: | ---: |
{texture_rows}

סך קובצי המודלים: {weights['totals']['modelsMB']:.3f} MB. סך התמונות המוטבעות הייחודיות: {weights['totals']['uniqueEmbeddedImageBytes'] / 1e6:.3f} MB. אומדן מפות GPU ייחודיות RGBA8 עם mipmaps: {weights['totals']['estimatedUniqueImageGPUMB']:.2f} MB; זה אינו אומדן של כל זיכרון הדפדפן. HTML עצמאי כולל עותקי מודלים לתצוגה ללא הקליפים המוטבעים, מפני שאותו בקר מקור מנגן את הפעולות. גאומטריה, bind, morphs וחומרים נשמרים; הטרנספורמציה והגיבובים מתועדים ב־[`package.json`](verification/package.json).

לצד התמונות, Three מקצה מאגרי GPU להנפשת morph ולשלד, מפת צל ויעדי רינדור; הם אינם כלולים באומדן האטלסים. מספר הטקסטורות הפנימי של הרנדרר כולל גם אותם.

## תנועה ושלד

27 הפעולות כוללות חמישה כדרורים, ארבע קליעות, לייאפ, שלושה דאנקים, רב־צעד, ריצה, האטה, הגנה בצעדי צד, חטיפה, חסימה, ריבאונד, אחיזה, הליכה, pivot, חגיגה, נפילה ואיתות שופט. התנועה מקורית ואנליטית; לא נעשה שימוש בלכידת תנועה. בריצה יש שלב תעופה. לכדור בכדרור שלב דחיפת יד ותעופה חופשית ב־9.81 מ׳/שנ׳².

חמשת הכדרורים הם ימין, שמאל כמראה, כוח, צולב ובין הרגליים. ארבע הקליעות ושלושת הדאנקים נבדלים במסלולי הגוף והכדור; אין כאן חמש מערכות תנועה של ספורטאים אמיתיים. מגבלות הגימור כוללות כפות ידיים שפונות מעלה בכמה מחוות חופשיות ואצבעות פרושות בריצה. תיקון המצלמה בסבב 11 נועד לשמור גם את ראש הדמות בשיא הרב־צעד בתוך הפריים.

18 שמות העצמות וההיררכיה תואמים ל־motion2. תנוחת הקשירה האנושית שונה, ולכן נכלל [מתאם מפורש](RETARGET.md) עם כיול bind לכל עמדה ובדיקה של כל מפתחות המקור. `MotionBallAnchor` הוא עוגן תצוגה ואינו עצם skin או כדור סימולציה. דחיסת הגאומטריה Draco; נתוני האנימציה בלבד משתמשים ב־Meshopt ללא אובדן עם `filter: NONE`, ומאומת שוויון בינארי של ערכי כל accessor. שני המפענחים מקומיים.

הבקר ממתין לקליטת הכדור, מערבב מסלול ומהירות ומבצע IK אחרי הערבוב. בבדיקת {len(motion['continuity'])} המקרים, שארית המהירות המקסימלית היא {continuity_max:.4f} מ׳/שנ׳ מול סף 0.3. `AnimationMixer.crossFade` לבדו אינו מבטיח את המגע. הבדיקות אינן מאמתות בעלות על כדור, ניקוד, רשת סל או התנגשויות של משחק.

## בדיקות

| תוצאה מפורטת | מצב |
| --- | --- |
{checks}

בדיקת קודקודים עצמאית של ה־GLB באמצעות AnimationMixer בלבד, ללא IK על הדמות הנבדקת: **{skin['totals']['poseSamples']:,} פוזות ב־{skin['sampleHz']}Hz**, שני ה־LOD וכל 27 הפעולות. חדירת יד מרבית {skin_max * 1000:.2f} מ״מ, והמרחק המרבי של הקודקוד הקרוב למעטפת הכדור {skin_gap * 1000:.2f} מ״מ; סף שניהם 20 מ״מ. נבדקו סוליות בכל הפעולות וכל קודקודי הגוף בנפילה. זו דגימת קודקודים, ולא הוכחת העדר חיתוך רציף בין משולשים.

בדיקת מסגור ברירת המחדל כוללת {len(reports['framing']['records'])} מקרי מצלמה ו־{reports['framing']['deformedPoses']:,} פוזות, עם גבולות שמחושבים מכל קודקודי שני ה־LOD, בשתי המידות ובכל הפעולות. היא כוללת כדור בזמן מגע; תעופה חופשית של כדור ששוחרר או מגיע לריבאונד רשאית לצאת מהתקריב. סיבוב וזום חופשיים של המשתמש אינם מוגבלים למסגור הזה.

בדיקות הריפו הקיימות עברו ללא שינוי קוד או בדיקות: 3,278 בדיקות, 3,227 עברו, 51 דולגו, אפס כישלונות. הוגדר Chromium מותקן באמצעות נתיב זמני מחוץ לריפו, לאחר שניסיון ראשון נתקל בבינארי Playwright חסר. מסמך הבדיקה מתעד זאת.

## ביצועים ומקומיות

108 מדידות ניגון בפועל: 27 פעולות × שתי מידות מסך × דמות קרובה או שש דמויות וקהל 240 ב־instancing. המכשיר מדומה למגע ו־DPR2, והרינדור מוגבל ל־DPR1.5 ול־30fps. LOD מרוחק אמיתי, skeleton משותף בין LOD, שני InstancedMesh לקהל ורינדור לפי דרישה בהשהיה.

| מסך | מצב | פעולות | FPS מזערי | FPS חציוני | FPS מרבי | משולשים לפריים | draw calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
{performance_rows}

המדידה נעשתה ב־**Chromium ANGLE SwiftShader בתוכנה**, לא בטלפון פיזי. נתוני FPS מחושבים ממספר פריימים לאורך זמן שעון אמיתי; זמני CPU אינם זמני GPU. **יעד 30fps בטלפון בינוני טרם אומת בחומרה פיזית.** הקובץ [`benchmark.json`](verification/benchmark.json) מכיל את כל הפעולות, זמני המדידה והספירות.

התצוגה העצמאית נבדקה כשכל בקשות הרשת חסומות, עם 20 בדיקות אינטראקציה. מדיניות הדפדפן המנוהל חסמה ניווט ישיר ב־`file://`; אותו HTML מלא נבדק במסמך מבודד. לפתיחה רגילה אין תלות בשרת או build; חלופת HTTP מקומית והוראות שימוש ב־README. גישה מהדפדפן לדוח או ליומן היא פעולה מקומית שהמשתמש בוחר.

## הקבצים הגדולים

| קובץ | MB |
| --- | ---: |
{largest_rows}

הגבלת 1.5MB חלה על כל GLB, ולא על HTML שמאגד סגל שלם או על יומן הבדיקות. גודל ה־HTML כאן מעוגל, שכן הדוח עצמו מוטבע בו; גודל וגיבוב מדויקים של החבילה הסופית נמצאים ב־verification/package.json. מצאי כל הקבצים וגיבוביהם ב־[inventory.json](verification/inventory.json). רישיונות המקור וההסתייגות לגבי אסמכתאות האביזרים המקוריים מפורטים ב־LICENSES.md. לא נוספו מותגים, מועדונים, דיוקנאות אמיתיים, נתוני לקוחות, מפתחות או טלפונים.
'''
(root / 'REPORT.md').write_text(text)
print(json.dumps({'file': 'REPORT.md', 'bytes': len(text.encode()), 'hours': duration / 3600,
                  'checks': len(names), 'models': len(weights['models']), 'maximumGLBBytes': max_model}))
