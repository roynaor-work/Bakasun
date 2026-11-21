import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const viewport = { width: 844, height: 390 };
// These cases enter a separate game scene through the developer fixture.
const liveGameCases = new Set(['007', '016', '017', '018', '019', '021', '022', '024', '025', '026', '029', '030', '031', '032', '033', '034', '035', '036', '039', '040']);

function recordBrowserSignals() {
  const evidence = window.__kidTest = {
    events: [], speech: [], canvasText: {}, captureCanvasText: false, pointerCount: 0,
  };
  function add(list, entry) {
    list.push(entry);
    if (list.length > 100) list.shift();
  }

  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    document.addEventListener(type, event => {
      const target = event.target.closest?.('button,input,summary,[role=button]') || event.target;
      add(evidence.events, {
        type, trusted: event.isTrusted, pointerType: event.pointerType,
        pointerCount: type === 'pointerdown' && ++evidence.pointerCount,
        action: target.dataset?.action || target.dataset?.gameControl || target.id || target.getAttribute?.('class'),
        x: event.clientX, y: event.clientY,
      });
    }, true);
  }

  if (window.speechSynthesis) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      add(evidence.speech, { text: utterance.text, lang: utterance.lang });
      return speak(utterance);
    };
  }

  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    if (evidence.captureCanvasText) {
      const canvas = this.canvas;
      const rect = canvas.getBoundingClientRect();
      const transform = this.getTransform();
      const fontPx = Number(this.font.match(/([\d.]+)px/)?.[1] || 0);
      const key = [canvas.className, this.font, text].join('|');
      if (Object.keys(evidence.canvasText).length > 300) {
        delete evidence.canvasText[Object.keys(evidence.canvasText)[0]];
      }
      evidence.canvasText[key] = {
        text: String(text), x, y, cssFontPx: fontPx * Math.hypot(transform.a, transform.b) * rect.width / canvas.width,
        canvasClass: canvas.className, font: this.font, color: this.fillStyle,
      };
    }
    return fillText.call(this, text, x, y, ...rest);
  };
}

function seedCity() {
  const { engine, ui } = window.__island;
  ui.closeModal();
  ui.cancelPlacement();
  ui.closeInfo();
  ui.closeDetails();
  ui.setDockOpen(false);
  ui.setMoreOpen(false);
  engine.setAvatar({ ...engine.state.avatar, created: true });
  engine.skipTutorial();
  engine.setLearningAge(7);
  engine.state.learning.roundsToday = 2;
  engine.state.events.nextAt = Date.now() + 86_400_000;
  engine.state.events.active = null;
  engine.state.money = 50_000;
  const sites = ['airbase', 'fireStation', 'harbor', 'soccer', 'tennis', 'basketball', 'library', 'mathLab', 'zoo', 'puzzleRoom'];
  for (const typeId of sites) {
    if (engine.state.buildings.some(site => site.typeId === typeId)) continue;
    const plot = engine.readyPlots?.().find(plot => plot.typeId === typeId);
    const cell = plot || ui.findCell(typeId);
    if (cell) engine.state.buildings.push({ id: 'test-' + typeId, typeId, x: cell.x, z: cell.z, level: 1 });
  }
  engine.save();
  ui.refresh();
}

function inspect(node) {
  const rect = node.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  let right = Math.min(innerWidth, rect.right);
  let bottom = Math.min(innerHeight, rect.bottom);
  const backgrounds = [];
  let complexBackground = false;
  let opaque = false;
  const rgba = (css, fallback) => {
    const values = css.match(/[\d.]+/g)?.map(Number);
    return values?.length >= 3 ? [values[0], values[1], values[2], values[3] ?? 1] : fallback;
  };
  const over = (front, back) => back.map((base, index) => front[index] * front[3] + base * (1 - front[3]));
  for (let parent = node; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const frame = parent.getBoundingClientRect();
    const scrollContainer = parent !== node && parent !== document.body && parent !== document.documentElement;
    if (scrollContainer && /auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, frame.left + parent.clientLeft);
      right = Math.min(right, frame.left + parent.clientLeft + parent.clientWidth);
    }
    if (scrollContainer && /auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, frame.top + parent.clientTop);
      bottom = Math.min(bottom, frame.top + parent.clientTop + parent.clientHeight);
    }
    if (!opaque) {
      const background = rgba(style.backgroundColor, [0, 0, 0, 0]);
      backgrounds.unshift(background);
      opaque = background[3] === 1;
      complexBackground ||= style.backgroundImage !== 'none' || +style.opacity < 1;
    }
  }
  const style = getComputedStyle(node);
  const bg = backgrounds.reduce((result, background) => over(background, result), [255, 255, 255]);
  const fg = over(rgba(style.color, [0, 0, 0, 1]), bg);
  const lum = color => color.map(value => value / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const lights = [lum(bg), lum(fg)].sort((a, b) => b - a);
  const ratio = (lights[0] + .05) / (lights[1] + .05);
  const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const visibleRect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  return {
    ...rect.toJSON(), rect: rect.toJSON(),
    visibleRect, visibleWidth: visibleRect.width, visibleHeight: visibleRect.height,
    centerHit: node.contains(center), visible: node.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
    fontPx: parseFloat(style.fontSize), ratio, contrast: ratio, complexBackground,
    color: style.color, background: bg, text: node.innerText,
  };
}

export async function runCase({ browser, origin, id, mode, test, evidenceDir, screenshots }) {
  const result = { id, mode, checks: [], notes: [], touch: [], screenshots: [], errors: [] };
  const context = await browser.newContext({
    viewport, screen: viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    locale: 'he-IL', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  try {
    await context.addInitScript(recordBrowserSignals);
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.on('pageerror', error => result.errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...viewport, screenWidth: viewport.width, screenHeight: viewport.height,
      deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 },
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const flag = { before: '', after: '&kidUx=1', off: '&kidUx=0', single: '&kidUx=' + id }[mode];
    const debug = step => {
      if (process.env.KUX_DEBUG) console.error('KUX-' + id, mode, step);
    };
    debug('opening page');
    await page.goto(origin + '/workout/island/?dev=1' + flag, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__island), null, { timeout: 75_000 });
    debug('island initialized');
    // Stop the decorative world loop while assets settle. Still menus keep
    // the last frame and none of the played game loops are affected.
    await page.evaluate(() => { window.__island.view.paused = true; });
    if (liveGameCases.has(id)) {
      result.notes.push('The separate live game scene starts without waiting for the decorative city avatar.');
    } else {
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 75_000 });
      debug('avatar loaded');
    }
    result.viewport = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio,
      touchPoints: navigator.maxTouchPoints, lang: document.documentElement.lang,
      orientation: screen.orientation.type,
    }));
    if (result.viewport.width !== viewport.width || result.viewport.height !== viewport.height || !result.viewport.touchPoints) {
      throw new Error('Expected 844×390 CSS pixels and mobile touch emulation');
    }
    const locatorFor = selector => (typeof selector === 'string' ? page.locator(selector) : selector).first();
    const box = async selector => {
      const locator = locatorFor(selector);
      return await locator.count() ? locator.evaluate(inspect) : null;
    };

    async function dispatch(type, points) {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(({ x, y }, index) => ({ id: index + 1, x, y, radiusX: 7, radiusY: 7, force: 1 })),
      });
    }

    async function swipe(x, y, endX, endY, steps = 6) {
      result.touch.push({ type: 'swipe', x, y, endX, endY, steps });
      await dispatch('touchStart', [{ x, y }]);
      try {
        for (let step = 1; step <= steps; step++) {
          await dispatch('touchMove', [{ x: x + (endX - x) * step / steps, y: y + (endY - y) * step / steps }]);
          await page.waitForTimeout(24);
        }
      } finally {
        await dispatch('touchEnd', []);
      }
      await page.waitForTimeout(180);
    }

    async function tap(selector, { hold = 45, scroll = false, wait = 140 } = {}) {
      const locator = locatorFor(selector);
      if (scroll === 'setup') {
        await locator.scrollIntoViewIfNeeded();
        result.notes.push('Programmatic repositioning for setup: ' + locator);
      } else if (scroll) {
        for (let attempt = 0; attempt < 6; attempt++) {
          if ((await box(locator))?.centerHit) break;
          const rect = await locator.boundingBox();
          if (!rect) break;
          const x = Math.min(774, Math.max(70, rect.x + rect.width / 2));
          if (rect.y > 195) await swipe(x, 297, x, 94);
          else await swipe(x, 94, x, 297);
        }
      }
      const local = await box(locator);
      const element = local && await locator.elementHandle();
      const frame = element && await element.ownerFrame();
      const rect = await element?.boundingBox();
      if (!local?.centerHit || !rect || !frame) throw new Error('Touch target center is missing, offscreen or obscured: ' + locator);
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      if (x < 0 || x >= viewport.width || y < 0 || y >= viewport.height) {
        throw new Error('Touch target outside top-level viewport: ' + locator);
      }
      const entry = { type: 'tap', selector: String(locator), x, y, hold };
      result.touch.push(entry);
      const before = await frame.evaluate(() => __kidTest.pointerCount);
      await dispatch('touchStart', [{ x, y }]);
      try {
        if (hold) await page.waitForTimeout(hold);
        entry.event = await frame.evaluate(previous => __kidTest.events.findLast(event =>
          event.type === 'pointerdown' && event.pointerCount > previous), before);
        if (!entry.event?.trusted || entry.event.pointerType !== 'touch') {
          throw new Error('Expected a trusted touch pointer event: ' + locator);
        }
      } finally {
        await dispatch('touchEnd', []);
      }
      if (wait) await page.waitForTimeout(wait);
      return entry.event;
    }

    async function shot(label = 'screen') {
      if (!screenshots) return;
      if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid screenshot label: ' + label);
      const file = [id, mode, label].join('-') + '.png';
      await mkdir(evidenceDir, { recursive: true });
      let bytes;
      try {
        bytes = await page.screenshot({ timeout: 20_000, fullPage: false });
      } catch (error) {
        if (error.name !== 'TimeoutError') throw error;
        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'png', fromSurface: false, captureBeyondViewport: false,
        });
        bytes = Buffer.from(data, 'base64');
        result.notes.push('Screenshot captured with the CDP viewport fallback.');
      }
      if (bytes.readUInt32BE(16) !== viewport.width || bytes.readUInt32BE(20) !== viewport.height) {
        throw new Error('Screenshot resolution differs from the test viewport');
      }
      await writeFile(join(evidenceDir, file), bytes);
      if (!result.screenshots.includes(file)) result.screenshots.push(file);
    }

    await test({
      page, context, cdp, mode, id, box, tap, swipe, shot,
      check: (condition, observation) => result.checks.push({ pass: Boolean(condition), observation }),
      note: text => result.notes.push(text),
      seed: async () => {
        result.notes.push('Synthetic progressed city, age 7, with the game and learning buildings.');
        await page.evaluate(seedCity);
      },
      startGame: async (game, stage = 1, selection) => {
        result.notes.push('Dev launch used to set up the live game: ' + game + ', stage ' + stage + '.');
        await page.evaluate(({ game, stage, selection }) => {
          // Launch may return a promise. Readiness is observed through the game shell below.
          window.__island.games.launch(game, undefined, stage, selection);
        }, { game, stage, selection });
        await page.waitForFunction(() => window.__island.games.current && document.querySelector('.game-screen')?.dataset.starting !== 'true', null, { timeout: 75_000 });
      },
    });
    debug('test assertions complete');
    if (!result.checks.length) throw new Error('Test returned without checking a product outcome');
    if (!result.screenshots.length) await shot();
  } catch (error) {
    result.errors.push(error.stack || String(error));
  } finally {
    await context.close();
  }
  return result;
}
