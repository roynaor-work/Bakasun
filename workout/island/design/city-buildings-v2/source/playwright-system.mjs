import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Optional adapter for the repository's existing ISLAND_PLAYWRIGHT hook.
// Use installed Chromium without changing the tests or downloading a browser.
const toolRoot=path.resolve(process.env.CITY_V2_TOOLS || '/tmp/city-v2-tools');
const {chromium:original}=await import(pathToFileURL(path.join(toolRoot,'node_modules/playwright/index.mjs')));
export const chromium=new Proxy(original,{get(target,key){
  if(key==='launch')return(options={})=>target.launch({...options,executablePath:process.env.CHROMIUM || '/usr/bin/chromium',
    args:[...(options.args||[]),'--no-sandbox','--enable-unsafe-swiftshader']});
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
}});
