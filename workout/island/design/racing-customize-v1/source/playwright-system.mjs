// Environment adapter for the repository's existing ISLAND_PLAYWRIGHT hook.
// Assertions, application code and browser policy remain unchanged.
import {pathToFileURL} from 'node:url';
const {chromium:installed}=await import(pathToFileURL(process.env.RACING_PLAYWRIGHT||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs').href);
export const chromium=new Proxy(installed,{get(target,key){
  if(key==='launch')return(options={})=>target.launch({...options,executablePath:process.env.RACING_CHROMIUM||'/usr/bin/chromium',
    args:[...(options.args||[]),'--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  if(key==='executablePath')return()=>process.env.RACING_CHROMIUM||'/usr/bin/chromium';
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});
