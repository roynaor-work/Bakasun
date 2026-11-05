// Optional setup adapter for the repository's ISLAND_PLAYWRIGHT hook.
// It changes the browser executable, not test code, assertions or security policy.
import {createRequire} from 'node:module';
const {chromium:installed}=createRequire(import.meta.url)('playwright');
export const chromium=new Proxy(installed,{get(target,key){
  if(key==='launch')return(options={})=>target.launch({...options,executablePath:process.env.RACING_CHROMIUM_PATH||'/usr/bin/chromium',args:[...(options.args||[]),'--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  if(key==='executablePath')return()=>process.env.RACING_CHROMIUM_PATH||'/usr/bin/chromium';
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});
