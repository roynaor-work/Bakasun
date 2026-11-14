// Optional adapter for the repository's ISLAND_PLAYWRIGHT test hook.
// Use an installed system Chromium when Playwright's bundled browser is absent.
// This affects test launches only; the preview does not load this module.
import path from 'node:path';
import {pathToFileURL} from 'node:url';

let provider;
try {
  provider = await import('playwright');
} catch {
  const modulePath = process.env.BOARS_PLAYWRIGHT_MODULE || path.resolve(
    path.dirname(process.execPath), '../node_modules/playwright/index.mjs'
  );
  provider = await import(pathToFileURL(modulePath).href);
}

export const chromium = new Proxy(provider.chromium, {
  get(target, property) {
    if (property === 'launch') return (options = {}) => target.launch({
      ...options,
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: [...(options.args || []), '--no-sandbox', '--enable-unsafe-swiftshader']
    });
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
