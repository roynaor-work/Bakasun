const enter = '[data-action="game-enter"]';
const play = '[data-action="game-understood"]';
const replay = '[data-action="game-help-again"]';
const close = '[data-action="close-modal"]';
const sound = '[data-action="game-sound"]';
const next = '[data-kid-ux-next]';
const library = '.modal[data-game-library]';

const games = [
  'soccer', 'tennis', 'streetSlam', 'islandRacing', 'boarDefense',
  'alienDefense', 'fireRescue', 'navalDuel', 'alpineRush', 'catchCriminal',
];

const usable = b => Boolean(b?.centerHit && b.visibleWidth >= 44 && b.visibleHeight >= 44);
const meetingSize = b => Boolean(b?.width >= 44 && b.height >= 44);
const dimensions = b => b && [b.width, b.height];

async function openLibrary({ page, seed, note }) {
  await seed();
  note('Dev API opens the existing games library. Subsequent interactions use CDP touch.');
  await page.evaluate(() => __island.games.menu());
  await page.locator(library).waitFor();
}

async function showGuide(page, game) {
  await page.evaluate(id => __island.games.intro(id, undefined, 1), game);
  await page.locator(`.modal[data-intro="${game}"]`).waitFor();
}

async function scrollTo({ box, swipe }, selector) {
  for (let i = 0; i < 6; i++) {
    const rect = await box(selector);
    if (rect?.centerHit) return true;
    await swipe(424, 300, 424, 110);
  }
  return false;
}

export default {
  '001': async test => {
    const { page, box, check, tap, shot } = test;
    await openLibrary(test);
    const sizes = await Promise.all(games.map(game => box(`${enter}[data-game-id="${game}"]`)));
    check(sizes.every(meetingSize), { targets: Object.fromEntries(games.map((game, i) => [game, dimensions(sizes[i])])) });
    await shot('library');
    await tap(`${enter}[data-game-id="tennis"]`, { scroll: true });
    check(await page.locator('[data-game-home="tennis"]').count() === 1, 'Trusted tap opens the tennis home from its own card.');
  },

  '002': async test => {
    const { page, box, check, tap, shot } = test;
    await openLibrary(test);
    const a = await box(close), b = await box(sound);
    check(usable(a) && usable(b) && b.fontPx >= 14,
      { screen: 'library', close: dimensions(a), sound: dimensions(b), soundFontPx: b.fontPx });
    await shot('library-frame');
    await tap(`${enter}[data-game-id="soccer"]`, { scroll: true });
    const c = await box(close), d = await box(sound);
    check(usable(c) && usable(d) && d.fontPx >= 14,
      { screen: 'soccer home', close: dimensions(c), sound: dimensions(d), soundFontPx: d.fontPx });
    await shot('home-frame');
    const initial = await page.locator(sound).getAttribute('aria-pressed');
    await tap(sound);
    check(await page.locator(sound).getAttribute('aria-pressed') !== initial, 'Trusted tap changes mute state.');
    await tap(close);
    check(await page.locator('.modal').count() === 0, 'Trusted tap closes the game home.');
  },

  '003': async test => {
    const { page, box, check, shot } = test;
    await openLibrary(test);
    const columns = await page.locator('.adventure-game-grid').evaluate(e =>
      getComputedStyle(e).gridTemplateColumns.trim().split(/\s+/).length);
    const types = await Promise.all(['.adventure-game-card h3', enter, '.adventure-new'].map(box));
    check(columns >= 3 && columns <= 4 && types[0].fontPx >= 16 && types.slice(1).every(b => b.fontPx >= 14),
      { columns, namePx: types[0].fontPx, enterPx: types[1].fontPx, badgePx: types[2].fontPx });
    await shot('library-labels');
    const last = page.locator(enter).last();
    check(await scrollTo(test, last), 'Trusted swipes reach the last game card.');
  },

  '004': async test => {
    const { page, box, check } = test;
    await openLibrary(test);
    check(await scrollTo(test, '.offline-panel h3'), 'Trusted swipes bring the download panel into view.');
    const status = await box('.offline-status');
    const heading = await box('.offline-panel h3');
    const download = await box('[data-action="offline-download-all"]');
    const background = await page.locator('.offline-panel').evaluate(e => getComputedStyle(e).backgroundColor);
    check(/^rgb\(/.test(background) && status.ratio >= 4.5 && heading.ratio >= 4.5 &&
      download.ratio >= 4.5 && status.fontPx >= 14 && download.fontPx >= 14,
    { background, status: status.ratio, heading: heading.ratio, download: download.ratio, statusFont: status.fontPx, text: status.text });
  },

  '005': async ({ page, seed, box, tap, check, shot, note }) => {
    await seed();
    note('Each real instruction screen is opened with the dev API. Step changes use trusted touch without a scroll gesture.');
    for (const game of games) {
      await showGuide(page, game);
      const button = await box(play);
      const demo = await page.locator('.kid-ux-demo-finger').count();
      const guide = page.locator('.kid-ux-guide');
      const current = demo && await guide.getAttribute('data-kid-ux-step');
      const active = demo && await page.locator('.kid-ux-demo-finger').evaluate(e => e.getAnimations().length > 0);
      check(demo === 1 && active && current === '1' && usable(button),
        { game, finger: demo, animationRunning: Boolean(active), firstStep: current, play: button });
      if (game === 'soccer' || game === 'boarDefense') await shot(game);
      if (!demo) continue;
      const caption = await page.locator('.kid-ux-demo-caption').textContent();
      await tap(next);
      check(await guide.getAttribute('data-kid-ux-step') === '2' &&
        await page.locator('.kid-ux-demo-caption').textContent() !== caption,
      { game, interaction: 'trusted touch advanced the animated instruction' });
    }
    await showGuide(page, 'tennis');
    if (usable(await box(play))) {
      await tap(play);
      check(await page.locator('.game-screen[data-game="tennis"]').count() === 1, 'Start opens the game from the instruction screen.');
    }
  },

  '006': async ({ page, seed, tap, check, shot, note }) => {
    await seed();
    note('The real replay control receives trusted touch. The browser voice API fixture exercises Hebrew available, then unavailable.');
    await page.evaluate(() => {
      const synth = speechSynthesis;
      window.__kidVoiceTest = [];
      window.SpeechSynthesisUtterance = class extends EventTarget {
        constructor(text) { super(); this.text = text; }
      };
      synth.getVoices = () => [{ lang: 'en-US' }, { lang: 'he-IL', localService: true }];
      synth.cancel = () => {};
      synth.speak = utterance => window.__kidVoiceTest.push({
        lang: utterance.lang,
        voice: utterance.voice.lang,
        text: utterance.text,
      });
    });
    await showGuide(page, 'soccer');
    const initial = await page.evaluate(() => window.__kidVoiceTest.length);
    await tap(replay, { scroll: 'setup' });
    const speech = await page.evaluate(() => window.__kidVoiceTest);
    check(initial === 0 && speech.length === 1 &&
      speech[0].lang === 'he-IL' && speech[0].voice === 'he-IL' && /[\u05d0-\u05ea]/.test(speech[0].text),
    { initial, speech });
    await shot('trusted-replay');
    await page.evaluate(() => { speechSynthesis.getVoices = () => []; });
    await tap(replay, { scroll: 'setup' });
    const fallback = page.locator('.kid-ux-help-feedback');
    check(await fallback.count() === 1 && /קול עברי/.test(await fallback.textContent())
      && await page.locator('.kid-ux-demo-finger').count() === 1,
    'The same button shows a playable visual demonstration when there is no Hebrew device voice.');
    await shot('without-hebrew-voice');
  },

  '007': async ({ page, seed, startGame, tap, check, box, shot, note }) => {
    page.setDefaultTimeout(45_000);
    await seed();
    note('Uses the live soccer game with its low graphics profile for software rendering.');
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('quality', 'low');
      history.replaceState(history.state, '', url);
    });
    await startGame('soccer');
    await page.waitForFunction(() => __island.games.current?.session.ready === true, null, { timeout: 75_000 });
    const button = '[data-action="game-pause"]';
    const exit = '[data-action="game-exit"]';
    const label = await page.locator(button).evaluate(e => {
      const textStyle = getComputedStyle(e, '::after');
      const buttonStyle = getComputedStyle(e);
      const width = e.getBoundingClientRect().width;
      return {
        text: textStyle.content, fontPx: parseFloat(textStyle.fontSize), visible: textStyle.display !== 'none',
        direction: buttonStyle.flexDirection, width, textWidth: parseFloat(textStyle.width),
      };
    });
    check(label.visible && label.text.includes('השהיה') && label.fontPx >= 14 &&
      label.direction === 'column' && label.textWidth <= label.width - 6, label);
    await shot('live-pause');
    await tap(button);
    const exitButton = await box(exit);
    const exitLabel = await box(`${exit} span`);
    check(usable(exitButton) && exitLabel?.text.includes('לחזור לאי') && exitLabel.fontPx >= 14 && exitLabel.ratio >= 4.5,
      { exit: exitButton, label: exitLabel });
    await shot('pause-exit');
    await tap(exit);
    check(await page.locator('.game-screen').count() === 0 && await page.evaluate(() => __island.games.current === null),
      'Trusted pause and exit taps returned to the island and disposed the session.');
  },

  '008': async ({ page, seed, check, box, tap, shot, note }) => {
    page.setDefaultTimeout(45_000);
    await seed();
    note('Success and failure use synthetic result data displayed through the original ActivityInterface.showResult. Exit is a trusted touch.');
    for (const id of ['soccer', 'tennis']) {
      for (const outcome of ['win', 'lose']) {
        await page.evaluate(({ id, outcome }) => __island.games.showResult(id, undefined, {
          outcome, stage: 1, score: outcome === 'win' ? 120 : 0, money: 4, parts: 0, stars: outcome === 'win' ? 3 : 0,
        }), { id, outcome });
        const buttons = ['game-again', 'game-stages', 'game-exit'];
        const boxes = await Promise.all(buttons.map(action => box(`[data-action="${action}"]`)));
        check(boxes.every(b => usable(b) && b.fontPx >= 14 && b.ratio >= 4.5),
          { game: id, outcome, actions: Object.fromEntries(buttons.map((action, i) => [action, boxes[i]])) });
        if (id === 'soccer') await shot(outcome);
        if (id === 'tennis' && outcome === 'lose' && usable(boxes.at(-1))) {
          await tap('[data-action="game-exit"]');
          check(await page.locator('[data-result]').count() === 0, 'Trusted exit touch dismissed the result without a scroll.');
        }
      }
    }
  },

  '015': async test => {
    const { page, seed, tap, check, shot, note } = test;
    await seed();
    await showGuide(page, 'soccer');
    note('The soccer introduction and the real league map are reached by the dev API. A trusted touch expands optional instructions when present.');
    const details = page.locator('.kid-ux-intro-details summary');
    if (await details.count()) await tap(details);
    const guidance = page.locator('.game-help-lines p').last();
    const copy = await guidance.textContent();
    const plain = copy.normalize('NFD').replace(/\p{M}/gu, '');
    check(plain.includes('מפת הליגה') && /אי?מון שחקן/.test(plain) &&
      plain.includes('כרטיסי הקבוצות') && !plain.includes('שוער'), { instructions: copy });
    if (!(await scrollTo(test, guidance))) {
      await guidance.scrollIntoViewIfNeeded();
      note('Scrolled directly to the last paragraph for screenshot setup after the touch scroll.');
    }
    await shot('soccer-league-help');
    await page.evaluate(() => __island.games.stages('soccer'));
    check(await page.locator('[data-action="stage-play"]').count() > 0 &&
      await page.locator('[data-action="soccer-training"]').count() > 0 &&
      await page.locator('[data-action="soccer-rosters"]').count() > 0 &&
      await page.locator('[data-action="soccer-role"]').count() === 0,
    'Actual league actions match the revised instructions.');
  },
};
