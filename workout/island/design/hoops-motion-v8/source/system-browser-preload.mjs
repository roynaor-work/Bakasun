/** Test setup only: let existing repository tests use the installed Chromium.
 * This changes the executable path, never assertions, browser flags or CSP.
 * It is not imported by the game, preview or this package's Node tests.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const require = createRequire(resolve(dirname(process.execPath), '../node_modules/playwright/package.json'));
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = (options = {}) => launch({ ...options,
  executablePath: options.executablePath || process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
