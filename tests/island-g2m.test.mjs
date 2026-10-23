import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {alienAppearance} from '../workout/island/minigames/alien-assets.mjs';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.alienDefense;
const make=(level=1,seed=3,extra={})=>createAlienModel({config,balance:b,level,random:seededRandom(seed),roundChoices:false,completion:'waves',...extra});
const advance=(m,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.01)&&!m.result;i++)m.update(.01,input);};
const until=(m,predicate,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.01)&&!predicate()&&!m.result;i++)m.update(.01,input);return predicate();};
test('G2m fresh ships start with one shot while earned laser and wing loadouts activate without granting spread',()=>{
 const fresh=make();fresh.update(.01,{firing:true,spread:true});assert.equal(fresh.shots.length,1);assert.equal(fresh.shots[0].kind,0);assert.equal(fresh.shots[0].wing,false);assert.equal(fresh.spreadTime,0);
 const earned=make(1,3,{equipment:{weapon:2},permanentUpgrades:{wing:3,laser:3}});earned.update(.01,{firing:true,spread:true});assert.equal(earned.shots.length,3);assert.equal(earned.shots.filter(s=>s.wing).length,2);assert.ok(earned.shots.every(s=>s.kind===1));assert.equal(earned.spreadTime,0);
});
test('G2m collected fan bonus gives three lanes for six seconds then returns to one',()=>{const m=make();m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:0});m.update(.01,{});m.update(.01,{firing:true});assert.equal(m.shots.length,3);assert.equal(new Set(m.shots.map(s=>s.vx)).size,3);advance(m,6.1);m.shots.length=0;m.update(.01,{firing:true});assert.equal(m.spreadTime,0);assert.equal(m.shots.length,1);});
test('G2m earned wings remain active while a pickup-only wing expires with its temporary power',()=>{
 const m=make(1,3,{equipment:{weapon:2},permanentUpgrades:{wing:3}});m.update(.01,{firing:true});assert.equal(m.shots.length,3);assert.equal(m.wings.filter(w=>w.active).length,2);
 m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:4});m.update(.01,{});advance(m,b.pickups.seconds+.1);m.shots.length=0;m.update(.01,{firing:true});assert.equal(m.shots.length,3);assert.ok(m.shots.every(s=>s.kind===1));assert.equal(m.wings.filter(w=>w.active).length,2);
 const temporary=make();temporary.pickups.push({x:temporary.player.x,y:temporary.player.y,vy:0,kind:4});temporary.update(.01,{});temporary.update(.01,{firing:true});assert.equal(temporary.shots.length,2);assert.equal(temporary.wings.filter(w=>w.active).length,1);
 advance(temporary,b.pickups.seconds+.1);temporary.shots.length=0;temporary.update(.01,{firing:true});assert.equal(temporary.shots.length,1);assert.ok(temporary.wings.every(w=>!w.active));
});
test('G2m each early sector uses its authored role roster, introducing scout before heavy',()=>{
 for(let level=1;level<=10;level++){const m=make(level),kinds=[...new Set(m.aliens.filter(a=>!a.boss).map(a=>a.kind))].sort(),roster=[...new Set(b.levels[level-1].enemyRoster)].sort();assert.deepEqual(kinds,roster,`stage ${level}`);}
 assert.deepEqual([...new Set(make(1).aliens.map(a=>a.kind))],[0]);assert.deepEqual([...new Set(make(2).aliens.map(a=>a.kind))].sort(),[0,1]);
});
test('G2m velocity retains bounded 150 ms acceleration and raw quadratic stick input but release stops immediately',()=>{
 const m=make();for(let i=0;i<15;i++){const before=m.player.vx||0;m.update(.01,{moveX:1});assert.ok(m.player.vx-before<=b.playerSpeed/b.movement.rampSeconds*.01+1e-8);}assert.ok(Math.abs(m.player.vx-221)<1e-7);
 const released=m.player.x;m.update(.01,{});assert.equal(m.player.vx,0);assert.equal(m.player.bank,0);assert.equal(m.player.x,released);advance(m,.15);assert.equal(m.player.x,released);
 const small=make();advance(small,.15,{moveX:.2});assert.ok(Math.abs(small.player.vx-221*.04)<1e-7);
});
test('G2m a twenty-pixel drag approaches the finger and moves less than 10% of the screen',()=>{for(const width of [390,844]){const m=make(),start=m.player.x,target=start+20/width*config.width;m.update(.01,{x:target});assert.ok(m.player.x>start&&m.player.x<target);advance(m,.3,{x:target});assert.ok((m.player.x-start)*width/config.width<width*.1);assert.ok(m.player.x<target);}});
test('G2m a full heavy tutorial fleet loses 20–40 percent to a missile while intersecting heavy hulls survive damage',()=>{
 for(const seed of [1,3,7,12]){const events=[],m=make(2,seed,{sound:e=>events.push(e)});advance(m,2);const before=m.aliens.length,heavy=m.aliens.filter(a=>a.kind===1),health=new Map(heavy.map(a=>[a.id,a.hp]));
  m.player.x=heavy.reduce((a,c)=>Math.abs(c.x-config.width/2)<Math.abs(a.x-config.width/2)?c:a).x;m.update(.01,{nova:true});assert.equal(m.nova.aim,undefined);assert.equal(m.nova.flight,b.nova.throwSeconds);assert.ok(events.includes('missileLaunch'));advance(m,b.nova.throwSeconds+.02);
  const fraction=(before-m.aliens.length)/before;assert.ok(fraction>=.2&&fraction<=.4,`${seed}: ${fraction}`);assert.ok(heavy.some(a=>m.aliens.includes(a)&&a.hp>0&&a.hp<health.get(a.id)));assert.equal(m.novaCharges,b.nova.charges-1);assert.ok(events.includes('missileExplosion'));
 }
});
test('G2m warned heavy attacks release two slow fan bolts and warned scouts release one fast needle',()=>{
 for(const kind of [0,1]){const m=make(kind===0?1:2),a=m.aliens.find(a=>a.kind===kind);m.aliens.splice(0,m.aliens.length,a);m.update(.01,{});assert.equal(m.bolts.length,0);
  assert.ok(until(m,()=>a.tellTime>0,10),'warning must precede the first shot');assert.equal(m.bolts.length,0);assert.ok(m.telegraphs.some(t=>t.kind==='shot'&&t.life>0));const warningAt=m.time,duration=a.tellMax;
  assert.ok(until(m,()=>m.bolts.length>0,duration+.1));assert.ok(m.time-warningAt>=duration-.02);assert.equal(m.bolts.length,kind===0?1:2);assert.ok(m.bolts.every(s=>s.shape===b.enemyTypes[kind].projectile&&s.color===b.enemyTypes[kind].color));
  assert.ok(kind===0?m.bolts[0].vy>m.settings.boltSpeed:m.bolts.every(s=>s.vy<m.settings.boltSpeed));if(kind===1)assert.ok(m.bolts[0].vx<m.bolts[1].vx);
 }
});
test('G2m mixed authored fleets keep missile kills in the 20–40 percent band and retain partial hull damage',()=>{
 let damagedSurvivors=0;
 for(const level of [3,5,7,10])for(const seed of [1,3,7]){const m=make(level,seed);advance(m,2);const originals=[...m.aliens],health=new Map(originals.map(a=>[a.id,a.hp])),count=originals.length;m.update(.01,{nova:true});advance(m,.85);
  const fraction=(count-m.aliens.length)/count;assert.ok(fraction>=.2&&fraction<=.4,JSON.stringify({level,seed,fraction}));
  for(const a of originals)if(m.aliens.includes(a)&&a.hp<health.get(a.id)){
   const expected=b.nova.damage*(1+Math.min(level-1,8)*b.hpPerStage)*(1-(b.enemyTypes[a.kind].novaResistance||0));assert.ok(Math.abs(health.get(a.id)-a.hp-expected)<1e-7);assert.ok(a.hp>0);if(a.kind===1||a.kind===4)damagedSurvivors++;
  }
 }
 assert.ok(damagedSurvivors>0,'the mixed cases include a heavy or carrier surviving real missile damage');
});
test('G2m roles warn before diving or mining, split on defeat, and bosses respect warning and phase gates',()=>{
 const weaver=make(3);let diveWarning=false;
 assert.ok(until(weaver,()=>{diveWarning||=weaver.telegraphs.some(t=>t.kind==='dive'&&t.life>0);return weaver.aliens.some(a=>a.kind===2&&a.diveAge>=0);},20));assert.ok(diveWarning);

 const split=make(6);advance(split,2);const splitter=split.aliens.find(a=>a.kind===3);split.aliens.splice(0,split.aliens.length,splitter);
 const hitSplitter=damage=>{split.shots.push({x:splitter.x,y:splitter.y,vx:0,vy:0,hp:1,damage,hitLo:0,hitHi:0});split.update(.00001,{});};
 const hp=splitter.hp,splitterId=splitter.id,parentRadius=splitter.radius;hitSplitter(.25);assert.ok(splitter.hp<hp&&splitter.hp>0);assert.equal(split.aliens.filter(a=>a.child).length,0);
 hitSplitter(100);const children=split.aliens.filter(a=>a.child);assert.equal(children.length,2);assert.ok(split.aliens.every(a=>a.id!==splitterId));assert.ok(children.every(a=>a.radius<parentRadius));assert.ok(Math.hypot(children[0].x-children[1].x,children[0].y-children[1].y)+1e-7>=children[0].radius+children[1].radius);

 const carrier=make(7),mother=carrier.aliens.find(a=>a.kind===4);carrier.aliens.splice(0,carrier.aliens.length,mother);mother.launchTime=mother.mineTime=.001;
 carrier.update(.01,{});assert.ok(mother.entry>0);assert.ok(carrier.aliens.every(a=>!a.child));assert.ok(carrier.bolts.every(b=>!b.mine));
 assert.ok(until(carrier,()=>carrier.aliens.some(a=>a.child),b.formation.entrySeconds+.1));assert.equal(mother.entry,0);assert.equal(mother.launched,1);assert.equal(mother.attackKind,'mine');assert.ok(mother.tellTime>0);assert.ok(carrier.bolts.every(b=>!b.mine));
 assert.ok(until(carrier,()=>carrier.bolts.some(b=>b.mine),mother.tellMax+.1));assert.ok(carrier.bolts.filter(b=>b.mine).length<=2);assert.ok(carrier.bolts.length<=carrier.behavior.bulletCap);

 const balance=structuredClone(b);balance.levels[9].waves=1;
 // Extra fixture lives isolate boss mechanics from unrelated player survival.
 const boss=make(10,3,{balance,equipment:{shield:20}}),king=boss.aliens.find(a=>a.boss);boss.aliens.splice(0,boss.aliens.length,king);
 advance(boss,1.99);assert.ok(king.entry>0);assert.equal(boss.bolts.length,0);advance(boss,.02);assert.equal(king.entry,0);
 const hitBoss=()=>{boss.shots.push({x:king.x,y:king.y,vx:0,vy:0,hp:1,damage:100000,hitLo:0,hitHi:0});boss.update(.00001,{});};
 hitBoss();assert.ok(king.hp>=king.maxHp*2/3);assert.equal(king.bossPhase,1);assert.equal(boss.result,undefined);
 assert.ok(until(boss,()=>king.tellTime>0,3));assert.equal(boss.bolts.length,0);assert.ok(boss.telegraphs.some(t=>t.kind==='boss'));const warnedAt=boss.time,tell=king.tellMax;
 assert.ok(until(boss,()=>boss.bolts.length>0,tell+.1));assert.ok(boss.time-warnedAt>=tell-.02);const first=boss.bolts[0].pattern;
 assert.ok(until(boss,()=>boss.bolts.some(s=>s.pattern!==first),6));
 const minimum=balance.balance.minBossSeconds;assert.ok(king.age>=2+minimum/3);assert.equal(king.bossPhase,2);hitBoss();assert.ok(king.hp>=king.maxHp/3);
 assert.ok(until(boss,()=>king.age>=2+minimum*2/3+.01,minimum));assert.equal(king.bossPhase,3);hitBoss();assert.equal(king.hp,1);assert.equal(boss.result,undefined);
 assert.ok(until(boss,()=>king.age>=2+minimum+.01,minimum));hitBoss();assert.equal(boss.result?.outcome,'win');assert.ok(boss.time>=minimum+2);
});
test('G2m seven CC0 local effects fit the 400KB budget and retain the license',async()=>{const root=new URL('../workout/island/assets/audio/g2m/',import.meta.url),files=(await readdir(root)).filter(f=>f.endsWith('.ogg'));assert.equal(files.length,7);let bytes=0;for(const file of files){bytes+=(await stat(new URL(file,root))).size;assert.equal((await readFile(new URL(file,root))).toString('ascii',0,4),'OggS');}assert.ok(bytes<400*1024);assert.match(await readFile(new URL('LICENSE.txt',root),'utf8'),/CC0 1.0 Universal/);});
test('G2m clearing the final wave waits its transition then emits the dedicated stage-end cue exactly once',()=>{
 const balance=structuredClone(b),events=[];balance.levels[0].waves=1;const m=make(1,3,{balance,sound:event=>events.push(event)});m.aliens.splice(0);advance(m,b.wavePauseSeconds/2);assert.equal(m.result,undefined);assert.equal(events.filter(e=>e==='stageEnd').length,0);
 advance(m,b.wavePauseSeconds/2+.02);assert.equal(m.result.outcome,'win');m.update(.02,{});assert.equal(events.filter(e=>e==='stageEnd').length,1);
});

test('G2m scout-only stage one and scout-heavy stage two retain one authored model/color pair per role across rows',()=>{
 for(const level of [1,2]){const m=make(level),visuals=m.aliens.map(a=>alienAppearance(b,a.kind)),kinds=[...new Set(m.settings.enemyRoster)];assert.equal(new Set(visuals.map(v=>v.path)).size,kinds.length);assert.equal(new Set(visuals.map(v=>v.color)).size,kinds.length);
  for(const kind of kinds){const role=visuals.filter(v=>v.kind===kind);assert.ok(role.length>0);assert.equal(new Set(role.map(v=>JSON.stringify(v))).size,1);assert.equal(role[0].color,b.enemyTypes[kind].color);}
  assert.deepEqual([...m.aliens].reverse().map(a=>alienAppearance(b,a.kind)).reverse(),visuals);
 }
});
