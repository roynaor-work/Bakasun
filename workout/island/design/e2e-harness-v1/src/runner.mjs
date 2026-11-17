import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveGame} from '../scenarios/games.mjs';
import {harnessRoot, viewport, browserArgs, launchBrowser, delay} from './runtime.mjs';
import {serveIsland} from './server.mjs';
import {monitor, diagnosticChecks} from './diagnostics.mjs';
import {TouchInput} from './touch.mjs';
import {snapshot, hasFirstFrame, aggregate, checkUrlExpectation} from './telemetry.mjs';
import {enterFromIsland, exitToIsland} from './navigation.mjs';
import {playCycle} from './play.mjs';
import {writeReport} from './report.mjs';

function validateOptions(options) {
  const playMs = options.playMs ?? 30000, timeoutMs = options.timeoutMs ?? 90000;
  if (!Number.isFinite(playMs) || playMs < 0) throw new Error('playMs must be a finite nonnegative number');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');
  if (!['lifecycle', 'opening', 'play30', 'finish'].includes(options.scenario ?? 'lifecycle')) throw new Error('Unknown scenario');
  if (!['exit', 'natural'].includes(options.finishMode ?? 'exit')) throw new Error('finishMode must be exit or natural');
  for (const key of ['finishTimeoutMs', 'maxTriangles', 'maxDrawCalls']) {
    if (options[key] !== undefined && (!Number.isFinite(options[key]) || options[key] <= 0)) throw new Error(`${key} must be positive`);
  }
  if (options.query && ![Object.prototype, null].includes(Object.getPrototypeOf(options.query))) throw new Error('query must be a plain object');
  if (options.query?.dev !== undefined && String(options.query.dev) !== '1') throw new Error('Read-only metrics require dev=1');
  return {playMs, timeoutMs};
}

/** One fresh browser context, one real UI journey, three independently reported
 * checkpoints. Failures are returned (and saved), so one game cannot hide others.
 * Setup/configuration errors throw before browser work; test failures do not. */
export async function runScenario(gameName, options = {}) {
  const game = resolveGame(gameName), {playMs, timeoutMs} = validateOptions(options);
  const scenario = options.scenario ?? 'lifecycle', finishMode = options.finishMode ?? 'exit';
  const outputDir = path.resolve(options.outputDir ?? path.join(harnessRoot, 'artifacts/latest'));
  const query = Object.fromEntries(Object.entries(options.query ?? {}).map(([key, value]) => [key, String(value)]));
  const variant = options.variant || (Object.keys(query).length ? createHash('sha256').update(JSON.stringify(query)).digest('hex').slice(0, 10) : 'baseline');
  if (!/^[a-zA-Z0-9._-]+$/.test(variant) || variant === '..') throw new Error('variant must be a simple artifact name');
  const artifactDir = path.join(outputDir, game.id, variant);
  await mkdir(artifactDir, {recursive: true});
  const result = {
    schemaVersion: 1, game: game.id, label: game.label, variant, scenario, startedAt: new Date().toISOString(),
    status: 'failed', url: null, query, viewport: {...viewport}, device: {hasTouch: true, isMobile: true, deviceScaleFactor: 1},
    launchArgs: browserArgs(options), noWasm: !!options.noWasm, finishMode, requestedPlayMs: playMs, standard30Seconds: scenario !== 'opening' && playMs >= 30000,
    firstFrameMs: null, islandToFirstFrameMs: null, playWallMs: 0, playActiveMs: 0, replays: 0, naturalEnds: [], simulationDeltaSeconds: null,
    checkpoints: [], checks: [], samples: [], screenshots: {}, diagnostics: null, input: {transport: 'CDP Input.dispatchTouchEvent', events: 0}, failure: null
  };
  let browser = options.browser, context, server, page, touch, audit, phase = 'opening';
  const started = performance.now(); let launchAt = null;
  const journal = [];
  const capture = async name => {
    const filename = `${name}.png`;
    await page.screenshot({path: path.join(artifactDir, filename), timeout: timeoutMs});
    result.screenshots[name] = path.relative(outputDir, path.join(artifactDir, filename)).split(path.sep).join('/');
  };
  const checkpoint = (name, extra = {}) => {
    const errors = diagnosticChecks(audit.data).map(c => ({...c}));
    result.checkpoints.push({name, status: errors.every(c => c.pass) ? 'passed' : 'failed', checks: errors, ...extra});
  };
  try {
    if (!browser) browser = await launchBrowser(options);
    result.browserVersion = browser.version();
    context = await browser.newContext({viewport: {...viewport}, hasTouch: true, isMobile: true, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'he-IL', reducedMotion: 'no-preference'});
    page = await context.newPage(); page.setDefaultTimeout(timeoutMs); page.setDefaultNavigationTimeout(timeoutMs);
    const cdp = await context.newCDPSession(page);
    audit = await monitor(context, page, cdp); audit.setPhase('opening'); result.diagnostics = audit.data;
    touch = new TouchInput(page, cdp, journal);
    const wasmExposed = await page.evaluate(() => typeof WebAssembly !== 'undefined');
    result.wasmExposedBeforeNavigation = wasmExposed;
    if (options.noWasm) {
      result.checks.push({name: 'webassembly-disabled-before-navigation', pass: !wasmExposed, actual: wasmExposed});
      if (wasmExposed) throw new Error('Browser exposes WebAssembly. Launch through launchBrowser({noWasm:true}).');
    }
    let baseUrl = options.baseUrl;
    if (!baseUrl) { server = await serveIsland(); baseUrl = server.url; }
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('baseUrl must use HTTP(S)');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    url.searchParams.set('dev', '1'); result.url = url.href;
    const navigationAt = performance.now();
    await page.goto(url.href, {waitUntil: 'domcontentloaded'});
    let lastObservationAt = 0;
    const first = await enterFromIsland({page, touch, game, timeoutMs, markLaunch: () => { launchAt = performance.now(); }, onObserve: s => {
      if (performance.now() - lastObservationAt > 500) { result.samples.push(s); lastObservationAt = performance.now(); }
    }});
    result.firstFrameMs = Math.round(performance.now() - launchAt);
    result.islandToFirstFrameMs = Math.round(performance.now() - navigationAt);
    result.firstFrameDefinition = 'First observed active, unpaused game canvas with positive renderer triangles and draw calls; sampled after CDP launch touch. Includes asset loading/countdown after that touch.';
    result.samples.push(first);
    result.checks.push({name: 'game-first-frame', pass: hasFirstFrame(first), actual: result.firstFrameMs});
    result.checks.push({name: 'mobile-viewport', pass: first.viewport.width === 844 && first.viewport.height === 390 && first.viewport.dpr === 1, actual: first.viewport});
    if (options.noWasm) result.checks.push({name: 'webassembly-disabled', pass: first.wasmExposed === false && first.childWasmExposed !== true, actual: {parent: first.wasmExposed, child: first.childWasmExposed ?? null}});
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy" i]').getAttribute('content');
    result.csp = policy;
    result.documentPolicies = await Promise.all(page.frames().map(async frame => ({url: frame.url(), meta: await frame.locator('meta[http-equiv="Content-Security-Policy" i]').evaluateAll(nodes => nodes.map(n => n.content))})));
    result.checks.push({name: 'application-csp-present', pass: !!policy?.trim(), actual: policy});
    await capture('opening'); checkpoint('opening', {firstFrameMs: result.firstFrameMs});
    if (scenario !== 'opening') {
      phase = 'play30'; audit.setPhase(phase);
      const playInitial = await snapshot(page, game);
      const playStarted = performance.now(), safetyDeadline = playStarted + Math.max(180000, playMs * 8, timeoutMs * 2);
      let cycle = 0, activeSamples = 0, previousSimulation = playInitial.simulationSeconds, simulationProgress = 0, sawSimulation = false;
      const countSimulation = value => {
        if (Number.isFinite(value) && Number.isFinite(previousSimulation)) { simulationProgress += Math.max(0, value - previousSimulation); sawSimulation = true; }
        previousSimulation = value;
      };
      while (result.playActiveMs < playMs) {
        if (performance.now() > safetyDeadline) throw new Error('Timed out collecting the requested active play duration');
        const s = await snapshot(page, game); result.samples.push(s);
        if (!s.active || !s.current) {
          if (!s.resultVisible) throw new Error('Game disappeared before the play duration without a result');
          result.naturalEnds.push({atActiveMs: Math.round(result.playActiveMs), result: s});
          await capture(`natural-end-${result.naturalEnds.length}`);
          // A short level can end before 30 seconds. Replay through the island
          // menu and exclude result screens/loading from active play time.
          await exitToIsland({page, touch, game, timeoutMs});
          await enterFromIsland({page, touch, game, timeoutMs, markLaunch() {}});
          result.replays++; previousSimulation = null;
          continue;
        }
        if (game.embedded && ['shop', 'gameover'].includes(s.phase)) {
          const next = page.frameLocator('.boar-game-frame').locator(s.phase === 'shop' ? '#next-wave' : '#retry');
          await touch.tap(next); result.replays++; previousSimulation = null; continue;
        }
        countSimulation(s.simulationSeconds);
        if (!s.paused && !s.starting) activeSamples++;
        const intervalStarted = performance.now(), deadline = intervalStarted + playMs - result.playActiveMs;
        await playCycle({page, touch, game, cycle: cycle++, deadline});
        await delay(Math.min(120, Math.max(0, deadline - performance.now())));
        const after = await snapshot(page, game); result.samples.push(after);
        // Count only intervals bounded by two live observations. A cycle that
        // crosses a natural end contributes zero, so a result screen cannot
        // inflate the required active play duration.
        if (!s.paused && !s.starting && after.active && after.current && !after.paused && !after.starting &&
            !['finished', 'complete', 'gameover', 'shop'].includes(after.phase)) result.playActiveMs += performance.now() - intervalStarted;
        countSimulation(after.simulationSeconds);
      }
      result.playWallMs = Math.round(performance.now() - playStarted);
      result.playActiveMs = Math.round(result.playActiveMs);
      const last = await snapshot(page, game); result.samples.push(last);
      countSimulation(last.simulationSeconds);
      if (sawSimulation) result.simulationDeltaSeconds = +simulationProgress.toFixed(3);
      result.checks.push({name: 'requested-play-duration', pass: result.playActiveMs >= playMs && activeSamples > 0, expected: playMs, actual: result.playActiveMs});
      result.checks.push({name: 'game-progress', pass: result.simulationDeltaSeconds === null ? activeSamples >= 2 : result.simulationDeltaSeconds > 0, actual: result.simulationDeltaSeconds, activeSamples});
      await capture('play30'); checkpoint('play30', {wallMs: result.playWallMs, activeMs: result.playActiveMs, replays: result.replays, simulationDeltaSeconds: result.simulationDeltaSeconds});
    }
    if (scenario === 'lifecycle' || scenario === 'finish') {
      phase = 'finish'; audit.setPhase(phase);
      if (finishMode === 'natural') {
        const terminalDeadline = performance.now() + (options.finishTimeoutMs ?? 180000);
        let terminal = false, cycle = 0;
        while (performance.now() < terminalDeadline) {
          const s = await snapshot(page, game); result.samples.push(s);
          if (s.resultVisible || s.active && !s.stateError && ['finished', 'complete', 'gameover', 'shop'].includes(s.phase)) { terminal = true; break; }
          if (!s.current || s.stateError) break;
          await playCycle({page, touch, game, cycle: cycle++, deadline: terminalDeadline});
        }
        result.checks.push({name: 'natural-game-end', pass: terminal, timeoutMs: options.finishTimeoutMs ?? 180000});
      }
      await exitToIsland({page, touch, game, timeoutMs});
      await capture('finish');
      const final = await snapshot(page, game);
      result.checks.push({name: 'disposed-and-returned-to-menu', pass: !final.current && !final.active && final.menuVisible && final.historyDepth === 1, actual: final});
      checkpoint('finish', {mode: finishMode});
    }
    const flagCheck = checkUrlExpectation(result.samples, options.expectation);
    if (flagCheck) result.checks.push(flagCheck);
  } catch (error) {
    result.failure = {phase, message: error.message, stack: error.stack};
    result.checks.push({name: `${phase}-completed`, pass: false, actual: error.message});
    if (page && !page.isClosed()) {
      try { result.samples.push(await snapshot(page, game)); } catch {}
      try { await capture('failure'); } catch (error) { result.screenshotError = error.message; }
    }
    for (const name of ['opening', ...(scenario === 'opening' ? [] : ['play30']), ...(['lifecycle', 'finish'].includes(scenario) ? ['finish'] : [])]) {
      if (!result.checkpoints.some(c => c.name === name)) result.checkpoints.push({name, status: name === phase ? 'failed' : 'blocked', reason: error.message});
    }
  } finally {
    if (touch) { try { await touch.release(); } catch {} }
    // Include dispose/unload diagnostics, rather than declaring success early.
    if (context) { try { await context.close(); } catch (error) { result.cleanupError = error.message; } }
    if (!options.browser && browser) await browser.close();
    if (server) await server.close();
    result.input.events = journal.length;
    if (audit) result.checks.push(...diagnosticChecks(audit.data));
    result.render = aggregate(result.samples);
    result.checks.push({name: 'zero-session-errors', pass: !result.samples.some(s => s.stateError), actual: result.samples.filter(s => s.stateError).map(s => s.stateError)});
    result.checks.push({name: 'render-counters-available', pass: result.render.samples > 0 && result.render.triangles.max > 0 && result.render.drawCalls.max > 0, actual: result.render});
    for (const [option, key] of [['maxTriangles', 'triangles'], ['maxDrawCalls', 'drawCalls']]) {
      if (options[option] !== undefined) result.checks.push({name: `${key}-budget`, pass: !!result.render[key] && result.render[key].max <= options[option], expected: options[option], actual: result.render[key]?.max ?? null});
    }
    result.status = !result.failure && result.checks.every(c => c.pass) && !result.cleanupError ? 'passed' : 'failed';
    for (const cp of result.checkpoints) {
      if (cp.status === 'passed' && result.checks.some(c => c.pass === false && (c.name.startsWith(cp.name) || cp.name === 'play30' && ['requested-play-duration', 'game-progress'].includes(c.name)))) cp.status = 'failed';
    }
    result.finishedAt = new Date().toISOString(); result.durationMs = Math.round(performance.now() - started);
    await writeFile(path.join(artifactDir, 'touches.json'), JSON.stringify(journal, null, 2) + '\n');
    await writeFile(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    if (!options.deferReport) await writeReport(outputDir, [result]);
  }
  return result;
}
