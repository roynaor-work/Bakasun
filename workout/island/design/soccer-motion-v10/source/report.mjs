/** Original report and per-file provenance writer. CC0-1.0. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),root=fileURLToPath(base);
const read=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const catalog=await read('runtime/catalog.json'),metrics=await read('verification/metrics.json'),validator=await read('verification/validator.json'),refs=await read('verification/reference.json');
let browser;try{browser=await read('verification/browser.json');}catch{}
const catalogSha256=createHash('sha256').update(await fs.readFile(new URL('runtime/catalog.json',base))).digest('hex');
if(!metrics.pass||!validator.pass||!browser?.pass||browser.catalogSha256!==catalogSha256||metrics.catalogSha256!==catalogSha256)throw Error('Final report requires passing numerical, validator and browser evidence for the exact current catalog.');
const contact=await read('verification/contact-surfaces.json');
if(!contact.globalPathSkinCollisionTested||!contact.nativeMotionFramesUnchanged||contact.maximumPathSkinPenetrationMeters>.005)throw Error('Final report requires completed mesh-contact and full-path clearance evidence.');
const motionSha256=createHash('sha256').update(await fs.readFile(new URL('runtime/motions.json',base))).digest('hex');
if(contact.outputMotionSha256!==motionSha256||catalog.sourceMotionSha256!==motionSha256)throw Error('Triangle audit, motion source and baked catalog must describe exactly the same assets.');
const n=(v,d=3)=>Number(v).toFixed(d),pair=(a,key)=>`${n(a.arms.Left[key].min,1)}–${n(a.arms.Left[key].max,1)} / ${n(a.arms.Right[key].min,1)}–${n(a.arms.Right[key].max,1)}`;
const rows=metrics.clips.map(r=>{const c=catalog.clips.find(c=>c.id===r.id),contact=c.contactFrame===null?'—':`${c.contactFrame} · ${c.event?.event??'plant'}`,raw=`${n(r.entry.maxJointM*100,3)} / ${n(r.exit.maxJointM*100,3)}`;return `| [${r.id}](runtime/${c.asset}) | ${n(r.duration)} | ${contact} | ${n(r.maxSlidingM*100,3)} | ${n(r.rateErrorPercent,6)} | ${pair(r.angles,'shoulderAbductionDeg')} | ${pair(r.angles,'elbowFlexDeg')} | ${raw} | ${r.pass?'PASS':'FAIL'} |`;});
const summary=metrics.summary,run=metrics.clips.find(c=>c.id==='run');
const report=`# דוח כדורגל v10

30 קליפים מקוריים ומתוקנים, שלד motion2 בן18 עצמות,30Hz, בקבצים חדשים בלבד. תוצאת הבדיקה המספרית: **${summary.passed}/${summary.clips}**. כל33 קובצי ה־GLB, כולל3 ייחוסים, נבדקו במאמת Khronos: **${summary.validatorErrors} שגיאות**.

## התוצאה

| דרישה | מדידה |
|---|---|
| נטיעה עד2 ס״מ | מרב מרכז/קדמת/עקב סוליה ב־120Hz: ${n(summary.maxSlidingM*100,3)} ס״מ; שגיאת עוגן ${n(summary.maxAnchorErrorM*100,3)} ס״מ |
| קצב30Hz, שגיאה עד5% | שגיאת שעון הדגימות המרבית: ${n(summary.maxRateErrorPercent,6)}%; משך ה־GLB נבדק מול משך הפעולה |
| חיתוכים | 45°:0.400 שנ׳;90°:0.467;135°:0.533;180°:0.600; שני הכיוונים בכל זווית |
| קבלה ראשונה קצרה |8 גרסאות של0.500 שנ׳, אירוע receive בפריים10 =0.333 שנ׳, ללא חזרה לעמידה |
| כתף ומרפק בעמידה | שלוש עמידות:12° החוצה,40° כפיפת מרפק, בשני הצדדים |
| run | מרפקים ${pair(run.angles,'elbowFlexDeg')}°; מרב תנועת האגן ${n(run.angles.hips.maxExcursionMeters*100,3)} ס״מ ≤2.5 |
| גבולות מקומיים מדויקים | מרב מפרק ${n(summary.maxExactBoundaryJointM,9)} מ׳; מרב סיבוב ${n(summary.maxExactBoundaryRotationDeg,9)}° |
| Root נקי | rootMotion:false; Root זהות; ללא ערוץ תרגום Root וללא מסלול בתוךGLB |
| טעינה ללאcodec | כל33 הקבצים ניתנים לטעינה ב־GLTFLoader ללא decoder; ה־CSP חוסםWebAssembly |

אין נתון קצב מתוך בקר המשחק: השגיאה כאן מודדת את שעון ה־30Hz והאורך המופק, לא קצב פריימים בטלפון ולא התאמת צעדים לכל מהירות בקר אפשרית. ריצת הייחוס היא4.5 מ׳/ש׳, מחזור0.6 שנ׳ ושני צעדים במחזור; מסלולי החיתוך מכילים האטה מתוכננת.

## מדידות לכל קליפ

הזוויות הן טווח מינימום–מקסימום בשמאל / ימין, מהגאומטריה של העצמות ב־FK. ״גבול כניסה / יציאה״ הוא מרב הפרש מפרק גולמי מולv9, בס״מ. בעמידות וב־run המתוקנים ההפרש מכוון; בקבלות quick היציאה ממשיכה את הנגיעה ולכן אינה התאמה ישירה ל־idle/run.

| קליפ | אורך שנ׳ | פריים ואירוע | נטיעה ס״מ | שגיאת קצב % | כתף ° ש/י | מרפק ° ש/י | גבול כניסה / יציאה ס״מ | בדיקה |
|---|---:|---|---:|---:|---|---|---|---|
${rows.join('\n')}

## שיטת בדיקה ורציפות

[verification/check.mjs](verification/check.mjs) קורא את ה־float32 מתוך ה־GLB באמצעות קורא בלתי תלוי במפיק, מבצע slerp ו־FK ב־120Hz, מודד מרכז סוליה, קדמה ועקב, ובודק גם עוגן תלת־ממדי, אירוע מול עצם, מרכז כדור מול רדיוס, רצפה, נורמות קווטרניונים,18 עצמות וחסימתcodec. לא נעשה IK בריצה או בבדיקה שמסתיר שגיאות נכס. ${n(summary.maxSlidingM*100,3)} ס״מ הוא המדד עם מסלול הייחוס החיצוני פעם אחת; מדד התנועה המקומית של הרגל במצב in-place נשמר בנפרד ב־[metrics.json](verification/metrics.json).

פוזות הייחוס פוענחו מערוצי v9 בקומיט \`${refs.sourceCommit}\`, עם SHA-256 למקור ולתוצר. אין תלות בענףv9 בזמן ריצה. הפעולות הרגילות שומרות שני פריימים ראשונים ואחרונים לפי פאזה מפורשת. נבדקים גם הפרשי מהירות מפרקים בגבול. חיתוך ימני וחיתוך שמאלי נכנסים שניהם ב־run פאזה0, ולא בשיקוף שמחליף רגליים.

בקבלות quick ובקליפי הבסיס המתוקנים אין טענה להתאמה גולמית מלאה ל־v9: ההפרש הגולמי הגדול ביותר בכל הקליפים הוא ${n(summary.maxRawBoundaryJointM*100,3)} ס״מ / ${n(summary.maxRawBoundaryRotationDeg,3)}°. דף התצוגה מממש את blendSeconds המפורשים; [browser.json](verification/browser.json) מודד בנפרד את הפוזה המוצגת משני צדי כל גבול בשרשרת ריצה→קליפ→ריצה ובגשרים לעמידה.

שלבי הקבלה, השחרור והמגע נבדקים מול המשטח המונפש של הדמות, מעבר לבדיקת עצם בלבד. כל15 מסלולי הכדור נאפו ונבדקו מול משולשי הרשת ב־120Hz, לרבות תנועת ההמשך לאחר הקבלה והאחיזה לפני גלגול השוער. מרב חדירת הכדור בדגימות: ${n(contact.maximumPathSkinPenetrationMeters*1000,4)} מ״מ; שגיאת הרדיוס באירוע: ${n(contact.maximumEventRadiusErrorMeters*1000,4)} מ״מ. מגעי פנים/חוץ רגל מוגבלים למשטח הנעל ולצד המתאים, ולא לאזור השוק. פרטי הכיול והמרחקים ב־[contact-surfaces.json](verification/contact-surfaces.json). הכיול משנה סמנים ומסלול כדור בלבד, בלי שינוי פוזות, וללא solver בזמן ריצה.

## דפדפן ותמונות

ראיות סבב הדפדפן הסופי נשמרו ב־[browser.json](verification/browser.json): ${browser.loads.length} קבצים נטענו עם טקסטורות, ${browser.playback.length} קליפים נוגנו בשני המצבים; קפיצת גבול מוצגת מרבית ${n(browser.transitionSummary.maxPoseJumpMeters,9)} מ׳. כל קובץ GLB והקטלוג ננעלו ב־SHA-256 כדי למנוע ערבוב גרסאות ראיות.

![תצוגה1280×800](verification/preview-1280x800.png)

![תצוגת טלפון390×844](verification/preview-390x844.png)

## מקורות, מגבלות והמשך חיבור

כל קובץ מופיע ב־[LICENSES.md](LICENSES.md). הגאומטריה הבדיונית מבוססת על נכסיv8 הקיימים (MakeHuman hm08 ונכסי מערכתCC0). לא הועתקו מותגים או אנשים אמיתיים. המקור הפתוחthree.jsMIT הקיים משמש כתלות; שוםvendor חדש לא נכלל בתיקייה.

מאמתKhronos מדווח5 אזהרות tangent-space בכלGLB, אחת לכל primitive, שמקורן ב־normal maps ובגאומטרייתv8 שנשמרו. אין שגיאות; ה־renderer יוצר את הבסיס הדרוש. הפירוט המלא ב־[validator.json](verification/validator.json).

הכניסה המדויקת שומרת גם שגיאת אינטרפולציית סוליה שקיימת בייחוסv9. ב־120Hz קצה סוליה יורד עד7.13 מ״מ מתחת למישור בתחילת ריצת הייחוס; בקבלות ריצה נמדדה ירידה של עד10.48 מ״מ בין מפתחות30Hz. בפריימים החדשים תוקן מרווח התנופה; נשארת ירידה עד4.62 מ״מ סמוך לנחיתה בחיתוך45°. אלה מדידות נקודות סוליה, בנפרד מסף ההחלקה2 ס״מ; אין טענה לאפס חדירת סוליה בכל תת־פריים. הראיות לכל קליפ ב־[ground-clearance.json](verification/ground-clearance.json). ספי הקבלה הם מדדי הנכס ותצוגתו; בדיקה חוזרת בבקר המשחק נדרשת לאחר החיבור שלClaude. אין שינוי בקוד המשחק ואין טענה ששיפור המשחק כבר נמדד.

שני נתיבי האבחון שהמשתמש צירף (soccer-motion-diagnosis/REPORT.md ו־soccer-run-v9/REPORT.md) לא נמצאו ב־main בעת משיכת המקור ב־07/11/2026. יעדי26°→12°,88°→40°,3.5→2.5 ס״מ ו־90–110° יושמו לפי המדידות שסופקו בהודעה; המדידות החדשות כאן מחושבות מהנכסים שנמסרו.

שחזור, שימוש ופרטי הפאזה: [README.md](README.md). קוד המקור,release.json,release.mjs,תגי?v=,CLAUDE.md,ops והבדיקות הקיימות נשארו ללא שינוי.
`;
const readable=text=>text.replace(/([\u0590-\u05ff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u0590-\u05ff])/g,'$1 $2').replaceAll('three.jsMIT','three.js MIT');
await fs.writeFile(new URL('REPORT.md',base),readable(report));
async function walk(dir){const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);files.push(...(e.isDirectory()?await walk(p):[path.relative(root,p).replaceAll(path.sep,'/')]));}return files;}
// Include the manifest itself explicitly; content hashes intentionally exclude
// generated prose and the hash manifest, avoiding recursive self-checksums.
let files=await walk(root);for(const name of ['LICENSES.md','verification/files.json'])if(!files.includes(name))files.push(name);files.sort();
const sourceFor=p=>p.startsWith('runtime/clips/')?'source/author.mjs + source/calibrate.mjs + source/bake.mjs; CC0 v8 geometry, exact source hashes below':p.startsWith('runtime/reference/')?`v9 ${refs.sourceCommit}, native source hash in verification/reference.json; CC0 v8 geometry`:p==='source/rig.mjs'?`CC0 v9 source/rig.mjs at ${refs.sourceCommit}; import path adapted to existing v8 renderer`:p==='verification/reference.json'?`Actual v9 native GLB accessors at ${refs.sourceCommit}; SHA-256 per reference`:p.startsWith('verification/')?'Original v10 measurement code or its generated evidence; no external image source':p==='runtime/motions.json'||p==='runtime/catalog.json'?'Original v10 source/author.mjs, calibrated by source/calibrate.mjs; CC0 reference poses where documented':'Original v10 code, design or documentation authored for this task';
const license=`# רישיונות ומקור לכל קובץ · v10\n\nכל הנכסים, ההנפשות, הסמנים, הקוד המקורי, התיעוד והתמונות בתיקייה הזאת מוקדשים לנחלת הכלל תחת **CC0-1.0**. [הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). אין ייבוא צילום תנועה, מותגים או דמות אדם אמיתי. תמונות הראיות הן צילומי התצוגה המקורית והדמויות הבדיוניות של החבילה.\n\nגאומטריית שחקן: מקור ../soccer-motion-v8/runtime/player.glb, SHA-256 2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef. גאומטריית שוער: מקור ../soccer-motion-v8/runtime/keeper.glb, SHA-256 4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42. אלו דמויות בדיוניות מבוססות MakeHuman hm08 ונכסי מערכת CC0; [רישיון המקור](../soccer-motion-v8/LICENSE.md). נשמרים skin, materials ו־textures; קידוד Draco מוסר ביצוא. פוזות ייחוס וקטעים מתוקנים של v9 מפורטים עם SHA-256 ב־verification/reference.json ובקומיט ${refs.sourceCommit}.\n\nאין בתיקייה העתק של ספריית צד שלישי. preview והמתמטיקה טוענים את three.js ו־GLTFLoader הקיימים ב־../soccer-motion-v8/runtime/vendor/ ברישיוןMIT ([הודעת המקור](../soccer-motion-v8/runtime/vendor/LICENSE.three)); Draco הקיים ב־v8 משמש לפענוח לא מקוון בלבד, ברישיוןApache-2.0. כלי הפיתוח Khronos gltf-validator ו־Playwright אינם קבצים בחבילה. תנאי התלויות אינם משתנים על ידי הקדשת התוכן ל־CC0.\n\n| קובץ | רישיון | מקור מדויק / יצירה |\n|---|---|---|\n${files.map(p=>`| [${p}](${p}) | CC0-1.0 | ${sourceFor(p)} |`).join('\n')}\n`;
await fs.writeFile(new URL('LICENSES.md',base),readable(license));
const inventory=[];for(const p of files){if(p==='verification/files.json')continue;const bytes=await fs.readFile(new URL(p,base));inventory.push({file:p,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),license:'CC0-1.0',source:sourceFor(p)});}
await fs.writeFile(new URL('verification/files.json',base),JSON.stringify({scope:'Every delivered file except this self-referential inventory; LICENSES.md includes this file too.',files:inventory},null,2)+'\n');
console.log(`Wrote report, licenses for${files.length} files and hashed inventory.`);
