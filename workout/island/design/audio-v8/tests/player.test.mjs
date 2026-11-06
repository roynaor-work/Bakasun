import test from 'node:test';
import assert from 'node:assert/strict';
import {createSportsAudio, SOUND_CATALOG} from '../runtime/sports-audio.mjs';

// A clocked WebAudio boundary: tests observe explicit stop scheduling, graph
// teardown and state transitions. Actual DSP is tested separately in Chromium.
class Parameter {
  value = 1;
  events = [];
  cancelScheduledValues(at) { this.events.push(['cancel',at]); }
  setValueAtTime(value, at) { this.value=value;this.events.push(['set',value,at]); }
  linearRampToValueAtTime(value, at) { this.value=value;this.events.push(['ramp',value,at]); }
}
class Node {
  constructor(context, kind) { this.context=context;this.kind=kind;context.nodes.push(this); }
  gain=new Parameter(); pan=new Parameter(); playbackRate=new Parameter(); connections=[]; disconnected=false;
  connect(node) { if(this.context.fail===`${this.kind}.connect`)throw Error('connect failed');this.connections.push(node);return node; }
  disconnect() { this.disconnected=true;this.connections=[]; }
  start(at) { if(this.context.fail==='start')throw Error('start failed');this.startAt=at; }
  stop(at=0) { this.stopAt=at; }
}
class Context extends EventTarget {
  state='suspended';currentTime=0;sampleRate=48000;nodes=[];closeCalls=0;fail=null;
  destination={};
  createGain() { if(this.fail==='gain')throw Error('gain failed');return new Node(this,'gain'); }
  createWaveShaper() { if(this.fail==='limiter')throw Error('limiter failed');return new Node(this,'limiter'); }
  createBufferSource() { return new Node(this,'source'); }
  createStereoPanner() { if(this.fail==='panner')throw Error('panner failed');return new Node(this,'panner'); }
  createBuffer(channels,length,rate) {
    const data=new Float32Array(length);
    return {length,duration:length/rate,sampleRate:rate,getChannelData:()=>data};
  }
  async resume() { if(this.fail==='resume')throw Error('resume failed');this.state='running'; }
  async close() { this.closeCalls++;this.state='closed'; }
  advance(seconds) {
    this.currentTime+=seconds;
    for(const node of this.nodes)if(node.kind==='source'&&node.stopAt<=this.currentTime&&node.onended)node.onended();
  }
}
class Target extends EventTarget { hidden=false; }
const setup = options => {
  const context=new Context(),document=new Target(),pageTarget=new Target();
  return {context,document,pageTarget,audio:createSportsAudio({context,document,pageTarget,...options})};
};

test('no audio context or graph is created until unlock; missing audio is nonfatal',async()=>{
  let created=0;
  class Lazy extends Context { constructor(){super();created++;} }
  const audio=createSportsAudio({AudioContext:Lazy,document:null,pageTarget:null});
  assert.equal(created,0);assert.equal(audio.whistle(),null);assert.equal(created,0);
  assert.equal(await audio.unlock(),true);assert.equal(created,1);
  assert.equal(await audio.unlock(),true);assert.equal(created,1);
  await audio.dispose();assert.equal(await audio.unlock(),false);
  const unsupported=createSportsAudio({AudioContext:false});assert.equal(await unsupported.unlock(),false);await unsupported.dispose();
});

test('every sound has a named parameterized function and schedules an explicit bounded stop',async()=>{
  for(const [name,spec] of Object.entries(SOUND_CATALOG)) {
    const {context,audio}=setup();await audio.unlock();
    assert.equal(typeof audio[name],'function');
    const handle=audio[name]({duration:1e9,tone:.75,delay:1e9,intensity:1});
    assert.ok(handle,name);
    const source=context.nodes.find(node=>node.kind==='source');
    assert.equal(source.loop,false);assert.equal(source.playbackRate.value,1);
    assert.equal(source.startAt,.25);
    assert.ok(source.stopAt-source.startAt<=spec.maxDuration+1e-12);
    assert.equal(handle.duration,source.buffer.duration);
    assert.equal(audio.metrics.activeVoices,1);
    context.advance(spec.maxDuration+.26);await handle.ended;
    assert.equal(audio.metrics.activeVoices,0);assert.equal(source.disconnected,true);
    await audio.dispose();assert.equal(context.closeCalls,0,'external context must stay open');
  }
});

test('rapid whistles cannot accumulate or keep playing after their cap',async()=>{
  const {context,audio}=setup();await audio.unlock();
  const first=audio.whistle();assert.ok(first);
  for(let i=0;i<1000;i++)assert.equal(audio.whistle(),null);
  context.advance(.29);await first.ended;assert.equal(audio.metrics.activeVoices,0);
  context.advance(.02);assert.ok(audio.whistle());
  audio.stopAll();assert.equal(audio.metrics.activeVoices,0);await audio.dispose();
});

test('polyphony is bounded, cache obeys bytes, arbitrary seeds cannot grow it indefinitely',async()=>{
  const {context,audio}=setup({maxVoices:3,cacheBytes:12000});await audio.unlock();
  for(const name of ['soccerKick','tennisHit','courtStep'])assert.ok(audio.play(name));
  assert.equal(audio.netSwish(),null);assert.equal(audio.metrics.activeVoices,3);
  context.advance(1);
  for(let seed=0;seed<100;seed++) {
    assert.ok(audio.courtStep({duration:.06,seed}));context.advance(.1);
    assert.ok(audio.metrics.cacheBytes<=12000);
  }
  assert.ok(audio.metrics.cachedBuffers<=2);
  audio.clearCache();assert.equal(audio.metrics.cacheBytes,0);assert.equal(audio.metrics.cachedBuffers,0);
  await audio.dispose();
});

test('mute, pause, zero volume, hidden document and page exit synchronously cancel delayed sources',async()=>{
  const {audio,context,document,pageTarget}=setup();await audio.unlock();
  let handle=audio.whistle({delay:.25});audio.setMuted(true);await handle.ended;
  assert.equal(audio.metrics.activeVoices,0);assert.equal(audio.whistle(),null);
  audio.setMuted(false);context.advance(1);handle=audio.crowdBed();audio.setPaused(true);await handle.ended;
  assert.equal(audio.courtStep(),null);audio.setPaused(false);context.advance(1);
  handle=audio.netSwish();audio.setVolume(0);await handle.ended;assert.equal(audio.tennisHit(),null);
  audio.setVolume(.65);context.advance(1);handle=audio.crowdCheer();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));await handle.ended;
  assert.equal(audio.metrics.hidden,true);assert.equal(audio.soccerKick(),null);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));context.advance(1);
  handle=audio.crowdDisappoint();pageTarget.dispatchEvent(new Event('pagehide'));await handle.ended;
  assert.equal(audio.metrics.activeVoices,0);assert.equal(audio.whistle(),null);
  pageTarget.dispatchEvent(new Event('pageshow'));context.advance(1);assert.ok(audio.whistle());
  await audio.dispose();
});

test('stopping one handle is bounded and idempotent without stopping another event',async()=>{
  const {context,audio}=setup();await audio.unlock();
  const whistle=audio.whistle(),crowd=audio.crowdBed();whistle.stop();whistle.stop();
  const source=context.nodes.find(node=>node.kind==='source');assert.equal(source.stopAt,.008);
  context.advance(.009);await whistle.ended;assert.equal(audio.metrics.activeVoices,1);
  audio.stopAll();await crowd.ended;await audio.dispose();
});

test('partial graph and voice creation failures clean up and can retry',async()=>{
  const {context,audio}=setup();context.fail='limiter';assert.equal(await audio.unlock(),false);
  assert.ok(context.nodes.every(node=>node.disconnected));
  context.fail=null;assert.equal(await audio.unlock(),true);
  for(const fail of ['panner','start','source.connect']) {
    const before=context.nodes.length;context.fail=fail;assert.equal(audio.soccerKick(),null);
    assert.equal(audio.metrics.activeVoices,0);
    assert.ok(context.nodes.slice(before).every(node=>node.disconnected),fail);
  }
  context.fail=null;assert.ok(audio.soccerKick());await audio.dispose();
});

test('owned context closes once; disposed instance cannot create, resume, or play again',async()=>{
  let context;
  class Owned extends Context { constructor(){super();context=this;} }
  const audio=createSportsAudio({AudioContext:Owned,document:null,pageTarget:null});await audio.unlock();
  const handle=audio.crowdCheer();await audio.dispose();await handle.ended;await audio.dispose();
  assert.equal(context.closeCalls,1);assert.equal(audio.metrics.activeVoices,0);assert.equal(audio.metrics.cacheBytes,0);
  assert.equal(await audio.unlock(),false);assert.equal(audio.whistle(),null);
  assert.throws(()=>audio.play('constructor'),RangeError);
});

test('prepare is silent, reuses buffers across intensity changes and yields between events',async()=>{
  const {context,audio}=setup();
  assert.equal((await audio.prepare(['whistle'])).prepared,0);
  await audio.unlock();
  const result=await audio.prepare(['whistle','crowdCheer']);assert.equal(result.prepared,5);
  assert.equal(context.nodes.filter(node=>node.kind==='source').length,0);
  const before=audio.metrics.cacheBytes;
  for(const intensity of [.1,.2,.5,1]) {
    const handle=audio.crowdCheer({intensity});assert.ok(handle);context.advance(3);await handle.ended;
    assert.equal(audio.metrics.cacheBytes,before);
  }
  const handle=audio.whistle({intensity:.5,volume:.5});
  const source=context.nodes.filter(node=>node.kind==='source').at(-1);
  const gain=source.connections[0];assert.equal(gain.gain.value,.25);audio.stopAll();await handle.ended;
  await assert.rejects(()=>audio.prepare(['__proto__']),RangeError);
  await assert.rejects(()=>audio.prepare('whistle'),TypeError);
  const preparing=audio.prepare(['crowdBed','crowdDisappoint','netSwish']);await audio.dispose();
  const stopped=await preparing;assert.ok(stopped.prepared<=1);assert.equal(audio.metrics.cacheBytes,0);
});

test('audio interruption flushes sources and never replays old events on resume',async()=>{
  const {audio,context}=setup();await audio.unlock();
  const first=audio.crowdCheer({delay:.25}),second=audio.whistle();
  context.state='suspended';context.dispatchEvent(new Event('statechange'));
  await Promise.all([first.ended,second.ended]);assert.equal(audio.metrics.activeVoices,0);
  assert.equal(audio.soccerKick(),null);
  context.state='running';context.dispatchEvent(new Event('statechange'));assert.equal(audio.metrics.activeVoices,0);
  context.advance(1);assert.ok(audio.soccerKick());await audio.dispose();
});

test('individual stop resolves even when an external context stops advancing its clock',async()=>{
  const {audio,context}=setup();await audio.unlock();
  const handle=audio.netSwish();context.state='suspended';handle.stop();await handle.ended;
  assert.equal(audio.metrics.activeVoices,0);await audio.dispose();
});

test('referee and buzzer remain audible at the voice limit without increasing polyphony',async()=>{
  const {audio,context}=setup({maxVoices:3});await audio.unlock();
  const crowd=audio.crowdBed(),step=audio.courtStep();assert.ok(audio.soccerKick());
  assert.equal(audio.netSwish(),null);assert.ok(audio.whistle());await crowd.ended;
  assert.equal(audio.metrics.activeVoices,3);
  assert.ok(audio.buzzer());await step.ended;assert.equal(audio.metrics.activeVoices,3);
  const live=context.nodes.filter(node=>node.kind==='source'&&!node.disconnected);assert.equal(live.length,3);
  audio.stopAll();assert.equal(audio.metrics.activeVoices,0);await audio.dispose();
});
