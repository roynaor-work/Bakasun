// Optional local test adapter for tests/helpers/island-browser.mjs.
// Use only where Playwright's bundled Chromium is absent. This keeps all
// existing tests and their launch arguments intact and selects system Chromium.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require('playwright');

export const chromium = new Proxy(playwright.chromium, {
  get(target, key) {
    if (key === 'launch') {
      return (options = {}) => target.launch({
        ...options,
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      });
    }
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
