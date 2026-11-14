// Aliens v25 (14/11/2026), Roy after v24 on the phone: "the Vulcan fire is not that good. It should last longer, and cool down before it
// reaches the end too, I mean if you do not fire it, it cools. And in any case the fire should be more massive when you fire it, compared to
// the regular one." v25 on the v23 gate: 3.6 s of continuous fire to the lock (v24: 1.2 s), the gauge drains 0.15 s after the button comes
// up (v24: 0.5 s) and a full one empties in 1.6 s (v24: 2 s), 15 bullets per second (v24: 10) at 1.35x the cannon's damage per second, each
// bullet drawn as three plasma pellets with muzzle flashes, impacts, lock steam and the Codex rotary loop. ?alienVulcan=v24 restores v24.
// Pure model (headless, the model's own clock), drawing on a recording canvas, audio on a fake context, data and wiring. The phone path
// (CDP touch at 844x390, before/after) is workout/island/tests/tennis-aliens-v24-1-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienVulcanV25Enabled,V25_DEFAULTS,v25Config,pelletOffsets,vulcanFireSeconds,vulcanCoolSeconds,vulcanDps} from '../workout/island/minigames/alien-v25.mjs';
import {drawV25Shot,drawV25Fx} from '../workout/island/minigames/alien-v25-draw.mjs';
import {createAlienV25Audio,ALIEN_V25_AUDIO} from '../workout/island/minigames/alien-v25-audio.mjs';
import {drawV14Heat} from '../workout/island/minigames/alien-v14-draw.mjs';
import {v23Config} from '../workout/island/minigames/alien-v23.mjs';
import {v15Config} from '../workout/island/minigames/alien-v15.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames,balance=config.alienDefense,cfg=v25Config(balance),c23=v23Config(balance),c15=v15Config(balance);
const FRAME=1/60,PHONE=(844/390)/(360/480);
/** The model under a Vulcan mode ('v25' default, 'v24' = ?alienVulcan=v24); refill magazines on as shipped unless refill=false. */
function make({vulcan='v25',refill=true,level=1,seed=3,...rest}={}){globalThis.__alienVulcan=vulcan==='v24'?'v24':undefined;globalThis.__alienRefill=refill?undefined:'0';try{return createAlienModel({config,balance,level,random:seededRandom(seed),completion:'waves',roundChoices:false,...rest});}finally{globalThis.__alienVulcan=undefined;globalThis.__alienRefill=undefined;}}
const run=(m,s,input={})=>{for(let i=0;i<Math.round(s/FRAME);i++)m.update(FRAME,typeof input==='function'?input(m,i):input);};
function lockAfter(m){let t=0;for(let i=0;i<60*8;i++){m.update(FRAME,{vulcan:true});t+=FRAME;if(m.vulcanLocked)return t;}return null;}
function cooling(m,releaseAt){while(m.vulcanHeat<releaseAt)m.update(FRAME,{vulcan:true});const h0=m.vulcanHeat;let t=0,first=null,empty=null;for(let i=0;i<60*6&&empty===null;i++){m.update(FRAME,{});t+=FRAME;if(first===null&&m.vulcanHeat<h0-1e-9)first=t;if(m.vulcanHeat<.01)empty=t;}return {h0,first,empty,locked:m.vulcanLocked};}
/** Damage per second from the model's own counters (shots are pooled objects, so they are counted, not collected); per-bullet damage is checked on live shots. */
function damagePerSecond(m,input,seconds){run(m,seconds,input);const s=m.snapshot(),c=m.v25?cfg:c23;return ((s.vulcanFired||0)*c.vulcanDamage+(s.regularFired||0)*c23.regularDamage)/seconds;}
function playPhone(seed,hold,vulcan='v25'){const m=make({seed,vulcan});m.effectAspect=PHONE;
 for(let f=0;f<30*400&&!m.result;f++){const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>14);if(!safe(want)){out:for(let d=0;d<=360;d+=3)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>18&&x<342&&safe(x)){want=x;break out;}}}
  m.update(1/30,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),...hold});}
 return {seconds:+m.time.toFixed(1),win:m.result?.outcome==='win'};}
/** A canvas that records what was drawn. */
function recorder(){const calls=[];const p=new Proxy({canvas:{clientWidth:844,clientHeight:390,width:844},calls},{get(t,k){if(k in t)return t[k];if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...a)=>{calls.push([k,...a]);};},set(t,k,v){t[k]=v;calls.push(['set:'+String(k),v]);return true;}});return p;}

test('v25 flag: on by default, ?alienVulcan=v24 and the global switch restore v24; config carries the numbers; built on the two-button fire',()=>{
 assert.equal(alienVulcanV25Enabled('',undefined),true);assert.equal(alienVulcanV25Enabled('?alienVulcan=v24',undefined),false);assert.equal(alienVulcanV25Enabled('','v24'),false);assert.equal(alienVulcanV25Enabled('?alienVulcan=v25',undefined),true);
 assert.ok(balance.v25,'config.json alienDefense.v25');for(const k of Object.keys(V25_DEFAULTS))assert.ok(k in balance.v25,`config key ${k}`);
 assert.equal(make().v25,true);assert.equal(make({vulcan:'v24'}).v25,false);
 globalThis.__alienFire='v15';try{assert.equal(createAlienModel({config,balance,level:1,random:seededRandom(3)}).v25,false,'?alienFire=v15 (one button) has no Vulcan to change');}finally{globalThis.__alienFire=undefined;}
 assert.equal(cfg.lockSeconds,c23.lockSeconds,'the lock stays 2 s');assert.equal(cfg.regularDamage,c23.regularDamage,'the steady cannon is untouched');
});

test('longer: continuous Vulcan fire lasts 3.6 s to the lock (v24: 1.2 s), still green, yellow, red, then the same 2 s lock and open again',()=>{
 const v25=make(),v24=make({vulcan:'v24'}),t25=lockAfter(v25),t24=lockAfter(v24);
 assert.ok(Math.abs(t25-vulcanFireSeconds(cfg))<=.12,`v25 locks after ${t25.toFixed(2)} s`);assert.ok(Math.abs(t24-1.2)<=.12,`v24 locked after ${t24.toFixed(2)} s`);
 assert.ok(t25>=3*t24-.2,`3x longer: ${t25.toFixed(2)} s vs ${t24.toFixed(2)} s`);assert.equal(v25.snapshot().vulcanFired,cfg.heatShots,'the gauge counts Vulcan bullets');
 let locked=0;while(v25.vulcanLocked){v25.update(FRAME,{vulcan:true});locked+=FRAME;}assert.ok(Math.abs(locked-cfg.lockSeconds)<=2*FRAME,`locked ${locked.toFixed(2)} s`);
 const vf=v25.snapshot().vulcanFired;run(v25,.5,{vulcan:true});assert.ok(v25.snapshot().vulcanFired>vf,'it opens again and fires');
});

test('cools whenever it is not firing: 0.15 s after the button comes up the gauge drains (v24: 0.5 s), and faster than it fills; no lock if you let go in time',()=>{
 for(const at of [.3,.6,.9]){
  const a=cooling(make(),at),b=cooling(make({vulcan:'v24'}),at);
  assert.ok(a.first<=cfg.restSeconds+2*FRAME,`v25 from ${at}: starts cooling after ${a.first.toFixed(2)} s`);assert.ok(b.first>=c23.restSeconds,`v24 from ${at}: waited ${b.first.toFixed(2)} s`);
  assert.ok(a.empty<=vulcanCoolSeconds(cfg,a.h0)+.05,`v25 from ${at}: empty after ${a.empty.toFixed(2)} s`);assert.ok(a.empty<b.empty,`v25 ${a.empty.toFixed(2)} s < v24 ${b.empty.toFixed(2)} s`);assert.equal(a.locked,false);
 }
 assert.ok(cfg.coolSeconds/1<vulcanFireSeconds(cfg),'a full gauge empties faster (1.6 s) than it fills (3.6 s)');
 // Fire 2 s, rest 1 s, again and again: it never locks (the child who lets go in time keeps the Vulcan), and the heat never rises while idle.
 const m=make();let peak=0,idleRise=false,prev=0;for(let c=0;c<6;c++){run(m,2,{vulcan:true});peak=Math.max(peak,m.vulcanHeat);prev=m.vulcanHeat;for(let i=0;i<60;i++){m.update(FRAME,{});if(m.vulcanHeat>prev+1e-12)idleRise=true;prev=m.vulcanHeat;}}
 assert.equal(m.snapshot().overheats,0,'2 s on, 1 s off never locks');assert.ok(peak<.9&&peak>.4,`peak ${peak.toFixed(2)}`);assert.equal(idleRise,false);
 // Quick taps (40 ms on, 60 ms off) cannot keep it cold: the gap is shorter than the rest, so the gauge still fills.
 const taps=make();for(let i=0;i<60*6;i++)taps.update(FRAME,{vulcan:(i*FRAME*1000)%100<40});assert.ok(taps.vulcanHeat>.2||taps.snapshot().overheats>0,`taps heat ${taps.vulcanHeat.toFixed(2)}`);
});

test('massive: 15 Vulcan bullets per second (v24: 10), 1.35x the steady cannon\'s damage per second (v24: 1.0x); with both buttons the cannon keeps its rate inside the stream',()=>{
 const v25=make(),v24=make({vulcan:'v24'});run(v25,1,{vulcan:true});run(v24,1,{vulcan:true});
 const r25=v25.snapshot().vulcanFired,r24=v24.snapshot().vulcanFired;assert.ok(r25>=14&&r25<=16,`v25 ${r25}/s`);assert.ok(r24>=9&&r24<=11,`v24 ${r24}/s`);
 const d25=damagePerSecond(make(),{vulcan:true},2),d24=damagePerSecond(make({vulcan:'v24'}),{vulcan:true},1),reg=damagePerSecond(make(),{firing:true},3);
 assert.ok(d25>=1.25*reg,`v25 Vulcan ${d25.toFixed(2)}/s vs cannon ${reg.toFixed(2)}/s`);assert.ok(d24<=1.05*reg,`v24 Vulcan ${d24.toFixed(2)}/s`);assert.ok(Math.abs(vulcanDps(cfg)-6)<.01);
 const both=make();run(both,3,{firing:true,vulcan:true});const s=both.snapshot();assert.ok(s.regularFired>=16&&s.regularFired<=18,`cannon in the stream: ${s.regularFired} in 3 s`);
 assert.ok(s.regularFired+s.vulcanFired<=3*15+1,`stream ${s.regularFired+s.vulcanFired} in 3 s (15/s max)`);assert.ok(s.vulcanFired>=24,'the Vulcan fills the rest of the stream');
 for(const shot of both.shots.filter(x=>x.vulcan))assert.equal(shot.damage,cfg.vulcanDamage);
});

test('bounded: own spawn cap for Vulcan bullets, the fan bonus and the wings join one Vulcan tick in three; every multiplier maxed stays under both caps',()=>{
 const maxed={equipment:{weapon:2,rate:1.5,damage:1.8,shield:3},permanentUpgrades:{damage:3,rapid:3,laser:3,wing:3,shield:3},hangar:{rapid:20},power:1.45,bonuses:{fireRate:2}};
 const m=make({...maxed,refill:false});m.pickups.push({kind:2,x:m.player.x,y:m.player.y,vy:0});m.update(FRAME,{});m.pickups.push({kind:0,x:m.player.x,y:m.player.y,vy:0});m.update(FRAME,{});m.pickups.push({kind:4,x:m.player.x,y:m.player.y,vy:0});m.update(FRAME,{});
 assert.ok(m.spreadTime>0&&m.wingTime>0);const a=m.snapshot();run(m,3,{firing:true,vulcan:true});const b=m.snapshot(),projectiles=b.fired-a.fired;
 assert.ok(projectiles<=(c15.capPerSecond+cfg.capPerSecond)*3+c15.capBurst+cfg.capBurst,`${projectiles} projectiles in 3 s`);
 const one=make({refill:false});one.pickups.push({kind:0,x:one.player.x,y:one.player.y,vy:0});one.update(FRAME,{});const f0=one.snapshot().fired;run(one,1,{vulcan:true});const per=(one.snapshot().fired-f0);
 assert.ok(per<=15+Math.ceil(15/cfg.wingEvery)*2+2,`fan bonus with the Vulcan: ${per} projectiles in 1 s (not 3 per tick)`);
});

test('the pellets, muzzle flashes, impacts and lock steam are drawn from model state only; v24 draws none of them',()=>{
 assert.deepEqual(pelletOffsets(0,cfg).map(v=>Math.round(v*10)/10),[-3,0,3]);const far=pelletOffsets(300,cfg);assert.ok(far[2]-far[0]>16,'the stream fans with distance');
 const m=make();run(m,.4,{vulcan:true});const shot=m.shots.find(s=>s.vulcan);assert.ok(shot);
 const p=recorder();assert.equal(drawV25Shot(p,shot,m,PHONE,1),3,'three pellets per bullet');assert.ok(p.calls.some(c=>c[0]==='set:globalCompositeOperation'&&c[1]==='lighter'));
 const fx=recorder();assert.ok(drawV25Fx(fx,m,PHONE,1)>=2,'a muzzle flash on each barrel while firing');
 // A Vulcan bullet that hits records an impact where it struck.
 const h=make({refill:false});for(const a of h.aliens)a.entry=0;const target=h.aliens[0];target.x=target.baseX=h.player.x;target.hp=target.maxHp=500;target.shield=0;h.aliens.splice(1);h.effectAspect=PHONE;run(h,1.5,{vulcan:true});
 assert.ok(h.vulcanImpacts.length>0,'impacts recorded');const imp=recorder();assert.ok(drawV25Fx(imp,{...h,time:h.vulcanImpacts.at(-1).at+.05,vulcanOn:false},PHONE,1)>=1,'an impact burst is drawn');
 const lock=make();lockAfter(lock);const steam=recorder();assert.ok(drawV25Fx(steam,{...lock,time:lock.vulcanLockAt+.1,vulcanOn:false},PHONE,1)>=2,'steam from both barrels after the lock');
 const old=make({vulcan:'v24'});run(old,.4,{vulcan:true});assert.equal(drawV25Fx(recorder(),old,PHONE,1),0);assert.equal(old.vulcanImpacts,undefined);
 // Both render paths reach it: drawV14Heat (called after the cannons in the canvas and the overlay paths) draws the v25 effects.
 const via=recorder();drawV14Heat(via,m,PHONE,1);assert.ok(via.calls.filter(c=>c[0]==='drawImage'||c[0]==='arc').length>=2);
});

test('balance at the phone aspect (headless bot): stage 1 with both buttons is still a real stage (65-100 s, v24 about 90 s), the regular button alone is unchanged, the Vulcan alone now wins',()=>{
 const seeds=[1,2,3],avg=rs=>rs.reduce((n,r)=>n+r.seconds,0)/rs.length;
 const both=seeds.map(s=>playPhone(s,{firing:true,vulcan:true})),reg=seeds.map(s=>playPhone(s,{firing:true})),regOld=seeds.map(s=>playPhone(s,{firing:true},'v24')),vul=seeds.map(s=>playPhone(s,{vulcan:true})),vulOld=seeds.map(s=>playPhone(s,{vulcan:true},'v24'));
 assert.ok(both.every(r=>r.win),JSON.stringify(both));assert.ok(avg(both)>=65&&avg(both)<=100,`both buttons ${avg(both).toFixed(1)} s`);
 assert.deepEqual(reg,regOld,'the regular button alone plays exactly as in v24');
 assert.ok(vul.filter(r=>r.win).length>=vulOld.filter(r=>r.win).length&&avg(vul)<avg(vulOld),`Vulcan alone: v24 ${avg(vulOld).toFixed(0)} s, v25 ${avg(vul).toFixed(0)} s`);
});

test('?alienVulcan=v24 is v24: the v23 gate numbers, no v25 fields, same snapshot as before for the same inputs',()=>{
 const m=make({vulcan:'v24'});assert.equal(m.vulcanCfg,undefined);const t=lockAfter(m);assert.ok(Math.abs(t-c23.heatShots*c23.vulcanInterval)<=.12);
 const s=m.snapshot();assert.equal('v25' in s,false);assert.equal(s.vulcanFired,c23.heatShots);
 const a=make({vulcan:'v24',refill:false}),b=make({vulcan:'v24',refill:false});run(a,8,(mm,i)=>({firing:true,vulcan:i%90<50}));run(b,8,(mm,i)=>({firing:true,vulcan:i%90<50}));
 const strip=x=>JSON.stringify({...x,aliens:x.aliens.length,shots:x.shots.length});assert.equal(strip(a.snapshot()),strip(b.snapshot()),'deterministic');
});

test('v25 sound: the rotary loop follows vulcanOn (spin-up, loop, spin-down), the lock plays the clutch and the air release, OGG then MP3, mute holds',async()=>{
 const started=[],stopped=[];class Ctx{constructor(){this.state='running';this.destination={};this.currentTime=0;}createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},connect(){},disconnect(){}};}
  createBufferSource(){const n={buffer:null,loop:false,connect(){},disconnect(){},start(){started.push(n.buffer.name+(n.loop?':loop':''));},stop(){stopped.push(n.buffer.name);},set onended(f){}};return n;}decodeAudioData(b){if(b.ogg&&!globalThis.__decodeOgg)return Promise.reject(Error('no ogg'));return Promise.resolve({name:b.name,duration:1.5});}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const fetched=[];const fetcher=async url=>{const u=String(url);fetched.push(u);const name=u.match(/alien-v25\/([\w-]+)\.(ogg|mp3)/);return {ok:true,arrayBuffer:async()=>({name:name[1],ogg:name[2]==='ogg'})};};
 const a=createAlienV25Audio({storage:{getItem:()=>null},AudioContext:Ctx,fetch:fetcher});a.unlock();await new Promise(r=>setTimeout(r,10));
 for(const name of ALIEN_V25_AUDIO){assert.ok(fetched.some(u=>u.includes(`alien-v25/${name}.ogg`)),`${name}.ogg tried`);assert.ok(fetched.some(u=>u.includes(`alien-v25/${name}.mp3`)),`${name}.mp3 after the OGG failed`);}
 assert.equal(a.ready,true);a.update({vulcanOn:true});assert.ok(started.includes('fire-loop:loop')&&started.includes('spin-up'));a.update({vulcanOn:true});assert.equal(started.filter(n=>n==='fire-loop:loop').length,1,'one loop while held');
 a.update({vulcanOn:false});assert.ok(stopped.includes('fire-loop')&&started.includes('spin-down'));
 a.update({vulcanOn:true});started.length=0;assert.equal(a.play('overheat'),true);assert.ok(started.includes('overheat')&&started.includes('cooldown'));assert.equal(a.play('shot'),false);
 const muted=createAlienV25Audio({storage:{getItem:k=>k==='island.sound'?'off':null},AudioContext:Ctx,fetch:fetcher});muted.unlock();await new Promise(r=>setTimeout(r,10));started.length=0;muted.update({vulcanOn:true});assert.equal(started.length,0,'island mute');
 a.dispose();muted.dispose();
});

test('wiring and offline: the session preloads the plasma, hands the Vulcan stream to the loop once it is decoded, the assets are listed and licensed',async()=>{
 const session=await read('../workout/island/minigames/alien-session.mjs');
 assert.match(session,/if\(model\.v25\)\{v25Audio=createAlienV25Audio\(\);preloadAlienV25\(\);\}/);assert.match(session,/event==='shot'&&v25Audio\?\.ready\)return/);assert.match(session,/event==='overheat'&&v25Audio/);assert.match(session,/v25Audio\?\.update\(model\)/);assert.match(session,/v25Audio\?\.dispose\(\)/);
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));
 for(const f of ['minigames/alien-v25.mjs','minigames/alien-v25-draw.mjs','minigames/alien-v25-audio.mjs'])assert.ok(manifest.shell.includes(f),f);
 for(const f of ['plasma-256.png','muzzle-256.png','impact-256.png','steam-256.png','fire-loop.ogg','fire-loop.mp3','spin-up.ogg','spin-down.ogg','overheat.ogg','cooldown.ogg'])assert.ok(manifest.games.alien.includes('assets/alien-v25/'+f),f);
 const licenses=await read('../workout/island/assets/alien-v25/LICENSES.md');assert.match(licenses,/aliens-vulcan-v2/);assert.match(licenses,/CC0/);
});
