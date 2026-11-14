// SPDX-License-Identifier: CC0-1.0
// Optional environment adapter for the existing ISLAND_PLAYWRIGHT test hook.
// Test assertions and repository code remain unchanged. Useful in containers
// that supply system Chromium rather than Playwright's downloaded browser.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium:installed}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
export const chromium=new Proxy(installed,{get(target,key){
  if(key==='launch')return options=>target.launch({...options,
    executablePath:process.env.CHROMIUM_EXECUTABLE??'/usr/bin/chromium',
    args:[...(options?.args??[]),'--no-sandbox','--enable-unsafe-swiftshader']});
  const value=Reflect.get(target,key);
  return typeof value==='function'?value.bind(target):value;
}});
