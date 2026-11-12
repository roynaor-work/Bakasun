// SPDX-License-Identifier: CC0-1.0
// מקור: דוח תיקונים מקורי של Codex מנתוני המדידה הנעולים של PR 414, 12/11/2026.
// קורא תוצאות בלבד וכותב REPORT-fix.md בתיקיית התיקון; אינו מפעיל או משנה מדדים.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const stages=['before','attempt-1','attempt-2','attempt-3','after'];
const reports=Object.fromEntries(stages.map(stage=>[stage,read(`evidence/${stage}/codex-qa/report.json`)]));
const libraries=Object.fromEntries(stages.map(stage=>[stage,reports[stage].libraries[0]]));
const before=libraries.before.clips,after=libraries.after.clips;
const byId=(clips,id)=>{const clip=clips.find(c=>c.id===id);assert(clip,`קליפ חסר: ${id}`);return clip;};
const changes=read('evidence/changes.json');
const pack=read('clips.json');
const original=JSON.parse(readFileSync(new URL('../../hockey-v1/clips.json',import.meta.url),'utf8'));
const measurements=read('evidence/after/motion-measurements.json');
const validation=read('evidence/validation.json');
assert.equal(validation.passed,true);assert.equal(validation.errors.length,0);
const failed=before.filter(c=>c.score<88),previouslyPassed=before.filter(c=>c.score>=88);
const reds=clip=>Object.entries(clip.metrics).filter(([,m])=>m.status==='red');
const ready=failed.filter(c=>{const a=byId(after,c.id);return a.score>=88&&!reds(a).length;});
const num=(value,places=6)=>Number.isFinite(value)?String(Number(value.toFixed(places))):'לא חל';
const code=id=>'`'+id+'`';
const table=(heads,rows)=>['| '+heads.join(' | ')+' |','|'+heads.map(()=> '---').join('|')+'|',...rows.map(r=>'| '+r.join(' | ')+' |')].join('\n');
const redText=clip=>reds(clip).map(([id,m])=>`${code(id)}=${num(m.value)}`).join('; ')||'אין';
const hash=createHash('sha256').update(readFileSync(new URL('clips.json',root))).digest('hex');
assert.equal(validation.clipsSha256,hash);
assert.equal(failed.length,15);assert.equal(previouslyPassed.length,15);
for(const clip of previouslyPassed){
  const current=byId(after,clip.id);
  assert.equal(current.score,clip.score,`ציון קליפ עובר השתנה: ${clip.id}`);
  assert.deepEqual(current.metrics,clip.metrics,`מדדי קליפ עובר השתנו: ${clip.id}`);
  assert.deepEqual(pack.states[clip.id],original.states[clip.id],`נתוני קליפ עובר השתנו: ${clip.id}`);
}
for(const clip of failed.filter(c=>c.id!=='celebrate_3'))for(const key of ['durationSeconds','loop','speedMps','referenceVelocityMps','referenceRootMotion','gaitKind','supports','events']){
  assert.deepEqual(pack.states[clip.id][key],original.states[clip.id][key],`חוזה התנועה השתנה: ${clip.id}.${key}`);
}
for(const stage of stages){
  const measured=read(`evidence/${stage}/motion-measurements.json`);
  assert.equal(measured.summary.athleteFailures.length,0,`כשל בתקן: ${stage}`);
  for(const clip of libraries[stage].clips){
    const direct=byId(measured.clips,clip.id).rawCodex;
    assert.equal(clip.score,direct.score,`אי התאמת ציון CLI/API: ${stage}/${clip.id}`);
    assert.deepEqual(clip.metrics,direct.metrics,`אי התאמת מדדים CLI/API: ${stage}/${clip.id}`);
  }
}
assert.equal(read('evidence/after/motion-measurements.json').clipSource.sha256,hash);
const actualChanges={
  skate_push_slow:'יישור הלהבים לכיוון תנועתם; פתרון רגליים מדויק; החזרת רגל בגובה 45 מ״מ ונדנוד אגן של 12 מ״מ.',
  skate_push_medium:'יישור הלהבים לכיוון תנועתם; פתרון רגליים מדויק; החזרת רגל בגובה 45 מ״מ ונדנוד אגן של 12 מ״מ.',
  skate_push_fast:'יישור הלהבים לכיוון תנועתם; פתרון רגליים מדויק; החזרת רגל בגובה 45 מ״מ ונדנוד אגן של 12 מ״מ.',
  skate_backward:'יישור הלהבים לתנועה אחורה; פתרון רגליים מדויק; החזרת רגל בגובה 45 מ״מ ונדנוד אגן של 12 מ״מ.',
  skate_glide:'ביטול תנודת הלהבים בגלישה ומעבר הדרגתי של הזרועות לעבר פוזת מוכנות בכניסה וביציאה.',
  skate_crossover_left:'יישור הלהבים למסלול; חציית הרגל והרמתה ברמפה חלקה לקראת מגע; ריכוך מעברי הזרועות.',
  skate_crossover_right:'יישור הלהבים למסלול; חציית הרגל והרמתה ברמפה חלקה לקראת מגע; ריכוך מעברי הזרועות.',
  skate_stop_left:'להבים לרוחב מסלול ההתקדמות, כריעה מוקדמת יותר וריכוך מעברי הזרועות. continuity ירד מאדום לצהוב.',
  skate_stop_right:'להבים לרוחב מסלול ההתקדמות, כריעה מוקדמת יותר וריכוך מעברי הזרועות.',
  skate_turn_45:'יישור הלהבים לכיוון הפנייה, הסרת סריקת רגליים קדימה ואחורה וריכוך מעברי הזרועות.',
  skate_turn_90:'יישור הלהבים לכיוון הפנייה, הסרת סריקת רגליים קדימה ואחורה וריכוך מעברי הזרועות.',
  skate_turn_180:'נבחר ניסיון 1: יישור הלהבים לכיוון הפנייה. ניסיון 3 ירד ל־63.4 ולכן לא נבחר.',
  goalie_slide_left:'בסיס ברוחב 46 ס״מ, העברת משקל ברמפה חלקה, נטייה צדית של 2° וכריעה נוספת של 14 מ״מ.',
  goalie_slide_right:'בסיס ברוחב 46 ס״מ, העברת משקל ברמפה חלקה, נטייה צדית של 2° וכריעה נוספת של 14 מ״מ.',
  celebrate_3:'הגלישה במסלול סיבובי הוחלפה בפירואט מקומי על להב שמאל; ימין מורמת בסיבוב. התחלה וסיום ב־ready_1 וחלונות תמיכה התואמים למגע.',
};
const status=id=>{const clip=byId(after,id);return clip.score>=88&&!reds(clip).length?'מוכן למדידה זו':'לא מוכן — לאחר 3 ניסיונות';};
const mainRows=failed.map(b=>{const a=byId(after,b.id);return [code(b.id),num(b.score,1),num(a.score,1),actualChanges[b.id],status(b.id),`[לפני](sheets/before/${b.id}.png) · [אחרי](sheets/after/${b.id}.png) · [השוואה](sheets/comparison/${b.id}.png)`];});
const attemptRows=failed.map(c=>{const change=changes.clips.find(r=>r.id===c.id);assert.equal(change.attempts.length,3);return [code(c.id),...['attempt-1','attempt-2','attempt-3'].map(s=>num(byId(libraries[s].clips,c.id).score,1)),String(change.selectedAttempt)];});
const redRows=failed.map(c=>[code(c.id),redText(c),redText(byId(after,c.id))]);
const gaitRows=measurements.clips.filter(c=>c.gaitKind).map(c=>[code(c.id),c.gaitKind,num(c.athleteMetrics.armAbdMax,2),num(c.athleteMetrics.swingRange,2),num(c.athleteMetrics.elbowMean,2),num(c.athleteMetrics.lean,2),c.athleteFails.length?c.athleteFails.join('; '):'עבר']);
assert.equal(gaitRows.length,14);
const browser=read('preview/browser-evidence.json');
assert.equal(browser.clipCount,15);assert.equal(browser.errors.length,0);assert.equal(browser.sheets.length,45);
for(const c of failed)for(const revision of ['before','after','comparison'])assert(existsSync(new URL(`sheets/${revision}/${c.id}.png`,root)),`חסר גיליון: ${c.id}/${revision}`);
const mesh=read('evidence/mesh-contact.json');
assert.equal(mesh.inputs.clipsSha256,hash);
const report=`# תיקון קליפי הוקי — תוצאות וקליפים שאינם מוכנים

תאריך: 12/11/2026. ענף התיקון: ${code('codex/hockey-fix-v1')}. בסיס: [PR #414](https://github.com/roynaor-work/Bakasun/pull/414), ענף ${code('codex/island-hockey-v1')}, קומיט ${code(changes.baseCommit)}. הענף ${code('codex/hockey-v1')} שהוזכר בבקשה לא קיים במאגר; נבחר ראש ה־PR המזוהה. כל קובצי המסירה חדשים תחת ${code('workout/island/design/hockey-v1-fix/')}.

## מצב המסירה

**היעד המלא לא הושלם. ${ready.length} מתוך 15 הקליפים שנכשלו הגיע לציון 88 ומעלה ללא מדד אדום; ${failed.length-ready.length} קליפים אינם מוכנים אחרי שלושה ניסיונות.** ${code('celebrate_3')} עלה מ־72.1 ל־97.8. כל 15 הקליפים שכבר עברו במקור נשמרו ללא שינוי בנתוני התנועה, בציון ובכל המדדים.

הממוצע של כלל 30 הקליפים השתנה מ־${num(libraries.before.summary.average,2)} ל־${num(libraries.after.summary.average,2)}; המינימום נותר ${num(libraries.after.summary.min,1)}. מספר המדדים האדומים ירד מ־${libraries.before.summary.redMetrics} ל־${libraries.after.summary.redMetrics}. נתוני המדידה הגולמיים הם הקובעים; אין אישור לחיבור חבילת 30 הקליפים למשחק.

[תצוגה אינטראקטיבית לפני ואחרי](preview.html) · [גלריית ההשוואה](preview/gallery.png) · [רישיונות ומקורות](LICENSES.md) · [מניפסט וחתימות](manifest.json).

## 15 הקליפים שנכשלו במקור

הציון המוצג הוא ציון כלי QA המקורי, ללא שינוי משקלות או ספים. לכל קליפ גיליון של שמונה רגעים לפני ואחרי, בשני מבטים, וגיליון השוואה באותם זמנים ובאותו קנה מידה. השם ״אחרי״ מציין את הגרסה שנבחרה לבדיקה גם כאשר היא אינה מוכנה.

${table(['קליפ','ציון לפני','ציון אחרי','מה שונה בגרסה שנבחרה','מצב','8 פריימים'],mainRows)}

## המדדים האדומים לפני ובסוף

כל התאים להלן מונים רק מדדים שסומנו אדום באותו שלב, בערכים המקוריים. ${code('footSliding')} הוא יחס תזוזת נקודת הלהב לגובה הדמות; ${code('bodySliding')} הוא שגיאת מהירות יחסית; ${code('continuity')} הוא יחס פער כניסה או יציאה לפוזת המתנה. ספי הגבול לאדום הם בהתאמה 0.035, 0.5 ו־3; שוויון לסף הוא צהוב. יתר המדדים, כולל צהובים, נשמרים בדוח המלא.

${table(['קליפ','אדומים לפני — מדד וערך','אדומים אחרי — מדד וערך'],redRows)}

ב־${code('skate_stop_left')} ערך ${code('continuity')} ירד מ־${num(byId(before,'skate_stop_left').metrics.continuity.value)} אדום ל־${num(byId(after,'skate_stop_left').metrics.continuity.value)} צהוב. בפניות 90° ו־180° הוא נותר אדום. רציפות הכניסה והיציאה נמדדת מול המתנה בכיוון עולם קבוע: הכלי מיישר תרגום אופקי, ואינו מיישר את כיוון הסיום של פנייה. לא סובבו פוזות ההמתנה לצורך שיפור הציון.

[לפני: דוח CLI מלא](evidence/before/codex-qa/report.json) · [אחרי: דוח CLI מלא](evidence/after/codex-qa/report.json) · [מדידה מלאה ותקן אחרי](evidence/after/motion-measurements.json).

## שלושת הניסיונות והבחירה

כל ניסיון כולל נתוני קליפים מלאים, הרצת CLI מקורית וניתוח ישיר. ניסיונות 2 ו־3 ממשיכים את התיקונים המתוארים ב־[changes.json](evidence/changes.json). בגרסה הסופית נבחרו ניסיון 3 עבור 13 קליפים, ניסיון 1 עבור פניית 180° וניסיון 2 עבור החגיגה. ניסיון 3 של הפנייה הגיע ל־63.4 ונפסל לבחירה; החגיגה בניסיון 2 הגיעה ל־97.8 לעומת 97.6 בניסיון 3.

${table(['קליפ','ניסיון 1','ניסיון 2','ניסיון 3','ניסיון נבחר'],attemptRows)}

[ניסיון 1](evidence/attempt-1/codex-qa/report.json) · [ניסיון 2](evidence/attempt-2/codex-qa/report.json) · [ניסיון 3](evidence/attempt-3/codex-qa/report.json). תיאור מפורט של כל שינוי בכל ניסיון נמצא ב־[changes.json](evidence/changes.json).

## מדוע 14 הקליפים עדיין אינם מוכנים

בכל 14 ההחלקות נשארו ${code('footSliding')} ו־${code('bodySliding')} אדומים. התיקונים שיפרו כיוון להבים, תנועת רגליים, העברת משקל ומעברי זרועות; זמני הקליפים, מהירויות הגוף, מסלולי הייחוס, חלונות המגע והאירועים נשמרו זהים למקור. לא הומרה החלקה להליכה, לא קוצרו חלונות תמיכה לצורך הציון ולא הוסרו מדדים. לכל קליפ שלא הגיע לרף לאחר שלושה ניסיונות נקבע מצב ״לא מוכן״.

החסם עבור גלישה שנשמרת הוא מדיד: ${code('footSliding = D / H')}, כאשר D הוא המרחק האופקי המרבי מנקודת התמיכה בתחילת החלון. בגובה H=1.85 מ׳, כדי להימנע מאדום נדרש D≤0.06475 מ׳. ב־${code('skate_glide')} המסלול הנשמר הוא 2.6 מ׳/ש׳ במשך 2.4 שניות, ולכן נקודת להב מחליקה 6.24 מ׳. זרועות טובות יותר אינן משנות את התוצאה הזאת.

${code('bodySliding = |v − s| / max(v, s, 0.025H)')}, כאשר s הוא קצב סריקת רגל התמיכה לאחור ביחס לשורש. בגלישה שבה הלהב נשאר ליד האגן, s=0 והמהירות v>0, לכן ערך המדד הוא 1 — אדום. פיצול מלאכותי לחלונות של פחות מ־24.9 אלפיות שנייה היה מסתיר חלק מהתזוזה בקליפ הגלישה, אך ${code('bodySliding')} דורש חלונות באורך לפחות ${code('max(0.06, 0.08T)')} שניות; מחיקת התצפיות אינה תיקון.

בכל 14 הקליפים ${code('footSliding.score')} נותר 0. משקלו 18 מתוך 87 המדדים החלים על החלקה ללא כדור: גם אם כל שאר המדדים היו 100, הציון היה לכל היותר ${num(100*(87-18)/87,2)}. לכן שיפור התנוחה בלבד אינו יכול להביא את הגרסאות עם הגלישה והחוזה הנשמרים ל־88. זהו חסם של מדדים אלה תחת המסלולים, המהירויות והמגע שנשמרו כאן; אין כאן טענה שכל תנועת הוקי אפשרית אינה ניתנת למדידה או לתיקון.

ב־${code('celebrate_3')} נעשה שינוי תנועה מפורש: גלישה במסלול סיבובי הוחלפה בפירואט מקומי, עם להב שמאל נתמך ולהב ימין באוויר בזמן הסיבוב. נקודת המגע נתונה בקינמטיקה עצמה וחלונות התמיכה משקפים את ההרמה והנחיתה; ציון 97.8 אינו מושג בהסתרת תנועת הייחוס של הגרסה הישנה. כל המדדים החלים בחגיגה ירוקים.

## 15 הקליפים שכבר עברו

נבדקה זהות מלאה של כל ${code('states[id]')} ושל כל אובייקט ${code('metrics')} בין קו הבסיס לסוף, נוסף להשוואת הציונים. לא הוגדרו מחדש ספים או פוזות המתנה. לפיכך לא ירד מדד באף אחד מ־15 הקליפים האלה.

${table(['קליפ','לפני','אחרי','כל המדדים ונתוני התנועה'],previouslyPassed.map(c=>[code(c.id),num(c.score,1),num(byId(after,c.id).score,1),'זהים למקור']))}

## ATHLETE_STANDARD ומגע בקרח

כל 14 קליפי התנועה נמדדו ישירות באמצעות ${code('normaliseSoccerClip → gaitMetrics(clip,120) → checkGait')}, מהקוד הקנוני המקורי. לפי התקן: פיסוק זרוע מרבי 24°, מרפק פנימי ממוצע 40–100°, נדנוד זרועות לפחות 40/55/65/70° ונטייה קדימה ממוצעת לפחות 0/3/6/9° לפי walk/jog/run/sprint. אין כשלים בתקן באף אחד משלושת הניסיונות או בגרסה הסופית.

${table(['קליפ','רמת התקן','פיסוק מרבי °','נדנוד °','מרפק פנימי ממוצע °','נטייה ממוצעת °','תוצאה'],gaitRows)}

נוסף לממוצע שבתקן, נבדקו שתי זוויות המרפק ב־120 הרץ לאורך הקליפ כולו, כולל נקודות הקצה. בכל 14 הקליפים הטווח היה ${num(Math.min(...validation.athlete.map(c=>c.elbowMin120Hz)),2)}–${num(Math.max(...validation.athlete.map(c=>c.elbowMax120Hz)),2)}°, בתוך הדרישה 40–100° בכל דגימה. אימות התיקון החזיר passed=true ואפס שגיאות.

${code('measure.mjs')} המקורי מקבל תיקיית פלט ומודד ספריות קיימות קבועות; הוא אינו טוען את ${code('clips.json')} החדש. הרצת קו הבסיס שלו נפרדת מהמדידה הישירה לעיל. [תוצאות הבסיס](evidence/canonical-baseline/measure.json) · [אימות התיקון, כולל דגימות מרפקים](evidence/validation.json).

בדיקת רשתות הגוף והמקל ב־60 הרץ, עם סבילות 5 מ״מ למישור הקרח, החזירה ${mesh.summary.bodyFailures.length} כשלי גוף ו־${mesh.summary.stickFailures.length} כשלי מקל בכל 30 הקליפים. נבדקו קודקודי GLB עם skinning ולא רק מרכזי מפרקים. זו בדיקת חדירה למישור בלבד, ללא אישור להתנגשויות בין איברים או בין גוף למקל. [תוצאות מגע הרשת](evidence/mesh-contact.json).

## מקור המדידה והראיות

הכלי ${code('motion-qa-v1')} אינו נמצא בענף הבסיס. הורדו שמונה קובצי המקור מקומיט נעול ${code('5eb4f093bc22523ee417a7f2345c3b813bffba24')} של [PR #371](https://github.com/roynaor-work/Bakasun/pull/371) לתיקייה זמנית. ${code('run.mjs')}, ${code('metrics.mjs')}, נוסחאות המדידה, המשקלות והספים לא שונו. המתאם מחליף רק קורא מקורות כדי לטעון את ההוקי; הוא נגזר ממתאם PR #414 עם נתיב קלט חדש. בחירת idle/mirror, דגימות ומטא־דאטה של המדידה נשמרו. הרצת ״לפני״ החזירה את המדדים המקוריים בדיוק, ובכל חמשת השלבים התקבלה זהות בין מדדי CLI ל־API. [חתימות המקור והוכחת ההתאמה](qa-tool-provenance.json).

נשמרו כל מדידות JSON וגיליונות SVG של הכלי. HTML של הכלי הושמט מפני שהוא דורש את נתיבי התצוגה של הכלי הזמני; ${code('preview.html')} מציג את גופי ה־GLB המקוריים. רנדר הדפדפן הפיק ${browser.sheets.length} גיליונות לפני/אחרי/השוואה ל־${browser.clipCount} קליפים, ללא שגיאות דפדפן. חתימות הקלט נבדקו לפני ואחרי הרנדר. [ראיית הדפדפן](preview/browser-evidence.json).

בדיקת השלד המאוחד הקיימת עברה: 11 בדיקות, אפס כישלונות. [פלט ההרצה](evidence/unified-athletes-tests.log). בדיקות המאגר לא נערכו; לא בוצעה הרצה רחבה נוספת או פרסום ל־main.

כל השינויים הם קבצים חדשים בלבד תחת תיקיית התיקון. אין שינוי ב־${code('hockey-v1')}, בקוד משחק, ב־${code('release.json')}, בתגי ${code('?v=')}, ב־ops או בבדיקות. הגופים, המקל והשלד המקורי נקראים מ־${code('../hockey-v1/')} ולא נבנים מחדש. הרישיון הוא CC0-1.0, עם המקורות המלאים ב־[LICENSES.md](LICENSES.md).

## שחזור

נדרשים Node, כלי GitHub CLI לצורך הורדת מקור QA הנעול, Playwright ו־Chromium לרנדרים. משורש המאגר, הפקודות הבאות כותבות רק קבצים חדשים ותוצרי הרצה בתוך ${code('hockey-v1-fix')}:

\`\`\`sh
node workout/island/design/hockey-v1-fix/source/build-fix.mjs
node workout/island/design/hockey-v1-fix/source/run-qa.mjs
node workout/island/design/hockey-v1-fix/source/mesh-contact-audit.mjs
node workout/island/tools/athletes/measure.mjs workout/island/design/hockey-v1-fix/evidence/canonical-baseline/
node workout/island/design/hockey-v1-fix/source/render-sheets.mjs
node workout/island/design/hockey-v1-fix/source/validate-fix.mjs
node workout/island/design/hockey-v1-fix/source/build-report.mjs
node workout/island/design/hockey-v1-fix/source/build-manifest.mjs
\`\`\`

הפעלת ${code('build-report.mjs')} מאמתת זהות של 15 הקליפים שעברו, שימור חוזה 14 ההחלקות והתאמת CLI/API לפני כתיבת דוח זה. הציון הסופי אינו מורשה להתפרש כהשלמת המשימה: רק החגיגה החדשה עומדת כעת ברף; 14 הקליפים האחרים מסומנים במפורש כלא מוכנים.

SHA-256 של ${code('clips.json')} שנמדד ורונדר:

\`\`\`text
${hash}
\`\`\`
`;
writeFileSync(new URL('REPORT-fix.md',root),report);
console.log(JSON.stringify({revised:failed.length,ready:ready.map(c=>c.id),notReady:failed.filter(c=>!ready.includes(c)).map(c=>c.id),previouslyPassedUnchanged:previouslyPassed.length,clipsSha256:hash}));
