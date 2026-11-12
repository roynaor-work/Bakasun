import {chromium} from '/opt/node-tools/node_modules/playwright/index.mjs';
export const BASE = 'http://127.0.0.1:8765/workout/island/';
export const SHOTS = new URL('../shots/', import.meta.url).pathname;
export async function launch(extra = []) {
  return chromium.launch({args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server', ...extra]});
}
export async function newPage(browser, errors = []) {
  const ctx = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true});
  await ctx.addInitScript(() => { localStorage.setItem('island.sound', 'off'); localStorage.setItem('island.catch.help2', '1'); localStorage.setItem('island.catch.help6', '1'); });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return page;
}
