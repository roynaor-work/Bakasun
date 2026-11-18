function learningAction(action) {
  return `[data-action="learning-${action}"]`;
}

async function setUpPuzzle(page, index, kind) {
  await page.evaluate(index => {
    const { engine, learning } = window.__island;
    const station = engine.state.learning.stations.puzzles;
    station.level = 4;
    station.successStreak = 0;
    learning.start('puzzles');
    for (let step = 0; step < index; step++) {
      engine.answerLearning(engine.learningRound().question.answer);
      station.level = 4;
      station.successStreak = 0;
      engine.nextLearning();
    }
    learning.drawQuestion();
  }, index);
  await page.locator(`.learning-screen[data-kind="${kind}"]`).waitFor();
}

export default {
  async '027'({ page, seed, tap, box, check, note, shot }) {
    await seed();
    note('Level 4, age 7. Browser Hebrew voice inventory is empty. Dev entry opens the normal language-round screen. Answers and progress use trusted touches.');
    await page.evaluate(() => {
      Object.defineProperty(speechSynthesis, 'getVoices', { configurable: true, value: () => [] });
      speechSynthesis.dispatchEvent(new Event('voiceschanged'));
      window.__island.learning.start('language');
    });
    const state = await page.evaluate(() => {
      const { engine } = window.__island;
      const { question } = engine.learningRound();
      const prompt = document.querySelector('.learning-prompt');
      return {
        age: engine.state.learning.age, level: question.level, template: question.template,
        writtenPromptVisible: Boolean(prompt.offsetWidth && prompt.textContent),
        choices: [...document.querySelectorAll('[data-action=learning-answer]')].map(button => button.textContent),
      };
    });
    const status = await box('.learning-voice-status');
    const example = await box('.learning-picture-example');
    check(state.age === 7 && state.level === 4, `Age ${state.age}, question level ${state.level}`);
    check(state.choices.length === 3 && state.choices.every(value => !/[\p{Letter}\p{Number}]/u.test(value)) && !state.writtenPromptVisible,
      `Template ${state.template}; visible written prompt ${state.writtenPromptVisible}; choices ${state.choices.join(' / ')}`);
    check(Boolean(example?.visibleWidth && example.visibleHeight), `Visual association example ${example?.text || 'absent'}`);
    check(status?.visible && status.fontPx >= 14 && status.ratio >= 4.5 && await page.locator(learningAction('replay')).isDisabled(),
      `Hebrew audio availability ${status ? `${status.text} · ${status.fontPx}px · ${status.ratio.toFixed(2)}:1` : 'undisclosed'}`);
    await shot();

    const selector = learningAction('answer');
    const index = await page.evaluate(() => {
      const { answer, options } = window.__island.engine.learningRound().question;
      return options.indexOf(answer);
    });
    const target = page.locator(selector).nth(index);
    const targetBox = await box(target);
    check(targetBox.visibleWidth >= 44 && targetBox.visibleHeight >= 44, `Visible answer ${targetBox.visibleWidth}×${targetBox.visibleHeight}px`);
    await tap(target);
    const feedback = await page.locator('.learning-feedback').textContent();
    check(await page.locator('.learning-feedback').getAttribute('data-state') === 'correct', `Answer touch result ${feedback}`);
    await tap(learningAction('next'));
    const next = await page.evaluate(() => {
      const round = window.__island.engine.learningRound();
      return { index: round.index, level: round.question.level, template: round.question.template };
    });
    check(next.index === 1 && next.level === 4 && next.template === 'picture-association', `Continued to item ${next.index + 1}, level ${next.level}, ${next.template}`);
  },

  async '037'({ page, seed, tap, box, check, note, shot }) {
    await seed();
    note('Level-4 memory board, age 7. Earlier question advanced in the development fixture. A card and the existing exit are touched at their actual positions.');
    await setUpPuzzle(page, 1, 'memory');
    const cards = page.locator(learningAction('memory-card'));
    const targets = await Promise.all((await cards.all()).map(box));
    const width = Math.min(...targets.map(target => target.visibleWidth));
    const height = Math.min(...targets.map(target => target.visibleHeight));
    const horizontalGap = targets[1].left - targets[0].right;
    const verticalGap = targets[4].top - targets[0].bottom;
    check(targets.length === 12 && targets.every(target => target.centerHit) && width >= 44 && height >= 52,
      `${targets.length} hittable cards with minimum visible size ${width}×${height}px`);
    check(horizontalGap >= 8 && verticalGap >= 8, `Horizontal / vertical gap ${horizontalGap}px / ${verticalGap}px`);
    const exit = await box('.learning-close');
    check(exit.centerHit && exit.visibleWidth >= 44 && exit.visibleHeight >= 44, `Visible exit ${exit.visibleWidth}×${exit.visibleHeight}px`);
    await shot();
    await tap(cards.first());
    const face = await cards.first().textContent();
    check(Boolean(face && face !== '?'), `Touched card reveals ${face}`);
    await tap('.learning-close');
    check(await page.locator('.learning-screen').count() === 0, 'Exit touch returned to the island');
  },

  async '038'({ page, seed, tap, box, check, note, shot }) {
    await seed();
    note('Level-4 jigsaw, age 7. Earlier questions advanced in the development fixture. Replay and both tile selections use trusted touches.');
    await setUpPuzzle(page, 3, 'jigsaw');
    const demoSelector = learningAction('jigsaw-demo');
    const tiles = page.locator(learningAction('tile'));
    const initialOrder = await tiles.evaluateAll(buttons => buttons.map(button => button.dataset.tile));
    const demo = await box(demoSelector);
    check(demo?.centerHit && demo.visibleWidth >= 44 && demo.visibleHeight >= 44,
      `Demo target ${demo ? `${demo.visibleWidth}×${demo.visibleHeight}px` : 'absent'}`);
    await shot();
    if (demo?.centerHit) {
      await tap(demoSelector);
      const timeline = await page.locator(demoSelector).evaluate(button => ({
        diagram: [...button.querySelectorAll('.learning-jigsaw-example-tile')].map(tile => tile.textContent).join(''),
        animations: button.getAnimations({ subtree: true }).map(animation => animation.playState),
      }));
      check(timeline.diagram === '🟦🟨🟨🟦' && timeline.animations.includes('running'),
        `Two-touch diagram ${timeline.diagram}; replay animations ${timeline.animations.length}`);
      await shot('replay');
    }
    check(JSON.stringify(await tiles.evaluateAll(buttons => buttons.map(button => button.dataset.tile))) === JSON.stringify(initialOrder),
      'The example left the actual puzzle order intact');
    await tap(tiles.nth(0));
    check(await tiles.nth(0).getAttribute('aria-pressed') === 'true', 'First touch selected the first tile');
    await tap(tiles.nth(1));
    check(await tiles.nth(0).getAttribute('data-tile') === initialOrder[1] && await tiles.nth(1).getAttribute('data-tile') === initialOrder[0],
      'Second touch swapped the two original tiles');
    await shot('swapped');
  },
};
