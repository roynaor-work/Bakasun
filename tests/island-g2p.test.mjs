import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {drawAlienEffects,rocketPoint} from '../workout/island/minigames/g2m-effects.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createG2mAudio} from '../workout/island/minigames/g2m-audio.mjs';
const root=new URL('../workout/island/',import.meta.url),config=JSON.parse(await readFile(new URL('data/config.json',root))).minigames,b=config.alienDefense;
const make=(level=1,balance=b)=>createAlienModel({config,balance,level,random:seededRandom(3),roundChoices:false,completion:'waves'});
const advance=(m,seconds,input={})=>{for(let t=0;t<seconds-1e-8&&!m.result;t+=.01)m.update(.01,input);};
test('G2p idle and flying effects never draw a target, dashed ring or crosshair',()=>{
 const m=make(),calls=[];const p=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>calls.push([key,...args]),set:()=>true});
 drawAlienEffects(p,m,b);assert.deepEqual(calls.map(c=>c[0]),['save','restore']);
 m.update(.01,{nova:true});assert.equal(m.nova.x,m.player.x);assert.equal(m.nova.y,m.player.y);assert.equal(m.nova.aim,undefined);assert.equal(m.snapshot().novaAim,undefined);
 drawAlienEffects(p,m,b);assert.ok(!calls.some(c=>['setLineDash','stroke'].includes(c[0])));
 const q=rocketPoint(m.nova,b,.5);assert.equal(q.x,m.player.x);assert.equal(q.y,(m.player.y+m.nova.stopY)/2);assert.equal(q.angle,0);
});
test('G2p swept missile hits the first alien on its straight path even when array order is reversed',()=>{
 for(const reverse of [false,true])for(const dt of [.001,.04]){
  const m=make(),[near,far]=m.aliens;m.aliens.splice(2);
  Object.assign(near,{x:m.player.x,y:330,baseX:m.player.x,baseY:330,entry:0});
  Object.assign(far,{x:m.player.x,y:250,baseX:m.player.x,baseY:250,entry:0});if(reverse)m.aliens.reverse();
  m.update(dt,{nova:true});const origin=m.nova.x;
  for(let i=0;i<1000&&m.nova.flight>0;i++){m.update(dt,{moveX:1});assert.equal(m.nova.x,origin);}
  assert.equal(m.nova.hitId,near.id);assert.ok(m.nova.y>=near.y);assert.ok(m.nova.y<=near.y+near.radius+b.nova.projectileRadius+1);assert.ok(m.nova.life>0);
 }
});
test('G2p empty lane detonates exactly at 60 percent height above the bottom',()=>{
 const m=make();for(const a of m.aliens){a.x=a.baseX=40;}
 m.update(.01,{nova:true,novaTargetX:40,novaTargetY:20});advance(m,.6);
 assert.equal(m.nova.flight,0);assert.equal(m.nova.hitId,null);assert.equal(m.nova.y,config.height*.4);assert.equal(m.nova.x,config.width/2);assert.ok(m.nova.life>0);
 const position=[m.nova.x,m.nova.y];m.update(.01,{x:320,y:40,nova:true});assert.deepEqual([m.nova.x,m.nova.y],position);assert.equal(m.novaCharges,1);
});
test('G2p stage one settles in the upper quarter, and all stages begin far above the player',()=>{
 for(let level=1;level<=10;level++){
  const m=make(level);assert.ok(m.aliens.every(a=>a.y+a.radius<0));
  assert.ok(Math.min(...m.aliens.map(a=>a.baseY))<config.height*.25);
  assert.ok(m.aliens.every(a=>m.player.y-b.playerRadius-a.baseY-a.radius>=config.height*.45));
  if(level===1){advance(m,b.formation.entrySeconds+.02);assert.ok(m.aliens.every(a=>a.y<=config.height*.25));}
 }
});
test('G2p entry arcs remain continuous on the first frame and across the settling boundary',()=>{
 for(const level of [1,5,10]){
  const m=make(level),first=m.aliens[0],reference=make(level),referenceFirst=reference.aliens[0],mid=[];let maxStep=0;
  // Isolate the entry arc from the authored sway/phase motion shared by a fleet
  // already in position. Measuring against baseX conflates those two motions.
  for(const a of reference.aliens){a.entry=0;a.entrySide=0;}
  for(let i=0;i<200;i++){
   const previous=new Map(m.aliens.map(a=>[a.id,{x:a.x,y:a.y,radius:a.radius,kind:a.kind}]));m.update(.01);reference.update(.01);
   for(const a of m.aliens){const p=previous.get(a.id);if(p){const step=Math.hypot(a.x-p.x,a.y-p.y);maxStep=Math.max(maxStep,step);if(!(step<3)){
    const pairs=m.aliens.filter(other=>other.id!==a.id).map(other=>{const before=previous.get(other.id),need=a.radius+other.radius+b.formation.collisionGap;return {id:other.id,need,before:before?Math.hypot(p.x-before.x,p.y-before.y):null,after:Math.hypot(a.x-other.x,a.y-other.y)};}).filter(pair=>pair.before!==null&&Math.min(pair.before,pair.after)<pair.need+10);
    assert.fail(JSON.stringify({level,id:a.id,time:m.time,step,formation:a.formation,kind:a.kind,phase:a.phase,base:{x:a.baseX,y:a.baseY},previous:p,current:{x:a.x,y:a.y},entry:a.entry,pairs}));
   }}}
   if(i===80)mid.push(first.x-referenceFirst.x);
  }
  assert.ok(Math.abs(mid[0])>b.tactics.entrySway*.9,JSON.stringify({level,entryArc:mid[0],minimum:b.tactics.entrySway*.9}));assert.ok(maxStep>0);
  const x=first.x,y=first.baseY;advance(m,1);
  if(level===1){assert.equal(m.behavior.motion,'static');assert.equal(first.baseY,y);assert.equal(first.x,x);}
  else{assert.notEqual(m.behavior.motion,'static');assert.ok(first.baseY>y);}
 }
});
test('G2p dive follows a continuous arc and rejoins the moving formation',()=>{
 const m=make(3);let diver,peak=0,returned=false;
 for(let i=0;i<900&&!m.result;i++){const before=new Map(m.aliens.map(a=>[a.id,{x:a.x,y:a.y}]));m.update(.01);diver??=m.aliens.find(a=>a.diveAge>=0);if(diver){peak=Math.max(peak,diver.y-diver.baseY);if(diver.diveAge<0){returned=true;assert.ok(Math.abs(diver.y-diver.baseY)<3);break;}const old=before.get(diver.id);assert.ok(Math.hypot(diver.x-old.x,diver.y-old.y)<6);}}
 assert.ok(returned&&peak>config.height/3);
});
test('G2p all seven softened CC0 clips fit 400KB and the repeated shot has the lowest RMS and peak',async()=>{
 const sources=JSON.parse(await readFile(new URL('assets/audio/g2m/sources.json',root)));assert.equal(sources.length,7);let bytes=0;
 const shot=sources.find(s=>s.event==='shot');for(const s of sources){assert.equal(s.license,'CC0-1.0');assert.match(s.source,/185a77e7c675341ad8d0805b3bbe4f20427c2481/);bytes+=(await stat(new URL('assets/audio/g2m/'+s.file,root))).size;if(s!==shot){assert.ok(s.rms>shot.rms);assert.ok(s.peak>shot.peak);}}
 assert.ok(bytes<400000);
});
test('G2p unavailable samples use enveloped harmonic and noise layers and respect pause/mute/disposal',async()=>{
 let tones=0,buffers=0,closed=false;const node=()=>({connect(){},disconnect(){},start(){},stop(){},gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}});
 class AudioContext{state='running';currentTime=1;sampleRate=1000;destination={};createGain=node;createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}createOscillator(){tones++;return node();}createBufferSource(){buffers++;return node();}createBiquadFilter=node;async suspend(){this.state='suspended';}async resume(){this.state='running';}async close(){closed=true;}}
 let mute=false;const a=createG2mAudio({AudioContext,storage:{getItem:()=>mute?'off':'on'},fetcher:async()=>({ok:false})});await a.ready;a.play('shot');assert.equal(tones,2);assert.equal(buffers,1);a.setPaused(true);a.play('hit');assert.equal(tones,2);a.setPaused(false);mute=true;a.sync();a.play('bonus');assert.equal(tones,2);a.dispose();assert.ok(closed);
});
