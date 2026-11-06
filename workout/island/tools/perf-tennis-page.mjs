/* Performance bench for Island Tennis (view only, no shell): builds the real tennis view and plays the real
 * simulation on a simple autopilot for N seconds. Reports triangles, draw calls, the frame-time spread,
 * view.render alone and the load time. Works on a phone and in Playwright (SwiftShader software WebGL, so the
 * numbers are relative CPU/raster cost, not what a phone GPU does). Results: window.__perf.
 * URL: ?dur=20 (seconds) &quality=0..2 (pinned unless &adapt=1) &dpr=0.15 (tiny backing store: CPU only)
 *      &seed=4107 &stage=1 &tennisV7=0|1 &tennisSurface=hard|clay|grass &tennisCrowdLevel=0..2 */
import {createTennis} from '../minigames/tennis.mjs';
import {createTennisView} from '../minigames/tennis-view.mjs';
const q=new URLSearchParams(location.search);
const DUR=Math.max(3,Number(q.get('dur')||20)),QUALITY=Number(q.get('quality')||0),ADAPT=q.get('adapt')==='1',STAGE=Number(q.get('stage')||1),SEED=(Number(q.get('seed'))||4107)>>>0;
const perfEl=document.getElementById('perf');
if(q.get('dpr'))Object.defineProperty(window,'devicePixelRatio',{get:()=>Number(q.get('dpr')),configurable:true});
const balance=(await (await fetch('../data/config.json')).json()).minigames.tennis;
const canvas=document.querySelector('canvas');
const opponent=balance.opponents[(STAGE-1)%balance.opponents.length];
const viewConfig={...balance,stage:STAGE,render:{...balance.render,shirtColor:'#4d9ddb'},opponentShirtColor:opponent.shirtColor};
// &slowMs=100000 keeps the view's own tier drop out of the way (tests that exercise the crowd governor alone)
if(q.get('slowMs'))viewConfig.render.slowFrameMs=Number(q.get('slowMs'));
const model=createTennis({config:balance,stage:STAGE,seed:SEED});
const t0=performance.now();
let view;
try{view=await createTennisView(canvas,viewConfig);}catch(error){window.__perf={error:String(error?.message||error)};perfEl.textContent='שגיאה: '+(error?.message||error);throw error;}
if(view.setQuality)view.setQuality(QUALITY);
const loadMs=Math.round(performance.now()-t0);
window.__tennis={view,model,loadMs};
// autopilot: serve, run to the predicted contact point and swing on time (good enough to keep rallies alive)
let swingPulse=false;
function pilot(s){
 const input={};
 if(s.server===0&&s.phase==='serve')input.serve=true;
 else if(s.server===0&&s.phase==='toss')input.serve=s.phaseTime<.62;
 else if(s.phase==='rally'){
  const c=s.contact;
  if(c&&c.side===0){
   const dx=c.x-s.players[0].x,dz=c.z-s.players[0].z;input.move=Math.max(-1,Math.min(1,dx*2.2));input.moveZ=Math.max(-1,Math.min(1,dz*2.2));
   if(c.eta<=.03&&c.eta>-.2&&!swingPulse){input.swing=true;swingPulse=true;}else if(c.eta>.1)swingPulse=false;
  }else{input.move=-s.players[0].x*.8;input.moveZ=(4.2-s.players[0].z)*.8;swingPulse=false;}
 }
 return input;
}
const M={frames:[],ticks:[],renders:[],start:0,lastNow:0,long:0};
let running=false;
if('PerformanceObserver' in window){try{new PerformanceObserver(list=>{if(!running)return;for(const e of list.getEntries())M.long++;}).observe({type:'longtask',buffered:false});}catch{}}
const pct=(arr,p)=>{if(!arr.length)return 0;const a=[...arr].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*(a.length-1)))];};
const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0,r2=v=>Math.round(v*100)/100;
function summary(){
 const secs=(M.lastNow-M.start)/1000||1,m=view.metrics();
 return {seconds:r2(secs),frames:M.frames.length,fps:r2(M.frames.length/secs),loadMs,
  frameMs:{avg:r2(avg(M.frames)),p50:r2(pct(M.frames,.5)),p95:r2(pct(M.frames,.95)),max:r2(Math.max(0,...M.frames))},
  tickMs:{avg:r2(avg(M.ticks)),p95:r2(pct(M.ticks,.95))},renderMs:{avg:r2(avg(M.renders)),p95:r2(pct(M.renders,.95))},longTasks:M.long,
  viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},quality:m.quality,
  render:{triangles:m.triangles,drawCalls:m.drawCalls,geometries:m.geometries,textures:m.textures,pixelRatio:m.pixelRatio,shadows:m.shadows,crowd:m.crowd,tennisV7:m.tennisV7??null,crowdLevel:m.crowdLevel??null,surface:m.surface??null,v4Fallbacks:m.v7Fallbacks??null},
  phase:model.getState().phase,hits:model.getState().rallyHits,score:model.getState().score,ua:navigator.userAgent};
}
function show(s,done){
 const rows=[['זמן',s.seconds+' s'],['טעינה',s.loadMs+' ms'],['FPS ממוצע',s.fps],['פריים p50 / p95',`${s.frameMs.p50} / ${s.frameMs.p95} ms`],['render ממוצע',`${s.renderMs.avg} ms`],['draw calls / משולשים',`${s.render.drawCalls} / ${s.render.triangles}`],['v7',String(s.render.tennisV7)],['מסך',`${s.viewport.w}x${s.viewport.h} @${s.viewport.dpr}`]];
 perfEl.replaceChildren();const h=document.createElement('div');h.className='live';h.textContent=done?'סיום המדידה':'מודד...';perfEl.append(h);
 const tb=document.createElement('table');for(const [k,v] of rows){const tr=document.createElement('tr');const a=document.createElement('td');a.textContent=k;const b=document.createElement('td');b.textContent=String(v);tr.append(a,b);tb.append(tr);}perfEl.append(tb);
}
let last=0;
function tick(now){
 const c0=performance.now();
 const dt=last?Math.min((now-last)/1000,.05):0;last=now;
 model.update(dt,pilot(model.getState()));
 if(ADAPT&&dt)view.observeFrame(dt*1000);
 const r0=performance.now();view.render(model.getState(),dt);const r1=performance.now();
 if(running){
  if(M.lastNow)M.frames.push(now-M.lastNow);M.lastNow=now;
  M.ticks.push(performance.now()-c0);M.renders.push(r1-r0);
 }
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// warm up (shader compile, first rally) before measuring
await new Promise(r=>setTimeout(r,2500));
running=true;M.start=performance.now();M.lastNow=0;
const ui=setInterval(()=>show(summary(),false),1000);
setTimeout(()=>{running=false;clearInterval(ui);const s=summary();window.__perf=s;show(s,true);},DUR*1000);
