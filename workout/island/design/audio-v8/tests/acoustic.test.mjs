import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSound} from '../runtime/sports-audio.mjs';
import {spectrum} from '../tools/acoustic-audit.mjs';
const feature = name => {const {samples,sampleRate}=renderSound(name,{seed:17});return spectrum(samples,sampleRate);};

test('spectral analyser recognises a calibrated tone and an onset impulse',()=>{
  const rate=24000,tone=Float32Array.from({length:rate},(_,i)=>.5*Math.sin(2*Math.PI*1500*i/rate));
  const toneFeature=spectrum(tone,rate);
  assert.ok(Math.abs(toneFeature.dominant-1500)<12);assert.ok(toneFeature.presence>.999);
  const impulse=new Float32Array(4096);impulse[0]=1;
  const result=spectrum(impulse,rate);
  assert.ok(result.centroid>5900&&result.centroid<6100,'initial transient must not be hidden by the analysis window');
  assert.ok(result.treble>.60);
});

test('crowd has vocal body and does not resemble a steady referee whistle',()=>{
  const whistle=feature('whistle');assert.ok(whistle.whistleBand>.97);assert.ok(whistle.centroid>2700&&whistle.centroid<3500);
  for(const name of ['crowdBed','crowdCheer','crowdDisappoint']) {
    const crowd=feature(name);assert.ok(crowd.body>.55,name);assert.ok(crowd.whistleBand<.15,name);
    assert.ok(crowd.centroid<1500,name);
  }
  assert.ok(feature('crowdCheer').centroid>feature('crowdDisappoint').centroid+50);
});

test('ball, metal, net and surface events retain distinct acoustic cues',()=>{
  const ball=feature('basketballBounce'),rim=feature('rimHit'),net=feature('netSwish');
  assert.ok(ball.bass>.5&&ball.bass<.85,'hollow body plus audible contact');
  assert.ok(rim.dominant>ball.dominant*3,'metal mode is distinct from membrane body');
  assert.ok(net.centroid>2000&&net.bass<.02,'net is a fibrous transient');
  assert.ok(feature('tennisBounce').dominant>ball.dominant*2);
  assert.ok(feature('grassStep').centroid>feature('courtStep').centroid*2);
  assert.ok(feature('skiCarve').centroid>feature('skiGlide').centroid+400);
  assert.ok(feature('whistle').centroid>feature('buzzer').centroid*5);
});
