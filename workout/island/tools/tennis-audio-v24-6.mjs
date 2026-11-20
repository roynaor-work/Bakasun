// tennis v24.6 audio evidence (nothing is listened to): Chromium as a phone (hasTouch, isMobile, 844x390, SwiftShader WebGL), the island shell, a real
// touch through CDP (Input.dispatchTouchEvent) on the game canvas to unlock the audio, then the tools/audio-forensics.mjs tennis pilot (it serves and swings;
// here every third swing is mistimed so the player makes his own OUT and NET errors). Every Web Audio source is logged with the file it was decoded from
// (the audio-forensics init script). Reported: per OUT/NET call, the sources started from 0.3 s before to 1 s after it (which take, which crowd clip,
// any synthesised voice), the crowd files used, the looping beds, and (with --racing-first) whether anything of a racing session that ran first in the
// same page still sounds during tennis.
//   node workout/island/tools/tennis-audio-v24-6.mjs <out.json> [--seconds=90] [--query=tennisAudioV246=0] [--racing-first=25]
import {readFile,writeFile} from 'node:fs/promises';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const args=process.argv.slice(2),out=args.find(a=>!a.startsWith('--'))||'tennis-audio-v24-6.json';
const opt=(name,fallback)=>{const hit=args.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const SECONDS=Number(opt('seconds',90)),QUERY=opt('query',''),RACING=Number(opt('racing-first',0));
const tool=await readFile(new URL('./audio-forensics.mjs',import.meta.url),'utf8');
const init=tool.slice(tool.indexOf('function initScript(){'),tool.indexOf('const bots={')).replace('function initScript(){','function(){');
const bots=eval('(()=>{'+tool.slice(tool.indexOf('const bots={'),tool.indexOf('const ready={'))+';return bots;})()');
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={query:QUERY,seconds:SECONDS,racingFirst:RACING};
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(`(${init})();(()=>{const C=window.AudioContext;window.__ctxRefs=[];const W=function(...a){const c=new C(...a);window.__ctxRefs.push(c);return c;};W.prototype=C.prototype;Object.setPrototypeOf(W,C);window.AudioContext=W;})();`);
 const page=await context.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const client=await context.newCDPSession(page);
 const touchCanvas=async()=>{const b=await page.locator('.minigame-canvas').first().boundingBox();const pt={x:Math.round(b.x+b.width*.5),y:Math.round(b.y+b.height*.3),id:1};
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await page.waitForTimeout(60);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await page.goto(`${server.url}?dev=1${QUERY?'&'+QUERY:''}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island,null,{timeout:300000});
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='tennis'))e.state.buildings.push({id:'t-tennis',typeId:'tennis',x:0,y:0,level:1});});
 const start=async id=>{await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();};
 const states=()=>page.evaluate(()=>window.__ctxRefs.map(c=>c.state));
 if(RACING){
  await start('islandRacing');await page.waitForFunction(()=>(window.__island.games.current?.session.snapshot?.renderMetrics?.frames??0)>1,null,{timeout:300000});
  await page.evaluate(()=>{const i=document.querySelector('.racing-intro');if(i)i.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));});
  await page.evaluate(`(${bots.islandRacing.toString()})()`);await touchCanvas();await page.waitForTimeout(RACING*1000);
  report.racingRunning=await states();
  await page.locator('[data-action=game-pause]').first().click({force:true});await page.waitForTimeout(400);await page.locator('[data-action=game-exit]:visible').first().click({force:true});await page.waitForTimeout(2500);
  report.afterRacingExit=await states();
 }
 const tStart=await page.evaluate(()=>performance.now()/1000);
 await start('tennis');await page.waitForFunction(()=>!!window.__island.games.current?.session.ready,null,{timeout:300000});
 // the forensics pilot, with every third swing mistimed (early) so the player's own errors (and the crowd's reaction to them) happen
 await page.evaluate(()=>{const model=window.__island.games.current.session.debug.model;let pulse=false,n=0;window.__phaseProbe=()=>model.getState().phase;
  const pilot=s=>{const input={};if(s.server===0&&s.phase==='serve')input.serve=true;else if(s.server===0&&s.phase==='toss')input.serve=s.phaseTime<.62;
   else if(s.phase==='rally'){const c=s.contact;if(c&&c.side===0){const dx=c.x-s.players[0].x,dz=c.z-s.players[0].z;input.move=Math.max(-1,Math.min(1,dx*2.2));input.moveZ=Math.max(-1,Math.min(1,dz*2.2));const early=n%3===2;
     if((early?c.eta<=.16&&c.eta>.08:c.eta<=.03&&c.eta>-.2)&&!pulse){input.swing=true;pulse=true;n++;}else if(c.eta>.2)pulse=false;}else{input.move=-s.players[0].x*.8;input.moveZ=(4.2-s.players[0].z)*.8;pulse=false;}}
   return input;};
  const update=model.update.bind(model);model.update=(dt,input)=>update(dt,Object.assign({},input||{},pilot(model.getState())));});
 await touchCanvas();report.tennisRunning=await states();
 await page.waitForTimeout(SECONDS*1000);
 const snap=await page.evaluate(()=>window.__island.games.current?.session.snapshot?.audioMetrics);
 const F=await page.evaluate(()=>{const F=window.__audioForensics;return {frames:F.frames,nodes:F.nodesSnapshot(),contexts:F.contexts.map(c=>({id:c.id,stack:c.stack.split(' < ').pop()}))};});
 report.tennisEnd=await states();report.contexts=F.contexts;report.audioMetrics=snap;
 const name=n=>n.kind==='oscillator'?`osc:${n.type}`:(n.url||'?').replace(/^assets\//,'');
 const tennisNodes=F.nodes.filter(n=>n.kind!=='filter'&&n.wall!==undefined&&n.wall>=tStart);
 const calls=tennisNodes.filter(n=>/tennis-callouts-rec\//.test(n.url||'')||(n.kind==='oscillator'&&/(sawtooth|square|triangle)/.test(n.type)&&n.ph==='fault'));
 report.calls=calls.map(c=>({at:+(c.wall-tStart).toFixed(2),source:name(c),phase:c.ph,alongside:tennisNodes.filter(n=>n!==c&&n.wall>=c.wall-.3&&n.wall<=c.wall+1).map(n=>({dt:+(n.wall-c.wall).toFixed(2),source:name(n),path:n.path}))}));
 const counts={};for(const n of tennisNodes){const k=name(n)+(n.loop?' (loop)':'');counts[k]=(counts[k]||0)+1;}report.tennisSources=counts;
 report.loops=tennisNodes.filter(n=>n.loop).map(name);
 report.olderSourcesStillPlaying=F.nodes.filter(n=>n.kind!=='filter'&&n.wall!==undefined&&n.wall<tStart&&n.endedAt===undefined).map(n=>({ctx:n.ctx,source:name(n),loop:!!n.loop}));
 const byCtx={};for(const f of F.frames.filter(f=>f.t>=tStart)){const e=byCtx[f.ctx]||(byCtx[f.ctx]={frames:0,maxDb:-999});e.frames++;e.maxDb=Math.max(e.maxDb,f.lvl);}report.soundingContextsDuringTennis=byCtx;
 report.errors=errors;
}finally{await browser.close();await server.close();}
await writeFile(out,JSON.stringify(report,null,1));
console.log(JSON.stringify({query:report.query,racingFirst:report.racingFirst,afterRacingExit:report.afterRacingExit,tennisSources:report.tennisSources,loops:report.loops,calls:report.calls?.map(c=>({at:c.at,source:c.source,alongside:c.alongside.map(a=>a.dt+' '+a.source)})),soundingContextsDuringTennis:report.soundingContextsDuringTennis,callouts:report.audioMetrics?.callouts,played:report.audioMetrics?.played,errors:report.errors}));
