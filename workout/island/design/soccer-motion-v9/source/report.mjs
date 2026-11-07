/** Regenerate the human report from measured, hashed delivery evidence. CC0. */
import fs from 'node:fs/promises';
import {clips} from '../runtime/catalog.mjs';
import {LEGAL_TRANSITIONS} from '../runtime/state-machine.mjs';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const [metrics,build,ball,browser,measurements,tap]=await Promise.all([read('verification/metrics.json'),read('verification/build.json'),read('verification/ball-metrics.json'),read('verification/browser-evidence.json'),fs.readFile(new URL('verification/measurements.md',root),'utf8'),fs.readFile(new URL('verification/node-test.tap',root),'utf8')]);
const max=(xs,f)=>Math.max(...xs.map(f)),min=(xs,f)=>Math.min(...xs.map(f)),fmt=(n,d=3)=>n.toFixed(d),testCount=tap.match(/(?:#|ℹ)\s+tests (\d+)/)?.[1]||'?',failCount=tap.match(/(?:#|ℹ)\s+fail (\d+)/)?.[1]||'?';
const rows=metrics.clips,loop=rows.filter(c=>c.loop),cadence=rows.filter(c=>c.cadence),pass=metrics.pass&&ball.pass&&failCount==='0'&&browser.errors.length===0;
const report=[
 '# כדורגל v9 — דוח מסירה ומדידות','',`מצב: **${pass?'עובר את בדיקות הקבלה':'טרם עבר את כל בדיקות הקבלה'}**. ענף: \`codex/soccer-motion-v9\`. נקודת הבסיס ב־main: \`d1af33d98b73b4763a399c260fcaa3621fc1792f\`.`,
 '', '48 קליפים מקוריים משלימים: 15 תנועה חופשית, 17 עם כדור, 2 גלישה וקימה, 8 שוער ו־6 חגיגות/כללי משחק. 25 הקליפים הקיימים של v8 נשארו במקומם; אף אחד מהם אינו ארוז ב־v9. רשתות הדמויות הבדיוניות של v8 משמשות לתצוגה בלבד, עם ערוצי הנפשה חדשים לחלוטין.',
 '', '[תצוגה בלולאה](preview.html) · [מקור ורישיון לכל קליפ](LICENSES.md) · [הגדרות המדידה](verification/METHOD.md) · [מדידות גולמיות](verification/metrics.json) · [ראיות דפדפן](verification/browser-evidence.json)',
 '', '## תוצאות מרכזיות','',
 '| דרישה | תוצאה בפלט המפוענח |','|---|---|',
 `| פורמט וטעינה | 48/48 קבצים נטענו ב־GLTFLoader r160 עם Draco WASM; תמונות המקור נטענו בדפדפן |`,
 `| משקל | המרבי ${max(clips,c=>c.bytes).toLocaleString('en-US')} בתים; כלל קובצי GLB ${clips.reduce((s,c)=>s+c.bytes,0).toLocaleString('en-US')} בתים |`,
 `| שלד וקצב | 18 עצמות, אותו עץ/מנוחה/inverse binds; 30Hz, שגיאת זמן מרבית ${fmt(max(rows,c=>c.maxRateErrorSeconds)*1000000,3)} מיקרושניות |`,
 `| נטיעה | החלקה אופקית מרבית ${fmt(max(rows,c=>c.maxFootSlidingM)*100)} ס״מ; שגיאת עוגן תלת־ממדית מרבית ${fmt(max(rows,c=>c.maxSoleAnchorErrorM)*100)} ס״מ |`,
 `| קצב צעדים | ${cadence.length} קליפים שנמדדו מול יעד מהירות ואורך צעד; שגיאה מרבית ${fmt(max(cadence,c=>c.cadence.error)*100,2)}% |`,
 `| לולאות | ${loop.length} לולאות; הפרש פוזה מרבי ${fmt(max(loop,c=>c.loopRotationErrorDeg),6)}° ו־${fmt(max(loop,c=>c.loopPositionErrorM)*1000,6)} מ״מ |`,
 `| אנטומיה | ${rows.reduce((s,c)=>s+c.anatomy.violations.length,0)} חריגות בטווחים המפורטים; ${rows.reduce((s,c)=>s+c.anatomy.backwardKneeFrames,0)} דגימות ברכיים הפוכות |`,
 `| גלישה מוחטאת | ${rows.find(c=>c.id==='slide_miss').crossedArmFrames} דגימות חציית ידיים או מרפקים, גם בבדיקה צפופה בין פריימים |`,
 `| שונות | 0 כפילויות זהות ב־v9 וב־48×25 השוואות מול v8; מרחק RMS זוויתי מזערי בתוך הספרייה ${fmt(min(rows,c=>c.nearestV9?.rmsDeg??Infinity),3)}° |`,
 `| מגע בכדור | ${build.calibration.length} סמני משטח מכוילים; שגיאת רדיוס מרבית ${fmt(max(ball.clips,c=>c.maxCueErrorM)*1000,4)} מ״מ; כדור משותף בתפיסה בשתי ידיים |`,
 `| כדור מול משטח הגוף בין אירועים | ${build.ballPathAudit.length} פעולות, ${build.ballPathAudit.reduce((s,c)=>s+c.samples,0)} דגימות עור ב־120Hz; חדירה מרבית ${fmt(max(build.ballPathAudit,c=>c.maximumSkinPenetrationM)*1000,4)} מ״מ ומרחק אחיזה מרבי ${fmt(max(build.ballPathAudit,c=>c.maximumHeldSurfaceErrorM)*1000,4)} מ״מ |`,
 `| בדיקות וצילומים | ${testCount} בדיקות, ${failCount} כישלונות; 48 גיליונות 844×390; שגיאות דפדפן: ${browser.errors.length} |`,
 '', 'הנטייה נמדדת מול וקטור התאוצה בפועל בחיתוכים, בכדרור בחיתוך ובבלימה. סיבוב כתפיים ואגן נמדד ביחס לעולם לאחר דגימת ההנפשה. טבלאות כל קליפ, הטווחים האנטומיים, הכנת הבעיטה והמעקב מופיעות בהמשך. אין ציוני טבעיות מומצאים: אלה בדיקות קינמטיות מוגדרות, לצד סקירה של תמונות המודל האמיתי.',
 '', '## רציפות ומעברים','',
 `מפת המעברים המלאה כוללת ${LEGAL_TRANSITIONS.length} קשתות ו־48 מצבים, ונגישה דרך \`LEGAL_TRANSITIONS\` ו־\`TRANSITION_GRAPH\` ב־[state-machine.mjs](runtime/state-machine.mjs). אירועים אינם משנים בעלות בכדור או חוקי משחק.`,
 '', '| מקור | יעד | תנאי/התנהגות |','|---|---|---|',
 '| עמידה רגועה | פעולות שדה/תנועה | בחירה או טריגר פעולה; משכי ערבוב מפורשים |',
 '| הליכה/ג׳וג/ריצה/ספרינט/אחור/צד | מצבי תנועה ופעולות | תור יציאה במגע רגל בהתאם לקשת |',
 '| ריצה | בלימה | ממתין לנטיעת שמאל בפאזה 0; אותה פוזה ואותה מהירות כניסה, ללא ערבוב מאולץ |',
 '| גלישה מוחטאת | קימה מהירה | שחזור פוזת הישיבה ההתחלתית של הקימה |',
 '| עמידת שוער | פעולות שוער | פעולות נפרדות וחזרה לעמידת היכון |',
 '| פעולה חד־פעמית | עמידה או חזרה לריצה | חלון סיום מתוזמן |',
 '', `בדיקת מעבר GLB: \`${JSON.stringify(metrics.runBrakeTransition)}\`. הדגמת הדפדפן בראיות מודדת בנוסף רציפות מיקום בעולם ומהירות; המצלמה נשארת קבועה במהלך ההחלפה. רציפות מדויקת זו נמדדה במסלול הריצה של 4.5 מ׳/ש׳ ובפאזה המצוינת.`,
 '', '## צילומים וביקורת חזותית','',
 'כל גיליון מורכב מארבעה רינדורים של המודל המונפש האמיתי, ב־Chromium עם טקסטורות המקור ועם GLTFLoader ו־Draco המקומיים. זמני הדגימות, גודל התמונה ו־SHA-256 של ה־GLB והגיליון נמצאים בראיות. בדיקות הקבלה דוחות צילומים שאינם מתאימים לקובצי ה־GLB הנוכחיים.',
 '', '| קליפ | גיליון 844×390 |','|---|---|',...clips.map(c=>`| ${c.id} | [צילום](verification/contact-sheets/${c.id}.png) |`),
 '', 'נבדקו גם ממשק 844×390 וממשק 390×844, מעבר אוטומטי בכל הקליפים, בחירה, עצירה, שינוי מהירות וציר זמן. בדיקת Chromium אינה בדיקת ביצועים של טלפון פיזי.',
 '', 'מודל הייחוס כולל כפות ידיים קבועות ושלד ללא עצמות אצבעות, ולכן אין הנפשה נפרדת של סגירת אצבעות. בפוזות ידיים גבוהות נראים גם קפלי הבגד וחריצי בית השחי של רשת הייחוס. מדידות התנועה אינן טענה לסימולציית בד או לאנימציית אצבעות.',
 '', '## מקור, שחזור והיקף השינוי','',
 'כל התנועות נכתבו ידנית או פרוצדורלית כחלק מהמשימה, והוקדשו ל־CC0-1.0. המקור המדויק לכל קליפ רשום ב־LICENSES.md. אריזת ה־GLB מעתיקה ללא שינוי את זרמי Draco, המשקלים, החומרים, התמונות וה־inverse binds של הדמויות הקיימות; בדיקת שלמות משווה אותם לכל אחד מ־48 הפלטים. כל האנימציות הישנות מוסרות לפני אריזת האנימציה החדשה.',
 '', 'כל הקבצים שנוספו נמצאים בתוך `workout/island/design/soccer-motion-v9/`. לא נערכו קוד קיים, v8, motion2, CLAUDE.md, ops, קובצי release, תגי גרסה או בדיקות קיימות. החבילה אינה מחוברת למשחק החי.',
 '', 'לשחזור מתוך תיקיית v9:', '', '```bash','node source/build.mjs','node verification/render-sheets.mjs','node verification/audit-ball.mjs','node --test --test-reporter=tap verification/*.test.mjs > verification/node-test.tap','node source/report.mjs','```',
 '', 'מדידות התנועה מתבצעות בקובצי GLB המפוענחים, ללא תיקון IK של התצוגה וללא הסתמכות על דגלי “עבר” במקור. תמיכות כוללות את מסלול התנועה בעולם; החלקה מכוונת של גלישה אינה מסומנת כנטיעה. גבולות האנטומיה והמדדים שאינם חלים על פעולה מסוימת מפורטים בשיטת המדידה.',
 '', '## טבלאות מדידה לכל קליפ','',measurements.replace(/^# מדידות קובצי GLB\n/,''),
];
await fs.writeFile(new URL('REPORT.md',root),report.join('\n').trimEnd()+'\n');console.log(`REPORT ${pass?'PASS':'INCOMPLETE'} from ${testCount} tests/${failCount} failures`);
