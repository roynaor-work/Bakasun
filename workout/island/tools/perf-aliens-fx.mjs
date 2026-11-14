// Aliens v24: what the Codex effects cost a frame. The real phone path (island shell, games.start, the harness of the browser tests) at 844x390 with touch;
// both fire buttons held by CDP touches and a third finger keeping the ship under the lowest alien (the busiest moment: Vulcan bursts, flames, impacts,
// explosions, the meter, the laser volley); the effects on and off (?alienFx=0 by
// its global switch) alternate, so the machine's load hits both alike. Per round: the real milliseconds the page needs for one second of game (60 frames:
// simulation, the 3D view, the 2D overlay and the HUD), the 3D draw calls and triangles, and how many effects were alive.
// SwiftShader software WebGL: the numbers compare on and off on this machine; they are not a phone's.
// Usage: PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node workout/island/tools/perf-aliens-fx.mjs [rounds=3] [seconds=4]
import {verify} from '../tests/night-browser.mjs';
const rounds=Number(process.argv[2]||3),seconds=Number(process.argv[3]||4);
await verify('aliens-v24/perf',[{width:844,height:390,isMobile:true}],async({page,context,tick,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const runs={on:[],off:[]};
 for(let r=0;r<rounds;r++)for(const mode of r%2?['off','on']:['on','off']){
  await page.evaluate(off=>{globalThis.__alienFx=off?false:undefined;},mode==='off');
  await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
  if(mode==='on')await page.waitForFunction(()=>(window.__island.games.current.session.snapshot.fx?.sprites.length||0)>=11,{timeout:120000}).catch(()=>{});
  await tick(1000);const fire=await center('#shoot'),vul=await center('#vulcan');
  // a third finger on the flight surface keeps the ship under the lowest alien (the browser test's aim), so shots land: impacts and explosions too
  const s0=await page.evaluate(()=>{const s=window.__island.games.current.session.snapshot;return {x:s.player.x,w:s.viewport.modelWidth};}),finger=x=>({x:Math.max(2,Math.min(842,Math.round(422+(x-s0.x)/(s0.w/844)))),y:150,id:3});
  const aim=()=>page.evaluate(()=>{const m=window.__island.games.current?.session.debug.model;if(!m)return null;const a=[...m.aliens].filter(a=>a.y>0).sort((x,y)=>y.y-x.y)[0];return a?a.x:m.player.x;});
  let target=(await aim())??s0.x;await touch('touchStart',[finger(s0.x)]);await touch('touchMove',[finger(target)]);
  await touch('touchStart',[finger(target),{...fire,id:1}]);await touch('touchStart',[finger(target),{...fire,id:1},{...vul,id:2}]);await tick(1000);
  const per=[],live=[];let rm=null;
  for(let k=0;k<seconds;k++){const t0=performance.now();for(let q=0;q<4;q++){await tick(250);target=(await aim())??target;await touch('touchMove',[finger(target),{...fire,id:1},{...vul,id:2}]);}per.push(performance.now()-t0);
   const s=await page.evaluate(()=>{const s=window.__island.games.current?.session.snapshot;return s?{rm:s.renderMetrics||null,fx:s.fx?.effects??null}:null;});if(!s)break;rm=s.rm;live.push(s.fx);}
  await touch('touchEnd');
  const msPerFrame=per.map(ms=>+(ms/60).toFixed(2));runs[mode].push({msPerFrame,median:[...msPerFrame].sort((a,b)=>a-b)[Math.floor(msPerFrame.length/2)],drawCalls:rm?.drawCalls??null,triangles:rm?.triangles??null,effectsAlive:live});
  console.log(mode,JSON.stringify(runs[mode].at(-1)));
  if(await page.evaluate(()=>Boolean(window.__island.games.current)))await exit();else{await tick(1500);await nav();}
 }
 await page.evaluate(()=>{globalThis.__alienFx=undefined;});
 const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
 const summary={on:med(runs.on.flatMap(r=>r.msPerFrame)),off:med(runs.off.flatMap(r=>r.msPerFrame)),drawCalls:{on:runs.on[0]?.drawCalls,off:runs.off[0]?.drawCalls},triangles:{on:runs.on[0]?.triangles,off:runs.off[0]?.triangles},maxEffectsAlive:Math.max(0,...runs.on.flatMap(r=>r.effectsAlive.filter(Number.isFinite)))};
 console.log('summary',JSON.stringify(summary));
 return {runs,summary};
});
