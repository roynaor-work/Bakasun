import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccerDesignAudio} from '../workout/island/minigames/soccer-design-audio.mjs';
// The procedural crowd samples carry 24-31% of their energy in 2-5 kHz; the forensics run (verification/sports-deep-fable/audio-forensics)
// classified the goal cheer as a 2.4 kHz hum into the restart and the swell as a glide. Every crowd cue now passes a low-pass.
const mixText=await readFile(new URL('../workout/island/design/audio/mix.json',import.meta.url),'utf8');
function harness(options={}){
  const nodes=[];let ctx;
  class Param{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
  class Node{constructor(kind){this.kind=kind;this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param(1);nodes.push(this);}connect(n){this.to=n;return n;}disconnect(){}start(){this.started=true;}stop(){this.stopped=true;}}
  class Ctx{constructor(){ctx=this;this.state='running';this.currentTime=1;this.destination=new Node('dest');}
    createGain(){return new Node('gain');}createBiquadFilter(){return new Node('filter');}createDynamicsCompressor(){return new Node('comp');}
    createBufferSource(){return new Node('source');}
    async decodeAudioData(){return {duration:2};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
  const fetcher=async url=>String(url).endsWith('mix.json')?{ok:true,json:async()=>JSON.parse(mixText)}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
  const audio=createSoccerDesignAudio({storage:null,AudioContext:Ctx,fetcher,clock:()=>ctx?.currentTime??0,...options});
  return {audio,nodes,ctx:()=>ctx};
}
const settle=()=>new Promise(r=>setTimeout(r,80));
/** Filters created after the last source, in creation order: the chain of the most recent voice. */
const lastChainFilters=nodes=>{const i=nodes.map(n=>n.kind).lastIndexOf('source');return nodes.slice(i).filter(n=>n.kind==='filter').map(n=>({type:n.type,hz:n.frequency.value}));};
const lastLowpass=nodes=>lastChainFilters(nodes).find(f=>f.type==='lowpass')?.hz??null;

test('soccer crowd cues (goal cheer, swell) pass a 1100 Hz low-pass by default; the whistle and the kick keep their own filters',async()=>{
  const {audio,nodes}=harness();await audio.unlock();await settle();
  assert.equal(audio.snapshot.crowdLowpass,1100);
  // mix.json already gives the crowd samples a 140 Hz high-pass; the low-pass is the new stage.
  audio.play('cheer');assert.equal(lastLowpass(nodes),1100);
  audio.play('excited');assert.equal(lastLowpass(nodes),1100);
  audio.play('crowd');assert.equal(lastLowpass(nodes),1100);
  audio.play('kick');assert.notEqual(lastLowpass(nodes),1100,'the kick is not a crowd cue');
  audio.whistle('kickoff',{force:true});assert.deepEqual(lastChainFilters(nodes).map(f=>f.type),['highpass','lowpass']);
  assert.notEqual(lastLowpass(nodes),1100,'the whistle keeps the mix.json band');
});
test('a caller low-pass below the crowd cut-off wins (the rival groan at 650 Hz); ?soccerCrowdHiss=1 (crowdLowpass:null) plays the raw sample',async()=>{
  const {audio,nodes}=harness({show:true,home:0});await audio.unlock();await settle();
  audio.event({type:'goal',team:1});await settle();
  const groan=nodes.filter(n=>n.kind==='filter'&&n.type==='lowpass').map(n=>n.frequency.value);
  assert.ok(groan.includes(650),'rival goal groan at 650 Hz: '+groan.join(','));assert.ok(!groan.includes(1100),'not doubled with the crowd cut-off');
  const raw=harness({crowdLowpass:null});await raw.audio.unlock();await settle();
  // mix.json keeps its own 7000 Hz low-pass on the cheer; only the crowd cut-off is gone.
  raw.audio.play('cheer');assert.equal(lastLowpass(raw.nodes),7000);assert.equal(raw.audio.snapshot.crowdLowpass,null);
});
