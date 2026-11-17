import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {ROOT,save,mb} from './common.mjs';
export async function writeReport(m,inventory,quality) {
  const t=m.totals,bySource=new Map(m.assets.map(a=>[a.source,a])),images=quality.filter(a=>a.quality?.width),motion=quality.filter(a=>a.motion),models=quality.filter(a=>a.source.endsWith('.glb')),audio=quality.filter(a=>a.quality?.sampleRate),loops=audio.filter(a=>a.quality.loop);
  const max=(a,k)=>Math.max(0,...a.map(v=>v[k]||0)),pct=(a,b)=>(100*(1-b/a)).toFixed(1),types={};
  for(const a of inventory.assets){const v=types[a.extension]||={n:0,bytes:0};v.n++;v.bytes+=a.bytes;}
  let browser,verification;try{browser=JSON.parse(await readFile(path.join(ROOT,'verification/browser.json')));}catch{}try{verification=JSON.parse(await readFile(path.join(ROOT,'verification/verify.json')));}catch{}
  await save(path.join(ROOT,'report.md'),`# צינור דחיסת נכסי האי — גרסה 1

בסיס: \`${m.sourceCommit}\`. ענף: \`codex/asset-compression-v1\`. כל השינויים בתיקייה החדשה בלבד. קובצי המקור, המשחקים, מדיניות האבטחה ומניפסט המקור לא נערכו. רישום המסירה נשמר כאן; הוראת המשימה שלא לערוך מחוץ לתיקייה גוברת על הנוהל הכללי לערוך את חדר הבקרה.

**התוצר אינו דורש WebAssembly בטלפון.** אין בו מפענחי Draco, Meshopt, Basis/KTX2 או Brotli ב־WASM, ואין workers או חריגת CSP. בדיקת הדפדפן משביתה את WebAssembly לחלוטין וחוסמת גם בקשות למפענחים. החבילה מוכנה לחיבור; האפליקציה הקיימת עדיין משתמשת בנתיבים המקוריים. לא שונתה גרסה ולא בוצעה פריסה.

קריטריון סיום: סקר מלא, עותקים בטוחים לפי ספים, מניפסט עם חתימות, השוואה חזותית והוראות שחזור; ללא עריכת קבצים קיימים.

## לפני ואחרי לכל משחק

כל MB הוא 1,000,000 בתים. מקור רשימות המשחקים הוא \`../../offline-manifest.json\`, SHA-256: \`${m.offlineManifestSHA256}\`. נתיב ריק נספר כ־index.html. שורות משחקים משתפות קבצים ולכן אין לחבר ביניהן.

| משחק | לפני במניפסט MB | לפני כולל תלויות MB | אחרי, נכסי המשחק MB | חיסכון | התקנה קרה עם ליבה, מעטפת וקורא MB |
|---|---:|---:|---:|---:|---:|
${Object.entries(m.games).map(([name,g])=>`| ${name} | ${mb(g.beforeBytes)} | ${mb(g.dependencyCompleteBeforeBytes)} | ${mb(g.afterBytes)} | ${pct(g.dependencyCompleteBeforeBytes,g.afterBytes)}% | ${mb(g.withSharedBeforeBytes)} → ${mb(g.withSharedAfterBytes+t.runtimeIndexBytes)} |`).join('\n')}

| הורדה ייחודית, כל המשחקים | MB |
|---|---:|
| מקור במניפסט | ${mb(t.uniqueManifestBeforeBytes)} |
| מקור עם תלויות GLB | ${mb(t.dependencyCompleteBeforeBytes)} |
| תוצרים נבחרים אחרי ביטול כפילויות SHA-256 | ${mb(t.selectedAssetBytes)} |
| קוד קורא JavaScript, ללא מפענחי WASM | ${mb(t.runtimeDecoderBytes)} |
| אינדקס ריצה | ${mb(t.runtimeIndexBytes)} |
| **הורדה סופית** | **${mb(t.selectedWithRuntimeAndIndexBytes)}** |
| חיסכון מול המקור עם תלויות | **${pct(t.dependencyCompleteBeforeBytes,t.selectedWithRuntimeAndIndexBytes)}%** |

אין הנחה שהשרת דוחס את המקור ב־HTTP. גדלים יכולים לעלות בנכס מסוים: מקור עם Draco/Meshopt נפתח ל־GLB רגיל לצורך תאימות למדיניות החדשה. כל עלייה כזו כלולה בחישוב; אין הצגת גודל של נכס שאסור להריץ כפתרון מותר.

הגודל הפיזי של כל תוצרי המדידה ב־compressed הוא ${mb(t.physicalArtifactsBytes)} MB. הוא כולל גם עותקי ייחוס וחלופות gzip/Brotli. בהפצה בוחרים **רק** output של רשומות לא מושמטות, קובצי runtime ו־offline-pack.json. אין להפיץ reference, variants, node_modules, קובצי ביקורת או סקר כחלק מהורדת המשחק.

נוספו ${inventory.extraDependencies.length} טקסטורות חיצוניות שאינן מופיעות במניפסט המקורי. ארבעה דגמי גוף מפנים לאטלס משותף דרך מיפוי שכבר קיים ב־minigames/athlete-body-v2.mjs וב־minigames/hoops-body-v2.mjs; הכלי משתמש באותו מיפוי. הטקסטורות של המודלים מוטמעות בעותקי ה־GLB, בלי תלות ברשת.

## טכניקות ומדיניות WASM

| טכניקה | דורשת WASM באפליקציה | החלטה |
|---|---|---|
| GLB רגיל | לא | נבחר; GLTFLoader רגיל |
| KHR_mesh_quantization | לא | Int16 לנורמלים וטנגנטים, UInt16 ל־UV בטווח 0–1; פענוח חומרה רגיל של WebGL |
| WebP lossless | לא | פענוח תמונה מובנה בדפדפן |
| OGG Opus | לא | פענוח שמע מובנה; ספי איכות ולולאה |
| Int16 ל־JSON תנועה | לא | קורא JavaScript קטן, ללא קוד דינמי |
| gzip | לא | DecompressionStream המובנה; נבחר להפצה |
| Brotli | לא אם מוגש עם Content-Encoding br, או יש API מובנה תואם | נשמר למדידת גודל בלבד; אינו נבחר כקובץ runtime, ואינו דורש ספריית פענוח |
| Draco | כן במפענח שהיה בריפו | נפסל; הוסר מכל GLB בתוצר |
| Meshopt | כן במפענח שהיה בריפו | נפסל; הוסר מכל GLB בתוצר |
| KTX2 / Basis | כן במסלול הטרנסקוד המקובל | נפסל; לא נוצר ולא מופץ |
| מפענח Brotli ב־WASM | כן | נפסל; אינו מופץ |

**הבחנה בין בנייה לריצה:** נכסי מקור שכבר דחוסים ב־Draco/Meshopt נפתחים פעם אחת בכלי authoring במחשב הבנייה, שבו WASM זמין. מודולים אלה נמצאים רק ב־node_modules המוחרג מ־Git. גם מקודד WebP exact עשוי להשתמש ב־WASM במחשב הבנייה. הטלפון מקבל קבצים רגילים בלבד. הדבר נדרש כדי להמיר את הנכסים הקיימים בלי להשאיר מפענח חסום בתוצר. כל רשומת תוצר נושאת requiresWASM:false; קובצי מפענח ישנים מסומנים omitted ואינם חלק מהאינדקס.

## מדידה ובדיקות איכות

נסרקו ${inventory.assets.length} נכסים, ${mb(inventory.totalScannedBytes)} MB, בשתי התיקיות assets ו־design; תיקיית התוצר ו־node_modules מוחרגות. [טבלת 60 הנכסים הגדולים](inventory.md) ו־[סקר מלא](inventory.json) מכילים גדלים ושיוך להורדה ולמשחקים.

| סוג | מספר | MB |
|---|---:|---:|
${Object.entries(types).sort((a,b)=>b[1].bytes-a[1].bytes).map(([name,v])=>`| ${name} | ${v.n} | ${mb(v.bytes)} |`).join('\n')}

### גאומטריה

${models.length} מודלים נפתחו ל־GLB רגיל ונבדקו לאחר קריאה חוזרת. אין שינוי במיקום קודקודים, במספרם, בסדרם, באינדקסי המשולשים, במשקלי השלד או בנתוני האנימציה. קוונטיזציה מוצעת רק לנורמלים, טנגנטים ו־UV; UV שחורג מטווח 0–1 נשאר במקור. ספי הקבלה: מיקום 0, זווית נורמל/טנגנט עד 0.01°, ו־UV עד 0.5/65535. מטריצות עולם נבדקות עד 1e-9 לסטיית חישוב double בעת סריאליזציה. שינוי מעבר לסף מבטל את מועמד הקוונטיזציה.

| מדד מועמדי GLB | מקסימום נמדד |
|---|---:|
| סטיית מיקום קודקוד | ${max(models.map(a=>a.quality),'maxPositionError')} |
| זווית נורמל/טנגנט | ${max(models.map(a=>a.quality),'maxNormalDegrees').toPrecision(7)}° |
| סטיית UV | ${max(models.map(a=>a.quality),'maxUVError').toPrecision(7)} |
| סטיית רכיב מטריצת עולם | ${max(models.map(a=>a.quality),'maxNodeMatrixError').toPrecision(7)} |

לכל מודל הושוו GLB רגיל מול קוונטיזציה ו־WebP, עם ובלי gzip. נבחר הגודל הקטן שעבר בדיקה. מקור דחוס שדורש WASM אינו מועמד לבחירה. עותק הייחוס של התצוגה הוא המקור המפוענח, ללא קוונטיזציה נוספת, ולכן גם השוואת לפני/אחרי אינה דורשת מפענח חסום.

### תמונות

WebP lossless נבחר רק אם קטן יותר ושחזור כל RGBA מדויק, **כולל RGB תחת אלפא אפס**. כך צבע נסתר לא משתנה בסינון טקסטורות. JPEG מומר מפיקסליו המפוענחים בלי אובדן נוסף. אין שינוי ברזולוציה או בשקיפות. תמונה עם ICC, EXIF rotation או אנימציה נשמרת ללא המרה ומסומנת לבדיקה. אותו שער חל על טקסטורות מוטמעות במודלים. שגיאת RGBA מקסימלית במועמדים שהתקבלו: ${max(images.map(a=>a.quality),'maxRGBAError')}/255.

מדידות CPU עם sharp/libvips: חימום, ואז חציון 3 פענוחים. זמני מכונת ענן אינם זמני טלפון. WebP נתמך ב־Safari מ־iOS 14 וב־Chrome לנייד. אין הפחתה בזיכרון GPU המפוענח.

| תמונה | לפני MB | אחרי MB | פענוח מקור ms | פענוח WebP ms |
|---|---:|---:|---:|---:|
${images.filter(a=>bySource.get(a.source)?.selected).sort((a,b)=>bySource.get(b.source).sourceBytes-bySource.get(a.source).sourceBytes).slice(0,8).map(a=>`| ${a.source} | ${mb(bySource.get(a.source).sourceBytes)} | ${mb(bySource.get(a.source).bytes)} | ${a.sourceDecodeMS} | ${a.webpDecodeMS} |`).join('\n')}

בדיקת Canvas נוספת משקללת אלפא. מסלולי PNG/WebP ב־Chromium מעגלים premultiplied alpha אחרת: סף הדפדפן הוא עד 2.1/255 לערוץ גלוי ועד 0.25/255 בממוצע. שער RGBA של הקידוד עצמו נותר 0.

### צליל ולולאות

${audio.length} קבצים נבדקו. Opus קיים נשמר בלי דור קידוד נוסף אם הלולאה תקינה. למקורות אחרים נוצר מועמד Opus VBR, 64kbps למונו או 96kbps לסטריאו, 48kHz. נבחר רק אם קטן יותר, מספר הדגימות זהה אחרי פענוח, SNR לפחות 32dB ושגיאת דגימה מקסימלית 0.035 full scale. לולאה שנכשלה מקבלת גם מועמד עם fade קוסינוס 5ms, שחייב לעבור את אותו שער איכות. דחיסה שנכשלה אינה מופעלת, והמקור נשמר.

${loops.length} קבצים סומנו כלולאות לפי שמם ומשפחות engine/wind/waves/fire/crowd. ספי גבול סגירה: קפיצת אמפליטודה עד 0.003 וקפיצת שיפוע עד 0.006. נמדדות כל הלולאות המפוענחות, ללא קיצור/הוספת שקט. אלו ספים מספריים שמרניים; אין טענה שבוצעה האזנה אנושית בטלפון. התצוגה מאפשרת ניגון לולאות רציף ב־WebAudio להשוואה.

לולאות בתוצר שנבחר שאינן עוברות את שער הסגירה, ודורשות ביקורת/טיפול לפני חיבור:

${loops.filter(a=>!a.quality.outputSeam.pass).map(a=>`- \`${a.source}\`: jump=${a.quality.outputSeam.jump.toPrecision(5)}, slope=${a.quality.outputSeam.slopeJump.toPrecision(5)}; המקור נשמר ולא סומן בטוח ללולאה.`).join('\n')||'כל הלולאות המסומנות עברו.'}

Opus ב־OGG נתמך ב־Safari מ־iOS 18.4 וב־Chrome לנייד. עבור iPhone ישן יותר יש לשמר MP3 fallback; קובצי MP3 שלא עברו המרה בטוחה נשמרים. אין הסרה אוטומטית של זוג MP3/OGG רק בגלל שם זהה.

### JSON של תנועה

${motion.length} קבצים עם keyframes זוהו, גם תחת states/libraries/clips. סיבובי עצמות נארזים ב־Int16 עם scale=1/32767; תזוזות מקומיות במטרים נארזות לפי הטווח. וקטור גדול שאינו עומד בסף נשמר כמספריו המקוריים. זמנים, אירועים, מזהים, skeleton, משכים ונתוני מגע נשמרים בדיוק; לא מושמטים פריימים. קורא JavaScript רגיל משחזר את המבנה המקורי.

| מדד | סף | סטייה מקסימלית |
|---|---:|---:|
| רכיב quaternion | 0.5/32767 | ${max(motion.map(a=>a.motion),'maxComponentError').toPrecision(7)} |
| זווית סיבוב | 0.01° | ${max(motion.map(a=>a.motion),'maxRotationDegrees').toPrecision(7)}° |
| וקטור תזוזה | 0.0002m | ${max(motion.map(a=>a.motion),'maxTranslationMeters').toPrecision(7)}m |
| מפרק אחרי FK כשיש skeleton | 0.001m | ${max(motion.map(a=>a.motion),'maxForwardKinematicsMeters').toPrecision(7)}m |

נבדקו ${motion.reduce((s,a)=>s+(a.motion.framesWithForwardKinematics||0),0)} פריימים ב־FK. בלי שלד בקובץ נמדדו ערכי סיבוב ותזוזה מקומיים בלבד. הספים מתאימים לשגיאה שמתחת לפיקסל: בדמות בגובה 2m המוצגת על 400 פיקסלים, 1mm הוא כ־0.2 פיקסל.

לכל JSON הושוו JSON מוקטן ו־Int16 תחת gzip ברמה 9 ו־Brotli ברמה 11. הבחירה לריצה היא הקטן מבין מועמדי **gzip** הבטוחים. חלופות Brotli נשמרות במדידה בלבד, בגלל מגבלת הפענוח המקומי ללא WASM. gzip נפרס ב־DecompressionStream; יש להגיש קובצי gz כבתים רגילים **ללא Content-Encoding**, משום שהקורא פורס אותם ובודק חתימת הבתים הארוזים.

## דגלים וחתימות

manifest.json כולל לכל נכס מקור וגודלו, SHA-256 מקור, תוצר וחתימתו, requiresWASM, compressionSafe, selected, תלויות וחלופות. loopSafe מתייחס ללולאה בתוצר בפועל. compressionSafe מתייחס למועמד בלבד: כישלון משאיר את המקור, או GLB רגיל ללא קוונטיזציה. reference הוא עותק לפני לביקורת, ואינו חלק מההורדה. קובצי מפענח שנפסלו מסומנים omitted והם חסרים מאינדקס הריצה.

${m.assets.filter(a=>a.omitted).length} משאבי פענוח ישנים הושמטו; ${m.assets.filter(a=>!a.omitted&&!a.compressionSafe).length} מועמדי דחיסה נדחו בשער איכות. הסיבות והמדידות לכל נכס ב־quality.json; אין החלה שקטה של מועמד שנכשל.

## הוראות הרצה

נדרשים Node 22 ומעלה ו־FFmpeg/ffprobe עם libopus. סביבת המדידה: ${m.toolVersions.node}; ${m.toolVersions.ffmpeg}. תלויות יצירה נעולות ב־package-lock.json. Python/Playwright/Chromium נדרשים רק לבדיקת דפדפן.

1. משורש הריפו מתקינים כלי יצירה:

\`\`\`sh
cd workout/island/design/asset-compression-v1
npm ci --cache /tmp/bakasun-npm-cache
\`\`\`

2. מודדים, דוחסים על עותקים ומאמתים:

\`\`\`sh
npm run measure
npm run compress
npm test
npm run verify
\`\`\`

הצינור מצלם את כל מקורות המניפסט ותלויותיהם ל־.work/input, מפעיל codecs על העותקים בלבד, ובודק שוב את חתימות המקור בסיום. ברירת המחדל תואמת להורדה הקיימת. \`node tools/compress.mjs --all\` כולל גם נכסי עבודה וסקירה מהסקר, ועשוי ליצור תוצר גדול בהרבה או לדרוש מקור לתלות חסרה.

3. להצגת [השוואה חזותית](http://localhost:8765/workout/island/design/asset-compression-v1/preview.html), משורש הריפו:

\`\`\`sh
python3 -m http.server 8765
\`\`\`

בוחרים משחק וסוג נכס. מודלים חולקים מצלמה וזמן אנימציה; תנועה מוצגת על שלד ייחוס, תמונות זו לצד זו, וצלילים כוללים כפתור לולאה רציפה.

4. בדיקת דפדפן עם WebAssembly מושבת ובלי בקשות חיצוניות:

\`\`\`sh
python3 workout/island/design/asset-compression-v1/tools/check-browser.py
\`\`\`

5. חיבור עתידי: runtime/loader.mjs מקבל URL של offline-pack.json ומספק json לקריאת תנועה/JSON, glb ל־GLTFLoader רגיל ו־resolve לתמונה/צליל. לפני ריצה ללא חיבור מורידים את output ואת runtime לפי האינדקס. אין להוסיף מפענח או הרשאת WASM ל־CSP. קוד קיים שקורא response.json ישירות צריך לעבור דרך הקורא החדש; אין כאן עריכה אוטומטית של קוד המשחקים או service worker.

## אימות ומגבלות

${verification?`אימות נכסים: ${verification.passed} עברו, ${verification.failed} נכשלו.`:'אימות טרם הושלם.'} ${browser?`בדיקת דפדפן: ${browser.pass?'עברה':'לא הושלמה'}, WASM disabled=${browser.wasmDisabled}; ${browser.models.length} מודלים, ${browser.jsonFiles} קובצי JSON, ${browser.audioFiles} צלילים.`:'בדיקת דפדפן טרם הושלמה.'}

- [אימות חתימות, איכות ותקינות GLB](verification/verify.json).
- [בדיקת דפדפן, זמני טעינה והשוואת פיקסלים](verification/browser.json).
- [כל המדידות לכל נכס](quality.json).
- [בדיקות היחידה של הכלי](verification/unit.xml).
- [סטטוס סוויטת הריפו המלאה](verification/repository-tests.json): נצפו 4,204 בדיקות עוברות. הריצה לא הושלמה; בדיקת הדפדפן הקיימת workout-royiki נשארה פעילה בלי פלט מעל 20 דקות והופסקה. קובץ הבדיקה לא נערך.

זמני beforeMS בדוח הדפדפן הם טעינת עותק מקור שנפתח ל־GLB רגיל במחשב הבנייה, עם gzip; הם אינם זמני פענוח Draco/Meshopt במכשיר. פענוח זה אינו מותר במדיניות הריצה החדשה.

מכשיר טלפון פיזי והאזנה אנושית אינם זמינים בבדיקה זו. מספרי הענן אינם הבטחת fps או זמן פענוח במכשיר. לולאות שסומנו לבדיקה אינן מאושרות כנטולות קליק. הטכניקות שנפסלו בגלל WASM אינן פתרון חלופי במניפסט הריצה.
`);
}
