import test from 'node:test';
import assert from 'node:assert/strict';
import {serveIsland, islandChromium} from '../../../../../tests/helpers/island-browser.mjs';
import {LEVELS, WEATHERS, WEAPON_UPGRADES, levelWeather} from '../../../minigames/boar-island/levels.mjs';
import {wavePlan, waveBonus, waveWeather} from '../../../minigames/boar-island/core.mjs';

const panel = '#boar-levels-panel';
const state = frame => frame.evaluate(() => window.__boar.state);
const ready = frame => frame.waitForFunction(() => Boolean(window.__boar));

async function finishFirstWave(frame) {
  return frame.evaluate(() => {
    // Use accelerated game time only for the fight. Rewards and phase changes use the game's real callbacks.
    const qa = window.__boar;
    for (let sec = 0; sec < 300 && qa.state.mode === 'battle'; sec++) {
      qa.sim(1);
      qa.killAll();
    }
    return qa.state;
  });
}

test('campaign through the picker, garage, reload and island iframe', {timeout:600000}, async t => {
  const server = await serveIsland();
  t.after(() => server.close());
  const chromium = await islandChromium();
  const browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());
  const ctx = await browser.newContext({viewport:{width:844,height:390}, hasTouch:true, reducedMotion:'reduce'});
  const errors = [];
  ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await ctx.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('boar-island-quality','normal');
    localStorage.setItem('island.sound','off');
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const path = new URL('minigames/boar-island/index.html?qa=1&island=1', server.url).href;
  const reloadGame = async () => {
    await page.evaluate(() => window.__boarIsland?.dispose());
    await page.goto(path, {waitUntil:'commit'});
    await ready(page);
    await page.evaluate(() => __boar.hold(true));
  };
  const openPicker = async (button = '#start') => {
    await page.locator(button).click();
    assert.ok(await page.locator(panel + '[open]').isVisible());
    assert.equal(await page.locator(panel + ' [data-level]').count(), LEVELS.length);
  };

  await t.test('fresh map locks later levels, first win unlocks level two, and replay preserves the frontier', async () => {
    await reloadGame();
    assert.equal((await state(page)).campaignEnabled,true);
    await openPicker();
    assert.ok(await page.locator('[data-level="2"]').isDisabled());
    await page.locator('[data-level="1"]').click();
    const initial = await state(page);
    assert.equal(initial.wave,1);
    assert.equal(initial.mode,'battle');
    const first = await finishFirstWave(page);
    assert.equal(first.mode,'shop');
    assert.equal(first.save.nextWave,2);
    assert.deepEqual(first.campaignProgress.cleared,[1]);
    const firstPayout = first.coins - initial.coins;
    await openPicker('#boar-levels-map');
    assert.ok(await page.locator('[data-level="2"]').isEnabled());
    assert.ok(await page.locator('[data-level="3"]').isDisabled());
    await page.locator('[data-level="1"]').click();
    const replayStart = await state(page);
    const replay = await finishFirstWave(page);
    assert.deepEqual(replay.campaignProgress,first.campaignProgress);
    assert.equal(replay.save.nextWave,2);
    assert.equal(firstPayout - (replay.coins - replayStart.coins), waveBonus(1), 'completion bonus is paid once');
  });

  await t.test('buying through the garage deducts exactly one price and survives a fresh page', async () => {
    const upgrade = WEAPON_UPGRADES.find(entry => entry.id === 'mg-jacket');
    await page.locator('#boar-levels-upgrades').click();
    const buy = page.locator('[data-upgrade="mg-jacket"]');
    const before = await state(page);
    assert.ok(await buy.isEnabled());
    await buy.click();
    assert.ok(await buy.isDisabled());
    const after = await state(page);
    assert.equal(after.coins, before.coins - upgrade.cost);
    assert.ok(after.campaignProgress.upgrades.includes(upgrade.id));
    await reloadGame();
    await page.locator('#garage').click();
    await page.locator('#boar-levels-upgrades').click();
    assert.ok(await buy.isDisabled());
    assert.deepEqual((await state(page)).campaignProgress, after.campaignProgress);
    await page.locator('#boar-levels-close').click();
    assert.equal((await state(page)).mode, 'shop');
  });

  await t.test('new weather uses its assigned renderer preset and gameplay modifier on level entry', async () => {
    const oldSave = await page.evaluate(() => JSON.parse(localStorage.getItem('boar-island-v1')));
    for (const key of ['heat','breeze']) {
      const level = LEVELS.find(level => levelWeather(level.id) === key);
      assert.ok(level, key);
      // Advance only the stock frontier counters, preserving purchases. Use the player-facing button.
      await page.evaluate(({save, n}) => {
        __boar.menu();
        __boar.setSave({...save, bestWave:n - 1, nextWave:n});
      }, {save:oldSave, n:level.id});
      await openPicker();
      await page.locator('[data-level="' + level.id + '"]').click();
      const wx = await page.evaluate(() => __boar.wx());
      assert.equal(wx.set, key);
      assert.equal(wx.kind, key);
      assert.equal(wx.cool, WEATHERS[key].cooling);
      assert.equal((await state(page)).wave,level.id);
    }
  });

  await t.test('island launch forwards the off switch, retains the stock wave and leaves stored campaign choices intact', async () => {
    const before = await state(page);
    const storedProgress = before.campaignProgress;
    assert.ok(storedProgress.upgrades.includes('mg-jacket'));
    const host = new URL('campaign-test-host.html?dev=1&boarsLevels=0',server.url);
    await page.route(host.href, route => route.fulfill({contentType:'text/html',
      body:'<!doctype html><main><section><canvas></canvas><div id="controls"></div></section><p id="status"></p><p id="warning"></p></main>'}));
    await page.evaluate(() => window.__boarIsland?.dispose());
    await page.goto(host.href, {waitUntil:'domcontentloaded'});
    await page.evaluate(async () => {
      const {runBoarSession} = await import('./minigames/boar-session.mjs');
      const el = selector => document.querySelector(selector);
      window.boarSession = runBoarSession({
        canvas:el('canvas'), dialog:el('main'), controls:el('#controls'),
        warning:el('#warning'), status:el('#status'), t:k=>k, cancel:()=>{},
      });
    });
    await page.waitForFunction(() => window.boarSession.snapshot.ready);
    const frame = page.frames().find(f => f.url().includes('/boar-island/index.html'));
    assert.ok(frame);
    assert.equal(new URL(frame.url()).searchParams.get('boarsLevels'),'0');
    await ready(frame);
    await frame.evaluate(() => __boar.hold(true));
    assert.equal((await state(frame)).campaignEnabled,false);
    await frame.locator('#start').click();
    const stock = await state(frame);
    assert.equal(stock.mode,'battle');
    assert.equal(stock.wave, before.save.nextWave);
    assert.equal(stock.remaining, wavePlan(stock.wave).length);
    assert.equal((await frame.evaluate(() => __boar.wx())).set, waveWeather(stock.wave));
    assert.equal(await frame.locator('[data-level]').count(),0);
    await page.evaluate(() => window.boarSession.dispose());
    await reloadGame();
    assert.deepEqual((await state(page)).campaignProgress,storedProgress);
  });
  assert.deepEqual(errors,[]);
});
