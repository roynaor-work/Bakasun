import test from 'node:test';
import assert from 'node:assert/strict';
import {whistleFor,whistleAllowedInPhase,hoopsWhistleGain,createWhistleGate,WHISTLE_SPACING,SOCCER_WHISTLE_EVENTS} from '../workout/island/minigames/sports-audio-rules.mjs';

test('soccer: no whistle for throw-ins, corners, goal kicks and keeper distributions', () => {
  for (const restart of ['throwIn', 'corner', 'goalKick', 'keeperThrow', 'keeperPunt']) assert.equal(whistleFor('restart', {restart}), false, restart);
  assert.equal(whistleFor('restart', {restart: 'kickoff'}), true);
});
test('soccer: kickoff, play after a goal, half time, full time and calls whistle; shots and passes never', () => {
  for (const type of ['play', 'halftime', 'fulltime', 'kickoff', 'foul', 'penalty']) assert.equal(whistleFor(type), true, type);
  for (const type of ['shot', 'pass', 'goal', 'loft', 'header', 'restart-windup']) assert.equal(whistleFor(type), false, type);
  assert.deepEqual(SOCCER_WHISTLE_EVENTS.slice().sort(), ['foul', 'fulltime', 'halftime', 'kickoff', 'penalty', 'play'].sort());
});
test('soccer: while the ball is in play only a call or the start of play may whistle', () => {
  assert.equal(whistleAllowedInPhase('halftime', 'playing'), false);
  assert.equal(whistleAllowedInPhase('play', 'playing'), true);
  assert.equal(whistleAllowedInPhase('foul', 'playing'), true);
  assert.equal(whistleAllowedInPhase('halftime', 'halftime'), true);
});
test('basketball: fouls and violations whistle, out of bounds quieter, inbounds silent, only the opening tip', () => {
  assert.equal(hoopsWhistleGain('foul'), .9);
  assert.equal(hoopsWhistleGain('violation', {kind: 'travel'}), .9);
  assert.equal(hoopsWhistleGain('violation', {kind: 'out'}), .6);
  assert.equal(hoopsWhistleGain('inbound'), 0);
  assert.equal(hoopsWhistleGain('jumpBall', {}, {jumpBalls: 0}), .7);
  assert.equal(hoopsWhistleGain('jumpBall', {}, {jumpBalls: 1}), 0);
  assert.equal(hoopsWhistleGain('score'), 0);
});
test('the gate spaces whistles and counts what it blocked', () => {
  const g = createWhistleGate(WHISTLE_SPACING.soccer);
  assert.equal(g.allow(10), true); assert.equal(g.allow(11), false); assert.equal(g.allow(12.9), false); assert.equal(g.allow(13.1), true);
  assert.equal(g.blocked, 2); g.mark(20); assert.equal(g.allow(21), false); g.reset(); assert.equal(g.allow(0), true);
  assert.ok(WHISTLE_SPACING.hoops >= 2 && WHISTLE_SPACING.soccer >= 2);
});
