/* Build the delivery report from recorded evidence; refuse failed acceptance results. */
const fs=require('node:fs'),path=require('node:path');
const brand=path.resolve(__dirname,'..'),root=path.resolve(brand,'../..');
const read=f=>JSON.parse(fs.readFileSync(path.join(brand,f),'utf8'));
const round=process.argv[2]||'09';if(!/^\d{2}$/.test(round))throw Error('Round required');
const dir='iterations/'+round+'/',capture=read(dir+'checks.json'),ui=read(dir+'interaction-checks.json'),stress=read(dir+'stress-checks.json'),mobile=read(dir+'mobile-checks.json'),measure=read(dir+'measurements.json'),phoneMeasure=read(dir+'mobile-measurements.json');
const delivery=read('DELIVERY.json');
const publication=delivery.pullRequest?`[PR #${delivery.pullRequest.number}](${delivery.pullRequest.url}) נפתח כטיוטה מול main; לא מוזג.`:'המסירה מיועדת ל־PR כטיוטה בלבד, ללא מיזוג.';
const scores=read('scores.json'),review=read('verification/visual-review.json'),tests=read('verification/repository-tests.json'),catalog=read('catalog.json'),manifest=JSON.parse(fs.readFileSync(path.join(root,'north/img/v4/manifest.json'))),thumbs=JSON.parse(fs.readFileSync(path.join(root,'north/img/v4/thumbnails.json')));
if(!capture.passed||!ui.passed||!stress.passed||!mobile.passed||!measure.summary.allAverageFpsAtLeast30||measure.summary.contrastFlags||!phoneMeasure.summary.allAverageFpsAtLeast30||phoneMeasure.summary.contrastFlags||tests.failed||tests.exitCode)throw Error('Acceptance evidence is not clean');
if(scores.items.some(s=>s.score<8)||review.reviews.some(r=>r.score<8)||manifest.productPhotoCount!==72||manifest.bannerCount!==6)throw Error('Incomplete scope or below acceptance score');
const MB=n=>(n/1000000).toFixed(3),nice=d=>new Date(d).toISOString().replace('T',' ').slice(0,19)+' UTC';
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n');
const inventory=require('./weights.cjs')(),files=inventory.files;
const kinds=[['72 צילומי מוצר',manifest.assets.filter(a=>a.kind==='product').map(a=>({bytes:a.bytes}))],['6 באנרים',manifest.assets.filter(a=>a.kind==='banner').map(a=>({bytes:a.bytes}))],['72 תמונות רשימה',thumbs.assets],['4 הדמיות מותג',files.filter(f=>/\/assets\/[\w-]+-mockup\.webp$/.test(f.file))],['גופנים מקומיים',files.filter(f=>f.file.endsWith('.woff2'))],['10 אייקוני SVG',files.filter(f=>f.file.includes('/icons/'))]];
const rows=kinds.map(([name,a])=>[name,a.length,MB(a.reduce((s,f)=>s+f.bytes,0)),MB(Math.max(...a.map(f=>f.bytes))),0,0]);
const top=manifest.assets.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,8);
const rounds=inventory.completedRounds.map(nn=>{const c=read('iterations/'+nn+'/checks.json');return[nn,c.screenshots.length,'390×844 + 844×390',c.passed?'עבר':'נכשל',`[ביקורת ${nn}](iterations/${nn}/CRITIQUE.md)`];});
const ranges=d=>`${Math.min(...d.performance.map(p=>p.estimatedAverageFps))}–${Math.max(...d.performance.map(p=>p.estimatedAverageFps))}`;
const started='2026-11-04T20:12:00Z',now=new Date().toISOString(),minutes=Math.floor((Date.now()-Date.parse(started))/60000);
const body=`# הרוח הצפונית — דוח צילום v4 ומותג v1

נמסרו 72 צילומי מוצר חדשים עבור 12 המארזים, שישה באנרים, קיט מותג מקורי ושלושה דפי עיצוב RTL מקומיים. כל הקבצים חדשים ורק בתוך \`north/img/v4/\` ו־\`north/brand-v1/\`. קוד החנות הפעילה לא הוחלף.

**פתיחה:** [דף התצוגה האינטראקטיבי](index.html), [בית](home.html), [מוצר](product.html#single-malt), [בונה](builder.html). שומרים על מבנה שתי התיקיות ופותחים את \`index.html\` בדפדפן; אין build, התקנה או רשת.

תחילת עבודה: ${nice(started)}. עדכון דוח זה: ${nice(now)}; חלון עבודה מצטבר: ${Math.floor(minutes/60)} שעות ו־${minutes%60} דקות. זמני הרינדור המקוריים נשמרים בכל \`checks.json\`.

ענף: \`codex/north-brand-v4-20261105\`, בסיס \`5d1fca7d\` מול \`main\`. ${publication} פרטי PR מתועדים ב־[DELIVERY.json](DELIVERY.json) וב־[SESSION.md](SESSION.md).

## מה השתנה ולמה

- **בית:** צילום כהה וחם, כותרת ותוכן קריאים בטלפון, אירועים, חיפוש וקטגוריות ל־12 המארזים. צילום רחב ייעודי לרוחב משאיר בקבוק, אריזה וכוסות בתוך הפריים.
- **מוצר:** שש זוויות עם תפקיד ברור, פרטי תכולה, בחירת גרסה ומחיר הצעה מתעדכן. התכולה והצילומים מסומנים כמארז הבסיס, והרכב הגרסה דורש אישור בלי להמציא לו רשימת תכולה. פס בחירה בנייד; לרוחב הכותרת לצד תמונה שלמה. הגדלה לגודל טבעי תומכת בגלילה, מגע ומקלדת.
- **בונה:** שלושה שלבים, עד חמש תוספות, אריזה וברכה עד 180 תווים. חזרה שומרת בחירות. לרוחב המחיר נשאר גלוי ושני אזורי הסיכום נגללים ונגישים לפוקוס.
- **מותג:** כוכב צפוני בן שמונה קרניים, זהב \`#c8a45a\`, שחור חם ושנהב. אותו נתיב קנוני משמש בגרסת צבע אחד ובשלושה פריטי דפוס. נייר העטיפה משתמש במוטיב משני עדין בן ארבע קרניים.

## כיסוי ומקור האמת

המקור הוא \`north/js/products.js\`, SHA-256 \`${catalog.source.sha256}\`. snapshot עובדתי נמצא ב־[catalog.json](catalog.json); לא הועתקו הבטחות משלוח, זמינות או תיאורי שירות. מחירים מסומנים כהצעה, וכשרות מוצגת רק כהערת הקטלוג הקיים.

${table(['מזהה','זוויות','צילום ראשי'],manifest.coverage.map(p=>[p.id,p.roles.length+'/6',`[WebP](../img/v4/${p.id}-product.webp)`]))}

לכל מארז: ראשית, אווירה, מבפנים, אריזה, שימוש וגודל. 72 תמונות המוצר הן \`800×1000\`, הבאנרים \`1024×384\`, תמונות הרשימה \`320×400\`. [manifest.json](../img/v4/manifest.json), [mapping.csv](../img/v4/mapping.csv) ו־[thumbnails.json](../img/v4/thumbnails.json) כוללים מידות, משקלים וחתימות. תמונות שונות אינן חולקות SHA; תמונות הרשימה הן נגזרות ואינן נספרות כצילום נוסף.

הדימויים נוצרו באמצעות OpenAI image_gen ונבדקו ידנית בגודל טבעי: [82 רשומות ביקורת](verification/visual-review.csv), מינימום ציון נכס ${review.minimumScore}/10. PNG גולמיים נשארים מחוץ לריפו; המיפוי והחתימות שלהם נשמרים. 16 תמונות עזר בבונה הן נגזרות מוקטנות של נכסי v3 המקומיים, ואינן חלק מ־72 הצילומים החדשים.

רפרנס הסגנון הוא \`north/img/v2/spa-product.webp\` ו־\`single-malt-product.webp\`: אור רך משמאל, אבן כהה, עץ ענברי וזהב מאופק. [השוואה לרפרנס](iterations/01/reference-comparison.webp), [לוח 1](verification/contact-1.webp), [לוח 2](verification/contact-2.webp), [לוח 3](verification/contact-3.webp).

## סבבי בנייה, רינדור וביקורת

${table(['סבב','צילומי רינדור עיקריים','מידות CSS','רינדור','החלטות'],rounds)}

הצילומים בכל סבב כוללים מבט רחוק ותקריב בשתי המידות; מהסבב הרביעי תקריבי התמונות משתמשים בגודל טבעי ובפאנינג. בסבבים המאוחרים נוספו צילומי גלריה, באנרים ואריזה. צילומי המגע והעומס נשמרים בנוסף ואינם כלולים בעמודת הרינדור העיקרי. לכל סבב ביקורת וקובץ בדיקה עם זמני אמת וחתימות מקור; ראיות קודמות לא נדרסו.

תיקונים מהותיים בעקבות הסקירה: גובה תמונות responsive, חיתוך בקבוקים לרוחב, כיתוב מעל אור בהיר, שמות נגישים, חלונות הגדלה לרוחב, ברכה ארוכה ללא רווחים, איפוס חיפוש ריק, סדר מספרים ב־RTL, ידיות מארז היין, צורת כוסות הג׳ין, מחיר גלוי ושורת תמונות שנגללת במקום להיחתך. תמונות שנפסלו נשמרות בתיקיות הביקורת ואינן חלק ממיפוי הנכסים לשימוש.

## בדיקות ומגבלות האימות

- **${ui.summary.passed}/${ui.summary.checks}** בדיקות אינטראקציה/תכולה/תקציב בסבב ${round}; **${ui.summary.axeAudits}** מבדקי axe ללא הפרות שנמצאו. נבדקו 390×844, 844×390, 320×568 ו־1280×900.
- **${mobile.checks.filter(c=>c.pass).length}/${mobile.checks.length}** בדיקות mobile עם מגע ו־DPR 2; שני מבדקי axe נוספים נקיים במצב שבע בחירות. פאנינג תמונה דרך אירועי מגע, בחירת כל הזוויות וגובה חלון מקלדת מצומצם נבדקו.
- **${stress.checks.length}/${stress.checks.length}** מצבי קצה: 180 אותיות ללא רווחים בשני הכיוונים, תפריט לאחר שינוי רוחב, סינון ריק, שחזור פוקוס וארבע הדמיות מלאות.
- **הריפו:** \`npm test\` — ${tests.passed.toLocaleString('en-US')} עברו, ${tests.failed} נכשלו, ${tests.skipped} דולגו מתוך ${tests.tests.toLocaleString('en-US')}. [סיכום סביבת ההרצה](verification/repository-tests.json). לא נערכו בדיקות קיימות. ההרצה הסופית משתמשת בדפדפן המותקן דרך קונפיגורציה זמנית ב־\`/tmp\`, אחרי תיקון בעיית סביבת ההרצה הראשונית.
- **GitHub:** בדיקות \`test\` ו־\`alpine-csp\` על קומיט הממשק עברו גם בדחיפה וגם ב־PR; [ראיות CI](verification/github-runtime-checks.json). עדכון המסירה שלאחר מכן כולל תיעוד ומלאי קבצים.
- **ביצועים:** שמונה תרחישי גלילה של שלוש שניות עם CPU מואט פי 4: ${ranges(measure)}fps בממוצע ב־DPR 1, ו־${ranges(phoneMeasure)}fps ב־mobile/DPR 2. כל 16 התרחישים מעל יעד 30fps. אלה מדידות Chromium במחשב, **לא בדיקה בטלפון פיזי** ולא הבטחה לכל מכשיר.
- **ניגודיות:** ${measure.summary.contrastTextRuns} מקטעי טקסט ב־DPR 1 ועוד ${phoneMeasure.summary.contrastTextRuns} במצב mobile, אפס התראות בכל ${measure.summary.contrastViews+phoneMeasure.summary.contrastViews} מצבי המדידה. גבולות פקדים 3.602:1 ומעלה על ארבעת משטחי הממשק. מדידת פיקסלים שמרנית, עם הסתרת טקסט וחסימת אזורים מכוסים; אינה תחליף לביקורת נגישות אנושית מלאה.
- **ללא רשת:** הבדיקות פעלו ב־offline, כל קובץ נענה מתוך שתי תיקיות המסירה ואפס בקשות חיצוניות נרשמו. מדיניות Chromium בסביבה חוסמת \`file://\`; האימות ממפה loopback לקבצים מקומיים ישירות, ללא שרת מאזין או שינוי מדיניות. המוצר עצמו משתמש בנתיבים יחסיים וסקריפטים רגילים ואין בו \`fetch\`, CDN או מודולים המחייבים שרת.

## טבלת משקלים

1MB = 1,000,000 בתים. [weights.csv](weights.csv) מפרט **כל קובץ** בשתי התיקיות, כולל מסמכים, ראיות וקובצי המלאי עצמם. [weights.js](weights.js) מזין את התצוגה. הטבלה מתעדכנת עד התכנסות גדלי קובצי המלאי.

${table(['קבוצה','קבצים','MB כולל','MB לקובץ הגדול בקבוצה','משולשים','טקסטורות תלת־ממד'],rows)}

${table(['קבצי צילום גדולים','בתים','MB'],top.map(a=>[a.file,a.bytes,MB(a.bytes)]))}

כל 78 הצילומים והבאנרים וכן ארבע הדמיות המותג עד 200,000 בתים וצלע ארוכה עד 1024. בנכסי צילום דו־ממדיים אין מודל, ולכן משולשים וקובצי GLB: **0**; טקסטורות שנמסרו לסצנת תלת־ממד: **0**. דרישות Draco, שלד 18 עצמות, LOD ו־instancing אינן חלות על התוצר הזה. התמונות אינן נטענות כטקסטורות של סצנת WebGL; אין כאן טענה על אופן ההאצה הפנימי של הדפדפן.

## ציונים עצמיים מול הרשימה

הציונים הם הערכת עבודה, לא אישור עצמאי. כל סעיף ישים לפחות 8; פרטים שנותרו לאימות חיצוני מצוינים גם כשציון הסעיף 8 ומעלה.

${table(['פריט','ציון מתוך 10','ראיה / מה עדיין חסר'],scores.items.map(s=>[s.criterion,s.score,s.evidence]))}

## תוכן, אריזה והפקה

כל הצילומים הם הדמיות, לא צילום מלאי שנבדק פיזית. ב־\`wine-cheese\` לא נוספה גבינה שאינה ברשימת התכולה. כרטיסים חלקים, בקבוקים ללא מותג וספר ללא מתכונים מומצאים. אביזרי הגשה/קרח/בד בצילומי שימוש ואווירה אינם תוספות מובטחות; באנרים הם סצנות אירוע ולא הרכבי מארז חדשים. אין אנשים, נתוני לקוחות, טלפונים או מפתחות בתוצרים.

צילומי הגודל מציגים **יחס בלבד** לנפחי הבקבוקים מהקטלוג. מדבקה 50 מ״מ, כרטיס 90×55 מ״מ, חזית שקית 240×300 מ״מ ונייר 500×700 מ״מ הם הצעות גרפיות. לא נמדדו קופסאות ולא הוכן dieline, bleed, הפרדת צבע או אישור הטבעה מספק. ה־SVG הוא מקור הגאומטריה; ההדמיות מציגות חומר וגימור מוצעים. [הוראות קיט](README.md), [הוראות צילום](../img/v4/README.md), רישיונות הגופנים תחת \`assets/fonts/\`.

## מסירה ושחזור

רק קבצים חדשים בשתי התיקיות. לא שונו קוד קיים, קובצי release, תגי גרסה, CLAUDE.md או בדיקות. אין חיבור הזמנות, חיוב, אנליטיקה או שינוי בחנות החיה. כל ההפעלה מקומית; הסיכום נשמר בזיכרון הדף עד רענון.

ראיות: \`${dir}checks.json\`, \`interaction-checks.json\`, \`stress-checks.json\`, \`mobile-checks.json\`, \`measurements.json\`, \`mobile-measurements.json\`. כלים אופציונליים לשחזור מפורטים ב־[README](README.md). חתימות המסירה ב־[SHA256SUMS](verification/SHA256SUMS), למעט קובץ החתימות עצמו.
`;
fs.writeFileSync(path.join(brand,'REPORT.md'),body);require('./weights.cjs')();console.log(JSON.stringify({report:'north/brand-v1/REPORT.md',round,minutes,scoreMinimum:Math.min(...scores.items.map(s=>s.score)),bytes:Buffer.byteLength(body)}));
