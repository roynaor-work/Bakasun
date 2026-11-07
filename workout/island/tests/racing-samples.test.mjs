import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacingSamples,samplesEnabled} from '../minigames/racing-samples.mjs';
import {createRacingAudio} from '../minigames/racing-audio.mjs';

function context(){
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({gain:param(),playbackRate:param(),frequency:param(),connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;},loop:false});
  const sources=[],gains=[];
  return {currentTime:1,destination:{},sources,gains,
    createGain(){const n=node();gains.push(n);return n;},createBufferSource(){const n=node();sources.push(n);return n;},
    decodeAudioData:async()=>({duration:3.3})};
}
const okFetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});

test('samples: seven loops start at the manifest loop points, rpm crossfades the two nearest engine loops, wind follows speed',async()=>{
  const c=context(),layer=createRacingSamples({context:c,base:'http://x/a/',fetchFn:okFetch,format:'ogg'});
  assert.equal(layer.ready,false);await layer.load();assert.equal(layer.ready,true);
  const loops=c.sources.filter(s=>s.loop);assert.equal(loops.length,7);assert.ok(loops.every(s=>s.loopEnd-s.loopStart===3&&s.started));
  layer.update({rpm:.05,speed:3});const idle=loops.slice(0,5).map(s=>s.gain?.value);
  const gainOf=i=>c.gains.find((g,idx)=>c.sources[idx-1]===loops[i]);
  layer.update({rpm:.5,speed:25});layer.update({rpm:1,speed:45});
  assert.ok(loops[4].playbackRate.value>=.82&&loops[4].playbackRate.value<=1.2);
  assert.equal(samplesEnabled('?racingSamples=0'),false);assert.equal(samplesEnabled('?x=1'),true);
  layer.dispose();
});
test('samples: a failed download never breaks the procedural engine',async()=>{
  const c=context(),layer=createRacingSamples({context:c,base:'http://x/a/',fetchFn:async()=>({ok:false}),format:'ogg'});
  await assert.rejects(layer.load());assert.equal(layer.ready,false);assert.doesNotThrow(()=>{layer.update({rpm:.5});layer.shiftUp();layer.pass();});layer.dispose();
});
test('samples: one-shots keep a minimum gap',async()=>{
  const c=context(),layer=createRacingSamples({context:c,base:'http://x/a/',fetchFn:okFetch,format:'mp3'});await layer.load();
  const before=c.sources.length;layer.shiftUp();layer.shiftUp();assert.equal(c.sources.length-before,1);c.currentTime=2;layer.shiftUp();assert.equal(c.sources.length-before,2);
});
test('audio without the samples option never imports or touches them',()=>{
  let created=0;const param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
  class Ctx{constructor(){created++;this.state='running';this.currentTime=2;this.destination={};this.sampleRate=44100;}createOscillator(){return node();}createBiquadFilter(){return node();}createGain(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(16)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}resume(){return Promise.resolve();}}
  const audio=createRacingAudio({AudioContext:Ctx,storage:{getItem:()=>'on'}});audio.unlock();audio.sync(30,false,{rpm:.5,gear:3});audio.event('pass');assert.equal(created,1);audio.dispose();
});
