import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const [,, out]=process.argv;
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const fs=await import('node:fs');
for(const mode of ['off','on']){
 const p=await (await b.newContext({viewport:{width:844,height:390},deviceScaleFactor:1})).newPage();
 await p.goto(`http://localhost:8765/tools/perf-tennis.html?dur=3600&tennisV7=1&tennisStadium=0${mode==='off'?'&tennisMotionV1=0':''}`);await p.waitForFunction(()=>window.__tennis);await p.waitForTimeout(2500);
 // wait for the human to be running, then 6 frames
 await p.waitForFunction(()=>window.__tennis.model.getState().players[0].running,null,{timeout:90000,polling:40});
 for(let i=0;i<6;i++){fs.writeFileSync(`${out}-${mode}-${i}.png`,await p.screenshot({clip:{x:300,y:170,width:240,height:200}}));await p.waitForTimeout(140);}
 console.log(mode,JSON.stringify(await p.evaluate(()=>window.__tennis.view.metrics().motion)));await p.close();
}
await b.close();
