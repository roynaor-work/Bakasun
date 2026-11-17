/** Optional test-only adapter for hosts with Playwright and system Chromium but
 * no bundled browser. Point ISLAND_PLAYWRIGHT here; production is unaffected. */
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
let runtime;
try{runtime=await import('playwright');}
catch{runtime=await import(pathToFileURL(process.env.SOCCER_QUALITY_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')));}
const native=runtime.chromium;
export const chromium=new Proxy(native,{
  get(target,key){
    if(key==='launch')return(options={})=>native.launch({...options,executablePath:options.executablePath||process.env.ISLAND_CHROME||'/usr/bin/chromium'});
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }
});
