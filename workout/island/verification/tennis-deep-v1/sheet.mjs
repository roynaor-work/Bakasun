import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const [,, url, out]=process.argv;
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const p=await (await b.newContext({viewport:{width:844,height:390},deviceScaleFactor:1})).newPage();
await p.goto(url,{waitUntil:'load'});await p.waitForFunction(()=>window.__tennis,null,{timeout:120000});
await p.waitForFunction(()=>{const s=window.__tennis.model.getState();return s.event.type==='hit'&&s.event.side===0&&!s.event.serving;},null,{timeout:120000,polling:30});
const frames=[];for(let i=0;i<6;i++){frames.push(await p.screenshot({clip:{x:222,y:120,width:400,height:250}}));await p.waitForTimeout(110);}
const fs=await import('node:fs');frames.forEach((f,i)=>fs.writeFileSync(`${out}-${i}.png`,f));console.log(JSON.stringify(await p.evaluate(()=>window.__tennis.model.getState().event)));await b.close();
