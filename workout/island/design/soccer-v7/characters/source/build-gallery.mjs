/** Generate a file://-friendly gallery of the actual phone review frames. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './browser-session.mjs';
import {selectedCandidateFrames} from './review-frames.mjs';
const exists=async p=>fs.access(path.join(root,p)).then(()=>true,()=>false);
const rounds=(await fs.readdir(path.join(root,'iterations'))).filter(n=>/^\d{2}$/.test(n)).sort();
const manifest=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8'));
const identities=manifest.characters.map(c=>({id:c.id,label:c.label||c.id}));
const data=[];
for(const round of rounds){
  const frames=[],selected=await selectedCandidateFrames(root,round);
  for(const person of identities)for(const size of ['390x844','844x390'])for(const view of ['face','profile','side','face-stadium','body','body-far','cloth','cloth-profile']){
    const roster='iterations/'+round+'/roster/'+person.id+'-'+view+'-'+size+'.webp';
    const fallback='iterations/'+round+'/'+(view==='profile'?'face-profile':view)+'-'+size+'.png';
    const candidateLabel={face:'face-front',profile:'face-three-quarter',body:'body-near','body-far':'body-far',cloth:'cloth-front','cloth-profile':'cloth-three-quarter'}[view];
    const candidate=candidateLabel?'iterations/'+round+'/preflight/roster/'+person.id+'-'+candidateLabel+'-'+size+'.png':null;
    const file=await exists(roster)?roster:person.id===identities[0].id&&await exists(fallback)?fallback:candidate&&await exists(candidate)?candidate:selected.find(f=>f.id===person.id&&f.view===view&&f.size===size)?.file||null;
    if(file)frames.push({...person,size,view,file});
  }
  for(const size of ['390x844','844x390']){
    const file='iterations/'+round+'/roster/pitch-'+size+'.webp';if(await exists(file))frames.push({id:'pitch',label:'המגרש',size,view:'pitch',file});
  }
  const films=[];
  for(const file of await fs.readdir(path.join(root,'iterations',round,'motion-films')).catch(()=>[])){
    if(!/^(motor|recovery|keeper|pass)-(390x844|844x390)\.json$/.test(file))continue;
    const record=JSON.parse(await fs.readFile(path.join(root,'iterations',round,'motion-films',file),'utf8'));
    if(record.pass)films.push({sequence:record.sequence,size:record.size.width+'x'+record.size.height,semanticPass:record.semanticChecks?.pass===true,file:'iterations/'+round+'/motion-films/'+record.video.file,poster:record.records?.[0]?'iterations/'+round+'/motion-films/'+record.records[0].file:null,metadata:'iterations/'+round+'/motion-films/'+file});
  }
  if(frames.length||films.length)data.push({round,frames,films,review:'iterations/'+round+'/REVIEW.md',count:frames.length});
}
const payload=JSON.stringify(data).replace(/</g,'\\u003c');
const html=`<!doctype html>
<html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ביקורת סגל 07</title>
<style>
:root{color-scheme:dark;font:15px Arial,sans-serif;background:#111917;color:#eef0e6}*{box-sizing:border-box}body{margin:0}header,main{max-width:1480px;margin:auto;padding:24px}header{border-bottom:1px solid #344239}h1{font-size:28px;margin:0 0 10px}p{color:#adbaac;line-height:1.7;margin:8px 0}a{color:#d7ef98}nav,form{display:flex;flex-wrap:wrap;align-items:center;gap:12px}nav{margin:16px 0}label{display:grid;gap:6px;font-size:12px;color:#adb9ad}select{min-height:44px;min-width:145px;background:#1b2920;border:1px solid #455741;color:inherit;font:inherit;padding:8px}button{font:inherit;min-height:44px;cursor:pointer}a:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #d7ef98;outline-offset:3px}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:24px}figure{margin:0;background:#1a2520;border:1px solid #344239}figure button{border:0;padding:0;background:transparent;width:100%;display:block}figure img{width:100%;height:420px;object-fit:contain;display:block;background:#293131}figcaption{padding:12px;display:flex;justify-content:space-between;gap:8px}small{color:#a4b29e}#note{min-height:26px}dialog{padding:12px;border:1px solid #5a6c51;background:#17211b;color:inherit;max-width:97vw;max-height:98vh}dialog::backdrop{background:#000c}dialog img{display:block;max-height:83vh;max-width:90vw;width:auto;height:auto}dialog button{display:block;margin:8px auto 0;background:#d7ef98;border:0;color:#152010;padding:8px 22px}@media(max-width:520px){header,main{padding:16px}#grid{grid-template-columns:1fr}figure img{height:auto;max-height:78vh}select{min-width:140px;max-width:44vw}}
</style>
<header><h1>ביקורת סגל 07</h1><p>צילומי הרינדור המקוריים מכל סבב, בשתי מידות הטלפון. לחיצה על תמונה פותחת אותה בגודל מלא.</p><nav><a href="./preview.html">תצוגת תלת־ממד</a><a href="./REPORT.md">הדוח</a><a id="review">ביקורת הסבב</a></nav><form onsubmit="return false"><label>סבב<select id="round"></select></label><label>מבט<select id="view"><option value="face">פנים</option><option value="body">גוף קרוב</option><option value="body-far">גוף רחוק · LOD</option><option value="face-stadium">פנים · תאורת מגרש</option><option value="cloth">בד</option><option value="cloth-profile">בד · שלושת־רבעי</option><option value="profile">שלושת־רבעי</option><option value="side">פרופיל מלא</option><option value="pitch">מגרש</option></select></label><label>מידה<select id="size"><option value="390x844">390 × 844</option><option value="844x390">844 × 390</option></select></label></form></header>
<main><p id="note" role="status"></p><div id="grid"></div><section id="films" aria-label="ביקורת תנועה"></section></main><dialog id="dialog"><img id="large" alt=""><button id="close">סגירה</button></dialog>
<script>
const rounds=${payload};const $=id=>document.getElementById(id);for(const r of rounds){const o=document.createElement('option');o.value=r.round;o.textContent=r.round;$('round').append(o)}$('round').value=rounds.at(-1).round;
function drawFilms(r){$('films').replaceChildren();const selected=r.films.filter(f=>f.size===$('size').value);if(!selected.length)return;const title=document.createElement('h2'),note=document.createElement('p');title.textContent='ביקורת תנועה';note.textContent='סרטונים מהפריימים המרונדרים לבדיקה רציפה. קצב הסרטון מחושב ואינו מדידת ביצועים בטלפון.';$('films').append(title,note);for(const f of selected){const video=document.createElement('video'),caption=document.createElement('p'),link=document.createElement('a');video.src=f.file;video.controls=true;video.preload='none';video.playsInline=true;video.style.cssText='max-width:100%;max-height:78vh;background:#293131';if(f.poster)video.poster=f.poster;caption.textContent=({motor:'האצה ובלימה',recovery:'נפילה, קימה וחזרה',keeper:'זינוק ותפיסה',pass:'מסירה ארוכה'})[f.sequence]+' · '+(f.semanticPass?'השלמת הפעולות נבדקה · ':'תיעוד ביניים; השלמה לא אומתה · ');link.href=f.metadata;link.textContent='נתוני הבדיקה';caption.append(link);$('films').append(caption,video)}}
function draw(){const r=rounds.find(r=>r.round===$('round').value),frames=r.frames.filter(f=>f.view===$('view').value&&f.size===$('size').value);$('review').href=r.review;drawFilms(r);$('grid').replaceChildren();$('note').textContent=frames.length?frames.length+' צילומים · הפגמים והציונים מתועדים בביקורת הסבב.':'לא נשמר צילום במבט ובמידה אלה בסבב זה.';for(const f of frames){const fig=document.createElement('figure'),button=document.createElement('button'),img=document.createElement('img'),caption=document.createElement('figcaption'),label=document.createElement('span'),meta=document.createElement('small');img.src=f.file;img.alt=f.label+' · '+f.view+' · '+f.size;img.loading='lazy';button.append(img);button.setAttribute('aria-label','פתיחה בגודל מלא: '+f.label);button.onclick=()=>{$('large').src=f.file;$('large').alt=img.alt;$('dialog').showModal()};label.textContent=f.label;meta.textContent=f.id;meta.dir='ltr';caption.append(label,meta);fig.append(button,caption);$('grid').append(fig)}}for(const id of ['round','view','size'])$(id).onchange=draw;$('close').onclick=()=>$('dialog').close();$('dialog').onclick=e=>{if(e.target===$('dialog'))$('dialog').close()};draw();
</script></html>`;
await fs.writeFile(path.join(root,'gallery.html'),html);
console.log('Gallery: '+data.length+' rendered rounds, '+data.reduce((n,r)=>n+r.count,0)+' phone frames.');
