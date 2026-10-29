import {pilotInput} from '../workout/island/tests/pilot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,resetWorld,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienFlightFeedbackText} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {createNavalModel,navalWindLanding,navalLead} from '../workout/island/minigames/naval.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createSound,SOUND_EVENTS} from '../workout/island/minigames/sound.mjs';
import {gameContext,seededRandom} from '../workout/island/minigames/context.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),config=data.config.minigames;
const make=(id,level=1,extra={})=>({alienDefense:createAlienModel,navalDuel:createNavalModel,fireRescue:createFireModel}[id])({config,balance:config[id],level,random:seededRandom(12),...extra});
function advance(m,seconds,input={}){for(let i=0;i<Math.ceil(seconds/.01)&&!m.result;i++)m.update(.01,input);}
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size;}};}
function clear(m){for(const a of m.aliens)a.hp=1;while(m.aliens.length&&!m.result){const a=m.aliens[0];m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage:1000,kind:0});m.update(.00001,{});}}
function quietAlien(extra={}){const balance=structuredClone(config.alienDefense);Object.assign(balance.stageBehaviors[0],{motion:'static',shoots:false,shield:0,diveEverySeconds:0});for(const type of balance.enemyTypes)type.amplitude=0;return make('alienDefense',1,{balance,...extra});}
function fan(m){m.pickups.push({x:m.player.x,y:m.player.y,vx:0,vy:0,kind:0});m.update(.01,{});}
function hitAlien(m,a,damage=1){m.shots.push({x:a.x,y:a.y,vx:0,vy:0,hp:1,damage,kind:0,lastHit:-1,hitLo:0,hitHi:0});m.update(.00001,{});}
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} !== ${expected}`);}
test('G2f release pins bundled module edges and all JSON requests',async()=>{assert.equal(DATA_VERSION,'island-hoops-r3-20261029-1');const urls=[];await loadData(new URL('../workout/island/',import.meta.url),async url=>{urls.push(url);return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};});for(const u of urls)assert.equal(u.searchParams.get('v'),DATA_VERSION);});
test('G2f v6 migration is additive, validates ranks and preserves imported higher ranks',()=>{const e=createEngine(data,{storage:storage()}),old=JSON.parse(e.exportJSON());old.version=6;delete old.alienUpgrades;old.money=543;old.minigameEquipment.alienDefense.damage=2;const before=structuredClone(old),r=migrateSave(old,data,e.registry);assert.equal(CURRENT_VERSION,18);assert.equal(r.ok,true);assert.deepEqual(r.state,{...before,version:18,alienUpgrades:{laser:0,rapid:0,shield:0,wing:0,damage:0}});assert.deepEqual(old,before);for(const rank of [-1,4,1.5,'1']){const s=structuredClone(r.state);s.alienUpgrades.damage=rank;assert.equal(validateSave(s,data,e.registry).ok,false);}const incoming=structuredClone(r.state);incoming.alienUpgrades.damage=2;assert.equal(e.importJSON(incoming).ok,true);incoming.alienUpgrades.damage=1;assert.equal(e.importJSON(incoming).ok,true);assert.equal(e.state.alienUpgrades.damage,2);});
test('G2f purchased equipment and awarded permanent choices survive next stage, exit and reload',()=>{const st=storage(),e=createEngine(data,{storage:st});e.state.minigameEquipment.alienDefense.damage=2;const context=gameContext(e,config,12,'alienDefense',1),m=make('alienDefense',1,{...context,onUpgrade:ranks=>{e.state.alienUpgrades=ranks;e.save();}});clear(m);advance(m,.6);assert.equal(m.choosing,true);const id=m.choices[0];m.chooseUpgrade(0);assert.equal(e.state.alienUpgrades[id],1);const reload=createEngine(data,{storage:st}),next=make('alienDefense',2,gameContext(reload,config,12,'alienDefense',2));assert.equal(next.upgrades[id],1);assert.equal(next.equipment.damage,1.5);assert.ok(!Object.hasOwn(next.upgrades,'spread'));});
test('G2f cleared waves offer an immediate choice and final clears finish under 1.5 seconds',()=>{const m=make('alienDefense');clear(m);advance(m,.6);assert.ok(m.choosing);assert.ok(m.time<1.5);const b=structuredClone(config.alienDefense);Object.assign(b.levels[0],{waves:1});const final=make('alienDefense',1,{balance:b});clear(final);assert.equal(final.result?.outcome,'win');assert.ok(final.time<1.5);});
test('G2f spread stays temporary for six seconds while purchased laser and wings remain permanent',()=>{
 assert.deepEqual(config.alienDefense.spread,{seconds:6,cooldownSeconds:25});
 const m=quietAlien({equipment:{weapon:2},permanentUpgrades:{spread:3}});fan(m);assert.equal(m.spreadTime,6);assert.equal(m.spreadCooldown,31);assert.ok(!Object.hasOwn(m.upgrades,'spread'));
 m.update(.01,{firing:true});const main=m.shots.filter(s=>!s.wing),wingShots=m.shots.filter(s=>s.wing);
 assert.equal(main.length,3);assert.deepEqual(main.filter(s=>s.vx!==0).map(s=>s.vx).sort((a,b)=>a-b),[-config.alienDefense.pickups.spreadSpeed,config.alienDefense.pickups.spreadSpeed]);assert.equal(main.find(s=>s.vx===0).kind,1);assert.equal(wingShots.length,2);assert.ok(wingShots.every(s=>s.kind===1));
 advance(m,6.02);assert.equal(m.spreadTime,0);assert.ok(m.spreadCooldown>24&&m.spreadCooldown<25);assert.equal(m.wings.filter(w=>w.active).length,2);
 m.update(.01,{firing:true});assert.equal(m.shots.filter(s=>!s.wing).length,1);assert.equal(m.shots.find(s=>!s.wing).kind,1);assert.equal(m.shots.filter(s=>s.wing).length,2);
 m.update(.01,{spread:true});assert.equal(m.spreadTime,0);advance(m,m.spreadCooldown+.02);assert.equal(m.spreadCooldown,0);fan(m);assert.equal(m.spreadTime,6);assert.equal(m.spreadCooldown,31);
});
test('G2f collecting another fan refreshes neither its active duration nor its 25-second cooldown and explains the block',()=>{
 const m=quietAlien();fan(m);const activeNotice=alienFlightFeedbackText(m.feedback)?.text;advance(m,2);
 let time=m.spreadTime,cooldown=m.spreadCooldown;fan(m);near(m.spreadTime,time-.01,'active fan is not refreshed');near(m.spreadCooldown,cooldown-.01,'active fan cooldown is not refreshed');
 assert.equal(m.feedback.kind,'spread-cooldown');const notice=alienFlightFeedbackText(m.feedback);assert.ok(notice?.text);assert.notEqual(notice.text,activeNotice);
 advance(m,m.spreadTime+.02);assert.equal(m.spreadTime,0);cooldown=m.spreadCooldown;assert.ok(cooldown>24);fan(m);assert.equal(m.spreadTime,0);near(m.spreadCooldown,cooldown-.01,'blocked collection does not extend cooldown');assert.equal(m.feedback.kind,'spread-cooldown');assert.notEqual(alienFlightFeedbackText(m.feedback)?.text,activeNotice);
 advance(m,m.spreadCooldown+.02);fan(m);assert.equal(m.spreadTime,6);assert.equal(m.spreadCooldown,31);assert.equal(m.feedback.kind,'pickup');
});
test('G2f nova launches straight from the ship and hits several local targets',()=>{const m=make('alienDefense');advance(m,2);const before=m.aliens.map(a=>a.hp);m.update(.01,{nova:true,x:10,y:10});assert.equal(m.nova.fromY,m.player.y);assert.equal(m.nova.x,m.player.x);assert.equal(m.nova.y,m.player.y);assert.ok(m.nova.flight>0);advance(m,config.alienDefense.nova.aimSeconds+config.alienDefense.nova.throwSeconds+.02);assert.ok(m.aliens.length<before.length||m.aliens.filter((a,i)=>a.hp<before[i]).length>1);});
test('G2f all thirty stages spawn their authored weighted roster and behavior-based shields',()=>{
 const b=config.alienDefense;assert.equal(b.levels.length,30);
 for(let stage=1;stage<=30;stage++){
  const m=make('alienDefense',stage),level=b.levels[stage-1],behavior=b.stageBehaviors[stage-1],expected=Array.from({length:level.rows*level.columns},(_,i)=>level.enemyRoster[i%level.enemyRoster.length]);
  assert.deepEqual(m.aliens.map(a=>a.kind),expected,`stage ${stage} weighted roster`);assert.equal(m.behavior.motion,behavior.motion);assert.equal(m.behavior.shoots,behavior.shoots);assert.equal(m.behavior.diveEverySeconds,behavior.diveEverySeconds);
  for(const a of m.aliens){assert.equal(a.shield,Math.max(behavior.shield,b.enemyTypes[a.kind].shield||0),`stage ${stage}, kind ${a.kind}`);assert.ok(a.entry>0);assert.ok(a.y<a.baseY);}
  assert.ok(m.aliens.length<=b.maxAliens);
 }
});
test('G2f early fire is manual and every stage announces its first incoming shot before it is released',()=>{
 const b=config.alienDefense;
 for(let stage=1;stage<=30;stage++){
  const m=make('alienDefense',stage);advance(m,.5);assert.equal(m.shots.length,0);assert.equal(m.bolts.length,0);let warnedAt,firstShot;
  for(let i=0;i<1000&&!m.result;i++){m.update(.01,{});if(warnedAt===undefined&&m.telegraphs.some(t=>t.kind==='shot'&&t.maxLife>=m.behavior.warningSeconds))warnedAt=m.time;if(m.bolts.length){firstShot=m.time;break;}}
  assert.ok(warnedAt!==undefined&&firstShot!==undefined,`stage ${stage} must warn then shoot`);assert.ok(firstShot-warnedAt>=b.stageBehaviors[stage-1].warningSeconds-.02,`stage ${stage} shortened its warning`);assert.ok(m.bolts.length<=m.behavior.bulletCap);assert.equal(m.shots.length,0);
 }
});
test('G2f a settled first flight stays static, later fleets drift, and a warned diver rejoins its fleet',()=>{
 const b=config.alienDefense,still=make('alienDefense',1);advance(still,b.formation.entrySeconds+.02);const point=[still.aliens[0].x,still.aliens[0].y];advance(still,.5);near(still.aliens[0].x,point[0],'static x');near(still.aliens[0].y,point[1],'static y');
 const moving=make('alienDefense',2);advance(moving,b.formation.entrySeconds+.02);const x=moving.aliens[0].x;advance(moving,.5);assert.notEqual(moving.aliens[0].x,x);
 const stage=b.stageBehaviors.findIndex((s,i)=>s.diveEverySeconds>0&&b.levels[i].enemyRoster.includes(2))+1;assert.ok(stage>0);const fixture=structuredClone(b);fixture.stageBehaviors[stage-1].shoots=false;const m=make('alienDefense',stage,{balance:fixture});let warning,diver,rejoined=false;
 const deadline=b.tactics.firstDiveSeconds+m.behavior.diveEverySeconds+b.tactics.diveSeconds+m.behavior.warningSeconds+2;
 for(let i=0;i<Math.ceil(deadline/.01);i++){m.update(.01,{});const tell=m.telegraphs.find(t=>t.kind==='dive');if(tell&&!warning)warning={at:m.time,duration:tell.maxLife};const active=m.aliens.find(a=>a.diveAge>=0);if(active&&!diver){diver=active;assert.ok(warning);assert.ok(m.time-warning.at>=warning.duration-.02);}if(diver&&diver.diveAge<0){rejoined=true;break;}}
 assert.ok(rejoined,'a warned dive must finish and return to the moving fleet');assert.ok(Math.abs(diver.y-diver.baseY)<5);assert.equal(m.bolts.length,0);
});
test('G2f target fire lands at its wind-adjusted position, torpedo stays on water, with brief weapon recovery',()=>{for(const kind of [0,2]){const m=make('navalDuel'),supply=m.ammo[kind];m.update(.01,{targetX:240,targetZ:45,ammoIndex:kind});assert.equal(m.phase,'aim');assert.deepEqual(m.aim,{x:240,z:45});m.update(.01,{firing:true});assert.equal(m.ammo[kind],supply-1);assert.ok(m.cooldowns[kind]>0&&m.cooldowns[kind]<=1);const expected=kind===2?{x:240,z:45}:navalWindLanding({x:240,z:45},m.ball.wind,m.ball.duration,config.navalDuel,1);advance(m,m.ball.duration+.01);assert.equal(m.cooldowns[kind],0);assert.equal(m.blast.x,expected.x);assert.equal(m.blast.z,expected.z);assert.equal(m.ball.x,expected.x);if(kind===2)assert.equal(m.ball.y,config.navalDuel.shipY-Math.sin(m.ball.sampleTime*config.navalDuel.render.waveSpeed)*config.navalDuel.aim.torpedoBob);}});
test('G2f ammunition is finite and generous per stage; exhaustion resupplies and the last shot can still win',()=>{for(let level=1;level<=10;level++){const m=make('navalDuel',level);assert.deepEqual(m.ammo,m.settings.ammunition);assert.ok(m.ammo[0]>=28&&m.ammo[2]>=10&&m.ammo[1]>0&&m.ammo[1]<=4&&m.ammo[5]===3);}const empty=make('navalDuel');empty.ammo.fill(0);empty.update(.01,{});assert.equal(empty.result,undefined);advance(empty,2.1);assert.equal(empty.ammo[0],6);assert.equal(empty.resupplies,1);const last=make('navalDuel',1,{equipment:{damage:100}});last.ammo.fill(0);last.ammo[0]=1;const flight=config.navalDuel.targeting.flightSeconds+(last.enemyX-last.playerShip.x)*config.navalDuel.targeting.secondsPerRange,offset=navalWindLanding({x:0,z:0},last.wind,flight,config.navalDuel,1);last.update(.01,{targetX:last.enemyX-offset.x,targetZ:-offset.z,firing:true});advance(last,3);assert.equal(last.result.outcome,'win');});
test('G2f a led torpedo can hit a concurrent second ship without damaging the first',()=>{const m=make('navalDuel',10,{equipment:{damage:100}});advance(m,.1);const hp=m.enemies[0].hp,point=navalLead(m.playerShip,m.enemies[1],config.navalDuel,2);m.update(.01,{ammoIndex:2,targetX:point.x,targetZ:point.z,firing:true});advance(m,2);assert.equal(m.enemies[0].hp,hp);assert.equal(m.enemies[1].hp,0);assert.equal(m.result,undefined);});
test('G2f pressure can reach zero, blocks spray and recovers through the pump; water has its own warning',()=>{const m=make('fireRescue');advance(m,5.1,{firing:true,x:350,y:0});assert.equal(m.pressure,0);assert.equal(m.warningId,'minigame.noPressure');const water=m.water;advance(m,.3,{firing:true});assert.equal(m.spraying,false);assert.equal(m.water,water);advance(m,1,{charge:true});assert.ok(m.pressure>0);assert.equal(m.pressureEmpty,false);advance(m,.1,{firing:true,x:350,y:0});assert.equal(m.spraying,true);const dry=make('fireRescue');for(let i=0;i<40&&dry.water>0;i++){advance(dry,4,{firing:true,x:350,y:0});advance(dry,1.3,{charge:true});}assert.equal(dry.water,0);assert.equal(dry.warningId,'minigame.noWater');});
test('G2f new fires warn first then ignite at an unused location in stage one',()=>{const m=make('fireRescue'),initial=m.flames.filter(f=>f.active).length;advance(m,config.fireRescue.startGrace+config.fireRescue.levels[0].eruptionSeconds+.1);const f=m.flames.find(f=>f.warning>0);assert.ok(f);assert.equal(f.heat,0);assert.equal(m.flames.filter(f=>f.active).length,initial+1);advance(m,config.fireRescue.eruptionWarningSeconds+.1);assert.ok(f.heat>0);});
test('G2f sound never creates AudioContext before a user unlock, is quiet, and persists mute',()=>{let created=0;const gains=[];const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}),node=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:param(),gain:param()});class Audio{constructor(){created++;this.sampleRate=100;this.state='running';this.currentTime=0;this.destination={};}createGain(){const n=node();gains.push(n);return n;}createBuffer(){return {getChannelData:()=>new Float32Array(40)};}createBufferSource(){return node();}createOscillator(){return node();}createBiquadFilter(){return node();}resume(){return Promise.resolve();}close(){return Promise.resolve();}}
 const st=storage(),s=createSound({storage:st,AudioContext:Audio});s.play('shot');assert.equal(created,0);s.unlock();assert.equal(created,1);assert.ok(gains[0].gain.value<=.05);for(const event of SOUND_EVENTS)s.play(event);s.setMuted(true);assert.equal(st.getItem('island.sound'),'off');assert.equal(gains[0].gain.value,0);assert.equal(createSound({storage:st,AudioContext:Audio}).muted,true);s.dispose();});
test('G2f reset owns island keys only, including its mute preference',()=>{const st=storage(),e=createEngine(data,{storage:null});st.setItem('island.sound','off');st.setItem('kidfit.activeWorkout','keep');st.setItem('unrelated','keep');assert.equal(resetWorld(st,e.state).ok,true);assert.equal(st.getItem('island.sound'),null);assert.equal(st.getItem('kidfit.activeWorkout'),'keep');assert.equal(st.getItem('unrelated'),'keep');});
test('G2f stage-authored shields absorb one real hit before hull damage',()=>{
 const b=config.alienDefense,stage=b.stageBehaviors.findIndex(s=>s.shield>0)+1;assert.ok(stage>0);const m=make('alienDefense',stage);advance(m,b.formation.entrySeconds+.02);const enemy=m.aliens.find(a=>a.shield>0),hp=enemy.hp,charges=enemy.shield;
 hitAlien(m,enemy,.25);assert.equal(enemy.shield,charges-1);assert.equal(enemy.hp,hp);assert.equal(m.feedback.kind,'shield-hit');
 while(enemy.shield>0)hitAlien(m,enemy,.25);hitAlien(m,enemy,.25);near(enemy.hp,hp-.25,'damage begins after the shield is exhausted');
});
test('G2f splitters split on destruction rather than a nonlethal hit, with weaker bounded nonrewarding children',()=>{
 const b=config.alienDefense,kind=b.enemyTypes.findIndex(t=>t.children>0),stage=b.levels.findIndex((s,i)=>s.enemyRoster.includes(kind)&&b.stageBehaviors[i].shield===0)+1;assert.ok(stage>0);
 const m=make('alienDefense',stage);advance(m,b.formation.entrySeconds+.02);const parent=m.aliens.find(a=>a.kind===kind),count=m.aliens.length,hp=parent.hp,parentId=parent.id,parentRadius=parent.radius;assert.ok(parent&&hp>.25);assert.equal(parent.shield,0);
 hitAlien(m,parent,.25);assert.ok(m.aliens.includes(parent));assert.equal(m.aliens.length,count);assert.equal(m.aliens.filter(a=>a.child).length,0);near(parent.hp,hp-.25,'nonlethal splitter damage');
 hitAlien(m,parent,1000);const children=m.aliens.filter(a=>a.child);assert.ok(!m.aliens.some(a=>a.id===parentId));assert.equal(children.length,b.enemyTypes[kind].children);assert.equal(m.aliens.length,count-1+children.length);assert.ok(m.aliens.length<=b.maxAliens);
 for(const child of children){assert.ok(child.hp<hp);assert.ok(child.radius<parentRadius);assert.equal(child.reward,0);}
 const score=m.score;hitAlien(m,children[0],1000);assert.equal(m.aliens.filter(a=>a.child).length,children.length-1);assert.equal(m.score,score);
});
test('G2f the moving stage-ten boss enforces entry and all three sixteen-second damage gates before defeat',()=>{
 const b=structuredClone(config.alienDefense);b.levels[9].waves=1;Object.assign(b.stageBehaviors[9],{motion:'static',shoots:false,diveEverySeconds:0});for(const type of b.enemyTypes){type.mineSeconds=0;type.launchSeconds=0;}
 const m=make('alienDefense',10,{balance:b,completion:'waves',roundChoices:false}),boss=m.aliens.find(a=>a.boss),minimum=b.balance.minBossSeconds,step=minimum/3;assert.ok(boss);assert.equal(minimum,16);
 // Isolate the guard clock from incoming fire; separate cases exercise tells.
 const clock=seconds=>{for(let i=0;i<Math.ceil(seconds/.01)&&!m.result;i++){boss.attackTime=1000;boss.tellTime=0;m.update(.01,{});}};
 const until=age=>clock(Math.max(0,age-boss.age)),hp=boss.maxHp;
 hitAlien(m,boss,1000);assert.equal(boss.hp,hp);assert.equal(boss.guardActive,true);until(2.02);assert.ok(boss.y-boss.radius>0);const x=boss.x;clock(.3);assert.notEqual(boss.x,x);
 hitAlien(m,boss,1000);near(boss.hp,hp*2/3,'first damage gate');assert.equal(boss.bossPhase,1);assert.equal(boss.guardActive,true);hitAlien(m,boss,1000);near(boss.hp,hp*2/3,'first guard blocks repeated damage');assert.equal(m.feedback.kind,'boss-guard');
 until(2+step+.02);assert.equal(boss.bossPhase,2);hitAlien(m,boss,1000);near(boss.hp,hp/3,'second damage gate');assert.equal(boss.guardActive,true);
 until(2+step*2+.02);assert.equal(boss.bossPhase,3);hitAlien(m,boss,1000);assert.equal(boss.hp,1);assert.equal(boss.guardActive,true);
 until(2+minimum-.02);hitAlien(m,boss,1000);assert.equal(boss.hp,1);assert.ok(m.aliens.includes(boss));assert.equal(m.result,undefined);
 until(2+minimum+.02);assert.equal(boss.guardActive,false);hitAlien(m,boss,1000);assert.ok(!m.aliens.includes(boss));assert.ok(boss.age-2>=minimum);clear(m);assert.equal(m.result?.outcome,'win');
});

test('G2f all 30 alienDefense stages win for seeds 1, 3 and 7 with a 240ms reaction and bounded rewards',()=>{
 for(const seed of [1,3,7])for(let level=1;level<=30;level++){
 const balance=config.alienDefense,gear=level<=10?{}:{equipment:{damage:1.5,rate:1.3,weapon:1,shield:1},hangar:{rapid:5,shield:1}},m=make('alienDefense',level,{...gear,power:1,random:seededRandom(seed),completion:'waves',roundChoices:false}),memory={},peak={aliens:0,shots:0,bolts:0,pickups:0,loot:0};let input={};
 for(let i=0;i<30000&&!m.result;i++){if(i%12===0)input=pilotInput('alienDefense',m,balance,memory);m.update(.02,input);for(const key of Object.keys(peak))peak[key]=Math.max(peak[key],m[key].length);}
 assert.equal(m.result?.outcome,'win',`stage ${level}, seed ${seed}`);assert.ok(Number.isFinite(m.result.score)&&m.result.score>=0&&m.result.score<=m.settings.scoreLimit);assert.ok(m.time<=m.settings.seconds+config.maxFrameSeconds);assert.ok(m.result.performance>=0&&m.result.performance<=1);
 assert.ok(peak.aliens<=balance.maxAliens);assert.ok(peak.shots<=balance.maxShots);assert.ok(peak.bolts<=balance.maxBolts);assert.ok(peak.pickups<=balance.pickups.max);assert.ok(peak.loot<=balance.campaign.maxLoot);
 const e=createEngine(data,{storage:null}),reward=e.registry.minigames.get('alienDefense').onResult(m.result,{engine:e,config,level});assert.ok(reward);assert.ok(reward.money<=m.settings.winMoney+Math.floor(m.settings.rewardScoreLimit/balance.pointsPerCoin));
 }
});

for(const id of ['navalDuel','fireRescue'])for(const upgraded of [false,true])for(let level=1;level<=10;level++)test(`G2f ${id} stage ${level}, upgraded=${upgraded}: finite seeded win and bounded reward`,()=>{
 const balance=config[id],equipment=upgraded?Object.fromEntries(Object.entries(balance.equipment).map(([id,track])=>[id,track.levels.at(-1).value])):{},m=make(id,level,{equipment,power:upgraded?1.45:1}),memory={};
 for(let i=0;i<30000&&!m.result;i++)m.update(.02,pilotInput(id,m,balance,memory));assert.equal(m.result?.outcome,!upgraded&&(id==='fireRescue'&&level>=8||id==='alienDefense'&&[5,9,10].includes(level))?'lose':'win');assert.ok(m.result.score<=(m.settings.scoreLimit||balance.maximumScore));const e=createEngine(data,{storage:null});assert.ok(e.registry.minigames.get(id).onResult(m.result,{engine:e,config,level}));
});
