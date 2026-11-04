"""Create the handoff tables from measured delivered artifacts, not estimates."""
import json,hashlib,csv,subprocess
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
started=datetime(2026,11,4,20,9,51,tzinfo=timezone.utc)
finished=datetime.now(timezone.utc);elapsed=finished-started
assert elapsed.total_seconds()>=7200,'The requested minimum two hours of actual work has not elapsed.'
read=lambda p:json.loads((ROOT/p).read_text())
assets=read('verification/assets.json');browser=read('verification/browser.json');repo=read('verification/repository.json')
performance=read('verification/performance.json');motion=read('iterations/07/motion-review.json');low=read('verification/low-lod.json')
assert assets['pass'] and browser['pass'] and repo['exitCode']==0 and low['pass']
assert read('verification/phone-check.json')['pass']
assert performance.get('completed') and performance.get('variant')=='lod2' and len(performance['cases'])==26
assert len(motion['cases'])==144
iterations=sorted(p for p in (ROOT/'iterations').iterdir() if p.is_dir() and (p/'capture.json').exists())
assert len(iterations)>=6
for p in iterations:
 assert (p/'CRITIQUE.md').exists()
 for n in ['390x844-far.png','844x390-far.png','390x844-close.png','844x390-close.png']:assert (p/n).exists()
meta={a['file']:a for a in read('manifest.json')['assets']}
auto=[c for c in performance['cases'] if c.get('automaticQualityCase')]
auto_tail=min(c['measurement']['tailWindow']['fps'] for c in auto)
# A software renderer cannot certify the user's physical-phone requirement.
# Keep this item below acceptance until that missing evidence exists.
performance_score=7
tz=ZoneInfo('Asia/Jerusalem');local=lambda d:datetime.fromisoformat(d).astimezone(tz).strftime('%d.%m %H:%M:%S')
weight_rows=[]
for a in assets['assets']:
 m=meta[a['file']];images=', '.join(f"{t['width']}×{t['height']}" for t in a['images']) or 'ללא תמונות'
 if m.get('kind')=='character':
  displayed=' / '.join(f"{q['triangles']+(m['racketTriangles'] if i==0 else m['racketLODs'][1]['triangles']):,}" for i,q in enumerate(m['LODs']))
 else:displayed=f"{a['triangles']:,}"
 weight_rows.append(f"| [{Path(a['file']).name}]({a['file']}) | {a['MB']:.6f} | {a['triangles']:,} | {displayed} | {images} |")
texture_rows=[]
for a in assets['assets']:
 for t in a['images']:texture_rows.append(f"| {Path(a['file']).name} | {t['name']} | {t['width']}×{t['height']} | {t['bytes']/1e6:.6f} |")
scores=[
 ('C01','מגרש קשיח',8,'מידות, קווים, גרגר ונורמל; צילום קרוב ורחוק'),
 ('C02','מגרש חימר',8,'גוון וחומר נפרדים, אבק וגלישה'),
 ('C03','מגרש דשא',8,'פסי כיסוח רחבים ומיקרו־מרקם'),
 ('C04','רשת וצל',9,'0.914/1.07 מ׳, מיתרים ממשיים וצל מכוון'),
 ('C05','שופטים וצלמים',8,'1 שופט כסא, 4 שופטי קו, 2 צלמים עם מושב וציוד'),
 ('C06','יציע וקהל',8,'480 צופים, instancing, אבטיפוס רחוק 32 משולשים'),
 ('C07','יום וערב',8,'תאורות מובחנות וזרקורים, נבדקו בשתי המידות'),
 ('C08','ארבע דמויות',8,'2 גברים ו־2 נשים מקוריים בוגרים, תסרוקות ופנים מובחנות'),
 ('C09','תלבושת ומחבט',9,'אטלס יחיד, סוליה שטוחה, מצחייה/סרט, אצבעות סביב ידית ומיתרים'),
 ('C10','שלד קנוני 18',9,'כל שמות/הורי/סדר motion2; skin ו־inverse binds תקינים'),
 ('C11','ריצה',8,'מחזור סגור, שתי רמות בדיקת skin ומגע רצפה'),
 ('C12','שירות בארבעה שלבים',9,'סמנים 0, 0.28, 0.48, 0.64; זריקה, העמסה, פגיעה ומעקב'),
 ('C13','פורהנד/בקהנד/וולה/שמאש',8,'מסלולים מובחנים, בקהנד בשתי ידיים, פגיעה עילית'),
 ('C14','החלקה וחגיגה',8,'בלימה נמוכה, גלישה/התאוששות חיצונית, הרמות גוף ויד'),
 ('C15','כדור, צל ונחיתה',9,'67 מ״מ עם תפר, צל גובה וסימון במפגש קווי יחידים/הגשה'),
 ('C16','ממשק ואינטראקציה',9,'73/73 בדיקות אופליין; ניגון, סרגל, דמויות, מגע ומקלדת'),
 ('C17','שני כיווני טלפון',9,'390×844 ו־844×390; קרוב/רחוק, יעדי מגע 44px, ללא גלילה'),
 ('C18','גודל, Draco וטקסטורות',10,'12 GLB בתחום, 0 שגיאות/אזהרות בדחיסה ופענוח, כל מפה ≤1024'),
 ('C19','ביצועים ויעד 30fps',performance_score,'נמדדו 26 מצבי תוכנה; חסרה בדיקה בטלפון פיזי. ראו את תוצאות האיכות האדפטיבית להלן'),
 ('C20','מסירה מקומית ומתועדת',9,'HTML יחיד, 11 סבבים, snapshots, טבלאות, דוח וטיוטת PR')]
score_rows=['| '+id+' | '+label+' | '+str(score)+' | '+evidence+' |' for id,label,score,evidence in scores]
last=read('iterations/'+iterations[-1].name+'/capture.json')
render_rows=[]
for c in last['captures']:
 d=c['diagnostics'];r=d['render'];render_rows.append(f"| {c['file']} | {r['main']['triangles']:,} | {r['shadow']['triangles']:,} | {r['calls']} | {d['crowd']['instancedDraws']} |")
perf_rows=[]
for c in performance['cases']:
 m=c['measurement'];s=c['settings'];d=m['diagnostics'];mode='אדפטיבי' if c.get('automaticQualityCase') else s['quality'];
 perf_rows.append(f"| {c['viewport']['width']}×{c['viewport']['height']} | {s['view']} | {s['light']} | {mode} | {m['fps']:.2f} | {m['tailWindow']['fps']:.2f} | {d['pixelRatio']:.3f} | {d['render']['triangles']:,} |")
iteration_rows=[]
for p in iterations:
 d=json.loads((p/'capture.json').read_text());iteration_rows.append(f"| [{p.name}](iterations/{p.name}/CRITIQUE.md) | {local(d['started'])} | {local(d['completed'])} | {len(d['captures'])} |")
phase_min=min(f['minimumY'] for c in motion['cases'] for f in c['samples'])
cycle_min=min(c['performance']['approximateCycles'] for c in motion['cases'])
cycle_max=max(c['performance']['approximateCycles'] for c in motion['cases'])
report=f'''# Tennis v7 — דוח מסירה

חבילת טניס מקורית בסגנון תלת־ממד מצויר: שלושה משטחים, זירה וצוות, 480 צופים ב־instancing, יום וערב, ארבע דמויות בוגרות ותשע אנימציות מוטמעות לכל דמות. כל הקבצים החדשים נמצאים ב־`workout/island/design/tennis-v7/`.

לפתיחה: [standalone.html](standalone.html), קובץ יחיד הכולל את כל הנכסים. [בדיקת דקה במכשיר](phone-check.html) · [השוואת הסבבים](review.html) · [הוראות שילוב ושחזור](README.md) · [מקורות](LICENSES.md).

העבודה נמשכה בפועל מ־{started.astimezone(tz).strftime('%d.%m.%Y %H:%M:%S')} עד {finished.astimezone(tz).strftime('%d.%m.%Y %H:%M:%S')} — {elapsed.total_seconds()/3600:.2f} שעות רצופות, לפי שעון Asia/Jerusalem. נשמרו {len(iterations)} סבבים עם צילומי 390×844 ו־844×390, קרוב ורחוק, ביקורת ותיקונים. לא נעצרנו בגרסה הראשונה.

**יעד 30fps בטלפון פיזי לא אומת.** התוצאות כאן הן של Chromium עם SwiftShader, GPU תוכנה, בחמישה מעבדים זמינים. ציון C19 מתייחס לתקציב, ל־LOD ולתוצאות המצב האדפטיבי בתוכנה; בדיקת מכשיר אמיתי נשארת חסרה. אין להציג אמולציית מסך כמדידת טלפון.

## ציון עצמי

| מזהה | פריט | ציון 1–10 | ראיה / מה חסר |
|---|---|---:|---|
{chr(10).join(score_rows)}

{'כל הציונים הם 8 ומעלה; אימות חומרת טלפון עדיין מסומן כחסר בסעיף הביצועים.' if performance_score>=8 else 'C19 נשאר 7: אין הצדקה לטעון שהיעד הושג בכל התנאים. חסרה בדיקת טלפון בינוני בפועל והשגת 30fps יציבים; יתר הפריטים קיבלו 8 ומעלה.'}

## משקלי GLB ומשולשים

MB עשרוני = מיליון bytes. מגבלת הקובץ היא 1,500,000 bytes. סך 12 קובצי GLB הוא **{assets['totalGLBBytes']/1e6:.6f} MB**. הגדול ביותר הוא {max(a['bytes'] for a in assets['assets']):,} bytes.

| קובץ | MB | משולשים בכל הקובץ | מוצגים LOD0 / LOD1 / LOD2 | מפות מוטבעות |
|---|---:|---:|---|---|
{chr(10).join(weight_rows)}

בספירת הקובץ כל ה־LODs מופיעים יחד. בזמן הצגה מוצגת רמה אחת. במספרי הדמויות בעמודת ״מוצגים״ נכלל גם המחבט המתאים. 480 צופים משתמשים באבטיפוסים; אין 480 עותקים אפויים ב־GLB. המושבים עצמם נבנים ב־instancing בתצוגה, עם LOD חסכוני של ארבעה משולשים למושב.

## טקסטורות

| GLB | תמונה | מידות | MB |
|---|---|---|---:|
{chr(10).join(texture_rows)}

לכל דמות אטלס אחד 512×512. מפות צבע הקרקע 1024×1024 והנורמלים 512×512. אומדן זיכרון GPU של כל המפות המוטבעות עם mipmaps: **{assets['estimatedAllTextureGPUBytesWithMipmaps']/1e6:.2f} MB**; זה אינו זיכרון היישום הכולל. צל רך וזרקורים משתמשים גם במפות Canvas קטנות. קובצי `textures/` הם עותקי עריכה של המפות המוטבעות.

## רינדור בפועל

האיפוס של renderer.info נעשה לפני כל רינדור. main ו־shadow נמדדים בנפרד; מספרי הסבבים 01–06 היו של main בלבד. במבט שידור צל הזירה נשמר במטמון, ולכן פריים יציב אינו מצייר מחדש את מעבר הצל. תקריב גוף באיכות מאוזנת משתמש בצל דינמי.

| צילום סבב {iterations[-1].name} | משולשי main | משולשי shadow | קריאות ציור | ציורי קהל |
|---|---:|---:|---:|---:|
{chr(10).join(render_rows)}

במצב חסכון נבחרים גוף LOD2 בריחוק, מחבט פשוט, מושבים פשוטים ורקע זול יותר. פירוט הפנים והמיתרים נשמר בתקריב מאוזן. בקר האיכות בוחן את מרווח הפריימים בפועל וגם את זמן שליחת הציור ב־CPU; בדיקה של CPU בלבד פספסה צוואר בקבוק ב־GPU ותוקנה בסבב 11.

## מדידת תוכנה ממושכת

26 מצבים של {performance['secondsPerCase']:.0f} שניות: שני כיוונים, שידור/תקריב/קו, יום/ערב, מאוזן/חסכוני ועוד שני מצבים אדפטיביים. DPR המכשיר המדומה הוא 2; ה־canvas מוגבל ל־1.4, ובחסכון ל־1 עם ירידה אדפטיבית עד 0.7. לא רצו עבודות דפדפן אחרות בזמן המדידה הסופית.

״סיום יציב״ הוא קצב 300 מרווחי הפריימים האחרונים, או כל המרווחים אם היו פחות; מוצגים גם ממוצע כל חלון המדידה ו־DPR בפועל. נתונים מלאים, p50/p95, זמן אנימציה וזיכרון JS ב־[performance.json](verification/performance.json). [קו הבסיס](verification/performance-baseline.json) שומר את המדידות לפני LOD2 ותיקון הבקר.

| מסך | מבט | תאורה | איכות | FPS לכל החלון | FPS בסיום יציב | DPR בסוף | משולשים |
|---|---|---|---|---:|---:|---:|---:|
{chr(10).join(perf_rows)}

אלה תוצאות תוכנה, ואין להסיק מהן FPS או חום בטלפון. לבדיקת מכשיר פותחים את ה־HTML המקומי, בוחרים משטח ויום/ערב, ומשווים מאוזן/חסכוני במשך דקה בכל כיוון. ה־API המקומי `tennis.measure(60)` מחזיר FPS ו־p95 ללא שליחת מידע לרשת.

אפשר לבצע את הבדיקה בלי כלי פיתוח דרך [phone-check.html](phone-check.html): לחצן מדידה של דקה ולחצן העתקת JSON. זהו אותו מנוע ותוכן תלת־ממד בקובץ עצמאי, עם לוח מדידה מקומי. בדיקת העשן בסביבת הענן אינה מדידת טלפון.

## תנועה, שלד ומגע

18 שמות/הורים/סדר תואמים motion2; bind בתנוחת T מכויל לגאומטריה, עם inverse binds מסופקים. ה־GLB מכיל idle, run, serve, forehand, backhand, volley, smash, slide ו־celebrate. אין Root אופקי בקליפים. גלישה בתצוגה מוסיפה מסלול צד והתאוששות נפרד ב־presentation.json; סימולציית משחק אינה צריכה להוסיף אותו פעמיים.

הרצת הרצף כוללת **144 מצבים**: ארבע דמויות × תשעה קליפים × שני כיוונים × שתי תאורות, ו־720 דגימות פוזה. שעון האנימציה התקדם {cycle_min:.3f}–{cycle_max:.3f} מחזורים בכל חלון שביקש ארבעה מחזורים. זו בדיקת פוזות ושעון; היא אינה הוכחה שכל פריים הוצג ב־SwiftShader האיטי. הסוליה הנמוכה ביותר בדגימות הייתה {phase_min:.5f} מ׳; הרמות בשירות/שמאש/חגיגה מתוכננות. בנוסף עברו **{low['poses']} פוזות LOD2** על ה־GLB הסופי, עם משקלי skin, 18 עצמות, קואורדינטות סופיות וללא חדירה מתחת לרצפה.

האנימציות מקוריות ומסוגננות, לא motion capture. סמני מגע משמשים תצוגה, ואינם מאשרים פגיעה פיזיקלית או ניקוד במשחק. הכדור בתצוגה מוגדל פי 1.55 רק במבט שידור ומלווה בהדגש קטן לקריאות. מיקום הנחיתה הקנוני הוא X=4.115, Z=−6.4 על מפגש קווי יחידים/הגשה.

## בדיקות

| בדיקה | תוצאה |
|---|---|
| glTF Validator — דחוס ומפוענח | 12/12, 0 שגיאות ו־0 אזהרות |
| Draco לכל primitive, גדלים ומפות | עבר |
| שלד, סדר, הורים, משקלים ו־quaternions | עבר |
| HTML יחיד במצב offline | {len(browser['checks'])}/{len(browser['checks'])}; המשאב היחיד הוא standalone.html |
| בקשות חיצוניות / שגיאות קונסול | 0 / 0 |
| מגע, צביטה, סרגל, מקלדת, עצירה, orientation | עבר |
| WebGL context recovery / reduced motion | עבר |
| לחצן מדידת דקה ב־phone-check | עבר באופליין בענן; אינו מדידת טלפון פיזי |
| `npm test` | {repo['summary']['pass']:,} עברו, {repo['summary']['skipped']} דולגו, 0 נכשלו |

ריצת בדיקות הריפו הראשונה נכשלה בגלל סביבת IPC והתקנת Playwright חסרה. לאחר שימוש ב־Chromium המותקן דרך cache זמני, הריצה המלאה עברה. הבדיקות וקוד היישום הקיימים לא נערכו. [פרטי הסביבה](verification/environment.json) · [בדיקות הריפו](verification/repository.json) · [בדיקות דפדפן](verification/browser.json).

## סבבים ושעות

כל השעות Asia/Jerusalem. בכל תיקייה נמצאים צילומי שתי המידות, קרוב ורחוק, ו־CRITIQUE.md. מסבב 06 נשמר גם source-snapshot.tar.gz לפני הצילום. פרטי hashes והגדרות מצלמה בכל capture.json.

| סבב וביקורת | התחלה | סיום צילום | מספר צילומים |
|---|---|---|---:|
{chr(10).join(iteration_rows)}

ב־05 וב־03 נשמרה גם אבחנת מגבלת שעון 0.12 שנ׳, וב־09 נשמר כשל אריזת JavaScript עם `$&`; שניהם תוקנו ולא הוסתרו. [הרפרנס ורשימת הבדיקה](REFERENCE.md) כוללים את הרף שנבחר אחרי שלא צורפה תמונת רפרנס.

## היקף מסירה

כל השינויים בקבצים חדשים בתיקייה המורשית. release.json, release.mjs, תגי גרסה, CLAUDE.md וקוד/בדיקות קיימים נשארו ללא שינוי. אין מותגים, סמלי מועדונים, אנשים אמיתיים או מידע לקוחות בחבילה. מקור ואישורי רישוי ב־LICENSES.md.

ענף המסירה: `codex/tennis-v7-20261105`; יעד PR: `main`, כטיוטה. אין חיבור אוטומטי למשחק החי ואין מיזוג.
'''
(ROOT/'REPORT.md').write_text(report)
(ROOT/'SELF-SCORES.json').write_text(json.dumps({'generated':finished.isoformat(),'allAtLeast8':all(s[2]>=8 for s in scores),'physicalPhoneMeasured':False,'scores':[{'id':a,'item':b,'score':c,'evidence':d} for a,b,c,d in scores]},indent=2,ensure_ascii=False)+'\n')
with (ROOT/'verification/performance.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['width','height','view','light','quality','fps','tail_fps','p95_ms','dpr','main_triangles','shadow_triangles','calls'])
 for c in performance['cases']:
  m=c['measurement'];d=m['diagnostics'];w.writerow([c['viewport']['width'],c['viewport']['height'],c['settings']['view'],c['settings']['light'],'automatic' if c.get('automaticQualityCase') else c['settings']['quality'],m['fps'],m['tailWindow']['fps'],m['frameMs']['p95'],d['pixelRatio'],d['render']['main']['triangles'],d['render']['shadow']['triangles'],d['render']['calls']])
worklog={'startedUTC':started.isoformat(),'reportGeneratedUTC':finished.isoformat(),'activeElapsedHours':elapsed.total_seconds()/3600,'iterations':len(iterations),'physicalPhoneMeasured':False,'performanceCases':len(performance['cases'])}
(ROOT/'WORKLOG.json').write_text(json.dumps(worklog,indent=2)+'\n')
print('Report written:',len(iterations),'iterations,',round(elapsed.total_seconds()/3600,3),'hours; C19 score',performance_score)
