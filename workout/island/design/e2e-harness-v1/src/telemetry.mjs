// This function is serialized into the page. All app access here is read-only:
// snapshot getters and renderer.info, never debug/model commands or setters.
export function observeGame(expectedId) {
  const api = globalThis.__island;
  const screen = document.querySelector('.game-screen');
  const id = screen?.dataset.game || null;
  if (!api) return {apiReady: false, active: false};
  const sample = {
    apiReady: true, active: id === expectedId, id, atMs: performance.now(), wasmExposed: typeof WebAssembly !== 'undefined',
    viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
    menuVisible: !!document.querySelector('[data-game-library]'),
    resultVisible: !!document.querySelector('[data-result],[data-racing-league-screen=result],[data-alpine-league-screen=result]'),
    current: !!api.games.current,
    historyDepth: history.state?.islandShell?.depth ?? null
  };
  if (!sample.active) return sample;
  const s = api.games.current?.session?.snapshot;
  const m = s?.renderMetrics;
  sample.paused = screen.dataset.paused === 'true' || !!s?.paused;
  sample.starting = screen.dataset.starting === 'true';
  sample.phase = s?.phase ?? s?.frame?.phase ?? s?.campaign?.mode ?? null;
  sample.quality = s?.quality ?? m?.quality ?? null;
  sample.simulationSeconds = s?.elapsed ?? s?.time ?? (s?.tick === undefined ? undefined : s.tick / 60) ?? (s?.frame?.timeMs === undefined ? null : s.frame.timeMs / 1000);
  sample.stateError = s?.error ?? s?.renderError ?? null;
  sample.metrics = m ? {
    triangles: m.triangles ?? null, drawCalls: m.drawCalls ?? m.calls ?? null,
    mode: m.mode ?? null, quality: m.quality ?? null, frame: m.frame ?? m.frames ?? null,
    assetStatus: m.assetStatus ?? null,
    assetStats: m.assetStats ? {kind: m.assetStats.kind, characterSet: m.assetStats.characterSet, source: m.assetStats.source} : null,
    designScene: m.designScene ? {status: m.designScene.status, failure: m.designScene.failure, goals: m.designScene.goals} : null,
    characterVersion: m.characterVersion ?? null, modelCount: m.modelCount ?? null,
    reflection: m.reflection ?? null,
    v7: m.v7 ? {enabled: m.v7.enabled, active: m.v7.active} : null,
    fireV7: m.fireV7 ? {enabled: m.fireV7.enabled, level: m.fireV7.level} : null,
    defenseV7: m.defenseV7 ?? null,
    load: m.load ? {mode: m.load.mode, venueMs: m.load.venueMs, charactersMs: m.load.charactersMs} : null,
    environment: m.environment === undefined ? undefined : m.environment ? {...m.environment} : m.environment,
    characterLoaded: m.characterLoaded ?? null, bufferWidth: m.bufferWidth ?? null, bufferHeight: m.bufferHeight ?? null
  } : null;
  sample.mode = s?.renderMode ?? m?.mode ?? null;
  let canvas = screen.querySelector('canvas:not([hidden])');
  if (expectedId === 'boarDefense') {
    const frame = screen.querySelector('iframe');
    const child = frame?.contentWindow;
    const render = child?.__three?.renderer?.info?.render;
    sample.phase = s?.campaign?.mode ?? null;
    sample.simulationSeconds = s?.campaign?.time ?? null;
    sample.stateError = s?.error ?? null;
    sample.childWasmExposed = child ? typeof child.WebAssembly !== 'undefined' : null;
    sample.boarFlags = child?.__boar?.state?.flags ?? null;
    sample.boarShots = child?.__boar?.state?.shots ?? null;
    sample.metrics = render ? {triangles: render.triangles, calls: render.calls, frame: render.frame} : null;
    canvas = frame?.contentDocument?.querySelector('#scene');
  }
  if (expectedId === 'catchCriminal') {
    const session = api.games.current?.session;
    // The catch adapter exposes no renderMetrics snapshot. view() only returns
    // its current view reference; read renderer.info without issuing a render.
    const render = session?.debug?.view?.()?.renderer?.info?.render;
    sample.metrics = render ? {triangles: render.triangles, drawCalls: render.calls, frame: render.frame} : null;
    sample.simulationSeconds = session?.chase?.state?.t ?? null;
    sample.catchV6 = s?.v6 ?? false;
  }
  const r = canvas?.getBoundingClientRect();
  sample.canvas = r ? {width: r.width, height: r.height, bufferWidth: canvas.width, bufferHeight: canvas.height} : null;
  sample.triangles = sample.metrics?.triangles ?? null;
  sample.drawCalls = sample.metrics?.drawCalls ?? sample.metrics?.calls ?? null;
  return sample;
}

export const snapshot = (page, game) => page.evaluate(observeGame, game.id || game);

export function hasFirstFrame(s) {
  // Never let the island renderer, boar menu or a loading DOM count as gameplay.
  return !!(s.active && s.current && !s.starting && !s.paused && !s.stateError &&
    s.canvas?.width > 0 && s.canvas?.height > 0 && s.triangles > 0 && s.drawCalls > 0 &&
    !['menu', 'loading'].includes(s.phase));
}

export function aggregate(samples) {
  const valid = samples.filter(s => s.active && Number.isFinite(s.triangles) && Number.isFinite(s.drawCalls));
  const values = key => valid.map(s => s[key]);
  const stats = values => values.length ? {min: Math.min(...values), max: Math.max(...values), mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100} : null;
  return {samples: valid.length, triangles: stats(values('triangles')), drawCalls: stats(values('drawCalls'))};
}

export function checkUrlExpectation(observations, expectation) {
  if (!expectation) return null;
  const actual = observations.map(o => expectation.path.split('.').reduce((v, key) => v?.[key], o));
  const matched = actual.findIndex(v => JSON.stringify(v) === JSON.stringify(expectation.equals));
  return {name: 'url-flag-observed', pass: matched >= 0, path: expectation.path,
    expected: expectation.equals, actual: matched >= 0 ? actual[matched] : actual.at(-1) ?? null};
}
