import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer,opponentSettings} from '../workout/island/minigames/soccer.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {attributes,initialSoccerCard,cardEffects,cardRating} from '../workout/island/activity/soccer-card.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {migrations,migrateSave,validateSave} from '../workout/island/engine/persistence.mjs';
import {GameNavigation} from '../workout/island/ui/game-shell.mjs';
import {bot} from '../workout/island/tests/g3c-bot.mjs';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),c=data.config.minigames.soccer,dt=c.match.fixedStep;
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const card=value=>({...initialSoccerCard(null,c),attributes:Object.fromEntries(attributes.map(key=>[key,value]))});
function setup(options={}){
 const g=createSoccer({config:c,stage:3,seed:42,...options}),s=g.getState();
 for(const p of s.players){p.x=p.team?12:-12;p.z=p.id%2?7:-7;p.cooldown=0;p.think=100;p.vx=p.vz=0;}
 Object.assign(s.players[0],{x:0,z:0,fx:1,fz:0});Object.assign(s.ball,{owner:0,x:c.physics.dribbleOffset,z:0,grace:1});return g;
}
function shot({x=0,z=0,fx=1,fz=0,moveX=0,moveZ=0,...options}={}){
 const g=setup(options),s=g.getState();Object.assign(s.players[0],{x,z,fx,fz});Object.assign(s.ball,{x:x+fx*c.physics.dribbleOffset,z:z+fz*c.physics.dribbleOffset});
 g.update(dt,{kickHeld:true,moveX,moveZ});g.update(dt,{moveX,moveZ});return g;
}
function advance(g,seconds,input={}){for(let i=0;i<Math.round(seconds/dt);i++)g.update(dt,input);}
function fixture(){let time=1_000_000;const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},engine=createEngine(data,{storage,now:()=>time});return {engine,storage,values,setTime:n=>time=n,advance:n=>time+=n};}
function pitch(e){assert.ok(e.place('soccer',4,8).ok);}
const payload=(difficulty='easy',extra={})=>({won:true,goalsFor:3,goalsAgainst:0,stage:1,stars:3,seed:42,difficulty,durationSeconds:150,...extra});
const envelope=r=>({outcome:r.won?'win':'lose',score:r.goalsFor,soccer:r});
function round(e){let ctx;e.registry.minigames.set('soccer',{...e.registry.minigames.get('soccer'),start:c=>(ctx=c,{dispose(){}})});const response=e.startMinigame('soccer',{seed:42,level:1});assert.ok(response.ok);return {ctx,response};}

test('G3c released joystick direction overrides charge direction; short touch shoots weakly',()=>{
 const g=setup();g.update(dt,{kickHeld:true,moveX:1});g.update(dt,{moveZ:1});const s=g.getState();assert.equal(s.event.type,'shot');assert.equal(s.event.assisted,false);near(s.ball.vx,0);assert.ok(s.ball.vz>0);assert.ok(s.event.power<.1);
 const charged=setup();advance(charged,.8,{kickHeld:true});charged.update(dt,{});assert.ok(Math.hypot(charged.getState().ball.vx,charged.getState().ball.vz)>Math.hypot(s.ball.vx,s.ball.vz));
});
test('G3c without joystick shots follow facing; outside cone direction is exact without curl',()=>{
 for(const x of [0,7]){const s=shot({x,fx:0,fz:1}).getState();near(s.ball.vx,0);assert.ok(s.ball.vz>0);assert.equal(s.ball.curve,0);assert.equal(s.event.assisted,false);}
});
test('G3c assist works only in opposing half and within the goal cone, targeting inside posts',()=>{
 const s=shot({x:7,moveX:1,random:()=>.99}).getState();assert.equal(s.event.assisted,true);const target=s.ball.z+(c.pitch.length/2-s.ball.x)*s.ball.vz/s.ball.vx;assert.ok(Math.abs(target)<c.pitch.goalWidth/2);
 assert.equal(shot({x:-2,moveX:1}).getState().event.assisted,false);
 assert.equal(shot({x:7,moveZ:1}).getState().event.assisted,false);
});
test('G3c pass compatibility uses the G3d endpoint and waits for reception to transfer control',()=>{
 const g=setup(),s=g.getState();Object.assign(s.players[1],{x:6,z:.4});Object.assign(s.players[2],{x:3,z:1});g.update(dt,{passPressed:true,moveX:1});assert.equal(s.event.type,'pass');assert.equal(s.event.target,2);assert.equal(s.controlled,0);assert.equal(s.ball.owner,null);
});
test('G3c short pass compatibility targets the nearest teammate to its endpoint',()=>{
 const g=setup(),s=g.getState();Object.assign(s.players[1],{x:10,z:1});Object.assign(s.players[2],{x:2,z:.3});g.update(dt,{passPressed:true,moveX:1});assert.equal(s.event.target,2);assert.equal(s.controlled,0);
});
test('G3c pass to open space preserves its direction and keeps control until reception',()=>{
 const g=setup(),s=g.getState();g.update(dt,{passPressed:true,moveZ:1});assert.equal(s.event.type,'pass');assert.equal(s.event.target,1);assert.equal(s.controlled,0);near(s.event.x,-12);near(s.event.z,7);assert.ok(s.ball.vx<0&&s.ball.vz>0);
});
test('G3c fixed-tick input retains short pass/switch/kick edges at 120Hz',()=>{
 const g=setup(),s=g.getState();g.update(dt/2,{kickHeld:true,moveZ:1});g.update(dt/2,{moveZ:1});assert.equal(s.charging,false);
 // A complete touch between simulation ticks is retained as a weak kick.
 assert.equal(s.event?.type,'shot');
});
test('G3c sprint increases only controlled speed by the configured multiplier',()=>{
 const normal=setup(),fast=setup();for(const g of [normal,fast])Object.assign(g.getState().ball,{owner:null,y:1000});advance(normal,.4,{moveX:1});advance(fast,.4,{moveX:1,sprintHeld:true});near(fast.getState().players[0].vx/normal.getState().players[0].vx,c.sprint.multiplier);near(fast.getState().sprint.value,100-.4*30);
 for(let i=1;i<6;i++)near(fast.getState().players[i].vx,normal.getState().players[i].vx);
});
test('G3c exhaustion stops sprint until minToStart; regeneration waits for delay',()=>{
 const g=setup(),s=g.getState();Object.assign(s.ball,{owner:null,y:1000});advance(g,3.5,{moveZ:1,sprintHeld:true});assert.equal(s.sprint.locked,true);assert.equal(s.sprint.active,false);
 const empty=s.sprint.value;advance(g,.3,{});near(s.sprint.value,empty);advance(g,.8,{});assert.ok(s.sprint.value>empty&&s.sprint.value<c.sprint.minToStart);g.update(dt,{moveX:1,sprintHeld:true});assert.equal(s.sprint.active,false);
 advance(g,1.4,{});assert.ok(s.sprint.value>=c.sprint.minToStart);g.update(dt,{moveX:1,sprintHeld:true});assert.equal(s.sprint.active,true);
});
test('G3c defense is opposing possession; loose ball and home possession are attack',()=>{
 const g=setup(),s=g.getState();for(const owner of [3,null,1]){Object.assign(s.ball,{owner,y:2,grace:2});g.update(dt,{});assert.equal(s.mode,owner===3?'defense':'attack');}
});
function defend(random=()=>0,extra={}){const g=setup({random,...extra}),s=g.getState();Object.assign(s.players[3],{x:.5,z:0});Object.assign(s.ball,{owner:3,x:.7,z:0,y:.22,grace:0});return g;}
test('G3c steal success, failure, reach and cooldown are explicit',()=>{
 const g=defend(),s=g.getState();g.update(dt,{passPressed:true});assert.equal(s.ball.owner,0);near(s.players[0].stealCooldown,c.steal.cooldownSeconds);g.update(dt,{});s.ball.owner=3;g.update(dt,{passPressed:true});assert.equal(s.ball.owner,3);
 const miss=defend(()=>.99);miss.update(dt,{passPressed:true});assert.equal(miss.getState().event.won,false);assert.equal(miss.getState().ball.owner,3);
 const far=defend();far.getState().ball.x=5;far.update(dt,{passPressed:true});assert.equal(far.getState().ball.owner,3);
});
test('G3c slide lunges, succeeds on contact and misses recover on grass before moving',()=>{
 const hit=defend(),s=hit.getState();hit.update(dt,{kickHeld:true,moveX:1});assert.ok(s.players[0].slideTime>0);assert.equal(s.ball.owner,0);near(s.players[0].slideCooldown,c.slide.cooldownSeconds);
 const miss=defend(()=>.99),m=miss.getState();advance(miss,.36,{kickHeld:true,moveX:1});assert.ok(m.players[0].recover>0);const x=m.players[0].x;advance(miss,.2,{moveX:1});near(m.players[0].x,x);assert.ok(m.players[0].slideCooldown>0);
});
test('G3c seeded defensive sequences are reproducible without unseeded randomness',()=>{
 function sequence(seed){const g=defend(undefined,{seed});for(let i=0;i<100;i++)g.update(dt,{passPressed:i%4===0,kickHeld:i%7<2,moveX:1});return g.snapshot();}
 assert.deepEqual(sequence(271),sequence(271));assert.notDeepEqual(sequence(271),sequence(272));
});
test('G3f individual defense card remains with its player after control transfers',()=>{
 const g=defend(()=>.7,{card:card(99)}),s=g.getState();s.controlled=1;Object.assign(s.players[0],{slideTime:.2,slideX:1,slideZ:0,slideAttempted:false});g.update(dt,{});assert.equal(s.event.type,'slide-contact');assert.equal(s.event.won,true);assert.equal(s.ball.owner,0);
});
test('G3c clearInput cancels charge without firing and a paused model freezes every timer',()=>{
 const g=setup();advance(g,.4,{kickHeld:true,sprintHeld:true,moveX:1});g.clearInput();const before=g.snapshot();g.update(0,{kickHeld:true});assert.deepEqual(g.snapshot(),before);g.update(dt,{});assert.notEqual(g.getState().event?.type,'shot');assert.equal(g.getState().charging,false);assert.equal(g.getState().sprint.active,false);
});
test('G3c normal difficulty preserves every stage parameter exactly; other levels scale all six',()=>{
 for(let stage=1;stage<=10;stage++){assert.deepEqual(opponentSettings(c,stage,'normal'),c.stages[stage-1]);for(const difficulty of ['easy','hard']){const settings=opponentSettings(c,stage,difficulty),scale=c.difficulties[difficulty];for(const key of ['speed','stealRate','accuracy','keeper','tackleReach'])near(settings[key],c.stages[stage-1][key]*scale[key]);near(settings.thinkSeconds,c.stages[stage-1].thinkSeconds/scale.thinkSeconds);}}
});
for(const stage of [1,5,10])test(`G3c fixed bot difficulty calibration stage ${stage}, 20 identical seeds`,t=>{
 const wins=[];for(const difficulty of ['easy','normal','hard']){let won=0,firstTen=0;for(let seed=1;seed<=20;seed++){
  const g=createSoccer({config:c,seed,stage,difficulty});for(let tick=0;tick<24000&&!g.result;tick++)g.update(dt,bot(g,c));assert.ok(g.result);won+=Number(g.result.won);if(seed<=10)firstTen+=Number(g.result.won);
 }if(stage===1&&difficulty==='easy')assert.ok(firstTen>=7,`${firstTen}/10`);wins.push(won);}
 assert.ok(wins[0]>=wins[1]&&wins[1]>=wins[2],JSON.stringify(wins));
 t.diagnostic('G3f profile calibration '+JSON.stringify({stage,seeds:20,wins}));
});
test('G3c all effects are zero at 50, linear, and exactly maximum at 99',()=>{
 assert.deepEqual(cardEffects(card(50),c),{power:1,pace:1,spread:1,assistDegrees:0,capacity:1,regen:1,defense:0});
 const high=cardEffects(card(99),c);assert.deepEqual(high,{power:1.2,pace:1.12,spread:.5,assistDegrees:10,capacity:1.6,regen:1.4,defense:.25});
 const middle=cardEffects(card(74),c);near(middle.power,1+.2*24/49);near(middle.defense,.25*24/49);
 for(const [value,tier]of [[50,'bronze'],[59,'bronze'],[60,'silver'],[74,'silver'],[75,'gold'],[99,'gold']])assert.deepEqual(cardRating(card(value),c),{overall:value,tier});
});
test('G3f individual shot strength, controlled pace and enemy speed floor follow saved attributes',()=>{
 const pace=p=>cardEffects({attributes:{pace:p.card.pace}},c).pace;
 const shotFactor=p=>cardEffects({attributes:{power:p.card.shot}},c).power*(1+(p.card.shot-c.card.initial)/c.card.max*c.roster.attributeShotWeight);
 const low=shot({card:card(50)}).getState(),high=shot({card:card(99)}).getState();assert.ok(high.players[0].card.shot>low.players[0].card.shot);near(Math.hypot(high.ball.vx,high.ball.vz)/Math.hypot(low.ball.vx,low.ball.vz),shotFactor(high.players[0])/shotFactor(low.players[0]));
 for(const controlled of [0,1]){
  const a=setup({card:card(50)}),b=setup({card:card(99)});for(const g of [a,b]){g.getState().controlled=controlled;Object.assign(g.getState().ball,{owner:null,y:1000});}a.update(dt,{moveX:1});b.update(dt,{moveX:1});
  const aa=a.getState().players,bb=b.getState().players;
  near(bb[controlled].vx/aa[controlled].vx,pace(bb[controlled])/pace(aa[controlled]));
  for(let i=0;i<aa.length;i++)if(i!==controlled){
   let ratio=pace(bb[i])/pace(aa[i]);
   if(aa[i].team){const base=opponentSettings(c,3,'normal').speed,reference=players=>Math.max(...players.filter(p=>!p.team).map(p=>(c.players.speed+(p.speed-1)*c.players.speedPerRank)*pace(p)))*c.opponents.minSpeedRatio;ratio=Math.max(base*pace(bb[i]),reference(bb))/Math.max(base*pace(aa[i]),reference(aa));}
   near(bb[i].vx,aa[i].vx*ratio);near(bb[i].vz,aa[i].vz*ratio);
  }
 }
});
test('G3c accuracy halves assisted spread and extends the assist cone by ten degrees',()=>{
 const low=shot({x:7,card:card(50),random:()=>.9}).getState(),high=shot({x:7,card:card(99),random:()=>.9}).getState();near((high.ball.vz/high.ball.vx)/(low.ball.vz/low.ball.vx),.5,.01);
 const angle=30*Math.PI/180;assert.equal(shot({x:7,moveX:Math.cos(angle),moveZ:Math.sin(angle),card:card(50)}).getState().event.assisted,false);assert.equal(shot({x:7,moveX:Math.cos(angle),moveZ:Math.sin(angle),card:card(99)}).getState().event.assisted,true);
});
test('G3c stamina enlarges capacity and regen; defense adds the configured chance',()=>{
 const a=setup({card:card(50)}),b=setup({card:card(99)});near(b.getState().sprint.capacity/a.getState().sprint.capacity,1.6);for(const g of [a,b])g.getState().sprint.value=10;advance(a,.5);advance(b,.5);near((b.getState().sprint.value-10)/(a.getState().sprint.value-10),1.4);
 const low=defend(()=>.5,{card:card(50)}),high=defend(()=>.5,{card:card(99)});low.update(dt,{passPressed:true});high.update(dt,{passPressed:true});assert.equal(low.getState().ball.owner,3);assert.equal(high.getState().ball.owner,0);
});
for(const difficulty of ['easy','normal','hard'])test(`G3c ${difficulty} repeated wins credit training wallet independently of map stars`,()=>{
 const {engine:e}=fixture();pitch(e);e.setSoccerDifficulty(difficulty);const money=e.state.money,expected=Math.floor((c.levels[0].winMoney+1)*c.difficulties[difficulty].coinMultiplier);
 for(let i=1;i<=2;i++){const {ctx}=round(e),r=ctx.finish(envelope(payload(difficulty)));assert.ok(r.ok);assert.equal(r.result.money,expected);assert.equal(r.result.trainingStars,3+c.difficulties[difficulty].bonusStars);assert.equal(e.state.soccerCard.stars,i*(3+c.difficulties[difficulty].bonusStars));assert.equal(e.state.minigameProgress.soccer.stars[0],3);assert.equal(ctx.finish(envelope(payload(difficulty))).ok,false);}
 assert.equal(e.state.money,money+2*expected);
});
for(const score of [[0,1],[1,1]])test(`G3c ${score.join(':')} awards no training currency`,()=>{
 const {engine:e}=fixture();pitch(e);e.setSoccerDifficulty('hard');const {ctx}=round(e);assert.ok(ctx.finish(envelope(payload('hard',{won:false,goalsFor:score[0],goalsAgainst:score[1],stars:1}))).ok);assert.equal(e.state.soccerCard.stars,0);
});
test('G3c result requires precisely eight fields, a valid difficulty and the captured start selection',()=>{
 const raw=payload('easy'),ctx={level:1,seed:42,difficulty:'easy'};assert.ok(soccerResult(envelope(raw),ctx,c));for(const key of Object.keys(raw)){const missing={...raw};delete missing[key];assert.equal(soccerResult(envelope(missing),ctx,c),null,key);}
 for(const difficulty of ['normal','hard','impossible',undefined,1,'__proto__'])assert.equal(soccerResult(envelope({...raw,difficulty}),ctx,c),null);
 assert.equal(soccerResult(envelope({...raw,extra:1}),ctx,c),null);
 const {engine:e}=fixture();pitch(e);const {ctx:start,response}=round(e);assert.equal(e.setSoccerDifficulty('hard').reason,'reason.gameBusy');e.state.soccerCard.difficulty='hard';assert.equal(start.finish(envelope(payload('hard'))).ok,false);assert.ok(start.finish(envelope(payload('easy'))).ok);assert.equal(response.cancel().ok,false);
});
test('G3c training prices, gain, cap, currency and the global cooldown use engine time',()=>{
 const f=fixture(),e=f.engine;e.state.soccerCard.stars=100;
 assert.equal(e.soccerTrainingOffer('power').cost,2);assert.ok(e.trainSoccer('power').ok);assert.equal(e.state.soccerCard.attributes.power,53);assert.equal(e.state.soccerCard.stars,98);assert.equal(e.trainSoccer('pace').reason,'soccer.training.wait');
 f.advance(3600_000);e.state.soccerCard.attributes.power=98;assert.equal(e.soccerTrainingOffer('power').cost,6);assert.ok(e.trainSoccer('power').ok);assert.equal(e.state.soccerCard.attributes.power,99);f.advance(3600_000);assert.equal(e.trainSoccer('power').reason,'soccer.training.max');
 e.state.soccerCard.attributes.pace=60;assert.equal(e.soccerTrainingOffer('pace').cost,3);e.state.soccerCard.stars=0;assert.equal(e.trainSoccer('pace').reason,'soccer.training.stars');assert.equal(e.trainSoccer('unknown').ok,false);
});
test('G3c a backward clock restarts the full cooldown and survives save/reload',()=>{
 const f=fixture(),e=f.engine;e.state.soccerCard.stars=10;e.trainSoccer('power');f.setTime(500000);const offer=e.soccerTrainingOffer('pace');assert.equal(offer.remaining,3600_000);assert.equal(e.state.soccerCard.lastTrainingAt,500000);
 const loaded=createEngine(data,{storage:f.storage,now:()=>500000});assert.equal(loaded.soccerTrainingOffer('pace').remaining,3600_000);f.advance(3600_000);assert.ok(e.trainSoccer('pace').ok);
});
test('G3c no training or difficulty changes during any active game; no spending on rejection',()=>{
 const {engine:e}=fixture();pitch(e);e.state.soccerCard.stars=10;const {response}=round(e),before=structuredClone(e.state.soccerCard);assert.equal(e.trainSoccer('power').reason,'reason.gameBusy');assert.equal(e.setSoccerDifficulty('hard').reason,'reason.gameBusy');assert.deepEqual(e.state.soccerCard,before);response.cancel();assert.ok(e.trainSoccer('power').ok);
});
for(const version of [8,9])test(`G3c authentic v${version} fixture migrates through explicit steps without losing existing state`,async()=>{
 const f=fixture(),path=version===8?new URL('./fixtures/save-v8.json',import.meta.url):new URL('tests/fixtures/save-v9.json',root),old=JSON.parse(await readFile(path,'utf8')),before=structuredClone(old),r=migrateSave(old,data,f.engine.registry);assert.equal(old.version,version);assert.ok(r.ok);assert.equal(r.state.version,14);assert.deepEqual(old,before);
 assert.equal(r.state.soccerCard.stars,old.minigameProgress.soccer.stars.reduce((a,b)=>a+b,0));for(const n of Object.values(r.state.soccerCard.attributes))assert.equal(n,50);assert.equal(r.state.soccerCard.difficulty,'easy');
 for(const key of Object.keys(old).filter(key=>!['version','buildings'].includes(key)))assert.deepEqual(r.state[key],key==='players'?[...old.players,...data.players.filter(p=>!old.players.some(old=>old.id===p.id))]:key==='team'?{...old.team,sportWins:{soccer:old.team.wins,tennis:0}}:key==='minigameEquipment'?{...old[key],tennis:{speed:0,hit:0,serve:0}}:key==='minigameProgress'?{...old[key],tennis:{stage:1,stars:Array(10).fill(0)}}:key==='minigameLevels'?{...old[key],tennis:1}:old[key],key);assert.deepEqual(r.state.buildings.filter(b=>b.typeId!=='cityHall'),old.buildings.filter(b=>b.typeId!=='cityHall'));
 if(version===9)assert.deepEqual(migrations[13](migrations[12](migrations[11](migrations[10](migrations[9](old,data),data),data),data),data),r.state);
 f.storage.setItem('island.v1',JSON.stringify(old));const loaded=createEngine(data,{storage:f.storage});assert.ok(loaded.storageStatus.ok);assert.deepEqual(loaded.state.soccerCard,r.state.soccerCard);assert.ok(loaded.importJSON(old).ok);
});
test('G3c malformed legacy card sources reject cleanly rather than throwing in migration',async()=>{
 const {engine:e}=fixture(),legacy=JSON.parse(await readFile(new URL('tests/fixtures/save-v9.json',root),'utf8'));
 for(const stars of [null,'bad',{},[3,'bad']]){const bad=structuredClone(legacy);bad.minigameProgress.soccer.stars=stars;assert.equal(migrateSave(bad,data,e.registry).ok,false);}
 for(const difficulty of ['impossible','__proto__',['easy'],null]){assert.equal(e.setSoccerDifficulty(difficulty).ok,false);assert.throws(()=>createSoccer({config:c,difficulty}));}
});
test('G3c importing merges max in every numeric card field and takes incoming difficulty',()=>{
 const {engine:e}=fixture(),incoming=structuredClone(e.state);Object.assign(e.state.soccerCard,{stars:12,trainings:4,lastTrainingAt:10000,difficulty:'hard'});e.state.soccerCard.attributes.power=80;Object.assign(incoming.soccerCard,{stars:20,trainings:2,lastTrainingAt:20000,difficulty:'normal'});incoming.soccerCard.attributes.pace=77;assert.ok(e.importJSON(incoming).ok);assert.deepEqual(e.state.soccerCard,{stars:20,trainings:4,lastTrainingAt:20000,difficulty:'normal',attributes:{power:80,pace:77,accuracy:50,stamina:50,defense:50}});
});
for(const [label,mutate]of [['missing',s=>delete s.soccerCard],['extra field',s=>s.soccerCard.unknown=1],['bad difficulty',s=>s.soccerCard.difficulty='impossible'],['negative stars',s=>s.soccerCard.stars=-1],['unsafe stars',s=>s.soccerCard.stars=2**53],['fractional training',s=>s.soccerCard.trainings=.5],['negative time',s=>s.soccerCard.lastTrainingAt=-1],['missing attribute',s=>delete s.soccerCard.attributes.pace],['extra attribute',s=>s.soccerCard.attributes.other=50],['zero',s=>s.soccerCard.attributes.power=0],['over cap',s=>s.soccerCard.attributes.power=100],['fraction',s=>s.soccerCard.attributes.power=50.5],['string',s=>s.soccerCard.attributes.power='50']])test(`G3c card validation rejects ${label} without damaging the save`,()=>{
 const {engine:e}=fixture(),before=e.exportJSON(),raw=JSON.parse(before);mutate(raw);assert.equal(validateSave(raw,data,e.registry).ok,false);assert.equal(e.importJSON(raw).ok,false);assert.equal(e.exportJSON(),before);
});
function historyTarget(){const entries=[{external:true},null],listeners=new Set();let index=1;const pending=[];return {history:{get state(){return entries[index];},get length(){return entries.length;},replaceState(s){entries[index]=s;},pushState(s){entries.splice(index+1);entries.push(s);index++;},go(n){if(index+n>=0&&index+n<entries.length)pending.push(index+n);}},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),flush(){while(pending.length){index=pending.shift();for(const fn of listeners)fn({state:entries[index]});}},get index(){return index;}};}
test('G3c map Back asks, Stay restores one guard; repeat does not grow history, Exit traverses outside',()=>{
 const target=historyTarget();let prompts=0;const nav=new GameNavigation({target,onMapBack:()=>prompts++});const size=target.history.length;
 for(let i=0;i<20;i++){target.history.go(-1);target.flush();assert.ok(nav.mapQuestion);nav.stayOnMap();assert.equal(target.history.length,size);assert.equal(nav.depth,0);nav.menu();nav.game();nav.leave();target.flush();assert.equal(nav.depth,0);}
 target.history.go(-1);target.flush();nav.exitIsland();target.flush();assert.equal(target.index,0);assert.equal(prompts,21);nav.dispose();
});
