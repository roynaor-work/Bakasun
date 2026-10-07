import {chromium} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
const base=new URL('.',import.meta.url),rounds=JSON.parse(await readFile(new URL('rounds.json',base)));
const server=await serve(0);let browser;
try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/?capture=1`);await page.waitForFunction(()=>window.lab?.ready);
for(const p of rounds){const dir=new URL(`shots/r${p.round}/`,base);await mkdir(dir,{recursive:true});await page.evaluate(n=>window.lab.setRound(n),p.round);for(const view of ['front','threeQuarter','side','back']){await page.evaluate(v=>window.lab.setView(v),view);await page.screenshot({path:new URL(`${view}.png`,dir).pathname});await page.evaluate(()=>window.lab.headOnly(true));await page.screenshot({path:new URL(`${view}-head.png`,dir).pathname});await page.evaluate(()=>window.lab.headOnly(false));console.log(`r${p.round}/${view}`);}await writeFile(new URL('parameters.json',dir),JSON.stringify(p,null,2)+'\n');}
if(errors.length)throw Error(errors.join('\n'));await writeFile(new URL('shots/capture.json',base),JSON.stringify({viewport:[1024,1024],camera:'orthographic ±2.25, elevation 0.08; fixed world lighting',rounds:rounds.length,errors},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
