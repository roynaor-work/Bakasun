"""Assemble the delivery report only after all recorded verification finishes."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib

ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

assets=read('verification/assets.json');animations=read('verification/animations.json')
long_soak=read('verification/soak/result.json');soak=read('verification/soak-final/result.json');performance=read('verification/performance.json')
browser=read('verification/browser.json');inspector=read('verification/inspector-after.json')
transforms=read('verification/transforms.json');winding=read('verification/winding.json')
vendor=read('verification/vendor.json');repository=read('verification/repository.json')
studio=read('verification/studio/renders.json');studio_source=read('verification/studio-source.json')
offline_sha=sha(ROOT/'offline.html')
assert not assets['failures'] and not animations['failures']
assert all(d['pass'] for d in [long_soak,soak,browser,inspector,transforms,winding,vendor,repository])
assert long_soak['actualSeconds']>=8400 and soak['actualSeconds']>=600 and len(studio)==42
assert all((ROOT/'verification/studio'/r['file']).is_file() for r in studio)
assert all(sha(ROOT/r['file'])==r['sourceSHA256'] for r in studio_source['files'])
assert all(d['offlineSHA256']==offline_sha for d in [performance,browser,inspector,transforms])
assert soak['epochs'][-1]['offlineSHA256']==offline_sha
assert all(sha(ROOT/'models'/r['filename'])==r['sha256'] for r in assets['rows'])
iterations=[]
for folder in sorted((ROOT/'iterations').iterdir()):
 if not folder.is_dir():continue
 data=read(f'iterations/{folder.name}/render.json')
 assert (folder/'CRITIQUE.md').is_file() and not data['errors'] and not data['externalRequests']
 assert {(390,844),(844,390)}<={tuple(r['viewport']) for r in data['views']}
 assert {True,False}<={r['close'] for r in data['views']}
 iterations.append((folder.name,len(list(folder.glob('*.png')))))
assert len(iterations)>=6
latest=read(f'iterations/{iterations[-1][0]}/render.json')
assert all(not r['framing']['clipped'] for r in latest['assets'])
for file,digest in latest['sourceHashes'].items():assert sha(ROOT/file)==digest,file
largest=max(assets['rows'],key=lambda r:r['bytes'])
glb_bytes=sum(r['bytes'] for r in assets['rows'])
triangles=sum(r['triangles'] for r in assets['rows'])
tex=read('verification/texture-files.json')
assert max(max(t['size']) for t in tex)<=1024
scores=[
 ('C01','אחידות סגנון לאי',8,'פלטת קרם/טורקיז/קורל, קצוות מעוגלים וצל רך; נבדק מול שלושת הרפרנסים המקומיים.'),
 ('C02','חמש ספינות ובוס נפרד',9,'סייר, מנטה, חיפושית, נושאת טבעת וקוצר; בוס כתר שישי. שש צלליות נבדקו מכל הצדדים.'),
 ('C03','מטוס מגן',9,'גוף קרם, כנפיים טורקיז, תא טייס, מנועים ושני עוגני ירי שנבדקו מול הקרניים.'),
 ('C04','פיצוץ, לייזר וגל הלם',8,'אטלס 16 פריימים, שתי קרניים, טבעת ו־32 גיצים במאגרים מוגבלים. חיי האפקט 1.1 שניות.'),
 ('C05','כוכבים, כוכבי לכת ועננים',8,'220 כוכבים, ירח וכוכב לכת בעל טבעות, עננים בשתי הסביבות; ניגודיות יום ולילה.'),
 ('C06','חווה ושלושה חזירי בר',8,'בוגר חום בעל ניבים, בוגר אפרפר בעל רעמה וגור מפוספס; גדר, שער, פעמון, סככה, תחנה, שוקת, ערוגות וקש.'),
 ('C07','צוות ושלד 18 עצמות',9,'שלושה שומרים בדיוניים. LOD0/1 תואמים לשמות ולהורי motion2; המתנה, סיור והתרעה. bind מכויל ו־retarget מתועדים.'),
 ('C08','שמיים ותאורת יום/לילה',8,'שינוי שמיים, שמש, תאורת סביבה ופנסים. פרופיל חיסכון שומר גופי פנס זוהרים עם צל תמונה.'),
 ('C09','מובייל, קרוב ורחוק',9,'390×844 ו־844×390, יום/לילה ו־88 מבטי קטלוג סופיים. אפס חיתוכי נכס נבחר; פקדים בתוך המסך.'),
 ('C10','משקלי GLB וטקסטורות',10,'כל 58 הקבצים דורשים Draco ונמצאים מתחת ל־1.5MB לקובץ. תשע מפות 512²; אטלס יחיד משותף לרמות כל דמות.'),
 ('C11','30fps, LOD ו־instancing',8,'מדידת התוכנה הסופית קרובה ל־30 בכל שמונת התרחישים. תחת עומס כבד DPR יורד עד 0.5; צילום החיסכון נמסר. חסרה מדידה בטלפון בינוני פיזי.'),
 ('C12','HTML מקומי ו־Three r160',10,'HTML יחיד עם ספרייה, מפענח, מודלים ומפות מוטמעים. offline ו־CSP פעילים, אפס בקשות HTTP/HTTPS. מגבלת file:// בסביבת הבדיקה מפורטת להלן.'),
 ('C13','לולאת בנייה וביקורת',10,f'{len(iterations)} סבבים אמיתיים, צילומים וביקורת בכל תיקייה; גם כישלונות ומדידות לפני התיקונים נשמרו.'),
 ('C14','מסירה ותיעוד',9,'REPORT, טבלת כל המודלים, CSV לכל הקבצים, manifest, רישיונות, חוזה שילוב וענף PR כטיוטה מול main.'),
]
acceptance={'generatedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':offline_sha,
 'scores':[{'id':i,'item':item,'score':score,'evidenceAndLimits':e} for i,item,score,e in scores],
 'physicalPhoneTested':False,'directFileNavigationTested':False,
 'remainingValidation':'Physical medium-phone playback, direct local-file opening on that device, and performance after game integration.'}
(ROOT/'verification/acceptance.json').write_text(json.dumps(acceptance,ensure_ascii=False,indent=2))
started=datetime(2026,11,4,20,12,36,tzinfo=timezone.utc);finished=datetime.now(timezone.utc)
hours=(finished-started).total_seconds()/3600
delivery=read('verification/delivery.json') if (ROOT/'verification/delivery.json').exists() else None
delivery_text=f"[PR #{delivery['number']} — טיוטה מול main]({delivery['url']})" if delivery else 'הענף מוכן למסירה כ־PR בטיוטה מול main; מספרו יתווסף אחרי יצירתו.'
score_table='\n'.join(f'| {i} | {item} | {score} | {e} |' for i,item,score,e in scores)
iteration_table='\n'.join(f'| [{name}](iterations/{name}/CRITIQUE.md) | {count} |' for name,count in iterations)
performance_table='\n'.join(f"| {r['cpuThrottle']}× | {r['viewport'][0]}×{r['viewport'][1]} | {'חווה / לילה' if r['scene']=='farm' else 'חלל / יום'} | {r['meanFPS']:.2f} | {r['p50MS']:.1f} | {r['p95MS']:.1f} | {r['dpr']} | {r['triangles']:,} / {r['calls']} |" for r in performance['scenarios'])
largest_files=sorted((p for p in ROOT.rglob('*') if p.is_file() and 'iterations' not in p.parts and 'verification' not in p.parts),key=lambda p:p.stat().st_size,reverse=True)[:5]
size_table='\n'.join(f'| `{p.relative_to(ROOT)}` | {p.stat().st_size:,} | {p.stat().st_size/1e6:.6f} |' for p in largest_files)
stability=soak['stability'];poses=sum(r['frames'] for r in animations['records'])
report=f'''# הגנת האי · Defense v7 · דוח מסירה

נוצרה חבילת אמנות עצמאית: **58 קובצי GLB ב־27 משפחות**, מציג אינטראקטיבי ללא רשת, שתי סביבות ו־{len(iterations)} סבבי בנייה/צילום/ביקורת/תיקון. הצי כולל חמש ספינות ובוס נפרד; החווה כוללת שלושה חזירי בר וצוות שמירה בדיוני. {delivery_text}

עבודה רציפה מ־04.11.2026 20:12:36 UTC עד {finished.strftime('%d.%m.%Y %H:%M:%S')} UTC — {hours:.2f} שעות. תאריך הענף נשמר לפי הבקשה: `codex/defense-v7-20261105`. בסיס המאגר: `5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275`.

## לפתיחה ולביקורת

* [offline.html](offline.html): קובץ יחיד, ללא התקנה או build. Three r160, Draco, כל המודלים, האפקטים והטקסטורות מוטמעים בו.
* [הוראות התצוגה](README.md), [חוזה שילוב](INTEGRATION.md), [manifest](manifest.json), [מקורות ורישיונות](LICENSES.md).
* [ציונים לכל נכס ואפקט](ASSET-REVIEW.md), [משקלי כל 58 המודלים ותשע המפות](BUDGET.md), [גודל ו־SHA של כל קובץ](FILE-SIZES.csv).
* [צילומי הסבב הסופי](iterations/{iterations[-1][0]}/render.json), [42 מבטי סטודיו](verification/studio/renders.json), [מקור גאומטריית הסטודיו](verification/studio-source.json).

פקדים: סביבה, יום/לילה, קרוב/רחוק, גרירה/צביטה, קטלוג, עצירה ואפקט. עצירה ופתיחת נכס משחזרות רזולוציה גבוהה לבחינת הפרטים. במבט רחוק ניתן לראות את כל האי; במבט סביבה קרוב קצה האי עשוי לצאת מהפריים בכוונה. נכס שנבחר בקטלוג ממוסגר בשלמותו.

## ציונים עצמיים

הציונים הם הערכת איכות מול [רשימת הקבלה](DESIGN.md). 8 מציין תוצר מתאים למסירה עם מגבלות גלויות; 10 שמור לפריט מדיד שנבדק במלואו. יעד חומרה אינו מוסק מהדמיית תוכנה.

| מזהה | פריט | ציון / 10 | ראיה ומגבלה |
|---|---|---:|---|
{score_table}

## מה תוקן בלולאה

הסבבים הראשונים חשפו UV ומפות צבע לא תקינים, עומס גאומטריה בחווה, מסגור קטלוג וקבצי אנימציה מנופחים. לאחר מכן נוספו LOD סטטי לדמויות קטנות, שיתוף אטלסים, עוגני ירי פעילים, צל עלים אפוי ופינוי שלדי קטלוג. דליפת טקסטורות בהחלפת שומר תוקנה ונבדקה ב־24 החלפות.

רינדורי צד וגב חשפו גם סדר משולשים הפוך בצינורות והצללה שגויה בשפת האי. כיוון ה־tube תוקן במקור הגאומטריה; שפת הקרקע קיבלה הפרדת נורמלים, ופינות פגומות בדמויות המקור וברשתות שעברו פישוט קיבלו נורמלים מחושבים מחדש. בדיקת הכיוון ירדה מ־9,031 משולשים מנוגדים לאפס. רינדורי הסטודיו במסירה נוצרו מקובצי ה־GLB המתוקנים, ב־Cycles עם 32 דגימות, ללא denoise, והומרו ל־WebP באיכות 92. חותמות ה־PNG המקוריות נשמרו.

| סבב וביקורת | צילומי דפדפן |
|---|---:|
{iteration_table}

בכל סבב נשמרו שני הגדלים ושני המרחקים, כולל יום ולילה. כל `render.json` שומר זמני ריצה, מקור מדויק ב־SHA, שגיאות ובקשות. סבבי 08 והסבב הסופי כוללים גם כל נכס בקטלוג בשני הגדלים ובשני המרחקים. בסבב הסופי יש גם צילומי פרופיל DPR ‏0.75 ו־0.5.

## תקציבי קבצים וגאומטריה

| מדד | תוצאה |
|---|---:|
| מספר GLB | {len(assets['rows'])} |
| סך GLB, כל רמות הפירוט | {glb_bytes/1e6:.6f} MB |
| GLB הגדול ביותר | `{largest['filename']}` — {largest['bytes']:,} בתים / {largest['bytes']/1e6:.6f} MB |
| משולשים בכל הקבצים יחד, ללא מופעים | {triangles:,} |
| טקסטורות חיצוניות | {len(tex)} × 512×512; סך {sum(t['bytes'] for t in tex)/1e6:.6f} MB |
| מפות לכל דמות | אטלס יחיד, אותו SHA בכל רמות הפירוט |
| HTML העצמאי | {(ROOT/'offline.html').stat().st_size/1e6:.6f} MB |

הגדלים עשרוניים: 1MB = 1,000,000 בתים. כל GLB דורש `KHR_draco_mesh_compression`; אף קובץ אינו מתקרב לתקרת 1,500,000 הבתים. המפות החיצוניות הן עותקי עריכה של אטלסים מוטמעים ושל מפות הסביבה. במציג משתפים Texture אחת בין רמות כל דמות. הקהל, הגדרות, הדקלים, הערוגות, הקש, ענני החווה והפנסים משתמשים ב־instancing.

| קובץ גדול בחבילת השימוש | בתים | MB |
|---|---:|---:|
{size_table}

## ביצועים — מה נמדד

מדידה מבודדת ב־Chromium / ANGLE SwiftShader, שני גדלי המסך, הדמיית מובייל עם DPR מכשיר 3 והאטת CPU רגילה ופי ארבע. מציג התוכנה הוריד את ציור התלת־ממד עד DPR ‏0.5; הטקסט נשאר ברזולוציה מלאה. אחרי חימום של 10 שניות נצפו 6.5 שניות בכל תרחיש; הסטטיסטיקה מחושבת מהחלון האחרון, עד 120 פריימים. המדידות הגולמיות ב־[performance.json](verification/performance.json), עם [פרוטוקול המדידה](verification/PERFORMANCE.md).

| CPU | מסך CSS | סביבה | FPS ממוצע | חציון ms | p95 ms | DPR ציור | משולשים / קריאות |
|---:|---|---|---:|---:|---:|---:|---:|
{performance_table}

היעד הוא 30fps, והמציג מתזמן עד 30 ציורים לשנייה. פריימים לאחר עיכוב תזמון יכולים ליצור סטייה קלה סביב הממוצע. ההסתגלות מפחיתה תחילה רזולוציה עד 0.75, צללים דינמיים, חומר ותאורה מקומית, ואז פירוט; רק עומס שנותר מוריד ל־0.5. עלות ההקלה נראית בצילומי החיסכון: פרטים זעירים רכים יותר. הקבצים עצמם נשארים ב־PBR ובפירוט מלא. אין draw חוזר במצב עצור ללא שינוי.

**המגבלה שנותרה:** לא בוצעה מדידה על טלפון בינוני פיזי. 30fps יציב במכשיר ובמשחק המשולב עדיין דורש בדיקת חומרה; תוצאות SwiftShader והאטת CPU אינן תחליף לה. המציג וחבילת האמנות נמסרים עם מדידות ומנגנון הסתגלות גלויים.

## בדיקות והשהייה

| בדיקה | תוצאה |
|---|---|
| Khronos Validator, דחוס ומפוענח | 58 קבצים; אפס שגיאות ואזהרות |
| נורמלים, משקולות, עוגנים, שלד ואטלסים | כל תנאי הבדיקה עברו |
| כיוון משטח מול נורמל | אפס משולשים מנוגדים בכל המודלים |
| תנועה במעבד | {len(animations['records'])} צירופי נכס/קליפ, {poses:,} תנוחות ב־30Hz; אפס כישלונות |
| דפדפן מנותק | {len(browser['checks'])} בדיקות עברו, אפס שגיאות ובקשות HTTP/HTTPS |
| השוואת עדכוני מטריצות | {len(transforms['rows'])} השוואות מול Three מלא; זהות פיקסלים |
| החלפות קטלוג | 24 החלפות שומר, גידול טקסטורות אחרי חימום: {inspector['textureRangeAfterWarmup']} |
| ריצות השהייה | {long_soak['actualSeconds']+soak['actualSeconds']:,.1f} שניות בשתי ריצות: 2:20 שעות ועוד לפחות 10 דקות לגרסה הסופית; {long_soak['steps']+soak['steps']:,} החלפות/אפקטים; אפס שגיאות ובקשות חיצוניות |
| יציבות במחצית האחרונה של הגרסה הסופית | טווח גאומטריות {stability['geometryRange']}, טווח טקסטורות {stability['textureRange']} |
| בדיקות המאגר | {repository['passed']:,} עברו, {repository['skipped']} דולגו, אפס כישלונות; שום קובץ בדיקה לא נערך |

כל שינוי HTML בריצה הארוכה פתח מקטע עם SHA משלו. אחרי תיקון שכבת האש נפתחה ריצה נוספת בדפדפן חדש מול הקובץ הסופי הקבוע; מדד היציבות הסופי מחושב מהמחצית האחרונה שלה, אחרי חימום הנכסים. [הריצה הארוכה והיסטוריית הגרסאות](verification/soak/result.json), [בדיקת עשר הדקות הסופית](verification/soak-final/result.json). גרסת המסירה: `{offline_sha}`.

הדפדפן המנוהל חוסם `file://` בהודעת `ERR_BLOCKED_BY_ADMINISTRATOR`. בדיקת העצמאות קראה את הקובץ המקומי והציבה אותו בדף ריק, עם מצב offline ו־CSP המקורי. פתיחה ישירה מקובץ בטלפון לא אומתה. [שרת מקומי אופציונלי](README.md) מאפשר ביקורת גם בדפדפן שחוסם פתיחת קבצים.

## היקף המאגר והמסירה

כל התוצרים הם תוספות בתוך `workout/island/design/defense-v7/`. שינויי Git נבדקים מול commit הבסיס; קוד המשחק, release, תגי גרסה, CLAUDE ובדיקות נשארים מחוץ לשינוי. השילוב במשחק הוא שלב נפרד לפי החוזה המצורף. צוות השמירה וכל העיצובים בדיוניים; מקורות החבילה ורישיונות הספריות מתועדים.

{delivery_text}
'''
(ROOT/'REPORT.md').write_text(report)
print(json.dumps({'report':'REPORT.md','hours':round(hours,2),'iterations':len(iterations),'scores':[r[2] for r in scores],'offlineSHA256':offline_sha}))
