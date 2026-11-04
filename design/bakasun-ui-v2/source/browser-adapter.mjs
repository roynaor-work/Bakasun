// Managed environment adapter: run the real installed Chromium, preserving test options.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = await import(pathToFileURL(path.resolve(path.dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
export const chromium = new Proxy(runtime.chromium, {
 get(target,key) {
  if(key==='launch') return options=>target.launch({...options,executablePath:'/usr/bin/chromium',args:[...(options?.args||[]),'--no-sandbox']});
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }
});
