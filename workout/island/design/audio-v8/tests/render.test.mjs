import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUND_CATALOG, renderSound} from '../runtime/sports-audio.mjs';
import {measure} from '../tools/measure.mjs';

test('catalog covers the requested sports and has at least 25 callable events', () => {
  assert.ok(Object.keys(SOUND_CATALOG).length >= 25);
  for (const name of ['whistle', 'basketballBounce', 'netSwish', 'rimHit', 'soccerKick', 'goalpostHit',
    'crowdBed', 'crowdCheer', 'crowdDisappoint', 'courtStep', 'grassStep', 'grassRustle',
    'tennisHit', 'skiGlide', 'engineBurst']) assert.ok(SOUND_CATALOG[name], name);
  assert.ok(Object.isFrozen(SOUND_CATALOG));
});

for (const [name, spec] of Object.entries(SOUND_CATALOG)) {
  test(`${name}: measure duration, peak, tail and duration-cap extremes`, t => {
    for (const sampleRate of [8000, 16000, 24000, 44100, 48000]) {
      for (const options of [{}, {duration: 1e8, tone: .75, intensity: 1}, {duration: -.1, tone: 1.25, intensity: 1}]) {
        const rendered = renderSound(name, {sampleRate, seed: 17, ...options});
        const result = measure(rendered.samples, rendered.sampleRate);
        assert.ok(result.duration <= spec.maxDuration, `${name}: ${result.duration} > ${spec.maxDuration}`);
        assert.ok(result.peak > .0001 && result.peak <= spec.peak + 1e-6, `${name}: peak ${result.peak}`);
        assert.ok(result.lastAudibleAt < result.duration, `${name}: no silence at end`);
        assert.equal(result.tailPeak, 0, `${name}: nonzero tail`);
        assert.equal(rendered.samples[0], 0, `${name}: nonzero onset`);
        assert.equal(rendered.samples.at(-1), 0, `${name}: nonzero ending`);
        assert.ok(Math.abs(result.dc) < .015, `${name}: DC ${result.dc}`);
        if (sampleRate === 24000 && !options.duration) {
          t.diagnostic(`buffer=${result.duration.toFixed(5)}s; last=${result.lastAudibleAt.toFixed(5)}s; peak=${result.peak.toFixed(6)}; cap=${spec.maxDuration}s`);
        }
      }
    }
  });
  test(`${name}: deterministic output, finite hostile parameters and silence at zero intensity`, () => {
    const a = renderSound(name, {seed: 42}), b = renderSound(name, {seed: 42});
    assert.deepEqual(a.samples, b.samples);
    assert.equal(measure(renderSound(name, {intensity: 0}).samples, 24000).peak, 0);
    for (const value of [NaN, Infinity, -Infinity, null, '9']) {
      const rendered = renderSound(name, {duration: value, tone: value, intensity: value, sampleRate: value, seed: value});
      const result = measure(rendered.samples, rendered.sampleRate);
      assert.ok(result.duration <= spec.maxDuration);
      assert.ok(result.peak <= spec.peak + 1e-6);
    }
    const loud = measure(renderSound(name, {intensity: 1}).samples, 24000);
    const soft = measure(renderSound(name, {intensity: .25}).samples, 24000);
    assert.ok(Math.abs(loud.peak * .25 - soft.peak) < 1e-6);
  });
}

test('whistle becomes digital silence within 280 ms for all exposed tones', () => {
  for (const tone of [.75, .9, 1, 1.1, 1.25]) {
    const {samples, sampleRate} = renderSound('whistle', {duration: Infinity, tone});
    const output = new Float32Array(sampleRate * 3);
    output.set(samples);
    assert.ok(measure(output, sampleRate).lastAudibleAt <= .28);
    assert.equal(measure(output.subarray(Math.ceil(.28 * sampleRate)), sampleRate).peak, 0);
  }
});

test('unknown names cannot access prototype properties', () => {
  for (const name of ['missing', '__proto__', 'constructor', 'toString']) assert.throws(() => renderSound(name), RangeError);
});
