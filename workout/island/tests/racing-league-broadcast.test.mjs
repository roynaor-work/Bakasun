// racing-deep-m4: the broadcast layer's pure parts on fake and real race models (no DOM). Start lights from the countdown, time based gaps,
// the full-field tower with the player always in it, the fixed grid of twelve, cards, the final classification and the settled upgrade offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';
import {startLights,createGapTracker,createRankWatch,towerRows,classification,raceIntro,createCards,broadcastEvents,fastestLap,gapText,fmtTime,broadcastEnabled,LIGHTS,COUNTDOWN,GO_SHOW,START_QUIET} from '../minigames/racing-broadcast.mjs';
import {rowsThatFit,MAX_ROWS,MIN_ROWS} from '../minigames/racing-tower.mjs';
import {GRID_DRIVERS,gridDriver,DRIVERS,createLeague,standings} from '../minigames/racing-league-core.mjs';
import {pickOffer,createOfferMemory,settle,dismiss} from '../ui/upgrade-offer-core.mjs';

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const drive=(race,steps)=>{const p=race.state.player,tr=race.track;for(let n=0;n<steps&&race.state.phase!=='finished';n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:clamp(e*1.7,-1,1),autoAccelerate:true});}};
const car=(id,progress,over={})=>({id,progress,rank:1,finished:false,finishTime:null,lapTimes:[],name:id,isPlayer:id==='player',scoring:true,speed:30,...over});

test('flag: on by default, ?racingBroadcast=0 turns the broadcast off',()=>{
  assert.equal(broadcastEnabled(''),true);assert.equal(broadcastEnabled('?racingBroadcast=1'),true);assert.equal(broadcastEnabled('?racingBroadcast=0'),false);
});
test('start lights: one red lamp every half second of the countdown, all five held for the last half second, all out when the race starts',()=>{
  const at=(countdown,phase='countdown',time=0)=>startLights({phase,countdown,time});
  assert.deepEqual(at(3),{lit:0,out:false,go:false,show:true});
  assert.equal(at(2.49).lit,1);assert.equal(at(2.0).lit,2);assert.equal(at(1.4).lit,3);assert.equal(at(1.0).lit,4);assert.equal(at(0.5).lit,5);assert.equal(at(0.2).lit,5,'five lamps are held');
  assert.equal(at(0.2).out,false);
  const go=at(0,'racing',.3);assert.equal(go.out,true);assert.equal(go.go,true);assert.equal(go.lit,0);
  assert.equal(at(0,'racing',GO_SHOW+.1).show,false,'the gantry leaves after the start');
  assert.equal(at(1.2,'paused').show,true,'a pause during the countdown keeps the lamps');
  assert.equal(at(0,'finished').show,false);
});
test('start lights follow the real model: lamps only go up during the countdown and the model starts racing at the same tick',()=>{
  const race=createRacing({stage:1,seed:3});let lit=0,seen=[];
  for(let n=0;n<60*4&&race.state.phase==='countdown';n++){race.step(1/60,{});if(race.state.phase!=='countdown')break;const l=startLights(race.state);assert.ok(l.lit>=lit,'lamps never go out early');lit=l.lit;if(!seen.includes(l.lit))seen.push(l.lit);}
  assert.deepEqual(seen,[0,1,2,3,4,5],'every count appears, in order');assert.equal(lit,LIGHTS);
  assert.equal(race.state.phase,'racing');assert.equal(startLights(race.state).out,true);assert.equal(race.state.countdown,0);assert.equal(COUNTDOWN,3);
});
test('time gaps: the gap is how long ago the car ahead passed my point, not distance over my speed',()=>{
  const tr=createGapTracker();const a=car('ai-1',0),b=car('player',-20,{speed:5});const state={time:0,cars:[a,b]};
  // both run at 10 m/s for 5 s: b is 2 s behind whatever its momentary speed reads
  for(let t=0;t<=5;t+=.25){state.time=t;a.progress=t*10;b.progress=-20+t*10;tr.record(state);}
  assert.ok(Math.abs(tr.gap(a,b,5)-2)<.01,'2.0 s: '+tr.gap(a,b,5));
  b.speed=40;assert.ok(Math.abs(tr.gap(a,b,5)-2)<.01,'a speed reading does not change the time gap');
  // b stops at the same point for 1 s: the gap grows by that second
  state.time=6;a.progress=60;tr.record(state);assert.ok(Math.abs(tr.gap(a,b,6)-3)<.01,'3.0 s: '+tr.gap(a,b,6));
  // interpolation between samples: b exactly between two of a's samples
  b.progress=11.25;assert.ok(Math.abs(tr.gap(a,b,6)-(6-1.125))<.01,'interpolated: '+tr.gap(a,b,6));
  assert.equal(tr.gap(a,a,6),0);assert.equal(tr.gap(b,a,6),0,'a car in front is not behind');
  // two finished cars: their finish times
  a.finished=true;a.finishTime=100;b.finished=true;b.finishTime=103.4;assert.ok(Math.abs(tr.gap(a,b,200)-3.4)<1e-9);
});
test('time gaps: outside the sampling window the gap is unknown and a lapped car reads "+הקפה"',()=>{
  const tr=createGapTracker({window:2});const a=car('ai-1',0),b=car('player',-100);const state={time:0,cars:[a,b]};
  for(let t=0;t<=10;t+=.25){state.time=t;a.progress=t*10;b.progress=-100+t*10;tr.record(state);}
  assert.equal(tr.gap(a,b,10),null);
  assert.equal(gapText(null,{ahead:a,car:b,trackLength:90}),'+הקפה');assert.equal(gapText(null,{ahead:a,car:b,trackLength:500}),'');
  assert.equal(gapText(0),'');assert.equal(gapText(1.26),'+1.3');assert.equal(gapText(65.2),'+1:05');assert.equal(fmtTime(83.456),'1:23.46');assert.equal(fmtTime(-1),'--');
});
test('the tower lists the whole field in rank order with number and team colour, and the player is always on it',()=>{
  const race=createRacing({stage:1,seed:5,config:{countdown:0,extraRivals:5}}),s=race.state;assert.equal(s.cars.length,10);
  drive(race,60*20);
  const all=towerRows(s,{limit:10});assert.equal(all.length,10);assert.deepEqual(all.map(r=>r.rank),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(all[0].gapText,'מוביל');assert.equal(new Set(all.map(r=>r.number)).size,10,'ten different car numbers');assert.ok(all.every(r=>/^#[0-9a-f]{6}$/i.test(r.color)));
  for(const r of all){const idx=s.cars.findIndex(c=>c.id===r.id);assert.equal(r.number,GRID_DRIVERS[idx].number);assert.equal(r.color,GRID_DRIVERS[idx].color);assert.equal(r.scoring,s.cars[idx].scoring!==false);}
  // squeeze the player to last and show seven rows: six leaders plus the player
  s.player.rank=10;s.cars.forEach(c=>{if(!c.isPlayer&&c.rank===10)c.rank=s.player.rank===10?1:c.rank;});
  const seven=towerRows(s,{limit:7});assert.equal(seven.length,7);assert.equal(seven.at(-1).isPlayer,true);assert.equal(seven.at(-1).rank,10);assert.equal(seven.filter(r=>r.isPlayer).length,1);
  assert.equal(towerRows(s,{limit:5}).some(r=>r.isPlayer),true);
});
test('the tower gap uses the tracker and marks a position change for 2.5 s and the fastest lap in purple',()=>{
  const a=car('ai-1',100,{rank:1,lapTimes:[40]}),b=car('player',80,{rank:2,lapTimes:[38.5]}),state={time:0,cars:[a,b],player:b};
  const tracker=createGapTracker(),watch=createRankWatch();
  for(let t=0;t<=4;t+=.25){state.time=t;a.progress=100+t*10;b.progress=80+t*10;tracker.record(state);watch.update(state,t);}
  let rows=towerRows(state,{tracker,now:4,watch,fastest:fastestLap(state.cars)});
  assert.equal(rows[1].gapText,'+2.0');assert.equal(rows[1].delta,0);assert.equal(rows[1].fastest,true,'the player holds the fastest lap');assert.equal(rows[0].fastest,false);
  a.rank=2;b.rank=1;state.time=4.5;assert.deepEqual(watch.update(state,4.5).map(c=>c.id+':'+c.delta),['ai-1:-1','player:1']);
  rows=towerRows(state,{tracker,now:4.5,watch});assert.equal(rows[0].id,'player');assert.equal(rows[0].delta,1);assert.equal(rows[1].delta,-1);
  assert.equal(watch.delta('player',4.5+2.4),1);assert.equal(watch.delta('player',4.5+2.6),0,'the arrow leaves after 2.5 s');
});
test('rows that fit above the wheel: ten at 844x390, fewer on a shorter screen, never under five',()=>{
  assert.equal(rowsThatFit({height:390}),10);assert.equal(rowsThatFit({height:360}),8);assert.ok(rowsThatFit({height:320})>=MIN_ROWS&&rowsThatFit({height:320})<8);
  assert.equal(rowsThatFit({height:900}),MAX_ROWS);assert.equal(rowsThatFit({height:390,wheelTop:200}),6,'a measured wheel wins over the formula');
});
test('the grid of twelve is fixed: the four league drivers, then the extra rivals in the order and names of the race model, with unique numbers',()=>{
  assert.equal(GRID_DRIVERS.length,12);assert.equal(new Set(GRID_DRIVERS.map(d=>d.number)).size,12);assert.equal(new Set(GRID_DRIVERS.map(d=>d.color)).size,12);assert.equal(new Set(GRID_DRIVERS.map(d=>d.id)).size,12);
  assert.deepEqual(GRID_DRIVERS.slice(1,1+DRIVERS.length).map(d=>d.id),DRIVERS.map(d=>d.id));assert.deepEqual(GRID_DRIVERS.slice(1,1+DRIVERS.length).map(d=>d.name),DRIVERS.map(d=>d.name));
  // racing-deep-m6: in the long league (default) all twelve score; a regular race (opponents 4 + extra rivals) still marks only five as scoring in the model
  assert.deepEqual(GRID_DRIVERS.map(d=>d.scoring),Array(12).fill(true));
  const race=createRacing({stage:1,seed:9,config:{countdown:0,extraRivals:7}});assert.equal(race.state.cars.length,12);
  race.state.cars.forEach((c,i)=>{assert.equal(c.name,GRID_DRIVERS[i].name,'car '+i);assert.equal(c.scoring!==false,i<5,'a regular race scores five');});
  const again=createRacing({stage:7,seed:12345,config:{countdown:0,extraRivals:7}});assert.deepEqual(again.state.cars.map(c=>c.name),race.state.cars.map(c=>c.name),'the same names on another circuit and seed');
  for(const d of GRID_DRIVERS){assert.ok(!/!/.test(d.name+d.team+d.style));assert.ok(/^[֐-׿\s]+$/.test(d.name),'Hebrew name: '+d.name);}
  assert.equal(gridDriver(13,'זר').name,'זר');assert.equal(gridDriver(13).scoring,false);
  // the league table holds exactly the scoring grid (twelve in the long league)
  const L=createLeague();assert.deepEqual(Object.keys(L.table),['player',...DRIVERS.map(d=>d.id)]);assert.equal(standings(L).length,12);
});
test('cards: lap for the player with "הקפה אחרונה", a purple fastest lap for any car, a position card after the start, urgent cards replace',()=>{
  const p=car('player',0,{rank:3,lap:2,lapTimes:[52.3]}),a=car('ai-1',0,{rank:1,lapTimes:[50]});
  let state={time:60,laps:3,phase:'racing',player:p,cars:[p,a]};
  // state based (a skipped frame loses nothing): the player's lap count grew from 0 to 1
  let ev=broadcastEvents(state,{changes:[],prevFastest:null,prevLaps:0});assert.equal(ev.cards.length,1);assert.equal(ev.cards[0].kind,'lap');assert.equal(ev.cards[0].title,'הקפה \u20662 / 3\u2069','the numbers sit in an LTR isolate so 2 / 4 never reads 4 / 2');assert.equal(ev.cards[0].sub,'אחרונה 0:52.30');
  assert.equal(ev.fastest.id,'ai-1');assert.equal(ev.laps,1);
  assert.equal(broadcastEvents(state,{changes:[],prevFastest:ev.fastest,prevLaps:1}).cards.length,0,'same lap count, no card');
  p.lap=3;p.lapTimes.push(51);ev=broadcastEvents(state,{changes:[],prevFastest:ev.fastest,prevLaps:1});assert.equal(ev.cards[0].title,'הקפה אחרונה');
  p.finished=true;p.lapTimes.push(50);assert.equal(broadcastEvents(state,{changes:[],prevFastest:ev.fastest,prevLaps:2}).cards.length,0,'no lap card for the finish: the podium comes');
  p.finished=false;a.lapTimes.push(47.2);ev=broadcastEvents(state,{changes:[],prevFastest:{id:'ai-1',time:50},prevLaps:3});
  assert.equal(ev.cards.length,1);assert.equal(ev.cards[0].kind,'fastest');assert.equal(ev.cards[0].sub,'ai-1 · 0:47.20');
  assert.equal(broadcastEvents(state,{changes:[],prevFastest:null,prevLaps:3}).cards.length,0,'the very first lap of the race is not a fastest-lap card');
  const up=broadcastEvents(state,{changes:[{id:'player',from:4,to:3,delta:1}],prevFastest:ev.fastest,prevLaps:3}).cards;assert.equal(up[0].kind,'up');assert.equal(up[0].title,'מקום 3');assert.equal(up[0].urgent,true);
  assert.equal(broadcastEvents({...state,time:START_QUIET-.5},{changes:[{id:'player',from:4,to:3,delta:1}],prevFastest:ev.fastest,prevLaps:3}).cards.length,0,'the start shuffle is quiet');
  assert.equal(broadcastEvents(state,{changes:[{id:'ai-1',from:1,to:2,delta:-1}],prevFastest:ev.fastest,prevLaps:3}).cards.length,0,'only the player gets a position card');
  const q=createCards();q.push({kind:'lap',title:'a'},0);q.push({kind:'fastest',title:'b'},0);assert.equal(q.current(0).title,'a');assert.equal(q.current(1).title,'a');assert.equal(q.current(2).title,'b');
  q.push({kind:'up',title:'c',urgent:true,duration:1},2.5);assert.equal(q.current(2.5).title,'c');assert.equal(q.current(3.6),null);
  for(const c of [...up,...ev.cards])assert.ok(!/!/.test(c.title+c.sub));
});
test('intro card and final classification on a real ten-car race: every car, league marks only on the five scoring cars, gaps to the winner',()=>{
  const race=createRacing({stage:1,seed:21,config:{extraRivals:5}}),s=race.state;
  const intro=raceIntro(s,race.stage,race.track);assert.equal(intro.grid.length,10);assert.equal(intro.laps,s.laps);assert.ok(intro.track.length>0);assert.ok(['יום','שעת זהב','שקיעה','לילה'].includes(intro.timeOfDay));
  assert.equal(intro.grid.filter(r=>r.isPlayer).length,1);assert.equal(intro.playerGrid,s.player.rank);
  const tracker=createGapTracker();
  for(let n=0;n<60*400&&s.phase!=='finished';n++){const p=s.player,tr=race.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:clamp(e*1.7,-1,1),autoAccelerate:true});if(s.phase==='racing')tracker.record(s);}
  assert.equal(s.phase,'finished');
  const rows=classification(s,{tracker,league:true,trackLength:race.track.length});
  assert.equal(rows.length,10);assert.deepEqual(rows.map(r=>r.rank),[1,2,3,4,5,6,7,8,9,10]);assert.equal(rows.filter(r=>r.league).length,5);assert.ok(rows.filter(r=>r.league).every(r=>r.scoring));
  assert.match(rows[0].gapText,/^\d+:\d\d\.\d\d$/);assert.ok(rows.slice(1).every(r=>r.gapText===''||/^\+/.test(r.gapText)),rows.map(r=>r.gapText).join(' '));
  assert.ok(rows.slice(1).filter(r=>r.gapText).length>=5,'most cars have a gap to the winner');assert.equal(rows.filter(r=>r.fastest).length,1);
  const noLeague=classification(s,{tracker});assert.equal(noLeague.filter(r=>r.league).length,0);
  // racing-deep-m6: a long-league race (twelve scoring cars through stage.opponents) carries no "ליגה" marks, the mark only separates scoring cars from traffic
  const full=createRacing({stage:1,seed:3,config:{countdown:0,extraRivals:0,stage:{opponents:11}}});assert.equal(full.state.cars.length,12);assert.equal(classification(full.state,{league:true}).filter(r=>r.league).length,0);assert.equal(raceIntro(full.state,full.stage,full.track).grid.length,12);full.dispose();
});
test('upgrade offer: a settled stage never shows a second card, "later" still rests the game one stage',()=>{
  const memory=createOfferMemory(),list=[{id:'league:engine',kind:'league',gameId:'islandRacing',category:'ליגה',name:'מנוע',icon:'engine',unit:'coins',price:100,balance:400},{id:'league:tires',kind:'league',gameId:'islandRacing',category:'ליגה',name:'צמיגים',icon:'tires',unit:'coins',price:100,balance:400}];
  const key='islandRacing:league:1:0';
  assert.equal(pickOffer({gameId:'islandRacing',key,candidates:list,memory}).id,'league:engine');
  settle(memory,key);
  assert.equal(pickOffer({gameId:'islandRacing',key,candidates:list,memory}),null,'bought: the re-rendered result screen asks nothing');
  assert.equal(pickOffer({gameId:'islandRacing',key:'islandRacing:league:1:1',candidates:list,memory}).id,'league:engine','the next race offers again');
  const m2=createOfferMemory();pickOffer({gameId:'islandRacing',key,candidates:list,memory:m2});dismiss(m2,key,'league:engine','islandRacing');assert.equal(pickOffer({gameId:'islandRacing',key,candidates:list,memory:m2}).id,'league:tires');
  const old={dismissed:new Set(),seen:new Set(),count:{},quiet:{}};assert.equal(pickOffer({gameId:'islandRacing',key,candidates:list,memory:old}).id,'league:engine','a memory without the new set still works');settle(old,key);assert.equal(pickOffer({gameId:'islandRacing',key,candidates:list,memory:old}),null);
});
