// Visual review stills for Island Tennis (view only, on the perf page): the same court at the same time of the autopilot rally,
// in each phone viewport, for each variant (a query string, e.g. tennisV7=0 / tennisV7=1 / tennisV7=1+tennisSurface=grass).
// Software WebGL (SwiftShader): the pictures show materials, lighting and layout, not a phone's speed.
// Usage: node workout/island/tools/tennis-shots.mjs out=DIR [label=after] [variant=tennisV7=1] [viewports=390x844,844x390] [wait=5000] [dpr=2] [stage=1]
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/tennis-shots'),label=args.label||'after',variant=(args.variant||'tennisV7=1').replaceAll('+','&');
const viewports=(args.viewports||'390x844,844x390').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const wait=Number(args.wait||5000),dpr=Number(args.dpr||2),stage=args.stage||'1',name=args.name||'';
await mkdir(out,{recursive:true});
const server=await serveIsland();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
try{
 for(const viewport of viewports){
  const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(300000);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${server.url}tools/perf-tennis.html?dur=3600&stage=${stage}&${variant}`,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#perf .live')?.textContent==='מודד...',null,{timeout:240000});
  await page.evaluate(()=>{document.getElementById('perf').hidden=true;});
  await page.waitForTimeout(wait);
  const file=path.join(out,`${label}-${tag}${name?'-'+name:''}.png`);
  await page.screenshot({path:file});
  console.log(file,errors.length?'errors: '+errors.slice(0,3).join(' | '):'');
  await context.close();
 }
}finally{await browser.close();await server.close();}
