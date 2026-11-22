// Read-only test-environment adapter for an installed system Chromium. Existing
// tests and application files stay unchanged. Pass this path as ISLAND_PLAYWRIGHT.
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let playwright;
try{playwright=await import('playwright');}
catch{playwright=await import(pathToFileURL(process.env.BALANCE_REAL_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);}
export const chromium=new Proxy(playwright.chromium,{
  get(target,key){
    if(key==='launch')return options=>target.launch({...options,executablePath:options?.executablePath||process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
  }
});
