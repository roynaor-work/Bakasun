import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const notes=[
 ['בסיס ראשון','צבעים כהים, להבות צרות, רקע לא מעוגן ולוח בקרה גדול מדי ברוחב.'],
 ['צבעים ו־LOD','תיקון UV, צבעי רכבים קריאים, פריסה צדדית ברוחב ו־LOD קל יותר.'],
 ['חורבן ועשן','קירות חסרים ושברים, עשן נראה ואטלסי חומרים 512.'],
 ['פחות קריאות ציור','פריטי רחוב ואורות ב־instancing, פיח שקוף והפסקת ציור בהשהיה.'],
 ['מגע ומים','זרנוק מחובר ליד, כיבוי ורטיבות, בדיקת סוליות ותקרת חלקיקים.'],
 ['אצוות ואיכות מסתגלת','איחוד בניינים ורכבים לפי חומר; 45 קריאות ציור.'],
 ['סקירה ובקרות מגע','גלריה עצמאית וזיהוי פגם בכיוון משטחי ההריסות.'],
 ['בדיקת גופים סגורים','תיקון כיוון המשטחים, 5,238 גופים כלפי חוץ ומסגור נוסף.'],
 ['רצף מקורות אש','מזהה קבוע לכל מקור שומר שלב חלקיקים בעת התפשטות; בדיקות offline ושחזור context.'],
 ['מגע עם הקרקע','בסיסי הרכבים והניצבים נורמלו, מעטפת הצמיג נשמרת ב־LOD, וחיבורי הזרנוקים תואמים לעוגנים.'],
 ['מבט כולל לאורך','כל בסיס הרחוב נכנס כעת למסגרת 390×844, עם ערפל מותאם וגבולות היטל מאומתים.'],
 ['תמונות מוטמעות','כל תמונות האפקטים והשמיים מוטמעות בנתונים, כדי למנוע תלות בבקשות תמונה ובהגבלות file://.'],
];
const rounds=[];for(let i=0;i<notes.length;i++){const id=String(i+1).padStart(2,'0'),r=JSON.parse(await fs.readFile(path.join(root,'iterations',id,'capture.json'),'utf8'));rounds.push({id,title:notes[i][0],summary:notes[i][1],capturedAt:r.completedAt,captures:r.captures.map(c=>({file:c.file,triangles:c.triangles,drawCalls:c.drawCalls,particles:c.particles}))});}
await fs.writeFile(path.join(root,'review-data.js'),'window.FireReviewData='+JSON.stringify({rounds})+';\n');console.log('Review index:',rounds.length,'rounds');
