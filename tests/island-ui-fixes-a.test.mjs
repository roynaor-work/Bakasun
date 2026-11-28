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
