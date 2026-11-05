/** Generate a local, dependency-free gallery from actual matrix observations. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const pack=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(pack,'verification/matrix');
const source=await fs.readFile(path.join(folder,'cases.jsonl'),'utf8');
const lines=source.split('\n');lines.pop();
const cases=lines.filter(Boolean).map(line=>JSON.parse(line));
const images=[];
for(const c of cases){
  if(!c.screenshot)continue;
  if(path.basename(c.screenshot)!==c.screenshot)throw Error('Unsafe image path: '+c.screenshot);
  const stat=await fs.stat(path.join(folder,c.screenshot));
  images.push({id:c.id,file:c.screenshot,viewport:c.viewport,configuration:c.configuration,bytes:stat.size,elapsedSeconds:c.elapsedSeconds,playing:c.snapshot.playing,runTime:c.snapshot.time,time:c.screenshotPose?.time??c.snapshot.time,phaseSource:c.screenshotPose?.phaseSource??'original attempt',duration:c.snapshot.clipDuration,geometry:c.snapshot.memory.geometries,textures:c.snapshot.memory.textures,pixelRatio:c.snapshot.pixelRatio,playbackPass:c.playbackPass,resourcesPass:c.resourcesPass});
}
const runState=JSON.parse(await fs.readFile(path.join(folder,'run-state.json'),'utf8'));
const metadata={generatedAt:new Date().toISOString(),cases:cases.length,expectedCases:504,sourceJSONLSHA256:createHash('sha256').update(source).digest('hex'),casesPass:cases.every(c=>c.playbackPass&&c.resourcesPass),complete:cases.length===504,continuations:runState.continuations?.length??0,replayCases:runState.replayCaseCount??0,replayExpected:runState.replayExpectedCount??0,images};
const data=JSON.stringify(metadata).replaceAll('<','\\u003c');
const html=`<!doctype html>
<html lang="he" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>אלפיין v7 · גלריית בדיקת המטריצה</title>
<style>
:root{font:16px/1.5 system-ui,Arial,sans-serif;color:#172a39;background:#eef2f3;color-scheme:light}*{box-sizing:border-box}body{margin:0}header{padding:30px max(20px,5vw) 24px;background:#102d3c;color:#f5f6ee}h1{font-size:clamp(1.5rem,4vw,2.2rem);line-height:1.2;margin:0 0 12px}header p{max-width:850px;margin:8px 0;color:#d7e3e5}nav{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px}a{color:inherit;text-underline-offset:3px}main{max-width:1500px;margin:auto;padding:24px 20px 50px}.filters{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:12px;padding:18px;background:#fff;border:1px solid #d4dee0;border-radius:12px}label{display:grid;gap:5px;font-size:.85rem;font-weight:650}select,button{font:inherit;color:#172a39;background:#f7f9f9;border:1px solid #b7c7ce;border-radius:7px;padding:9px;min-height:42px;max-width:100%}select:focus,button:focus,a:focus{outline:3px solid #3195b8;outline-offset:3px}.status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0}.status p{margin:0}button{cursor:pointer;background:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:20px;align-items:start}.card{background:#fff;border:1px solid #d4dee0;border-radius:12px;overflow:hidden}.image{display:flex;justify-content:center;background:#142733;min-height:180px}.image img{display:block;width:100%;height:360px;object-fit:contain}.caption{padding:15px}.caption h2{font-size:1rem;margin:0 0 8px}.caption p{margin:5px 0;font-size:.83rem;color:#465f6b}.caption .technical{direction:ltr;text-align:left;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pass{display:inline-block;color:#1c5e43;background:#e8f4ec;border-radius:5px;padding:2px 7px;font-size:.78rem}.fail{color:#8a2634;background:#fbe9eb}.empty{padding:40px;text-align:center;background:#fff;border:1px solid #d4dee0;border-radius:12px}.foot{font-size:.8rem;color:#526b77;margin-top:25px;overflow-wrap:anywhere}noscript{display:block;padding:25px;background:#fff2d0}@media(max-width:700px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.filters label:last-child{grid-column:1/-1}.image img{height:330px}.status{align-items:flex-start}}
</style>
<header><h1>אלפיין v7 · צילומי בדיקת המטריצה</h1><p id="summary"></p><p>התמונות הן צילומי דפדפן שנשמרו בריצה בפועל. בכל תמונה מסומן אם התנוחה שייכת לניגון שנצפה במשך עשר שניות לפחות או לבדיקת סיום נפרדת בסיוע seek. הגלריה מציגה 3 קליפים מתוך 14; דוח המטריצה כולל את כל הקליפים.</p><nav><a href="../../preview-standalone.html">תצוגה אינטראקטיבית</a><a href="cases.jsonl">תצפיות מקור JSONL</a><a href="../matrix-soak.json">דוח מטריצה מלא</a></nav></header>
<main><section class="filters" aria-label="סינון צילומים"><label>תאורה<select id="environment"><option value="">הכול</option></select></label><label>דמות<select id="athlete"><option value="">הכול</option></select></label><label>מרחק<select id="view"><option value="">הכול</option></select></label><label>מסך<select id="viewport"><option value="">הכול</option></select></label><label>אנימציה<select id="clip"><option value="">הכול</option></select></label></section><div class="status"><p id="count" role="status" aria-live="polite"></p><button id="reset" type="button">איפוס מסננים</button></div><div id="grid" class="grid"></div><p id="empty" class="empty" hidden>אין צילומים בשילוב המסננים שנבחר.</p><p class="foot" id="proof"></p><noscript>המסננים דורשים JavaScript מקומי. ניתן לצפות בקבצי WebP ישירות בתיקייה; אין כאן תלות רשת.</noscript></main>
<script>
'use strict';
const DATA=${data};
const labels={environment:{sunset:'שקיעה',fog:'ערפל','night-floodlit':'לילה וזרקורים'},athlete:{0:'סקיאר',1:'סנובורדיסטית',2:'סקיארית'},view:{close:'קרוב',wide:'רחוק'},clip:{carve_left:'פנייה שמאלה',ramp_jump:'קפיצה מרמפה',fall_roll:'נפילה מגלגלת'}};
const keys=['environment','athlete','view','viewport','clip'];
const value=(image,key)=>key==='viewport'?image.viewport.join('×'):String(image.configuration[key]);
const label=(key,item)=>labels[key]?.[item]||item;
for(const key of keys){const select=document.getElementById(key);for(const item of [...new Set(DATA.images.map(image=>value(image,key)))]){const option=document.createElement('option');option.value=item;option.textContent=label(key,item);select.append(option);}select.addEventListener('change',render);}
document.getElementById('summary').textContent=DATA.cases+' / '+DATA.expectedCases+' שילובים נשמרו; '+DATA.images.length+' צילומים. '+(DATA.complete?'כיסוי המקרים הושלם; סטטוס ההצלחה המלא מופיע בדוח המטריצה.':'תצפית ביניים: הריצה טרם הושלמה. יש ליצור את הגלריה שוב בסיום.');
if(DATA.continuations){document.getElementById('summary').textContent+=' הקמפיין כולל המשך מאומת לאחר הפסקה; '+DATA.replayCases+' / '+DATA.replayExpected+' מקרי שחזור נשמרו בנפרד ואינם נספרים בין 504 השילובים.';const replay=document.createElement('a');replay.href='replay-01/cases.jsonl';replay.textContent='ראיות שחזור נפרדות';document.querySelector('nav').append(replay);}
document.getElementById('proof').textContent='נוצר: '+DATA.generatedAt+' · SHA-256 של JSONL המקור: '+DATA.sourceJSONLSHA256+' · כל הקבצים מקומיים. ללא ספריות, גופנים או בקשות רשת חיצוניות.';
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function render(){
  const chosen=Object.fromEntries(keys.map(key=>[key,document.getElementById(key).value]));
  const visible=DATA.images.filter(image=>keys.every(key=>!chosen[key]||value(image,key)===chosen[key]));
  const fragment=document.createDocumentFragment();
  for(const image of visible){
    const card=element('article','card'),link=element('a','image');
    link.href=encodeURI(image.file);link.target='_blank';link.rel='noopener';
    const photo=element('img');photo.src=encodeURI(image.file);
    photo.alt=label('athlete',image.configuration.athlete)+' · '+label('clip',image.configuration.clip)+' · '+label('environment',image.configuration.environment);
    photo.loading='lazy';photo.decoding='async';photo.width=image.viewport[0];photo.height=image.viewport[1];link.append(photo);
    const caption=element('div','caption');caption.append(element('h2','',photo.alt));
    caption.append(element('p','',label('view',image.configuration.view)+' · '+image.viewport.join('×')+' · מקרה '+image.id));
    caption.append(element('span',image.playbackPass&&image.resourcesPass?'pass':'pass fail',image.playbackPass&&image.resourcesPass?'ניגון ומשאבים עברו':'נדרש בירור בדוח'));
    caption.append(element('p','',image.phaseSource==='seek-assisted end probe'?'תנוחה לאחר בדיקת סיום בסיוע seek':image.phaseSource==='ten-second run'?'תנוחה מתוך הניגון שנצפה':'ניסיון קודם — ראו דוח'));
    caption.append(element('p','technical','captured t='+image.time.toFixed(3)+' / '+image.duration.toFixed(3)+'s · run t='+image.runTime.toFixed(3)+'s'));
    caption.append(element('p','technical','dwell '+image.elapsedSeconds.toFixed(2)+'s · DPR '+image.pixelRatio+' · '+image.geometry+' geometries · '+image.textures+' textures · '+(image.bytes/1000).toFixed(1)+' KB'));
    caption.append(element('p','technical',image.file));card.append(link,caption);fragment.append(card);
  }
  document.getElementById('grid').replaceChildren(fragment);
  document.getElementById('count').textContent=visible.length+' מתוך '+DATA.images.length+' צילומים';document.getElementById('empty').hidden=!!visible.length;
}
document.getElementById('reset').addEventListener('click',()=>{for(const key of keys)document.getElementById(key).value='';render();});render();
</script>
</html>`;
await fs.writeFile(path.join(folder,'index.html'),html);
console.log(JSON.stringify({written:'verification/matrix/index.html',cases:cases.length,images:images.length,complete:metadata.complete,bytes:Buffer.byteLength(html),sourceJSONLSHA256:metadata.sourceJSONLSHA256}));
