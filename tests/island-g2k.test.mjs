import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienFrameInput} from '../workout/island/minigames/alien-session.mjs';
import {alienModelSpecs} from '../workout/island/minigames/alien-assets.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {pilotInput} from '../workout/island/tests/pilot.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense;
const make=(extra={})=>createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',...extra});
const advance=(m,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.01)&&!m.result;i++)m.update(.01,input);};
const separated=m=>{for(let i=0;i<m.aliens.length;i++)for(let j=i+1;j<m.aliens.length;j++){const a=m.aliens[i],b=m.aliens[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)+1e-6>=a.radius+b.radius,`${a.id}/${b.id} at ${m.time}`);}};

test('G2k a short nova touch waits through zero-duration frames and launches once from the ship',()=>{
 const m=make();advance(m,2);let pulse=true,reads=0;
 const controls={sample(){reads++;const sample={moveX:0,kickHeld:false,passHeld:pulse};pulse=false;return sample;}};
 assert.equal(alienFrameInput(controls,0),null);assert.equal(reads,0);
 const before=m.novaCharges;m.update(.02,alienFrameInput(controls,.02));
 assert.equal(m.novaCharges,before-1);assert.equal(m.nova.fromX,m.player.x);assert.equal(m.nova.fromY,m.player.y);assert.ok(m.nova.flight>0);
 advance(m,balance.nova.aimSeconds+balance.nova.throwSeconds+.02,{nova:true});assert.ok(m.nova.life>0);assert.equal(m.novaCharges,before-1);
});
test('G2k idle movement never fires; first press creates exactly one ordinary shot and release stops it',()=>{
 const m=make();advance(m,1,{moveX:1});assert.equal(m.shots.length,0);assert.equal(m.score,0);
 m.update(.01,{firing:true});assert.equal(m.shots.length,1);assert.equal(m.shots[0].kind,0);assert.equal(m.shots[0].wing,false);
 const fired=m.shots[0].slot;advance(m,.1,{});assert.equal(m.shots.length,1);assert.equal(m.shots[0].slot,fired);
 advance(m,1,{});assert.equal(m.shots.length,0);
});
test('G2k the short authored fleet introduces weavers in stage three and three roles in stage four',()=>{
 const specs=alienModelSpecs(balance);assert.equal(specs.player.rotationY,90);assert.ok(specs.enemies.every(s=>s.rotationY===270));
 const introduction=make({level:3});assert.equal(introduction.aliens.length,12);assert.deepEqual([...new Set(introduction.aliens.map(a=>a.kind))].sort(),[0,2]);
 const m=make({level:4});assert.equal(m.aliens.length,12);assert.equal(new Set(m.aliens.map(a=>a.kind)).size,3);assert.ok(m.aliens.every(a=>a.facing===1&&a.y+a.radius<0));
 const base=m.aliens[0].baseY;let diver,peak=0,returned=false,enemyFire=false;
 for(let i=0;i<1100&&!m.result;i++){
  m.update(.01,{});enemyFire||=m.bolts.length>0;
  const d=m.aliens.find(a=>a.diveAge>=0);if(d&&!diver)diver=d;if(diver){peak=Math.max(peak,diver.y-diver.baseY);if(diver.diveAge<0)returned=true;}
  separated(m);
 }
 assert.ok(m.aliens[0].baseY>base);assert.ok(enemyFire);assert.ok(peak>config.height/3);assert.ok(returned);assert.ok(m.aliens.every(a=>a.facing===1));
});
test('G2k every frame stays separate during entry, tactical dives, splits and later waves',()=>{
 for(const level of [1,5,10])for(const seed of [1,4,9]){const m=make({level,random:seededRandom(seed)}),memory={};for(let i=0;i<2500&&!m.result;i++){m.update(.02,pilotInput('alienDefense',m,balance,memory));separated(m);}}
});
test('G2k a timeout with living enemies cannot award a victory',()=>{
 const b=structuredClone(balance);b.levels[0].seconds=.1;const m=make({balance:b});advance(m,.2);assert.equal(m.result.outcome,'lose');assert.ok(m.aliens.length>0);
});
test('G2k the two-button session crosses a cleared wave without an in-game choice or earned rank',()=>{
 const m=make({roundChoices:false});m.aliens.splice(0);advance(m,balance.wavePauseSeconds+.02);assert.equal(m.wave,2);assert.equal(m.choosing,false);assert.ok(m.aliens.length>0);assert.ok(Object.values(m.upgrades).every(v=>v===0));
});
test('G2k small earned rate and delayed double-shot preserve a single starting projectile',()=>{
 assert.equal(balance.hangar.rankRate,.05);assert.ok(balance.hangar.firstDoubleWin>=3);
 for(const rapid of [0,1,2]){const m=make({hangar:{rapid}});m.update(.01,{firing:true});assert.equal(m.shots.length,1);}
 const m=make();m.aliens.splice(0);advance(m,.4);assert.ok(m.choosing);assert.ok(!m.choices.includes('wing'));
});
test('G2k ten seeded two-button pilots learn the static tutorial safely while incoming bolts still cause real damage',()=>{
 const c=balance.calibration,results=[];
 for(let seed=1;seed<=c.seeds;seed++){
  const m=make({random:seededRandom(seed),roundChoices:false}),memory={};let input={};
  for(let i=0;i<Math.ceil(m.settings.seconds/c.stepSeconds)+1&&!m.result;i++){
   if(i%Math.round(c.reactionSeconds/c.stepSeconds)===0){input=pilotInput('alienDefense',m,balance,memory);input.spread=false;}
   m.update(c.stepSeconds,input);
  }
  results.push({seed,outcome:m.result?.outcome,lives:m.lives,seconds:+m.time.toFixed(2)});
 }
 console.log('G2k two-button easy calibration',JSON.stringify(results));assert.ok(results.filter(r=>r.outcome==='win').length>=c.minimumWins);
 assert.equal(balance.stageBehaviors[0].motion,'static');assert.equal(balance.stageBehaviors[0].diveEverySeconds,0);assert.ok(results.filter(r=>r.outcome==='win').every(r=>r.lives===balance.levels[0].lives));
 const incoming=make({level:2}),lives=incoming.lives;incoming.bolts.push({x:incoming.player.x,y:incoming.player.y-35,vx:0,vy:1000});incoming.update(.04,{});
 assert.equal(incoming.lives,lives-1);assert.ok(incoming.invulnerable>0);assert.equal(incoming.feedback.kind,'player-hit');
});
