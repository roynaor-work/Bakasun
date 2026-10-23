import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {ALIEN_PICKUPS,alienPickup,alienBossReadout,alienBossGuardReadout,drawAlienPickupGlyph,drawAlienTelegraph,drawAlienFeedback} from '../workout/island/minigames/ultra-alien-feedback.mjs';
import {drawUltraAlienEffects} from '../workout/island/minigames/ultra-alien-effects.mjs';

function paint(){
 const calls=[],p={canvas:{clientWidth:844,clientHeight:390},calls};
 for(const key of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','ellipse','quadraticCurveTo','stroke','fill','fillRect','strokeRect','fillText','setLineDash'])p[key]=(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),`${key}: ${args}`);calls.push([key,...args]);};
 for(const key of ['createRadialGradient','createLinearGradient'])p[key]=(...args)=>{assert.ok(args.every(Number.isFinite));return {addColorStop(){}};};
 return p;
}
function scene(){return {time:4,wave:2,player:{x:320,y:420},aliens:[],pickups:[],loot:[],shots:[],bolts:[],sparks:[],nova:{flight:0,life:0},feedback:null,telegraphs:[]};}
const balance={hitFlashSeconds:.15,sparkSeconds:.5,nova:{seconds:.6,visualRadius:100},enemyTypes:[{projectile:'needle'}]},config={width:640,height:480};

test('alien collectible vocabulary and geometry distinguish all six weapons without relying only on color',()=>{
 assert.deepEqual(ALIEN_PICKUPS.map(p=>p.id),['spread','laser','rapid','shield','wing','nova']);
 const shapes=[];
 for(const [index,item]of ALIEN_PICKUPS.entries()){
  assert.equal(alienPickup(index),item);assert.equal(alienPickup(item.id),item);assert.ok(item.label.length>3);
  const p=paint();assert.equal(drawAlienPickupGlyph(p,index,120,200,12,1.6),true);shapes.push(JSON.stringify(p.calls));
  assert.equal(p.calls.filter(c=>c[0]==='save').length,p.calls.filter(c=>c[0]==='restore').length);
 }
 assert.equal(new Set(shapes).size,6);assert.equal(alienPickup(-1),null);assert.equal(drawAlienPickupGlyph(paint(),'unknown',0,0),false);
});

test('alien boss readout tracks remaining health and explicit attack phase, ignores defeated bosses',()=>{
 const m=scene();assert.equal(alienBossReadout(m),null);
 m.aliens=[{id:1,boss:true,hp:0,maxHp:200},{id:2,boss:true,hp:64,maxHp:100,attackPattern:1}];
 assert.deepEqual(alienBossReadout(m),{id:2,hp:64,maxHp:100,ratio:.64,phase:2,pattern:'מטח רחב'});
 m.aliens[1].bossPhase=3;assert.equal(alienBossReadout(m).phase,3);m.aliens[1].hp=1000;assert.equal(alienBossReadout(m).ratio,1);
});

test('alien arming cues stay at the attacker and expire without leaving a targeting marker',()=>{
 for(const kind of ['shot','dive','boss']){
  const p=paint(),tell={x:100,y:80,targetX:320,targetY:420,kind,life:.3,maxLife:.6};
  assert.equal(drawAlienTelegraph(p,tell,1.6,4),true);assert.deepEqual(p.calls.find(c=>c[0]==='translate'),['translate',100,80]);
  assert.ok(!p.calls.some(c=>c[0]==='setLineDash'));assert.ok(!p.calls.some(c=>c[0]==='lineTo'&&c[1]===320&&c[2]===420));
  const expired=paint();assert.equal(drawAlienTelegraph(expired,{...tell,life:0}),false);assert.equal(expired.calls.length,0);
 }
});

test('alien hit, shield, pickup, wave and boss feedback is deterministic on pause and never mutates simulation state',()=>{
 for(const kind of ['player-hit','enemy-hit','shield-hit','boss-guard','pickup','wave','boss-phase']){
  const m=scene();m.aliens=[{id:1,boss:true,x:320,y:100,hp:30,maxHp:90,bossPhase:3,attackPattern:1}];m.pickups=ALIEN_PICKUPS.map((p,i)=>({kind:i,x:150+i*40,y:200}));m.telegraphs=[{x:100,y:80,targetX:320,targetY:420,kind:'dive',life:.3,maxLife:.6}];m.feedback={id:5,kind,x:320,y:420,value:kind==='pickup'?'laser':2,life:.3};
  const original=JSON.stringify(m),a=paint(),b=paint();drawAlienFeedback(a,m,balance,1.6,config);drawAlienFeedback(b,m,balance,1.6,config);
  assert.equal(JSON.stringify(m),original);assert.deepEqual(a.calls,b.calls);assert.equal(a.calls.filter(c=>c[0]==='save').length,a.calls.filter(c=>c[0]==='restore').length);
 }
});

test('ULTRA projectile families retain distinct shapes and screen feedback needs no renderer resources',()=>{
 const paths=[];
 for(const shape of ['needle','orb','diamond','fork','ring']){const m=scene();m.bolts=[{kind:0,shape,x:200,y:200,vx:10,vy:100}];const p=paint();drawUltraAlienEffects(p,m,balance,1.6,config);paths.push(JSON.stringify(p.calls));}
 assert.equal(new Set(paths).size,5);
 const m=scene();m.shots=[{kind:0,x:200,y:200,vx:0,vy:-300},{kind:1,x:240,y:200,vx:0,vy:-300,wing:true}];drawUltraAlienEffects(paint(),m,balance,1.6,config);
});

test('alien screen effects leave global wave, pickup and damage messages to the DOM cockpit',()=>{
 for(const kind of ['wave','boss-phase','pickup','player-hit']){const m=scene();m.feedback={id:1,kind,x:320,y:420,value:kind==='pickup'?1:2,life:.5};const p=paint();drawAlienFeedback(p,m,balance,1.6,config);assert.equal(p.calls.filter(c=>c[0]==='fillText').length,0);}
});

test('alien feedback renders the actual campaign boss phases and telegraphs without changing the live model',async()=>{
 const data=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))),c=data.minigames,b=structuredClone(c.alienDefense);b.levels[29].waves=1;
 const m=createAlienModel({config:c,balance:b,level:30,random:seededRandom(3),completion:'waves',roundChoices:false});
 for(let i=0;i<260&&!m.telegraphs.length;i++)m.update(.02,{});
 assert.ok(m.telegraphs.length);assert.equal(alienBossReadout(m).pattern,'מטח סריקה');
 const boss=m.aliens.find(a=>a.boss);boss.entry=0;boss.age=2+b.balance.minBossSeconds*2/3+.1;boss.hp=boss.maxHp*.25;m.update(.02,{});assert.equal(alienBossReadout(m).phase,3);assert.equal(alienBossReadout(m).pattern,'מטח מניפה');
 const before=JSON.stringify(m.snapshot()),p=paint();drawUltraAlienEffects(p,m,b,1.6,c);assert.equal(JSON.stringify(m.snapshot()),before);
 assert.ok(p.calls.some(c=>c[0]==='fillText'&&c[1].includes('שלב 3')&&c[1].includes('מטח מניפה')));
});

test('boss timed guard counts down entry and phase windows independently from finite shield charges',()=>{
 assert.equal(alienBossGuardReadout({hp:80,maxHp:100,shield:4}),null);
 const entry={hp:100,maxHp:100,entry:1,guardActive:true,guardRemaining:1};
 assert.deepEqual(alienBossGuardReadout(entry),{active:true,remaining:1,progress:.5,label:'מגן כניסה · 1ש׳'});
 const phase={hp:60,maxHp:90,entry:0,shield:4,guardActive:true,guardRemaining:4};
 const first=alienBossGuardReadout(phase,24);assert.equal(first.label,'מגן מעבר · 4ש׳');assert.equal(first.progress,.5);
 phase.guardRemaining=2;assert.ok(alienBossGuardReadout(phase,24).progress>first.progress);
 phase.guardActive=false;phase.guardRemaining=0;assert.deepEqual(alienBossGuardReadout(phase),{active:false,remaining:0,progress:1,label:'פגיע עכשיו'});
});

test('blocked boss damage adds one local shield pulse without repeated global notices or simulation mutation',()=>{
 const m=scene();m.aliens=[{id:1,boss:true,x:320,y:110,radius:28,hp:60,maxHp:90,entry:0,bossPhase:2,guardActive:true,guardRemaining:2}];
 const event={id:1,kind:'boss-guard',x:320,y:110,value:2,life:.25};m.feedback=event;const before=JSON.stringify(m),once=paint();drawAlienFeedback(once,m,balance,1.6,config);assert.equal(JSON.stringify(m),before);
 assert.equal(once.calls.filter(c=>c[0]==='fillText'&&c[1]==='מגן מעבר · 2ש׳').length,1);
 assert.equal(once.calls.filter(c=>c[0]==='fillText').length,3);
 m.feedback=Array.from({length:10},(_,i)=>({...event,id:i+1}));const burst=paint();drawAlienFeedback(burst,m,balance,1.6,config);assert.deepEqual(burst.calls,once.calls);
});

test('actual boss entry guard becomes a clear vulnerable state after its core deadline',async()=>{
 const data=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))),c=data.minigames,b=structuredClone(c.alienDefense);b.levels[29].waves=1;
 const m=createAlienModel({config:c,balance:b,level:30,random:seededRandom(3),completion:'waves',roundChoices:false});
 const boss=m.aliens.find(a=>a.boss);assert.equal(alienBossGuardReadout(boss).label,'מגן כניסה · 2ש׳');
 const entry=paint();drawUltraAlienEffects(entry,m,b,1.6,c);assert.ok(entry.calls.some(c=>c[0]==='fillText'&&c[1]==='מגן כניסה · 2ש׳'));
 for(let i=0;i<110;i++)m.update(.02,{});
 assert.equal(alienBossGuardReadout(boss).active,false);const open=paint();drawUltraAlienEffects(open,m,b,1.6,c);assert.ok(open.calls.some(c=>c[0]==='fillText'&&c[1]==='פגיע עכשיו'));
});
