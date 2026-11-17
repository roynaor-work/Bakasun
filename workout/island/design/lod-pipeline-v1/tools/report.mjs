#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const [manifest,lock,validation,browser,offline,repository]=await Promise.all(['manifest.json','source-lock.json','verification/gltf-validation.json','verification/browser.json','verification/offline.json','verification/repository-tests.json'].map(read));
const tap=await fs.readFile(path.join(root,'verification/pipeline-tests.tap'),'utf8');
const number=(name)=>Number(tap.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]||0);
const fmt=n=>n.toLocaleString('en-US'),percent=n=>(100*n).toFixed(2)+'%',cm=h=>`${(h.lowerMetres*100).toFixed(2)}–${(h.upperMetres*100).toFixed(2)}`;
const variants=manifest.assets.flatMap(a=>a.variants),defaultTotals=manifest.summary.defaultSceneTriangles;
const rest=variants.flatMap(v=>v.scenes),animated=variants.flatMap(v=>v.animatedSurfaces);
const groups=lock.sources.filter(s=>s.selectedModels).map(s=>{
  const group=s.branch.replace('codex/',''),assets=manifest.assets.filter(a=>a.group===group),source=assets.reduce((n,a)=>n+a.source.defaultSceneTriangles,0),lod1=assets.reduce((n,a)=>n+a.variants[0].defaultSceneTriangles,0),lod2=assets.reduce((n,a)=>n+a.variants[1].defaultSceneTriangles,0);
  return `| ${group} | ${assets.length} | ${fmt(source)} | ${fmt(lod1)} (${percent(lod1/source)}) | ${fmt(lod2)} (${percent(lod2/source)}) |`;
});
const exceptions=manifest.assets.flatMap(a=>a.variants.filter(v=>!v.withinThreePercentagePoints).map(v=>`${a.id} / LOD${v.level}: ${percent(v.defaultSceneRatio)}`));
const sourceRows=lock.sources.map(s=>`| [${s.branch}](https://github.com/roynaor-work/Bakasun/tree/${s.commit}) | \`${s.commit}\` | ${s.selectedModels} |`);
const assetRows=manifest.assets.map(a=>{
  const [v1,v2]=a.variants,h1=v1.scenes[a.source.defaultScene].hausdorff,h2=v2.scenes[a.source.defaultScene].hausdorff;
  return `| \`${a.id}\` | ${a.source.defaultSceneTriangles} | ${v1.defaultSceneTriangles} (${percent(v1.defaultSceneRatio)}) | ${v2.defaultSceneTriangles} (${percent(v2.defaultSceneRatio)}) | ${cm(h1)} | ${cm(h2)} | ${a.distancePolicy.enterMetres.slice(1).join(' / ')} |`;
});
const sourceBytes=manifest.summary.sourceBytes,lodBytes=manifest.summary.lodBytes;
const text=`# דוח מסירה — צינור רמות פירוט

תאריך: ${lock.created}. מאגר: roynaor-work/Bakasun. ענף: \`codex/lod-pipeline-v1\`.

נוצרו **${manifest.assets.length} דגמי מקור עם LOD1 ו־LOD2**, כלומר ${manifest.summary.glbs} קובצי GLB לתצוגה: ${manifest.assets.length} עותקי LOD0 נעולים בגיבוב ו־${variants.length} תוצרים. נוספו ${lock.authoredGuideGlbs} עותקי GLB של טופולוגיית קהל קיימת כקלטי בנייה; אלה אינם דגמים נוספים במשחק. ענף החייזרים כולל ספרייטים בלבד, ולכן אין בו דגם לעיבוד במסגרת ״דגמים בלבד״.

| מדד, בסצנה הראשית של כל דגם | מקור | LOD1 | LOD2 |
|---|---:|---:|---:|
| משולשים בסך הכול | ${fmt(defaultTotals[0])} | ${fmt(defaultTotals[1])} | ${fmt(defaultTotals[2])} |
| שיעור מהמקור | 100% | ${percent(defaultTotals[1]/defaultTotals[0])} | ${percent(defaultTotals[2]/defaultTotals[0])} |
| יעד | 100% | כ־40% | כ־12% |

${exceptions.length?`חריגים מעל שלוש נקודות אחוז מהיעד: ${exceptions.join('; ')}.`:'כל 234 הרמות החדשות נמצאות עד שלוש נקודות אחוז מהיעד של הדגם שלהן. כל המספרים המדויקים בטבלה בהמשך ובמניפסט.'}

| קבוצת מקור | דגמים | מקור | LOD1 | LOD2 |
|---|---:|---:|---:|---:|
${groups.join('\n')}

קובצי GLB לתצוגה שוקלים ${(sourceBytes/1e6).toFixed(2)} MB למקורות ו־${(lodBytes/1e6).toFixed(2)} MB לשתי הרמות החדשות יחד. האנימציות והטקסטורות נשמרות ולכן הפחתת משולשים אינה הפחתה באותו יחס בגודל ההורדה. [ארכיון האופליין](https://github.com/roynaor-work/Bakasun/raw/refs/heads/codex/lod-pipeline-v1/workout/island/design/lod-pipeline-v1/bakasun-lod-pipeline-v1.zip) כולל גם את קלטי הבנייה, הספריות, הכלים והתיעוד. הגיבוב והגודל הסופיים של הארכיון נמצאים לצד ההורדה ב־\`verification/delivery.json\`, שאינו נכלל בעצמו בארכיון.

## שימוש ושחזור

1. חלצו את הארכיון ופתחו את [preview.html](preview.html).
2. בפתיחה מקומית, בחרו את תיקיית החבילה באמצעות הכפתור בראש הדף. הדגמים נטענים מהתיקייה שנבחרה.
3. בחרו דגם ותנועה; אפשר לסובב את שלוש הרמות יחד, להציג משולשים ושלד, ולבחור מצב נזק ברכב. המסגור והזמן משותפים לשלוש הרמות. המרחק מסמן את הרמה המומלצת ואינו משנה את הזום של ההשוואה.

לחלופין, מתוך התיקייה, \`node tools/serve.mjs\` פותח שרת מקומי בכתובת [התצוגה המקומית](http://127.0.0.1:8765/preview.html). [README](README.md) כולל את פקודות השחזור. כלי ההפחתה, האימות והאריזה דורשים Node.js 20 ומעלה; אין התקנת חבילות או גישה לרשת.

## שמירת הצורה, השלד והתנועה

\`tools/lod.mjs\` קורא תמיד עותקי קלט הנעולים ב־SHA-256; הוא אינו משנה אותם ואינו מפשט את LOD1 כדי ליצור LOD2. כל הפלטים נשארים בתיקיית החבילה. אין WASM, Draco, meshopt או KTX2. התוצרים הם glTF 2.0 רגיל, עם טקסטורות מוטמעות. דחיסת ZIP משמשת לאריזת ההורדה בלבד.

ל־71 הדגמים שאינם קהל משמש פישוט קצוות לפי שגיאה ריבועית, ב־JavaScript. קודקודים שנשארו שומרים את כל נתוני המקור שלהם, כולל צבע, UV, נורמל, כל השפעות העצמות ודלתאות מצבי הנזק. נבדקים היפוך פאות, קישוריות ברמה הבינונית, שימור רכיבים נפרדים והשפעה של כל עצם ששימשה במקור. ברמה הרחוקה מוגנים רכיבי הראש והגו העיקריים מקריסה לפאות כפולות; פרטים קטנים יכולים להפוך לצלליות. תקציב המשולשים מחולק מחדש כאשר חלק קטן או חומר נפרד מחייבים רצפה. מקטעי נתונים בינאריים זהים חולקים אחסון glTF רגיל, לאחר בדיקת זהות של כל זרמי הגאומטריה ונתוני האנימציה; אין שינוי בערכים ואין מפענח נוסף.

ל־46 דגמי הקהל משמשות גם טופולוגיות שכבר נכתבו בענפי המקור. הן נקלטות רק אחרי התאמה מדויקת של השלד, מטריצות הקישור והקליפים. כאשר רמה קיימת השמיטה השפעה של עצם, מצורפים משולשים ללא שינוי מ־LOD0 כדי לשמר אותה. גם כאן כל משקל עצם מגיע בשלמותו מקלט נעול; אין חישוב משקלים מחדש. טופולוגיית הרמה הבינונית מופחתת מעט כדי להתקרב ל־40%.

בקהל הטניס יש שלוש סצנות ושלושה שלדים בקובץ המקור. כולם נשמרו עם כל ערוצי האנימציה. בכל GLB חדש, שלוש הסצנות משתמשות בגאומטריה של הרמה החדשה, עם מאגרי קודקודים משותפים. לכן המניפסט מפריד בין מספר המשולשים הפעיל בסצנה, סכום ההפניות מכל ה־meshes ומספר המשולשים בגאומטריה הייחודית. ההשוואה הראשית היא מול סצנת LOD0 של המקור.

נבדקו ${fmt(variants.reduce((n,v)=>n+v.animation.poseSamples,0))} דגימות תנוחה ו־${fmt(variants.reduce((n,v)=>n+v.animation.comparedVertices,0))} השוואות קודקודים. הסטייה המרבית מול קודקוד הקלט התואם, לאחר הנפשה, היא **${Math.max(...variants.map(v=>v.animation.maxDriftMetres))} מטר**. בקהל ההשוואה היא לקודקודי הטופולוגיה המקורית המתאימה ולמשולשי התמיכה מ־LOD0; בפישוט הרגיל לקודקודי LOD0 שנשמרו. בנפרד, כל הבתים של דגימות האנימציה, האינטרפולציה, מטריצות הקישור, היררכיית העצמות, הסצנות, המשקלים ברמת node/mesh, החומרים ומזהי החלקים נבדקו מול המקור. ארבעת שחקני הכדורסל אינם מכילים קליפים; השלד שלהם נשמר לשימוש בהנפשה חיצונית.

## מדידת Hausdorff ומרחקי מעבר

המדידה נעשית על משטחי המשולשים במטרים עולמיים, בשני הכיוונים. חיפוש הנקודה הקרובה מתבצע מול משולשים באמצעות BVH; המקסימום תחום באמצעות חלוקה אדפטיבית של המשולש וקבוע ליפשיץ 1 של פונקציית המרחק. התוצאה היא **תחום תחתון–עליון נומרי**, כולל פנים הפאות, ולא מרחק בין קודקודים בלבד.

נמדדו ${rest.length} זוגות משטחים בסצנות המנוחה ובמצבי הנזק המוגדרים. יעד דיוק התחום הוא 0.5% מאלכסון המקור, עם תקציב 40,000 שאילתות לכל כיוון, או דגימת הפתיחה אם היא גדולה יותר. ${rest.filter(s=>!s.hausdorff.toleranceReached).length} מדידות מנוחה לא סגרו את התחום לדיוק זה; התחום הרחב בפועל נשמר ולא מוצג כמדידה מדויקת יותר.

נוסף לכך נמדדו ${animated.length} משטחים מונפשים ב־25% וב־75% מכל קליפ, עם תקציב מדידה קטן יותר. התאמת קודקודים נבדקה גם ב־0%, 50% ו־100%. תחומי המשטח המונפש נשמרים במניפסט, כולל מצבים שבהם תקציב הדגימה מגביל את הדיוק. אין כאן הוכחה לסטיית משטח בכל רגע שבין הדגימות; שמירת נתוני האנימציה עצמם נבדקה במלואה.

[lod-config.json](lod-config.json) כולל ספי מרחק לכל דגם, בנוסף לפרופילי ברירת מחדל ולהיסטרזיס של 10%. הספים מכוילים לפי הגבול העליון של סטיית משטחי המנוחה בכל הסצנות, למסך בגובה 390 פיקסלים ושדה ראייה אנכי של 38 מעלות: עד 3 פיקסלים ל־LOD1 ועד 1.5 פיקסלים ל־LOD2 במשטחי הייחוס. הנוסחה היא \`D >= 2R + f*e/p\`, כש־R מכיל גם את שגיאת המשטח; הספים מפצים גם על טווח השימור של ההיסטרזיס. הכיול מתייחס למצלמה המכוונת למרכז מעטפת הדגם ולממדי GLB המקוריים. זו מעטפת גאומטרית לתנוחות הייחוס; היא אינה חסם לשינויי הצללה, טקסטורה או לכל תנוחות הביניים. במבט שאינו ממורכז, בקנה מידה אחר, בשדה ראייה או בגובה מסך אחרים יש לכייל מחדש. [כלי הכיול](tools/calibrate-policy.mjs) מצורף.

בעת החלפת רמה במארח, שומרים את שם הקליפ, זמנו המקומי, מהירותו, משקלי ערבוב הפעולות, הסצנה, משקלי הנזק ובחירת הציוד. בהנפשה חיצונית שומרים גם את שינויי העצמות של המארח. הקליפ אינו מתחיל מחדש. חיבור למשחקים לא בוצע במסגרת החבילה.

## בדיקות ותיחום השינוי

| בדיקה | תוצאה | ראיות |
|---|---|---|
| בדיקות הצינור | ${number('pass')} מתוך ${number('tests')}, ${number('fail')} נכשלו | [TAP](verification/pipeline-tests.tap) |
| Khronos glTF Validator, JavaScript מקומי | ${validation.files} GLB, ${validation.errors} שגיאות, ${validation.warnings} אזהרות; כולל ${validation.authoredGuideGLBs} קלטי טופולוגיה | [דוח אימות](verification/gltf-validation.json) |
| תצוגה ב־844×390 | ${browser.models} דגמים / ${browser.glbs} GLB / ${browser.scenes} סצנות / ${browser.clips} קליפים; ${browser.errors.length} שגיאות | [דוח דפדפן](verification/browser.json) |
| שלד ומצבי נזק בדפדפן | אפס סטייה במטריצות העצמות ובמשקלי morph בכל הרמות | [דוח דפדפן](verification/browser.json) |
| אופליין לאחר בחירת תיקייה | ${offline.models} דגמים / ${offline.glbs} GLB, רשת מנותקת, ${offline.networkRequestsAfterDisconnect.length} בקשות HTTP, WASM מושבת | [בדיקת אופליין](verification/offline.json) |
| בדיקות כלליות של המאגר | ${repository.status} | [פירוט סביבת הבדיקה](verification/repository-tests.json) |

בדיקות התצוגה השתמשו ב־Chromium עם ANGLE/SwiftShader וב־WebAssembly מושבת. אלו בדיקות דפדפן בסביבת הענן, ולא מדידת ביצועים בטלפון. ניווט ישיר ל־\`file://\` חסום בסביבת Chromium המנוהלת ב־ERR_BLOCKED_BY_ADMINISTRATOR; לכן זרימת בחירת התיקייה נבדקה באותו HTML מקומי, לאחר ניתוק רשת הדפדפן ולפני קריאת הקבצים. שרת Node המקומי הוא דרך צפייה נוספת כאשר מדיניות דפדפן חוסמת פתיחת HTML ישירה.

כל התוספות נמצאות תחת \`workout/island/design/lod-pipeline-v1/\`. קבצים קיימים וענפי המקור נקראו בלבד. בפרט, קובץ הבקרה הקיים לא עודכן בהתאם לאילוץ התיקייה היחידה; קריטריון הסיום של מסירה זו הוא GLB, מדידות, תצוגה, שחזור אופליין, אימות ודחיפת הענף.

## קלטים נעולים

בסיס הענף: \`${lock.baseCommit}\`.

| ענף מקור | קומיט שנקרא | דגמי LOD0 |
|---|---|---:|
${sourceRows.join('\n')}

המקור, הרישיון, הקומיט וגיבוב כל קלט מופיעים ב־[source-lock.json](source-lock.json). [רישיונות וייחוסים](LICENSES.md) משמרים את תנאי המקור, כולל הסתייגות המקור לגבי אישורי חבילות השיער והנעליים של שחקני הכדורסל. המניפסט כולל מלאי קבצים וגיבובי SHA-256, למעט עצמו והארכיון כדי למנוע תלות מעגלית.

## טבלת מדידה לכל דגם

ספירת המשולשים והסטייה בטבלה זו מתייחסות לסצנה הראשית במנוחה. תחום Hausdorff בסנטימטרים; הספים במטרים. כל הסצנות והדגימות המונפשות נמצאות במניפסט וב־\`verification/*.json\`.

| דגם | מקור | LOD1 | LOD2 | סטייה LOD1, ס״מ | סטייה LOD2, ס״מ | מעבר LOD1 / LOD2, מ׳ |
|---|---:|---:|---:|---:|---:|---:|
${assetRows.join('\n')}

![שחקן כדורסל — שלוש רמות](verification/hoops-athlete-844x390.png)

![קהל כדורגל — שלוש רמות](verification/soccer-crowd-844x390.png)

![קהל טניס — שלוש רמות](verification/tennis-crowd-844x390.png)

![תושב עיר — שלוש רמות](verification/city-citizen-844x390.png)

![רכב ומצב נזק — שלוש רמות](verification/vehicle-damage-844x390.png)

![חילוץ — שלוש רמות](verification/fire-rescue-844x390.png)
`;
await fs.writeFile(path.join(root,'report.md'),text);console.log('Wrote report for '+manifest.assets.length+' models');
