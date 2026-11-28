#!/usr/bin/env node
// Real screenshots of the store build (store/www) from Chromium, landscape, at the sizes the stores ask for.
// Usage: node scripts/screenshots.mjs [--games=soccer,tennis] [--sizes=phone,iphone69]
// Output: store/listing/screenshots/<size>/NN-<name>.png
// Needs Playwright (ISLAND_PLAYWRIGHT=/path/to/playwright/index.mjs when it is not importable) and WebGL (swiftshader is enough).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir, chromium, LAUNCH_ARGS } from './lib/serve.mjs';

const STORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(STORE, 'listing/screenshots');
const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || fallback;

// css size x device scale = pixel size of the file. Landscape.
const SIZES = {
  phone: { w: 852, h: 393, scale: 3, note: 'Apple iPhone 6.1 inch (required class) 2556x1179; also valid for Google Play phone (2 to 8 shots, 16:9 to 9:16)' },
  iphone69: { w: 874, h: 402, scale: 3, note: 'Apple iPhone 6.3 inch class 2622x1206 (accepted alternative)' },
  ipad13: { w: 1366, h: 1024, scale: 2, note: 'Apple iPad 13 inch 2732x2048 (needed only if the app runs on iPad)' },
  tablet169: { w: 960, h: 540, scale: 2, note: 'Google Play 7 and 10 inch tablets, 16:9: 1920x1080' },
};
const GAMES = (arg('games', 'soccer,tennis,islandRacing,streetSlam,alpineRush,catchCriminal')).split(',');
const sizeNames = arg('sizes', 'phone').split(',');

async function openGames(page) {
  await page.locator('[data-action=quick-games]').tap();
  await page.waitForTimeout(1500);
}

async function shoot(page, file) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, timeout: 170000 });
  console.log('saved', path.relative(STORE, file));
}

const server = await serveDir(path.join(STORE, 'www'));
const browser = await (await chromium()).launch({ args: LAUNCH_ARGS });
try {
  for (const name of sizeNames) {
    const size = SIZES[name];
    const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: true, deviceScaleFactor: size.scale, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(60000);
    await page.goto(server.url, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const dir = path.join(OUT, name);
    await page.locator('[data-action=avatar-start]').tap();
    await page.waitForTimeout(5000);
    let n = 1;
    await shoot(page, path.join(dir, `${String(n++).padStart(2, '0')}-city.png`));
    await openGames(page);
    await shoot(page, path.join(dir, `${String(n++).padStart(2, '0')}-games.png`));
    await page.locator('[data-action=close-modal]').first().tap().catch(() => {});
    for (const id of GAMES) {
      try {
        await openGames(page);
        const card = page.locator(`[data-game="${id}"]`).first();
        await card.locator('[data-action=game-enter]').first().tap();
        await page.waitForTimeout(9000);
        await shoot(page, path.join(dir, `${String(n++).padStart(2, '0')}-${id}-intro.png`));
        // most games start from the first big button of the intro card
        const start = page.getByRole('button', { name: 'לשחק', exact: true }).first();
        if (await start.isVisible().catch(() => false)) {
          await start.tap();
          await page.waitForTimeout(7000);
          await shoot(page, path.join(dir, `${String(n++).padStart(2, '0')}-${id}-play.png`));
        }
      } catch (error) {
        console.warn(`game ${id}: ${error.message.split('\n')[0]}`);
      }
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(5000);
    }
    if (errors.length) console.warn('page errors:', errors.slice(0, 5));
    await context.close();
  }
  if (server.missing.length) console.warn('missing files:', [...new Set(server.missing)].slice(0, 10));
} finally {
  await browser.close();
  await server.close();
}
