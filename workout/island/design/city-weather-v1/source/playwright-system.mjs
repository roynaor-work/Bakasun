// Optional environment adapter for tests/helpers/island-browser.mjs.
// Uses the installed Chromium; all test code, assertions and CSP stay intact.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.WEATHER_PLAYWRIGHT_MODULE||path.resolve(path.dirname(process.execPath),'../node_modules/playwright/index.mjs');
const {chromium:installed}=await import(pathToFileURL(modulePath).href);
const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
export const chromium=new Proxy(installed,{get(target,key){
  if(key==='launch')return(options={})=>target.launch({...options,executablePath,
    args:[...(options.args||[]),'--no-sandbox','--disable-dev-shm-usage']});
  if(key==='executablePath')return()=>executablePath;
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});
