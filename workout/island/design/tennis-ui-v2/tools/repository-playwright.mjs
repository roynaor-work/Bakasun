// Optional test adapter: select system Chromium when the bundled browser is absent.
// Existing tests and their launch arguments stay unchanged.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let playwright;
try { playwright = await import('playwright'); }
catch {
  const modulePath = process.env.PLAYWRIGHT_NODE_MODULE
    || path.resolve(path.dirname(process.execPath), '../node_modules/playwright/index.mjs');
  playwright = await import(pathToFileURL(modulePath).href);
}

export const chromium = new Proxy(playwright.chromium, {
  get(target, key) {
    if (key === 'launch') return (options = {}) => target.launch({
      ...options, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    });
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
