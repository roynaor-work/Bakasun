// Optional adapter for the repository's existing ISLAND_PLAYWRIGHT test hook.
// It selects the installed system browser without editing any repository tests.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.CATCH_PLAYWRIGHT_MODULE||path.resolve(path.dirname(process.execPath),'../node_modules/playwright/index.mjs');
const playwright=await import(pathToFileURL(modulePath).href);
const executablePath=process.env.CATCH_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium';
export const chromium=new Proxy(playwright.chromium,{
 get(target,property){
  if(property==='launch')return(options={})=>target.launch({...options,executablePath,
   args:['--no-sandbox',...(options.args||[])]});
  if(property==='launchPersistentContext')return(userDataDir,options={})=>target.launchPersistentContext(userDataDir,
   {...options,executablePath,args:['--no-sandbox',...(options.args||[])]});
  const value=Reflect.get(target,property,target);
  return typeof value==='function'?value.bind(target):value;
 }
});
