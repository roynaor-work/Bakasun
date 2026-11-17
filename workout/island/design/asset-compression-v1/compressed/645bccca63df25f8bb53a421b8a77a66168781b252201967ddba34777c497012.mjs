// The island's one download panel: "download all games to the device", progress,
// honest per-game status counted from the cache, a manual "check for update and
// download" and the last load report of each game with a copy button.
import {OFFLINE_GAMES,offlineStatus,downloadGames,checkAndDownload,offlineSupported,megabytes} from './offline.mjs';
import {reportPanel} from './load-report.mjs';
import {DATA_VERSION} from '../release.mjs';

const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function versionLine(version=DATA_VERSION){return `גרסה: ${version}`;}
export function describeProgress(p){return `מוריד ${p.done} מתוך ${p.total} · ${p.percent}%`;}
export function describeStatus(status){
  if(!status.supported)return 'ההורדה למכשיר לא זמינה בדפדפן הזה. המשחקים נטענים מהרשת.';
  if(status.complete)return 'שמור לגרסה הזו. אפשר לשחק גם בלי רשת.';
  const names=Object.entries(OFFLINE_GAMES).filter(([g])=>!status.games[g]?.complete).map(([,n])=>n).join(', ');
  return status.have?`נשמרו ${status.have} מתוך ${status.total} קבצים. חסר: ${names}.`:'עוד לא נשמר במכשיר. הורדה אחת מקצרת כל טעינה.';
}
export function offlinePanel({onChange=()=>{}}={}){
  const panel=node('section','offline-panel');panel.dataset.offlinePanel='';
  const heading=node('h3','','הורדת המשחקים למכשיר');
  const status=node('p','offline-status','בודק מה שמור במכשיר...');status.setAttribute('role','status');
  const bar=node('progress','offline-progress');bar.max=100;bar.value=0;bar.hidden=true;
  const games=node('ul','offline-games');
  const download=node('button','primary-button','הורדת כל המשחקים למכשיר');download.type='button';download.dataset.action='offline-download-all';
  const check=node('button','secondary-button','בדיקת עדכון והורדה');check.type='button';check.dataset.action='offline-check-update';
  const versionRow=node('p','offline-version',versionLine());versionRow.dataset.appVersion='';
  panel.append(heading,status,bar,games,download,check,versionRow);
  const busy=value=>{download.disabled=value;check.disabled=value;bar.hidden=!value;};
  async function refresh(){
    try{
      const s=await offlineStatus();status.textContent=describeStatus(s);panel.dataset.complete=String(Boolean(s.complete));
      games.replaceChildren(...Object.entries(OFFLINE_GAMES).map(([id,name])=>{const g=s.games[id],li=node('li','',`${name}: ${g?`${g.have} מתוך ${g.total}`:'לא זמין'}`);li.dataset.game=id;li.dataset.complete=String(Boolean(g?.complete));return li;}));
      download.textContent=s.complete?'הורדה מחדש (בדיקת קבצים)':'הורדת כל המשחקים למכשיר';
    }catch(error){status.textContent='לא ניתן לבדוק מה שמור: '+(error?.message||error);}
    panel.querySelectorAll('[data-report]').forEach(n=>n.remove());
    for(const id of Object.keys(OFFLINE_GAMES)){const r=reportPanel(id);if(r)panel.append(r);}
    onChange();
  }
  const progress=p=>{status.textContent=describeProgress(p);bar.value=p.percent;};
  async function run(job){
    if(!offlineSupported()){status.textContent='ההורדה לא זמינה בדפדפן הזה. המשחקים נטענים מהרשת.';return;}
    busy(true);status.textContent='מתחיל...';
    try{
      const r=await job();
      const sizeNote=r.bytes?` (${megabytes(r.bytes)} MB הורדו עכשיו)`:'';
      await refresh();
      if(r.failed.length)status.textContent=`${r.total-r.failed.length} מתוך ${r.total} נשמרו. ${r.failed.length} קבצים לא ירדו (${r.failed[0].reason}). המשחק יעלה גם בלי הקבצים האלה, אפשר לנסות שוב.`;
      else if(r.newer)status.textContent+=` יצאה גרסה חדשה (${r.latest}). היא תותקן ברקע ותוחלף בפתיחה הבאה.`;
      else status.textContent+=sizeNote;
    }catch(error){status.textContent='ההורדה נכשלה ('+(error?.message||error)+'). המשחקים ייטענו מהרשת.';}
    busy(false);
  }
  download.addEventListener('click',()=>run(()=>downloadGames({onProgress:progress})));
  check.addEventListener('click',()=>run(()=>checkAndDownload({onProgress:progress})));
  refresh();
  return panel;
}
