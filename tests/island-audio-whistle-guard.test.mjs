import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {whistleLike,summarizeFrames,liveCueProblems,LIVE_CUES,LIVE_PHASES,WHISTLE_ASSETS} from '../workout/island/minigames/audio-guard.mjs';

const spectra=JSON.parse(await readFile(new URL('../workout/island/verification/sports-deep-fable/audio-forensics/sample-spectra.json',import.meta.url),'utf8')).samples;
const mix=JSON.parse(await readFile(new URL('../workout/island/design/audio/mix.json',import.meta.url),'utf8'));
// Frame factory: t in seconds, hi = strongest 0.9-5 kHz bin {f,db,prom,rel}.
const frame=(t,f,{prom=25,rel=-4,db=-50,s25=.05,ph='live',lvl=-45}={})=>({t,ct:t,ctx:1,lvl,dom:150,s25,s12:.1,hi:{f,db,prom,rel},ph});
const series=(n,fn)=>Array.from({length:n},(_,i)=>fn(i*.05,i));

test('a steady 2.7 kHz line for 0.8 s is a tone; a 0.5 s referee whistle is not long enough', () => {
  const [tone]=whistleLike(series(17,t=>frame(t,2700)));
  assert.equal(tone?.kind,'tone');assert.equal(tone.hz,2700);assert.ok(tone.seconds>=.6);
  assert.deepEqual(whistleLike(series(10,t=>frame(t,2750))),[]);
});
test('a 1.7 to 2.2 kHz squeak that lasts 0.3 s is a glide, and a one-frame thump on top does not split it', () => {
  const frames=[frame(0,1690),frame(.05,1723),frame(.1,1723),frame(.15,1723,{prom:18,rel:-16}),frame(.2,2196,{rel:-11}),frame(.25,2196),frame(.3,2196,{prom:25,rel:-15}),frame(.35,2196,{prom:25,rel:-27}),frame(.4,150,{prom:0,rel:0})];
  const [glide]=whistleLike(frames);
  assert.equal(glide?.kind,'glide');assert.equal(glide.fromHz,1690);assert.equal(glide.toHz,2196);
  const masked=frames.slice();masked[2]=frame(.1,150,{prom:2,rel:0});
  assert.equal(whistleLike(masked).length,1,'one masked frame keeps the run');
});
test('a quiet or broad high bin is neither tone nor glide', () => {
  assert.deepEqual(whistleLike(series(30,t=>frame(t,2200,{prom:6}))),[]);
  assert.deepEqual(whistleLike(series(30,t=>frame(t,2200,{prom:12,rel:-30}))),[]);
  assert.deepEqual(whistleLike(series(30,t=>frame(t,2200,{db:-120,lvl:-118}))),[]);
});
test('a steady bright bed (a third of the energy in 2-5 kHz, within 6 dB of the peak) is a hum after 2 s, a real crowd is not', () => {
  const [hum]=whistleLike(series(50,t=>frame(t,2000,{prom:8,rel:-3,s25:.3,ph:'playing'})));
  assert.equal(hum?.kind,'hum');assert.ok(hum.seconds>=2);assert.deepEqual(hum.phases,['playing']);
  assert.deepEqual(whistleLike(series(50,t=>frame(t,2000,{prom:4,rel:-17,s25:.006}))),[]);
});
test('summarizeFrames groups energy share by phase', () => {
  const by=summarizeFrames([frame(0,2000,{s25:.3,ph:'playing'}),frame(.05,2000,{s25:.1,ph:'playing'}),frame(.1,2000,{s25:.02,ph:'goal'})]);
  assert.equal(by.playing.frames,2);assert.equal(by.playing.s25,.2);assert.equal(by.goal.frames,1);
});
test('live-play phase names match the sessions', () => {
  assert.deepEqual(LIVE_PHASES.soccer,['playing']);assert.deepEqual(LIVE_PHASES.streetSlam,['live']);
});
test('no soccer, basketball or tennis live-play cue is a referee whistle or a long high tone', () => {
  const problems=liveCueProblems(LIVE_CUES,spectra);
  assert.deepEqual(problems,[],JSON.stringify(problems));
  for(const table of Object.values(LIVE_CUES))for(const asset of Object.values(table))assert.ok(spectra[asset],`measured spectrum for ${asset}`);
});
test('the referee whistles are the only sustained lines in the band, and they are short', () => {
  for(const asset of WHISTLE_ASSETS){const s=spectra[asset];assert.ok(s.peaks[0]>=1500&&s.peaks[0]<=5000,asset);assert.ok(s.dur<=.8,`${asset} ${s.dur}s`);}
  const mapped=new Set(Object.values(LIVE_CUES).flatMap(t=>Object.values(t)));
  for(const asset of WHISTLE_ASSETS)assert.ok(!mapped.has(asset),`${asset} is not a live cue`);
});
test('the guard catches a remap of a live event to the whistle or to a long bright sample', () => {
  const bad={soccer:{pass:'soccer/whistle'},streetSlam:{floor:'racing-audio-v2/engine-redline'}};
  const problems=liveCueProblems(bad,spectra);
  assert.equal(problems.length,2);assert.match(problems[0].reason,/referee whistle/);assert.match(problems[1].reason,/sustained line \d+ Hz/);
});
test('mix.json: every soccer and basketball event sample is short; only the ambience loops are long', () => {
  for(const [key,asset] of Object.entries(mix.assets)){
    if(!/^(soccer|basketball)\//.test(key))continue;
    if(asset.loop)assert.ok(key.endsWith('ambience-loop'),key);else assert.ok(asset.duration_seconds<=2.8,`${key} ${asset.duration_seconds}s`);
  }
  // Documented in the forensics report: the synthetic crowd keeps a quarter of its
  // energy above 2 kHz, the real tennis bed under 1%. The hoops bed is already off;
  // the soccer bed is the patch plan. This pins the measurement, not the fix.
  assert.ok(spectra['soccer/ambience-loop'].band2to5k>.2);assert.ok(spectra['g4e/stadium-bed'].band2to5k<.02);
});
