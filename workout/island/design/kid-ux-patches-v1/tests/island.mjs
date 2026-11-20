const action = name => `[data-action="${name}"]`;
const fullTarget = (rect, size = 44) => !!rect && rect.visibleWidth >= size && rect.visibleHeight >= size && rect.centerHit;
const rounded = n => typeof n === 'number' ? +n.toFixed(2) : null;
const dimensions = rect => rect && [rounded(rect.width), rounded(rect.height)];
const horizontalGap = (a, b) => Math.max(a.left - b.right, b.left - a.right);
const point = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

export default {
  '009': async ({ tap, box, check, shot }) => {
    await tap(action('avatar-start'));
    const pairs = [
      ['home', 'toggle-more'],
      ['toggle-city', 'toggle-tasks'],
      ['city-map', 'city-tour'],
      ['quick-games', 'quick-scores'],
      ['quick-scores', 'quick-training'],
      ['quick-training', 'quick-learning'],
    ];
    for (const [one, two] of pairs) {
      const first = await box(action(one)), second = await box(action(two));
      const gap = horizontalGap(first, second);
      check(gap >= 7.9 && fullTarget(first) && fullTarget(second), {
        pair: [one, two], gapPx: rounded(gap), dimensions: [dimensions(first), dimensions(second)],
      });
    }
    await shot('navigation');
    await tap(action('city-tour'));
    check((await box('.city-tour-hint'))?.visible, 'The nearby tour action opens the tour without opening the map.');
    await tap(action('city-tour-stop'));
  },

  '010': async ({ tap, box, check, shot, page }) => {
    await tap(action('avatar-start'));
    await tap(action('city-map'));
    const close = await box(action('city-map-close')), destination = await box(action('city-go-cityHall'));
    check(fullTarget(close, 48) && fullTarget(destination, 48), {
      close: dimensions(close), destination: dimensions(destination),
      closeVisible: close?.visibleHeight, destinationVisible: destination?.visibleHeight,
    });
    check(destination?.fontPx >= 14 && destination?.ratio >= 4.5 && destination?.text.includes('עירייה'), {
      destinationFontPx: destination?.fontPx, contrast: rounded(destination?.ratio), label: destination?.text,
    });
    await shot('map');
    await tap(action('city-go-cityHall'));
    check(await page.locator('#city-map-panel').isHidden(), 'A trusted touch on the city hall destination closes the map.');
    await tap(action('city-map'));
    await tap(action('city-map-close'));
    check(await page.locator('#city-map-panel').isHidden(), 'The dedicated close target closes the map.');
  },

  '011': async ({ page, tap, box, swipe, check, shot, note }) => {
    const preview = await box('.avatar-preview');
    const name = await box('[data-field="nameId"]');
    const gender = await box('[data-field="gender"]');
    const legends = await page.locator('.avatar-field legend').evaluateAll(nodes => nodes.slice(0, 2).map(el => Number.parseFloat(getComputedStyle(el).fontSize)));
    const hint = await box('.kid-avatar-scroll-hint');
    check(preview?.height <= 105 && fullTarget(name) && fullTarget(gender), {
      previewHeight: rounded(preview?.height), name: dimensions(name), nameVisible: name?.visibleHeight,
      gender: dimensions(gender), genderVisible: gender?.visibleHeight,
    });
    check(legends.every(px => px >= 14) && hint?.visible, { legendFontsPx: legends, scrollHint: hint?.text ?? null });
    note('The test draws one frame using the real avatar preview renderer while the decorative world is paused.');
    await page.evaluate(() => __island.view.renderAvatarPreview());
    await shot('avatar');
    const nameChoice = page.locator('[data-field="nameId"]').nth(1);
    if ((await box(nameChoice))?.centerHit) {
      await tap(nameChoice);
      check(await nameChoice.getAttribute('aria-pressed') === 'true', 'A visible name choice is selected by touch.');
    }
    if (gender?.centerHit) {
      const genderChoice = page.locator('[data-field="gender"]').nth(1);
      if ((await box(genderChoice))?.centerHit) {
        await tap(genderChoice);
        check(await genderChoice.getAttribute('aria-pressed') === 'true', 'A visible gender choice is selected by touch.');
      }
    }
    const scroll = await box('.avatar-scroll');
    const start = await box(action('avatar-start'));
    const { x } = point(scroll);
    await swipe(x, start.top - 22, x, scroll.top + 50);
    check(await page.locator('.avatar-scroll').evaluate(el => el.scrollTop > 0), 'A vertical touch swipe reveals the remaining choices.');
    const startAfterSwipe = await box(action('avatar-start'));
    check(fullTarget(startAfterSwipe) && startAfterSwipe.ratio >= 4.5, {
      startAfterSwipe: dimensions(startAfterSwipe), contrast: rounded(startAfterSwipe?.ratio),
    });
  },

  '012': async ({ page, tap, box, check, shot, note }) => {
    await tap(action('avatar-start'));
    await tap(action('toggle-tasks'));
    const picture = await box('.kid-city-hall-picture');
    const animation = await page.locator('.kid-city-hall-finger').evaluateAll(els =>
      els.map(el => getComputedStyle(el).animationName));
    check(picture?.visible && animation.some(name => name !== 'none'), {
      illustratedCityHall: picture?.visible ?? false, fingerAnimation: animation[0] ?? null,
    });
    const hear = await box(action('tutorial-city-hall-hear'));
    check(fullTarget(hear, 48), { speechButton: dimensions(hear) });
    const hallHighlighted = await page.evaluate(() => {
      const { view, engine } = __island;
      const hall = engine.state.buildings.find(building => building.typeId === 'cityHall');
      return view.cityGrowth.cues.some(cue => cue.id === hall?.id);
    });
    check(hallHighlighted, { hallHighlighted });
    if (hallHighlighted) {
      note('The test draws one frame of the paused world to capture the normal City Hall highlight.');
      await page.evaluate(() => __island.view.renderWorld());
    }
    await shot('tutorial');
    if (hear?.centerHit) await tap(action('tutorial-city-hall-hear'));
    await tap(action('tutorial-city-hall'));
    const confirmation = await box('.kid-city-hall-confirmed');
    check(confirmation?.visible && (await box('.info-card[data-type="cityHall"]'))?.visible, {
      confirmation: confirmation?.text ?? null, cityHallOpened: await page.locator('.info-card[data-type="cityHall"]').isVisible(),
    });
    await shot('city-hall-open');
  },

  '013': async ({ page, tap, box, check, shot }) => {
    await tap(action('avatar-start'));
    await tap(action('toggle-city'));
    const subtitle = await box('.city-details .brand p');
    check(subtitle?.fontPx >= 14 && subtitle?.ratio >= 4.5, {
      subtitle: subtitle?.text, fontPx: subtitle?.fontPx, contrast: rounded(subtitle?.ratio),
    });
    const metrics = await page.locator('.city-details .metric').evaluateAll(rows => ({
      all: rows.length, visible: rows.filter(row => row.checkVisibility()).length,
    }));
    const summary = await box('.kid-city-stats-more summary');
    check(metrics.visible === 3 && metrics.all > 3 && fullTarget(summary), {
      metrics, disclosure: dimensions(summary),
    });
    await shot('city-summary');
    if (summary?.centerHit) {
      await tap('.kid-city-stats-more summary');
      const count = await page.locator('.city-details .metric').evaluateAll(rows => rows.filter(row => row.checkVisibility()).length);
      check(count === metrics.all && await page.locator('.city-details .resources').isVisible(), {
        expandedMetrics: count, resourcesVisible: await page.locator('.city-details .resources').isVisible(),
      });
      await shot('city-details');
    }
  },

  '014': async ({ page, tap, box, check, shot }) => {
    await tap(action('avatar-start'));
    await tap(action('toggle-city'));
    await tap(action('city-management'), { scroll: true });
    const advice = await box(action('kid-city-next')), forecast = await box('.kid-city-forecast');
    const original = await box(action('city-toggle-management'));
    check(fullTarget(advice, 48) && advice.ratio >= 4.5 && forecast?.visible && forecast.fontPx >= 14, {
      recommendation: advice?.text ?? null, forecast: forecast?.text ?? null,
      recommendationHeight: advice?.height, recommendationContrast: rounded(advice?.ratio), baselinePrimaryHeight: original?.height,
    });
    await shot('recommendation');
    if (!advice?.centerHit) return;
    await tap(action('kid-city-next'));
    check(await page.evaluate(() => __island.engine.state.cityManagement.enabled), 'The recommended start changes the city engine policy.');
    await tap(action('kid-city-mode-toggle'));
    const start = await box(action('city-toggle-management'));
    check(fullTarget(start, 48) && start.ratio >= 4.5, { advancedStart: dimensions(start), contrast: rounded(start?.ratio) });
    await tap(action('city-tab-budget'));
    check(await page.locator('#city-page-budget .city-ledger').isVisible(), 'Budget is still available in the full management view.');
    await shot('budget');
  },

  '028': async ({ page, seed, tap, box, check, shot, note }) => {
    const game = 'tennis';
    await seed();
    await page.evaluate(() => {
      const { engine } = __island;
      engine.state.learning.startDay = '2026-01-01';
      engine.state.learning.roundsToday = 0;
      engine.save();
    });
    note('Synthetic later-day gate with two required rounds, age seven. The first seven answers in each round are set through the normal model so the final answer and navigation can be touched.');
    await tap(action('quick-games'));
    await tap(`[data-action="game-enter"][data-game-id="${game}"]`, { scroll: true });
    await tap(action('game-play'));
    const route = await page.locator('[data-daily-mission]').getAttribute('data-kid-daily-route');
    const stages = await page.locator('.kid-daily-journey-item:not(.kid-daily-game)').evaluateAll(items =>
      items.map(el => ({ dots: el.querySelector('.kid-daily-questions').textContent.length, finished: el.dataset.finished })));
    const speaker = await box(action('kid-daily-hear'));
    check(route === game && stages.length === 2 && stages.every(s => s.dots === 8 && s.finished === 'false') && fullTarget(speaker, 48), {
      route, stages, speaker: dimensions(speaker),
    });
    await shot('two-rounds');
    if (route !== game) return;
    await tap(action('kid-daily-hear'));
    for (let roundNumber = 0; roundNumber < 2; roundNumber++) {
      await tap('[data-action="daily-station"][data-station="math"]', { scroll: true });
      const answer = await page.evaluate(() => {
        const { engine, learning } = __island;
        for (let i = 0; i < 7; i++) {
          engine.answerLearning(engine.learningRound().question.answer);
          engine.nextLearning();
        }
        learning.drawQuestion();
        return engine.learningRound().question.answer;
      });
      await tap(page.locator(action('learning-answer')).and(page.getByText(answer, { exact: true })).first());
      await tap(action('learning-next'));
      await page.locator('[data-learning-result=math]').waitFor({state: 'visible', timeout: 45_000});
      if (roundNumber===0) {
        const nextRound = await box(action('learning-result-daily'));
        check(fullTarget(nextRound, 48), { nextRound: dimensions(nextRound), visible: nextRound?.visibleHeight });
        await tap(action('learning-result-daily'));
        const completed = await page.locator('.kid-daily-journey-item[data-finished="true"]').count();
        check(completed===1, { completedAfterFirstRound: completed });
        await shot('second-round');
      }
    }
    const resume = await box(action('kid-daily-resume'));
    check(fullTarget(resume, 48) && !await page.evaluate(() => __island.engine.learningStatus().locked), {
      resume: resume?.text, dimensions: dimensions(resume), locked: await page.evaluate(() => __island.engine.learningStatus().locked),
    });
    await shot('return-to-game');
    if (resume?.centerHit) {
      await tap(action('kid-daily-resume'));
      check(await page.locator(`[data-game-home="${game}"]`).isVisible(), { returnedTo: game });
    }
  },
};
