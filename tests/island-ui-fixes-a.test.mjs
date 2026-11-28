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

// ---- 3. Catch the criminal: words over the fleeing car only at selection, the bend notice at the side (?catchLabels=old) ----
test('catch labels: compact by default, ?catchLabels=old keeps the floating labels', async () => {
  const {catchLabelsCompact, catchLabelsShown, CATCH_LABEL_SECONDS} = await import(new URL('minigames/catch-arsenal-hud.mjs', root));
  assert.equal(catchLabelsCompact(''), true);
  assert.equal(catchLabelsCompact('?catchLabels=old'), false);
  assert.equal(catchLabelsCompact('?dev=1&catchLabels=old'), false);
  assert.ok(CATCH_LABEL_SECONDS >= 2 && CATCH_LABEL_SECONDS <= 4);
  assert.equal(catchLabelsShown(5000, null), false, 'nothing was picked yet');
  assert.equal(catchLabelsShown(5000, 5000), true, 'right after a pick');
  assert.equal(catchLabelsShown(5000 + CATCH_LABEL_SECONDS * 1000, 5000), false, 'gone after the moment');
});

test('catch labels: the name and the reason hide outside selection, the bend chip leaves the damage bar, the tool name wraps', () => {
  const source = read('minigames/catch-arsenal-hud.mjs');
  assert.match(source, /\[data-catch-labels=compact\] \.catch-reticle\[data-v8\]\[data-labels=false\] em\{display:none\}/, 'the target name');
  assert.match(source, /\[data-catch-labels=compact\] \.catch-reticle\[data-v8\]\[data-labels=false\]\[data-q=off\] b\{display:none\}/, 'the reason under a grey ring');
  const bend = source.match(/\[data-catch-labels=compact\] \.catch-bend\{([^}]*)\}/);
  assert.ok(bend, 'a rule for the bend chip');
  assert.match(bend[1], /left:max\(14px,env\(safe-area-inset-left\)\)/, 'at the side');
  assert.match(bend[1], /transform:none/, 'not centred over the damage bar');
  assert.ok(Number(bend[1].match(/font-size:(\d+)px/)[1]) < 16, 'smaller than before');
  const name = source.match(/\[data-catch-labels=compact\] \.catch-weapon strong\{([^}]*)\}/);
  assert.ok(name && /white-space:normal/.test(name[1]), 'a long tool name wraps inside its button');
  assert.match(source, /const compact = fix8 && catchLabelsCompact\(\)/, 'only with the flag on');
  assert.match(source, /e\.type === 'dry'\) \{ raiseLabels\(\)/, 'a press in vain shows the reason');
  assert.match(source, /delete hud\.dataset\.catchLabels/, 'cleaned on dispose');
});

test('catch loading: the words sit under the start dots, above the start overlay (z-index 11)', () => {
  const rule = read('minigames/catch.css').match(/\.game-screen\[data-starting=true\] \.catch-loading:not\(\[hidden\]\)\{([^}]*)\}/);
  assert.ok(rule, 'a rule for the loading words while the game starts');
  assert.ok(Number(rule[1].match(/z-index:(\d+)/)[1]) > 11, 'above the overlay');
  assert.match(rule[1], /inset:calc\(50% \+ \d+px\) 0 auto 0/, 'under the dots, not behind them');
  assert.match(rule[1], /background:none/, 'the dots stay visible');
});

// ---- 4. Aliens in 3D: the whole ship above the bottom edge, the stick see-through over it (?alienBounds=old) ----
test('alien bounds: on by default, ?alienBounds=old keeps the old flight line', async () => {
  const {alienBoundsOn, alienPlayerY, alienBoxesOverlap, ALIEN_BOUNDS_MARGIN} = await import(new URL('minigames/alien-move.mjs', root));
  assert.equal(alienBoundsOn(''), true);
  assert.equal(alienBoundsOn('?alienBounds=old'), false);
  assert.equal(alienBoundsOn('?dev=1&alienBounds=old'), false);
  // a 480-unit field drawn 390px high; the configured line is 38.4 units from the bottom
  const k = 390 / 480;
  assert.equal(alienPlayerY(480, 38.4, 0, k), 480 - 38.4, 'nothing measured: the configured line');
  assert.equal(alienPlayerY(480, 38.4, 10, k), 480 - 38.4, 'a small ship never moves lower than the configured line');
  const y = alienPlayerY(480, 38.4, 60, k);
  assert.ok(y < 480 - 38.4, 'a ship drawn 60px under its centre is lifted');
  assert.ok(Math.abs((480 - y) * k - (60 + ALIEN_BOUNDS_MARGIN)) < 1e-9, 'its lowest pixel ends one margin above the bottom edge');
  assert.equal(alienPlayerY(480, 38.4, 60, 0), 480 - 38.4, 'no scale yet');
  // sideways: a 360-unit field drawn 844px wide, hit circle 18 units
  const {alienPlayerXRange} = await import(new URL('minigames/alien-move.mjs', root));
  const kx = 844 / 360;
  assert.deepEqual(alienPlayerXRange(360, 18, 0, kx), [18, 342], 'nothing measured: the model range');
  const [min, max] = alienPlayerXRange(360, 18, 50, kx);
  assert.ok(min > 18 && Math.abs(min * kx - 54) < 1e-9, 'the ship edge stays 4px inside the screen');
  assert.equal(max, 360 - min, 'the same on the other side');
  assert.deepEqual(alienPlayerXRange(360, 18, 900, kx), [90, 270], 'never closes more than a quarter of the field on each side');
  const stick = {left: 78, right: 178, top: 265, bottom: 365};
  assert.equal(alienBoxesOverlap({left: 100, right: 190, top: 300, bottom: 380}, stick), true);
  assert.equal(alienBoxesOverlap({left: 300, right: 390, top: 300, bottom: 380}, stick), false);
  assert.equal(alienBoxesOverlap(null, stick), false);
});

test('alien bounds: the session lifts the line only in the 3D picture and only with the flag on', () => {
  const session = read('minigames/alien-session.mjs');
  assert.match(session, /const boundsOn=alienBoundsOn\(\)/);
  assert.match(session, /if\(boundsOn&&view\?\.mode==='three'&&view\.playerBox/);
  assert.match(session, /model\.player\.y=y/);
  assert.match(session, /if\(boundsX&&view\?\.mode==='three'\)\{const p=model\.player;if\(p\.x<boundsX\[0\]\)/, 'the sideways range is applied after the model step, in 3D only');
  assert.match(session, /stick\.dataset\.shipUnder/);
  assert.match(read('minigames/alien-view.mjs'), /return \{ready,playerBox,resize/);
  assert.match(read('minigames/alien-v25.css'), /#joystick\[data-ship-under=true\]\{opacity:\.38/);
});

// ---- 5. Tennis score board: the player's row has a name like the rival's (?tennisNames=old) ----
test('tennis board: the player row carries the child name, or a default when there is none', async () => {
  const {tennisBoardNames, tennisPlayerLabel} = await import(new URL('minigames/tennis-ui.mjs', root));
  assert.equal(tennisBoardNames(''), true);
  assert.equal(tennisBoardNames('?tennisNames=old'), false);
  assert.equal(tennisPlayerLabel('נועם'), 'נועם');
  assert.equal(tennisPlayerLabel('  נועם '), 'נועם');
  for (const empty of ['', '   ', undefined, null, 7]) assert.equal(tennisPlayerLabel(empty), 'אני', 'a default name: ' + JSON.stringify(empty));
  assert.match(read('minigames/tennis-session.mjs'), /if\(!i&&tennisBoardNames\(\)\)dot\.dataset\.name=tennisPlayerLabel\(ctx\.state\.avatar\?\.name\)/);
  const css = read('minigames/tennis.css');
  const off = css.indexOf('.tennis-player-dot::after{content:none}'), on = css.indexOf('.tennis-player-dot[data-name]::after{content:attr(data-name)');
  assert.ok(off > 0 && on > off, 'the named row wins over the v11 rule that removed the captions');
});

test('no foreign-script letters in the new interface strings', () => {
  const added = [read('minigames/tennis-ui.mjs').split('v25.2')[1], read('minigames/catch-arsenal-hud.mjs').match(/const CSS_COMPACT = `[^`]*`/)[0]].join('\n');
  assert.doesNotMatch(added, /[\u0600-\u06FF]/);
});
