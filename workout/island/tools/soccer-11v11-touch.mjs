/** Soccer full (11 against 11) real-touch proof (evidence only; never writes match state). Same rig as the v23/v24 harnesses
 * (tools/soccer-v23-touch.mjs): Chromium + SwiftShader, 844x390, hasTouch + isMobile, the island entered through its menu, a bot that
 * plays only through CDP touches (the floating stick and the real action buttons), the page clock stepped one frame at a time.
 * It records the match events by team (passes, lofts, shots, headers, goals, switches, set pieces, advantage), the renderer's triangles,
 * draw calls and tier, the full match's LOD plan (near / middle / far / hidden bodies) and the camera, and takes one screenshot per moment.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/soccer-11v11-touch.mjs <outDir>
 *        [--query=soccerTier=0] [--seconds=30 | --half | --full] [--tag=after] [--stage=2] [--frame=16] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTouchBot,controlLayout} from './soccer-v23-touch.mjs';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../tests/shell-ready.mjs';

/** As openSoccer of the v23 harness (same browser flags, the island save prepared as a player has it, the match entered through the
 * menu), with long timeouts: on a loaded build machine the island itself can take minutes to come up. */
export async function openFull({query='',stage=2,viewport={width:844,height:390}}={}){
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});context.setDefaultTimeout(600000);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await page.clock.install();
  await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'networkidle',timeout:600000});await page.waitForFunction(()=>window.__island,null,{timeout:600000});
  await page.evaluate(stageWanted=>{
    const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת מגע',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
    if(!engine.state.buildings.some(b=>b.typeId==='soccer')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('soccer');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
    engine.setSoccerDifficulty('normal');if(engine.state.minigameProgress?.soccer)engine.state.minigameProgress.soccer.stage=Math.max(engine.state.minigameProgress.soccer.stage,stageWanted);engine.save();ui.closeModal();games.menu();
  },stage);
  await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator(`[data-stage="${stage}"]`).click();
  if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
  await waitForGameStart(page);await page.waitForLoadState('networkidle',{timeout:600000});
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.renderMetrics?.assetStatus==='ready'&&s.contractsStatus==='ready';},null,{timeout:900000});
  await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+5000));
  const cdp=await context.newCDPSession(page),fingers=new Map();
  const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers].map(([id,p])=>({id,x:p.x,y:p.y,radiusX:6,radiusY:6,force:1}))});
  const touch={
    async down(id,x,y){fingers.set(id,{x,y});await send('touchStart');},
    async move(id,x,y){if(!fingers.has(id))return touch.down(id,x,y);const f=fingers.get(id);if(Math.abs(f.x-x)<.5&&Math.abs(f.y-y)<.5)return;fingers.set(id,{x,y});await send('touchMove');},
    async up(id){if(!fingers.has(id))return;const f=fingers.get(id);fingers.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,x:f.x,y:f.y,radiusX:6,radiusY:6,force:1}]});},
    held:id=>fingers.has(id),
  };
  const rect=sel=>page.locator(sel).boundingBox({timeout:600000});
  const close=async()=>{await cdp.detach().catch(()=>{});await context.close().catch(()=>{});await browser.close().catch(()=>{});await server.close().catch(()=>{});};
  return {page,touch,rect,errors,close};
}

/** In-page read, light: what the bot needs (like a child looking at the screen) and the match events since the last read. */
function readLight(){
  const session=window.__island.games.current?.session;if(!session)return null;
  const model=session.debug.model,view=session.debug.view,s=model.getState(),P=window.__full||(window.__full={wrapped:null,events:[]});
  if(P.wrapped!==model){const drain=model.drainEvents.bind(model);model.drainEvents=()=>{const list=drain();for(const e of list)P.events.push({type:e.type,team:e.team??(e.player!=null?s.players[e.player]?.team:null),player:e.player??null,restart:e.restart??null,kind:e.kind??null,target:e.target??null,advantage:e.advantage??null,elapsed:+s.elapsed.toFixed(2)});return list;};P.wrapped=model;}
  const b=s.ball,events=P.events.splice(0);
  return {phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),half:s.half,score:[...s.score],
    restart:s.restart?{type:s.restart.type,team:s.restart.team,player:s.restart.player}:null,
    ball:{x:b.x,y:b.y,z:b.z,vx:b.vx,vz:b.vz,owner:b.owner,flight:b.flight?1:0},players:s.players.map(p=>({x:p.x,z:p.z,team:p.team})),
    hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),result:Boolean(model.result),events,
    air:{prompt:document.querySelector('#shoot')?.dataset.air||'',slot:document.querySelector('#soccer-switch')?.dataset.air||'',armed:Boolean(s.headerArm)}};
}
function readMetrics(){
  const session=window.__island.games.current?.session,m=session?.snapshot?.renderMetrics,view=session?.debug.view;
  return m?{triangles:m.triangles,draws:m.drawCalls,quality:m.quality,pixelRatio:m.pixelRatio,full:m.full,lods:(view?.characters||[]).map(c=>c.metrics?.().lod??null),visible:(view?.characters||[]).map(c=>c.pivot?.visible?1:0),
    radar:(()=>{const r=document.querySelector('.soccer-radar');if(!r)return null;const b=r.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),hidden:r.hidden};})()}:null;
}

async function main(){
  const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'soccer-11v11-out');
  const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
  const query=opt('query',''),tag=opt('tag','after'),stage=Number(opt('stage',2)),frameMs=Number(opt('frame',16)),half=args.includes('--half'),full=args.includes('--full'),seconds=Number(opt('seconds',30));
  await mkdir(out,{recursive:true});
  const t0=Date.now(),h=await openFull({query,stage});const loadSeconds=(Date.now()-t0)/1000;
  const layout=await controlLayout(h),bot=createTouchBot({layout,switchEvery:5,airEvery:.35,pitchHalf:52.5,pitchWide:34});
  const counts={},byTeam={0:{},1:{}},shots={},samples=[],timeline=[];let last=null,lastSample=null;
  const pending=new Map();
  const shot=async(name,f)=>{if(shots[name]!==undefined)return;shots[name]=f.elapsed;const file=path.join(out,`${tag}-${name}.png`);
    try{await h.page.screenshot({path:file,timeout:120000});}catch(e){process.stderr.write(`${tag} screenshot ${name} failed: ${e.message.split('\n')[0]}\n`);}process.stderr.write(`${tag} shot ${name} at ${f.elapsed}\n`);};
  const summarize=()=>({tag,query,stage,frameMs,loadSeconds,wallSeconds:(Date.now()-t0)/1000,gameSeconds:last?.elapsed??0,half:last?.half,phase:last?.phase,score:last?.score,result:last?.result,
    events:counts,byTeam,shots,samples,lastMetrics:lastSample,timeline:timeline.slice(-400),errors:h.errors});
  try{
    const limit=full?Infinity:half?Infinity:Math.ceil(seconds*1000/frameMs);
    for(let i=0;i<limit;i++){
      await h.page.clock.runFor(frameMs);
      const f=await h.page.evaluate(readLight);if(!f)break;last=f;
      for(const e of f.events){counts[e.type]=(counts[e.type]||0)+1;if(e.team===0||e.team===1)byTeam[e.team][e.type]=(byTeam[e.team][e.type]||0)+1;
        if(['pass','loft','shot','header','clearance','goal','switch','advantage','foul','restart','halftime','fulltime'].includes(e.type))timeline.push({...e});
        // a screenshot a few frames after the moment (the motion and the cue are visible then)
        const key=e.type==='restart'?e.restart:e.type==='pass'&&e.team===0?'pass':e.type==='loft'&&e.team===0?'loft':e.type==='shot'&&e.team===0?'shot':e.type==='header'?'header':e.type==='switch'?'switch':e.type==='goal'?'goal':e.type==='advantage'?'advantage':e.type==='halftime'?'halftime':null;
        if(key&&!pending.has(key)&&shots[key]===undefined)pending.set(key,i+(key==='goal'?3:key==='halftime'?2:6));}
      await bot.step(f,h.touch,frameMs/1000);
      if(i%40===0){lastSample=await h.page.evaluate(readMetrics);samples.push({at:f.elapsed,phase:f.phase,...lastSample});}
      if(f.phase==='playing'&&f.elapsed>.4&&shots.kickoff===undefined)await shot('kickoff',f);
      if(f.phase==='playing'&&f.elapsed>14&&shots.play===undefined&&f.ball.owner!==null)await shot('play',f);
      for(const [key,at] of [...pending])if(i>=at){pending.delete(key);await shot(key,f);}
      if(i%600===599){await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summarize(),null,1));process.stderr.write(`${tag} t=${f.elapsed} half=${f.half} score=${f.score} wall=${((Date.now()-t0)/1000).toFixed(0)}s ${JSON.stringify(counts)}\n`);}
      if(f.result||f.phase==='finished')break;
      if(half&&f.half===2&&f.elapsed>=90.5&&f.phase==='playing')break;
    }
  }finally{
    await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summarize(),null,1));
    await h.close();
  }
  process.stdout.write(JSON.stringify({tag,gameSeconds:last?.elapsed,score:last?.score,events:counts,shots,errors:h.errors.length})+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exit(1);});
