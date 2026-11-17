import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
const fixture='<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}#dialog{position:relative;height:100vh}.game-stage{position:relative;height:100%}.game-stage>canvas{width:100%;height:100%}</style><body><main id="dialog" class="fire-play"><div class="game-header"><button id="prior">Pause</button></div><div class="game-stage"><canvas id="street"></canvas></div><div class="game-controls"></div></main></body></html>';
export async function fireBrowser(t){
  const module=process.env.ISLAND_PLAYWRIGHT;
  let playwright;
  if(module)playwright=await import(path.isAbsolute(module)?pathToFileURL(module).href:module);
  else try{playwright=await import('playwright');}catch{playwright=await import('file:///opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs');}
  const {chromium}=playwright;
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__review-fire.html'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const content=await readFile(file);res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':/\.json$/.test(file)?'application/json':/\.css$/.test(file)?'text/css':'application/octet-stream');res.end(content);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  return {async page(query=''){const page=await browser.newPage({viewport:{width:844,height:390}});await page.goto(`http://127.0.0.1:${server.address().port}/__review-fire.html${query}`);return page;}};
}
export async function startInterior(page,{level=3,tutorial=false,mode='real',loadTimeoutMs=15000}={}){
  await page.evaluate(async({level,tutorial,mode,loadTimeoutMs})=>{
    const [{runFireV24Interior},{entryPlan},strings]=await Promise.all([import('/workout/island/minigames/fire-v24-session.mjs'),import('/workout/island/minigames/fire-v24.mjs'),fetch('/workout/island/data/strings.he.json').then(r=>r.json())]);
    window.__done=[];window.__errors=[];
    const ctx={dialog:document.querySelector('#dialog'),canvas:document.querySelector('#street'),t:(key,vars={})=>Object.entries(vars).reduce((str,[k,v])=>str.replaceAll('{'+k+'}',v),strings[key]||key),lite:true};
    window.__ctx=ctx;
    const options={plan:entryPlan(level),tutorial,loadTimeoutMs,onDone:(result,error)=>__done.push({result,error:error?.message||null})};
    if(mode!=='real')options.createScene=()=>window.__fake={ready:mode==='ready',loadFailed:mode==='failed',update(){},render(){},resize(){},pick(){return[0,0,0]},project(){return{x:400,y:200}},metrics(){return{}},dispose(){this.disposed=true}};
    document.querySelector('#prior').focus();window.__probe=runFireV24Interior(ctx,options);
  },{level,tutorial,mode,loadTimeoutMs});
}
export async function modelToSecondRoom(page){
  await page.evaluate(()=>{const m=__probe.model;for(let i=0;i<100;i++)m.update(.1,{skip:true});for(const s of m.room.spots)for(let i=0;i<100&&!s.done;i++)m.update(.1,{aim:s.pos});m.update(.1,{tap:[...m.room.friend.pos]});for(let i=0;i<100&&m.roomIndex===0;i++)m.update(.1,{});__probe.scene.update(.01);});
}
