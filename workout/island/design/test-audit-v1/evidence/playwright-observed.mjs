import {pathToFileURL} from 'node:url';
const runtime=process.env.AUDIT_REAL_PLAYWRIGHT ? await import(pathToFileURL(process.env.AUDIT_REAL_PLAYWRIGHT).href) : await import('playwright');
import {appendFileSync} from 'node:fs';
const emit=entry=>appendFileSync(process.env.AUDIT_EVENT_FILE||'/tmp/test-audit-v1-browser-events.ndjson',JSON.stringify({at:new Date().toISOString(),pid:process.pid,...entry})+'\n');
export const chromium=runtime.chromium;
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const start=performance.now();const browser=await launch(...args);emit({event:'browser-open',ms:performance.now()-start,version:browser.version()});
 browser.on('disconnected',()=>emit({event:'browser-close'}));
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async(...opts)=>{
  const context=await newContext(...opts);const newPage=context.newPage.bind(context);
  context.newPage=async(...pageOpts)=>{
   const page=await newPage(...pageOpts);
   for(const name of ['goto','waitForFunction','waitForSelector','screenshot','setViewportSize']){
    const method=page[name].bind(page);
    page[name]=async(...params)=>{
     const began=performance.now();const action=String(params[0]).slice(0,240);emit({event:'start',method:name,action});
     try{const result=await method(...params);emit({event:'pass',method:name,action,ms:performance.now()-began});return result;}
     catch(error){emit({event:'fail',method:name,action,ms:performance.now()-began,error:error.message.slice(0,1500)});throw error;}
    };
   }
   return page;
  };
  return context;
 };
 return browser;
};
export const firefox=runtime.firefox;
export const webkit=runtime.webkit;
