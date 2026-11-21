const action = name => '[data-action="' + name + '"]';
const target = (metrics, size = 48) => metrics?.centerHit && metrics.visibleWidth >= size && metrics.visibleHeight >= size;
const display = metrics => metrics?.visible ? {
  width: Math.round(metrics.visibleWidth * 10) / 10,
  height: Math.round(metrics.visibleHeight * 10) / 10,
  fontPx: metrics.fontPx,
  centerHit: metrics.centerHit,
  text: metrics.text,
  contrast: Math.round(metrics.ratio * 100) / 100,
} : null;

async function startAlpine({page, seed, note, tap}) {
  await seed();
  note('Development API opens the live snowboarding league and a trusted touchscreen gesture presses its start button.');
  await page.evaluate(() => {
    const {games, engine} = window.__island;
    if (!engine.state.instructionsSeen.includes('alpineRush')) engine.state.instructionsSeen.push('alpineRush');
    games.alpineLeagueGo(1);
  });
  const selector = action('alpine-start');
  await page.locator(selector).waitFor({state:'visible', timeout:75_000});
  await page.waitForFunction(selector => !document.querySelector(selector)?.disabled, selector, {timeout:60_000});
  await tap(selector);
  await page.waitForFunction(() => window.__island.games.current?.session.snapshot.phase === 'racing', null, {timeout: 120_000});
}

async function startRace({page, note}) {
  const city = new URL(page.url());
  const fixture = new URL('tools/perf-racing.html', city);
  fixture.search = new URLSearchParams({
    dev:'1', shot:'1', hold:'1', stage:'13', frames:'5000',
    racingField:'5', racingBroadcast:'0', racingPitCrew:'0', racingV7:'0', racingFormulaAll:'0',
  });
  if (city.searchParams.has('kidUx')) fixture.searchParams.set('kidUx', city.searchParams.get('kidUx'));
  // The performance page mounts the stock racing session. Give it the
  // application's Hebrew translator instead of its timing-oriented key labels.
  await page.route('**/tools/perf-racing-page.mjs', async route => {
    const response = await route.fetch(), source = await response.text();
    const body = source.replace('const t=k=>k;', [
      "import {createTranslator} from '../ui/translate.mjs';",
      "const t=createTranslator(await (await fetch('../data/strings.he.json')).json());",
    ].join('\n'));
    await route.fulfill({response, body});
  });
  note('Repository racing performance page with the stock race session, HUD and controls, and Hebrew translations. Stage 13 runs three laps with five cars and simplified scenery for software WebGL. The fixture advances the stock countdown without player input.');
  await page.goto(fixture.href, {waitUntil:'domcontentloaded',timeout:60_000});
  await page.waitForFunction(() => Boolean(window.__session?.ready), null, {timeout:120_000});
  await page.evaluate(() => {
    const model = window.__session.debug.model;
    for (let step = 0; step < 16 && model.state.phase === 'countdown'; step++) model.step(.25);
  });
  await page.waitForFunction(() => window.__session?.snapshot.phase === 'racing',null,{timeout:60_000});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function boar({page, seed, tap, note}) {
  await seed();
  await page.evaluate(() => window.__island.games.intro('boarDefense',undefined,1));
  await tap(action('game-understood'), {scroll:true});
  await page.waitForFunction(() => {
    const frame = document.querySelector('.boar-game-frame');
    if (!frame?.contentWindow?.__boarIsland?.ready) return false;
    const qa = frame.contentWindow.__boar;
    if (qa && !qa.clock().frames) return false;
    qa?.hold(true);
    return true;
  }, null, {timeout: 90_000});
  note('The embedded campaign is the same-origin game iframe. The QA hold freezes its decorative rendering after the menu has loaded.');
  const frame = page.frames().find(candidate => candidate.url().includes('/boar-island/index.html'));
  if (!frame) throw new Error('Boar campaign frame is missing');
  return frame;
}

export default {
  '021': async context => {
    const {page, box, tap, shot, check} = context;
    await startRace(context);
    const auto = action('racing-auto');
    if (await page.locator(auto).getAttribute('aria-pressed') === 'true') await tap(auto);
    const pit = action('racing-pit');
    const pitBox = await box(pit);
    const gas = await box('.racing-accelerate');
    const nitro = await box('.racing-nitro');
    const gap = Math.min(gas?.y - pitBox?.bottom, nitro?.y - pitBox?.bottom);
    check(target(pitBox), {pit: display(pitBox)});
    check(gap >= 8, {verticalGapToGasAndNitro: gap});
    await tap(pit);
    await page.waitForFunction(() => Boolean(window.__session.snapshot.player.pitRequest));
    await page.waitForFunction(selector => document.querySelector(selector)?.dataset.state === 'requested', pit, {timeout:25_000});
    const notice = await box('.racing-pit-notice');
    check(notice?.visible && notice.fontPx >= 14 && notice.ratio >= 4.5 && pitBox?.left > notice.right && /החל|צמיגים/.test(notice.text),
      {persistentNoticeOutsideTouchTarget: display(notice), pitRequestAccepted: true});
    await shot('pit-request');
  },

  '022': async context => {
    const {page, box, tap, shot, check, note} = context;
    await startRace(context);
    const initial = await Promise.all(['.racing-speed-unit', '.racing-auto', '.racing-energy-tag', '.racing-hint'].map(box));
    check(initial.every(item => item?.visible && item.fontPx >= 14 && item.ratio >= 4.5), {speedAutoEnergyTip: initial.map(display)});
    check(/⚡/.test(initial[2]?.text || '') && !/ERS/.test(initial[2]?.text || ''), {energyLabel: initial[2]?.text});
    const guide = page.locator('.racing-hint[data-kid-racing-step]');
    const steps = [];
    if (await guide.count()) {
      note('The fixture advances only the normal model clock to the next guide cue. The racing session renders each cue.');
      for (let step=0; step<3; step++) {
        if (step) await page.evaluate(seconds => {
          const model=window.__session.debug.model;
          for (let turn=0; turn<30 && model.state.time<seconds; turn++) model.step(.25);
        }, step*3+.1);
        const selector='.racing-hint[data-kid-racing-step="' + step + '"]';
        await page.locator(selector).waitFor({state:'visible', timeout:25_000});
        steps.push(await page.locator(selector).evaluate(node => ({ art: node.querySelector('span')?.textContent, copy: node.querySelector('b')?.textContent })));
      }
      await shot('driving-step-3');
    } else {
      await shot('driving-tip');
    }
    check(steps.length === 3 && steps.every(step => step.art && step.copy) && new Set(steps.map(step => step.art)).size === 3, {steps});
    const auto = page.locator(action('racing-auto'));
    const before = await auto.getAttribute('aria-pressed');
    await tap(auto);
    const after = await auto.getAttribute('aria-pressed');
    check(after !== before, {touchTogglesAutomaticAcceleration: after !== before, before, after});
  },

  '023': async context => {
    const {page, seed, note, tap, swipe, shot, check} = context;
    await seed();
    note('Development navigation opens the real racing stage map. The season table opens by trusted touch and is scrolled by touch.');
    await page.evaluate(() => window.__island.games.stages('islandRacing'));
    await page.locator(action('racing-league-season')).waitFor({state:'visible',timeout:35_000});
    await tap(action('racing-league-season'));
    const chips = page.locator('.rl-table .rl-chip-no');
    await chips.first().waitFor({state:'attached',timeout:35_000});
    await swipe(450, 297, 450, 118, 8);
    const numbers = await chips.evaluateAll(nodes => {
      const light = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => channel / 255)
        .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126,.7152,.0722][index], 0);
      return nodes.map(node => {
        const style = getComputedStyle(node), number = node.textContent;
        const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(node.parentElement).backgroundColor : style.backgroundColor;
        const tones = [light(style.color), light(background)].sort((a, b) => b - a);
        return {number, fontPx:parseFloat(style.fontSize), ratio:Math.round((tones[0] + .05) / (tones[1] + .05) * 100) / 100};
      });
    });
    check(numbers.length === 12 && numbers.every(item => item.ratio >= 4.5 && item.fontPx >= 14), {numbers});
    await chips.first().scrollIntoViewIfNeeded();
    note('After the touch scroll, the first driver number is repositioned programmatically if needed for the screenshot.');
    await shot('season-standings');
  },

  '024': async context => {
    const {page, box, tap, shot, check} = context;
    const frame = await boar(context);
    const buttons = await Promise.all(['#help','#quality','#aim-sens','#island-back'].map(s => box(frame.locator(s))));
    check(buttons.every(button => target(button) && button.fontPx >= 14 && button.ratio >= 4.5), {helpQualitySensitivityExit: buttons.map(display)});
    const save = await box(frame.locator('.save-note'));
    check(save?.visible && save.fontPx >= 14 && save.ratio >= 4.5 && /חזרה לאי/.test(buttons[3]?.text), {save:display(save),exit:display(buttons[3])});
    await shot('campaign-menu');
    await tap(frame.locator('#island-back'));
    const returned = await page.evaluate(() => !window.__island.games.current);
    check(returned, {touchReturnsToIsland:returned});
  },

  '025': async context => {
    const {box, tap, swipe, shot, check} = context;
    const frame = await boar(context);
    await tap(frame.locator('#garage'));
    const items = ['#tab-weapons','#tab-upgrades','.weapon-card button','#next-wave','#shop-back'];
    const initial = await Promise.all(items.map(s => box(frame.locator(s))));
    check(initial.every(button => target(button) && button.fontPx >= 14), {shopTabsFirstPurchaseNextBack: initial.map(display)});
    await shot('garage-first-fold');
    await tap(frame.locator('#tab-upgrades'));
    const upgrade = await box(frame.locator('.upgrade-card button'));
    check(upgrade?.height >= 48 && upgrade.fontPx >= 14, {fortificationPurchase: display(upgrade)});
    await swipe(400, 250, 400, 125, 7);
    const footer = await Promise.all(items.slice(-2).map(s => box(frame.locator(s))));
    const scrollTop = await frame.locator('#shop').evaluate(node => Math.max(node.scrollTop, node.querySelector('.kid-boar-shop-body')?.scrollTop || 0));
    check(scrollTop > 0 && footer.every(button => target(button)) && footer.every((button, i) => Math.abs(button.bottom - initial[i + 3].bottom) < 1),
      {footerAfterTouchScroll: footer.map(display), scrollTop});
    await shot('garage-scrolled');
  },

  '026': async context => {
    const {box, tap, shot, check} = context;
    const frame = await boar(context);
    await tap(frame.locator('#help'));
    const visuals = frame.locator('.kid-boar-gesture');
    const visibleHelp = await frame.locator('#help-screen').innerText();
    const animationCount = await visuals.count() ? await visuals.evaluate(node => node.getAnimations({subtree:true}).length) : 0;
    check(animationCount >= 3 && !/\b[QER]\b/.test(visibleHelp), {gestureAnimations: animationCount, visibleHelp});
    const close = await box(frame.locator('#help-close'));
    const speak = await box(frame.locator('.kid-boar-help-actions .secondary'));
    check(target(close) && target(speak), {continue:display(close), replay:display(speak)});
    if (speak?.centerHit) await tap(frame.locator('.kid-boar-help-actions .secondary'));
    await shot('touch-briefing');
  },

  '029': async context => {
    const {page, box, tap, shot, check, note} = context;
    await startAlpine(context);
    const buttons = ['grab','spin','flip','combo'].map(id => '[data-trick="' + id + '"]');
    const labels = await Promise.all(buttons.map(button => box(button + ' .alpine-trick-label')));
    const caption = await box('.alpine-trick-caption');
    check(labels.every(label => label?.visible && label.fontPx >= 14 && label.ratio >= 4.5) && caption?.visible && caption.fontPx >= 14 && caption.ratio >= 4.5,
      {trickLabels: labels.map(display), caption: display(caption)});
    await page.locator(buttons[1] + '[data-ready="false"]').waitFor({state:'visible',timeout:30_000});
    await page.locator(buttons[1]).evaluate(button => {
      const session = window.__island.games.current.session;
      session.debug.engine.step = () => {};
      button.addEventListener('pointerdown', event => {
        const preview = document.querySelector('.kid-alpine-preview');
        window.__kidTrickPress = {ready:button.dataset.ready, selected:preview?.dataset.trick, hidden:preview?.hidden, trusted:event.isTrusted};
      }, {once:true});
    });
    note('The fixture holds the already-reached grounded model frame while the real touch activates the trick illustration.');
    await tap(buttons[1], {hold:0,wait:0});
    const preview = page.locator('.kid-alpine-preview[data-trick="spin"]');
    const count = await preview.count();
    const animated = count
      ? await preview.evaluate(node => !node.hidden && node.querySelector('.rider').getAnimations().some(animation => animation.playState === 'running'))
      : false;
    check(animated, {groundedTouchShowsAnimatedTrick: animated, count, event:await page.evaluate(() => window.__kidTrickPress), preview:display(await box(preview))});
    await shot('trick-preview');
  },

  '030': async context => {
    const {page, box, check, shot} = context;
    await startAlpine(context);
    const goal = '[data-goal="place"].alpine-goal';
    const {text, rank} = await page.locator(goal + ' b').evaluate(node => ({
      text:node.innerText, rank:window.__island.games.current.session.snapshot.frame.rank
    }));
    const metric = await box(goal);
    const flight = await box('.alpine-flight-cue');
    const overlapsFlight = Boolean(flight?.visible && metric && flight.left < metric.right && flight.right > metric.left && flight.top < metric.bottom && flight.bottom > metric.top);
    const labels = text.split('\n');
    check(labels[0] === 'עכשיו מקום ' + rank && /^למעבר: מקום \d+ או טוב יותר$/.test(labels[1] || '') && metric?.fontPx >= 14 && metric.ratio >= 4.5 && !overlapsFlight,
      {liveRank: rank, placeGoalChip: display(metric), labels, overlapsFlight});
    await shot('place-goal');
  },
};
