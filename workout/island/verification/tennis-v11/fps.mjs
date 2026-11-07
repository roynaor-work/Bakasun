import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const q of ['tennisStadium=0','tennisStadium=1']){const c=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),p=await c.newPage();
 await p.goto(`http://localhost:8765/tools/perf-tennis.html?dur=3600&tennisV7=1&${q}`);await p.waitForFunction(()=>window.__tennis);await p.waitForTimeout(2500);
 const r=await p.evaluate(async()=>{const m=()=>window.__tennis.view.metrics().frames;const a=m(),t=performance.now();await new Promise(r=>setTimeout(r,6000));return {fps:((m()-a)/((performance.now()-t)/1000)).toFixed(1),tri:window.__tennis.view.metrics().triangles,calls:window.__tennis.view.metrics().drawCalls};});console.log(q,JSON.stringify(r));await c.close();}
await b.close();
