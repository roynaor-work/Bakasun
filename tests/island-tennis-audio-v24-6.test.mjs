// v24.6 tennis audio (Roy, 20/11/2026: "no sound of what I recorded for NET and OUT, the old ones are there; the racing engine sound in the
// background"): no looping crowd bed (the steady 300-2000 Hz murmur that reads as an engine), the synthesised crowd "aww" never plays with a call
// and the crowd is ducked while a recorded take plays. ?tennisAudioV246=0 keeps v24.5.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CALLOUT_REC_LIST,CALLOUT_REC_DIR} from '../workout/island/minigames/tennis-callouts.mjs';
import {createTennisAudio,tennisAudioV246Enabled,CROWD_SAMPLES,CALL_DUCK} from '../workout/island/minigames/g4e-audio.mjs';
const island=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',island))).minigames.tennis;
function fakeContext(made,clock){
 const param=name=>({name,value:1,events:[],setValueAtTime(v,t){this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);},cancelScheduledValues(){},exponentialRampToValueAtTime(){}});
 const node=kind=>{const n={kind,outs:[],frequency:param('f'),gain:param('g'),Q:param('q'),connect(d){n.outs.push(d);return d;},disconnect(){},start(t){n.started=true;n.at=t;},stop(t){n.stopped=t??true;}};made.push(n);return n;};
 return class{constructor(){this.state='running';this.sampleRate=8000;this.destination={kind:'destination'};}get currentTime(){return clock.t;}createGain(){return node('gain');}createOscillator(){return node('osc');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};}decodeAudioData(b){return Promise.resolve({take:b.take,duration:b.duration??.7});}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
}
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,0));};
async function make(search){
 globalThis.location={search};const made=[],clock={t:1},bytes={};
 for(const [name,path] of Object.entries(config.audio.samples))bytes[path]={take:name,duration:name==='crowdAw'?2.8:1};
 bytes[CALLOUT_REC_DIR+'out-1.ogg']={take:'rec-out',duration:.72};
 const fetcher=async url=>{const path=new URL(url).pathname.replace(/^.*\/workout\/island\//,'');if(path===CALLOUT_REC_LIST)return {ok:true,json:async()=>({takes:['out-1.ogg']})};const b=bytes[path];return b?{ok:true,arrayBuffer:async()=>b}:{ok:false};};
 const audio=createTennisAudio({config:config.audio,storage:{getItem:()=>'on'},AudioContext:fakeContext(made,clock),fetcher});audio.unlock();await settle();
 return {audio,made,clock};
}
const sources=(made,take)=>made.filter(n=>n.kind==='buffer'&&n.buffer?.take===take);

test('tennis audio v24.6: on by default, ?tennisAudioV246=0 keeps v24.5',()=>{
 assert.equal(tennisAudioV246Enabled(''),true);assert.equal(tennisAudioV246Enabled('?tennisAudioV246=0'),false);
 assert.ok(CROWD_SAMPLES.includes('crowdAw')&&!CROWD_SAMPLES.includes('hit')&&!CROWD_SAMPLES.includes('net'),'only crowd samples are ducked, never the ball');
});
test('tennis audio v24.6: no looping crowd bed all match; v24.5 loops stadium-bed',async()=>{
 for(const [search,bed] of [['',0],['?tennisAudioV246=0',1]]){const {audio,made}=await make(search);
  for(let i=0;i<30;i++)audio.ambient('crowdBed',.3);
  const loops=sources(made,'crowdBed');assert.equal(loops.length,bed,search||'default');if(bed)assert.equal(loops[0].loop,true);
  assert.equal(audio.metrics().bed,Boolean(bed));audio.dispose();}
});
test('tennis audio v24.6: the recorded OUT is heard clean: the "aww" is not started with it, and one already started is cut',async()=>{
 {const {audio,made,clock}=await make('');
  assert.equal(audio.call('out'),true);assert.equal(sources(made,'rec-out').length,1,'the recorded take plays');
  audio.play('crowdAw',{gain:.65});assert.equal(sources(made,'crowdAw').length,0,'the aww right after the call is skipped');
  clock.t+=2;audio.play('crowdAw',{gain:.65});assert.equal(sources(made,'crowdAw').length,1,'later, a mistake gets its aww again');
  clock.t+=1;audio.play('crowdAw',{gain:.65});const aw=sources(made,'crowdAw')[1];clock.t+=1;audio.call('out');assert.ok(aw.stopped,'an aww that started first is cut by the call');
  assert.ok(audio.metrics().played.awSkipped>=1&&audio.metrics().played.awCut>=1);audio.dispose();}
 {const {audio,made}=await make('?tennisAudioV246=0');audio.call('out');audio.play('crowdAw',{gain:.65});assert.equal(sources(made,'crowdAw').length,1,'v24.5 plays both');audio.dispose();}
});
test('tennis audio v24.6: crowd samples go through a bus that ducks to CALL_DUCK for the take, the ball sounds do not',async()=>{
 const {audio,made,clock}=await make('');
 audio.play('applauseShort');audio.play('hit');const [ap]=sources(made,'applauseShort'),[hit]=sources(made,'hit');
 const bus=ap.outs[0];assert.notEqual(bus,hit.outs[0],'applause and racket use different outputs');
 clock.t+=.1;audio.call('out');const g=bus.gain.events;
 assert.ok(g.some(e=>e[0]==='ramp'&&e[1]===CALL_DUCK),'ducked during the take');assert.ok(g.some(e=>e[0]==='ramp'&&e[1]===1&&e[2]>clock.t+.7),'back to full after the take');
 audio.dispose();
});
