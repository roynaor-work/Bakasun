/** Basketball v24.1: what the 3D fans cost, measured on one frozen game frame (evidence only). Chromium + SwiftShader, 844x390, touch, real
 * timers (no page clock: the timings must be wall time). The match is entered through the menu and left to the AI until the 3D fans are up
 * and play is live; then the loop is held (`session.debug.hold`) and the same frame is drawn again and again, alternating the v24 cards and
 * the 3D fans in ABBA blocks (`view.showCrowdCards`), each draw followed by gl.finish() so the software rasteriser's work is inside the
 * timing. Also: renderer calls / triangles per variant and one screenshot of each on the identical frame (the before / after picture).
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/hoops-v241-perf.mjs <outDir>
 *        [--query=...] [--viewport=844x390] [--blocks=8] [--draws=12] [--tag=crowd] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'hoops-v241-perf');
const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
const query=opt('query',''),tag=opt('tag','crowd'),blocks=Number(opt('blocks',24)),draws=Number(opt('draws',5));
const [vw,vh]=opt('viewport','844x390').split('x').map(Number);
await mkdir(out,{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:vw,height:vh},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(300000);
try{
  await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{const {engine,ui,games}=window.__island;engine.setAvatar({name:'מדידה',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
    if(!engine.state.buildings.some(b=>b.typeId==='basketball')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('basketball');engine.buildReadyPlot(plot.id);}engine.save();ui.closeModal();games.menu();});
  await page.locator('[data-action="game-enter"][data-game-id="streetSlam"]').click();await page.locator('[data-action="game-play"]').click();await page.locator('[data-action="hoops-play-next"]').click();
  if(await page.locator('[data-action="game-understood"]').count())await page.locator('[data-action="game-understood"]').click();
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session?.snapshot,c=s?.renderMetrics?.v241?.crowd3d;return s?.phase==='live'&&(c?.status==='ready'&&c.visible||c?.status==='off'||c?.status==='fallback');},null,{timeout:300000});
  await page.waitForTimeout(1500);
  const result=await page.evaluate(async({blocks,draws})=>{
    const s=window.__island.games.current.session,d=s.debug,v=d.view,gl=v.renderer.getContext();d.hold=true;
    // short alternating blocks (ABBA ABBA ...): a busy shared machine drifts slowly, the blocks are shorter than the drift
    const order=[];for(let b=0;b<blocks;b++)order.push(['A','B','B','A'][b%4]);
    const runs={A:[],B:[]},info={A:null,B:null};
    const draw=()=>{const t=performance.now();d.render();gl.finish();return performance.now()-t;};
    for(const k of order){
      v.showCrowdCards(k==='A');draw();draw();
      for(let i=0;i<draws;i++)runs[k].push(draw());
      const m=v.metrics();info[k]={calls:m.calls,triangles:m.triangles,crowd3d:m.v241.crowd3d};
    }
    // median and a 20%-trimmed mean: the stalls of other processes on the machine (seconds) say nothing about the scene
    const stat=list=>{const v=[...list].sort((a,b)=>a-b),mean=v.reduce((a,b)=>a+b,0)/v.length,cut=Math.floor(v.length*.2),mid=v.slice(cut,v.length-cut),trim=mid.reduce((a,b)=>a+b,0)/mid.length;
      return {n:v.length,median:+v[Math.floor(v.length/2)].toFixed(2),trimmedMean:+trim.toFixed(2),mean:+mean.toFixed(2),p10:+v[Math.floor(v.length*.1)].toFixed(2),p90:+v[Math.floor(v.length*.9)].toFixed(2)};};
    return {order:order.join(''),A:{...stat(runs.A),...info.A},B:{...stat(runs.B),...info.B},quality:v.metrics().quality,flags:v.metrics().v241.flags};
  },{blocks,draws});
  // the identical frame, cards and 3D fans
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.view.showCrowdCards(true);d.render();});
  await page.screenshot({path:path.join(out,`${tag}-cards.png`)});
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.view.showCrowdCards(false);d.render();});
  await page.screenshot({path:path.join(out,`${tag}-3d.png`)});
  // --closeup: the same frozen frame from close behind and in front of a home player (the v2 body: number on the back and shorts, hands)
  if(args.includes('--closeup')){
    for(const side of ['back','front']){
      await page.evaluate(side=>{const s=window.__island.games.current.session,d=s.debug,snap=s.snapshot,p=snap.players.filter(q=>q.team===0).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x))[0];
        const fx=Math.sin(p.face),fz=Math.cos(p.face),k=side==='back'?-1:1;d.view.setCameraOverride({x:p.x+fx*2.7*k,y:1.7,z:p.z+fz*2.7*k},{x:p.x,y:1.15,z:p.z},38);d.render();},side);
      await page.screenshot({path:path.join(out,`${tag}-closeup-${side}.png`)});
    }
    await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.view.setCameraOverride(null);d.render();});
  }
  result.cost={medianMs:+(result.B.median-result.A.median).toFixed(2),trimmedMs:+(result.B.trimmedMean-result.A.trimmedMean).toFixed(2),relativeMedian:+(result.B.median/result.A.median-1).toFixed(3),relativeTrimmed:+(result.B.trimmedMean/result.A.trimmedMean-1).toFixed(3),triangles:result.B.triangles-result.A.triangles,calls:result.B.calls-result.A.calls,planMs:result.B.crowd3d?.planMs??null};
  result.viewport=`${vw}x${vh}`;result.query=query;result.errors=errors;result.renderer='Chromium SwiftShader (software WebGL): CPU cost, not a phone GPU';
  await writeFile(path.join(out,`${tag}.json`),JSON.stringify(result,null,1));
  console.log(JSON.stringify(result));
}finally{await context.close().catch(()=>{});await browser.close().catch(()=>{});await server.close().catch(()=>{});}
