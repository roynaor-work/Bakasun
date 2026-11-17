#!/usr/bin/env node
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {games, resolveGame} from '../scenarios/games.mjs';
import {urlCases, selectUrlCase} from '../scenarios/url-flags.mjs';
import {harnessRoot, launchBrowser} from './runtime.mjs';
import {runScenario} from './runner.mjs';
import {serveIsland} from './server.mjs';
import {writeReport} from './report.mjs';

const help = `Island E2E harness v1 (Node 20+, Playwright Chromium)
Usage: node src/cli.mjs [options]
  --games all|soccer,hoops,...    Default: all ten requested games
  --scenario lifecycle|opening|play30|finish   Default: lifecycle
  --query key=value             Repeat to pass real application URL flags
  --case ID                     Run one documented URL regression case
  --matrix                      Baselines plus documented URL regression cases
  --play-ms NUMBER              Default: 30000; shorter runs are labelled nonstandard
  --timeout-ms NUMBER           Default: 90000 per readiness/interaction wait
  --finish exit|natural         Default: exit (pause, confirm exit, reopen island menu)
  --finish-timeout-ms NUMBER    Default: 180000 for natural completion
  --max-triangles NUMBER        Optional peak sampled triangle budget
  --max-draw-calls NUMBER       Optional peak sampled draw-call budget
  --base-url URL                Default: serve original island locally
  --output DIR                  Default: <harness>/artifacts/latest
  --headed                      Show Chromium (still uses CDP touch)
  --no-wasm                     Diagnostic: disable WASM and JS JIT in Chromium
  --list                        List games and regression cases
  --help
Environment: ISLAND_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs
             CHROMIUM_PATH=/usr/bin/chromium
Exit: 0 all checks pass; 1 game/check failure; 2 invalid setup/options.
`;

export function parseArgs(args) {
  const options = {games: 'all', query: {}};
  const valued = new Map([['games', 'games'], ['scenario', 'scenario'], ['case', 'caseId'], ['play-ms', 'playMs'], ['timeout-ms', 'timeoutMs'], ['finish', 'finishMode'], ['finish-timeout-ms', 'finishTimeoutMs'], ['base-url', 'baseUrl'], ['output', 'outputDir'], ['max-triangles', 'maxTriangles'], ['max-draw-calls', 'maxDrawCalls']]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-wasm') { options.noWasm = true; continue; }
    if (['--help', '--list', '--matrix', '--headed'].includes(arg)) { options[arg.slice(2)] = true; continue; }
    if (arg === '--query') {
      const value = args[++i], split = value?.indexOf('=') ?? -1;
      if (split < 1) throw new Error('--query requires key=value');
      const key = value.slice(0, split);
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid query key');
      options.query[key] = value.slice(split + 1); continue;
    }
    const key = valued.get(arg.slice(2));
    if (!arg.startsWith('--') || !key) throw new Error(`Unknown option: ${arg}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${arg}`);
    if (['playMs', 'timeoutMs', 'finishTimeoutMs', 'maxTriangles', 'maxDrawCalls'].includes(key)) {
      options[key] = Number(value);
      if (!Number.isFinite(options[key]) || options[key] < (key === 'playMs' ? 0 : 1)) throw new Error(`Invalid number: ${arg}`);
    } else options[key] = value;
  }
  if (options.caseId && options.matrix) throw new Error('--case and --matrix are mutually exclusive');
  if (options.scenario && !['lifecycle', 'opening', 'play30', 'finish'].includes(options.scenario)) throw new Error('Invalid --scenario');
  if (options.finishMode && !['exit', 'natural'].includes(options.finishMode)) throw new Error('Invalid --finish');
  if (options.query.dev !== undefined && options.query.dev !== '1') throw new Error('dev=1 is required for read-only renderer telemetry');
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(help); return 0; }
  if (options.list) { console.log(JSON.stringify({games: games.map(({id, label, aliases}) => ({id, label, aliases})), urlCases}, null, 2)); return 0; }
  const selected = options.games === 'all' ? games : [...new Set(options.games.split(',').map(s => resolveGame(s.trim())))];
  const tasks = options.caseId ? [selectUrlCase(options.caseId)] : [
    ...selected.map(g => ({game: g.id, id: 'baseline', query: {}})),
    ...(options.matrix ? urlCases.filter(c => selected.some(g => g.id === c.game)) : [])
  ];
  const outputDir = path.resolve(options.outputDir ?? path.join(harnessRoot, 'artifacts/latest'));
  const results = []; let browser, server;
  let revision = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: harnessRoot, encoding: 'utf8'}).trim(); } catch {}
  const metadata = {revision, options: {...options, outputDir}, node: process.version,
    firstFrameMeasurement: 'Polling renderer.info through existing read-only snapshots; excludes island boot, includes final launch loading/countdown.',
    rendererMeasurement: 'Sampled per-frame counters, not a guaranteed all-frame maximum. Reflection/shadow inclusion follows each game renderer.',
    finishDefinition: options.finishMode === 'natural' ? 'Bounded natural stage/match end, then UI exit' : 'User pause -> confirmed exit -> disposed session -> usable island menu'};
  try {
    browser = await launchBrowser(options);
    if (!options.baseUrl) server = await serveIsland();
    for (const task of tasks) {
      console.log(`[${results.length + 1}/${tasks.length}] ${task.game} / ${task.id}: ${options.scenario ?? 'lifecycle'}`);
      const result = await runScenario(task.game, {...options, outputDir, browser, baseUrl: options.baseUrl || server.url,
        variant: task.id, query: {...task.query, ...options.query}, expectation: task.expectation, deferReport: true});
      results.push(result);
      await writeReport(outputDir, results, metadata);
      console.log(`  ${result.status.toUpperCase()} frame=${result.firstFrameMs ?? '—'}ms play=${result.playWallMs}ms tris=${result.render.triangles?.max ?? '—'} calls=${result.render.drawCalls?.max ?? '—'}${result.failure ? ' · ' + result.failure.message : ''}`);
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
    if (results.length) await writeReport(outputDir, results, metadata);
  }
  console.log(`JSON: ${path.join(outputDir, 'report.json')}\nHTML: ${path.join(outputDir, 'report.html')}`);
  return results.every(r => r.status === 'passed') ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.stack || error); process.exitCode = 2; });
}
