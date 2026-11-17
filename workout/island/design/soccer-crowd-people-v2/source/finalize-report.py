"""Write evidence-based handoff and measure the entire package, including itself."""
import json,re,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
test_log=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/crowd-repo-tests.log').read_text()
counts={}
for key in ['tests','suites','pass','fail','cancelled','skipped','todo']:
    match=re.search(r'^\s*[ℹ#]?\s*'+key+r'\s+(\d+)\s*$',test_log,re.M)
    if not match:raise SystemExit('Incomplete repository test log: '+key)
    counts[key]=int(match.group(1))
assert counts['fail']==0 and counts['cancelled']==0
(ROOT/'verification/repo-tests.json').write_text(json.dumps(dict(command='npm test',environment={'PLAYWRIGHT_BROWSERS_PATH':'/tmp/crowd-v2-browsers'},browserExecutable='/usr/bin/chromium',browserVersion='151.0.7922.173',**counts),indent=2)+'\n')
m=json.loads((ROOT/'manifest.json').read_text())
a=json.loads((ROOT/'verification/assets.json').read_text())
b=json.loads((ROOT/'verification/browser.json').read_text())
p=json.loads((ROOT/'verification/poses.json').read_text())
assert a['pass'] and b['passAll']
samples=sum(len(s['fans']) for c in p for s in c['samples'])
ground=max(abs(f['footMinimumY']) for c in p if c['clip']!='jump_cheer' for s in c['samples'] for f in s['fans'])
contact=max(f['palmDistance'] for c in p if c['clip']=='clap' for s in c['samples'] if s['time'] in [0,.5,1] for f in s['fans'])
jump=max(f['footMinimumY'] for c in p if c['clip']=='jump_cheer' for s in c['samples'] for f in s['fans'])
clips='\n'.join(f"| `{c['id']}` | {c['label']} | {c['duration']} שניות |" for c in m['clips'])

def report(total,files):
    return f'''# מסירת קהל כדורגל אנושי v2

17.11.2026 · ענף `codex/soccer-crowd-people-v2` · בסיס `43b27dc235387e3cb737aee9558cdf9d5fd5a262`.

16 אוהדים בעלי פרופורציות אנושיות, בשלוש רמות פירוט ובשבע תנועות מחזוריות. המסירה נמצאת כולה ב־`workout/island/design/soccer-crowd-people-v2/`. כל השינויים הם הוספת קבצים בתיקייה החדשה בלבד, בהתאם לבקשה; רישום המסירה נמצא בדוח זה.

![התצוגה בגודל 844×390](verification/preview-844x390.png)

| דרישה | תוצאה |
|---|---|
| 16 דגמי אוהדים | 16 מראות, 48 קובצי GLB עצמאיים |
| 200–400 משולשים ברמה הקרובה | בדיוק 210 לכל אוהד, כולל שיער ואביזרים |
| שלוש רמות LOD | בדיוק 210 / 90 / 24 משולשים; כל קובץ כולל את אותו שלד ואת כל התנועות |
| משקל GLB כולל | {a['glbBytes']:,} בתים ({a['glbBytes']/1e6:.3f} MB) |
| משקל החבילה כולה | **{total:,} בתים ({total/1e6:.3f} MB)**, כולל מקור, ספריות, דוח, צילומים ותוצאות בדיקה; {files} קבצים; מתחת ל־6,000,000 בתים |
| Khronos | 48/48 נקיים: 0 שגיאות, 0 אזהרות, 0 הערות מידע |
| תצוגה | `preview.html`, נבדקה ב־844×390 וגם ב־390×844; כל התלויות מקומיות |
| רישוי | גאומטריה, אטלסים ותנועות CC0-1.0; ספריות התצוגה MIT; פירוט ב־[LICENSES.md](LICENSES.md) |

## המראה האנושי

הגילים הבדויים הם 8–79 והגבהים 1.24–1.89 מטר. היחס בין הגובה לגובה הראש הוא כ־6.05 אצל הילד הצעיר ועד 7.45 אצל מבוגרים. יש הבדלים ברוחב הפנים, האף, הכתפיים, המותן והגפיים; גוני עור בהירים עד כהים; שיער כהה, חום, מתולתל, אסוף ואפור; שמונה הצגות נשיות ושמונה גבריות. תכנון המראות כולל מגוון רקעים חזותיים אפריקאיים, אסייתיים, אירופיים, מערב־אסייתיים ולטינו־אמריקאיים, ללא דיוקן של אדם אמיתי.

הראש נדגם ממשטחי לסת, לחיים וגולגולת קיימים ברישיון CC0; הגוף משתמש בחתכי האנטומיה הקיימים של המאגר. הגפיים מתחדדות אל המרפק, שורש כף היד והקרסול. יש אף, אוזניים, פרטי פנים באטלס, נעליים, חולצות חלקות/פסים/פס חזה/שרוול מנוגד, מכנסיים קצרים וארוכים, כובעים, משקפיים וצעיפים. כל אוהד משתמש באטלס PNG מוטמע בגודל 256×256 ובחומר PBR יחיד. אין סמלים או מותגים.

זהו מראה אנושי מפושט לקהל במשחק. הפאות נשארות נראות במבט קרוב. ברמת 24 משולשים הגוף והראש נפחיים והגפיים משתמשות בצלליות דו־צדדיות; רמה זו מיועדת לדמויות שגובהן פחות מ־16 פיקסלים, ללא פרטי פנים. היא אינה מיועדת לבחינה מקרוב או למבט צד דק.

![16 המראות, מתוך קובצי ה־GLB שנמסרו](verification/portraits-16.png)

## תנועות

הבקשה מציינת „6 קליפים” אך מונה שבע פעולות. כל שבע הפעולות סופקו, כדי לכסות את הרשימה במלואה.

| מזהה | פעולה | משך לולאה |
|---|---|---|
{clips}

כל קליפ מוטמע בכל GLB, ללא תנועת שורש אופקית. העצמות הן `CrowdCanonical18`, עם שמות והורים תואמי השלד הקנוני הקיים, אך אורך גוף ו־inverse binds עצמאיים לכל אוהד. סיבובים הם quaternions בסדר XYZW במרחב ההורה. קצות הלולאה זהים; תנועות הנשימה, הכפיפה והקפיצה מחזוריות. מחיאת כף משתמשת ב־IK לשתי זרועות ובכיוון כפות הידיים זו אל זו.

לגל: להפעיל `wave_clap` ולהוסיף 0.12 שניות פאזה בין מושבים סמוכים. במעבר LOD משמרים את הזמן המנורמל באותו קליפ. בישיבה גובה המושב למבוגר הוא בערך 0.44–0.48 מטר; בתצוגה כלולים מושבי המחשה. כל התנועות מניחות שמישור הרצפה המקומי הוא Y=0.

## ראיות בדיקה

| בדיקה | תוצאה |
|---|---|
| Khronos glTF Validator {a['validatorVersion']} | 48/48 נקיים, כולל אנימציות, סקינים, תמונות ומבנה GLB |
| בדיקות מבנה נוספות | ספירת משולשים, SHA-256, אזורי זיכרון, נורמלים באורך יחידה, משקלים שסכומם 1, אינדקסי עצמות, שטחי משולשים חיוביים, קצוות לולאה וללא משאבים חיצוניים |
| Chromium עם WebGL וטעינה במצב offline | {len(b['checks'])}/{len(b['checks'])} בדיקות עברו; כל 48 הנכסים נטענו |
| דגימות של גאומטריה לאחר skinning בפועל | {samples:,}: 16 אנשים × 3 רמות × 7 קליפים × 9 זמנים |
| סטייה מרבית של תחתית הנעל מהרצפה מחוץ לקפיצה | {ground:.9f} מטר |
| מרחק מרבי בין מרכזי כפות הידיים ברגעי המחיאה | {contact:.5f} מטר; כפות הידיים עצמן בעלות עובי ונוגעות זו בזו |
| גובה ריחוף מרבי שנמדד בקפיצה | {jump:.4f} מטר |
| אינטראקציות | בחירת כל 16 האנשים, 7 תנועות, 3 רמות, עצירה/ניגון, ציר זמן, סיבוב במגע ובמקלדת, מבט פנים, תנועה מופחתת ושחזור WebGL |
| תקשורת ושגיאות דפדפן | 0 בקשות חיצוניות ו־0 שגיאות דפדפן |
| `npm test` של המאגר | {counts['pass']:,} עברו, {counts['fail']} נכשלו, {counts['skipped']} דולגו; {counts['tests']:,} בדיקות בסך הכול |

ראיות מלאות: [assets.json](verification/assets.json), [browser.json](verification/browser.json), [poses.json](verification/poses.json), [repo-tests.json](verification/repo-tests.json). צילומי שבע התנועות ורמות הפירוט נמצאים ב־`verification/`.

בדיקות הדפדפן בוצעו ב־Chromium/SwiftShader בסביבת Linux. לא נמדד FPS בטלפון פיזי או במגרש המשחק המחובר. מספר המשולשים לקהל של 16 אנשים הוא 3,360 / 1,440 / 384 בהתאמה, וקריאת ציור אחת לכל אדם. אלה מדדי הנכסים, ולא הבטחת ביצועים למכשיר.

לבדיקות המאגר הוגדר `PLAYWRIGHT_BROWSERS_PATH` למטמון זמני ב־`/tmp`, המפנה ל־Chromium 151 המותקן בסביבה. קובצי המאגר והבדיקות הקיימים נשארו כפי שהם. בדיקת 50 תרגילי האימון עברה גם בנפרד עם אותו דפדפן.

## שימוש ושחזור

1. פותחים את [preview.html](preview.html) באמצעות שרת HTTP מקומי, כשהחלון 844×390. בוחרים מספר אוהד, תנועה ורמת פירוט; גרירה מסובבת את הדמות ו„פנים” מתקרב לראש. התוצאה הצפויה: דמות נבחרת משמאל וכל 16 האנשים ביציע מימין.

מתוך תיקיית החבילה:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

ואז פותחים בדפדפן:

```text
http://127.0.0.1:8765/preview.html
```

2. לחיבור, קוראים את [manifest.json](manifest.json) וטוענים קובץ אחד בלבד לכל אוהד. המלצת הבחירה לפי גובה דמות במסך: 48 פיקסלים ומעלה → LOD0; ‏16–47 → LOD1; פחות מ־16 → LOD2. משתמשים ב־inverse binds ובקליפים של אותו קובץ ושומרים את זמן הקליפ במעבר.
3. יצירה חוזרת דורשת Python 3, ‏NumPy ו־Pillow. מתוך תיקיית החבילה:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 source/build.py
```

4. אימות Khronos, עם התקנת כלי הבדיקה בתיקייה זמנית:

```sh
npm install --prefix /tmp/crowd-v2-checks gltf-validator@2.0.0-dev.3.10
CROWD_TOOLS=/tmp/crowd-v2-checks node source/validate-assets.mjs
```

5. בדיקת התצוגה דורשת Playwright ו־Chromium. אין צורך בשרת או ברשת, משום שהבדיקה מגישה רק את קובצי החבילה דרך route מקומי:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 source/check-browser.py
```

המקורות, ה־manifest והבדיקות ניתנים לשחזור מקומי. גודל החבילה נמדד לפי סכום תוכן הקבצים, ללא תקורת מערכת קבצים או ספריית Git. כל קובצי ה־GLB אינם משתמשים בדחיסה או בהרחבות, ונטענים ישירות ב־GLTFLoader רגיל.
'''

for _ in range(5):
    files=[f for f in ROOT.rglob('*') if f.is_file() and 'node_modules' not in f.parts and '__pycache__' not in f.parts]
    total=sum(f.stat().st_size for f in files);count=len(files)
    m['packageBytes']=total
    (ROOT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'REPORT.md').write_text(report(total,count))
    (ROOT/'verification/summary.json').write_text(json.dumps(dict(packageBytes=total,fileCount=count,limitBytes=6000000,glbBytes=a['glbBytes'],glbs=48,models=16,clipsPerGLB=7,khronosErrors=0,khronosWarnings=0,browserChecks=len(b['checks']),posedSamples=samples,repositoryTests=counts),indent=2)+'\n')
final_files=[f for f in ROOT.rglob('*') if f.is_file() and 'node_modules' not in f.parts and '__pycache__' not in f.parts]
final_total=sum(f.stat().st_size for f in final_files)
assert final_total==m['packageBytes'] and len(final_files)==count,(final_total,m['packageBytes'])
assert final_total<=6000000
print(json.dumps(dict(bytes=final_total,files=len(final_files),repoTests=counts,browserChecks=len(b['checks'])),ensure_ascii=False))
