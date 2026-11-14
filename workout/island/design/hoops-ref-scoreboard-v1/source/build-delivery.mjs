// Generate the inventory and review report from measured, final asset evidence.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root)));
const [model,board,motion,qa,native,assets,browser,repoTests]=await Promise.all([
  read('model-metadata.json'),read('scoreboard-metadata.json'),read('motion/motions.json'),
  read('verification/motion-qa/summary.json'),read('verification/motion-qa/native-validation.json'),
  read('verification/assets.json'),read('verification/browser.json'),read('verification/repository-tests.json')
]);
if(!qa.pass||!native.pass||!assets.pass||!browser.pass)throw new Error('Delivery gates failed');
const report=await read('verification/motion-qa/output/report.json');
const inventory=[];
for(const path of ['models/referee.glb','models/scoreboard.glb',...['idle','run','whistle','foul','three_points','direction'].map(id=>'motion/'+id+'.glb'),'textures/referee-atlas.png','textures/digits.png']){
  const bytes=await readFile(new URL(path,root));inventory.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const referee=inventory.find(x=>x.path==='models/referee.glb');
if(native.sha256!==referee.sha256||!report.libraries[0].sources.some(s=>s.sha256===referee.sha256))throw new Error('Motion evidence is stale');
for(const asset of assets.assets)if(inventory.find(x=>x.path===asset.path)?.sha256!==asset.sha256)throw new Error('Asset evidence is stale: '+asset.path);
const clips=qa.clips.map(c=>{const n=native.clips.find(x=>x.id===c.id),entry=motion.clips.find(x=>x.id===c.id);return {id:c.id,label:entry.label??entry.metadata?.label,durationSeconds:Math.round(n.duration*30)/30,frames:n.frameCount,sampleRateHz:30,loop:['idle','run'].includes(c.id),asset:'models/referee.glb',animation:c.id,standalone:'motion/'+c.id+'.glb',qaScore:c.score,qaCoverage:c.coverage,rootCycleDisplacementMeters:n.cycleDisplacementMeters};});
const manifest={schemaVersion:1,id:'hoops-ref-scoreboard-v1',version:1,branch:'codex/hoops-ref-scoreboard-v1',baseCommit:'19d9cdc5e3718236df5a2fc4d8b8c26c72007575',scope:{newFilesOnly:true,prefix:'workout/island/design/hoops-ref-scoreboard-v1/',completion:'canonical18 referee around1200 triangles; six native30Hz clips strictly above88; suspended atlas-digit scoreboard, timers,redlight; QA,report,push'},units:'meters',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},preview:'preview.html',licenses:'LICENSES.md',report:'REPORT.md',referee:{asset:'models/referee.glb',triangles:model.triangles,boneCount:18,skeleton:'motion/skeleton.json',textures:['textures/referee-atlas.png'],embeddedTextures:true,requiredExtensions:[],source:model.source,clips},scoreboard:{asset:'models/scoreboard.glb',triangles:board.triangles,faces:4,digitQuads:52,trianglesPerDigit:2,textureCount:1,atlas:board.atlas,embeddedTextures:true,runtime:'runtime/scoreboard.mjs',metadata:'scoreboard-metadata.json',initial:board.initial,placement:board.placement,completeBounds:board.completeBounds},qa:{tool:'motion-qa-v1',commit:qa.qaCommit,minimumExclusive:88,nativeSampleRateHz:30,evaluationSampleRateHz:qa.sampleRateHz,summary:'verification/motion-qa/summary.json',html:'verification/motion-qa/output/report.html',raw:'verification/motion-qa/output/report.json',native:'verification/motion-qa/native-validation.json',skinAndGLTF:'verification/assets.json',browser:'verification/browser.json',repoTests:'verification/repository-tests.json',allClipsPassed:qa.pass},runtimeContract:{run:'Root travels1.28m forward per0.8s cycle (1.6m/s). Extract displacement into actor movement; review scene zeroes horizontal Root for treadmill playback.',gestures:'One-shot clips begin and end at common idle; use short animation blending. Run-to-idle requires blending.',time:'tick(dt) receives elapsed simulationseconds. Host owns suspension on visibility change. Either clock reachingzero stops both and fires redlight for2s.',scoreboardFactory:'createScoreboard({THREE,root,initial,onEvent})',clockFactory:'createClock(initial,onEvent)',methods:['setState(patch)','start()','pause()','tick(dt)','resetGame(seconds)','resetShot(14|24)','flashRed(seconds)','snapshot()','display()','dispose()']},files:inventory};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
const names={idle:'עמידה',run:'ריצה',whistle:'שריקה',foul:'סימון עבירה',three_points:'שלוש נקודות',direction:'הצבעה על כיוון'};
const clipRows=clips.map(c=>'| '+names[c.id]+' / `'+c.id+'` | '+c.durationSeconds+' | '+c.frames+' | '+c.qaScore+' | 100% |');
const lines=[
  '# שופט כדורסל ולוח תוצאות · v1','',
  'החבילה כוללת שופט בחולצת פסים שחור־לבן, מכנסיים ונעליים שחורים, שריקה ולולאת צוואר; שישה קליפים מקוריים ב־30Hz; ולוח תוצאות תלת־ממדי תלוי בעל ארבע פאות, שעוני משחק וזריקה, ניקוד, רבע ונורת סיום אדומה. כל הקבצים חדשים ונמצאים בתיקייה זו בלבד.','',
  '| פריט | תוצאה |','|---|---|',
  '| ענף | `codex/hoops-ref-scoreboard-v1` |',
  '| בסיס | `19d9cdc5e3718236df5a2fc4d8b8c26c72007575` מתוך main |',
  '| שופט | '+model.triangles+' משולשים, כולל השריקה והלולאה; 18 עצמות קנוניות; '+referee.bytes.toLocaleString('en-US')+' בתים, כולל שש האנימציות והאטלס |',
  '| לוח | '+board.triangles+' משולשים; '+board.bytes.toLocaleString('en-US')+' בתים; ארבע פאות ו־52 משטחי ספרות |',
  '| ספרות | שני משולשים לכל ספרה, טקסטורת PNG משותפת אחת; עדכון UV בעת שינוי ספרה |',
  '| תלייה | בית הלוח בגובה מקומי 0.065–2.25 מ׳; כבלים עד 4.2 מ׳. בתצוגה בסיסו ב־4.75 מ׳ מעל המגרש |',
  '| טעינה | מודלים וטקסטורות מוטבעים, ללא תלות ב־CDN או מפענחי דחיסה |','',
  '## תוצאות motion-qa-v1','',
  'הופעל הכלי המקורי ללא שינוי במדדים או בספים, מקומיט `'+qa.qaCommit+'` בענף `codex/motion-qa-v1`, לפי הנתיב שתועד בדוחות הקודמים. מתאם הקלט מחליף רק את רשימת הנכסים. הכלי דוגם ישירות את שש האנימציות מתוך `models/referee.glb` הסופי, עם בדיקה צפופה ב־120Hz; קובצי ההנפשה עצמם מכילים דגימות ב־30Hz. לכל קליפ ציון גדול מ־88, כיסוי מלא וללא מדד אדום או חסר.','',
  '| קליפ | שניות | פריימים כולל קצוות | ציון | כיסוי |','|---|---:|---:|---:|---:|',...clipRows,'',
  '[הדוח האינטראקטיבי](verification/motion-qa/output/report.html) · [תוצאות גולמיות](verification/motion-qa/output/report.json) · [פקודה, גיבובי הכלי והסיכום](verification/motion-qa/summary.json). בדיקות נוספות מאמתות זהות בין זרמי התנועה המבודדים וה־GLB המשולב, שלד מנוחה מדויק, קווטרניונים מנורמלים, קצב דגימה וקצוות הלולאות.','',
  '## אימות חזותי וטכני','',
  '- [בדיקת הנכסים](verification/assets.json): Khronos glTF Validator ללא שגיאות או אזהרות; מיפוי משקולות, מטריצות inverse bind, משטחי הספרות והטקסטורה נבדקו. כל 1,062 קודקודי השופט המונפש נדגמו ב־120Hz ובגבולות המגע, בנוסף למדידת השלד הרשמית: ללא חדירה לרצפה; סוליות תומכות בריצה בגובה 2.238–3.985 מ״מ ובמחוות בגובה 3.500 מ״מ. בלוח קיימות 20 הערות מידע בלבד על UV שאינו נחוץ לחלק ממשטחי הרקע.',
  '- [בדיקת דפדפן](verification/browser.json): '+browser.checks.length+' בדיקות עברו ב־Chromium עם WebGL/SwiftShader; הפעלת כל קליפ וגרירת הזמן, שעונים, עצירה, איפוס, עדכון ספרות ונורה אדומה. מידות 1440×1000, 390×844 ו־844×390; ללא שגיאות JavaScript או בקשות נכשלות.',
  '- [בדיקת לוח](verification/scoreboard-browser.json): ארבע הפאות נבדקו חזותית, והניקוד משתקף בכל הספרות. `node --test source/scoreboard.test.mjs` בודק דיוק תזמון, גבולות, איפוסים, השהיה, סיום מוקדם ושחרור משאבים.',
  '- [בדיקות המאגר](verification/repository-tests.json): '+(repoTests.summary??'ראו פירוט בקובץ הראיות')+'. קוד המשחק הקיים לא שונה.',
  '- חבילת המקור ומצב הסשן מתועדים כאן; `ops/CONTROL.md` נשאר ללא שינוי בהתאם להנחיית קבצים חדשים בלבד.','',
  '## צפייה','',
  '1. מתוך שורש המאגר הפעילו `python -m http.server 8765 --bind 127.0.0.1`.',
  '2. פתחו [את התצוגה המקומית](http://127.0.0.1:8765/workout/island/design/hoops-ref-scoreboard-v1/preview.html).',
  '3. בחרו ״השופט״ להפעלת ששת הקליפים, או ״הלוח״ לבדיקת שעונים, ניקוד ונורת סיום. התוצאה הצפויה: דמות יציבה, מחוות נבדלות, ספרות קריאות בכל פאה ואור אדום בעת אפס.','',
  '![תצוגת מגרש](verification/preview-desktop.png)','',
  '## חוזה חיבור ומגבלות','',
  '- צירים: ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאל אנטומי; יחידות מטר. השלד תואם בדיוק את חוזה 18 העצמות של motion2, כולל שמות, היררכיה ומיקומי מנוחה.',
  '- הריצה כוללת התקדמות Root אמיתית של 1.28 מ׳ במחזור 0.8 שנ׳, שהם 1.6 מ׳/ש׳. בחיבור למשחק יש לחלץ התקדמות זו לתנועת הדמות; בתצוגה היא מוסרת כדי להציג ריצה במקום. מעבר מריצה לעמידה דורש blend קצר; מדד רציפות המעבר בבודק צהוב, ללא השפעה על סף המעבר. המחוות החד־פעמיות חוזרות לאותה עמידת מנוחה.',
  '- `createScoreboard({THREE,root,initial,onEvent})` מתוך `runtime/scoreboard.mjs` קושר את סצנת ה־GLB. קראו `tick(dt)` עם זמן סימולציה בשניות. המארח אחראי להשהיה כשהאפליקציה ברקע. סיום אחד השעונים עוצר את שניהם ומפעיל נורה אדומה לשתי שניות; ניקוד בטווח 0–999, רבע 1–9, שעון משחק עד 99:59.',
  '- תקציב כ־1,200 משולשים מגביל פרטי פנים ואצבעות; קריאות המחוות נשענת על תנוחת הזרועות והגוף. לולאת הצוואר אינה חבל מדומה. אין שמע שריקה או חיבור ללוגיקת המשחק בחבילה זו.',
  '- נבדק בדפדפן שולחני עם SwiftShader. בדיקת טלפון פיזי טרם בוצעה. קבצי המקור, הרישיונות וגיבובי הנכסים מצורפים.','',
  '## שחזור','',
  '```sh',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/build-referee.mjs',
  'python workout/island/design/hoops-ref-scoreboard-v1/source/build-scoreboard.py',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/author-motion.mjs',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/assemble.mjs',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/run-motion-qa.mjs',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/verify-motion.mjs',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/validate-assets.mjs',
  'node --test workout/island/design/hoops-ref-scoreboard-v1/source/scoreboard.test.mjs',
  'python workout/island/design/hoops-ref-scoreboard-v1/source/verify-browser.py',
  'ISLAND_PLAYWRIGHT="$PWD/workout/island/design/hoops-ref-scoreboard-v1/source/system-chromium.mjs" npm test',
  'node workout/island/design/hoops-ref-scoreboard-v1/source/build-delivery.mjs',
  '```','',
  'יש להפעיל שרת HTTP לפני בדיקת הדפדפן. תלות כלי ההפקה הזמנית מפורטת בראש `source/build-referee.mjs`; בודק הנכסים משתמש ב־`gltf-validator` שב־`/tmp/hoops-ref-validation`. גופן Open Sans מותקן נדרש רק לבניית אטלס התוויות מחדש. להפעלת התצוגה אין צורך בכלי הפקה.'
];
await writeFile(new URL('REPORT.md',root),lines.join('\n')+'\n');
console.log(JSON.stringify({manifest:'manifest.json',report:'REPORT.md',refereeBytes:referee.bytes,scores:clips.map(c=>[c.id,c.qaScore])}));
