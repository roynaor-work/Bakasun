import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const [,, url, out, w='844', h='390', wait='4000']=process.argv;
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const c=await b.newContext({viewport:{width:+w,height:+h},hasTouch:true,isMobile:true,deviceScaleFactor:1}),p=await c.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(url,{waitUntil:'load'});await p.waitForFunction(()=>window.__tennis||window.__perf?.error,null,{timeout:120000});await p.waitForTimeout(+wait);
await p.screenshot({path:out});console.log(JSON.stringify(await p.evaluate(()=>window.__tennis?.view?.metrics())).slice(0,600),errs.slice(0,3));await b.close();
