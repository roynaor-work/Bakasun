// Device quality tier for the island: 'low' | 'mid' | 'high'.
// Order of authority: ?quality=high|low in the address > measured frame rate (first 10 s of the
// island, kept in localStorage for the next open) > device facts (memory, cores, data saver).
// A weak device gets the light version of every heavy feature: no formula car for the AI cars,
// no full city models, fewer city cars, games started with ctx.lite, no automatic background download.
// Nothing here touches saves: the only key written is island.quality.auto.
export const LOW_FPS=24,PROBE_MS=10000,STORE_KEY='island.quality.auto',STALE_MS=7*24*3600*1000;
const w=()=>globalThis;
export function qualityOverride(search=w().location?.search||''){
  const v=new URLSearchParams(search).get('quality');return v==='high'||v==='low'?v:null;
}
/** From device facts alone. deviceMemory is capped at 8 and missing on iOS, cores may be missing. */
export function staticTier({memory=w().navigator?.deviceMemory,cores=w().navigator?.hardwareConcurrency,saveData=w().navigator?.connection?.saveData}={}){
  if(saveData)return 'low';
  if((memory&&memory<=2)||(cores&&cores<=2))return 'low';
  if(memory&&memory>=6&&cores&&cores>=8)return 'high';
  return 'mid';
}
function store(){try{return w().localStorage||null;}catch{return null;}}
export function readMeasured(now=Date.now()){
  try{const v=JSON.parse(store()?.getItem(STORE_KEY)||'null');if(v&&(v.tier==='low'||v.tier==='ok')&&now-v.at<STALE_MS)return v;}catch{}
  return null;
}
/** Frame-rate verdict: median of frame gaps in ms -> fps. Needs enough frames to mean anything. */
export function fpsVerdict(gaps){
  if(!gaps||gaps.length<30)return null;
  const s=[...gaps].sort((a,b)=>a-b),median=s[Math.floor(s.length/2)],fps=1000/Math.max(1,median);
  return {fps:Math.round(fps*10)/10,tier:fps<LOW_FPS?'low':'ok'};
}
let measured=null,listeners=new Set(),probe=null;
export function currentTier(){
  const forced=qualityOverride();if(forced)return forced;
  const m=measured||readMeasured();
  const base=staticTier();
  if(m?.tier==='low')return 'low';
  if(base==='low')return 'low';
  return base;
}
export const isLowQuality=()=>currentTier()==='low';
export function onTierChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
function setMeasured(v){
  const before=currentTier();measured=v;
  try{store()?.setItem(STORE_KEY,JSON.stringify({...v,at:Date.now()}));}catch{}
  if(currentTier()!==before)for(const fn of listeners){try{fn(currentTier());}catch{}}
}
/** Samples requestAnimationFrame gaps for PROBE_MS while the page is visible (the island view, before
 * or between games). A hidden tab or a running game pauses the sample; slow frames from a game that is
 * still loading are not counted because `busy()` excludes them. Done once per page load. */
export function startFpsProbe({busy=()=>false,raf=w().requestAnimationFrame?.bind(w()),now=()=>w().performance.now(),duration=PROBE_MS,onDone=()=>{}}={}){
  if(probe||!raf||qualityOverride())return ()=>{};
  const gaps=[];let last=0,spent=0,stopped=false;
  probe=true;
  const step=t=>{
    if(stopped)return;
    const doc=w().document;
    if((doc&&doc.hidden)||busy()){last=0;raf(step);return;}
    if(last){const gap=t-last;if(gap<1000){gaps.push(gap);spent+=gap;}}
    last=t;
    if(spent>=duration){const verdict=fpsVerdict(gaps);if(verdict)setMeasured(verdict);onDone(verdict);return;}
    raf(step);
  };
  raf(step);
  return ()=>{stopped=true;};
}
/** In-game verdict: a heavy game that stays under LOW_FPS tells the island to go light next time.
 * Samples `duration` ms of frames once the game is ready (call it from the ready signal); a verdict of
 * 'ok' also clears an earlier 'low' measurement, so a device that recovered is not stuck on light. */
export function sampleGameFps({duration=8000,raf=w().requestAnimationFrame?.bind(w()),onDone=()=>{}}={}){
  if(!raf||qualityOverride()==='high')return ()=>{};
  const gaps=[];let last=0,spent=0,stopped=false;
  const step=t=>{
    if(stopped)return;
    if(w().document?.hidden){last=0;raf(step);return;}
    if(last){const gap=t-last;if(gap<1000){gaps.push(gap);spent+=gap;}}
    last=t;
    if(spent>=duration){const v=fpsVerdict(gaps);if(v)setMeasured(v);onDone(v);return;}
    raf(step);
  };
  raf(step);
  return ()=>{stopped=true;};
}
/** ?quality=auto forgets the stored measurement (the next open measures again). */
export function resetMeasured(){measured=null;try{store()?.removeItem(STORE_KEY);}catch{}}
export function describeTier(){return {tier:currentTier(),forced:qualityOverride(),static:staticTier(),measured:measured||readMeasured()};}
// Handy in the console and in tests: window.__islandQuality -> {tier, forced, static, measured}
try{Object.defineProperty(w(),'__islandQuality',{get:describeTier,configurable:true});}catch{}
