import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCatchAudio, CUE_NAMES} from '../workout/island/minigames/catch-audio.mjs';

const root = new URL('../workout/island/', import.meta.url);
// the cue set promised in CONTRACT.md ("חוזה כולם ↔ D") plus every name v5/v6 sessions and the bow HUD call
const CONTRACT = ['engine', 'siren', 'turn', 'shot', 'shotHit', 'flat', 'skid', 'draw', 'twang', 'whistle', 'hitBody', 'hitHead'];
const SESSION = ['tool', 'swing', 'whoosh', 'thud', 'miss', 'catch', 'perfect', 'count', 'countdown', 'go', 'crash', 'crimCrash', 'pad', 'scrape', 'ram', 'nitro', 'brake', 'near', 'bossHit', 'stars'];

test('catch v6 audio: loads headless (no AudioContext, no document) and every cue is a silent no-op', () => {
  assert.equal(globalThis.AudioContext, undefined);
  const audio = createCatchAudio();
  assert.equal(typeof audio.cue, 'function');
  for (const name of [...CONTRACT, ...SESSION]) audio.cue(name, {approach: .5, crew: true, level: .5});
  audio.cue('draw', .5); audio.cue('draw', 1); audio.cue('nonsense');
  assert.equal(audio.output(), null, 'no node without a context');
  audio.dispose();
});

test('catch v6 audio: the contract cue names exist in the module', () => {
  const audio = createCatchAudio(), names = audio.cueNames();
  for (const name of [...CONTRACT, ...SESSION]) assert.ok(names.includes(name), 'cue ' + name);
  for (const name of names) assert.ok(CUE_NAMES.includes(name), 'CUE_NAMES lists ' + name);
  for (const name of CUE_NAMES) assert.ok(names.includes(name), 'CUE_NAMES has no stale entry: ' + name);
  audio.dispose();
});

test('catch v6 audio: engine(), engineStop(), status(), setPaused() and a double dispose() are safe headless', () => {
  const audio = createCatchAudio({muted: () => false});
  for (let i = 0; i < 5; i++) audio.engine(i * 7, i % 2 === 0);
  audio.engine(undefined, undefined); audio.engine('12', 'yes'); audio.engineStop(); audio.engineStop();
  const st = audio.status();
  assert.deepEqual(st, {state: 'none', sirenBuffer: null, sirenDecoded: {twoTone: null, yelp: null}, sirenLive: false, sirenGain: 0, engine: false, boosting: false, draw: false, limiter: false});
  audio.setPaused(true); audio.cue('siren'); audio.engine(20, true); audio.setPaused(false); audio.tick();
  audio.dispose(); audio.dispose();
  audio.cue('catch'); audio.engine(10, false); assert.equal(audio.status().state, 'none', 'after dispose everything stays a no-op');
});

test('catch v6 audio: the muted switch is honoured and the recorded siren keeps its synth fallback', async () => {
  let muted = true; const audio = createCatchAudio({muted: () => muted});
  audio.cue('siren', {approach: 1}); muted = false; audio.cue('siren', {approach: -1}); audio.dispose();
  const source = await readFile(new URL('minigames/catch-audio.mjs', root), 'utf8');
  assert.match(source, /siren\(960 \* k, 800 \* k, 0\); siren\(740 \* k, 880 \* k, \.4\)/, 'the synth siren stays as the fallback when the loop has not decoded');
  assert.match(source, /siren-two-tone-loop/); assert.match(source, /siren-yelp-loop/);
  assert.match(source, /createDynamicsCompressor/, 'a master limiter sits before the destination');
  assert.match(source, /pointerdown/, 'the first gesture resumes the context');
  assert.equal(/\b(gunshot|firearm sound|bang)\b/i.test(source.replace(/never a real firearm/g, '')), false, 'the tyre shot stays a cartoon pop');
  assert.equal(/[؀-ۿ]/.test(source), false, 'no Arabic letters');
});

test('catch v6 audio: the session files call the cues this module provides', async () => {
  const audio = createCatchAudio(), names = new Set(audio.cueNames()); audio.dispose();
  for (const file of ['minigames/catch-session.mjs', 'minigames/catch-session6.mjs', 'minigames/catch-bow-hud.mjs']) {
    const src = await readFile(new URL(file, root), 'utf8');
    for (const m of src.matchAll(/cue\??\.?\(\s*'([a-zA-Z]+)'/g)) assert.ok(names.has(m[1]), file + ' uses cue ' + m[1]);
    for (const m of src.matchAll(/cue\?\.\(\s*e\.(\w+) \? '(\w+)' : '(\w+)'/g)) { assert.ok(names.has(m[2]), m[2]); assert.ok(names.has(m[3]), m[3]); }
  }
  const s6 = await readFile(new URL('minigames/catch-session6.mjs', root), 'utf8');
  assert.match(s6, /audio\?\.engine\?\.\(chase\.state\.v, chase\.state\.boosting\)/, 'v6 drives the engine bed every frame');
  assert.match(s6, /audio\?\.engineStop\?\.\(\)/, 'v6 stops the engine bed');
});
