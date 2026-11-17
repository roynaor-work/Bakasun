// CC0-1.0. Environment adapter for existing tests/helpers/island-browser.mjs.
// Use the installed system Chromium; preserve every existing test assertion.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.PODIUM_NODE_MODULES??'/tmp/racing-podium-tools/node_modules';
const {chromium:original}=await import(pathToFileURL(path.join(modules,'playwright/index.mjs')));
export const chromium=new Proxy(original,{get(target,key){
  if(key==='launch')return options=>target.launch({...options,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});
