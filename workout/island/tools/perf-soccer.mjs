/** Soccer performance bench. Runs one real league match (same session, view, HUD and
 * CSS as the game) with a scripted bot for a fixed number of seconds and reports
 * frame times, simulation/render split, heap growth and quality tier changes.
 * Opens on a phone (tap the button) and in Playwright (?auto=1). Soccer only. */
import {startSoccer} from '../minigames/soccer-session.mjs?v=island-soccer-league-20261029-1';
import {gameContext} from '../minigames/context.mjs?v=island-soccer-league-20261029-1';
import {leagueMatch} from '../minigames/soccer-campaign.mjs?v=island-soccer-league-20261029-1';
import {initialSoccerCard} from '../activity/soccer-card.mjs?v=island-soccer-league-20261029-1';
import {initialSoccerRoster} from '../activity/soccer-roster.mjs?v=island-soccer-league-20261029-1';
import {createTranslator} from '../ui/translate.mjs?v=island-soccer-league-20261029-1';

const query=new URLSearchParams(location.search);
if(query.get('dev')!=='1'){query.set('dev','1');location.replace(`${location.pathname}?${query}`);} // the session exposes its model and view only in dev mode
const PIN=Math.max(0,Math.min(3,Number(query.get('quality'))||0)),SECONDS=Math.max(5,Number(query.get('seconds'))||30),WARMUP=Math.max(0,Number(query.get('warmup')??3)),SEED=(Number(query.get('seed'))||7)>>>0,LEVEL=Math.max(1,Number(query.get('level'))||1);
const $=id=>document.getElementById(id);
const status=$('perf-status'),report=$('perf-report'),startButton=$('perf-start');
const json=async url=>{const r=await fetch(new URL(url,import.meta.url));if(!r.ok)throw Error(url);return r.json();};
const [config,strings,players,team]=await Promise.all([json('../data/config.json'),json('../data/strings.he.json'),json('../data/players.json'),json('../data/team.json')]);
const t=createTranslator(strings,()=>{});
const balance=config.minigames.soccer;

/** Minimal engine/state shaped like the island's, with a fresh roster and no purchases. */
function fakeContext(){
  const card=initialSoccerCard(null,balance),roster=initialSoccerRoster(players,card,balance);
  const state={team:{...team,wins:0,rank:0,sportWins:{soccer:0,tennis:0}},players:players.map(p=>({...config.playerDefaults,...p})),soccerCard:card,soccerRoster:roster,
    minigameProgress:{soccer:{stage:LEVEL,stars:[]}},buildings:[],minigameLevels:{soccer:1},minigameEquipment:{soccer:{speed:0,kick:0,guard:0}},hangar:{},minigameWins:{},alienUpgrades:{}};
  const engine={data:{config},state};
  const league=leagueMatch(balance,LEVEL);
  return {engine,state,level:LEVEL,seed:SEED,difficulty:league.leagues?league.difficulty:card.difficulty,soccerCard:card,role:'field',
    canvas:$('perf-canvas'),controls:$('perf-controls'),status:$('perf-live'),t,
    finish(){},cancel(){},onError(id){status.textContent='שגיאה: '+id;}};
}

/** Deterministic bot on the controlled player: chase, dribble toward goal, shoot near the box, pass now and then. */
function createBot(seed){
  let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  let hold=0,passHold=0,sinceDecision=0;
  return (s,dt)=>{
    const p=s.players[s.controlled],b=s.ball,hx=balance.pitch.length/2,goalX=s.attackDir*hx,input={moveX:0,moveZ:0,kickHeld:false,passHeld:false,sprintHeld:false,switchPlayer:false};
    sinceDecision+=dt;
    let dx,dz;
    if(b.owner===p.id){dx=goalX-p.x;dz=-p.z*.35;
      const toGoal=Math.abs(goalX-p.x);
      if(hold<=0&&passHold<=0&&sinceDecision>.6){sinceDecision=0;if(toGoal<15&&random()<.55)hold=.3+random()*.3;else if(random()<.2)passHold=.08+random()*.3;}
    }else{dx=b.x-p.x;dz=b.z-p.z;input.sprintHeld=Math.hypot(dx,dz)>6;}
    const l=Math.hypot(dx,dz)||1;input.moveX=dx/l;input.moveZ=dz/l;
    if(hold>0){hold-=dt;input.kickHeld=hold>0;}
    if(passHold>0){passHold-=dt;input.passHeld=passHold>0;}
    return input;
  };
}

const percentile=(sorted,q)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))]:0;
const stats=list=>{const sorted=[...list].sort((a,b)=>a-b);return {mean:+(list.reduce((a,b)=>a+b,0)/(list.length||1)).toFixed(2),p50:+percentile(sorted,.5).toFixed(2),p95:+percentile(sorted,.95).toFixed(2),p99:+percentile(sorted,.99).toFixed(2),max:+(sorted.at(-1)||0).toFixed(2)};};

async function run(){
  startButton.disabled=true;status.textContent='טוען את הזירה...';
  const ctx=fakeContext(),session=startSoccer({...ctx,balance});
  if(!session.debug)throw Error('open with ?dev=1');
  const bot=createBot(SEED^0x9e3779b9);
  const loaded=performance.now();
  await new Promise(resolve=>{const check=()=>session.snapshot.renderMetrics?.assetStatus!=='loading'?resolve():requestAnimationFrame(check);check();});
  const assetReadyMs=Math.round(performance.now()-loaded);
  // Hooks: the bot feeds the same input contract as the joystick; update/render are timed in place.
  const model=session.debug.model,view=session.debug.view,originalUpdate=model.update,originalRender=view.render;
  for(let i=0;i<PIN;i++)view.qualitySample(20000,1); // ?quality=N pins the tier from the start (comparable runs)
  // The GL submit (three.js render) is timed apart from the animation layer that precedes it.
  let tickMs=0,renderMs=0,glMs=0,programsAtStart=0;const gl=view.renderer,glRender=gl?.render;
  if(gl)gl.render=function(scene,camera){const at=performance.now(),m0=mem();glRender.call(this,scene,camera);glMs+=performance.now()-at;glAlloc+=Math.max(0,mem()-m0);};
  // Heap growth inside each phase (precise memory only; a GC inside a phase shows as a negative delta and is dropped).
  const mem=()=>performance.memory?performance.memory.usedJSHeapSize:0;let tickAlloc=0,renderAlloc=0,glAlloc=0;
  model.update=(dt,input)=>{const at=performance.now(),m0=mem();const r=originalUpdate.call(model,dt,Object.assign(input||{},bot(model.getState(),dt)));tickMs+=performance.now()-at;tickAlloc+=Math.max(0,mem()-m0);return r;};
  view.render=(s,dt,frameMs)=>{const at=performance.now(),m0=mem();originalRender(s,dt,frameMs);renderMs+=performance.now()-at;renderAlloc+=Math.max(0,mem()-m0);};
  const frames=[],ticks=[],renders=[],gls=[],qualityChanges=[],memory=performance.memory?{start:performance.memory.usedJSHeapSize,last:performance.memory.usedJSHeapSize,allocated:0,gc:0}:null;
  let longTasks=0,longTaskMs=0;try{const observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){longTasks++;longTaskMs+=e.duration;}});observer.observe({entryTypes:['longtask']});}catch{}
  let last=0,phase='warmup',t0=0,measured=0,quality=session.snapshot.renderMetrics.quality,events={goal:0,shot:0,pass:0,loft:0,header:0,steal:0,save:0};
  const originalDrain=model.drainEvents;model.drainEvents=()=>{const list=originalDrain.call(model);for(const e of list)if(e.type in events)events[e.type]++;return list;};
  await new Promise(resolve=>{
    function frame(at){
      if(!last){last=at;t0=at;requestAnimationFrame(frame);return;}
      const ms=at-last;last=at;
      if(phase==='warmup'){if(at-t0>=WARMUP*1000){phase='measure';t0=at;tickMs=renderMs=glMs=tickAlloc=renderAlloc=glAlloc=0;programsAtStart=view.metrics().programs;}status.textContent=`חימום... ${Math.ceil(WARMUP-(at-t0)/1000)}`;}
      else{
        frames.push(ms);ticks.push(tickMs);renders.push(renderMs);gls.push(glMs);tickMs=renderMs=glMs=0;measured=at-t0;
        if(memory){const now=performance.memory.usedJSHeapSize;if(now<memory.last-1048576)memory.gc++;else memory.allocated+=Math.max(0,now-memory.last);memory.last=now;}
        if(frames.length%5===0){const q=view.metrics().quality;if(q!==quality){quality=q;qualityChanges.push({atSeconds:+(measured/1000).toFixed(1),quality:q});}status.textContent=`מודד... ${Math.ceil(SECONDS-measured/1000)} שניות, ${(1000*frames.length/measured).toFixed(0)} פריימים לשנייה`;}
        if(measured>=SECONDS*1000){resolve();return;}
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const metrics=view.metrics(),snapshot=session.snapshot;
  const result={viewport:{width:innerWidth,height:innerHeight},devicePixelRatio:devicePixelRatio,userAgent:navigator.userAgent,seed:SEED,level:LEVEL,pinnedQuality:PIN,warmupSeconds:WARMUP,seconds:+(measured/1000).toFixed(2),
    frames:frames.length,fps:+(1000*frames.length/measured).toFixed(1),frameMs:stats(frames),over33:frames.filter(f=>f>33).length,over50:frames.filter(f=>f>50).length,
    tickMs:stats(ticks),renderMs:stats(renders),glMs:stats(gls),animMs:stats(renders.map((r,i)=>Math.max(0,r-gls[i]))),programsCompiled:metrics.programs-programsAtStart,allocByPhaseMB:memory?{tick:+(tickAlloc/1048576).toFixed(1),render:+((renderAlloc-glAlloc)/1048576).toFixed(1),gl:+(glAlloc/1048576).toFixed(1),other:+((memory.allocated-tickAlloc-renderAlloc)/1048576).toFixed(1)}:null,longTasks,longTaskMs:Math.round(longTaskMs),
    heap:memory?{startMB:+(memory.start/1048576).toFixed(1),endMB:+(memory.last/1048576).toFixed(1),allocatedMB:+(memory.allocated/1048576).toFixed(1),allocatedMBPerSecond:+(memory.allocated/1048576/(measured/1000)).toFixed(2),gcCount:memory.gc}:null,
    assetReadyMs,warmup:metrics.warmup||null,quality:{final:metrics.quality,pixelRatio:metrics.pixelRatio,changes:qualityChanges,crowdCount:metrics.crowdCount,shadows:metrics.lighting?.sunShadows,triangles:metrics.triangles,drawCalls:metrics.drawCalls,assetStatus:metrics.assetStatus,turf:metrics.turf,lod:metrics.assetStats?.lod},
    match:{score:snapshot.score,elapsed:+snapshot.elapsed.toFixed(1),phase:snapshot.phase,events}};
  session.dispose();
  show(result);
  window.__perf={done:true,result};
}

function show(r){
  const rows=[['פריימים לשנייה (ממוצע)',r.fps],['זמן פריים ממוצע',r.frameMs.mean+' ms'],['זמן פריים p95',r.frameMs.p95+' ms'],['זמן פריים מקסימלי',r.frameMs.max+' ms'],['פריימים מעל 33ms',r.over33+' מתוך '+r.frames],['פריימים מעל 50ms',r.over50],
    ['סימולציה (tick) ממוצע / p95',r.tickMs.mean+' / '+r.tickMs.p95+' ms'],['רינדור (render) ממוצע / p95',r.renderMs.mean+' / '+r.renderMs.p95+' ms'],['מזה: שכבת אנימציה (JS לפני GL) ממוצע / p95',r.animMs.mean+' / '+r.animMs.p95+' ms'],['מזה: שליחה ל-GL ממוצע / p95',r.glMs.mean+' / '+r.glMs.p95+' ms'],['תוכניות שיידר שקומפלו תוך כדי משחק',r.programsCompiled],['משימות ארוכות',r.longTasks+' ('+r.longTaskMs+' ms)'],
    ['הקצאות זיכרון',r.heap?r.heap.allocatedMB+' MB ('+r.heap.allocatedMBPerSecond+' MB/s), GC: '+r.heap.gcCount+(r.allocByPhaseMB?', סימולציה '+r.allocByPhaseMB.tick+' / אנימציה '+r.allocByPhaseMB.render+' / GL '+r.allocByPhaseMB.gl+' / אחר '+r.allocByPhaseMB.other:''):'לא נמדד בדפדפן הזה'],['טעינת נכסים',r.assetReadyMs+' ms'+(r.warmup?' (חימום שיידרים '+r.warmup.ms+' ms, '+r.warmup.programs+' תוכניות)':'')],
    ['איכות בסוף',r.quality.final+' (pixelRatio '+r.quality.pixelRatio+', קהל '+r.quality.crowdCount+', צללים '+(r.quality.shadows?'כן':'לא')+')'],['הורדות איכות',r.quality.changes.length?r.quality.changes.map(c=>c.atSeconds+'s→'+c.quality).join(', '):'אין'],
    ['משולשים / draw calls',r.quality.triangles+' / '+r.quality.drawCalls],['תוצאה אחרי '+r.match.elapsed+' שניות',r.match.score.join('-')+', אירועים: '+Object.entries(r.match.events).map(([k,v])=>k+' '+v).join(', ')],['מסך',r.viewport.width+'×'+r.viewport.height+' @'+r.devicePixelRatio]];
  const table=document.createElement('table');for(const [k,v]of rows){const tr=document.createElement('tr'),a=document.createElement('th'),b=document.createElement('td');a.textContent=k;b.textContent=String(v);tr.append(a,b);table.append(tr);}
  const text=JSON.stringify(r,null,1),pre=document.createElement('pre');pre.textContent=text;
  const copy=document.createElement('button');copy.type='button';copy.textContent='העתקת הדוח';copy.addEventListener('click',()=>navigator.clipboard?.writeText(text).then(()=>copy.textContent='הועתק'));
  report.replaceChildren(table,copy,pre);report.hidden=false;status.textContent='המדידה הסתיימה.';startButton.disabled=false;
}

startButton.addEventListener('click',()=>run().catch(e=>{status.textContent='שגיאה: '+e.message;window.__perf={done:true,error:String(e)};}));
if(query.get('auto')==='1')run().catch(e=>{status.textContent='שגיאה: '+e.message;window.__perf={done:true,error:String(e)};});
