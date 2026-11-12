// Final fix (Fable, 11/11/2026), aliens v15: steady cannon at about 5.6/s, Vulcan only in short bursts (taps too, 12/11), a hard cap at
// the spawn point that no gear, bonus or input path can exceed, stage 1 about 90-130 s. Pure model tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienV15Enabled,V15_DEFAULTS,v15Config,fireGate,fireInterval,shotDamage,createSpawnCap,v15RateCap,convergeVx} from '../workout/island/minigames/alien-v15.mjs';
import {createV15ShotAudio} from '../workout/island/minigames/alien-v15-audio.mjs';
import {alienMoveEnabled,MOVE_DEFAULTS,moveConfig,alienMoveStep,recoilOffset} from '../workout/island/minigames/alien-move.mjs';
import {moveAlienPlayer} from '../workout/island/minigames/g2m-motion.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {stage} from '../workout/island/verification/aliens-v14/sim.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,cfg=v15Config(balance);
const make=(o={},off=false,level=1)=>{globalThis.__alienV15=off?false:undefined;try{return createAlienModel({config,balance,level,random:seededRandom(3),completion:'waves',roundChoices:false,...o});}finally{globalThis.__alienV15=undefined;}};
const run=(m,s,input={},dt=1/60)=>{for(let i=0;i<Math.ceil(s/dt);i++)m.update(dt,input);};
const maxed={equipment:{weapon:2,rate:1.5,damage:1.8,shield:3},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:3},hangar:{rapid:20},power:1.45,bonuses:{fireRate:2}};

test('v15 flag: on by default, ?alienV15=0 and the global switch restore v14; config carries the numbers',()=>{
 assert.equal(alienV15Enabled('',undefined),true);assert.equal(alienV15Enabled('?alienV15=0',undefined),false);assert.equal(alienV15Enabled('',false),false);
 assert.ok(balance.v15&&balance.v15.normalInterval>=.15&&balance.v15.normalInterval<=.25&&balance.v15.burstSeconds<=1.5&&balance.v15.coolSeconds>=1.5);
 assert.deepEqual(Object.keys(v15Config({})).sort(),Object.keys(V15_DEFAULTS).sort());
});
test('v15 stage clock: 1.5x the v14 stage time, so fewer bullets never lose a round to the clock',()=>{
 const on=make(),off=make({},true);assert.equal(on.settings.seconds,Math.round(off.settings.seconds*cfg.secondsMult));assert.ok(on.settings.seconds>=240);
});
test('fireGate: burst for burstSeconds, forced cool for coolSeconds, then steady fire; a rest brings the burst back',()=>{
 let s={heat:0,cool:0,spent:false};const modes=[];
 for(let i=0;i<60*8;i++){s=fireGate(s,true,1/60,cfg);modes.push(s.mode);}
 const burst=modes.filter(m=>m==='burst').length/60,cool=modes.filter(m=>m==='cool').length/60,normal=modes.filter(m=>m==='normal').length/60;
 assert.ok(Math.abs(burst-cfg.burstSeconds)<.05,`burst ${burst}`);assert.ok(Math.abs(cool-cfg.coolSeconds)<.05,`cool ${cool}`);assert.ok(normal>4,`normal ${normal}`);
 assert.equal(modes.indexOf('cool'),modes.lastIndexOf('burst')+1,'cool starts right after the burst');assert.equal(modes.indexOf('normal'),modes.lastIndexOf('cool')+1,'steady fire right after the cool');
 assert.ok(s.heat>0&&s.heat<=cfg.warmHeat+1e-9,'the gauge stays warm while firing steadily');
 // The burst comes back after restSeconds plus the warm gauge's cool-down (about 1.5 s), not before.
 const back=cfg.restSeconds+cfg.warmHeat*cfg.rechargeSeconds;assert.ok(back>1.3&&back<1.7,`burst returns after ${back} s`);
 let early=s;for(let i=0;i<60*(back-.3);i++)early=fireGate(early,false,1/60,cfg);assert.equal(early.spent,true,'not before the rest is over');
 for(let i=0;i<60*back+3;i++)s=fireGate(s,false,1/60,cfg);assert.equal(s.spent,false);assert.equal(s.heat,0);
 s=fireGate(s,true,1/60,cfg);assert.equal(s.mode,'burst','after a rest the Vulcan bursts again');
 // 12/11/2026 (independent QA): taps must not keep the gauge cold. A short gap keeps the heat, a real rest cools it, and every
 // press heats it by at least one burst shot, so taps add up to one burst, the cool-down and steady fire, like a hold.
 const shortGap=fireGate({heat:.5,cool:0,spent:false},false,.3,cfg);assert.equal(shortGap.spent,false);assert.equal(shortGap.heat,.5,'a short gap keeps the heat');
 let rested={heat:.5,cool:0,spent:false};for(let i=0;i<60*(cfg.restSeconds+.3);i++)rested=fireGate(rested,false,1/60,cfg);assert.ok(rested.heat<.5&&rested.heat>0,'a real rest cools the gauge');
 const taps=(on,off,seconds,c=cfg)=>{let g={},t=0,overheat=null;for(let f=0;f<seconds*60;f++){g=fireGate(g,(t*1000)%(on+off)<on,1/60,c);if(g.overheat&&overheat===null)overheat=t;t+=1/60;}return {g,overheat};};
 for(const [on,off] of [[40,60],[64,96],[112,192]]){const {g,overheat}=taps(on,off,8);assert.ok(overheat!==null&&overheat<4.5,`taps ${on}/${off} ms overheat into the cool-down (${overheat})`);assert.equal(g.spent,true,`taps ${on}/${off} ms then fire steadily`);}
 const firstGate=v15Config(balance,'?alienTaps=v15');assert.equal(firstGate.restSeconds,0);assert.equal(firstGate.pressShots,0);assert.equal(taps(40,60,8,firstGate).overheat,null,'?alienTaps=v15: the first v15 gate, where fast taps never overheat');
});
test('fireInterval and shotDamage: floors hold for any gear, rapid bonus has its own floor, burst is the only fast mode',()=>{
 assert.equal(fireInterval('normal',1,false,cfg),cfg.normalInterval);
 assert.equal(fireInterval('normal',1e6,false,cfg),cfg.minInterval);assert.equal(fireInterval('normal',1e6,true,cfg),cfg.rapidMinInterval);
 assert.equal(fireInterval('normal',.2,false,cfg),cfg.normalInterval,'weak gear never slows below the base');
 assert.equal(fireInterval('burst',1e6,true,cfg),cfg.burstInterval);
 assert.ok(1/cfg.normalInterval>=4.5&&1/cfg.normalInterval<=6.5,'normal fire is about 5-6 shots per second (Roy, 11/11 evening)');assert.ok(1/cfg.minInterval<=6.5,'gear floor stays at or under 6.5/s');
 assert.ok(shotDamage('normal',cfg)>shotDamage('burst',cfg));assert.equal(v15RateCap(cfg),cfg.normalInterval/cfg.minInterval);
});
test('createSpawnCap: a token bucket bounds projectiles per second whatever the demand',()=>{
 const cap=createSpawnCap(cfg);let ok=0;for(let f=0;f<600;f++){const t=f/60;for(let k=0;k<10;k++)if(cap.allow(t))ok++;}
 assert.ok(ok<=cfg.capPerSecond*10+cfg.capBurst,`${ok} in 10 s`);assert.ok(ok>=cfg.capPerSecond*10-1);assert.ok(cap.dropped>0);
 const slow=createSpawnCap(cfg);let passed=0;for(let f=0;f<240;f++)if(slow.allow(f/4))passed++;assert.equal(passed,240,'4 per second always passes');
});
test('model, fresh save, real input shape: 6 s hold = one burst, one cool-down, then a steady 5-6/s; v14 fired far more',()=>{
 const m=make();const marks=[];for(let i=0;i<60*6;i++){m.update(1/60,{moveX:0,firing:true,nova:false,flight:true});marks.push(m.snapshot().fired);}
 const s=m.snapshot();assert.equal(s.v15,true);assert.equal(s.overheats,1);
 const steady=(marks[359]-marks[239])/2;assert.ok(steady>=1/cfg.normalInterval*.85&&steady<=1/cfg.normalInterval*1.1,`steady ${steady}/s`);
 assert.ok(s.burstShots>=10&&s.burstShots<=13,`burst shots ${s.burstShots}`);assert.ok(s.fired/6<=6.5,`overall ${s.fired/6}/s`);
 const old=make({},true);run(old,6,{firing:true});assert.ok(old.snapshot().fired>=s.fired*1.5,`v14 ${old.snapshot().fired} vs v15 ${s.fired}`);
 const idle=make();run(idle,4,{});assert.equal(idle.snapshot().fired,0);
});
test('model, every multiplier maxed (equipment, upgrades, hangar 20, power 1.45, fireRate bonus, rapid pickup, spread, wings): the cap holds',()=>{
 const m=make(maxed);m.pickups.push({kind:2,x:m.player.x,y:m.player.y,vy:0});m.update(1/60,{});m.pickups.push({kind:0,x:m.player.x,y:m.player.y,vy:0});m.update(1/60,{});m.pickups.push({kind:4,x:m.player.x,y:m.player.y,vy:0});m.update(1/60,{});
 assert.equal(m.powerup,2);assert.ok(m.spreadTime>0);assert.ok(m.wingTime>0);
 const a=m.snapshot();run(m,.5,{firing:true});assert.ok(m.wings.filter(w=>w.active).length>=1,'wings are active in this profile');run(m,9.5,{firing:true});const b=m.snapshot();
 const rounds=(b.steadyShots+b.burstShots)-(a.steadyShots+a.burstShots),projectiles=b.fired-a.fired;
 const maxRounds=cfg.burstSeconds/cfg.burstInterval+(10-cfg.burstSeconds-cfg.coolSeconds)/cfg.rapidMinInterval+2;
 assert.ok(rounds<=maxRounds,`trigger pulls ${rounds} > ${maxRounds}`);
 assert.ok(projectiles<=cfg.capPerSecond*10+cfg.capBurst,`projectiles ${projectiles}`);assert.ok(b.capDropped>0,'the spawn cap actually dropped something under this load');
});
test('model: keyboard-style and touch-style inputs reach the same gate (same fired count)',()=>{
 const a=make(),b=make();run(a,5,{moveX:0,firing:true});run(b,5,{moveX:0,firing:true,flight:true,x:a.player.x});assert.equal(a.snapshot().fired,b.snapshot().fired);
});
test('model: a burst sounds like the Vulcan (shot), steady fire is a single-shot sound (shotSingle); the ship only shakes in a burst',()=>{
 const events=[];const m=make({sound:e=>events.push(e)});
 run(m,.6,{firing:true});assert.ok(events.includes('shot')&&!events.includes('shotSingle'));assert.equal(m.firing,true);
 run(m,cfg.burstSeconds+cfg.coolSeconds+.5,{firing:true});events.length=0;run(m,1,{firing:true});
 assert.ok(events.filter(e=>e==='shotSingle').length>=3&&!events.includes('shot'),JSON.stringify(events));assert.equal(m.firing,false,'no Vulcan spin for steady shots');
});
const PHONE=(844/390)/(360/480);
/** Headless bot at the phone aspect (hit test stretched 2.9x like 844x390): steers under the lowest alien, dodges, holds fire. */
const playPhone=(seed,profile={},level=1)=>{const m=make({random:seededRandom(seed),level,...profile});m.effectAspect=PHONE;
 for(let f=0;f<30*400&&!m.result;f++){const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>14);if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
  m.update(1/30,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),firing:true});}
 return {seconds:+m.time.toFixed(1),outcome:m.result?.outcome||'timeout',fired:m.snapshot().fired,shotsPerSec:+(m.snapshot().fired/m.time).toFixed(2)};};
test('stage 1 at the phone aspect lasts 85-135 s and is won for base, upgraded and heavy gear (headless bot holding fire)',()=>{
 const profiles=[{},{equipment:{weapon:1,rate:1.15,damage:1.25,shield:1}},{equipment:{weapon:2,rate:1.5,damage:1.8,shield:3},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:3},hangar:{rapid:20},power:1.45}];
 for(const profile of profiles){const rs=[1,2,3].map(s=>playPhone(s,profile)),avg=rs.reduce((n,r)=>n+r.seconds,0)/rs.length;assert.ok(avg>=85&&avg<=135,`avg ${avg} for ${JSON.stringify(profile)} ${JSON.stringify(rs)}`);assert.ok(rs.every(r=>r.outcome==='win'),JSON.stringify(rs));assert.ok(rs.every(r=>r.shotsPerSec<=8),rs.map(r=>r.shotsPerSec).join());}
 const old=stage(1,1,{});assert.ok(old.fired>0,'the aspect-1 sim still runs');
});
test('v15 cannon convergence: at the phone aspect (844x390) straight wing shots miss an alien centred on the ship, converging shots hit it',()=>{
 const phone=(844/390)/(360/480);
 const hitsOf=off=>{const m=make({},off);m.effectAspect=phone;const a=m.aliens[0];for(const o of m.aliens)o.entry=0;a.x=a.baseX=m.player.x;a.y=a.baseY=a.originY=110;a.hp=a.maxHp=1000;a.shield=0;m.aliens.splice(1);run(m,3,{firing:true});const s=m.snapshot();return {fired:s.fired,hits:s.hits};};
 const straight=hitsOf(true),converging=hitsOf(false);
 assert.ok(straight.hits<=straight.fired*.1,`v14 straight shots from the wings: ${straight.hits}/${straight.fired} hits`);
 assert.ok(converging.hits>=converging.fired*.8,`v15 converging shots: ${converging.hits}/${converging.fired} hits`);
 assert.ok(Math.abs(convergeVx(1,11.3,460,cfg))>0&&convergeVx(1,11.3,460,cfg)<0&&convergeVx(-1,11.3,460,cfg)>0);
});
test('v15 single-shot audio: plays the boar rifle layers on its own context, respects the island mute key',()=>{
 const made=[];class FakeContext{constructor(){this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}createGain(){const g={gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};return g;}createBuffer(c,l){return {getChannelData(){return new Float32Array(l);}};}createBufferSource(){const s={buffer:null,playbackRate:{value:1},connect(){},start(){made.push('noise');},stop(){}};return s;}createBiquadFilter(){return {type:'',Q:{value:0},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}createOscillator(){return {type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){made.push('tone');},stop(){}};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const store=new Map(),storage={getItem:k=>store.get(k)??null};
 const a=createV15ShotAudio({storage,AudioContext:FakeContext});assert.equal(a.play(),true);assert.ok(made.includes('noise')&&made.includes('tone'));assert.equal(a.play(),false,'minimum gap between shots');
 store.set('island.sound','off');const b=createV15ShotAudio({storage,AudioContext:FakeContext});assert.equal(b.play(),false);
 a.setPaused(true);assert.equal(a.play(),false);a.dispose();
 const none=createV15ShotAudio({storage:{getItem:()=>null},AudioContext:undefined});assert.equal(none.play(),false);
});

const mcfg=moveConfig(balance);
test('alienMove flag: on by default, ?alienMove=v20 and the global switch restore the v20 step; config carries the numbers',()=>{
 assert.equal(alienMoveEnabled('',undefined),true);assert.equal(alienMoveEnabled('?alienMove=v20',undefined),false);assert.equal(alienMoveEnabled('',false),false);
 assert.deepEqual(Object.keys(mcfg).sort(),Object.keys(MOVE_DEFAULTS).sort());assert.ok(mcfg.maxSpeed>balance.playerSpeed);
 const on=make(),off=make();globalThis.__alienMove=false;const legacy=make();globalThis.__alienMove=undefined;assert.equal(on.moveV15,true);assert.equal(legacy.moveV15,false);void off;
});
test('alienMove: eases to full speed in about 0.25 s, leans with the velocity, glides after release, never jumps',()=>{
 const b={playerRadius:balance.playerRadius},p={x:180,vx:0,bank:0,recoil:0};let t=0,t90=null,maxStep=0,peakBank=0;
 for(let i=0;i<60;i++){const x0=p.x;alienMoveStep(p,{moveX:1,flight:true},1/60,b,360,mcfg);t+=1/60;maxStep=Math.max(maxStep,Math.abs(p.x-x0));peakBank=Math.max(peakBank,Math.abs(p.bank));if(t90===null&&p.vx>=.9*mcfg.maxSpeed)t90=t;}
 assert.ok(t90!==null&&t90>=.12&&t90<=.35,`90% of top speed after ${t90} s`);assert.ok(maxStep<=mcfg.maxSpeed/60+.01,'no jumps: a frame never moves more than top speed allows');assert.ok(peakBank>=.8,`lean ${peakBank}`);
 const q={x:100,vx:mcfg.maxSpeed,bank:1,recoil:0};let glide=0;for(let i=0;i<60;i++){const x0=q.x;alienMoveStep(q,{},1/60,b,360,mcfg);glide+=q.x-x0;}
 assert.ok(glide>8&&glide<30,`glide ${glide}: some inertia, but under half an alien column (46 units) so a released ship stays under its target`);assert.equal(q.vx,0);assert.ok(Math.abs(q.bank)<.05,'the lean settles when the ship stops');
 // v20 for comparison: a 0.15 s linear ramp to a constant velocity, no glide after release.
 const o={x:180,vx:0,bank:0};for(let i=0;i<60;i++)moveAlienPlayer(o,{moveX:1,flight:true},1/60,balance,360);const ox=o.x;moveAlienPlayer(o,{},1/60,balance,360);assert.equal(o.vx,0);assert.equal(o.x,ox,'v20 stops dead');
});
test('alienMove: a drag target is reached smoothly (critically damped, no overshoot beyond a few units) and bounds hold',()=>{
 const b={playerRadius:balance.playerRadius},p={x:100,vx:0,bank:0,recoil:0};let over=0;for(let i=0;i<90;i++){alienMoveStep(p,{x:220,flight:true},1/60,b,360,mcfg);over=Math.max(over,p.x-220);}
 assert.ok(Math.abs(p.x-220)<.5,`reached ${p.x}`);assert.ok(over<4,`overshoot ${over}`);
 const w={x:300,vx:0,bank:0,recoil:0};for(let i=0;i<120;i++)alienMoveStep(w,{moveX:1},1/60,b,360,mcfg);assert.equal(w.x,360-balance.playerRadius);assert.equal(w.vx,0);
});
test('alienMove: recoil nudges the drawn ship on each steady shot and decays; the hit model is untouched',()=>{
 const m=make();run(m,cfg.burstSeconds+cfg.coolSeconds+.4,{firing:true});
 let seen=0;for(let i=0;i<60;i++){m.update(1/60,{firing:true});if(m.recoilOffset>1)seen++;}assert.ok(seen>5,'recoil visible on steady shots');
 run(m,1,{});assert.equal(m.recoilOffset,0);assert.equal(recoilOffset({recoil:1},mcfg),mcfg.recoilPixels);
 const a=make(),bb=make();globalThis.__alienMove=false;const legacy=make();globalThis.__alienMove=undefined;assert.equal(a.aliens[0].radius,legacy.aliens[0].radius);assert.equal(a.player.y,legacy.player.y);void bb;
});
