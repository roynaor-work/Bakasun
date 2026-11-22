// v24.9 aliens (Roy, 22/11/2026, after v24.8 on the phone): "the regular fire goes through the ships, that is not right / there is also text
// that gets in the way now and then / I saw no laser fire at all". Three fixes, each behind its own switch (alien-v249.mjs):
//  ?alienPierceFix=0  the permanent laser's rounds pierce again (v24.5..v24.8);
//  ?alienText=old     the v24.8 banner and notices;
//  ?alienLaserSeen=0  the v24.8 laser bonus (rotation only, the beam only on a new press, no chip).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {alienPierceFixEnabled,alienTextCompact,alienLaserSeenEnabled,laserGiftDue,compactNotice,LASER_SEEN,COMPACT_NOTICE_SECONDS} from '../workout/island/minigames/alien-v249.mjs';
import {laserChipState,createAlienLaserChip} from '../workout/island/minigames/alien-v249-ui.mjs';
import {alienFlightFeedbackText,createAlienFlightHud} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {BURST} from '../workout/island/minigames/alien-laser-burst.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
const step=1/60,HP=1e6;
/** Three ships in one column above the ship; nothing moves or shoots. */
function column({search='',weapon=0,laserRank=0,bonus=false,ys=[100,180,260]}={}){
 globalThis.location={search};
 const balance=structuredClone(config.alienDefense);
 Object.assign(balance.levels[0],{rows:1,columns:ys.length,waves:1,enemyRoster:[0],enemyKinds:1});
 balance.stageBehaviors[0]={...balance.stageBehaviors[0],motion:'static',shoots:false,diveEverySeconds:0,shield:0};
 balance.v11.laserEvery=[999,999];balance.laserSeen={firstAt:1e9,waveAt:1e9};/* no token of its own in these column tests */
 const model=createAlienModel({config,balance,level:1,random:()=>.5,equipment:{weapon},permanentUpgrades:{laser:laserRank},completion:'waves',roundChoices:false});
 model.hull={pxPerUnit:390/480};
 model.aliens.forEach((a,i)=>Object.assign(a,{x:180,y:ys[i],baseX:180,baseY:ys[i],originY:ys[i],entry:0,entrySide:0,hp:HP,maxHp:HP,shield:0,diveAge:-1,launched:100}));
 model.player.x=180;
 if(bonus){model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});model.update(.001,{});}
 return model;
}
/** One round of the steady cannon from the real fire gate, then 3 s of flight. The v24.6 beam is kept dark so only the round can hit. */
function oneRound(model){
 let round=null;
 for(let i=0;i<180;i++){model.update(step,{firing:!round});if(model.laserBurst)model.laserBurst.left=0;if(!round&&model.shots.length){round=model.shots.find(s=>!s.wing&&s.kind!==2);model.shots.splice(0,model.shots.length,round);}}
 assert.ok(round,'the fire gate produced a round');
 return {hit:model.aliens.filter(a=>a.hp<HP).length,front:HP-model.aliens.at(-1).hp,left:model.shots.length};
}

test('v24.9 switches: on by default, each URL switch restores v24.8',()=>{
 assert.equal(alienPierceFixEnabled(''),true);assert.equal(alienPierceFixEnabled('?alienPierceFix=0'),false);
 assert.equal(alienTextCompact(''),true);assert.equal(alienTextCompact('?alienText=old'),false);
 assert.equal(alienLaserSeenEnabled(''),true);assert.equal(alienLaserSeenEnabled('?alienLaserSeen=0'),false);
});
test('v24.9 regression: a regular round stops on the first ship and is gone, with or without a permanent laser',()=>{
 for(const setup of [{},{weapon:2},{laserRank:1},{weapon:2,laserRank:2}]){
  const r=oneRound(column(setup));assert.equal(r.hit,1,`${JSON.stringify(setup)}: one ship hit, not ${r.hit}`);assert.equal(r.left,0,'the round was removed at the hull');assert.ok(r.front>0,'the front ship took the damage');
 }
});
test('v24.9: the cause in v24.8 (?alienPierceFix=0): the permanent laser made every regular round pierce',()=>{
 assert.equal(oneRound(column({weapon:2,search:'?alienPierceFix=0'})).hit,3);assert.equal(oneRound(column({laserRank:1,search:'?alienPierceFix=0'})).hit,3);
 assert.equal(oneRound(column({search:'?alienPierceFix=0'})).hit,1,'a player without the laser was never affected');
});
test('v24.9: the laser pierces only while the laser bonus runs, and at most laserPierce (4) ships',()=>{
 const ROUND='?alienLaserBurst=0';/* the round alone, without the v24.6 beam */
 assert.equal(oneRound(column({bonus:true,search:ROUND})).hit,3);assert.equal(oneRound(column({weapon:2,bonus:true,search:ROUND})).hit,3);
 assert.equal(oneRound(column({bonus:true,search:ROUND,ys:[40,90,140,190,240,290]})).hit,4,'4 of 6 ships in the column');
 // the bonus ends: the next round stops again
 const model=column({weapon:2,bonus:true,search:ROUND});for(let i=0;i<Math.ceil(16.2/step);i++){model.update(step,{});}assert.equal(model.laserTime,0);assert.equal(oneRound(model).hit,1);
});
test('v24.9: the stopped permanent-laser round keeps the v24.4 first-hull damage (stronger than a plain round)',()=>{
 const plain=oneRound(column({})).front,now=oneRound(column({weapon:2})).front,v244=oneRound(column({weapon:2,search:'?alienLaser=0'})).front;
 assert.ok(Math.abs(now-v244)<1e-6,`the same damage on the front ship as v24.4 (${now} vs ${v244})`);assert.ok(now>plain,'the purchased laser is still worth more than the plain cannon');
});

/** Stage 1 as shipped with a simple player: under the token, else under the lowest ship; the fire button held from the first frame. */
function play(seed,search='',seconds=20,level=1){
 globalThis.location={search};const balance=structuredClone(config.alienDefense);
 const model=createAlienModel({config,balance,level,random:seededRandom(seed),completion:'waves',roundChoices:false});model.hull={pxPerUnit:390/480};
 const out={tokenAt:-1,laserAt:-1,litAt:-1,lit:0};
 for(let f=0;f<seconds*60&&!model.result;f++){
  const target=model.pickups[0]||model.aliens.filter(a=>a.y>0).sort((a,b)=>b.y-a.y)[0],dx=target?target.x-model.player.x:0;
  model.update(step,{moveX:Math.max(-1,Math.min(1,dx/20)),firing:true});
  if(out.tokenAt<0&&model.pickups.some(d=>d.kind===1))out.tokenAt=model.time;
  if(out.laserAt<0&&model.laserTime>0)out.laserAt=model.time;
  if(model.laserBurst?.left>0){out.lit+=step;if(out.litAt<0)out.litAt=model.time;}
 }
 return {...out,model};
}
test('v24.9: in stage 1 the laser token appears a few seconds into wave 1 and the laser runs well inside 20 s (5 seeds)',()=>{
 for(let seed=1;seed<=5;seed++){const r=play(seed);
  assert.ok(Math.abs(r.tokenAt-LASER_SEEN.firstAt)<.1,`seed ${seed}: token at ${r.tokenAt.toFixed(1)} s`);
  assert.ok(r.laserAt>0&&r.laserAt<12,`seed ${seed}: laser at ${r.laserAt.toFixed(1)} s`);
  assert.ok(r.litAt>0&&r.litAt-r.laserAt<.05,`seed ${seed}: the beam lit with the bonus, the finger already down (${r.litAt.toFixed(2)} s)`);
  assert.ok(r.lit>=8,`seed ${seed}: beam lit ${r.lit.toFixed(1)} s of the first 20 s`);
  assert.equal(r.model.snapshot().laserSeen.taken,1);assert.equal(r.model.laserMax,LASER_SEEN.giftSeconds,'the token of its own gives the short laser');}
});
test('v24.9: the cause in v24.8 (?alienLaserSeen=0): no laser bonus in the first 20 s of stage 1, and none in a whole game',()=>{
 for(let seed=1;seed<=3;seed++){const r=play(seed,'?alienLaserSeen=0');assert.equal(r.laserAt,-1,`seed ${seed}`);assert.equal(r.lit,0);assert.equal(r.model.snapshot().laserSeen,undefined);}
 const whole=play(1,'?alienLaserSeen=0',240);assert.ok(whole.model.result,'the game ended');assert.equal(whole.laserAt,-1,'stage 1 ended without one laser bonus');
});
test('v24.9: a finger already on the fire button lights the beam; v24.8 needed a new press',()=>{
 const run=search=>{const model=column({search});for(let i=0;i<30;i++){model.update(step,{firing:true});model.shots.length=0;}
  model.pickups.push({kind:1,x:model.player.x,y:model.player.y,vy:0});for(let i=0;i<120;i++){model.update(step,{firing:true});model.shots.length=0;}return model.snapshot().laserBurst;};
 const now=run(''),old=run('?alienLaserSeen=0');
 assert.ok(now.lit>1.9,`lit ${now.lit} s of 2 s`);assert.ok(now.hits>0);assert.equal(old.lit,0,'v24.8: held from before the bonus, the beam never lit');
});
test('v24.9: taking the bonus lights the beam for BURST.seconds even with no finger down',()=>{
 const model=column({bonus:true});for(let i=0;i<Math.round(4/step);i++)model.update(step,{});
 const s=model.snapshot().laserBurst;assert.ok(Math.abs(s.lit-BURST.seconds)<.1,`lit ${s.lit} s`);assert.ok(model.aliens.every(a=>a.hp<HP),'the column took the beam');
});
test('v24.9 token rule: wave 1 only (everyWaves 99), not while a token is out or the laser runs, again after a miss; it gives 8 s',()=>{
 const base={wave:1,waveClock:6,given:false,laserTime:0,pickups:0,aliens:5,time:6,retryAt:0};
 assert.equal(laserGiftDue(base),true);assert.equal(laserGiftDue({...base,waveClock:4}),false);assert.equal(laserGiftDue({...base,given:true}),false);
 assert.equal(laserGiftDue({...base,laserTime:3}),false);assert.equal(laserGiftDue({...base,pickups:1}),false);assert.equal(laserGiftDue({...base,aliens:0}),false);
 assert.equal(laserGiftDue({...base,wave:2,waveClock:30}),false);assert.equal(laserGiftDue({...base,wave:3,waveClock:30}),false,'wave 1 only as shipped');
 const two={...LASER_SEEN,everyWaves:2};assert.equal(laserGiftDue({...base,wave:3,waveClock:6,cfg:two}),false);assert.equal(laserGiftDue({...base,wave:3,waveClock:7,cfg:two}),true);assert.equal(laserGiftDue({...base,wave:2,waveClock:30,cfg:two}),false);
 assert.equal(laserGiftDue({...base,retryAt:9}),false);
 // a token nobody takes falls off the screen and comes again
 globalThis.location={search:''};const model=createAlienModel({config,balance:structuredClone(config.alienDefense),level:1,random:seededRandom(3),completion:'waves',roundChoices:false});
 for(let i=0;i<60*20&&!model.result;i++){model.player.x=20;for(const d of model.pickups)d.x=330;/* out of the magnet's reach */model.update(step,{});}
 assert.ok(model.snapshot().laserSeen.gifts>=2,`tokens ${model.snapshot().laserSeen.gifts}`);
});
test('v24.9 laser chip: the seconds left while the bonus runs, blinking at the end, hidden otherwise',()=>{
 assert.deepEqual(laserChipState({laserTime:0,time:3}),{visible:false,seconds:0,blink:false,beam:false});
 assert.deepEqual(laserChipState({laserTime:15.2,time:3,laserBurst:{left:1}}),{visible:true,seconds:16,blink:false,beam:true});
 assert.equal(laserChipState({laserTime:1.2,time:0}).blink,true);assert.equal(laserChipState({laserTime:1.2,time:.1}).seconds,2);
 const node=()=>({hidden:false,dataset:{},children:[],textContent:'',setAttribute(){},append(...n){this.children.push(...n);},remove(){this.removed=true;}});
 const made=[],doc={createElement:()=>{const n=node();made.push(n);return n;},createElementNS:()=>node()},dialog=node();
 const chip=createAlienLaserChip({dialog,documentTarget:doc}),root=made[0],count=made[1];assert.equal(root.className,'alien-laser-chip');assert.equal(root.hidden,true);
 chip.update({laserTime:12.4,time:1});assert.equal(root.hidden,false);assert.equal(count.textContent,'13');
 chip.update({laserTime:12.4,time:1},true);assert.equal(root.hidden,true,'hidden while paused');chip.update({laserTime:0,time:1});assert.equal(root.hidden,true);
 chip.dispose();assert.equal(root.removed,true);
});
test('v24.9 text: the notice is short, 1 s, and a hit on the ship has no text; ?alienText=old keeps the v24.8 line',()=>{
 const hit={id:1,kind:'player-hit',life:1.1,value:3},wave={id:2,kind:'wave',life:1.4,value:2},mag={id:3,kind:'refill',life:1.5};
 assert.equal(compactNotice(alienFlightFeedbackText(hit),'player-hit'),null);assert.equal(compactNotice(alienFlightFeedbackText(wave),'wave').text,'גל 2');
 assert.equal(compactNotice(alienFlightFeedbackText(mag),'refill').text,'מחסנית וולקן');assert.equal(compactNotice(alienFlightFeedbackText({id:4,kind:'ammo',life:1,value:1}),'ammo').text,'ברק שרשרת');
 assert.equal(COMPACT_NOTICE_SECONDS,1);
 const node=()=>({hidden:false,dataset:{},children:[],textContent:'',setAttribute(){},append(...n){this.children.push(...n);},remove(){}});
 const build=compact=>{const made=[],doc={createElement:()=>{const n=node();made.push(n);return n;}},hud=createAlienFlightHud({dialog:node(),controls:node(),documentTarget:doc,compact});return {hud,root:made[0],feedback:made.find(n=>n.className==='alien-flight-feedback')};};
 const model=(feedback,time)=>({feedback,time,upgrades:{},equipment:{},wings:[]}),input={active:false,device:'touch'};
 const now=build(true);assert.equal(now.root.dataset.text,'compact');
 now.hud.update(model(hit,0),input);assert.equal(now.feedback.hidden,true,'no text for a hit');
 now.hud.update(model(wave,5),input);assert.equal(now.feedback.hidden,false);now.hud.update(model(wave,5.9),input);assert.equal(now.feedback.hidden,false);now.hud.update(model(wave,6.05),input);assert.equal(now.feedback.hidden,true,'gone after 1 s');
 const old=build(false);assert.equal(old.root.dataset.text,undefined);old.hud.update(model(hit,0),input);assert.equal(old.feedback.hidden,false);old.hud.update(model(hit,1.3),input);assert.equal(old.feedback.hidden,false,'v24.8: at least 1.4 s');
});
test('v24.9 text wiring: no banner on a press, captions fade, boss plate is one bar; all behind alienTextCompact',async()=>{
 const read=f=>readFile(new URL('../workout/island/minigames/'+f,import.meta.url),'utf8'),session=await read('alien-session.mjs'),css=await read('alien.css'),feedback=await read('ultra-alien-feedback.mjs');
 assert.match(session,/if\(textCompact\)return;\/\* v24\.9: no banner on a press \*\//);assert.match(session,/const tutorial=textCompact \? null/);
 assert.match(session,/if\(hudV24\|\|textCompact\)\{const captions=/);assert.match(session,/createAlienLaserChip\(\{dialog\}\)/);
 assert.match(css,/\.alien-kid-demo\.alien-kid-demo\[data-text=compact\]\{display:none\}/);assert.match(css,/\[data-alien-text=compact\]\[data-alien-captions=off\][^{]*\{opacity:0!important\}/);assert.match(css,/\.alien-laser-chip\{/);
 assert.match(feedback,/if\(alienTextCompact\(\)\)\{inScreenPixels/);
});
test('v24.9: the new modules are in the offline shell',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
 for(const file of ['minigames/alien-v249.mjs','minigames/alien-v249-ui.mjs']){assert.ok(manifest.shell.includes(file),file);assert.ok(manifest.files[file],file);}
});
