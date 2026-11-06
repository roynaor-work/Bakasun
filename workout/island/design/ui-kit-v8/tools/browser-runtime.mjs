import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { startServer } from './server.mjs';

export async function launchBrowser() {
  const modulePath = process.env.PLAYWRIGHT_MODULE;
  let playwright;
  if (modulePath) playwright = await import(pathToFileURL(modulePath));
  else {
    try { playwright = await import('playwright'); }
    catch {
      const managed = '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
      if (!existsSync(managed)) throw new Error('Install Playwright outside this package, or set PLAYWRIGHT_MODULE to its index.mjs');
      playwright = await import(pathToFileURL(managed));
    }
  }
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  return playwright.chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

/** A missing browser must fail promptly rather than leave a listening server. */
export async function startBrowserSession() {
  const { server, url } = await startServer();
  try { return { server, url, browser: await launchBrowser() }; }
  catch (error) { await new Promise(done => server.close(done)); throw error; }
}
