// The island's one download panel: "download all games to the device", progress,
// honest per-game status counted from the cache, a manual "check for update and
// download". Technical reports are shown in the parent panel.
// Offline v25 (17/11/2026): a row per game package with its size, state (not on device /
// downloading / ready / update available), its own download and delete buttons, storage
// usage and quota with persistent storage, and "install the app". `?offlineV25=0` shows
// the v24 panel.
import {OFFLINE_GAMES,offlineStatus,downloadGames,checkAndDownload,offlineSupported,megabytes,v25On,deletePack,downloadBusy,persistStorage,storageInfo,loadManifest,pathsFor,bytesFor,prefetchRelease} from './offline.mjs';
import {installState,promptInstall,onInstallChange,INSTALL_TEXT} from './offline-install.mjs';
import {saveGameReport} from './load-report.mjs';
import {DATA_VERSION} from '../release.mjs';

const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(text,action,cls='secondary-button')=>{const b=node('button',cls,text);b.type='button';b.dataset.action=action;return b;};
export function versionLine(version=DATA_VERSION){return `גרסה: ${version}`;}
export function describeProgress(p){return `מוריד ${p.done} מתוך ${p.total} · ${p.percent}%`;}
export function describeStatus(status){
  if(!status.supported)return 'ההורדה למכשיר לא זמינה בדפדפן הזה. המשחקים נטענים מהרשת.';
  if(status.complete)return 'שמור לגרסה הזו. אפשר לשחק גם בלי רשת.';
  const names=Object.entries(OFFLINE_GAMES).filter(([g])=>!status.games[g]?.complete).map(([,n])=>n).join(', ');
  return status.have?`נשמרו ${status.have} מתוך ${status.total} קבצים. חסר: ${names}.`:'עוד לא נשמר במכשיר. הורדה אחת מקצרת כל טעינה.';
}
/** v25 summary line: packages ready, bytes on the device out of the whole island. */
export function describeStatus25(status){
  if(!status.supported)return describeStatus(status);
  const ready=Object.keys(OFFLINE_GAMES).filter(g=>status.games[g]?.complete).length,total=Object.keys(OFFLINE_GAMES).length;
  if(status.complete)return `שמור לגרסה הזו: כל המשחקים במכשיר (${megabytes(status.bytes)} MB). אפשר לשחק גם בלי רשת.`;
  if(!status.shell.complete&&!status.have)return 'עוד לא נשמר במכשיר. ההורדה מתחילה לבד ברקע, או בכפתור.';
  const shell=status.shell.complete?'האפליקציה שמורה':`האפליקציה: ${status.shell.have} מתוך ${status.shell.total} קבצים`;
  return `${shell} · ${ready} מתוך ${total} משחקים מוכנים · ${megabytes(status.haveBytes)} מתוך ${megabytes(status.bytes)} MB`;
}
export function describeStorage(info){
  if(info.usage===null&&info.persisted===null)return '';
  const parts=[];
  if(info.usage!==null)parts.push(`באחסון המכשיר: ${megabytes(info.usage)} MB${info.quota?` · פנוי לאפליקציה: ${Math.round(info.quota/1048576/100)/10} GB`:''}`);
  if(info.persisted===true)parts.push('שמירה קבועה: כן');
  else if(info.persisted===false)parts.push('שמירה קבועה: לא (הדפדפן עלול לפנות את הקבצים כשאין מקום)');
  return parts.join(' · ');
}
/** Per-package state label. */
export function describePack(g,{downloading=null,update=null}={}){
  if(downloading)return `בהורדה · ${downloading.percent}%`;
  if(!g)return 'לא זמין';
  if(g.complete)return update?.changed?`יש עדכון (${update.changed} קבצים, ${megabytes(update.bytes)} MB)`:'מוכן';
  if(g.have)return `חלקי · ${g.have} מתוך ${g.total}`;
  return 'לא הורד';
}
/** Pure: which files of each package change between the current manifest and the next one. */
export function packUpdates(current,next){
  const out={};
  for(const game of Object.keys(next.games||{})){
    const changed=pathsFor(next,[game]).filter(p=>!current.files?.[p]||current.files[p][0]!==next.files?.[p]?.[0]);
    out[game]={changed:changed.length,bytes:bytesFor(next,changed)};
  }
  return out;
}
async function pendingUpdates(fetcher=globalThis.fetch){
  const response=await fetcher(new URL('../release.json?check='+Date.now(),import.meta.url).href,{cache:'no-store'});
  if(!response.ok)return null;const latest=(await response.json()).version;
  if(!/^[a-z0-9-]{1,80}$/.test(latest)||latest===DATA_VERSION)return null;
  const [current,next]=await Promise.all([loadManifest(DATA_VERSION),loadManifest(latest)]);
  return {latest,packs:packUpdates(current,next)};
}

const downloadFailed='ההורדה לא הושלמה. אפשר לנסות שוב.';
const statusFailed='לא ניתן לבדוק אילו קבצים נשמרו. אפשר לנסות שוב.';
function reportIssue(operation,error,latest) {
  const lines=Array.isArray(error)
    ?error.slice(0,20).map(failure=>`${failure.href}: ${failure.reason}`)
    :[String(error?.message??error)];
  if(latest)lines.push('release: '+latest);
  saveGameReport('offline',{status:operation,lines});
}

export function offlinePanel(options={}){return v25On()?offlinePanel25(options):offlinePanel24(options);}

function offlinePanel24({onChange=()=>{}}={}){
  const panel=node('section','offline-panel');panel.dataset.offlinePanel='';
  const heading=node('h3','','הורדת המשחקים למכשיר');
  const status=node('p','offline-status','בודק מה שמור במכשיר...');status.setAttribute('role','status');
  const bar=node('progress','offline-progress');bar.max=100;bar.value=0;bar.hidden=true;
  const games=node('ul','offline-games');
  const download=node('button','primary-button','הורדת המשחקים');download.type='button';download.dataset.action='offline-download-all';
  const check=node('button','secondary-button','בדיקת עדכון והורדה');check.type='button';check.dataset.action='offline-check-update';
  const versionRow=node('p','offline-version',versionLine());versionRow.dataset.appVersion='';
  panel.append(heading,status,bar,games,download,check,versionRow);
  const busy=value=>{download.disabled=value;check.disabled=value;bar.hidden=!value;};
  async function refresh(){
    try{
      const s=await offlineStatus();status.textContent=describeStatus(s);panel.dataset.complete=String(Boolean(s.complete));
      games.replaceChildren(...Object.entries(OFFLINE_GAMES).map(([id,name])=>{const g=s.games[id],li=node('li','',`${name}: ${g?`${g.have} מתוך ${g.total}`:'לא זמין'}`);li.dataset.game=id;li.dataset.complete=String(Boolean(g?.complete));return li;}));
      download.textContent=s.complete?'הורדה מחדש':'הורדת המשחקים';
    }catch(error){reportIssue('status',error);status.textContent=statusFailed;}
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
      if(r.failed.length){reportIssue('download',r.failed,r.latest);status.textContent=downloadFailed;}
      else if(r.newer)status.textContent+=' יצאה גרסה חדשה. היא תותקן ברקע ותיפתח בכניסה הבאה.';
      else status.textContent+=sizeNote;
    }catch(error){reportIssue('download',error);status.textContent=downloadFailed;}
    busy(false);
  }
  download.addEventListener('click',()=>run(()=>downloadGames({onProgress:progress})));
  check.addEventListener('click',()=>run(()=>checkAndDownload({onProgress:progress})));
  refresh();
  return panel;
}

function offlinePanel25({onChange=()=>{}}={}){
  const panel=node('section','offline-panel offline-panel-v25');panel.dataset.offlinePanel='';panel.dataset.v25='';
  const heading=node('h3','','הורדת המשחקים למכשיר');
  const status=node('p','offline-status','בודק מה שמור במכשיר...');status.setAttribute('role','status');
  const bar=node('progress','offline-progress');bar.max=100;bar.value=0;bar.hidden=true;
  const storageRow=node('p','offline-storage','');storageRow.dataset.offlineStorage='';
  const persistBtn=btn('שמירה קבועה במכשיר','offline-persist');persistBtn.hidden=true;
  const games=node('ul','offline-games offline-packs');
  const actions=node('div','offline-actions');
  const download=btn('הורדת המשחקים','offline-download-all','primary-button');
  const check=btn('בדיקת עדכון והורדה','offline-check-update');
  const install=btn('התקנת האפליקציה','offline-install');
  const installHint=node('p','offline-install-hint','');installHint.hidden=true;installHint.dataset.installHint='';
  const versionRow=node('p','offline-version',versionLine());versionRow.dataset.appVersion='';
  actions.append(download,check,install);
  panel.append(heading,status,bar,storageRow,persistBtn,games,actions,installHint,versionRow);
  const packProgress={};let pending=null,busyNow=false,note='';/* note: the last action's result, kept through refreshes until the next action */
  const busy=value=>{busyNow=value;download.disabled=value;check.disabled=value;bar.hidden=!value;for(const b of games.querySelectorAll('button'))b.disabled=value;};
  function renderInstall(){
    const state=installState();panel.dataset.install=state;
    install.hidden=state==='installed';install.textContent=state==='prompt'?'התקנת האפליקציה':'איך מתקינים את האפליקציה?';
    if(state==='installed'){installHint.hidden=false;installHint.textContent=INSTALL_TEXT.installed;}
  }
  function row(id,name,g,update){
    const li=node('li','offline-pack');li.dataset.game=id;li.dataset.complete=String(Boolean(g?.complete));
    const downloading=packProgress[id]||null;li.dataset.state=downloading?'downloading':g?.complete?(update?.changed?'update':'ready'):g?.have?'partial':'missing';
    li.append(node('span','offline-pack-name',name),node('span','offline-pack-size',g?`${megabytes(g.bytes)} MB`:''),node('span','offline-pack-state',describePack(g,{downloading,update})));
    if(g){
      const action=g.complete&&!update?.changed?btn('מחיקה מהמכשיר','offline-pack-delete'):btn(g.complete?'עדכון':g.have?'השלמה':'הורדה','offline-pack-download');
      action.dataset.game=id;action.classList.add('offline-pack-action');action.disabled=busyNow;li.append(action);
    }
    return li;
  }
  async function refresh(){
    try{
      const s=await offlineStatus();status.textContent=describeStatus25(s)+(note?' '+note:'');panel.dataset.complete=String(Boolean(s.complete));
      games.replaceChildren(...Object.entries(OFFLINE_GAMES).map(([id,name])=>row(id,name,s.games[id],pending?.packs?.[id])));
      download.textContent=s.complete?'הורדה מחדש':'הורדת המשחקים';
      const info=await storageInfo();storageRow.textContent=describeStorage(info);storageRow.hidden=!storageRow.textContent;persistBtn.hidden=info.persisted!==false;
    }catch(error){reportIssue('status',error);status.textContent=statusFailed;}
    renderInstall();
    onChange();
  }
  const progress=p=>{status.textContent=describeProgress(p);bar.value=p.percent;};
  async function run(job,{quiet=false}={}){
    if(!offlineSupported()){status.textContent='ההורדה לא זמינה בדפדפן הזה. המשחקים נטענים מהרשת.';return;}
    busy(true);note='';if(!quiet)status.textContent='מתחיל...';
    try{
      const r=await job();
      const sizeNote=r.bytes?` ${megabytes(r.bytes)} MB הורדו עכשיו.`:'';
      const failed=r.failed?.length?r.failed:(r.prepared?.downloaded??r.prepared)?.failed;
      if(failed?.length){reportIssue('download',failed,r.latest);note=downloadFailed;}
      else if(r.newer)note=r.prepared?'גרסה חדשה תיפתח בחזרה לעיר.':'יצאה גרסה חדשה. הקבצים שהשתנו יורדים ברקע.';
      else if(r.bad)note=`${r.bad} קבצים פגומים הוחלפו.${sizeNote}`;
      else note=sizeNote.trim();
      await refresh();
      if(r.fresh&&!r.failed?.length)persistStorage().then(()=>refresh()).catch(()=>{});
    }catch(error){note=downloadFailed;await refresh();reportIssue('download',error);}
    busy(false);
  }
  download.addEventListener('click',()=>run(()=>downloadGames({onProgress:progress,verify:panel.dataset.complete==='true'})));
  check.addEventListener('click',()=>run(async()=>{
    try{pending=await pendingUpdates();}catch{pending=null;}
    const r=await checkAndDownload({onProgress:progress});
    if(r.newer){status.textContent='מכין את הגרסה החדשה: מעתיק מה שלא השתנה ומוריד רק את השינויים...';r.prepared=await prefetchRelease(r.latest,{onProgress:progress});}
    return r;}));
  persistBtn.addEventListener('click',async()=>{const ok=await persistStorage();storageRow.textContent=describeStorage(await storageInfo())+(ok===false?' · הדפדפן סירב לשמירה קבועה. בדרך כלל עוזר להתקין את האפליקציה.':'');persistBtn.hidden=ok!==false;});
  install.addEventListener('click',async()=>{
    const state=installState();
    if(state==='prompt'){const result=await promptInstall();if(result==='accepted'){installHint.hidden=false;installHint.textContent=INSTALL_TEXT.installed;renderInstall();return;}}
    installHint.hidden=false;installHint.textContent=INSTALL_TEXT[installState()==='prompt'?'manual':installState()];
  });
  games.addEventListener('click',async event=>{
    const b=event.target.closest?.('button[data-game]');if(!b||busyNow)return;const id=b.dataset.game;
    if(b.dataset.action==='offline-pack-download'){
      const onProgress=p=>{packProgress[id]=p;progress(p);const li=games.querySelector(`li[data-game="${id}"]`);if(li){li.dataset.state='downloading';li.querySelector('.offline-pack-state').textContent=describePack(null,{downloading:p});}};
      // A background download in flight is joined first (one download at a time); then this package, if it was not part of it.
      await run(async()=>{let r=await downloadGames({games:[id],onProgress});if(!r.games?.[id])r=await downloadGames({games:[id],onProgress});return r;},{quiet:true});
      delete packProgress[id];await refresh();
    }else if(b.dataset.action==='offline-pack-delete'){
      if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='בטוח? מחיקה';b.classList.add('offline-danger');return;}
      busy(true);try{if(downloadBusy())throw Error('הורדה פעילה');const r=await deletePack(id);note=`${OFFLINE_GAMES[id]}: הוסרו ${r.removed} קבצים מהמכשיר (${megabytes(r.bytes)} MB). ההתקדמות נשמרה.`;}
      catch(error){reportIssue('delete',error);note='המחיקה לא הושלמה. אפשר לנסות שוב.';}
      await refresh();busy(false);
    }
  });
  const unlisten=onInstallChange(renderInstall);
  if(typeof MutationObserver==='function'&&document.body){const watch=new MutationObserver(()=>{if(!panel.isConnected){watch.disconnect();unlisten();}});watch.observe(document.body,{childList:true,subtree:true});}
  refresh();
  pendingUpdates().then(p=>{pending=p;if(p)refresh();}).catch(()=>{});
  return panel;
}
