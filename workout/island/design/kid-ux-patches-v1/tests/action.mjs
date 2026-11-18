const catchHelp = '.catch-help:visible';

function fitsTarget(target, minimum = 44) {
  return target?.centerHit && target.visibleWidth >= minimum && target.visibleHeight >= minimum;
}

function textFits(measured, minimum = 14) {
  return measured?.visible && measured.fontPx >= minimum && measured.ratio >= 4.5;
}

export default {
  '031': async ({page, seed, startGame, tap, box, check, shot, note}) => {
    await seed();
    note('Synthetic stage unlock and truck parked at the real entrance through the developer API. The door and tool selection use touch.');
    await page.evaluate(() => { __island.engine.state.minigameProgress.fireRescue.stage = 30; });
    await startGame('fireRescue', 12);
    await page.waitForFunction(() => Boolean(__island.games.current?.session.debug?.flow), null, {timeout: 40_000});
    await page.evaluate(() => {
      const {flow, model} = __island.games.current.session.debug;
      const [x,,z] = flow.building.door;
      Object.assign(model.truck, {x, z, speed: 0});
    });
    await page.waitForFunction(() => __island.games.current?.session.snapshot.v24?.enterButton, null, {timeout: 25_000});
    await tap('#fire-enter');
    await page.waitForFunction(() =>
      __island.games.current?.session.snapshot.v24?.interior?.ready &&
      document.querySelector('.fv24-fade')?.dataset.state === 'clear', null, {timeout: 45_000});
    const extinguisher = '.fv24-tool[data-tool=extinguisher]';
    const roomCard = page.locator('.fv24-card[data-card=room]:visible');
    await page.locator('.fv24-card[data-card=room]:visible, ' + extinguisher + ':visible').first().waitFor({timeout: 55_000});
    if (await roomCard.count()) await tap(roomCard);
    await page.locator(extinguisher + ':visible').waitFor({timeout: 40_000});
    const targets = ['water','extinguisher','blanket'];
    const buttons = await Promise.all(targets.map(tool => box('.fv24-tool[data-tool=' + tool + ']')));
    const labels = await Promise.all(targets.map(tool => box('.fv24-tool[data-tool=' + tool + '] .fv24-tool-label')));
    check(buttons.every(button => fitsTarget(button)) && labels.every(label => textFits(label)),
      {labels: labels.map(label => [label?.text, label?.fontPx, label?.ratio]), targets: buttons.map(button => [button?.visibleWidth, button?.visibleHeight])});
    await tap('.fv24-tool[data-tool=extinguisher]');
    await page.waitForFunction(() => document.querySelector('.fv24-tool[data-tool=extinguisher]')?.getAttribute('aria-pressed') === 'true');
    const preview = await box('.fv24-kid-tool-demo:visible');
    check(textFits(preview) && preview.text.includes('⚡'), {selected: 'extinguisher', preview: preview?.text});
    await shot('tool-selected');
  },

  '032': async ({page, seed, startGame, tap, box, check, shot}) => {
    await seed();
    await startGame('alienDefense');
    await page.locator('.alien-controls #shoot:visible').waitFor({timeout: 40_000});
    const noticeSelector = '.alien-flight-feedback:visible [data-alien-hud-label]';
    await page.locator(noticeSelector).waitFor({timeout: 20_000}).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    });
    const caption = await box('#vulcan .alien-fire-caption');
    const plain = await box('#shoot .alien-fire-caption');
    const wave = await box(noticeSelector);
    check([caption,plain,wave].every(label => textFits(label)), {labels: [caption,plain,wave].map(label => [label?.text, label?.fontPx, label?.ratio])});
    await shot('wave-and-controls');
    const special = await box('.alien-special-switch');
    if (!fitsTarget(special)) {
      check(false, {specialTarget: [special?.visibleWidth, special?.visibleHeight]});
      return;
    }
    const oldSpecial = await page.locator('.alien-controls').getAttribute('data-alien-special');
    await tap('.alien-special-switch');
    await page.waitForFunction(old => document.querySelector('.alien-controls')?.dataset.alienSpecial !== old, oldSpecial);
    const demo = await box('.alien-kid-demo:visible');
    const label = await box('#pass .alien-kid-caption');
    check(fitsTarget(special) && textFits(label) && textFits(demo) && demo.text.includes('🛸'),
      {specialTarget:[special?.visibleWidth,special?.visibleHeight], selected: label?.text, demonstration: demo?.text});
    await shot('weapon-demo-after-switch');
  },

  '033': async ({page, seed, startGame, tap, check, shot}) => {
    await page.evaluate(() => { __kidTest.captureCanvasText = true; });
    await seed();
    await startGame('navalDuel');
    await page.waitForFunction(() => Object.values(__kidTest.canvasText).some(row => row.text.includes('בכפתור הנעילה')), null, {timeout: 35_000});
    const labels = await page.evaluate(() => {
      const rows = Object.values(__kidTest.canvasText);
      const find = pattern => rows.find(row => pattern.test(row.text));
      return {
        clock: find(/^\d+:\d{2}$/),
        hull: find(/^\d+%$/),
        ammo: rows.find(row => /^\d+\/\d+$/.test(row.text) && row.x === 48 && row.y === 92),
        lock: find(/בכפתור הנעילה/),
      };
    });
    check(Object.values(labels).every(label => label?.cssFontPx >= 14), labels);
    await shot('canvas-hud');
    const event = await tap('.naval-lock-btn');
    await page.waitForFunction(() => {
      const snapshot = __island.games.current.session.snapshot;
      return Boolean(snapshot.homing || snapshot.v241?.radar);
    });
    const lock = await page.evaluate(() => {
      const snapshot = __island.games.current.session.snapshot;
      return snapshot.homing || snapshot.v241?.radar;
    });
    check(event.trusted && event.pointerType === 'touch' && lock?.index >= 0, {lockButton: event.action, lockModel: lock});
  },

  '034': async ({page, seed, startGame, tap, box, check, shot}) => {
    page.setDefaultTimeout(40_000);
    await seed();
    await startGame('navalDuel');
    await page.locator('.naval-weapon-picker:visible').waitFor();
    await tap('.naval-weapon-picker');
    await page.waitForFunction(() => {
      const rack = document.querySelector('.ammo-rack');
      return rack && !rack.inert && getComputedStyle(rack).visibility === 'visible' && Number(getComputedStyle(rack).opacity) > .98;
    });
    const rack = await box('.ammo-rack');
    const geometry = await page.evaluate(() => {
      const {snapshot} = __island.games.current.session;
      const rack = document.querySelector('.ammo-rack').getBoundingClientRect();
      return snapshot.enemyScreens
        .filter(target => target.depth > 0 && target.x >= 0 && target.x < innerWidth && target.y >= 0 && target.y < innerHeight)
        .map(({x, y}) => ({x, y, obscured: x >= rack.left && x <= rack.right && y >= rack.top && y <= rack.bottom}));
    });
    const rows = await page.locator('.ammo-rack button').count();
    const labels = await Promise.all(Array.from({length: rows}, (_, i) => box('.ammo-rack [data-ammo-index="' + i + '"] .naval-ammo-name')));
    const examples = await page.locator('.ammo-rack .naval-ammo-purpose:visible').allTextContents();
    const targets = await Promise.all(Array.from({length: rows}, (_, i) => box('.ammo-rack [data-ammo-index="' + i + '"]')));
    check(rows === 6 && labels.every(label => textFits(label)) && targets.every(target => fitsTarget(target)) && examples.length === 6,
      {fontPx: labels.map(label => label?.fontPx), examples, widths: targets.map(target => target?.visibleWidth)});
    check(geometry.length > 0 && geometry.every(target => !target.obscured), {rack: [rack?.x, rack?.y, rack?.width, rack?.height], visibleEnemyCenters: geometry});
    await shot('six-illustrated-choices');
    const option = page.locator('.ammo-rack [data-ammo-index="1"]:enabled');
    await tap(option);
    await page.waitForFunction(() => document.querySelector('.game-controls').dataset.weapon === '1');
    const selection = await box('.naval-picked-name');
    check(textFits(selection) && await page.locator('.naval-weapon-picker').getAttribute('aria-expanded') === 'false',
      {selected: selection?.text, fontPx: selection?.fontPx});
    await shot('selected-weapon');
  },

  '035': async ({page, seed, startGame, tap, swipe, box, check, shot, note}) => {
    await seed();
    await startGame('catchCriminal');
    await page.locator(catchHelp).waitFor({timeout: 45_000});
    const exercise = page.locator('.catch-kid-exercise:visible');
    check(await exercise.count() === 1, {firstChaseParagraphs: await page.locator(catchHelp + ' > .catch-help-card > p').count(),
      illustratedExercise: await exercise.count()});
    if (!await exercise.count()) {
      await shot('opening-help');
      await tap('.catch-help-ok');
      return;
    }
    // The opening card already suspends its model. Freeze only the
    // decorative 3D redraw behind it while dispatching practice gestures.
    await page.evaluate(() => __island.games.current.session.setPaused(true));
    note('Decorative 3D replay behind the paused practice card is frozen. Practice gestures still use trusted browser touch.');
    await page.evaluate(() => {
      window.__practiceTouches = [];
      for (const type of ['pointerdown','pointermove','pointerup','pointercancel','touchend']) {
        document.addEventListener(type, event => {
          __practiceTouches.push({type, trusted:event.isTrusted, input:event.pointerType, x:event.clientX, y:event.clientY,
            target:event.target.className, exercise:Boolean(event.target.closest('.catch-kid-exercise'))});
        }, true);
      }
    });
    const stages = ['steer','tap','release'];
    for (const [i, expected] of stages.entries()) {
      const measure = await box(exercise);
      const voice = await box('.catch-kid-voice');
      const next = await box('.catch-kid-next');
      check(await exercise.getAttribute('data-gesture') === expected && fitsTarget(measure) && fitsTarget(voice) && fitsTarget(next) &&
        await page.locator('.catch-kid-finger:visible').count() === 1, {gesture: expected, exercise: [measure?.visibleWidth, measure?.visibleHeight], next: [next?.visibleWidth, next?.visibleHeight]});
      await shot('exercise-' + (i + 1));
      const prior = await page.evaluate(() => __practiceTouches.length);
      if (expected === 'tap') await tap(exercise);
      else {
        const {x, y, width, height} = measure;
        const fromX = x + width * 0.3, fromY = y + height * 0.65;
        await swipe(fromX, fromY, fromX + 85, fromY - (expected === 'release' ? 24 : 0));
      }
      await page.waitForFunction(() => document.querySelector('.catch-kid-exercise')?.dataset.done === 'true',
        null, {timeout: 15_000}).catch(error => {
          if (error.name !== 'TimeoutError') throw error;
      });
      const touches = await page.evaluate(prior => __practiceTouches.slice(prior), prior);
      const didFinish = await exercise.getAttribute('data-done') === 'true' && await page.locator('.catch-kid-next').isEnabled();
      check(didFinish && touches.some(event => event.type === 'pointerdown' && event.trusted && event.input === 'touch' && event.exercise),
        {gesture: expected, confirmed: await page.locator('.catch-kid-feedback').textContent(), touches});
      if (!didFinish) return;
      await tap('.catch-kid-next');
    }
    await page.evaluate(() => __island.games.current.session.setPaused(false));
    check(await page.locator(catchHelp).count() === 0 && (await page.evaluate(() => __island.games.current.session.snapshot.mode)) === 'chase',
      {threeExercisesComplete: true, enteredChase: true});
    await shot('chase-after-practice');
  },

  '036': async ({page, seed, startGame, tap, box, check, shot, note}) => {
    await seed();
    await startGame('catchCriminal');
    await page.locator(catchHelp).waitFor({timeout: 45_000});
    if (await page.locator('.catch-kid-skip:visible').count()) await tap('.catch-kid-skip');
    else await tap('.catch-help-ok');
    note('Synthetic chase completion using the existing developer hook. Net choice uses trusted touch during the real capture phase.');
    await page.evaluate(() => __island.games.current.session.debug.skipChase());
    await page.locator('.catch-tool[data-tool=wide]:visible').waitFor({timeout: 28_000});
    const narrow = await box('.catch-tool[data-tool=narrow]'), wide = await box('.catch-tool[data-tool=wide]');
    const ranges = await page.locator('.catch-kid-net-cone path').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
    const labels = await page.locator('.catch-kid-net-range:visible').allTextContents();
    check(fitsTarget(narrow) && fitsTarget(wide) && textFits(narrow) && textFits(wide) && ranges.length >= 2 && ranges[0] !== ranges[1],
      {targets: [narrow,wide].map(b => [b?.visibleWidth,b?.visibleHeight,b?.fontPx,b?.ratio]), illustrations: ranges, labels});
    await tap('.catch-tool[data-tool=wide]');
    const selected = await page.evaluate(() => __island.games.current.session.engine.aim.tool);
    check(selected === 'wide' && await page.locator('.catch-tool[data-tool=wide]').getAttribute('aria-pressed') === 'true', {selected});
    await shot('wide-net-selected');
  },
};
