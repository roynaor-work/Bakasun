/** Optional Node --import hook for repository tests on a machine with system
 * Chromium but no Playwright browser download. This only changes the launch
 * options in the current process; it never edits the repository or Playwright.
 */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=(options={})=>launch({...options,
  executablePath:options.executablePath || process.env.BOARS_CHROMIUM_PATH || '/usr/bin/chromium',
  args:[...(options.args || []),'--no-sandbox','--enable-unsafe-swiftshader'],
});
