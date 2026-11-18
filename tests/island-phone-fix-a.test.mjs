import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=process.env.PHONE_FIX_ROOT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const {createHoopsAudio}=await import(pathToFileURL(path.join(root,'workout/island/minigames/hoops-audio.mjs')));
const {refereeGesture}=await import(pathToFileURL(path.join(root,'workout/island/minigames/hoops-referee.mjs')));
const config=JSON.parse(await readFile(path.join(root,'workout/island/data/config.json'),'utf8')).minigames.streetSlam.audio;
const mix=JSON.parse(await readFile(path.join(root,'workout/island/design/audio/mix.json'),'utf8'));
const settle=()=>new Promise(r=>setTimeout(r,20));
function fake(){
 const sources=[];let context;
 class Param{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
 class Node{constructor(){this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.playbackRate=new Param(1);}connect(n){return n;}disconnect(){}start(){sources.push(this);queueMicrotask(()=>this.onended?.());}stop(){this.onended?.();}}
 class Ctx{constructor(){context=this;this.currentTime=10;this.state='running';this.sampleRate=48000;this.destination=new Node();}createGain(){return new Node();}createBufferSource(){return new Node();}createDynamicsCompressor(){return new Node();}createBiquadFilter(){return new Node();}createBuffer(channels,length,sampleRate){const pcm=new Float32Array(length);return {duration:length/sampleRate,sampleRate,length,getChannelData:()=>pcm};}async decodeAudioData(bytes){const url=new TextDecoder().decode(bytes);return {duration:url.includes('rim.ogg')?.7525:.5,url};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const fetcher=async url=>String(url).endsWith('mix.json')?{ok:true,json:async()=>mix}:{ok:true,arrayBuffer:async()=>new TextEncoder().encode(String(url)).buffer};
 return {Ctx,fetcher,sources,get context(){return context;}};
}
async function probe(query,events){
 globalThis.location={search:query};const f=fake(),a=createHoopsAudio({config,storage:null,AudioContext:f.Ctx,fetcher:f.fetcher,clock:()=>f.context.currentTime});
 a.unlock();await settle();const start=f.sources.length;for(const e of events){if(e.direct)a.play(e.direct);else a.events(Array.isArray(e)?e:[e]);await settle();f.context.currentTime+=3;}
 const played=f.sources.slice(start).map(s=>({url:s.buffer?.url||'javascript-rim',duration:s.buffer?.duration,pcm:s.buffer?.getChannelData?.(0)}));const metrics=a.metrics();a.dispose();return {played,metrics};
}
test('A possession changes are silent, leave the gate free, and do not make the referee whistle',async()=>{
 const p=await probe('',[{type:'steal'},{type:'interception'},[{type:'steal'},{type:'foul'}]]);
 assert.equal(p.played.filter(x=>/whistle-steal/.test(x.url)).length,0,'a clean steal must not start the short referee whistle');
 assert.equal(p.metrics.whistle.referee.steal,0);assert.equal(p.metrics.whistle.referee.foul,1);
 assert.equal(refereeGesture({type:'steal'}),null);assert.equal(refereeGesture({type:'interception'}),null);
});
test('A rim impact is a finite damped 180 ms PCM clang, and public play(rim) uses it too',async()=>{
 const p=await probe('',[{type:'contact',what:'rim',speed:3},{direct:'rim'},{direct:'basketball/rim'}]);const rim=p.played.find(x=>x.url==='javascript-rim');assert.equal(p.played.filter(x=>x.url==='javascript-rim').length,3,'collision, alias and authored feel cue all use PCM');
 assert.ok(rim,'rim collision must use the new short JavaScript impact');assert.ok(Math.abs(rim.duration-.18)<1/48000);
 assert.ok(rim.pcm.every(Number.isFinite));assert.ok(Math.max(...rim.pcm.map(Math.abs))<=.851);
 const rms=(a,b)=>Math.sqrt(rim.pcm.slice(a,b).reduce((n,v)=>n+v*v,0)/(b-a));
 assert.ok(rms(4800,8640)<rms(0,2400)*.04,'tail damps away rather than sustaining a gong');
 assert.equal(rim.pcm.at(-1)<.0001,true);
});
test('A whistles only for infringements/out/expired clock; normal play, timeout and tip stay quiet',async()=>{
 const p=await probe('',[{type:'pass'},{type:'steal'},{type:'interception'},{type:'timeout'},{type:'jumpBall'},{type:'foul'},{type:'violation',kind:'out'},{type:'violation',kind:'shotclock'},{type:'buzzer'},{type:'quarterEnd'}]);
 const whistles=p.played.filter(x=>/whistle/.test(x.url));assert.equal(whistles.length,3,'foul, out, shot clock only');
 assert.equal(p.played.filter(x=>/buzzer/.test(x.url)).length,2,'end-of-period horn retained');
});
test('A URL rollback restores both the v24.1 steal whistle and original rim sample',async()=>{
 for(const query of ['?phoneFixA=0','?phoneFixes=0']){
  const p=await probe(query,[{type:'steal'},{type:'interception'},{type:'contact',what:'rim',speed:3},{type:'timeout'},{type:'jumpBall'}]);
  assert.equal(p.played.filter(x=>/whistle-steal/.test(x.url)).length,2);assert.ok(p.played.some(x=>/basketball\/rim\.ogg$/.test(x.url)&&x.duration===.7525));
  globalThis.location={search:query};assert.equal(refereeGesture({type:'steal'}),'whistle');
 }
});
