/** CC0-1.0. Original v11 Hebrew report and exhaustive provenance inventory.
 * Never promotes absent, failing or stale measurements to a passing report.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const base=new URL('../',import.meta.url),root=fileURLToPath(base);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const readBytes=p=>fs.readFile(new URL(p,base));
const read=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const optional=async p=>{try{return await read(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const catalog=await read('runtime/catalog.json');
const [metrics,validator,browser,surfaces,calibration,provenance,smoothing]=await Promise.all([
 optional('verification/metrics.json'),optional('verification/validator.json'),
 optional('verification/browser.json'),optional('verification/contact-surfaces.json'),
 optional('verification/contact-calibration.json'),optional('verification/provenance.json'),optional('verification/path-smoothing.json')
]);
const catalogSha256=sha256(await readBytes('runtime/catalog.json'));
const motionSha256=sha256(await readBytes('runtime/motions.json'));
const clips=catalog.clips??[],references=catalog.references??[],assets=[...clips,...references];
const assetHashes=new Map();
for(const asset of assets){
 const file=`runtime/${asset.asset}`,bytes=await readBytes(file),hash=sha256(bytes);
 assetHashes.set(asset.id,hash);
 if(asset.sha256&&asset.sha256!==hash)throw Error(`Catalog hash mismatch: ${file}`);
}
const problems=[];
for(const [name,evidence]of [['בדיקה מספרית',metrics],['glTF validator',validator],['דפדפן',browser],['משטח מונפש',surfaces],['החלקת מסלול כדרור',smoothing]]){
 if(!evidence)problems.push(`${name}: ראיות חסרות`);
 else if(evidence.pass!==true)problems.push(`${name}: הבדיקה לא עברה`);
 if(evidence?.catalogSha256&&evidence.catalogSha256!==catalogSha256)problems.push(`${name}: SHA-256 של הקטלוג אינו תואם`);
}
if(metrics&&!metrics.catalogSha256)problems.push('בדיקה מספרית: חסר SHA-256 של הקטלוג');
if(browser&&!browser.catalogSha256)problems.push('דפדפן: חסר SHA-256 של הקטלוג');
if(browser?.catalogStable===false||metrics?.catalogStable===false)problems.push('הקטלוג השתנה במהלך מדידה');
if(catalog.sourceMotionSha256!==motionSha256)problems.push('קובץ התנועה השתנה אחרי האפייה');
if(!calibration?.outputMotionSha256||calibration.outputMotionSha256!==smoothing?.sourceMotionSha256||smoothing?.outputMotionSha256!==motionSha256)problems.push('שרשרת כיול–החלקה–אפייה אינה תואמת לקובץ התנועה');
if(smoothing?.nativeMotionFramesUnchanged!==true||(smoothing?.clips??[]).some(c=>!c.unchanged&&c.maxContactCenterChangeMeters!==0))problems.push('החלקת המסלול שינתה פוזה או מרכז מגע');
if(calibration?.nativeMotionFramesUnchanged===false)problems.push('כיול המגע שינה פוזות מקור');
for(const item of surfaces?.clips??[]){
 const expected=assetHashes.get(item.id);
 if(expected&&item.assetSha256&&item.assetSha256!==expected)problems.push(`משטח מונפש: נכס מיושן ${item.id}`);
}
const normalizeAsset=p=>String(p??'').replace(/^\.\//,'').replace(/^runtime\//,'');
const transitionPass=audit=>audit?.pass===false?false:audit?.finite===true&&Number.isFinite(audit.maxPoseJumpMeters)&&audit.maxPoseJumpMeters<=.001;
const hasBallPath=clip=>!!(clip.ball?.samples?.length||clip.ball?.keys?.length);
const loopPass=audit=>!!audit&&Number.isFinite(audit.maxPoseJumpMeters)&&audit.maxPoseJumpMeters<=.001&&Number.isFinite(audit.closurePlantSlipMeters)&&audit.closurePlantSlipMeters<=.02&&Number.isFinite(audit.maxBallJumpMeters)&&audit.maxBallJumpMeters<=.001;
for(const asset of assets){
 const load=browser?.loads?.find(r=>r.id===asset.id||r.id===`reference/${asset.id}`||normalizeAsset(r.asset??r.file??r.url)===asset.asset);
 if(browser&&(!load||load.loaded!==true||load.sha256!==assetHashes.get(asset.id)))problems.push(`דפדפן: חסרה טעינה תואמת SHA-256 עבור ${asset.id}`);
 const validation=validator?.files?.find(r=>normalizeAsset(r.asset??r.file)===asset.asset||r.id===asset.id);
 if(validator&&(!validation||validation.sha256!==assetHashes.get(asset.id)))problems.push(`validator: חסרה ראיה תואמת SHA-256 עבור ${asset.id}`);
}
for(const clip of clips){
 const playback=browser?.playback?.find(row=>row.id===clip.id);
 if(browser&&!['v9','v10'].every(version=>transitionPass(playback?.transitions?.[version])))problems.push(`דפדפן: מעבר שלא עבר בשתי הגרסאות עבור ${clip.id}`);
 if(browser&&!loopPass(playback?.loop??playback?.loopAudit))problems.push(`דפדפן: חסרה בדיקת סגירת לולאת סקירה עוברת עבור ${clip.id}`);
 if(surfaces&&hasBallPath(clip)){
  const surface=surfaces.clips?.find(row=>row.id===clip.id);
  if(!surface||surface.pass!==true||surface.assetSha256!==assetHashes.get(clip.id))problems.push(`משטח מונפש: חסרה בדיקה עוברת תואמת SHA-256 עבור ${clip.id}`);
 }
}
const passed=problems.length===0;
const numeric=metrics?.summary??{},skin=surfaces?.summary??{};
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const n=(value,digits=3)=>finite(value)?value.toFixed(digits):'—';
const cm=value=>finite(value)?n(value*100):'—';
const mm=value=>finite(value)?n(value*1000):'—';
const max=values=>{const found=values.filter(finite);return found.length?Math.max(...found):undefined;};
const status=value=>value===true?'PASS':value===false?'FAIL':'חסר';
const text=value=>(value!==null&&typeof value==='object'?JSON.stringify(value):String(value??'—')).replaceAll('|',' / ').replaceAll('\n',' ');
const categoryNames={dribble:'כדרור ושליטה',pass:'מסירות',shot:'בעיטות',tackle:'תיקולים והגנה',defense:'תיקולים והגנה',header:'נגיחות',set_piece:'כדורים נייחים',setpiece:'כדורים נייחים',keeper:'שוער',celebration:'חגיגות'};
const categoryRows=[...new Set(clips.map(c=>c.category))].map(category=>{
 const entries=clips.filter(c=>c.category===category);
 return `| ${text(categoryNames[category]??category)} | ${entries.length} | ${entries.map(c=>`[${c.id}](runtime/${c.asset})`).join(', ')} |`;
});
const matchSummary=item=>{
 if(item===null||typeof item!=='object')return String(item);
 if(item.id&&finite(item.actualDegrees))return `${item.id}: ${n(item.actualDegrees,2)}° (Δ ${n(item.errorDegrees,2)}°)`;
 return item.id??JSON.stringify(item);
};
const coverageRows=(metrics?.coverage?.checks??[]).map(c=>`| ${text(c.requirement)} | ${status(c.pass)} | ${text(Array.isArray(c.matched)?c.matched.map(matchSummary).join(', '):c.matched)} |`);
const metricRows=clips.map(c=>{
 const r=metrics?.clips?.find(item=>item.id===c.id),events=c.events??[];
 const contacts=events.filter(e=>e.ballContact===true),shown=contacts.length?contacts:events;
 const contact=shown.map(e=>`${e.frame} · ${e.event??e.type??'מגע'} · ${e.bone??'—'}`).join('<br>')||'—';
 const distance=max(events.map(e=>e.distanceMeters));
 const cadence=r?.cadence;
 const rate=max([r?.rateErrorPercent,cadence?.touchRateErrorPercent,cadence?.stepRateErrorPercent,cadence?.speedErrorPercent]);
 const boundary=version=>`${cm(r?.entry?.[version]?.maxJointM)} / ${cm(r?.exit?.[version]?.maxJointM)}`;
 const validation=validator?.files?.find(v=>normalizeAsset(v.asset??v.file)===c.asset||v.id===c.id);
 const loaded=browser?.loads?.find(v=>v.id===c.id);
 const surface=surfaces?.clips?.find(item=>item.id===c.id),playback=browser?.playback?.find(item=>item.id===c.id);
 const skinPass=!hasBallPath(c)||(surface?.pass===true&&surface.assetSha256===assetHashes.get(c.id));
 const transitionsPass=['v9','v10'].every(version=>transitionPass(playback?.transitions?.[version]));
 const plantMaximum=max([r?.maxSlidingM,...(r?.inferredGroundContacts??[]).filter(v=>!v.intentionalSlide).map(v=>v.slidingM),(playback?.loop??playback?.loopAudit)?.closurePlantSlipMeters]);
 const rowStatus=r?.pass===true&&loaded?.loaded===true&&loaded.sha256===assetHashes.get(c.id)&&validation?.errors===0&&skinPass&&transitionsPass&&loopPass(playback?.loop??playback?.loopAudit);
 return `| [${c.id}](runtime/${c.asset}) | ${n(c.duration)} | ${contact} | ${n(distance,2)} | ${cm(plantMaximum)} | ${n(rate,5)} | ${boundary('v9')} | ${boundary('v10')} | ${validation?`${validation.errors} / ${validation.warnings}`:'—'} | ${status(rowStatus)} |`;
});
const dribbleRows=(metrics?.clips??[]).filter(r=>r.cadence).map(r=>{
 const c=r.cadence;
 return `| ${r.id} | ${n(c.targetStepHz)} / ${n(c.measuredStepHz)} | ${n(c.targetTouchHz)} / ${n(c.measuredTouchHz)} | ${n(c.targetSpeedMps)} / ${n(c.medianPathSpeedMps)} | ${n(c.meanPathSpeedMps)} | ${n(c.window?.start)}–${n(c.window?.end)} | ${n(max([c.stepRateErrorPercent,c.touchRateErrorPercent,c.speedErrorPercent]),5)} | ${c.everyStepHasTouch?'כן':'לא'} |`;
});
const failures=(metrics?.clips??[]).filter(c=>!c.pass).map(c=>`${c.id}: ${(c.failures??[]).map(text).join('; ')}`);
const warnings=validator?.files?.flatMap(f=>(f.messages??[]).filter(m=>m.severity===1).map(m=>m.code))??[];
const warningCodes=[...new Set(warnings)];
const transitionRows=(browser?.playback??[]).map(r=>{
 const a=r.transitions?.v9,b=r.transitions?.v10;
 return `| ${r.id} | ${n(a?.maxPoseJumpMeters,9)} | ${n(b?.maxPoseJumpMeters,9)} | ${n(a?.maxJointVelocityJumpMetersPerSecond)} / ${n(b?.maxJointVelocityJumpMetersPerSecond)} | ${n(a?.maxRootVelocityJumpMetersPerSecond)} / ${n(b?.maxRootVelocityJumpMetersPerSecond)} | ${status(transitionPass(a)&&transitionPass(b))} |`;
});
const maximumSolePenetrationM=numeric.maxSolePenetrationM??numeric.maximumSolePenetrationM??max((metrics?.clips??[]).map(row=>row.maximumSolePenetrationM));
const maxDribbleRatePercent=max([numeric.maxDribbleRateErrorPercent,...(metrics?.clips??[]).flatMap(row=>[row.cadence?.touchRateErrorPercent,row.cadence?.stepRateErrorPercent,row.cadence?.speedErrorPercent])]);
const minimumSoleHeightM=numeric.minimumSoleHeightM??((metrics?.clips??[]).length?Math.min(...metrics.clips.map(row=>row.minSoleHeightM).filter(finite)):undefined);
const loopAudits=(browser?.playback??[]).map(row=>row.loop??row.loopAudit).filter(Boolean);
const loopBlendSeconds=browser?.loopSummary?.loopBlendSeconds??loopAudits[0]?.loopBlendSeconds??browser?.playback?.[0]?.modes?.[0]?.snapshots?.[0]?.loopBlendSeconds;
const maxLoopPoseJumpM=browser?.loopSummary?.maxPoseJumpMeters??max(loopAudits.map(row=>row.maxPoseJumpMeters));
const floorLoopRows=clips.map(clip=>{
 const row=metrics?.clips?.find(item=>item.id===clip.id),playback=browser?.playback?.find(item=>item.id===clip.id),loop=playback?.loop??playback?.loopAudit;
 return `| ${clip.id} | ${mm(row?.minSoleHeightM)} | ${cm(row?.loopSeam?.maxJointM)} | ${n(row?.loopSeam?.maxRotationDeg)} | ${text(loop?.closureKind)} / ${n(loop?.loopBlendSeconds)} | ${mm(loop?.maxPoseJumpMeters)} | ${cm(loop?.closurePlantSlipMeters)} | ${mm(loop?.maxBallJumpMeters)} |`;
});
const report=`# דוח כדורגל v11

${clips.length} קליפים, ${references.length} קליפי ייחוס, שלד motion2 בן 18 עצמות ו־${catalog.nativeRate??30}Hz. התוצרים נמסרים בקבצים חדשים תחת <code>soccer-motion-v11/</code> בלבד. מצב שערי המסירה: **${passed?'PASS':'FAIL / חסר אימות'}**. נבדקו הנכסים שמזהה הקטלוג שלהם הוא <code>${catalogSha256}</code>.

${passed?'הראיות המספריות, מאמת glTF, בדיקות המשטח והדפדפן עברו עבור הנכסים הנוכחיים.':`אין להציג את החבילה כעוברת את כל הדרישות. הבעיות הידועות:\n\n${problems.map(p=>`- ${p}`).join('\n')}`}

## מדידות מרכזיות

| דרישה | מדידה בפועל | מצב |
|---|---|---|
| החלקת נטיעה עד 2 ס״מ | מרב כולל פעולות וסגירות סקירה ${cm(max([numeric.maxSlidingM,numeric.maxInferredSlidingM,browser?.loopSummary?.maxClosurePlantSlipMeters]))} ס״מ. חלונות נטיעה מוצהרים, מרכז/קדמה/עקב ב־120Hz: ${cm(numeric.maxSlidingM)} ס״מ; שגיאת עוגן ${cm(numeric.maxAnchorErrorM)} ס״מ; החלקה בחלונות קרקע שהוסקו מהנכס ${cm(numeric.maxInferredSlidingM)} ס״מ | ${status(metrics?.pass)} |
| שגיאת קצב עד 5% | שעון מקור ${n(numeric.maxNativeRateErrorPercent,6)}%; כדרור, צעדים/נגיעות/מהירות ${n(maxDribbleRatePercent,6)}% | ${status(metrics?.pass)} |
| גובה סוליה מזערי | ${mm(minimumSoleHeightM)} מ״מ; חדירה מרבית ${mm(maximumSolePenetrationM)} מ״מ; סף הבדיקה ${mm(metrics?.limits?.maxSolePenetrationM)} מ״מ | נפרד מסף ההחלקה |
| רציפות גולמית מול v10 | מרב הפרש מפרק ${cm(numeric.maxV10BoundaryJointM)} ס״מ; הפרש מהירות ${n(numeric.maxV10BoundaryVelocityErrorMps)} מ׳/ש׳ | מדידה נפרדת מה־blend |
| רציפות גולמית מול v9 | מרב הפרש מפרק ${cm(numeric.maxV9RawBoundaryJointM)} ס״מ | הבדלי גרסאות נשמרים במדידה |
| רציפות מעבר מוצג מול שתי הגרסאות | מרב קפיצת פוזה ${n(browser?.transitionSummary?.maxPoseJumpMeters,9)} מ׳ | ${status(browser?.transitionSummary?.pass)} |
| לולאת תצוגה | משך סגירה ${n(browser?.loopSummary?.minClosureSeconds,3)}–${n(browser?.loopSummary?.maxClosureSeconds,3)} שנ׳; החלקת נטיעה בסגירה ${cm(browser?.loopSummary?.maxClosurePlantSlipMeters)} ס״מ; קפיצת פוזה ${mm(maxLoopPoseJumpM)} מ״מ; קפיצת כדור ${mm(browser?.loopSummary?.maxBallJumpMeters)} מ״מ | לולאת סקירה בלבד |
| אירוע מגע ומשטח מונפש | שגיאת רדיוס מרבית ${mm(skin.maxEventRadiusErrorMeters)} מ״מ | ${status(surfaces?.pass)} |
| החלקת כדרור בין מגעים | שינוי מהירות בין דגימות 120Hz: עד ${n(max((smoothing?.clips??[]).map(c=>c.maxOffContactVelocityStepMetersPerSecond)))} מ׳/ש׳; מרכזי מגע ופוזות לא השתנו | ${status(smoothing?.pass)} |
| מסלול כדור מול הרשת | חדירה מרבית בדגימות ${mm(skin.maxPathSkinPenetrationMeters)} מ״מ; מרווח החטאה מזערי ${n(skin.minMissClearanceMeters)} מ׳ | ${status(surfaces?.pass)} |
| Root נקי | <code>rootMotion:false</code>, Root זהות וללא ערוץ תרגום Root | ${status(metrics?.pass)} |
| כל ה־GLB ללא codec | ${browser?.loads?.length??0}/${assets.length} נטענו; חסימת WebAssembly בפועל: ${browser?.wasmBlocked?'כן':'לא הוכחה'} | ${status(browser?.pass)} |
| Khronos glTF validator | ${numeric.validatorErrors??'—'} שגיאות, ${numeric.validatorWarnings??'—'} אזהרות; ${validator?.files?.length??0}/${assets.length} קבצים | ${status(validator?.pass)} |

הקצב המספרי הוא תזמון הנכס ותדירות הצעדים והנגיעות לאורך מסלול הייחוס. הוא אינו מדידת FPS בטלפון או התאמה אוטומטית לכל מהירות של בקר המשחק.

## כיסוי הפעולות

| קטגוריה | קליפים | נכסים |
|---|---:|---|
${categoryRows.join('\n')}

| דרישת כיסוי | מצב | קליפים שנמצאו |
|---|---|---|
${coverageRows.join('\n')||'| בדיקת כיסוי | חסרה | — |'}

## טבלת מדידות לכל קליפ

גבולות הכניסה והיציאה הם הפרשי מפרק גולמיים מול אותו ייחוס, בס״מ, לפני blend. עמודת הנטיעה היא המרב בחלונות המוצהרים, במגעי קרקע שטוחים שהוסקו מהנכס ובסגירת הסקירה; גלישה מכוונת בתיקול מסומנת בנפרד. עמודת הקצב היא השגיאה המרבית של שעון הדגימות ושל מדדי הכדרור הרלוונטיים. מרחק הוא מסלול הכדור המוצהר באירוע, במטרים. באירוע שאינו נוגע בכדור מופיע סוג המגע האמיתי. עמודת המאמת מציגה שגיאות / אזהרות.

| קליפ | משך שנ׳ | פריים · אירוע · עצם | מרחק מ׳ | נטיעה ס״מ | קצב % | v9 כניסה / יציאה ס״מ | v10 כניסה / יציאה ס״מ | מאמת | מצב |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
${metricRows.join('\n')}

${failures.length?`כשלי בדיקה פרטניים:\n\n${failures.map(f=>`- ${f}`).join('\n')}\n`:''}
## קצב כדרור

| קליפ | צעדים Hz יעד / נמדד | נגיעות Hz יעד / נמדד | מהירות מ׳/ש׳ יעד / חציון מרכזי | ממוצע כל המסלול מ׳/ש׳ | חלון קצב שנ׳ | שגיאה מרבית % | נגיעה בכל צעד |
|---|---:|---:|---:|---:|---:|---:|---|
${dribbleRows.join('\n')||'| אין ראיות קצב זמינות | — | — | — | — | — | — | — |'}

המדידה משווה את לוח מגעי הכדור והצעדים ליעדים שהוכרזו. שגיאת המהירות מחושבת מחציון המהירות בחלון המרכזי המפורש של הכדרור; הממוצע של כל המסלול כולל את חיבורי הכניסה והיציאה ל־run, ומוצג בנפרד ללא טענה שהוא שווה ליעד המרכזי. <code>everyStepHasTouch</code> נבדק בנפרד מבדיקת מרווחי זמן של 30Hz. פרטי המדידה והספים לכל קליפ: [metrics.json](verification/metrics.json).

## שיטת הבדיקה ורציפות

[check.mjs](verification/check.mjs) קורא ערוצי float32 מה־GLB שנמסר באמצעות [reader.mjs](verification/reader.mjs), ומחשב slerp ו־FK ב־120Hz. נבדקים מרכז הסוליה, הקדמה והעקב לאורך חלונות התמיכה, עם מסלול הייחוס החיצוני פעם אחת. המדידה אינה מפעילה IK לתיקון הנכס. בקפיצות נמדד משך מעוף מתוך שתי הסוליות: מרב ${n(numeric.maxOrdinaryJumpFlightSeconds)} שנ׳ (סף ${n(metrics?.limits?.maxOrdinaryJumpFlightSeconds,2)} שנ׳); מרב עליית האגן ביחס לכניסה ${n(numeric.maxJumpHipsRiseM)} מ׳. מגע התנגשות גוף נבדק מול סמני העצמות של שתי הדמויות; בדיקת רשת מונפשת מתייחסת למגעי הכדור בלבד. בדיקות האירועים משוות זמן ופריים, עצם, נקודת מגע, רדיוס כדור ומרחק מסלול. שגיאות כיסוי, מגע, מבנה או נטיעה גורמות לכישלון מפורש.

ל־v9 ול־v10 יש פוזות בסיס שונות. המדידה הגולמית בשתי הגרסאות נשמרת ב־<code>entry</code> ו־<code>exit</code>, כולל הפרשי סיבוב ומהירות. נגן התצוגה משתמש ב־blend מפורש כאשר הוא מחבר את הפעולה לייחוס שנבחר. רציפות ה־blend נבדקת מהפוזה המוצגת משני צדדי הגבול; היא אינה מוחקת את הפרשי הפוזה הגולמיים מהדוח.

| קליפ | קפיצת פוזה v9 מ׳ | קפיצת פוזה v10 מ׳ | שינוי מהירות מפרק v9 / v10 מ׳/ש׳ | שינוי מהירות מסלול v9 / v10 מ׳/ש׳ | מעבר C0 |
|---|---:|---:|---:|---:|---|
${transitionRows.join('\n')||'| אין עדיין ראיות דפדפן | — | — | — | — | חסר |'}

מהירויות המעבר הן אבחון הפרש מהירות חד־צדדי באמצעות הפרשים סופיים ב־120Hz; הן אינן מדד תאוצה, רציפות C1 או ציון טבעיות. הסף הדפדפני של 1 מ״מ חל על קפיצת הפוזה C0 בלבד, והמספרים של שינויי המהירות נשמרים ללא סף טבעיות שלא הוגדר.

## רצפה ולולאת סקירה

כל ${clips.filter(clip=>!clip.loop).length} הקליפים שבהם <code>loop:false</code> הם פעולות מקור חד־פעמיות. נגן הסקירה ממשיך את קליפי התנועה באמצעות יתרת מחזור הריצה המקורי של v10 (${n(browser?.loopSummary?.maxClosureSeconds,3)} שנ׳), ואת הפעולות מעמידה באמצעות מעבר פוזה קצר (${n(browser?.loopSummary?.minClosureSeconds,3)} שנ׳); הכדור ממשיך להופיע בהמשך הריצה. ההמשכים צוברים מיקום וסיבוב בין מחזורים, כדי שהתנועה לא תחזור לאחור. אין כאן טענה למחזור טבעי של קליפ ה־GLB עצמו. פער הסוף–התחלה המקורי נמדד בנפרד בטבלה הבאה, ואינו מוסתר על ידי ערבוב התצוגה. בחיבור למשחק יש לסיים את הפעולה או להגדיר מעבר מתאים, ולא להניח שאפשר לחזור על הנכס כמחזור הליכה.

גובה הסוליה מחושב ממרכז, קדמה ועקב ב־120Hz ביחס למישור הקרקע. ערך שלילי הוא חדירה מדודה, בנפרד מהחלקה אופקית. פער סיבוב במחזור הוא מרב הפרש סיבוב מפרק מקומי בין סוף הנכס לתחילתו.

| קליפ | גובה סוליה מזערי מ״מ | פער מחזור מקור ס״מ | פער סיבוב מחזור מקור ° | סוג / משך סגירה שנ׳ | קפיצת פוזת סקירה מ״מ | נטיעה בסגירה ס״מ | קפיצת כדור בסגירה מ״מ |
|---|---:|---:|---:|---|---:|---:|---:|
${floorLoopRows.join('\n')}

[contact-surfaces.json](verification/contact-surfaces.json) מודד מגעים ומסלולי כדור מול הרשת המונפשת, בנפרד מבדיקת נקודת העצם. הכיול משנה סמנים ומסלול כדור; מצב שמירת פוזות המקור: ${calibration?status(calibration.nativeMotionFramesUnchanged):'לא נמדד'}. ראיות הכיול ב־[contact-calibration.json](verification/contact-calibration.json). לאחר הכיול הוחלקו מסלולי הכדרור בין המגעים, עם שמירה מלאה על מרכזי המגע ופוזות הגוף; שרשרת ה־SHA-256 ותוצאות החלקת המסלול ב־[path-smoothing.json](verification/path-smoothing.json). מספר דגימות מסלול ומרווחי החטאה נשמרים לכל קליפ; מגע כדור אינו מומצא בהחטאות או בחגיגות.

## טעינה ודפדפן

[browser.json](verification/browser.json) מתעד טעינה ללא decoder, פענוח טקסטורות, הפעלת כל קליפ בלולאה ובמעברים מול v9 ומול v10, ונסיון יצירת WebAssembly תחת ה־CSP. נטענו ${browser?.loads?.length??0} קבצים ונבדקו ${browser?.playback?.length??0} קליפים; שגיאות דף: ${browser?.pageErrors?.length??'—'}; בקשות שנכשלו: ${browser?.requestFailures?.length??'—'}. אלה בדיקות Chromium בסביבת העבודה, ללא טענת ביצועים במכשיר קצה.

${(browser?.screenshots??[]).map(s=>`![תצוגה ${s.width}×${s.height}](verification/${s.file})`).join('\n\n')}

פירוט המאמת ב־[validator.json](verification/validator.json). ${warningCodes.length?`קודי האזהרה שנמצאו: ${warningCodes.map(c=>`\`${c}\``).join(', ')}.`:'קודי האזהרה, אם קיימים, נשמרים בפלט המאמת עצמו.'} אזהרה אינה מוצגת כשגיאה, וכשל אינו מוצג כהצלחה.

## מקור, שחזור והמשך חיבור

הדמויות בדיוניות והנכסים החדשים מוקדשים ל־CC0-1.0; המקור והרישיון לכל קובץ ב־[LICENSES.md](LICENSES.md), ומזהי התוכן ב־[files.json](verification/files.json). הגאומטריה מגיעה מהעותקים הלא דחוסים של v10; שורש המקור הוא נכסי MakeHuman CC0 של v8. פוזות הייחוס v9 מגיעות מקומיט <code>5d516207d66cdf91af062b93142e04c6dcbae131</code>, דרך האפייה הלא דחוסה של v10. פרטי מקורות, commits ו־SHA-256: [provenance.json](verification/provenance.json).

הנגן והמתמטיקה משתמשים בתלות three.js MIT שכבר קיימת במאגר; אין vendor חדש בחבילה. לא נעשה שימוש בפענוח Draco או meshopt בזמן הריצה. שחזור והוראות צפייה: [README.md](README.md).

זו חבילת נכסים שממתינה לחיבור ולבדיקת תחושת המשחק. לא שונו קוד משחק, <code>release.json</code>, <code>release.mjs</code>, תגי גרסה, <code>CLAUDE.md</code>, ‏<code>ops</code> או בדיקות קיימות. אין מדידה של משחק מלא, השפעה על AI, FPS בטלפון או שיפור שכבר הגיע למשחק. יש למדוד שוב לאחר החיבור לבקר ולכדור בפועל.
`;
await fs.writeFile(new URL('REPORT.md',base),report);

async function walk(directory){
 const files=[];
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const filename=path.join(directory,entry.name);
  files.push(...(entry.isDirectory()?await walk(filename):[path.relative(root,filename).split(path.sep).join('/')]));
 }
 return files;
}
let files=await walk(root);
for(const name of ['LICENSES.md','verification/files.json'])if(!files.includes(name))files.push(name);
files.sort();
const sourceRegistry=new Map();
async function sourceRecord(id,relative,note){
 if(sourceRegistry.has(id))return id;
 try{
  const bytes=await fs.readFile(new URL(relative,base));
  sourceRegistry.set(id,{id,path:relative,sha256:sha256(bytes),license:'CC0-1.0',note});
 }catch(error){if(error.code!=='ENOENT')throw error;sourceRegistry.set(id,{id,path:relative,license:'CC0-1.0',note:note+'; source file not present in this sparse checkout'});}
 return id;
}
const adapted={
 'source/rig.mjs':'source/rig.mjs','source/glb.mjs':'source/glb.mjs','source/bake.mjs':'source/bake.mjs',
 'source/calibrate.mjs':'source/calibrate.mjs','runtime/player.mjs':'runtime/player.mjs',
 'preview.html':'preview.html','preview.css':'preview.css','preview.mjs':'preview.mjs',
 'verification/browser-check.mjs':'verification/browser-check.mjs'
};
for(const [file,origin]of Object.entries(adapted))if(files.includes(file))await sourceRecord('v10:'+origin,`../soccer-motion-v10/${origin}`,'Existing CC0 v10 code/design adapted for v11');
for(const file of ['source/author.mjs','source/bake.mjs','source/calibrate.mjs','verification/check.mjs','verification/reader.mjs','verification/surfaces.mjs','verification/browser-check.mjs','verification/integrity.mjs','source/report.mjs'])if(files.includes(file))await sourceRecord('v11:'+file,file,'Original v11 authoring, processing or evidence generator');
await sourceRecord('v10:motion-source','../soccer-motion-v10/runtime/motions.json','CC0 v10 boundary poses sampled offline by v11 authoring');
for(const source of provenance?.sources??[]){
 const id=`geometry:${source.role}`;
 sourceRegistry.set(id,{id,path:source.path,sha256:source.sha256,license:source.license??'CC0-1.0',note:'Already decoded fictional v10 geometry, skin, materials and embedded images; ultimately MakeHuman CC0 v8'});
}
for(const reference of provenance?.references??[]){
 const id=`reference:${reference.id}`;
 sourceRegistry.set(id,{id,path:reference.source,sha256:reference.sha256,license:reference.license??'CC0-1.0',nativeSource:reference.nativeSource,note:'Decoded canonical reference animation; exact upstream path and content hash from bake provenance'});
}
function sourceFor(file){
 if(file.startsWith('runtime/clips/')){
  const clip=clips.find(c=>`runtime/${c.asset}`===file),role=clip?.role==='keeper'?'keeper':'field';
  return {description:'Original v11 motion, contact calibration and binary bake on existing CC0 fictional geometry',sources:['v11:source/author.mjs','v11:source/calibrate.mjs','v11:source/bake.mjs','v10:motion-source',`geometry:${role}`]};
 }
 if(file.startsWith('runtime/reference/')){
  const reference=references.find(r=>`runtime/${r.asset}`===file);
  return {description:'Decoded CC0 reference; native v9/v10 identity preserved in provenance',sources:[`reference:${reference?.id??path.basename(file,'.glb')}`]};
 }
 if(file==='runtime/motions.json'||file==='runtime/catalog.json')return {description:'Original v11 motion and metadata; CC0 v10 reference poses and geometry documented separately',sources:['v11:source/author.mjs','v11:source/calibrate.mjs','v11:source/bake.mjs','v10:motion-source']};
 if(adapted[file])return {description:'CC0 v10 source adapted for this v11 delivery',sources:['v10:'+adapted[file]]};
 if(file==='verification/metrics.json'||file==='verification/validator.json')return {description:'Measured evidence from delivered GLBs; validator is an external development tool',sources:['v11:verification/check.mjs','v11:verification/reader.mjs']};
 if(file==='verification/contact-surfaces.json')return {description:'Measured skinned-mesh and ball-path evidence from delivered GLBs',sources:['v11:verification/surfaces.mjs']};
 if(file==='verification/path-smoothing.json')return {description:'Original constrained dribble-path smoothing evidence, exact fixed contacts and input/output motion hash chain',sources:['v11:source/calibrate.mjs','v11:verification/surfaces.mjs']};
 if(file==='verification/contact-calibration.json')return {description:'Original calibration record; source/output motion hashes and unchanged-pose declaration',sources:['v11:source/calibrate.mjs']};
 if(file==='verification/browser.json'||/\.(png|webp)$/.test(file))return {description:'Original rendered evidence of fictional CC0 assets in the original v11 preview; no external image source',sources:['v11:verification/browser-check.mjs']};
 if(['REPORT.md','LICENSES.md','verification/files.json'].includes(file))return {description:'Original v11 documentation/provenance generated from current delivered files and measurements',sources:['v11:source/report.mjs']};
 if(file==='verification/provenance.json')return {description:'Exact upstream source paths, commits and content hashes recorded during binary bake',sources:['v11:source/bake.mjs']};
 return {description:'Original v11 code, choreography, design or documentation authored for this task',sources:[]};
}
const registry=[...sourceRegistry.values()].sort((a,b)=>a.id.localeCompare(b.id));
const licenses=`# רישיונות ומקור לכל קובץ · v11

כל התוכן המקורי והמעובד בתיקייה הזאת — אנימציות, גאומטריה קיימת שהותרה לשימוש, סמנים, מסלולי כדור, קוד, עיצוב, תיעוד ותמונות ראיות — מוקדש לנחלת הכלל תחת **CC0-1.0**. [הנוסח המשפטי של CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). הקבצים אינם כוללים מותגים, אנשים אמיתיים, תמונות חיצוניות או צילום תנועה מיובא.

הגאומטריה היא דמויות v10 הבדיוניות, המבוססות על MakeHuman hm08 ונכסי מערכת CC0 של v8. [רישיון המקור הקיים](../soccer-motion-v8/LICENSE.md). הנכסים של v11 שומרים skin, חומרים וטקסטורות של המקור הלא דחוס; אין Draco או meshopt בנכסי הריצה. פוזות v9 מקורן בקומיט <code>5d516207d66cdf91af062b93142e04c6dcbae131</code>, והן נמסרות דרך אפיית הייחוס הלא דחוסה של v10. [provenance.json](verification/provenance.json) מכיל נתיבי מקור ו־SHA-256 מדויקים.

אין עותק של ספריית צד שלישי בתיקיית v11. three.js, ‏GLTFLoader ו־SkeletonUtils הם תלות קיימת מחוץ לתיקייה, ברישיון MIT: [הודעת הרישיון הקיימת](../soccer-motion-v8/runtime/vendor/LICENSE.three). רישיון MIT שלה אינו מוחלף ב־CC0. כלי Khronos gltf-validator ו־Playwright הם כלי פיתוח מותקנים בנפרד ואינם קבצים במסירה. צינור v11 קורא גאומטריה שכבר פוענחה; אינו זקוק לפענוח Draco.

## רישום מקורות

מזהי המקור בטבלה הבאה משמשים ברשימת כל הקבצים. SHA-256 מזהה את הקובץ שנקרא במהלך ההפקה או המדידה. קוד מקורי של v11 שמופיע גם כמפיק נשאר CC0-1.0.

| מזהה מקור | נתיב מדויק | SHA-256 | רישיון | שימוש |
|---|---|---|---|---|
${registry.map(s=>`| ${text(s.id)} | ${text(s.path)} | ${s.sha256?`\`${s.sha256}\``:'תועד ב־provenance'} | ${s.license} | ${text(s.note)} |`).join('\n')}

## כל הקבצים במסירה

| קובץ | רישיון | מקור / יצירה מדויקת |
|---|---|---|
${files.map(file=>{const origin=sourceFor(file);return `| [${file}](${file}) | CC0-1.0 | ${text(origin.description)}${origin.sources.length?`; ${origin.sources.map(s=>`\`${s}\``).join(', ')}`:''} |`;}).join('\n')}

מזהי תוכן, גודל ומיפוי מקורות לכל קובץ נמצאים ב־[verification/files.json](verification/files.json). המניפסט מחריג את ה־hash של עצמו כדי להימנע מהפניה רקורסיבית, אך הוא מופיע ברשימת הרישיונות הזאת.
`;
await fs.writeFile(new URL('LICENSES.md',base),licenses);
const inventory=[];
for(const file of files){
 if(file==='verification/files.json')continue;
 const bytes=await readBytes(file);
 inventory.push({file,bytes:bytes.length,sha256:sha256(bytes),license:'CC0-1.0',...sourceFor(file)});
}
await fs.writeFile(new URL('verification/files.json',base),JSON.stringify({
 scope:'All delivered files except this self-referential inventory; LICENSES.md also lists this inventory.',
 catalogSha256,sourceMotionSha256:motionSha256,evidencePass:passed,problems,sources:registry,files:inventory
},null,2)+'\n');
console.log(JSON.stringify({reportPass:passed,clips:clips.length,assets:assets.length,licensedFiles:files.length,problems}));
if(!passed)process.exitCode=1;
