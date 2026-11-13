import {chromium as original} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
export const chromium = new Proxy(original,{get(target,prop){
  if(prop==='launch')return (options={})=>target.launch({...options,executablePath:'/usr/bin/chromium'});
  const v=target[prop];return typeof v==='function'?v.bind(target):v;
}});
