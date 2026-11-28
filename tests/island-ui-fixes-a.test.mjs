// v25.2 interface fixes A (QA of v25.1): text that covered the game. Each group has one URL flag that brings the previous behaviour back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../workout/island/', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

// ---- 1. Ships: the weapon hint is a brief small chip, not a permanent wide strip (?navalHint=old) ----
test('naval hint: brief by default, ?navalHint=old keeps the permanent strip', async () => {
  const {navalHintBrief, navalHintShown, NAVAL_HINT_SECONDS} = await import(new URL('minigames/naval-hud.mjs', root));
  assert.equal(navalHintBrief(''), true);
  assert.equal(navalHintBrief('?dev=1'), true);
  assert.equal(navalHintBrief('?navalHint=old'), false);
  assert.equal(navalHintBrief('?dev=1&navalHint=old'), false);
  assert.ok(NAVAL_HINT_SECONDS >= 3 && NAVAL_HINT_SECONDS <= 6, 'a few seconds');
  assert.equal(navalHintShown(0, null), false, 'never raised');
  assert.equal(navalHintShown(1000, 1000), true, 'raised now');
  assert.equal(navalHintShown(1000 + NAVAL_HINT_SECONDS * 1000 - 1, 1000), true);
  assert.equal(navalHintShown(1000 + NAVAL_HINT_SECONDS * 1000, 1000), false, 'gone after the seconds');
});

test('naval hint: the brief chip is narrower than the old strip, translucent, and hidden unless raised', () => {
  const source = read('minigames/naval-hud.mjs');
  const rule = source.match(/\[data-kid-picker\]\[data-naval-hint=brief\] \.naval-weapon-hint\{([^}]*)\}/);
  assert.ok(rule, 'a rule for the brief hint');
  assert.match(rule[1], /opacity:0/);
  assert.match(rule[1], /pointer-events:none/);
  const width = Number(rule[1].match(/max-width:min\((\d+)px/)[1]);
  assert.ok(width < 295, 'narrower than the 295px strip');
  assert.match(rule[1], /background:#092a3c[0-9a-f]{2}[;}]?/, 'translucent background');
  assert.match(source, /\[data-naval-hint=brief\] \.naval-weapon-hint\[data-show=true\]\{opacity:1\}/);
  assert.match(source, /if\(briefHint\)controls\.dataset\.navalHint='brief'/, 'only set when the flag is not old');
  assert.match(source, /delete controls\.dataset\.navalHint/, 'cleaned on dispose');
});

// ---- 2. Fire rescue: the coach strip shows each instruction for a few seconds, then leaves the buildings free (?fireHint=old) ----
test('fire coach: brief by default, ?fireHint=old keeps the permanent strip', async () => {
  const {fireHintBrief, FIRE_HINT_SECONDS} = await import(new URL('minigames/fire-ui.mjs', root));
  assert.equal(fireHintBrief(''), true);
  assert.equal(fireHintBrief('?fireHint=old'), false);
  assert.equal(fireHintBrief('?dev=1&fireHint=old'), false);
  assert.equal(FIRE_HINT_SECONDS, 6);
  const source = read('minigames/fire-ui.mjs');
  assert.match(source, /hintMemory:fireHintBrief\(\)\?\{/, 'no memory with the old flag, so data-quiet is never set');
  assert.match(source, /if\(ui\.hintMemory\)\{/);
});

test('fire coach: the opening instruction goes after 6 seconds or at the first action', async () => {
  const {fireCoachQuiet} = await import(new URL('minigames/fire-ui.mjs', root));
  const idle = {key: 'fire.guide.select', brief: null, active: false, progress: null, distance: null};
  let memory = {key: null, age: 0, acted: false};
  assert.equal(fireCoachQuiet(memory, idle, 'ready', 0), 'full', 'shown at the start');
  assert.equal(fireCoachQuiet(memory, idle, 'ready', 5.9), 'full');
  assert.equal(fireCoachQuiet(memory, idle, 'ready', 0.2), 'hidden', 'gone after 6 seconds');
  memory = {key: null, age: 0, acted: false};
  assert.equal(fireCoachQuiet(memory, idle, 'ready', 0), 'full');
  assert.equal(fireCoachQuiet(memory, idle, 'driving', 0.1), 'hidden', 'gone at the first action');
  assert.equal(fireCoachQuiet(memory, idle, 'ready', 0.1), 'hidden', 'and it does not come back');
  // the mission brief shown during the opening grace counts as the opening instruction too
  memory = {key: null, age: 0, acted: false};
  const brief = {key: 'fire.mission.11.brief', brief: 'fire.mission.11.brief', active: false, progress: null, distance: null};
  assert.equal(fireCoachQuiet(memory, brief, 'ready', 0), 'full');
  assert.equal(fireCoachQuiet(memory, brief, 'spraying', 1), 'hidden');
});

test('fire coach: a new instruction shows for 6 seconds; a planned drive keeps only the distance and the cancel button', async () => {
  const {fireCoachQuiet} = await import(new URL('minigames/fire-ui.mjs', root));
  const memory = {key: 'fire.guide.select', age: 20, acted: true};
  const route = {key: 'fire.guide.approachFire', brief: null, active: true, progress: null, distance: 14};
  assert.equal(fireCoachQuiet(memory, route, 'driving', 0.1), 'full', 'the new instruction is shown although the child already acted');
  assert.equal(fireCoachQuiet(memory, route, 'driving', 6), 'compact', 'then only the small part stays while the drive is planned');
  const cool = {key: 'fire.guide.cool', brief: null, active: false, progress: 0.4, distance: null};
  assert.equal(fireCoachQuiet(memory, cool, 'spraying', 0), 'full');
  assert.equal(fireCoachQuiet(memory, cool, 'spraying', 7), 'compact', 'a filling bar stays');
  assert.equal(fireCoachQuiet(memory, {...cool, progress: 0}, 'spraying', 1), 'hidden', 'an empty bar is not a reason to stay');
  assert.equal(fireCoachQuiet(memory, {...cool, progress: null}, 'ready', 1), 'hidden');
  const css = read('minigames/fire.css');
  assert.match(css, /\.fire-coach\[data-quiet=hidden\]\{opacity:0;visibility:hidden;pointer-events:none/);
  assert.match(css, /\.fire-coach\[data-quiet=compact\] \.fire-coach-text\{display:none\}/);
  assert.match(css, /\.fire-coach\[data-quiet=compact\]\{left:auto/, 'the compact part hugs the pause side and does not span the street');
});
