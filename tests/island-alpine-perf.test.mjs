import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createQualityGovernor} from '../workout/island/minigames/alpine-quality.mjs';

const root=new URL('../workout/island/',import.meta.url);
const render=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.alpineRush.render;

test('quality governor: sustained slow racing frames drop to low once, on the frame the window closes',()=>{
  const g=createQualityGovernor(render);
  assert.equal(g.quality,'high');
  for(let i=0;i<render.qualitySampleFrames-1;i++)assert.equal(g.observe(render.slowFrameMs+5),null,`frame ${i}`);
  assert.equal(g.observe(render.slowFrameMs+5),'low');
  assert.equal(g.quality,'low');
  // Already low: nothing more to decide, whatever the frames do.
  for(let i=0;i<render.qualitySampleFrames*2;i++)assert.equal(g.observe(80),null);
  assert.equal(g.metrics().windows,1);
});

test('quality governor: fast frames stay high, window after window',()=>{
  const g=createQualityGovernor(render);
  for(let i=0;i<render.qualitySampleFrames*5;i++)assert.equal(g.observe(16.7),null);
  assert.equal(g.quality,'high');assert.equal(g.metrics().windows,5);
});

test('quality governor: a single hitch (shader compile, tab switch) is not sustained load',()=>{
  const g=createQualityGovernor(render);
  // One 1.5 s hitch inside a window of 16.7 ms frames must not drop quality.
  for(let i=0;i<render.qualitySampleFrames;i++){const ms=i===10?1500:16.7;assert.equal(g.observe(ms),null);}
  assert.equal(g.quality,'high');assert.equal(g.metrics().hitches,1);
  // Without the hitch rule the same window would average above the threshold.
  const total=16.7*(render.qualitySampleFrames-1)+1500;assert.ok(total/render.qualitySampleFrames>render.slowFrameMs);
  // The hitch frame did not count toward the window: one more good frame closes it, still high.
  assert.equal(g.metrics().frames,render.qualitySampleFrames-1);
  assert.equal(g.observe(16.7),null);assert.equal(g.metrics().windows,1);assert.equal(g.quality,'high');
});

test('quality governor: non-positive and non-numeric intervals are ignored; an initial low preset never changes',()=>{
  const g=createQualityGovernor(render);
  for(const bad of [0,-5,NaN,undefined,'x'])assert.equal(g.observe(bad),null);
  assert.equal(g.metrics().frames,0);
  const low=createQualityGovernor(render,'low');
  for(let i=0;i<200;i++)assert.equal(low.observe(100),null);
  assert.equal(low.quality,'low');
  // Defaults are sane when the config section is missing.
  const bare=createQualityGovernor();
  assert.deepEqual([bare.metrics().sampleFrames,bare.metrics().slowFrameMs,bare.metrics().hitchFrameMs],[90,30,120]);
});

test('render config keeps the quality rule within a phone-sized window',()=>{
  assert.ok(render.qualitySampleFrames>=30&&render.qualitySampleFrames<=120,String(render.qualitySampleFrames));
  assert.ok(render.slowFrameMs>=20&&render.slowFrameMs<=40);
  assert.ok(render.lowDpr<=render.maxDpr);
});
