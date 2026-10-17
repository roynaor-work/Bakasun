import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
export async function verify(part,viewports,scenario){
 const directory=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(directory,{recursive:true});
 const prefix=part.toUpperCase(),width=Number(process.env[prefix+'_WIDTH']);if(width)viewports=[{width,height:Number(process.env[prefix+'_HEIGHT'])||390}];
 const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const reports=[];
 try{for(const viewport of viewports){const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);const page=await context.newPage(),errors=[],outside=[],shots=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
  await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
  const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=s=>page.locator(s).tap(),nav=()=>page.waitForFunction(()=>!window.__island.games.navigation.traversing);
  const start=async(id,stage=1)=>{await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]');await tick(100);await nav();assert.ok(await snap(),id+' did not start');};
  const exit=async()=>{if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await nav();};
  const shot=async(name,at=844)=>{if(viewport.width!==at)return;const png=await page.screenshot({type:'png'}),base64=await page.evaluate(async b=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(bitmap.width,bitmap.height);c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const blob=await c.convertToBlob({type:'image/webp',quality:.18});return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});},png.toString('base64'));await writeFile(directory+name+'.webp',Buffer.from(base64,'base64'));shots.push(name+'.webp');};
  try{await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await tap('[data-action=avatar-start]');await tick(32);
   await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['soccer','tennis','fireStation','airbase']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}e.place('road',0,7);e.place('harbor',0,8);for(const id of ['navalDuel','fireRescue','alienDefense']){const r=data.config.minigames[id].render;if(r)r.fallbackFrameMs=10000;}data.config.minigames.soccer.view.slowFrameMs=10000;});
   const result=await scenario({page,context,viewport,tick,snap,tap,start,exit,shot,nav,assert});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({...viewport,...result,errors,outside,shots});console.log(part,'verified',viewport);
  }catch(e){console.error(part,'failed',viewport,errors,await snap().catch(()=>null));throw e;}finally{await context.close();}
 }await writeFile(directory+(width?`${width}-verification.json`:'verification.json'),JSON.stringify({part,browser:'Chromium / SwiftShader',physicalPhone:false,iPhone:false,phoneFPS:false,reports},null,2)+'\n');}finally{await browser.close();await server.close();}
}
