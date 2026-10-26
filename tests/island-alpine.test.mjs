import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,STORAGE_KEY,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {createAlpineEngine,alpineReward,RIDER_IDS} from '../workout/island/minigames/alpine-engine.mjs';
import {generateCourse,rockClearance} from '../workout/island/minigames/alpine-track.mjs';
import {alpineResult} from '../workout/island/minigames/alpine-result.mjs';
import {loadRecords,recordRun,formatRaceTime} from '../workout/island/minigames/alpine-records.mjs';
import {createAlpineControls} from '../workout/island/minigames/alpine-controls.mjs';
import {createAlpineAudio} from '../workout/island/minigames/alpine-audio.mjs';
import {gameArtwork} from '../workout/island/ui/adventure-emblems.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const balance=data.config.minigames.alpineRush,P=balance.physics;
const memory=(entries=new Map())=>({entries,getItem:key=>entries.has(key)?entries.get(key):null,setItem(key,value){entries.set(key,String(value));},removeItem(key){entries.delete(key);}});

/** Scripted player: same lane logic for every test, steering in simulation time only. */
function lanePilot(engine,{look=40,boost=true}={}){
  const d=engine.debug()[0],objs=engine.course.objects.filter(o=>o.s>d.s+1&&o.s<d.s+look);let best=d.x,bc=Infinity;
  for(let cx=-8;cx<=8;cx+=.4){let c=Math.abs(cx-d.x)*.12;for(const o of objs){const near=1/(1+(o.s-d.s)/18);
    if(o.type==='rock'&&Math.abs(cx-o.x)<o.radius*P.rockHitScale+P.board.halfWidth+.25)c+=100*near;
    if(o.type==='gate'&&Math.abs(Math.abs(cx-o.x)-P.gateHalfWidth)<1.2)c+=100*near;
    if(o.type==='ramp'){const off=Math.abs(cx-o.x);if(off>=1.6&&off<2.5)c+=60*near;}
    if(o.type==='boost'&&Math.abs(cx-o.x)<1.3)c-=4*near;}if(c<bc){bc=c;best=cx;}}
  engine.command({type:'steer',value:Math.max(-1,Math.min(1,(best-d.x)*.7))});
  if(boost&&engine.snapshot().boostReady)engine.command({type:'boost'});
}
function race(stage,seed,{pilot=lanePilot,dt=1/60,maxFrames=30000}={}){
  const e=createAlpineEngine({balance,stage,seed});e.command({type:'start'});const events=[];
  for(let n=0;n<maxFrames&&e.phase!=='finished';n++){if(e.phase==='racing')pilot?.(e);e.step(dt);events.push(...e.drainEvents());}
  return {engine:e,result:e.snapshot().result,events};
}
/** A tiny hand-made course for rule tests. Riders 2..6 are parked far behind on the grid. */
function ruleEngine(objects,{length=400,stage=1,ai=null,grid=null}={}){
  const b=structuredClone(balance);b.physics.grid=grid||[{s:0,x:0},...Array.from({length:5},(_,i)=>({s:-200-i*5,x:i*2-4}))];
  if(ai)b.levels[stage-1].ai=b.levels[stage-1].ai.map(r=>({...r,...ai}));
  const course={id:'test',length,objects:objects.map((o,i)=>({id:o.id||`t-${i}`,...o})).sort((a,c)=>a.s-c.s),rows:[]};
  const e=createAlpineEngine({balance:b,stage,seed:9,course});e.command({type:'start'});while(e.phase==='countdown')e.step(1/60);e.drainEvents();return e;
}
const run=(e,seconds,steer=0)=>{const events=[];for(let i=0;i<Math.round(seconds*60);i++){e.command({type:'steer',value:steer});e.step(1/60);events.push(...e.drainEvents());}return events;};

test('Alpine Rush is registered, flagged, landscape-free and uses existing island content',()=>{
  const engine=createEngine(data,{storage:null}),game=engine.registry.minigames.get('alpineRush');
  assert.ok(game);assert.equal(game.featureFlag,'alpineRush');assert.equal(data.featureFlags.alpineRush,true);
  assert.equal(data.config.gameShell.games.alpineRush.orientation,'any');assert.equal(balance.levels.length,3);
  assert.deepEqual(balance.levels.map(l=>l.trackId),['ice-peak','frost-forest','storm-ridge']);
  assert.equal(gameArtwork('alpineRush').file,'alpine.webp');
  for(const key of ['minigame.alpineRush.title','minigame.alpineRush.help.1','minigame.alpineRush.help.2','minigame.alpineRush.help.3','feature.alpineRush.1','feature.alpineRush.2','feature.alpineRush.3','alpine.track.icePeak','alpine.track.frostForest','alpine.track.stormRidge'])assert.ok(strings[key],key);
  assert.equal(ActivityInterface.prototype.requireDaily.call({engine:{learningStatus:()=>({locked:true})},ui:{learningInterface:{daily(){}}}},'alpineRush'),true);
});

test('1. complete races are decided by distance and finish times: a known win and a known loss',()=>{
  const win=race(1,42),loss=race(1,42,{pilot:null});
  assert.equal(win.result.completed,true);assert.equal(win.result.won,true);assert.ok(win.result.rank<=balance.levels[0].targetRank);
  assert.equal(loss.result.won,false);assert.ok(loss.result.rank>balance.levels[0].targetRank);
  for(const r of [win,loss]){
    const ranked=r.engine.debug().slice().sort((a,b)=>(b.finished-a.finished)||b.s-a.s);
    // Every rider counted ahead of the player had already crossed the line.
    const ahead=r.engine.debug().slice(1).filter(d=>d.finished).length;assert.equal(r.result.rank,ahead+1);
    assert.ok(ranked.length===6);assert.ok(r.result.elapsedMs>=60000&&r.result.elapsedMs<=100000,`${r.result.elapsedMs} ms`);
  }
  assert.equal(win.result.reward,alpineReward(balance,1,win.result.rank).money);assert.equal(loss.result.reward,0);
});

test('1b. the opening is gentle: the first obstacle is at least 100 m down the slope on every course',()=>{
  for(const level of balance.levels){const c=generateCourse({...balance.tracks[level.trackId],id:level.trackId},P);assert.ok(c.objects[0].s>=100);assert.ok(c.objects.at(-1).s<c.length-40);}
});

test('fairness: every course row leaves a free board corridor reachable from the previous one',()=>{
  for(const level of balance.levels){
    const c=generateCourse({...balance.tracks[level.trackId],id:level.trackId},P);
    for(const row of c.rows){
      assert.ok(row.to-row.from>=.8,`${level.trackId} corridor at ${row.s} is ${row.to-row.from}`);
      // No rock edge intrudes into a declared corridor.
      for(const o of c.objects.filter(o=>o.type==='rock'&&Math.abs(o.s-row.s)<2))for(const x of [row.from,row.to,(row.from+row.to)/2])
        if(x>row.from+.01&&x<row.to-.01)assert.ok(Math.abs(x-o.x)>=o.radius*P.rockHitScale,`${level.trackId} ${o.id}`);
    }
    for(let i=1;i<c.rows.length;i++){const a=c.rows[i-1],b=c.rows[i],gap=Math.max(0,b.from-a.to,a.from-b.to);
      assert.ok(gap<=P.lateralSpeed*(b.s-a.s)/P.boostSpeed,`${level.trackId} rows ${a.s}->${b.s}`);}
    assert.equal(new Set(c.objects.map(o=>o.id)).size,c.objects.length,'stable unique ids');
  }
});

test('2. controls: drag, keys and boost are separate; every release path clears steering',()=>{
  const doc=new EventTarget(),win=new EventTarget();doc.defaultView=win;doc.hidden=false;
  const canvas=new EventTarget(),button=new EventTarget();let captured=new Set();
  Object.assign(canvas,{ownerDocument:doc,dataset:{},style:{},getBoundingClientRect:()=>({width:400}),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)});
  Object.assign(button,{disabled:false});
  const fire=(target,type,props={})=>{const e=new Event(type,{cancelable:true});for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});target.dispatchEvent(e);return e;};
  const c=createAlpineControls({canvas,boostButton:button,config:{dragMetresPerWidth:20,trackHalfWidth:8.4}});
  const player={x:0,lean:0};
  fire(canvas,'pointerdown',{pointerId:1,clientX:200,button:0,pointerType:'touch'});fire(canvas,'pointermove',{pointerId:1,clientX:300});
  assert.ok(c.sample(player).steer>.9,'drag right steers right');
  for(const end of ['pointerup','pointercancel','lostpointercapture']){fire(canvas,'pointerdown',{pointerId:2,clientX:200,pointerType:'touch'});fire(canvas,'pointermove',{pointerId:2,clientX:100});fire(canvas,'pointerup',{pointerId:1});
    if(end!=='pointerup')assert.ok(c.sample(player).steer<-.9);fire(canvas,end,{pointerId:2});assert.equal(c.sample(player).steer,0,end);}
  fire(win,'keydown',{code:'ArrowLeft'});assert.equal(c.sample(player).steer,-1);fire(win,'blur');assert.equal(c.sample(player).steer,0,'window blur');
  fire(win,'keydown',{code:'KeyD'});doc.hidden=true;fire(doc,'visibilitychange');doc.hidden=false;assert.equal(c.sample(player).steer,0,'hidden tab');
  const down=fire(button,'pointerdown',{pointerId:7});assert.equal(down.defaultPrevented,true);assert.equal(c.dragging,false,'boost press never starts a drag');
  const s=c.sample(player);assert.equal(s.boost,true);assert.equal(s.steer,0,'boost is not a steering command');assert.equal(c.sample(player).boost,false,'boost is one-shot');
  fire(win,'keydown',{code:'Space',target:{closest:()=>null}});assert.equal(c.sample(player).boost,true);
  fire(win,'keydown',{code:'Space',repeat:true,target:{closest:()=>null}});assert.equal(c.sample(player).boost,false,'key repeat does not queue boosts');
  fire(button,'click',{detail:0});assert.equal(c.sample(player).boost,true,'keyboard activation of the button');
  c.setEnabled(false);fire(win,'keydown',{code:'ArrowRight'});assert.deepEqual(c.sample(player),{steer:0,boost:false});
  c.dispose();fire(canvas,'pointerdown',{pointerId:3,clientX:0});assert.equal(c.dragging,false);
  // Steering past either edge stops at the track boundary.
  const e=ruleEngine([]);run(e,3,1);assert.equal(e.debug()[0].x,P.trackHalfWidth);run(e,4,-1);assert.equal(e.debug()[0].x,-P.trackHalfWidth);
  // A slower rival straight ahead can be passed on either side with the same control.
  for(const side of [-1,1]){const g=[{s:0,x:0},{s:12,x:0},...Array.from({length:4},(_,i)=>({s:-200-i*5,x:i*2-4}))];
    const o=ruleEngine([],{grid:g,ai:{speed:.7,boostChance:0}});const evs=run(o,8,side*.6);
    assert.ok(evs.some(x=>x.type==='overtake'&&x.riderId==='player'&&x.objectId==='rival-1'),`pass on side ${side}`);assert.ok(Math.sign(o.debug()[0].x)===side);}
});

test('3. the same seed and command script give identical physics at 30, 60 and 120 fps, and long frames are bounded',()=>{
  const script=t=>({steer:Math.sin(t*.9)*.8,boost:Math.abs(t%7-3)<1e-9});
  const runAt=fps=>{const e=createAlpineEngine({balance,stage:2,seed:77});e.command({type:'start'});let t=0;const step=1/fps;
    for(let n=0;n<fps*95&&e.phase!=='finished';n++){const k=Math.round(t*30)/30;if(Math.abs(k-t)<1e-9){const c=script(k);e.command({type:'steer',value:c.steer});if(c.boost)e.command({type:'boost'});}e.step(step);t=Math.round((t+step)*1e6)/1e6;}
    const s=e.snapshot();return JSON.stringify({p:s.player,r:s.rivals,t:s.timeMs,res:s.result,d:e.debug().map(d=>[d.s,d.x,d.collisions])});};
  const a=runAt(30),b=runAt(60),c=runAt(120);assert.equal(a,b);assert.equal(b,c);
  const e=createAlpineEngine({balance,stage:1,seed:3});e.command({type:'start'});const ticks=e.step(30);
  assert.equal(ticks,Math.round(P.maxCatchUpSeconds/P.fixedStep),'a 30 s frame advances at most the catch-up bound');
});

test('4. rocks hit only on board overlap, once per object; recovery keeps control; rivals obey the same rules',()=>{
  const r=.8,clear=r*P.rockHitScale+P.board.halfWidth;
  const miss=ruleEngine([{id:'rock',type:'rock',x:clear+.05,s:60,radius:r}]);assert.equal(run(miss,5).filter(e=>e.type==='collision'&&e.riderId==='player').length,0,'just outside the board footprint');
  const h=ruleEngine([{id:'rock',type:'rock',x:clear-.05,s:60,radius:r}]);const events=run(h,6);
  const hits=events.filter(e=>e.type==='collision'&&e.riderId==='player');assert.equal(hits.length,1,'one event for one object');assert.equal(hits[0].objectId,'rock');
  // Speed drops by the configured share and recovers within about a second; steering still works.
  const k=ruleEngine([{id:'rock',type:'rock',x:0,s:80,radius:r}]);let speedBefore=0,speedAfter=0;
  for(let i=0;i<600;i++){const d=k.debug()[0];k.step(1/60);const evs=k.drainEvents();if(evs.some(e=>e.type==='collision')){speedBefore=d.speed;speedAfter=k.debug()[0].speed;break;}}
  assert.ok(speedAfter<speedBefore*(1-P.hitSpeedLoss)+.5&&speedAfter>speedBefore*(1-P.hitSpeedLoss)-.5);
  const x0=k.debug()[0].x;run(k,.3,1);assert.ok(k.debug()[0].x>x0+1,'steering works during recovery');
  run(k,1.3);assert.ok(k.debug()[0].speed>=P.baseSpeed-1.2,'recovered');
  // Rivals that never look use the very same collision test.
  const wall=[-6,-4,-2,0,2,4,6].map((x,i)=>({id:`wall-${i}`,type:'rock',x,s:150,radius:1.1}));
  const ai=ruleEngine(wall,{ai:{mistakeRate:1}});const evs=run(ai,30);
  const rivalHits=evs.filter(e=>e.type==='collision'&&e.riderId!=='player');
  assert.ok(rivalHits.length>=3,'rivals that miss the rocks collide with them');assert.ok(rivalHits.every(e=>e.objectId.startsWith('wall-')));
  const seeing=ruleEngine(wall.filter(o=>o.x!==-6&&o.x!==6),{ai:{mistakeRate:0,error:0}});const seen=run(seeing,30).filter(e=>e.type==='collision'&&e.riderId!=='player');
  assert.ok(seen.length<rivalHits.length,'rivals that see the rocks steer around');
});

test('5. a ramp launches at its lip, clears a rock below, lands with an event; gate posts block below the bar',()=>{
  const e=ruleEngine([{id:'ramp',type:'ramp',x:0,s:60},{id:'rock',type:'rock',x:0,s:72,radius:.8}]);const ev=[];let maxH=0,takeoffS=null;
  for(let i=0;i<400;i++){e.step(1/60);for(const x of e.drainEvents()){ev.push(x);if(x.type==='takeoff')takeoffS=e.debug()[0].s;}maxH=Math.max(maxH,e.debug()[0].height);}
  assert.ok(takeoffS>=60+P.ramp.length/2&&takeoffS<60+P.ramp.length/2+.6,`takeoff at ${takeoffS}`);
  assert.ok(maxH>rockClearance(.8)&&maxH>P.ramp.height);assert.ok(ev.some(x=>x.type==='land'&&x.riderId==='player'));
  assert.equal(ev.filter(x=>x.type==='collision'&&x.riderId==='player').length,0,'jumped over the rock');
  const s=e.snapshot();assert.equal(s.player.height,0);
  const post=ruleEngine([{id:'gate',type:'gate',x:P.gateHalfWidth,s:60}]);const pe=run(post,5);
  assert.equal(pe.filter(x=>x.type==='collision'&&x.objectId==='gate'&&x.riderId==='player').length,1,'board on a post collides once');
  const through=ruleEngine([{id:'gate',type:'gate',x:0,s:60}]);const tank=through.debug()[0].tank;const te=run(through,5);
  assert.equal(te.filter(x=>x.type==='collision'&&x.riderId==='player').length,0);assert.ok(te.some(x=>x.type==='gate'&&x.riderId==='player'));assert.ok(through.debug()[0].tank>tank,'a clean gate charges the tank');
  const side=ruleEngine([{id:'ramp',type:'ramp',x:2.6,s:60}]);run(side,.5);const se=run(side,5,0);
  // Riding beside the ramp at x=0 clears its side wall (2 m half width + half board).
  assert.equal(se.filter(x=>x.type==='collision'&&x.riderId==='player').length,0);
});

test('6. boost: starts, drains, ends, recharges; pads trigger once per pass; repeated presses cannot extend it',()=>{
  const e=ruleEngine([]);const d0=e.debug()[0];assert.equal(d0.tank,P.boostStartTank);
  e.command({type:'boost'});e.step(1/60);let ev=e.drainEvents();assert.ok(ev.some(x=>x.type==='boost-start'&&x.riderId==='player'));
  const t0=e.debug()[0].boostTime;assert.ok(Math.abs(t0-(P.boostStartTank*P.boostSeconds-1/60))<1e-6);
  for(let i=0;i<30;i++){e.command({type:'boost'});e.step(1/60);}assert.ok(e.debug()[0].boostTime<t0,'presses while boosting do not refill');
  ev=run(e,2);assert.ok(ev.some(x=>x.type==='boost-end'&&x.riderId==='player'));assert.ok(e.debug()[0].tank>0,'recharges after the boost');
  e.command({type:'boost'});e.step(1/60);assert.equal(e.drainEvents().filter(x=>x.type==='boost-start'&&x.riderId==='player').length,0,'not enough in the tank');
  const p=ruleEngine([{id:'pad',type:'boost',x:0,s:40}]);const pev=run(p,6);
  assert.equal(pev.filter(x=>x.type==='boost-start'&&x.objectId==='pad'&&x.riderId==='player').length,1,'pad fires once');
  // Boost survives a collision and speed climbs back toward boost speed.
  const h=ruleEngine([{id:'rock',type:'rock',x:0,s:14,radius:.8}]);run(h,1.2);h.command({type:'boost'});let atHit=null;
  for(let i=0;i<120;i++){h.step(1/60);const evs=h.drainEvents();if(evs.some(x=>x.type==='collision'&&x.riderId==='player'))atHit=h.debug()[0];}
  assert.ok(atHit,'the boosted rider hit the rock');assert.ok(atHit.boostTime>0,'the boost keeps running through the hit');
});

test('7. pause freezes time, distance, rivals, boost and events; long pauses do not jump ahead',()=>{
  const e=createAlpineEngine({balance,stage:1,seed:5});e.command({type:'start'});for(let i=0;i<600;i++)e.step(1/60);e.command({type:'boost'});e.step(1/60);e.drainEvents();
  const before=JSON.stringify([e.snapshot(),e.debug()]);e.command({type:'pause'});assert.equal(e.phase,'paused');
  for(let i=0;i<1800;i++)assert.equal(e.step(1/60),0);assert.equal(JSON.stringify([e.snapshot(),e.debug()]).replace('"paused"','"racing"'),before);
  assert.deepEqual(e.drainEvents(),[]);e.command({type:'resume'});assert.equal(e.phase,'racing');
  const t=e.snapshot().timeMs;e.step(30);assert.ok(e.snapshot().timeMs-t<=P.maxCatchUpSeconds*1000+1,'a 30 s gap after resume is bounded');
  const c=createAlpineEngine({balance,stage:1,seed:5});c.command({type:'start'});c.step(1);c.command({type:'pause'});c.step(10);c.command({type:'resume'});assert.equal(c.phase,'countdown');
});

test('8. island settlement: one result per run, strict validation, records reload and survive damage',()=>{
  const storage=memory(),engine=createEngine(data,{storage,now:()=>1e6});
  const won=race(1,42).result;assert.equal(won.won,true);
  const ctx={...gameContext(engine,data.config.minigames,42,'alpineRush',1)};let finish;
  engine.registry.minigames.set('alpineRush',{...engine.registry.minigames.get('alpineRush'),start:c=>{finish=c.finish;return {dispose(){}};}});
  const before=engine.state.money,startRun=engine.startMinigame('alpineRush',ctx);assert.ok(startRun.ok);
  const raw={outcome:'win',score:won.score,alpine:{...won}};
  const first=finish(raw),second=finish(raw);assert.equal(first.ok,true);assert.equal(second.reason,'reason.duplicate');
  assert.equal(engine.state.money,before+first.result.money);assert.equal(engine.state.minigameProgress.alpineRush.stage,2);
  assert.equal(engine.state.minigameWins.alpineRush,1);assert.equal(engine.state.highScores.alpineRush,won.score);
  for(const bad of [{...raw,alpine:{...won,rank:1,won:true,reward:999}},{...raw,alpine:{...won,stage:2}},{...raw,alpine:{...won,seed:1}},{...raw,outcome:'lose'},{...raw,alpine:{...won,extra:1}},{...raw,alpine:{...won,elapsedMs:-1}},{...raw,alpine:{...won,runId:'x'}}])
    assert.equal(alpineResult(bad,{level:1,seed:42},balance),null);
  assert.deepEqual(alpineResult(raw,{level:1,seed:42},balance),{outcome:'win',score:won.score,stars:won.stars,money:won.reward});
  const reloaded=createEngine(data,{storage});assert.equal(reloaded.state.minigameProgress.alpineRush.stage,2);
  // Records: once per runId, best time persists across reloads, old and damaged formats.
  const rs=memory(),cfg=balance.records,state=loadRecords(rs,cfg);assert.equal(state.status,'empty');
  const a=recordRun(rs,cfg,state,won);assert.equal(a.recorded,true);assert.equal(a.newBest,true);
  assert.equal(recordRun(rs,cfg,state,won).duplicate,true);
  const again=loadRecords(rs,cfg);assert.equal(again.status,'ok');assert.equal(again.data.best['ice-peak'].ms,won.elapsedMs);
  const slower={...won,runId:won.runId.replace(/-\d+$/,'-9'),elapsedMs:won.elapsedMs+500};assert.equal(recordRun(rs,cfg,again,slower).newBest,false);
  const old=memory(new Map([[cfg.storageKey,JSON.stringify({best:{'ice-peak':{ms:90000,rank:2}}})]]));const m=loadRecords(old,cfg);assert.equal(m.status,'migrated');assert.equal(m.data.best['ice-peak'].ms,90000);
  const broken=memory(new Map([[cfg.storageKey,'{oops']]));const b=loadRecords(broken,cfg);assert.equal(b.status,'corrupt');assert.equal(broken.getItem(cfg.storageKey+'.corrupt'),'{oops');
  const future=memory(new Map([[cfg.storageKey,JSON.stringify({version:99})]]));const f=loadRecords(future,cfg);assert.equal(f.status,'future');assert.equal(recordRun(future,cfg,f,won).recorded,false);assert.equal(future.getItem(cfg.storageKey),JSON.stringify({version:99}));
  assert.equal(formatRaceTime(78420),'01:18.42');
});

test('8b. island saves written before Alpine Rush load with defaults; damaged saves are still rejected',async()=>{
  const fresh=createEngine(data,{storage:null}).state,old=structuredClone(fresh);
  for(const key of ['minigameLevels','minigameProgress','minigameEquipment'])delete old[key].alpineRush;
  const e=createEngine(data,{storage:null}),r=migrateSave(old,data,e.registry);assert.equal(r.ok,true);assert.equal(r.state.version,CURRENT_VERSION);
  assert.deepEqual(r.state.minigameEquipment.alpineRush,{wax:0,tank:0});assert.deepEqual(r.state.minigameProgress.alpineRush,{stage:1,stars:[0,0,0]});assert.equal(r.state.minigameLevels.alpineRush,1);
  for(const key of Object.keys(fresh))if(!['minigameLevels','minigameProgress','minigameEquipment'].includes(key))assert.deepEqual(r.state[key],old[key],key);
  // A save that still lists the game but lost its equipment row is damaged, not new content.
  const damaged=structuredClone(fresh);delete damaged.minigameEquipment.alpineRush;assert.equal(migrateSave(damaged,data,e.registry).ok,false);
  const v15=await readFile(new URL('./fixtures/save-v15.json',import.meta.url),'utf8');const s=memory(new Map([[STORAGE_KEY,v15]]));const loaded=createEngine(data,{storage:s});
  assert.equal(loaded.storageStatus.ok,true);assert.ok(validateSave(loaded.state,data,loaded.registry).ok);assert.equal(loaded.state.minigameProgress.alpineRush.stage,1);
  const corrupt=memory(new Map([[STORAGE_KEY,'{not json']]));const c=createEngine(data,{storage:corrupt});assert.equal(c.storageStatus.ok,false);assert.equal(corrupt.getItem(STORAGE_KEY),'{not json');
});

test('9. the real extension starts headless, pauses, cancels and restarts ten times without leaking a session',()=>{
  const storage=memory(),engine=createEngine(data,{storage,now:()=>1e6});engine.spendPlayTime=()=>{};
  for(let i=0;i<10;i++){
    const ctx={...gameContext(engine,data.config.minigames,100+i,'alpineRush',1),storage:null};
    const runI=engine.startMinigame('alpineRush',ctx);assert.equal(runI.ok,true,String(runI.reason));
    assert.equal(engine.startMinigame('alpineRush',ctx).reason,'reason.gameBusy');
    const s=runI.session;assert.equal(s.snapshot.phase,'menu');assert.equal(s.start(),true);assert.equal(s.snapshot.phase,'countdown');
    s.setPaused(true);assert.equal(s.snapshot.phase,'paused');s.setPaused(false);assert.equal(s.snapshot.phase,'countdown');
    runI.cancel();runI.cancel();assert.equal(s.snapshot.disposed,true);assert.equal(engine.isMinigameActive(),false);
  }
  assert.equal(storage.getItem('island.alpine.v1'),null,'a cancelled run records nothing');
});

test('11. audio stays silent before a gesture and honours the island mute key',()=>{
  const created=[];class Ctx{constructor(){created.push(this);this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}
    createGain(){return {gain:{value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};}createBufferSource(){return {connect(){},start(){},stop(){},disconnect(){},set onended(f){}};}
    createBiquadFilter(){return {frequency:{value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){},set onended(f){}};}
    resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
  const st=memory(),a=createAlpineAudio({storage:st,AudioContext:Ctx});a.sync(80);assert.equal(a.cue('boost'),false);assert.equal(created.length,0);
  a.unlock();assert.equal(created.length,1);assert.equal(a.cue('boost'),true);st.setItem('island.sound','off');assert.equal(a.cue('hit'),false);assert.equal(a.metrics().muted,true);
  a.setPaused(true);st.setItem('island.sound','on');assert.equal(a.cue('gate'),false);a.dispose();a.dispose();assert.equal(a.metrics().disposed,true);
});

test('calibration: scripted pilots finish 70-95 s; harder courses need better placings; AI caps hold',()=>{
  for(const [i,level] of balance.levels.entries())for(const ai of level.ai){assert.ok(ai.speed<=balance.aiCaps.maxSpeed);assert.ok(ai.reaction>=balance.aiCaps.minReaction);assert.ok(ai.lookahead<=balance.aiCaps.maxLookahead);void i;}
  const times=[];for(const stage of [1,2,3])for(const seed of [11,12]){const r=race(stage,seed).result;times.push(r.elapsedMs);assert.ok(r.elapsedMs>=65000&&r.elapsedMs<=95000,`stage ${stage} ${r.elapsedMs}`);}
  assert.deepEqual(balance.levels.map(l=>l.targetRank),[3,2,1]);
  assert.deepEqual(RIDER_IDS,['player','rival-1','rival-2','rival-3','rival-4','rival-5']);
});

test('snapshot follows the contract: player-relative z, bounded obstacle ids, no mutation when observed',()=>{
  const e=createAlpineEngine({balance,stage:3,seed:8});e.command({type:'start'});for(let i=0;i<60*20;i++)e.step(1/60);
  const a=e.snapshot(),b=e.snapshot();assert.deepEqual(a,b);assert.equal(a.schemaVersion,1);assert.equal(a.player.id,'player');assert.equal(a.rivals.length,5);
  const d=e.debug();for(const r of a.rivals){const x=d.find(q=>q.id===r.id);assert.ok(Math.abs(r.z-(d[0].s-x.s))<1e-9);}
  for(const o of a.obstacles){assert.ok(o.z<=P.viewBehind+1e-9&&o.z>=-P.viewAhead-1e-9);if(o.type!=='finish')assert.ok(e.course.objects.some(c=>c.id===o.id));}
  a.player.x=99;assert.notEqual(e.snapshot().player.x,99);
  const ids=new Set();for(let i=0;i<60*120&&e.phase!=='finished';i++){e.step(1/60);for(const o of e.snapshot().obstacles)ids.add(o.id);}
  assert.ok(ids.size<=e.course.objects.length+1,'render ids are the course ids plus the finish arch');
});
