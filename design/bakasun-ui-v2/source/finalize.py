"""Produce the final delivery report only after all acceptance gates actually pass."""
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
import json,hashlib,subprocess,csv,io
from file_sizes import write_inventory
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
REPO=ROOT.parent.parent
LATEST='11'
SCORES=[
('01','נאמנות לרפרנס',9,'נבדקו צילומי מקור מול היום, תיק וחשבוניות; צבע וריווח נשמרו.'),
('02','Tokens',9,'צבעים סמנטיים לשתי ערכות, טיפוגרפיה, ריווח, פינות, תנועה ומיקוד ב־CSS וב־JSON.'),
('03','טיפוגרפיה עברית',9,'שני גופנים מקומיים, RTL ומספרים מבודדים; הגופנים נטענו בכל הרינדורים.'),
('04','בהיר וכהה',9,'כל המסכים והלשוניות נבדקו; שימור צבע בניווט וחתימה בשינוי צבע עברו.'),
('05','רכיבים',9,'כל שבעת הרכיבים בספרייה ובמסכים, כולל קלט, מיקוד, בחירה ו־disabled.'),
('06','מצבי מערכת',9,'ריק, טעינה, שגיאה, הצלחה ושדות שגויים מוצגים ונבדקו.'),
('07','אייקונים',9,'68 סמלי SVG מקוריים, 24×24, ללא ספרייה חיצונית.'),
('08','איורי מצב ריק',9,'8 איורי SVG מקוריים, קלים ומוצגים בספרייה.'),
('09','היום',9,'סדר עדיפויות, משימות עם ביטול, אירוע קרוב וסיכום כסף.'),
('10','לוח אירועים',9,'סינון שלב/סוג/טקסט משולב, ספירות ומצב ריק נבדקו.'),
('11','כל לשוניות התיק',9,'13 לשוניות תוכן, בחירה בנייד, חיצי RTL וקישורים ישירים.'),
('12','לקוחות וספקים',8,'רשימות, פרטים וטפסים פעילים; רשומות שנוספו הן זמניות במסך הנוכחי.'),
('13','חשבוניות',9,'ארבעת המצבים, חיפוש ופרטי סכום/מועד נבדקו; אין הפקת מסמך מס.'),
('14','כספים והצעות',9,'תזרים עם חלופה טבלאית, CSV ופרטי הצעות; הכול בדוי.'),
('15','לו״ז יום האירוע',9,'רצף, בדיקות, תדריך להעתקה ופריסת הדפסה.'),
('16','יומן',8,'חודש, יום, יום פנוי וניווט חודש נבדקו; נתוני הדגמה בלבד.'),
('17','תקציב',9,'שורות העלות והמחיר מתיישבות עם הרזרבה והרווח; ייצוא עובד.'),
('18','חוזה וחתימה',9,'ציור בעכבר ובמגע, חלופה מוקלדת, הסכמה, ניקוי וביטול אישור בעריכה.'),
('19','הגדרות',8,'צבע, טקסט, תנועה ומסך פתיחה נשמרים מקומית; הגדרות מוצר אינן מחוברות.'),
('20','390×844 ו־844×390',9,'צילום קרוב/רחוק ותקריב, בדיקת גלישה ומטרות 44×44.'),
('21','מחשב ורוחבי ביניים',9,'320, 360, 768, 1024, 1440; פריסות וריווח עברו.'),
('22','נגישות AA',8,'axe, ניגודיות, מקלדת, reflow וריווח עברו. חסרה בדיקת קורא מסך אנושית; אין טענת הסמכה מלאה.'),
('23','ללא רשת וללא build',9,'כל התלויות מקומיות ו־connect-src none. file:// חסום בסביבת הבדיקה; אימות offline נעשה מקבצים בזיכרון.'),
('24','ביצועים ויעד 30fps',8,'בדיקת גלילה ותפעול ממושכת ב־CPU×4 ו־DPR2. חסרה מדידה בטלפון פיזי.'),
('25','תקציב נכסי תלת־ממד',10,'אינו חל במסכי UI דו־ממדיים: 0 GLB, 0 משולשים, 0 טקסטורות; אין תלות three.js מיותרת.'),
('26','נתונים והיקף ריפו',10,'רק קבצים חדשים בתיקייה המותרת; ללא נתונים אמיתיים, מפתחות, טלפונים או שינויי גרסה.'),
('27','לולאת עבודה',10,'11 סבבים עצמאיים, ביקורת ותיקון, צילומים ומצב קוד; זמן עבודה נמדד מעל שלוש שעות.'),
('28','מסירה',9,'תצוגה מקומית, דוח, משקלים וראיות; פרטי PR נרשמים לאחר יצירת טיוטה מול main.')]

def load(path):return json.loads((ROOT/path).read_text())
def mb(n):return f'{n/1_000_000:.6f}'
def main():
    browser=load(f'iterations/{LATEST}/browser.json');flow=load(f'iterations/{LATEST}/flows.json');extended=load(f'iterations/{LATEST}/extended.json');signature=load(f'iterations/{LATEST}/signature-review.json');preview=load('verification/preview.json');ax=load('verification/accessibility-tree.json');static=load('verification/static.json');contrast=load('verification/contrast.json');repo=load('verification/repository-final.json');perf=load('verification/endurance.json');memory=load('verification/memory-review.json');finalperf=load('verification/final-performance.json');budgetchart=load(f'iterations/{LATEST}/budget-chart.json')
    assert browser['summary']['layout_issues']==0 and browser['summary']['axe_violations']==0 and browser['summary']['tab_axe_violations']==0
    assert browser['summary']['console_errors']==0 and browser['summary']['external_requests']==0
    assert flow['summary']['failed']==0 and extended['summary']['failed']==0 and signature['summary']['failed']==0
    assert ax['summary']['failures']==0
    assert preview['summary']['axe_violations']==0 and preview['summary']['overflow']==0 and preview['summary']['errors']==0
    assert not static['problems'] and not contrast['failures'] and repo['exit_code']==0 and repo['fail']==0
    assert memory.get('finished_at') and memory['elapsed_seconds']>=1200 and memory['stability']['pass'] and not memory['errors'] and not memory['external_requests'] and not memory['runtime_changed']
    assert perf.get('finished_at') and perf['elapsed_seconds']>=5700 and not perf['runtime_changed'] and not perf['errors']
    assert perf['summary']['below_30fps']==0 and not perf['external_requests'] and not any(x['overflow'] for x in perf['samples'])
    assert finalperf.get('finished_at') and finalperf['elapsed_seconds']>=360 and not finalperf['errors'] and not finalperf['external_requests'] and not finalperf['runtime_changed'] and not finalperf['summary']['below_30fps'] and not any(x['overflow'] for x in finalperf['samples'])
    assert budgetchart['summary']['failures']==0
    expected_delta={'budget.html','event.html','preview.html'}
    compatibility=[]
    for label,evidence in [('95-minute scroll audit',perf),('20-minute modal audit',memory)]:
        delta=[name for name,digest in evidence['runtime_sha256'].items() if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
        assert set(delta)==expected_delta,(label,delta)
        compatibility.append({'audit':label,'changed_files':delta,'shared_JS_CSS_fonts_and_supplier_page_unchanged':True,'reason':'Only budget allocation markup and latest gallery selection changed in iteration 11.'})
    assert all(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest for name,digest in finalperf['runtime_sha256'].items())
    (ROOT/'verification/version-compatibility.json').write_text(json.dumps(compatibility,indent=2)+'\n')
    baseline=load(f'iterations/{LATEST}/source.sha256.json');drift=[name for name,digest in baseline.items() if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest];assert not drift,drift
    start=datetime.fromisoformat((ROOT/'verification/started-at.txt').read_text().strip().replace('Z','+00:00'));now=datetime.now(timezone.utc);duration=(now-start).total_seconds();assert duration>=10800,'The requested sustained work must cover at least three actual hours.'
    # All rendering payloads and documentation images, one row per file. Documentation text/JSON are not render assets.
    assets=[]
    for p in sorted(ROOT.rglob('*')):
        if not p.is_file() or '__pycache__' in str(p):continue
        if p.suffix not in ['.html','.css','.js','.svg','.ttf','.webp','.png','.gz']:continue
        kind='תיעוד צילום' if p.suffix in ['.webp','.png'] else 'ארכיון שחזור' if p.suffix=='.gz' else 'גופן' if p.suffix=='.ttf' else 'SVG וקטורי' if p.suffix=='.svg' else 'קובץ ממשק'
        dimensions=None
        if p.suffix in ['.webp','.png']:
            with Image.open(p) as image:dimensions=list(image.size)
        assets.append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'MB':round(p.stat().st_size/1e6,6),'triangles':0,'textures':0,'kind':kind,'documentation_image_dimensions':dimensions,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (ROOT/'verification/asset-inventory.json').write_text(json.dumps({'units':'decimal MB (1,000,000 bytes)','scope':'All runtime HTML/CSS/JS/font/SVG payloads, screenshots and runtime snapshot archives. Markdown, source authoring helpers and JSON audit metadata are not render assets.','assets':assets},ensure_ascii=False,indent=2)+'\n')
    budget=['# משקלי קבצים ונכסים','', 'MB עשרוני = 1,000,000 בתים. לכל קובץ ממשק, גופן, SVG, צילום תיעוד וארכיון שחזור יש שורה. Markdown, כלי המחבר ו־JSON של הבדיקה אינם נכסי רינדור. צילומי WebP/PNG הם תיעוד, ואינם טקסטורות של הממשק.','', '| קובץ | בתים | MB | משולשים | טקסטורות | סוג |','|---|---:|---:|---:|---:|---|']
    budget.extend(f'| [{a["file"]}]({a["file"]}) | {a["bytes"]:,} | {mb(a["bytes"])} | 0 | 0 | {a["kind"]} |' for a in assets)
    budget+=['','אין קובצי GLB, אין תמונות רסטר כחלק מהממשק ואין סצנות או דמויות. לכן Draco, LOD, instancing, אטלס דמות ושלד 18 עצמות אינם חלים. three.js r160 אינו נטען. כל איורי הממשק הם SVG; הגבלת טקסטורה 1024 אינה חלה על צילומי מסך לתיעוד.']
    (ROOT/'ASSET-BUDGET.md').write_text('\n'.join(budget)+'\n')
    csvfile=io.StringIO(newline='');writer=csv.writer(csvfile);writer.writerow(['file','bytes','MB','triangles','textures','kind'])
    for a in assets:writer.writerow([a['file'],a['bytes'],mb(a['bytes']),0,0,a['kind']])
    (ROOT/'ASSET-BUDGET.csv').write_text(csvfile.getvalue(),encoding='utf-8-sig')
    scores={'scale':'1 to 10; self assessment, not third-party certification','items':[{'id':i,'criterion':c,'score':s,'evidence_or_limit':e} for i,c,s,e in SCORES]};(ROOT/'verification/self-scores.json').write_text(json.dumps(scores,ensure_ascii=False,indent=2)+'\n')
    largest=sorted(assets,key=lambda a:a['bytes'],reverse=True)[:8];runtime=static['asset_budgets'];runtime_largest=sorted(runtime,key=lambda a:a['bytes'],reverse=True)[:6]
    rounds=[]
    for p in sorted((ROOT/'iterations').iterdir()):
        if (p/'browser.json').exists():
            r=load(str(p.relative_to(ROOT)/'browser.json'));rounds.append((p.name,r['summary'],len(list(p.glob('*.webp')))))
    tz=ZoneInfo('Asia/Jerusalem');hours=int(duration//3600);minutes=int(duration%3600//60);sample_count=len(perf['samples']);actions=sum(x.get('interaction_actions',0) for x in perf['samples']);minfps=perf['summary']['minimum_average_fps'];medfps=perf['summary']['median_average_fps'];maxheap=max(x['heap_used_bytes'] for x in perf['samples']);lastheap=perf['samples'][-1]['heap_used_bytes']
    report=f'''# דוח מסירה — מערכת עיצוב 02

נמסרה מערכת עיצוב RTL עצמאית: **14 מסכים (13 מסכי עבודה וספריית עיצוב)**, **13 לשוניות תיק אירוע**, **68 אייקונים**, **8 איורי מצב ריק**, ערכה בהירה וכהה, ו־[דף תצוגה אינטראקטיבי מקומי](preview.html). הרפרנס: `../bakasun-ui`. כל נתוני הדוגמה בדויים.

## פתיחה ובדיקה

1. פותחים את [preview.html](preview.html) בדפדפן רגיל שמאפשר קבצים מקומיים; אין התקנה, build, CDN או שרת נדרשים.
2. בוחרים מסך, גודל וצבע. דף התצוגה נפתח על תיעוד הסבב האחרון; אפשר להשוות לכל סבב קודם, קרוב ורחוק.
3. פותחים מסך בנפרד לבדיקת מגע/מקלדת בגודל מלא. [README](README.md) ממפה את כל המסכים והפעולות; [DESIGN](DESIGN.md) מסביר החלטות וחיבור עתידי.

## משך ולולאת העבודה

תחילת מדידה: **{start.astimezone(tz).strftime('%d.%m.%Y %H:%M:%S')}**. סיום הבדיקות: **{now.astimezone(tz).strftime('%d.%m.%Y %H:%M:%S')}**, אזור אסיה/ירושלים. משך עבודה נמדד: **{hours} שעות ו־{minutes} דקות**. אלה זמני קיר שנמדדו בפועל, לא אומדן שעות.

| סבב | רינדורי מסכים | מצבי לשוניות | חריגות פריסה | axe | קובצי WebP | ביקורת |
|---|---:|---:|---:|---:|---:|---|
'''
    for name,s,photos in rounds:report+=f'| {name} | {s["render_count"]} | {s.get("tab_checks",0)} | {s["layout_issues"]} | {s["axe_violations"]+s.get("tab_axe_violations",0)} הפרות | {photos} | [ביקורת ותיקונים](iterations/{name}/CRITIQUE.md) |\n'
    report+='''
בכל תיקייה נשמרו צילומים ממשיים, `browser.json`, חתימות SHA-256 ו־`runtime-snapshot.tar.gz` לשחזור מצב הממשק. `near`: חלון מקורי; `far`: כל הדף מוקטן ל־50%; `close`: הגדלה ל־150% באותן מידות חלון. צילומי `content` מסומנים בנפרד ומסתירים רק את הסרגל הצף וקישור הדילוג לצורכי סקירת תוכן.

התיקונים כללו ניווט לשוניות, שימור צבע בין מסכים, תוכן כספי ייעודי לאירוע, התאמת שורות התקציב, מיקוד בטפסים, חתימה הנצבעת מחדש, ביטול אישור בעריכה ומטרות מגע 44×44 גם בלשוניות לרוחב. לא הסתפקנו בגרסה הראשונה או בספירה טכנית של שש תיקיות.

## תוצאות הבדיקה הסופית

'''
    report+=f'''- **{browser['summary']['render_count']} פריסות** בסבב האחרון, ללא גלישה חיצונית, חיתוך פקדים או כשל גופן; עוד **52 מצבי לשוניות** צולמו ונבדקו.
- **108 בדיקות axe למסכים/לשוניות ועוד 6 לדף התצוגה**, תגיות WCAG A/AA, ללא הפרות אוטומטיות. נוסף לכך בוצעו 96 בדיקות של עץ הנגישות בפועל ואומתה שמירת כותרות הטבלה בנייד. אין בכך אישור נגישות מלא.
- **18/18 זרימות**, **8/8 בדיקות מורחבות**, **2/2 בדיקות מצב חתימה** עברו. בדיקת מקלדת ב־42 פריסות לא מצאה הסתרת מיקוד. ריווח טקסט וגדילת טקסט עברו ב־56 פריסות כל אחד.
- כל **38 זוגות ניגודיות** עברו: לפחות **4.631:1 לטקסט** ולפחות **3.029:1 לגבול שדה/מיקוד** בזוגות שהוגדרו.
- **616 בדיקות קובצי גלריה** אישרו שקישורי צילומי כל אחד־עשר הסבבים קיימים.
- בדיקות הריפו: **{repo['pass']:,} עברו, {repo['skipped']} דולגו, {repo['fail']} נכשלו** מתוך {repo['tests']:,}. ראיה: [repository-final.json](verification/repository-final.json).

הרצת הריפו הראשונית נעשתה בסנדבוקס שחסם סוקטים/תהליכים ולכן ארבעה קובצי בדיקה נכשלו. באבחון נמצא גם שנתיב Chromium המצופה ב־Playwright אינו מותקן. ההרצה הסופית השתמשה בדפדפן Chromium האמיתי המותקן, דרך hook קיים של `ISLAND_PLAYWRIGHT` ומתאם זמני ב־`/tmp`; שום בדיקה או קוד מוצר לא שונו. תוצאת ההרצה הראשונית נשמרה ולא הוצגה כהצלחה.

### יציבות וביצועים

בוצעה בדיקת עבודה רציפה של **{perf['elapsed_seconds']/60:.2f} דקות** על גרסת סבב 10, עם **CPU×4, DPR2**, שני כיווני הטלפון ושתי ערכות הצבע. נמדדו **{sample_count} מקטעי גלילה של 5 שניות** ו־**{actions:,} פעולות קלט/סינון/לשוניות/חלונות**. רינדור requestAnimationFrame הפעיל גלילה אמיתית לאורך הבדיקה; לא הייתה המתנה ריקה כדי לצבור זמן.

| מדד | תוצאה |
|---|---:|
| קצב ממוצע נמוך ביותר במקטע | {minfps:.2f}fps |
| חציון קצבי המקטעים | {medfps:.2f}fps |
| מקטעים מתחת ל־30fps | {perf['summary']['below_30fps']} |
| שגיאות / בקשות חיצוניות | 0 / 0 |
| שינוי קוד במהלך הבדיקה | לא |
| JS heap מרבי לאחר איסוף זבל | {mb(maxheap)} MB |
| JS heap במקטע האחרון | {mb(lastheap)} MB |

[כל הדגימות והחותמות](verification/endurance.json). ארבע הרצות מוקדמות נשמרו בנפרד: הראשונה נעצרה לתיקון בחירה של פקד מוסתר בכלי הבדיקה, ושלוש נוספות בעת תיקוני מטרות מגע, סמנטיקת טבלאות ואריזת הגופנים לפתיחה מקומית. הן אינן נספרות כהשלמת 95 דקות. אין לולאת רינדור קבועה בממשק עצמו. הבדיקה היא הדמיית דפדפן בענן, **לא מדידה בטלפון פיזי**.

לאחר תיקון חלוקת התקציב בסבב 11 נבדקה הגרסה הסופית שוב במשך **{finalperf['elapsed_seconds']/60:.2f} דקות**: **{len(finalperf['samples'])} מקטעים**, מינימום **{finalperf['summary']['minimum_average_fps']:.2f}fps**, חציון **{finalperf['summary']['median_average_fps']:.2f}fps**, וללא שגיאות או מקטע מתחת ל־30fps. [הדגימות הסופיות](verification/final-performance.json). בדיקה נפרדת אישרה את התאמת שלוש פרופורציות התקציב לנתונים ב־12 מצבים.

קובצי JavaScript, CSS, גופנים ודף הספקים זהים בבדיקות הארוכות ובמסירה. רק שלושה HTML השתנו: תיקון המחשת התקציב בדף התקציב ובתיק, ובחירת הסבב האחרון בדף התצוגה. [השוואת הגרסאות](verification/version-compatibility.json). בדיקת 95 הדקות אינה מוצגת כאילו נערכה אחרי שינוי ה־HTML האחרון.

נוספה בדיקת מחזור חיים של חלונות בגרסת סבב 10 למשך **{memory['elapsed_seconds']/60:.2f} דקות**: **{memory['cycles']:,} מחזורי פתיחה/סגירה אמיתיים**, עם אימות החזרת מיקוד בכל מחזור. טווח מספר רכיבי ה־DOM לאחר איסוף זבל: **{memory['stability']['DOM_element_range']}**, טווח מספר מאזיני האירועים: **{memory['stability']['listener_range']}**, הפרש JS heap בין נקודות המדידה הראשונה והאחרונה: **{memory['stability']['heap_delta_bytes']:,} בתים**. אלה תצפיות יציבות בבדיקה, לא הוכחה פורמלית להיעדר כל דליפה. [המדידות](verification/memory-review.json).

## משקלי קבצים

כל חבילת הממשק הסטטית, כולל 15 HTML, קובצי JS/CSS, SVG וגופנים: **{mb(static['runtime_total_bytes'])} MB** ללא דחיסה. תיעוד הסבבים אינו נטען בכניסה למסכי המוצר.

| קובץ ממשק גדול | בתים | MB | משולשים | טקסטורות |
|---|---:|---:|---:|---:|
'''
    report+=''.join(f'| [{a["file"]}]({a["file"]}) | {a["bytes"]:,} | {mb(a["bytes"])} | 0 | 0 |\n' for a in runtime_largest)
    report+='\nצילומי המסך הגדולים ביותר:\n\n| קובץ | בתים | MB |\n|---|---:|---:|\n'
    report+=''.join(f'| [{a["file"]}]({a["file"]}) | {a["bytes"]:,} | {mb(a["bytes"])} |\n' for a in largest)
    report+='''
[טבלת משקלים לכל קובץ נכס](ASSET-BUDGET.md) · [CSV נכסים](ASSET-BUDGET.csv) · [מלאי JSON עם SHA-256](verification/asset-inventory.json) · [גודל כל קובצי המסירה, כולל מקורות, דוחות ו־JSON](FILE-SIZES.csv).

תלת־ממד אינו חל במסכי הניהול המבוקשים: **0 GLB, 0 משולשים, 0 טקסטורות רסטר בממשק**. אין צורך לטעון three.js r160. Draco, LOD, instancing, אטלס דמות ושלד קנוני בן 18 עצמות נשארים דרישות לתוצר תלת־ממד עתידי, ואינם מוצגים כאן כאילו נוצרו או נבדקו. צילומי WebP/PNG בתיעוד אינם טקסטורות ולכן אינם מוגבלים לממד 1024.

## ציון עצמי לפי רשימת הבדיקה

אלה ציונים עצמיים, לא ביקורת עצמאית. מגבלות שנותרו מצוינות גם כשהציון מעל סף 8.

| # | פריט | ציון / 10 | ראיה או מגבלה |
|---|---|---:|---|
'''
    report+=''.join(f'| {i} | {c} | {s} | {e} |\n' for i,c,s,e in SCORES)
    report+='''
## גבולות ומסירה

לא בוצעה בדיקת קורא מסך אנושית או בדיקת טלפון פיזי. מדיניות Chromium המנוהל חוסמת file://; כל בדיקות הדפדפן רצו ב־offline כשקבצים מקומיים מוגשים בזיכרון באמצעות route.fulfill, ללא שרת וללא בקשות אינטרנט. פתיחת file:// בדפדפן רגיל לא נבדקה ישירות בסביבה הזו. הדפים עצמם אינם דורשים fetch או מודולי ES ולכן נמסרים לפתיחה מקומית ללא build.

כל השינויים הם קבצים חדשים תחת `design/bakasun-ui-v2/`. לא נערכו קוד קיים, בדיקות, CLAUDE.md, ops/CONTROL.md, קובצי release או תגי גרסה. רישום העבודה נמצא ב־[WORKLOG.md](WORKLOG.md), בהתאם להגבלת התיקייה המפורשת.

ענף: `codex/bakasun-ui-v2-20261105`. יעד: `main`. **PR טיוטה בלבד; אין מיזוג.** מספר וקישור יתווספו לאחר יצירת ה־PR ואימות היקף השינויים.
'''
    (ROOT/'REPORT.md').write_text(report)
    delivery={'finalized_at':now.isoformat(),'client_timezone':'Asia/Jerusalem','elapsed_work_seconds':round(duration,2),'iteration_count':len(rounds),'final_iteration':LATEST,'runtime_drift':drift,'screenshots':sum(x[2] for x in rounds),'runtime_bytes':static['runtime_total_bytes'],'largest_assets':largest,'scope':'new files only in design/bakasun-ui-v2/','branch':'codex/bakasun-ui-v2-20261105','base':'main','merge':False,'draft':True,'PR':None}
    (ROOT/'verification/delivery.json').write_text(json.dumps(delivery,ensure_ascii=False,indent=2)+'\n')
    write_inventory()
    print(json.dumps({k:v for k,v in delivery.items() if k!='largest_assets'},ensure_ascii=False))
if __name__=='__main__':main()
