import path from 'node:path';
import {access} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const harnessRoot = fileURLToPath(new URL('../', import.meta.url));
export const islandRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const viewport = Object.freeze({width: 844, height: 390});
export const launchArgs = Object.freeze([
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'
]);

export const browserArgs = ({noWasm = false} = {}) => [...launchArgs, ...(noWasm ? ['--js-flags=--jitless'] : [])];

export async function loadPlaywright(modulePath = process.env.ISLAND_PLAYWRIGHT) {
  if (modulePath) return import(pathToFileURL(path.resolve(modulePath)).href);
  try { return await import('playwright'); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const installed = path.resolve(path.dirname(process.execPath), '../node_modules/playwright/index.mjs');
    try { return await import(pathToFileURL(installed).href); }
    catch { throw new Error('Playwright not found. Install it in this folder or set ISLAND_PLAYWRIGHT to its index.mjs.'); }
  }
}

export async function launchBrowser({executablePath = process.env.CHROMIUM_PATH, headed = false, noWasm = false} = {}) {
  const {chromium} = await loadPlaywright();
  if (!executablePath) {
    try { await access(chromium.executablePath()); }
    catch { try { await access('/usr/bin/chromium'); executablePath = '/usr/bin/chromium'; } catch {} }
  }
  return chromium.launch({headless: !headed, executablePath, args: browserArgs({noWasm})});
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(read, {timeoutMs = 90000, intervalMs = 100, description = 'condition'} = {}) {
  const deadline = performance.now() + timeoutMs;
  let last;
  do {
    last = await read();
    if (last) return last;
    await delay(Math.min(intervalMs, Math.max(0, deadline - performance.now())));
  } while (performance.now() < deadline);
  throw new Error(`Timed out after ${timeoutMs} ms: ${description}`);
}
