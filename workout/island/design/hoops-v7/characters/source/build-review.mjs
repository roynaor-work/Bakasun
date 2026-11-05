#!/usr/bin/env node
// Build a file://-compatible review journal. No runtime requests or dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),iterations=[];
for(const name of(await fs.readdir(path.join(root,'iterations'))).filter(n=>/^\d{2}$/.test(n)).sort()){
 try{const capture=JSON.parse(await fs.readFile(path.join(root,'iterations',name,'capture.json'),'utf8'));
 const critique=await fs.readFile(path.join(root,'iterations',name,'CRITIQUE.md'),'utf8');
 iterations.push({id:name,time:capture.finishedAtUtc,capturePass:capture.pass,screenshots:capture.screenshots.map(s=>({file:s.file,bytes:s.bytes})),critique});
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
const data=JSON.stringify(iterations).replaceAll('<','\\u003c');
const html=`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>יומן ביקורת / דמויות 07</title>
<style>*{box-sizing:border-box}body{margin:0;background:#141a1d;color:#edece3;font:15px/1.7 Arial,sans-serif}header{border-bottom:1px solid #3b4a49;padding:24px max(20px,calc((100vw - 1180px)/2));display:flex;gap:20px;align-items:center;justify-content:space-between}h1{font-size:23px;margin:0}.edition{font:36px Arial;color:#99dbc7}a{color:#a7d8c6}main{max-width:1220px;margin:auto;padding:24px 20px}p{color:#a7b9b3;max-width:800px}.controls{display:flex;flex-wrap:wrap;gap:16px;align-items:end;margin:24px 0}label{display:flex;flex-direction:column;gap:5px;color:#b9c9c2;font-size:12px}select{font:14px Arial;background:#243136;color:#edf0e8;border:1px solid #54685f;padding:10px;border-radius:5px;min-height:44px;min-width:120px}select:focus{outline:2px solid #99dbc7;outline-offset:2px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}.frame{margin:0;background:#1a2325;border:1px solid #344844;border-radius:8px;overflow:hidden}.frame h2{font-size:16px;margin:0;padding:12px 16px}.frame img{display:block;max-width:100%;height:auto;margin:auto;background:#1d2c2d}.meta{font:11px monospace;direction:ltr;padding:8px 16px;color:#91aaa0;border-top:1px solid #344844}.critique{white-space:pre-wrap;font-size:13px;line-height:1.85;margin:0;padding:20px;color:#c5d0c8;border-top:1px solid #344844;max-height:540px;overflow:auto}.legend{font-size:12px;color:#a4b8af}.missing{padding:30px;color:#dbb19e}@media(max-width:650px){header{padding:18px 20px}h1{font-size:20px}.comparison{grid-template-columns:1fr;gap:18px}.controls{gap:10px}select{min-width:100px}.frame img{max-height:844px}.critique{max-height:330px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head>
<body><header><div><h1>יומן ביקורת · דמויות כדורסל</h1><a href="standalone.html">פתיחת התצוגה התלת ממדית ←</a></div><span class="edition">07</span></header><main><p>השוואת רינדורים אמיתיים מהגרסאות שנבדקו. התמונות והביקורת נשמרו בכל סבב; אפשר לבחור שני סבבים, זווית וכיוון מסך. הצילומים אינם תמונות קונספט.</p>
<div class="controls"><label>סבב מוקדם<select id="left"></select></label><label>סבב להשוואה<select id="right"></select></label><label>מה בודקים<select id="view"><option value="near">גוף מלא</option><option value="far">סגל מרחוק</option><option value="face">פנים</option><option value="hands">ידיים וכדור</option><option value="cloth">בד</option></select></label><label>כיוון מסך<select id="size"><option value="390x844">390 × 844</option><option value="844x390">844 × 390</option></select></label></div>
<p class="legend">״צילום תקין״ מציין טעינה ובדיקה טכנית בלבד. ציוני האיכות, הכשלים והחלטת המשך מופיעים בביקורת; צילום תקין אינו אישור איכות.</p><div class="comparison"><section class="frame"><h2 id="title-left"></h2><img id="image-left" alt="רינדור הסבב המוקדם"><div class="meta" id="meta-left"></div><div class="critique" id="critique-left"></div></section><section class="frame"><h2 id="title-right"></h2><img id="image-right" alt="רינדור הסבב שנבחר להשוואה"><div class="meta" id="meta-right"></div><div class="critique" id="critique-right"></div></section></div></main>
<script id="data" type="application/json">${data}</script><script>
const rows=JSON.parse(document.getElementById('data').textContent),get=id=>document.getElementById(id);
for(const side of ['left','right'])get(side).innerHTML=rows.map(r=>'<option value="'+r.id+'">סבב '+r.id+'</option>').join('');
if(rows.length){get('left').value=rows[0].id;get('right').value=rows.at(-1).id;}
function draw(){for(const side of ['left','right']){const row=rows.find(r=>r.id===get(side).value);if(!row)continue;const name=get('size').value+'-'+get('view').value+'.webp',shot=row.screenshots.find(s=>s.file===name);get('title-'+side).textContent='סבב '+row.id+' · '+(row.capturePass?'צילום תקין':'צילום עם הערת שחזור');const img=get('image-'+side);img.hidden=!shot;if(shot)img.src='iterations/'+row.id+'/'+shot.file;get('meta-'+side).textContent=new Intl.DateTimeFormat('he-IL',{timeZone:'UTC',dateStyle:'short',timeStyle:'short'}).format(new Date(row.time))+' / UTC / '+(shot?(shot.bytes/1000).toFixed(1)+' KB':'לא צולם');get('critique-'+side).textContent=row.critique;}}
for(const id of ['left','right','view','size'])get(id).addEventListener('change',draw);draw();
</script></body></html>`;
await fs.writeFile(path.join(root,'review.html'),html);
console.log(JSON.stringify({file:'review.html',iterations:iterations.map(i=>i.id),bytes:Buffer.byteLength(html)}));
