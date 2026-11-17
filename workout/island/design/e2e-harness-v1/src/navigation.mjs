import {until, delay} from './runtime.mjs';
import {snapshot, hasFirstFrame} from './telemetry.mjs';

const action = (page, name) => page.locator(`[data-action="${name}"]`).filter({visible: true}).first();
const visible = async locator => await locator.count() > 0 && await locator.isVisible();

export async function enterFromIsland({page, touch, game, timeoutMs, markLaunch, onObserve = () => {}}) {
  await until(() => page.evaluate(() => !!globalThis.__island), {timeoutMs, description: 'island application ready'});
  if (await visible(action(page, 'avatar-start'))) await touch.tap(action(page, 'avatar-start'));
  // A fresh first-day profile is playable; learning is never disabled by code.
  for (let step = 0; step < 14; step++) {
    const s = await snapshot(page, game);
    if (s.active) break;
    if (await visible(action(page, 'ready-plot-build'))) {
      const build = action(page, 'ready-plot-build');
      if (!await build.isEnabled()) throw new Error(`Required building cannot be built: ${await page.locator('#modal-root').innerText()}`);
      await touch.tap(build); continue;
    }
    if (await page.locator('[data-daily-mission]').count()) throw new Error('Daily learning requirement blocks gameplay; complete it through the UI.');
    if (await visible(action(page, 'game-understood'))) { markLaunch(); await touch.tap(action(page, 'game-understood')); continue; }
    if (await visible(action(page, 'hoops-play-next'))) { markLaunch(); await touch.tap(action(page, 'hoops-play-next')); continue; }
    if (game.id === 'islandRacing' && await page.locator('[data-stage-map=islandRacing]').count()) {
      await until(async () => await visible(action(page, 'racing-league-go')) || await visible(page.locator('[data-action=stage-play]:not([disabled])').first()), {timeoutMs, description: 'racing league card'});
      if (await visible(action(page, 'racing-league-go'))) { markLaunch(); await touch.tap(action(page, 'racing-league-go')); continue; }
    }
    const stage = page.locator('[data-action=stage-play]:not([disabled])').first();
    if (await visible(stage)) { markLaunch(); await touch.tap(stage); continue; }
    if (await visible(action(page, 'game-play'))) { await touch.tap(action(page, 'game-play')); continue; }
    if (await page.locator('[data-game-library]').count()) {
      const enter = page.locator(`[data-action=game-enter][data-game-id="${game.id}"]`);
      if (!await enter.count()) {
        const available = await page.locator('[data-action=game-enter]').evaluateAll(nodes => nodes.map(n => n.dataset.gameId));
        throw new Error(`Game ${game.id} is missing from the island menu. Available: ${available.join(', ')}`);
      }
      markLaunch(); await touch.tap(enter); continue;
    }
    await touch.tap(action(page, 'quick-games'));
  }
  await until(async () => (await snapshot(page, game)).active, {timeoutMs, description: `${game.id} game screen opened through island menu`});
  return until(async () => {
    const s = await snapshot(page, game);
    if (s.starting) return false;
    if (s.drawCalls > 0 && await visible(action(page, 'racing-intro-go'))) await touch.tap(action(page, 'racing-intro-go'));
    const catchHelp = page.locator('.catch-help:not([hidden]) .catch-help-ok');
    if (game.id === 'catchCriminal' && s.drawCalls > 0 && await visible(catchHelp)) await touch.tap(catchHelp);
    if (game.id === 'alpineRush') {
      const start = action(page, 'alpine-start');
      if (await visible(start) && await start.isEnabled()) { markLaunch(); await touch.tap(start); }
    }
    if (game.embedded) {
      const start = page.frameLocator('.boar-game-frame').locator('#start');
      if (await visible(start)) { markLaunch(); await touch.tap(start); }
    }
    const observed = await snapshot(page, game);
    onObserve(observed);
    return hasFirstFrame(observed) ? observed : false;
  }, {timeoutMs, description: `${game.id} first rendered gameplay frame`});
}

export async function exitToIsland({page, touch, game, timeoutMs}) {
  await touch.release();
  const later = page.locator('.uo-later').filter({visible: true}).first();
  if (await visible(later)) await touch.tap(later);
  if (await page.locator('.game-screen').count()) {
    if (!await visible(action(page, 'game-exit'))) await touch.tap(action(page, 'game-pause'));
    await until(() => visible(action(page, 'game-exit')), {timeoutMs, description: 'exit confirmation'});
    await touch.tap(action(page, 'game-exit'));
  } else {
    const close = action(page, 'close-modal');
    if (await visible(close)) await touch.tap(close);
  }
  await until(async () => {
    const s = await snapshot(page, game);
    return !s.current && !s.active && s.historyDepth === 0;
  }, {timeoutMs, description: 'game disposed and island history restored'});
  await delay(150);
  await touch.tap(action(page, 'quick-games'));
  await until(() => visible(page.locator('[data-game-library]')), {timeoutMs, description: 'island game menu usable again'});
}

export {action, visible};
