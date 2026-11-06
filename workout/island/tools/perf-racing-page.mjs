/* Performance bench for Island Racing. Runs one race on an autopilot through the real session (model, view,
 * HUD) and reports triangles, draw calls, frame time and JS cost. Results: window.__perf.
 * Software WebGL (SwiftShader) makes these numbers relative only: they are not what a phone does.
 * The simulation is stepped with a fixed 1/30 s per frame (synthetic timestamps), so frame N shows the same moment of the same race in every
 * run: before/after pairs compare identical scenes. Frame times are still measured with the real clock.
 * URL: ?frames=60 (frames to measure after a 40-frame warm-up) &stage=1 &seed=7 &dpr=0.15 (tiny backing store: CPU only) &fixed=0 (real dt)
 *      &racingV7=0 (previous assets) &shot=1 (hide the panel for screenshots) &hold=1 (stay on the grid: no driving)
 *      &at=SECONDS (shot mode: drive that long, then freeze for the screenshot) */
import {runRacingSession} from '../minigames/racing-session.mjs?v=island-v2-20261106-1';
const q=new URLSearchParams(location.search);
const FRAMES=Math.max(10,Number(q.get('frames')||60)),WARM=40,FIXED=q.get('fixed')!=='0',STAGE=Number(q.get('stage')||1),SEED=Number(q.get('seed')||7),HOLD=q.get('hold')==='1',AT=Number(q.get('at')||0);
if(q.get('shot')==='1')document.body.classList.add('shot');
if(q.get('dev')!=='1'){q.set('dev','1');history.replaceState(null,'',location.pathname+'?'+q.toString());}
if(q.get('dpr'))Object.defineProperty(window,'devicePixelRatio',{get:()=>Number(q.get('dpr')),configurable:true});
const perfEl=document.getElementById('perf');
const config=await (await fetch('../data/config.json')).json(),balance=config.minigames.islandRacing;
const screen=document.querySelector('.game-screen'),canvas=screen.querySelector('canvas'),controls=screen.querySelector('.game-controls'),status=screen.querySelector('.game-status');
const t=k=>k;
const pct=(arr,p)=>{if(!arr.length)return 0;const a=[...arr].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*(a.length-1)))];};
const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0,r2=v=>Math.round(v*100)/100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

// every requestAnimationFrame callback is timed (JS cost) and the gaps between frames are the frame time
const raw=window.requestAnimationFrame.bind(window);
const M={frames:[],ticks:[],calls:[],tris:[],lastNow:0,heapAlloc:0,lastHeap:null,start:0};
let running=false,session=null,synthetic=1000,racingFrames=0,doneMeasure=null;
window.requestAnimationFrame=cb=>raw(now=>{
 if(FIXED){synthetic+=1000/30;}
 const t0=performance.now();cb(FIXED?synthetic:now);const t1=performance.now();
 const phase=session?.debug?.model?.state?.phase;if(phase==='racing'||phase==='finished'){racingFrames++;if(racingFrames===WARM){running=true;M.lastNow=0;M.start=performance.now();}}
 if(!running)return;
 if(now===M.lastNow){M.ticks[M.ticks.length-1]+=t1-t0;return;} // a second callback of the same frame (HUD, audio): its cost belongs to that frame
 if(M.lastNow)M.frames.push(now-M.lastNow);M.lastNow=now;M.ticks.push(t1-t0);
 const rm=session?.snapshot?.renderMetrics;
 if(rm){M.calls.push(rm.drawCalls);M.tris.push(rm.triangles);}
 const mem=performance.memory;if(mem){const h=mem.usedJSHeapSize;if(M.lastHeap!=null&&h>=M.lastHeap)M.heapAlloc+=h-M.lastHeap;M.lastHeap=h;}
 if(M.frames.length>=FRAMES){running=false;doneMeasure?.();}
});

const created=performance.now();
const ctx={balance,level:STAGE,seed:SEED,difficulty:'easy',equipment:{},canvas,controls,status,t,sound(){},
 finish(r){window.__perfFinish=r;},cancel(){},onError(reason){perfEl.textContent='שגיאה: '+reason;window.__perf={error:reason};}};
session=runRacingSession(ctx);window.__session=session;
// ready = the view is built and the first frame is drawn
await new Promise(res=>{const wait=()=>{const s=session.snapshot;if(s.error){res();return;}if(s.renderMetrics?.frames>1)res();else setTimeout(wait,100);};wait();});
const loadMs=Math.round(performance.now()-created);
if(session.snapshot.error){window.__perf={error:session.snapshot.error};}
else{
 const model=session.debug.model,input=session.debug.input,track=model.track;
 if(!HOLD){
  // autopilot: pure pursuit on the centre line; drifts in the sharper corners so smoke, skid marks and the camera kick run
  input.sample=()=>{
   const p=model.state.player,pr=track.project(p.x,p.z,p.s),look=10+p.speed*.5,tg=track.sample(pr.s+look);
   const err=wrapAngle(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),steer=clamp(err*1.7,-1,1);
   return {steer,throttle:1,autoAccelerate:true,brake:false,drift:Math.abs(err)>.22&&p.speed>14,nitro:p.nitro>70&&Math.abs(err)<.08};
  };
 }
 if(AT>0){
  // screenshot mode: drive for AT seconds of race time, then freeze on that frame
  await new Promise(res=>{const wait=()=>{if(model.state.time>=AT)res();else setTimeout(wait,100);};wait();});
  session.setPaused(true);window.__perf={shot:true,time:model.state.time,render:session.snapshot.renderMetrics};
 }else{
  // the countdown is 3 s of the grid; measuring starts WARM racing frames later (shader compile, first LOD switches)
  const ui=setInterval(()=>{perfEl.textContent=`מודד ${M.frames.length} / ${FRAMES} פריימים (חימום ${Math.min(racingFrames,WARM)}/${WARM})`;},500);
  await new Promise(res=>{doneMeasure=res;});
  clearInterval(ui);const start=M.start;
  const secs=(performance.now()-start)/1000,rm=session.snapshot.renderMetrics||{};
  const s={seconds:r2(secs),frames:M.frames.length,fps:r2(M.frames.length/secs),loadMs,fixedStep:FIXED,stage:STAGE,seed:SEED,hold:HOLD,
   frameMs:{avg:r2(avg(M.frames)),p50:r2(pct(M.frames,.5)),p95:r2(pct(M.frames,.95)),max:r2(Math.max(0,...M.frames))},
   tickMs:{avg:r2(avg(M.ticks)),p50:r2(pct(M.ticks,.5)),p95:r2(pct(M.ticks,.95))},
   calls:{avg:r2(avg(M.calls)),p50:pct(M.calls,.5),max:Math.max(0,...M.calls)},triangles:{avg:Math.round(avg(M.tris)),p50:pct(M.tris,.5),max:Math.max(0,...M.tris)},
   allocMBps:performance.memory?r2(M.heapAlloc/1048576/secs):null,
   progress:{lap:model.state.player.lap,s:Math.round(model.state.player.s),speed:r2(model.state.player.speed)},
   render:rm,viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},ua:navigator.userAgent,params:location.search};
  window.__perf=s;
  const rows=[['טעינה',s.loadMs+' ms'],['פריימים',`${s.frames} ב-${s.seconds} s`],['פריים p50 / p95',`${s.frameMs.p50} / ${s.frameMs.p95} ms`],['CPU לפריים',`${s.tickMs.avg} ms`],['draw calls',`${s.calls.avg} (max ${s.calls.max})`],['משולשים',`${s.triangles.avg} (max ${s.triangles.max})`],['נכסים',`${rm.carAsset||'-'} / v7: ${rm.v7?.active}`]];
  perfEl.replaceChildren();const tb=document.createElement('table');for(const [k,v] of rows){const tr=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td');a.textContent=k;b.textContent=String(v);tr.append(a,b);tb.append(tr);}perfEl.append(tb);
  session.setPaused(true);
 }
}
