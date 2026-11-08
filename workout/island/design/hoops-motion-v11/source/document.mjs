/** CC0-1.0. Derive review tables and explicit per-file provenance from actual QA.
 * Adapted from the repository's CC0 hoops-motion-v10 document generator;
 * measurements are never supplied by this script or the motion author.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE_MAIN = 'ae09529bc8fc9ff42f6aa76b8e79e7f760992f62';
const TALL_COMMIT = 'cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa';
const V10_COMMIT = 'a5d245981acba83c1bad88de59bf30ca7bde53a5';
const REPO = 'https://github.com/roynaor-work/Bakasun';
const DESIGN = 'workout/island/design';
const readJSON = async relative => JSON.parse(await fs.readFile(path.join(ROOT, relative), 'utf8'));
const [qa, browser, catalog, validation] = await Promise.all([
  readJSON('verification/measurements.json'),
  readJSON('verification/browser.json'),
  readJSON('runtime/catalog.json'),
  readJSON('verification/gltf-validation.json'),
]);
const continuity = await readJSON('verification/motion-continuity.json').catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (!qa.summary?.allPass || !browser.pass || !browser.webAssembly?.blockedByCSP) {
  throw new Error('Cannot document readiness: independent asset audit, browser audit and actual CSP WASM block must pass.');
}
const rows = qa.measurements;
if (catalog.clips.length !== 30 || catalog.profiles.length !== 3 || rows.length !== 90) {
  throw new Error('Expected 30 clips × 3 profiles = 90 measured performances.');
}
for (const clip of catalog.clips) for (const profile of catalog.profiles) {
  const matches = rows.filter(row => row.id === clip.id && row.profile === profile.id);
  if (matches.length !== 1 || !matches[0].pass) throw new Error(`Missing or failed measurement: ${profile.id}/${clip.id}`);
}
const s = qa.summary;
for (const field of [
  'maximumPlantedAnchorDistanceMeters', 'maximumHandBallSurfaceErrorMeters',
  'maximumInterpolatedHandBallSurfaceErrorMeters', 'maximumDribbleReturnSurfaceErrorMeters',
  'maximumDribbleFloorHeightErrorMeters', 'maximumGLBValueError', 'gltfFiles', 'gltfErrors', 'gltfWarnings',
]) if (!Number.isFinite(s[field])) throw new Error(`Missing measured summary: ${field}`);
if (s.gltfFiles !== 93 || s.gltfErrors !== 0 || s.gltfWarnings !== 0) {
  throw new Error('Expected all 90 animation GLBs and 3 model GLBs to pass glTF Validator without errors/warnings.');
}
if (browser.assetLoads?.models !== 3 || browser.assetLoads?.animations !== 90 || browser.assetLoads?.keyframes !== 90) {
  throw new Error('Browser evidence must load all 3 models, 90 GLB animations and 90 keyframe files.');
}
const number = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const cm = value => Number.isFinite(value) ? (value * 100).toFixed(3) : '—';
const maximum = values => {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
};
const profileLabel = id => catalog.profiles.find(profile => profile.id === id)?.label || id;
const label = id => catalog.clips.find(clip => clip.id === id)?.labelHe || id;
const cleanCell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const passed = value => value ? 'עבר' : 'נכשל';
const viewport = (value, kind) => Array.isArray(browser.viewports?.[kind]) ? browser.viewports[kind].join('×') : value?.viewport?.width && value?.viewport?.height ? `${value.viewport.width}×${value.viewport.height}` : value?.width && value?.height ? `${value.width}×${value.height}` : 'כמפורט ב־browser.json';
const assetURL = (commit, version, relative) => `${REPO}/blob/${commit}/${DESIGN}/${version}/${relative}`;

let report = `# דוח מסירה — תנועות כדורסל v11

נמסרו ${catalog.clips.length} מהלכים מקוריים × ${catalog.profiles.length} דמויות גבוהות = ${rows.length} ביצועים ב־30Hz, כל אחד כנתוני JSON וכ־GLB של אנימציה. רכז 1.88 מ׳, קיצוני 1.98 מ׳ וסנטר 2.08 מ׳. בסיס הענף הוא main בקומיט ${BASE_MAIN}. כל השינויים הם קבצים חדשים תחת workout/island/design/hoops-motion-v11/ בלבד. המודלים, הספריות והתצוגה נכללים בחבילה העצמאית; קוד המשחק לא חובר ולא השתנה.

המספרים בדוח נוצרו מ־[measurements.json](verification/measurements.json), [gltf-validation.json](verification/gltf-validation.json) ו־[browser.json](verification/browser.json). המחולל של הדוח מסרב להפיק מסירת הצלחה כאשר חסרה מדידה, כאשר אחד מ־90 הביצועים נכשל או כאשר אין הוכחת חסימת WASM בדפדפן.

## תוצאה מדודה

| בדיקה | תוצאה | תנאי מעבר |
|---|---|---|
| החלקת סוליה מרבית בעולם, כולל בין דגימות | ${cm(s.maximumPlantedAnchorDistanceMeters)} ס״מ | עד 2 ס״מ |
| שגיאת מגע כף יד מול מעטפת הכדור, דגימות 30Hz | ${cm(s.maximumHandBallSurfaceErrorMeters)} ס״מ | עד 2 ס״מ |
| שגיאת מגע כף יד בין דגימות, 120Hz | ${cm(s.maximumInterpolatedHandBallSurfaceErrorMeters)} ס״מ | עד 2 ס״מ בחלון מגע תואם |
| חזרת כדרור לכף היד | ${cm(s.maximumDribbleReturnSurfaceErrorMeters)} ס״מ | עד 2 ס״מ בכל חזרה |
| גובה מרכז הכדור במגע רצפה ביחס לרדיוס | ${cm(s.maximumDribbleFloorHeightErrorMeters)} ס״מ | עד 2 ס״מ בכל הקפצה |
| מחזורי כדרור שנבדקו בנפרד | ${s.dribbleBounceCount} | דחיפה → רצפה → חזרה עם אותו bounceIndex |
| קובצי GLB שעברו glTF Validator | ${s.gltfFiles} | 90 אנימציות + 3 דמויות |
| שגיאות / אזהרות glTF | ${s.gltfErrors} / ${s.gltfWarnings} | 0 / 0 |
| סטיית ערוץ GLB מול JSON | ${s.maximumGLBValueError.toExponential(3)} | עד 0.00002 |
| טעינה וניגון בדפדפן | ${browser.assetLoads.animations} אנימציות, ${browser.assetLoads.keyframes} נתוני JSON, ${browser.assetLoads.models} דמויות | כל הקבצים נטענים |
| שגיאות HTTP / עמוד / בקשות / תצוגה | ${browser.httpErrors.length} / ${browser.pageErrors.length} / ${browser.requestErrors.length} / ${browser.previewErrors?.length || 0} | 0 |
| חסימת WebAssembly בפועל | ${passed(browser.webAssembly.blockedByCSP)} | ניסיון קומפילציה נדחה ב־CSP והניגון ממשיך |

![סקירת מהלכים על שלוש הדמויות](verification/contact-sheet.png)

## כיסוי המהלכים

| מהלך | שם | משפחה | משך (ש׳) | חזרה |
|---|---|---|---:|---|
`;
for (const clip of catalog.clips) report += `| \`${clip.id}\` | ${cleanCell(label(clip.id))} | ${cleanCell(clip.group || clip.kind)} | ${number(clip.durationSeconds, 2)} | ${clip.loop ? 'מחזור סגור' : 'חד־פעמי; איפוס סקירה'} |\n`;

report += `
## נטיעה ומגע כדור — כל 90 הביצועים

כל שגיאה בטבלה בס״מ; מסלול השורש במטרים. נטיעה היא המרחק התלת־ממדי של סמן הסוליה מעוגן העולם. שגיאת יד היא הערך המוחלט של מרחק סמן כף היד ממרכז הכדור פחות רדיוס הכדור (0.12 מ׳), רק כאשר היד מדווחת במגע. מקף מציין שאין מגע מדווח או שאין חלון אינטרפולציה מתאים. screen ו־close_guard הם שני מהלכים ללא כדור אצל המבצע; מגע/קליטת כדור אינם חלים עליהם ואין בהם אירוע קליטה מלאכותי. תנועת השורש וסיבובו נכללים בחישוב פעם אחת.

| קליפ | דמות | נטיעה מרבית (ס״מ) | מגע יד 30Hz (ס״מ) | מגע יד 120Hz (ס״מ) | מסלול שורש (מ׳) | צעד שורש מרבי ב־30Hz (מ׳) | תוצאה |
|---|---|---:|---:|---:|---:|---:|---|
`;
for (const row of rows) report += `| \`${row.id}\` | ${profileLabel(row.profile)} | ${cm(row.maximumPlantedAnchorDistanceMeters)} | ${row.handContactSamples ? cm(row.maximumHandBallSurfaceErrorMeters) : '—'} | ${row.interpolatedHandContactSamples ? cm(row.maximumInterpolatedHandBallSurfaceErrorMeters) : '—'} | ${number(row.rootDistanceMeters)} | ${number(row.maximumAdjacentRootStepMeters)} | ${passed(row.pass)} |\n`;

report += `
## כדרור — חזרה מלאה ליד בכל מחזור

לכל הקפצה נבדק הסדר ball_release → ball_floor_contact → ball_return עם bounceIndex תואם. החזרה נמדדת בזמן האירוע מול היד המצוינת, ונדרש שמצב המגע יחזור להיות פעיל. שגיאת הרצפה נמדדת מול y=0.12 מ׳ במרחב העולם. הטווח ממרכז הכדור לכף היד הקרובה לאורך כדרור כולל את שלב המעוף, שבו הכדור מרוחק מהיד בכוונה; תנאי המגע חל ברגעי המגע והחזרה. נתוני כל מחזור וזמניו נמצאים בשדה dribble.bounces של המדידות.

| קליפ | דמות | הקפצות | שגיאת חזרה (ס״מ) | שגיאת רצפה (ס״מ) | מרחק כף היד הקרובה–מרכז כדור, מינ׳–מקס׳ (מ׳) |
|---|---|---:|---:|---:|---:|
`;
for (const row of rows.filter(row => row.dribble)) {
  const range = Number.isFinite(row.minimumPalmToBallCenterDistanceDuringDribbleMeters) && Number.isFinite(row.maximumPalmToBallCenterDistanceDuringDribbleMeters)
    ? `${number(row.minimumPalmToBallCenterDistanceDuringDribbleMeters)}–${number(row.maximumPalmToBallCenterDistanceDuringDribbleMeters)}` : '—';
  report += `| \`${row.id}\` | ${profileLabel(row.profile)} | ${row.dribble.bounceCount} | ${cm(row.dribble.maximumReturnSurfaceErrorMeters)} | ${cm(row.dribble.maximumFloorHeightErrorMeters)} | ${range} |\n`;
}

report += `
## קליטה, מסירה והדיפה

ball_catch, ball_gather ו־ball_deflect נמדדים מול כפות הידיים של המבצע בזמן האירוע. ball_target_catch הוא יעד מקבל חיצוני: נמדדת הגעת מרכז הכדור לנקודה המוצהרת, ולא קליטה של דמות שנייה. האירועים משמשים לתזמון המחשה. קביעת בעלות בכדור, תוצאת משחק, עבירה וחוקיות חסימה שייכות למנוע המשחק.

| קליפ | דמות | אירועי קליטה/איסוף/הדיפה שנמדדו | שגיאת יד מרבית באירועים (ס״מ) | זמן שחרור (ש׳) | שגיאת הגעה למקבל (ס״מ) |
|---|---|---:|---:|---:|---:|
`;
for (const row of rows.filter(row => row.ballAction?.catches?.length || row.ballAction?.release || row.ballAction?.targetCatch)) {
  const action = row.ballAction;
  report += `| \`${row.id}\` | ${profileLabel(row.profile)} | ${action.catches?.length || 0} | ${cm(maximum((action.catches || []).map(event => event.surfaceErrorMeters)))} | ${number(action.release?.timeSeconds)} | ${cm(action.targetCatch?.errorMeters)} |\n`;
}

report += `
## זריקות מול טבעת תקנית

הטבעת בכל מסלול בגובה 3.05 מ׳. המדידה מחפשת מעבר יורד של הכדור בגובה הטבעת ומוודאת שמרכזו עובר בתוך הפתח עם מרווח לרדיוס הכדור. שתי זריקות השלוש נבדקות למרחק אופקי של 6.75 מ׳ לפחות בנקודת השחרור. המסלול הוא אנימציה מודגמת; תוצאת זריקה במשחק נקבעת בנפרד.

| קליפ | דמות | מרחק שחרור אופקי (מ׳) | זמן חציית טבעת בירידה (ש׳) | סטיית מרכז הכדור ממרכז הטבעת (ס״מ) |
|---|---|---:|---:|---:|
`;
for (const row of rows.filter(row => row.ballAction?.shot)) {
  const shot = row.ballAction.shot;
  report += `| \`${row.id}\` | ${profileLabel(row.profile)} | ${number(shot.releaseHorizontalDistanceMeters)} | ${number(shot.descendingRimCrossing?.timeSeconds)} | ${cm(shot.descendingRimCrossing?.horizontalErrorMeters)} |\n`;
}

if (continuity?.results?.length) {
  const records = continuity.results;
  const peakPalm = records.reduce((best, row) => row.maximumPalmVelocity.value > best.maximumPalmVelocity.value ? row : best);
  const peakAngle = records.reduce((best, row) => row.maximumBoneWorldOrientationStep.value > best.maximumBoneWorldOrientationStep.value ? row : best);
  const minimumElbow = Math.min(...records.map(row => row.minimumElbowInteriorDegrees.value));
  const releaseElbows = records.map(row => row.releaseRightElbowInteriorDegrees).filter(Number.isFinite);
  const releaseRow = releaseElbows.length ? `| זווית מרפק ימין ברגע שחרור זריקה | ${number(Math.min(...releaseElbows))}–${number(Math.max(...releaseElbows))}° | ${releaseElbows.length} זריקות על שלושת הפרופילים |\n` : '';
  report += `
## ביקורת רציפות נוספת

[audit-motion.mjs](source/audit-motion.mjs) משחזר FK באופן עצמאי מנתוני ה־JSON שנמסרו, בלי לייבא את המחולל, מאמת הנכסים או פונקציות המתמטיקה של החבילה. הוא סוקר ${records.length} ביצועים ב־30Hz; לכל שורה ב־[motion-continuity.json](verification/motion-continuity.json) גיבוב SHA-256 של קובץ הדגימות שנמדד.

| מדד | תוצאה מדודה | מקום המדידה |
|---|---:|---|
| מהירות כף יד מרבית | ${number(peakPalm.maximumPalmVelocity.value)} מ׳/ש׳ | ${peakPalm.id} / ${peakPalm.profile}, ${number(peakPalm.maximumPalmVelocity.timeSeconds)} ש׳ |
| שינוי סיבוב עצם בעולם בין שתי דגימות | ${number(peakAngle.maximumBoneWorldOrientationStep.value)}° | ${peakAngle.id} / ${peakAngle.profile}, ${peakAngle.maximumBoneWorldOrientationStep.bone}, ${number(peakAngle.maximumBoneWorldOrientationStep.timeSeconds)} ש׳ |
| זווית מרפק פנימית מזערית | ${number(minimumElbow)}° | כל ${records.length} הביצועים |
${releaseRow}
אלה מדדי סקירה נוספים של הפרשים בין דגימות, ואינם תנאי מוכנות חדש או גבולות פיזיולוגיים. המהירות היא מיתר בין פוזות ב־30Hz ואינה שיא מהירות רציף. שינוי הסיבוב נמדד בזווית הקצרה בין קווטרניונים, ולא בפיתול אנטומי סביב מפרק יחיד. מדדים אלה מסייעים לחשוף קפיצות יד או נעל, אך אינם מוכיחים העדר כל קפיצה בין הדגימות או ריאליזם של תנועת גוף.

זווית המרפק בשחרור מחושבת ממיקומי הכתף, המרפק ושורש כף יד ימין ב־FK בזמן אירוע ball_release שאינו כדרור. היא נמדדת בנפרד מהזווית המזערית לאורך המהלך, כדי להבחין בין הכנת הזריקה לבין הושטת היד בשחרור; גם היא מדד סקירה ולא תנאי מעבר נוסף.
`;
}

report += `
## שלד, תנועת שורש ומשטח

הדמויות ונתוני הקשירה הועתקו מ־hoops-tall-v1 בקומיט ${TALL_COMMIT}. נשמרו 18 העצמות, ההיררכיה, אורכי האיברים והסקאלה המקוריים של כל פרופיל. שגיאת אורך עצם מרבית שנמדדה: ${maximum(rows.map(row => row.maximumBoneLengthError))?.toExponential(3)} מ׳. Root נשאר בזהות; Motion הוא טרנספורם העולם היחיד, ו־Hips מקבל היסט ביחס למנוחת הפרופיל. אין שכפול תנועת שורש בתצוגה. נתוני GLB נבדקו מול נתוני JSON שנמסרו.

בדיקת משטח העור מפעילה את משקולות המודלים בפועל בתשע פוזות לכל ביצוע. יחס מתיחת קצה באחוזון 99 המרבי: ${number(maximum(rows.map(row => row.surface?.p99EdgeStretch)))}; מתיחת קצה מרבית: ${number(maximum(rows.map(row => row.surface?.maximumEdgeStretch)))}. אלה מדדי זיהוי השחתה מדגמיים, ואינם הוכחה לאנטומיה מושלמת או להעדר כל חדירה עצמית.

## טעינה, CSP וקריאת כל הקבצים

כל ${s.gltfFiles} קובצי ה־GLB נמסרים ללא KHR_draco_mesh_compression וללא EXT_meshopt_compression. כל הנכסים נמצאים תחת runtime/; אין קובץ GLB דחוס שמחייב מפענח או עותק ריצה נוסף. הספריות המקומיות אינן מגדירות DracoLoader או MeshoptDecoder, ואינן פותחות worker. העמוד מוגש עם script-src 'self' ו־worker-src 'none', ללא היתר WASM.

glTF Validator בגרסה ${cleanCell(validation.validatorVersion || 'המתועדת ב־gltf-validation.json')} בדק את כל המודלים והאנימציות. המאמת קורא כל קובץ בחבילה, מפענח GLB/JSON ותמונות ובודק תחביר JavaScript. בדיקת הדפדפן משרתת את תיקיית החבילה בלבד, טוענת את כל 90 הביצועים על שלוש הדמויות ודוגמת חמש נקודות זמן לכל קליפ. נבדק גם ניגון מתקדם. ניסיון WebAssembly.compile נדחה בפועל תחת CSP בזמן שהניגון ממשיך.

תצוגת מחשב: ${viewport(browser.desktop, 'desktop')}; תצוגת טלפון: ${viewport(browser.mobile, 'mobile')}. פרטי גלילה, בדיקות משטחי עור, שגיאות וטעינות ב־browser.json. רינדור האימות משתמש ב־SwiftShader; אין כאן מדידת FPS או הבטחת ביצועים בחומרת טלפון.

## גבולות המדידה ושחזור

נטיעה נמדדת ב־120Hz רק כאשר שתי הדגימות השכנות מדווחות על אותו עוגן. מגע יד בין דגימות נמדד רק כאשר שתי הדגימות השכנות מדווחות על אותה יד במגע; רגעי מעבר מגע נבדקים בזמן האירועים. חזרת כדרור, קליטה והדיפה נמדדות בזמן האירוע על ערוצי ה־GLB. המדידה מתייחסת לסמני הסוליה וכף היד המוגדרים בפרופיל; בדיקת משטח מדגמית נפרדת מזהה השחתה רחבה.

העמידה והמסלולים תוכננו לכל פעולה, אך מדדי מגע ותקינות glTF לבדם אינם ציון לריאליזם. התצוגה והצילומים מיועדים לביקורת תנועה. מקבל מסירה ולחץ הגנתי מיוצגים כסמני יעד/הקשר; החבילה אינה סימולציית מגע בין שחקנים. חיבור בין קליפים דורש יישור שורש ושימור עוגן אחרי ערבוב, ולעיתים IK נוסף. חזרת מהלך חד־פעמי בתצוגה היא איפוס סקירה ואינה מעבר חלק בעולם.

הוראות שחזור וגרסאות הכלים ב־[source/README.md](source/README.md). אחרי יצירת הדוח יש להריץ שוב source/verify.mjs כדי לקרוא גם את כל קובצי התיעוד והרישוי הסופיים. [LICENSES.md](LICENSES.md) מונה מקור ורישיון לכל קובץ. כל הנכסים והתנועות מקוריים/CC0; תלויות התוכנה Three.js מסומנות בנפרד ב־MIT ונושאות את הודעת הרישיון המקורית.
`;

await fs.writeFile(path.join(ROOT, 'REPORT.md'), report);
// Include both documentation outputs themselves without circular content hashes.
await fs.writeFile(path.join(ROOT, 'LICENSES.md'), '');
async function inventory(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(filename));
    else files.push(path.relative(ROOT, filename).split(path.sep).join('/'));
  }
  return files.sort();
}
const paths = await inventory(ROOT);
const v10Source = relative => `[hoops-motion-v10/${relative}](${assetURL(V10_COMMIT, 'hoops-motion-v10', relative)})`;
const vendorSources = {
  'runtime/vendor/three.module.js': 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js',
  'runtime/vendor/GLTFLoader.js': 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js',
  'runtime/vendor/BufferGeometryUtils.js': 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/utils/BufferGeometryUtils.js',
  'runtime/vendor/THREE-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/three@0.160.1/LICENSE',
};
let licenses = `# רישיונות ומקורות — hoops-motion-v11

הנכסים, הכוריאוגרפיה, קוד המקור המקורי, התצוגה, התיעוד והמדידות שנוצרו למסירה זו מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ההקדשה חלה ככל שהדין מאפשר; נוסח CC0 המלא בקישור. הדמויות בדויות. אין מותגים, סמלי קבוצות או דמויות של אנשים אמיתיים. אין שימוש במוקאפ או בסריקה של אדם אמיתי.

תלויות התוכנה Three.js הן ב־MIT ואינן מוצגות כ־CC0. הודעת הזכויות והרישיון המלאה נשמרת ב־[runtime/vendor/THREE-LICENSE.txt](runtime/vendor/THREE-LICENSE.txt). ההפרדה הזו מתייחסת לקוד התוכנה; כל נכסי האמנות והתנועה מקוריים/CC0.

## מקור קפוא של הדמויות

שלושת קובצי runtime/models והקובץ runtime/rig.json הועתקו ללא שינוי מ־[hoops-tall-v1 בקומיט ${TALL_COMMIT}](${REPO}/tree/${TALL_COMMIT}/${DESIGN}/hoops-tall-v1). המודלים הם עותקי runtime הבלתי דחוסים מהמקור. הגיבובים נמצאים בפרופילי runtime/rig.json וב־verification/measurements.json. [רישיון המקור המלא](${assetURL(TALL_COMMIT, 'hoops-tall-v1', 'LICENSES.md')}).

גוף, פנים, עור ועיניים: ליבת MakeHuman/MPFB, לפי [דף הרישוי הרשמי](https://static.makehumancommunity.org/about/license.html): “All core assets are shared under Creative Commons, CC0”. מקור הביניים הוא hoops-v7/characters/models/pg-lod1.glb, SHA-256 4f9ee0fc5b7d08836981483d279dc7025b417501486268797995478b8a9dd651. גזרת הגופייה מבוססת על authored-sewn-jersey המקורי של המאגר. השיער, הנעליים, המכנסיים, שינויי המידות והמשקולות והאזורים החדשים באטלס נוצרו ב־hoops-tall-v1 ונמסרו שם ב־CC0. לא נוספו נכסי לבוש מסחריים. נתוני הקשירה נשענים על השלד הקנוני של motion2 עם מידות tall.

## מקור התנועה והקוד

30 המהלכים החדשים נוצרו כמטרות תנועה ואילוצים ב־source/author.mjs ונפתרו לכל פרופיל בנפרד. קוד המתמטיקה, יצואן האנימציה ומסגרת האימות נשענים על הקוד המקורי CC0 ב־[hoops-motion-v10 בקומיט ${V10_COMMIT}](${REPO}/tree/${V10_COMMIT}/${DESIGN}/hoops-motion-v10). המקור המדויק מצוין לכל קובץ בטבלה. אין כאן העברה של רישיון חדש לקובצי מקור קיימים מחוץ לתיקייה.

## תלויות תוכנה וכלים

Three.js 0.160.1, GLTFLoader ו־BufferGeometryUtils מופצים כאן מקומית ב־MIT. ייבואי המודולים מותאמים לנתיבים המקומיים בחבילה. מקורות חבילה קפואי־גרסה מצוינים לכל קובץ בטבלה. הודעת MIT נשמרת ללא שינוי. התצוגה אינה טוענת ספריות, מודלים או תמונות משירות חיצוני בזמן הריצה.

כלי הפיתוח @gltf-transform/core 4.2.1, gltf-validator 2.0.0-dev.3.10, Playwright 1.56.1 ו־Sharp 0.35.5 מותקנים ב־/tmp/hoops-v11-tools בלבד. קוד הכלים אינו חלק מהנכסים המופצים ואינו נכלל בהקדשת CC0 של החבילה. גרסת three בכלי הפיתוח היא 0.160.1, תואמת לספרייה המקומית.

## מקור ורישיון לכל קובץ

המלאי הבא נוצר מסריקת הקבצים הקיימים בפועל בתיקיית החבילה, כולל מסמכי הרישוי והמדידה עצמם.

| קובץ | מקור | רישיון |
|---|---|---|
`;
for (const relative of paths) {
  let source = 'יצירה מקורית למסירת v11';
  let license = 'CC0-1.0';
  if (vendorSources[relative]) {
    source = `[Three.js 0.160.1 — מקור תוכנה](${vendorSources[relative]})${relative==='runtime/vendor/three.module.js' ? '; עותק מקומי עם תיקון רווח לבן בלבד' : relative.endsWith('.js') ? '; עותק מקומי, ייבואי מודולים מותאמים לנתיבים בחבילה' : '; הודעת זכויות ורישיון מקורית'}; copyright three.js authors`;
    license = '[MIT](runtime/vendor/THREE-LICENSE.txt)';
  } else if (relative.startsWith('runtime/models/')) {
    source = `[עותק runtime זהה מ־hoops-tall-v1](${assetURL(TALL_COMMIT, 'hoops-tall-v1', `runtime/${path.basename(relative)}`)}) — ליבת MakeHuman CC0 ותוספות tall מקוריות, כמפורט לעיל`;
  } else if (relative === 'runtime/rig.json') {
    source = `[עותק זהה של rig.json מ־hoops-tall-v1](${assetURL(TALL_COMMIT, 'hoops-tall-v1', 'rig.json')}) — מידות ושלד CC0`;
  } else if (relative.startsWith('runtime/keyframes/')) {
    source = 'כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs';
  } else if (relative.startsWith('runtime/clips/')) {
    source = 'יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית';
  } else if (relative === 'runtime/catalog.json') {
    source = 'קטלוג מהלכים מקורי — source/author.mjs; מידות ומטא־נתוני פרופילים מ־hoops-tall-v1 CC0';
  } else if (relative === 'runtime/math.mjs') {
    source = `העתק/התאמה של קוד מתמטיקה מקורי CC0 — ${v10Source('runtime/math.mjs')}`;
  } else if (relative === 'source/export-glb.mjs' || relative === 'source/verify.mjs' || relative === 'source/verify-browser.mjs' || relative === 'source/document.mjs') {
    source = `התאמה והרחבה למסירת v11 של קוד מקורי CC0 — ${v10Source(relative)}`;
  } else if (['preview.html', 'preview.css', 'preview.mjs'].includes(relative)) {
    source = `תצוגת v11 מקורית; תשתית ניגון/ממשק הותאמה מ־${v10Source(relative)}`;
  } else if (relative.startsWith('verification/')) {
    source = relative === 'verification/motion-continuity.json'
      ? 'מדידת רציפות מקורית ובלתי תלויה ב־FK של החבילה — source/audit-motion.mjs; גיבובי הקלט בכל שורה'
      : relative.endsWith('.png')
      ? 'צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs'
      : 'מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs';
  }
  licenses += `| [${relative}](${relative}) | ${source} | ${license} |\n`;
}
await fs.writeFile(path.join(ROOT, 'LICENSES.md'), licenses);
console.log(`Documented ${paths.length} files and ${rows.length} measured performances; asset audit, browser audit and WASM block all pass.`);
