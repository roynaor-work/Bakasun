// Test-only browser locator. Product/test source and browser arguments stay intact.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
let playwright;
try {playwright=await import('playwright');}
catch {playwright=await import(pathToFileURL(path.resolve(path.dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);}
const launch=playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch=(options={})=>launch({...options,executablePath:options.executablePath||process.env.BAKASUN_BROWSER||'/usr/bin/chromium'});
