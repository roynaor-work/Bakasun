import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const execFileAsync=promisify(execFile);
const gitOutput=async args=>(await execFileAsync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:4*1024*1024})).stdout;
const readJSON=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const files={assets:'verification/assets.json',contact:'verification/contact.json',road:'verification/road-clearance.json',framing:'verification/framing.json',images:'verification/images.json',ui:'verification/interactions.json',offline:'verification/offline.json',tests:'verification/repository-tests.json',soak:'verification/soak.json',performance:'verification/performance-final.json'};
const data={};
for(const [key,file]of Object.entries(files))data[key]=await readJSON(file);
for(const key of ['assets','contact','road','framing','images','ui','offline','tests','soak'])if(!data[key].pass)throw new Error('Cannot finalize a failing check: '+key);
if(data.performance.errors.length||data.performance.records.length!==12||data.performance.records.some(r=>r.renderedFrames<=0))throw new Error('Incomplete performance capture');
if(data.performance.secondsPerCase!==120||data.performance.records.some(r=>r.elapsedSeconds<120||!r.effects?.boost||!r.effects?.drift))throw new Error('The final benchmark requires twelve two-minute cases with boost and drift');
if(data.framing.records.length!==840||data.framing.lifecycle.length!==4||data.framing.records.some(r=>!Array.isArray(r.foregroundOccluders)))throw new Error('A complete rotation audit with foreground checks is required');
if(data.soak.status!=='complete'||data.soak.durationSeconds<2700)throw new Error('A complete 45-minute soak is required');
for(const [file,expected]of Object.entries({...data.soak.sourceSHA256,...data.soak.assetSHA256})){
  const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  if(actual!==expected)throw new Error('The soak did not use the final file: '+file);
}
for(const key of ['framing','ui','offline','performance']){
  const hashes=data[key].sourceSHA256;
  if(!hashes||Object.keys(hashes).length<6)throw new Error('Missing code fingerprints: '+key);
  for(const [file,expected]of Object.entries(hashes)){
    const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
    if(actual!==expected)throw new Error('Stale browser evidence: '+key+' / '+file);
  }
}
const status=(await gitOutput(['status','--porcelain','--untracked-files=all'])).split('\n').filter(Boolean);
const outside=status.filter(line=>!line.slice(3).startsWith('workout/island/design/racing-v7/'));
if(outside.length)throw new Error('Changes outside the authorized folder: '+outside.join(', '));
const branch=(await gitOutput(['branch','--show-current'])).trim();
if(branch!=='codex/racing-v7-20261105')throw new Error('Unexpected branch');
const rounds=[];
for(const entry of(await fs.readdir(path.join(root,'iterations'),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d\d$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))){
  const report=await readJSON(`iterations/${entry.name}/capture.json`);
  await fs.access(path.join(root,'iterations',entry.name,'CRITIQUE.md'));
  const sizes=new Set(report.records.map(r=>`${r.viewport.width}x${r.viewport.height}`));
  if(!sizes.has('390x844')||!sizes.has('844x390'))throw new Error('Missing viewport in round '+entry.name);
  rounds.push({id:entry.name,...report});
}
const screenshotCount=rounds.reduce((n,r)=>n+r.records.length,0),latest=rounds.at(-1);
if(rounds.length<6||data.images.rounds!==rounds.length||data.images.images!==screenshotCount)throw new Error('The screenshot audit does not cover the complete iteration set');
for(const [file,expected]of Object.entries(latest.sourceSHA256)){
  const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  if(actual!==expected)throw new Error('The final screenshots do not match the delivered code: '+file);
}
const allGLB=data.assets.assets,maxGLB=allGLB.reduce((a,b)=>a.bytes>b.bytes?a:b),offlineSize=(await fs.stat(path.join(root,'offline.html'))).size;
if(allGLB.some(a=>!Number.isFinite(a.trianglesPerScene)))throw new Error('Run the current asset audit to include per-scene triangle costs');
const totalGLB=allGLB.reduce((n,a)=>n+a.bytes,0);
const start=new Date('2026-11-04T20:10:43Z'),now=new Date(),elapsedHours=(now-start)/3600000;
const localDate=date=>new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'medium'}).format(date);
const fps=data.performance.records.map(r=>r.fps);
const scores=[
 ['חמישה דגמי ספורט מובחנים',8.5,'קופה, GT, טריז, רודסטר ודגם מסלול; פרופורציות, קבינות, חישוקים ותוספות שונים'],
 ['זכוכית משתקפת וצבע מבריק',9,'חומרי Glass/Paint נפרדים, PMREM מקומי והיילייטים בשלוש סביבות'],
 ['פנסים קדמיים ואחוריים',9,'גאומטריית פנסים וחומר מאיר; כתם אור מקדים בלילה'],
 ['גלגלים מסתובבים והיגוי',9,'ארבעה צירים בכל קובץ; גלגול X והיגוי קדמי; 60 בדיקות מגע'],
 ['בחירת צבעים',9,'חמש דוגמיות פעילות; בדיקת צבע חומר מול הבחירה עברה'],
 ['עיר בלילה',8.5,'בניינים, חלונות מאירים, שילוט, מעקות ותאורה חמה/קרה'],
 ['מסלול חוף',8.5,'ים, רצועת חוף, דקלים ומגדלור עם נתיב סגור'],
 ['מסלול הר',8.5,'עליות/ירידות, עצי מחט, סלעים ושכבות פסגות'],
 ['אספלט עם נורמל',9,'מפות צבע/נורמל/ORM מקומיות, UV במטרים'],
 ['קווים וסגירת מסלול',9,'סימוני שוליים/מרכז ורציפות קשת בכל שלושת הנתיבים'],
 ['גדרות ומעקות',9,'מופעים משותפים; שוליים רחבים מספיק לתמיכת העמודים'],
 ['שלטים ותמיכות',9,'שלטי נתיב ופנייה, גשרי שילוט ועמודי תמיכה'],
 ['תאורה ומגע קרקע',8.5,'שמש/מילוי, תאורת לילה, פנסים וצל מגע מקומי'],
 ['עשן צמיגים',8.5,'42 חלקיקים קבועים; שובל מצטבר בזמן תנועת הרכב'],
 ['ניצוצות',8.5,'46 ניצוצות במאגר; רגע מגע קריא בשתי האוריינטציות'],
 ['אפקט מהירות',8.5,'קווי מהירות וטשטוש קצוות בבוסט; מרכז חד'],
 ['LOD לרכבים',9,'שלושה קבצים לכל דגם, היסטרזיס וצילומי LOD2 מחמירים מקרוב'],
 ['קהל במופעים',9,'72 צופים בדיוניים בשלוש קבוצות, בלי שלד נפרד שרץ לכל מופע'],
 ['שלד קנוני 18 עצמות',9.5,'שמות, הורות, תרגומי מנוחה וסיבובי זהות נבדקו מול motion2'],
 ['Draco וגודל GLB',10,`כל 20 הקבצים דורשים Draco; המרבי ${(maxGLB.bytes/1e6).toFixed(4)} MB`],
 ['טקסטורות ואטלס',10,'כל קובץ עד 1024; אטלס אחד 256×256 לדמות הקהל'],
 ['Three.js r160 מקומי',10,'מודול, loaders ומפענח כלולים, ללא CDN'],
 ['HTML מקומי ללא build ורשת',9,'קובץ עצמי עם מודולים/מודלים/מרקמים/מפענח; 0 בקשות HTTP בבדיקה; מגבלת file:// של סביבת הבדיקה מתועדת'],
 ['מסגור 390×844 ו-844×390',9,`${data.framing.records.length} צירופים, כולל 14 זוויות בכל סביבה, בלי חיתוך, חפיפה ללוחות או חסימת מרכז הרכב`],
 ['בדיקת כל הדרך',9.5,'9,615 נקודות על כביש מול קרקע מפוענחת; אין חדירה'],
 ['לולאות ביקורת',10,`${rounds.length} סבבים ו-${screenshotCount} צילומים, עם ביקורת בכל תיקייה`],
 ['אינטראקציה והתאוששות',9,'34 בדיקות, כולל גרירה, צביטה, השהיה ורענון מוצלח אחרי אובדן WebGL'],
 ['יציבות משאבים',9,`${(data.soak.durationSeconds/60).toFixed(1)} דקות, ${data.soak.cycles.length} החלפות; בדיקת זיכרון עברה`],
 ['כללי ריפו ומקור',10,'קבצים חדשים בתיקייה המאושרת; מקור מורשה; ללא סמלי יצרן, נתוני לקוחות או מפתחות'],
 ['30fps על טלפון בינוני',7,'חסרה מדידת טלפון פיזי. סביבת הבדיקה היא SwiftShader; אין בסיס להצהיר שהיעד הושג במכשיר'],
];
const baseline=data.soak.baseline,final=data.soak.final;
let report=`# מרוצים v7 — דוח מסירה\n\nנוצרו חמישה רכבי ספורט, שלושה מסלולים, תצוגה אינטראקטיבית עצמית וחבילת מקור לשחזור. הקבצים החדשים נמצאים רק ב-workout/island/design/racing-v7/.\n\nחלון העבודה: ${localDate(start)} עד ${localDate(now)} (Asia/Jerusalem), כ-${elapsedHours.toFixed(2)} שעות כולל רינדורים ובדיקות שהייה. ענף המסירה: \`${branch}\`; יעד PR כטיוטה מול main. מיזוג אינו חלק מהמסירה.\n\nהכיוון שנבחר בידי המשתמש: **מרוצי ארקייד מלוטשים בתלת־ממד**. לא התקבלה תמונת רפרנס חיצונית. נבדקו נכס המכונית הקיים והמקור המפורט שלו, והביקורת נעשתה מול הכיוון הנבחר ו-REFERENCE.md.\n\n`;
report+=`## לפתוח ולראות\n\n1. פתחו את [offline.html](offline.html): מודולים, מודלים, מרקמים ומפענח משובצים בקובץ. אין צורך בשרת, התקנה או build.\n2. בחרו סביבה, רכב וצבע; ״מבט רכב״ מאפשר גרירה וצביטה. ״נסיעה״ היא סיור אוטומטי. המפה מציגה את כל הנתיב.\n3. השוו את [גלריית הסבבים](review.html) ובדקו את [צילומי הסבב האחרון](iterations/${latest.id}/index.html). שתי המידות נשמרו בפיקסלים מלאים.\n\nהמסמך העצמי הוא ${(offlineSize/1e6).toFixed(3)} MB. בדפדפן המנוהל ניווט file:// חסום במדיניות; התוכן העצמי נבדק במסמך ריק במצב Offline, ללא בקשות HTTP. זהו תיעוד מגבלת הבדיקה, לא תלות של הקובץ בשרת.\n\n`;
report+='## ציונים ובסיס לבדיקה\n\n| פריט | ציון / 10 | ראיה או מה חסר |\n|---|---:|---|\n';
for(const row of scores)report+=`| ${row[0]} | ${row[1]} | ${row[2]} |\n`;
report+='\nסעיף הביצועים קיבל 7 משום שלא נמדד טלפון פיזי. הוא נשאר פער אימות מפורש, ולא סומן 8 כדי לעמוד בסף ללא ראיה. בפריטים האחרים הציונים הם הערכת גימור עצמית המגובה בצילומים ובבדיקות המפורטות, ולא דירוג של בודק חיצוני.\n\n';
report+='## צילומים לבדיקה ישירה\n\n| בדיקה | צילום מקומי מהסבב האחרון |\n|---|---|\n';
for(const [label,file]of [
 ['מרכב, זכוכית וגלגלים מקרוב — 390×844','coast-garage-prism-near-390x844.jpg'],
 ['הרודסטר מקרוב — 844×390','coast-garage-solis-near-844x390.jpg'],
 ['חוף מרחוק וקהל — 844×390','coast-drive-apex-far-844x390.jpg'],
 ['הדרך בהר, מקטע שלישי — 844×390','ridge-drive-apex-near-path-3-844x390.jpg'],
 ['דריפט, ניצוצות ובוסט בלילה — 390×844','neon-drive-vector-near-fx-390x844.jpg'],
 ['דריפט, ניצוצות ובוסט בלילה — 844×390','neon-drive-vector-near-fx-844x390.jpg'],
 ['הלולאה במבט על — 390×844','ridge-overview-apex-far-390x844.jpg'],
])report+=`| ${label} | [לפתיחת המקור](iterations/${latest.id}/${file}) |\n`;
report+='\n';
report+='## משקלים\n\nMB = 1,000,000 bytes. [WEIGHTS.md](WEIGHTS.md) כולל כל GLB וכל טקסטורה בנפרד; [verification/files.csv](verification/files.csv) כולל מלאי קבצים ו-SHA-256.\n\n| דגם | LOD0: משולשים / MB | LOD1: משולשים / MB | LOD2: משולשים / MB |\n|---|---:|---:|---:|\n';
for(const id of ['apex','velour','prism','solis','vector']){
    const levels=[0,1,2].map(l=>allGLB.find(a=>a.file===`assets/cars/${id}-lod${l}.glb`));report+=`| ${id} | ${levels.map(a=>`${a.trianglesPerScene.toLocaleString('en-US')} / ${a.MB.toFixed(4)}`).join(' | ')} |\n`;
}
report+='\nמספרי המשולשים בטבלת הדגמים הם למופע רכב שלם, כולל כל ארבעת הגלגלים. WEIGHTS.md מציג גם את סכום המשולשים ברשתות המאוחסנות בקובץ, כדי להבחין בין גאומטריה משותפת לעלות מופעים.\n';
report+=`\nסך 20 ה-GLB: ${(totalGLB/1e6).toFixed(3)} MB. הגדול ביותר: ${maxGLB.file}, ‏${maxGLB.bytes.toLocaleString('en-US')} bytes. טקסטורות: צבע 1024², נורמל 512², ORM ‏1024², אטלס קהל 256² ועשן 64². מפת ההשתקפות משותפת ונוצרת מקומית.\n\n`;
report+='| מסלול | אורך מ׳ | רוחב מ׳ | שיפוע מרבי | בדיקות קרקע |\n|---|---:|---:|---:|---:|\n';
for(const track of data.assets.tracks)report+=`| ${track.id} | ${track.length.toFixed(1)} | ${track.width} | ${track.maxGradePercent.toFixed(1)}% | ${data.road.records.find(r=>r.track===track.id).samples} |\n`;
report+='\n## מה נבדק\n\n';
report+=`- **מסגור נקי:** ${data.framing.records.length} צירופי סביבה/דגם/זווית/מרחק/אוריינטציה מול קודקודי המודל המצוירים, בלי יציאה מהמסך, חפיפה לממשק או חסימת מרכז הרכב. ארבע בדיקות מעבר מאשרות ניקוי היסט המצלמה ושחזור התפאורה והצופים. נתוני הכשל נשמרו בנפרד.\n`;
report+=`- **קבצים:** ${data.assets.checks} בדיקות נכסים; 20 GLB עם Draco, אפס שגיאות ואפס אזהרות במאמת Khronos; מיקומי מנוחה וסיבובים קנוניים מול motion2.\n- **מגע:** 60 צירופי גלגל/דגם/LOD מול המישור המשיק האידיאלי; כ-0.75 מ״מ. זו אינה מדידת מתלה או פותר התנגשות.\n- **נתיב שלם:** ${data.road.records.reduce((n,r)=>n+r.samples,0).toLocaleString('en-US')} נקודות מול משולשי הקרקע המפוענחים, בלי קרקע שחודרת לכביש.\n- **דפדפן:** ${data.ui.checks.length} בדיקות אינטראקציה; שש סצנות Offline ועוד החלפת כל חמשת הרכבים; אפס שגיאות ובקשות HTTP בגרסה העצמית.\n- **ריפו:** ${data.tests.summary.tests.toLocaleString('en-US')} בדיקות: ${data.tests.summary.pass.toLocaleString('en-US')} עברו, 0 נכשלו, ${data.tests.summary.skipped} דולגו. נבחר Chromium המותקן דרך hook קיים; קובצי הבדיקות לא נערכו.\n- **סבבים:** ${rounds.length} תיקיות עם ${screenshotCount} צילומים וביקורות. סבבי הכשל נשמרו, לרבות חסימת WASM ראשונה, שמות צירים, קרקע ודריפט.\n\n`;
report+=`## בדיקת שהייה וביצועים\n\nהבדיקה הסופית רצה ${(data.soak.durationSeconds/60).toFixed(1)} דקות, מ-${data.soak.startedAt} עד ${data.soak.finishedAt}, עם ${data.soak.cycles.length} החלפות רכב/מסלול/אוריינטציה. כל קובצי הקוד והנכסים תואמים ל-SHA-256 שנרשם לפני הבדיקה. מחזורי בוסט באיכות גבוהה הפעילו גם HDR/עשן; מצבים חסכוניים נבדקו בנפרד.\n\n| מדד | בסיס אחרי חימום | סוף אחרי GC |\n|---|---:|---:|\n| JS heap, MB | ${(baseline.heap.usedSize/1e6).toFixed(2)} | ${(final.heap.usedSize/1e6).toFixed(2)} |\n| גאומטריות GPU חיות | ${baseline.metrics.geometries} | ${final.metrics.geometries} |\n| טקסטורות GPU חיות | ${baseline.metrics.textures} | ${final.metrics.textures} |\n\nהספירות הן אובייקטי משאבים, לא מדידת VRAM ב-MB. החלפת סביבה משחררת גם shadow maps ו-PMREM. בדיקות הביניים שנעצרו לצורך תיקוני גימור נשמרו בקבצי soak-preliminary, ואינן נספרות כבדיקה הסופית.\n\n`;
report+=`במהלך השהייה רונדרו ${(final.metrics.frames-baseline.metrics.frames).toLocaleString('en-US')} פריימים. בדיקות מחבר אחרות פעלו במקביל בחלק מהריצה; היא מיועדת ליציבות משאבים. מדידת התנועה המבודדת בהמשך בוצעה בנפרד.\n\n`;
report+='![יציבות משאבים במשך 45 דקות](verification/stability.png)\n\n';
report+='בדיקת 45 דקות נוספת, שקדמה לתיקון מסגור הממשק, עברה ונשמרה ב-verification/soak-before-ui-polish.json. ריצה חלקית נוספת של 28.71 דקות נשמרה ב-soak-before-orbit-fix.json לפני תיקון מקרי הקצה של הסיבוב. התוצאה בטבלה לעיל היא מהבדיקה שחודשה אחרי כל התיקונים. שישה מקרי ביצועים שנקטעו לצורך תיקון מוקדם נשמרו כסיכומי ביניים ב-performance-before-ui-polish.json, ואינם חלק מהמדידה הסופית.\n\n';
report+=`מדידת התנועה המבודדת האחרונה בשרת: ${Math.min(...fps).toFixed(2)}–${Math.max(...fps).toFixed(2)} fps ב-SwiftShader, לפי סביבה ואיכות. הנתונים אינם מדידת GPU של טלפון. [PERFORMANCE.md](PERFORMANCE.md) ו-verification/performance-final.json כוללים את כל המקרים.\n\nלסגירת פער 30fps יש להריץ את הקובץ העצמי בטלפון בינוני בשתי האוריינטציות, לפחות דקה בכל סביבה, עם בוסט ודריפט; לתעד fps, חום ואיכות אוטומטית.\n\n`;
report+='## מקור וגבולות חיבור\n\nגופי הרכב נגזרים מ-Car Concept ברישיון CC-BY-4.0, עם ייחוס מלא ב-[LICENSES.md](LICENSES.md). החישוקים, תוספות המרכב, הסביבות, המרקמים, הקהל והממשק נוצרו למשימה. כל טקסטורות וסמלי המקור הוסרו.\n\nזו חבילת נכסים ותצוגה. [INTEGRATION.md](INTEGRATION.md) מפרט צירים, מופעים, LOD ומשאבים. קוד המשחק הפעיל, מנגנון השחרור, תגי גרסה, CLAUDE.md והבדיקות הקיימות לא נערכו. הכל נועד למסירת טיוטת PR; אין כאן מיזוג או פריסה.\n';
await fs.writeFile(path.join(root,'REPORT.md'),report);
const perf=data.performance;
let pm=`# מדידות תנועה בשרת\n\nנמדד ב-Chromium עם SwiftShader. אלה אינן תוצאות טלפון פיזי. כל אחד מ-12 המקרים רץ ${perf.secondsPerCase} שניות לפחות בתנועה רציפה, עם בוסט ודריפט פעילים, באיכות גבוהה ובמצב חסכוני; ניצוץ מגע מופעל בתחילת המקרה. באיכות גבוהה פועל גם מעבר הטשטוש. FPS הוא הפרש פריימים חלקי זמן שעון אמיתי. הבדיקה רצה לבדה, אחרי סגירת דפדפן בדיקת השהייה.\n\n| מסלול | מידות | איכות | FPS שרת | קריאות ציור: ממוצע / שיא | משולשים: שיא | יחס פיקסלים |\n|---|---|---|---:|---:|---:|---:|\n`;
for(const r of perf.records){
  const calls=r.samples.map(s=>s.drawCalls),triangles=r.samples.map(s=>s.triangles);
  pm+=`| ${r.track} | ${r.viewport.width}×${r.viewport.height} | ${r.quality} | ${r.fps.toFixed(2)} | ${(calls.reduce((a,b)=>a+b,0)/calls.length).toFixed(1)} / ${Math.max(...calls)} | ${Math.max(...triangles).toLocaleString('en-US')} | ${r.last.pixelRatio} |\n`;
}
pm+='\nספירות הציור והמשולשים מחושבות מדגימות לאורך המקרה. הנתיב והראות משתנים במהלך הנסיעה, ולכן אין להסיק מהספירה בסוף מקרה בודד את עלות האיכות לבדה.\n';
pm+=`\nמנוע הרינדור שנמדד: ${perf.gl.renderer}. צפיפות המכשיר המדומה היא ${perf.deviceScaleFactor}; איכות גבוהה מוגבלת ליחס פיקסלים 1.5 וחסכונית ל-1. האמולציה מכסה מידות, צפיפות ומגע בלבד.\n\nבדיקת משאבים ממושכת: ${(data.soak.durationSeconds/60).toFixed(1)} דקות, ${data.soak.cycles.length} החלפות, ${data.soak.errors.length} שגיאות. נתונים גולמיים ב-verification/soak.json. גרף המשאבים ב-verification/stability.png.\n\nלא נקבע ציון 8 ליעד 30fps בלי מדידת מכשיר. מצבי LOD ואיכות אוטומטית מספקים מנגנוני התאמה, אך אינם תחליף למדידה.\n`;
await fs.writeFile(path.join(root,'PERFORMANCE.md'),pm);
const scope={recordedAt:now.toISOString(),branch,root:'workout/island/design/racing-v7/',changesOutsideRoot:outside,pass:outside.length===0};
await fs.writeFile(path.join(root,'verification/scope.json'),JSON.stringify(scope,null,2)+'\n');
await fs.writeFile(path.join(root,'verification/scores.json'),JSON.stringify({recordedAt:now.toISOString(),scores:scores.map(([item,score,evidence])=>({item,score,evidence})),physicalPhoneFpsVerified:false},null,2)+'\n');
console.log(JSON.stringify({report:'REPORT.md',rounds:rounds.length,screenshotCount,elapsedHours,missing:'physical-phone 30fps measurement'}));
