// Environment adapter for the repository's existing ISLAND_PLAYWRIGHT hook.
// Use an installed Chromium when Playwright's optional browser cache is absent.
// This adapter changes the executable only; test cases and browser mode persist.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleFile=process.env.PLAYWRIGHT_MODULE??path.resolve(path.dirname(process.execPath),'../node_modules/playwright/index.mjs');
const {chromium:upstream}=await import(pathToFileURL(moduleFile).href);
export const chromium={...upstream,launch(options={}){
  return upstream.launch({...options,executablePath:process.env.CHROMIUM_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader',...(options.args??[])]});
}};
