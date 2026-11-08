// usage: node bench.mjs <islandRoot> <label> [games,comma] [seconds] [throttle] [net:0|1] [extraQuery]
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';
const require=createRequire('/opt/node22/lib/node_modules/');const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),label=process.argv[3]||'run';
const ALL=['city','soccer','streetSlam','alpineRush','tennis','islandRacing','navalDuel','fireRescue','alienDefense','boarDefense','catchCriminal'];
const games=(process.argv[4]&&process.argv[4]!=='all'?process.argv[4].split(','):ALL),secs=Number(process.argv[5]||10),thr=Number(process.argv[6]||4),net=process.argv[7]==='1',extra=process.argv[8]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm','.webmanifest':'application/json'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(root,'.'+p);if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','content-length':b.length}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info','--autoplay-policy=no-user-gesture-required']});
const pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)))];};
const rows=[];
for(const game of games){
  const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:process.env.SW==='1'?'allow':'block'});const page=await ctx.newPage();
  const cdp=await ctx.newCDPSession(page);
  if(thr>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:thr});
  if(net){await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200*1024,uploadThroughput:100*1024});} // ~1.6 Mbps
  let reqs=0,bytes=0,cached=0;page.on('request',()=>reqs++);page.on('response',async r=>{try{const l=r.headers()['content-length'];bytes+=Number(l||0);}catch{}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,120)));
  await page.addInitScript(()=>{window.__M={frames:[],last:0,long:0,on:false};const raw=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raw(n=>{if(window.__M.on){if(n!==window.__M.last){if(window.__M.last)window.__M.frames.push(n-window.__M.last);window.__M.last=n;}}cb(n);});try{new PerformanceObserver(l=>{if(window.__M.on)window.__M.long+=l.getEntries().length;}).observe({type:'longtask'});}catch{}});
  const t0=Date.now();
  await page.goto(`http://127.0.0.1:${server.address().port}/?dev=1${extra}`,{waitUntil:'load'});
  let row={game};
  try{
    await page.waitForFunction(()=>window.__island,null,{timeout:240000});
    row.bootMs=Date.now()-t0;
    await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded,null,{timeout:120000}).catch(()=>{});
    try{await page.locator('[data-action=avatar-start]').tap({timeout:5000});}catch{}
    await page.evaluate(()=>{const i=window.__island;i.engine.setAvatar?.({created:true});try{i.engine.skipTutorial();}catch{}const cfg=i.data.config.minigames;for(const k of Object.keys(cfg)){const b=cfg[k]?.requiresBuilding;if(b&&!i.engine.state.buildings.some(r=>r.typeId===b))i.engine.state.buildings.push({typeId:b,id:'bench-'+b,x:0,y:0,level:1});}i.engine.canPlay=()=>true;i.games.requireDaily=()=>false;});
    if(process.env.DELAY)await page.waitForTimeout(Number(process.env.DELAY));
    const tl=Date.now();
    if(game!=='city'){
      await page.evaluate(g=>{window.__island.games.launch(g);},game);
      // ready: session.ready or snapshot loaded / render calls
      await page.waitForFunction(()=>{const s=window.__island.engine.isMinigameActive();return s;},null,{timeout:10000}).catch(()=>{});
      const ready=await page.waitForFunction(()=>{const c=window.__island.games.current;const s=c?.session;if(!s)return false;if(typeof s.ready==='boolean')return s.ready;let sn;try{sn=s.snapshot}catch{return false}if(sn?.ready===true)return true;const m=sn?.renderMetrics;if(!sn)return false;if(!('renderMetrics' in sn))return true;return !!(sn?.loaded||m?.assetStatus==='ready'||m?.calls>0||m?.drawCalls>0||m?.triangles>0);},null,{timeout:90000,polling:200}).then(()=>true).catch(()=>false);
      row.readyMs=ready?Date.now()-tl:null;
    }else{row.readyMs=0;}
    if(game==='city'&&process.env.FULL==='1'){
      await page.evaluate(()=>{const {engine:e,view}=window.__island;const types=['house','shop','factory','park','fireStation','waterTower','hospital','school','police','soccer','library','mathLab','powerPlant'];const b=[{id:'city-hall',typeId:'cityHall',x:12,z:12,level:1}];for(let x=0;x<24;x++)b.push({id:'r'+x,typeId:'road',x,z:7,level:1});for(let x=0;x<24;x+=3)b.push({id:'r2'+x,typeId:'road',x:7,z:x,level:1});let k=0;for(let z=2;z<24;z+=4)for(let x=0;x<22;x+=4){if(z===6||x===6)continue;b.push({id:'f'+k,typeId:types[k%types.length],x,z,level:1+(k%4)});k++;}e.state.buildings=b;view.setWorld?.(e.state);try{view.syncCity(b,true)}catch(e){}});
      await page.waitForTimeout(8000);
    }
    await page.evaluate(()=>{window.__M.on=true;window.__M.last=0;});
    // light input so the game runs
    if(game!=='city')for(let i=0;i<Math.floor(secs/2);i++){await page.mouse.click(600,200).catch(()=>{});await page.waitForTimeout(2000);}else await page.waitForTimeout(secs*1000);
    const m=await page.evaluate(()=>{const M=window.__M;M.on=false;const c=window.__island.games?.current;let rm=null;try{rm=c?.session?.snapshot?.renderMetrics||null;}catch{}const mem=performance.memory;
      let t=null;try{const v=window.__island.view;const info=v?.renderer?.info||v?.three?.renderer?.info;if(info)t={tris:info.render.triangles,calls:info.render.calls};}catch{}
      return {frames:M.frames,long:M.long,rm:rm&&{tri:rm.triangles,calls:rm.drawCalls??rm.calls,geo:rm.geometries,tex:rm.textures},t,heapMB:mem?Math.round(mem.usedJSHeapSize/1048576):null};});
    row.fps=Math.round(m.frames.length/ (m.frames.reduce((a,b)=>a+b,0)/1000||1)*10)/10;row.p50=Math.round(pct(m.frames,.5));row.p95=Math.round(pct(m.frames,.95));row.long=m.long;row.tri=m.rm?.tri??m.t?.tris??null;row.calls=m.rm?.calls??m.t?.calls??null;row.heapMB=m.heapMB;row.reqs=reqs;if(process.env.SW==='1'){row.dl=await page.evaluate(async()=>{const k=await caches.keys();let n=0;for(const x of k){n+=(await (await caches.open(x)).keys()).length}return {entries:n,state:window.__offlineState?.state}});}row.errors=errors.length;if(errors.length)row.err=errors[0];
  }catch(e){row.fail=String(e.message).slice(0,100);}
  console.log(label,JSON.stringify(row));rows.push(row);await ctx.close();
}
await browser.close();server.close();
import('node:fs').then(fs=>fs.writeFileSync(`out-${label}.json`,JSON.stringify(rows,null,1)));
