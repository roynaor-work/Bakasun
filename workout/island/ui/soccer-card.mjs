import {attributes,cardRating} from '../activity/soccer-card.mjs?v=island-v2-20261102-1';
import {rosterCards} from '../activity/soccer-roster.mjs?v=island-v2-20261102-1';
import {installSoccerDesignScreens} from '../minigames/soccer-design-screens.mjs';
import {SOCCER_ASSET_PATHS} from '../minigames/soccer-offline.mjs';
import {DATA_VERSION} from '../release.mjs';
installSoccerDesignScreens();
// Menu presentation is ready on first entry, before a match creates its renderer.
if(typeof document!=='undefined'&&!document.querySelector('link[data-ultra-soccer-ui]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../minigames/ultra-soccer-ui.css?v=island-v2-20261102-1',import.meta.url).href;link.dataset.ultraSoccerUi='';document.head.append(link);
}
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;n.textContent=text??'';return n;};
/** The soccer menu warms the match assets while the child reads the card: the
 * authored motion library, the control/tactics contracts, the decoded and
 * floor-baked characters (shared by every match on this page) and the stadium
 * files in the HTTP cache. Kickoff then waits only for the renderer. Failures
 * are ignored here; the match itself reports them. Runs once per page. */
let warmed=false,workerRegistration=null;
const islandRoot=new URL('../',import.meta.url);
/** Register the soccer asset worker (soccer-sw.js, same origin, classic script).
 * It serves the match's assets from the device after the first download and
 * drops its cache when the release version changes. Fails quietly: the match
 * then simply loads over the network as before. */
export function registerSoccerAssetWorker(){
  if(workerRegistration!==null||typeof navigator==='undefined'||!navigator.serviceWorker||typeof location==='undefined'||!/^https?:$/.test(location.protocol))return workerRegistration;
  const url=new URL('soccer-sw.js',islandRoot);url.searchParams.set('v',DATA_VERSION);
  workerRegistration=navigator.serviceWorker.register(url.href,{scope:islandRoot.pathname,updateViaCache:'none'}).catch(()=>null);
  return workerRegistration;
}
/** One-time download of every match asset into the worker's cache, with progress. */
export async function downloadSoccerAssets(onProgress=()=>{}){
  const registration=await registerSoccerAssetWorker();
  if(!registration)throw Error('worker-unavailable');
  await navigator.serviceWorker.ready;
  const worker=registration.active||registration.waiting||registration.installing;
  if(!worker)throw Error('worker-inactive');
  const urls=SOCCER_ASSET_PATHS.map(path=>new URL(path,islandRoot).href);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',onMessage);reject(Error('timeout'));},10*60*1000);
    const onMessage=event=>{
      const data=event.data;if(!data||typeof data.type!=='string'||!data.type.startsWith('soccer-precache'))return;
      if(data.type==='soccer-precache-progress')onProgress(data.done,data.total);
      if(data.type==='soccer-precache-done'){clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',onMessage);resolve(data);}
    };
    navigator.serviceWorker.addEventListener('message',onMessage);
    worker.postMessage({type:'soccer-precache',urls});
  });
}
export function warmSoccerAssets(){
  if(warmed||typeof document==='undefined')return;warmed=true;
  registerSoccerAssetWorker();
  const start=()=>{
    import('../minigames/soccer-design-character.mjs').then(m=>m.prepareSoccerDesignSources()).catch(()=>{});
    import('../minigames/soccer-design-contracts.mjs').then(m=>m.loadSoccerDesignContracts()).catch(()=>{});
    const design=new URL('../design/',import.meta.url);
    for(const path of ['models2/soccer-stadium.glb','models/soccer-goal.glb','models/soccer-ball.glb','environment/textures/grass-mown.webp','environment/textures/stand-concrete.webp','environment/textures/crowd-dots.webp','environment/backgrounds/stadium-day-landscape.webp','environment/backgrounds/stadium-day-portrait.webp','vfx/atlases/goal-burst.json','vfx/atlases/confetti.json','vfx/atlases/landing-dust.json'])fetch(new URL(path,design),{credentials:'same-origin'}).catch(()=>{});
  };
  (globalThis.requestIdleCallback||(fn=>setTimeout(fn,250)))(start);
}
/** Local SVG portrait uses only the validated avatar palette; names remain text. */
const LOAD_REPORT_KEY='island.soccer.lastLoadReport';
/** The menu shows whether the assets are on the device, downloads them once, and
 * keeps the last match's load report (what loaded, what fell back, how long) with a
 * copy button so a phone test can be pasted into the chat. */
function assetsPanel(){
  const panel=node('section','soccer-assets-panel'),status=node('p','soccer-assets-status','נכסי המשחק נטענים מהרשת. הורדה אחת למכשיר מקצרת כל טעינה.');
  const download=node('button','secondary-button','הורדת נכסי המשחק למכשיר');download.type='button';download.dataset.action='soccer-download-assets';
  let storage=null;try{storage=globalThis.localStorage;}catch{}
  const saved=storage?.getItem('island.soccer.assetsDownloaded');
  if(saved===DATA_VERSION){status.textContent='נכסי המשחק שמורים במכשיר לגרסה הזו.';download.textContent='הורדה מחדש';}
  download.addEventListener('click',async()=>{
    download.disabled=true;status.textContent='מוריד...';
    try{
      const result=await downloadSoccerAssets((done,total)=>{status.textContent=`מוריד ${done} מתוך ${total}`;});
      const ok=result.total-result.failed.length;
      status.textContent=result.failed.length?`נשמרו ${ok} מתוך ${result.total}. ${result.failed.length} קבצים לא ירדו, אפשר לנסות שוב.`:'נכסי המשחק שמורים במכשיר. הטעינה הבאה מהירה.';
      if(!result.failed.length)try{storage?.setItem('island.soccer.assetsDownloaded',DATA_VERSION);}catch{}
    }catch(error){status.textContent='ההורדה לא זמינה בדפדפן הזה ('+(error?.message||error)+'). המשחק ייטען מהרשת.';}
    download.disabled=false;
  });
  panel.append(status,download);
  let report=null;try{report=storage?.getItem(LOAD_REPORT_KEY);}catch{}
  if(report){
    const details=node('details','soccer-load-report'),summary=node('summary','','דוח הטעינה האחרון');const pre=node('pre','',report);pre.dir='ltr';
    const copy=node('button','secondary-button','העתקה');copy.type='button';copy.addEventListener('click',()=>{navigator.clipboard?.writeText(report).then(()=>{copy.textContent='הועתק';},()=>{copy.textContent='בחרו את הטקסט והעתיקו';});});
    details.append(summary,copy,pre);panel.append(details);
  }
  return panel;
}
export function playerCard(state,balance,t,{starsAdded}={}) {
  warmSoccerAssets();
  const card=state.soccerCard,identity=state.soccerRoster?.players[0],rating=cardRating(card,balance),root=node('article',`soccer-player-card ${rating.tier}`);
  if(identity){rating.overall=Math.round(['pace','shot','pass','defense'].reduce((sum,key)=>sum+identity.attributes[key],0)/4);rating.tier=rating.overall>=balance.card.goldRating?'gold':rating.overall>=balance.card.silverRating?'silver':'bronze';root.className=`soccer-player-card ${rating.tier}`;}
  root.dataset.playerCard=rating.tier;root.setAttribute('aria-label',t('soccer.card'));
  root.append(node('strong','soccer-overall',String(rating.overall)),node('h3','soccer-card-name',identity?.name||t(state.avatar.nameId)));
  if(identity)root.append(node('span','soccer-shirt-number',`#${identity.number} ${identity.name||''}`));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 160 142');svg.setAttribute('aria-hidden','true');svg.classList.add('soccer-portrait');
  const shape=(tag,properties)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [key,value]of Object.entries(properties))n.setAttribute(key,String(value));svg.append(n);};
  const a=state.avatar;
  shape('path',{d:'M22 142 L26 110 Q40 88 66 86 L94 86 Q120 88 134 110 L138 142Z',fill:a.shirtColor,stroke:'#193c4c','stroke-width':3});
  shape('rect',{x:67,y:73,width:26,height:27,rx:9,fill:a.skinColor});
  shape('ellipse',{cx:80,cy:49,rx:32,ry:39,fill:a.skinColor,stroke:'#193c4c','stroke-width':2});
  shape('path',{d:a.hairstyle==='short'?'M48 46 Q40 0 80 4 Q120 0 112 44 L100 27 L59 28Z':'M48 48 Q37 2 80 3 Q123 1 112 48 L104 24 Q74 39 54 27Z',fill:a.hairColor});
  for(const cx of [68,92])shape('ellipse',{cx,cy:50,rx:3,ry:4,fill:'#19313b'});
  shape('path',{d:'M69 68 Q80 77 91 68',fill:'none',stroke:'#7b453b','stroke-width':3,'stroke-linecap':'round'});
  shape('path',{d:'M63 98 Q80 113 97 98',fill:'none',stroke:'#fff6d5','stroke-width':4});root.append(svg);
  const list=node('dl','soccer-card-attributes');
  const profile=identity?rosterCards(balance,{players:state.players.map((p,i)=>({...p,card:state.soccerRoster.players[i]}))},card)[0]:null;
  for(const key of attributes){const row=node('div',''),value=profile?.[{power:'shot',pace:'pace',accuracy:'pass',defense:'defense'}[key]]??card.attributes[key];row.append(node('dt','',t(`soccer.attribute.${key}`)),node('dd','',String(value)));list.append(row);}root.append(list);
  root.append(node('p','soccer-wallet',t('soccer.wallet',{stars:card.stars})));
  root.append(assetsPanel());
  if(starsAdded!==undefined)root.append(node('p','soccer-stars-added',t('soccer.starsAdded',{stars:starsAdded})));
  return root;
}
export function rosterCard(card,t){
 const root=node('article','soccer-roster-card');root.dataset.rosterPlayer=card.id;root.dataset.team=card.team;
 root.append(node('strong','soccer-overall',card.overall),node('h3','',`${card.name||t(card.nameId)} #${card.number}`),node('p','',t('soccer.role.'+card.role)));
 const dl=node('dl','soccer-card-attributes');for(const key of ['pace','shot','pass','defense',...(card.role==='keeper'?['reactions','catching']:[])]){const row=node('div','');row.append(node('dt','',t('soccer.stat.'+key)),node('dd','',card[key]));dl.append(row);}root.append(dl);return root;
}
