// Observe the original automatic-download test without editing its source.
// Optional bring-to-front is a separately labelled diagnostic, never a passing baseline.
import {writeFile} from 'node:fs/promises';
import {chromium as base} from './playwright-runtime.mjs';
const output=process.env.AUDIT_DIAGNOSTIC_OUT;
const foreground=process.env.AUDIT_BRING_FRONT==='1';
const closeSaver=process.env.AUDIT_CLOSE_SAVER==='1';
const report={started:new Date().toISOString(),foregroundIntervention:foreground,closeSaverBeforeAuto:closeSaver,conditions:'Original test and local Chromium adapter. Every ten seconds record flags, request paths and readiness; no page content, saves, credentials or contact values. Optional interventions are explicitly recorded and do not count as passing the original setup.',pages:[],finished:null};
let pending=Promise.resolve();
function save(){if(output){const bytes=JSON.stringify(report,null,2)+'\n';pending=pending.then(()=>writeFile(output,bytes));}return pending;}
export const chromium=new Proxy(base,{get(target,key){
 if(key==='launch')return async options=>{
  const browser=await target.launch(options),contexts=[],originalContext=browser.newContext.bind(browser);
  let sampling=false;
  async function sample(){if(sampling)return;sampling=true;try{
   for(const {page,row} of contexts){if(page.isClosed()||!/^http:\/\/(?:127\.0\.0\.1|localhost)/.test(page.url()))continue;
    try{row.samples.push(await page.evaluate(()=>({at:Date.now(),visibility:document.visibilityState,ready:document.readyState,rafFrames:window.__auditRaf||0,island:!!window.__island,avatarLoaded:window.__island?.view?.metrics().avatarLoaded,offline:window.__offlineState?.state,canvasCount:document.querySelectorAll('canvas').length,resources:performance.getEntriesByType('resource').length,avatarResources:performance.getEntriesByType('resource').filter(x=>/\.glb/.test(x.name)).map(x=>({path:new URL(x.name).pathname,duration:x.duration,bytes:x.transferSize})),loadError:!!document.querySelector('.load-error')})));}catch(e){row.sampleError=e.constructor.name;}
   }await save();
  }finally{sampling=false;}}
  const timer=setInterval(()=>sample().catch(()=>{}),10000);timer.unref();
  browser.newContext=async opts=>{
   const c=await originalContext(opts);await c.addInitScript(()=>{performance.setResourceTimingBufferSize(5000);window.__auditRaf=0;function frame(){window.__auditRaf++;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   const originalPage=c.newPage.bind(c);c.newPage=async()=>{
    const page=await originalPage(),row={index:report.pages.length,errors:[],failed:[],samples:[],timeouts:[]};report.pages.push(row);contexts.push({page,row});
    page.on('pageerror',e=>row.errors.push(e.constructor.name+': '+e.message));page.on('requestfailed',r=>row.failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
    const goto=page.goto.bind(page);page.goto=async(...args)=>{if(closeSaver&&row.index===1&&!contexts[0].page.isClosed())await contexts[0].page.close();const result=await goto(...args);if(foreground)await page.bringToFront();await sample();return result;};
    const wait=page.waitForFunction.bind(page);page.waitForFunction=async(...args)=>{try{return await wait(...args);}catch(e){row.timeouts.push({at:new Date().toISOString(),predicate:String(args[0]).slice(0,500),error:e.constructor.name});await sample();throw e;}};
    return page;
   };return c;
  };
  const close=browser.close.bind(browser);browser.close=async(...args)=>{clearInterval(timer);await sample();const result=await close(...args);report.finished=new Date().toISOString();await save();return result;};
  await save();return browser;
 };
 const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});
