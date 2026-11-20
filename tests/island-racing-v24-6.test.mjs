// racing-v24.6 audio (Roy, 20/11/2026: "take out the strange noise on a downshift or when slowing down ... a faint noise in the air ... a tapping noise on
// downshifts"): no backfire on a lift, no rev blip on a downshift, a silent upshift right after a downshift, no road noise. ?racingAudioV246=0 keeps v24.5.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRacingAudio} from '../workout/island/minigames/racing-audio.mjs';
import {racingV246Flags,REENGAGE} from '../workout/island/minigames/racing-v24-6.mjs';
function fakeContext(clock){const made=[],param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(x){this.set=x;},linearRampToValueAtTime(x){(this.ramps||=[]).push(x);},exponentialRampToValueAtTime(x){(this.ramps||=[]).push(x);}});
 const node=(kind,e)=>{const n=Object.assign({kind,connect(){},disconnect(){},start(t){this.started=t;},stop(){}},e);made.push(n);return n;};
 return {made,get currentTime(){return clock.t;},destination:{},state:'running',sampleRate:44100,createGain:()=>node('gain',{gain:param(1)}),createOscillator:()=>node('osc',{type:'sine',frequency:param(440),setPeriodicWave(){this.wave=true;}}),
  createBiquadFilter:()=>node('filter',{type:'lowpass',frequency:param(350),Q:param(1)}),createBufferSource:()=>node('src',{playbackRate:param(1),buffer:null,loop:false}),createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),
  createPeriodicWave:()=>({}),createStereoPanner:()=>node('pan',{pan:param(0)}),decodeAudioData:async b=>({duration:2.88}),resume:()=>Promise.resolve(),close:()=>Promise.resolve()};}
/** A ready sample layer that counts what the engine asks of it. */
const layer=()=>{const c={backfire:0,shiftDown:0,shiftDownSoft:0};return {c,ready:true,update(){},backfire(){c.backfire++;},shiftDown(){c.shiftDown++;},shiftDownSoft(){c.shiftDownSoft++;},shiftBeep(){},dispose(){},levels:()=>({})};};
/** A corner the v24.5 box makes: full gas in 7th, lift (throttle .15) with the revs high, three downshifts .32 s apart, one upshift .35 s after the last,
 * then gas again. Returns the engine counters, the layer counters and the thump oscillators (85 Hz sine) the upshifts made. */
function corner(v246){
 const clock={t:5},samples=layer();let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=fakeContext(clock);return ctx;},storage:{getItem:()=>'on'},air:'v245',v246,layer:samples});audio.unlock();
 const at=(dt,speed,extras)=>{clock.t+=dt;audio.sync(speed,false,extras);};
 for(let i=0;i<30;i++)at(1/60,60,{rpm:.9,gear:7,throttle:1});
 const noiseDriving=audio.engine().noise;
 at(1/60,58,{rpm:.85,gear:7,throttle:.15});
 let gear=7;for(let k=0;k<3;k++){for(let i=0;i<19;i++)at(1/60,52-k*6,{rpm:.6,gear,throttle:.15});gear--;at(1/60,50-k*6,{rpm:.8,gear,throttle:.15});}
 const thumpsBefore=ctx.made.filter(n=>n.kind==='osc'&&n.started!==undefined&&n.type==='sine').length;
 for(let i=0;i<20;i++)at(1/60,34,{rpm:.75,gear,throttle:.15});gear++;at(1/60,34,{rpm:.55,gear,throttle:.15});
 const thumps=ctx.made.filter(n=>n.kind==='osc'&&n.started!==undefined&&n.type==='sine').length-thumpsBefore;
 for(let i=0;i<30;i++)at(1/60,36,{rpm:.6,gear,throttle:1});
 const e=audio.engine();audio.dispose();return {e,samples:samples.c,thumps,noiseDriving};
}
test('racing v24.6: on by default, ?racingAudioV246=0 keeps v24.5; the engine default (no option) is v24.5',()=>{
 assert.equal(racingV246Flags('').audio,true);assert.equal(racingV246Flags('?racingAudioV246=0').audio,false);
 const a=createRacingAudio({AudioContext:function(){return fakeContext({t:1});},storage:null});a.unlock();assert.equal(a.engine().v246,false);a.dispose();
});
test('racing v24.6: slowing into a corner makes no backfire, no rev blip and no thump on the upshift that follows a downshift',()=>{
 const now=corner(true),old=corner(false);
 assert.equal(old.e.backfires,1,'v24.5: the lift backfires');assert.equal(old.samples.backfire,1,'v24.5: an exhaust pop sample');assert.equal(old.e.blips,3,'v24.5: a blip per downshift');assert.equal(old.thumps,1,'v24.5: the re-engaging upshift thumps');
 assert.equal(now.e.backfires,0);assert.equal(now.samples.backfire,0,'no exhaust pop');assert.equal(now.e.blips,0,'no blip');assert.equal(now.samples.shiftDown+now.samples.shiftDownSoft,0,'no downshift sample instead');
 assert.equal(now.thumps,0,`an upshift within ${REENGAGE} s of a downshift is silent`);assert.equal(now.e.silentUps,1);
});
test('racing v24.6: a normal upshift under gas keeps its thump; no road noise while driving',()=>{
 const clock={t:5};let ctx;const audio=createRacingAudio({AudioContext:function(){ctx=fakeContext(clock);return ctx;},storage:{getItem:()=>'on'},air:'v245',v246:true});audio.unlock();
 for(let i=0;i<30;i++){clock.t+=1/60;audio.sync(30,false,{rpm:.9,gear:4,throttle:1});}clock.t+=1/60;audio.sync(31,false,{rpm:.6,gear:5,throttle:1});
 assert.equal(ctx.made.filter(n=>n.kind==='osc'&&n.type==='sine'&&n.started!==undefined).length>=1,true,'the upshift thump');
 for(let i=0;i<30;i++){clock.t+=1/60;audio.sync(60,false,{rpm:.9,gear:7,throttle:1});}assert.equal(audio.engine().noise,0,'no road noise at 60 m/s');
 audio.dispose();
 const old=corner(false);assert.ok(old.noiseDriving>0,'v24.5 had a (faint) road noise');
});
test('racing v24.6: the session passes the flag',async()=>{
 const src=await readFile(new URL('../workout/island/minigames/racing-session.mjs',import.meta.url),'utf8');
 assert.match(src,/v246:v246\.audio/);assert.match(src,/racingV246Flags\(\)/);
});
