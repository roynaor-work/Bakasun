import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs} from '../cli.mjs';
import {resolveGame, games} from '../../scenarios/games.mjs';
import {hasFirstFrame, aggregate, checkUrlExpectation} from '../telemetry.mjs';
import {buildReport, renderHtml} from '../report.mjs';
import {diagnosticChecks} from '../diagnostics.mjs';
import {browserArgs} from '../runtime.mjs';

test('requested roster resolves all ten games and public aliases', () => {
  assert.equal(games.length, 10);
  assert.equal(new Set(games.map(g => g.id)).size, 10);
  assert.equal(resolveGame('פושע').id, 'catchCriminal');
  assert.equal(resolveGame('criminal').id, 'catchCriminal');
  assert.equal(resolveGame('hoops').id, 'streetSlam');
  assert.throws(() => resolveGame('unknown'), /Unknown game/);
});

test('first-frame detection rejects the hub, paused/loading states and stale canvas counters', () => {
  const frame = {active: true, current: true, canvas: {width: 844, height: 390}, triangles: 5, drawCalls: 2, phase: 'play'};
  assert.ok(hasFirstFrame(frame));
  for (const override of [{active: false}, {current: false}, {paused: true}, {starting: true}, {canvas: null}, {triangles: 0}, {drawCalls: 0}, {phase: 'menu'}, {phase: 'loading'}, {stateError: 'failed'}]) assert.equal(hasFirstFrame({...frame, ...override}), false, JSON.stringify(override));
});

test('missing renderer data remains missing and cannot turn into a successful zero counter', () => {
  assert.deepEqual(aggregate([{active: false, triangles: 1000, drawCalls: 50}, {active: true, triangles: null, drawCalls: null}]), {samples: 0, triangles: null, drawCalls: null});
  assert.deepEqual(aggregate([{active: true, triangles: 10, drawCalls: 2}, {active: true, triangles: 20, drawCalls: 4}]), {samples: 2, triangles: {min: 10, max: 20, mean: 15}, drawCalls: {min: 2, max: 4, mean: 3}});
});

test('URL regression checks inspect observed renderer state, including false/null expectations', () => {
  assert.equal(checkUrlExpectation([{metrics: {environment: null}}], {path: 'metrics.environment', equals: null}).pass, true);
  assert.equal(checkUrlExpectation([{}], {path: 'metrics.environment', equals: null}).pass, false);
  assert.equal(checkUrlExpectation([{metrics: {environment: 'night'}}], {path: 'metrics.environment', equals: null}).pass, false);
});

test('CLI rejects malformed durations and preserves full URL flag values', () => {
  assert.deepEqual(parseArgs(['--query', 'a=b=c', '--play-ms', '30000']).query, {a: 'b=c'});
  for (const args of [['--play-ms', 'NaN'], ['--play-ms', '-1'], ['--timeout-ms', '0'], ['--query', 'dev=0'], ['--unknown'], ['--scenario', 'oops']]) assert.throws(() => parseArgs(args));
});

test('normal application codecs and the optional no-WASM diagnostic are separate launch modes', () => {
  assert.equal(parseArgs(['--no-wasm']).noWasm, true);
  assert.ok(!browserArgs().some(arg => arg.includes('jitless')));
  assert.ok(browserArgs({noWasm: true}).includes('--js-flags=--jitless'));
});

test('report keeps blocked stages, nonzero diagnostics and escapes application error HTML', () => {
  const diagnostics = {consoleErrors: [{text: '<script>alert(1)</script>'}], pageErrors: [], cspViolations: [{effectiveDirective: 'script-src'}], crashes: []};
  assert.equal(diagnosticChecks(diagnostics).filter(c => !c.pass).length, 2);
  const report = buildReport([{game: 'test', label: '<img onerror=x>', variant: 'base', status: 'failed', render: {}, diagnostics, samples: [], screenshots: {}, checks: [], checkpoints: [{name: 'finish', status: 'blocked'}], failure: {phase: 'opening', message: '<script>alert(1)</script>'}}]);
  const html = renderHtml(report);
  assert.equal(report.summary.failed, 1);
  assert.match(html, /finish: blocked/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img onerror/);
});
