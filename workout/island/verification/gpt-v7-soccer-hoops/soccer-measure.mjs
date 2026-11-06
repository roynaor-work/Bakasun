// node soccer-measure.mjs <label> [extra query]  → soccer-<label>-<WxH>.png + soccer-<label>.json
import {islandChromium} from '../../../../tests/helpers/island-browser.mjs';
import {writeFileSync} from 'node:fs';
const chromium=await islandChromium();
const label=process.argv[2]||'run',extra=process.argv[3]||'',base=process.env.BASE||'http://127.0.0.1:8765/workout/island/tools/perf-soccer.html';
const out=new URL('./',import.meta.url).pathname,res={};
const b=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-certificate-errors']});
for(const [w,h] of [[390,844],[844,390]]){
 const ctx=await b.newContext({viewport:{width:w,height:h},serviceWorkers:'block'}),p=await ctx.newPage(),errs=[];
 let bytes=0;p.on('response',async r=>{try{const body=await r.body();bytes+=body.length;}catch{}});
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`${base}?auto=1&seconds=14&warmup=3&quality=0${extra}`);
 await p.waitForFunction(()=>document.querySelector('#perf-status')&&/ \d/.test(document.querySelector('#perf-status').textContent||'')||window.__perf?.done,null,{timeout:300000}).catch(()=>{});
 await p.waitForTimeout(6000);
 await p.screenshot({path:`${out}soccer-${label}-${w}x${h}.png`});
 await p.waitForFunction(()=>window.__perf?.done,null,{timeout:300000});
 const r=await p.evaluate(()=>window.__perf);res[`${w}x${h}`]={error:r.error,quality:r.result?.quality,match:r.result?.match,bytes,errs};
 await ctx.close();
}
writeFileSync(`${out}soccer-${label}.json`,JSON.stringify(res,null,1));console.log(JSON.stringify(res,null,1));await b.close();
