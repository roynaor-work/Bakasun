/** Real-browser soccer control check (Chromium + swiftshader, controlled page clock so frames are exact).
 * Measures touch -> model motion -> rendered motion in a real session and takes both-orientation screenshots.
 * Usage: ISLAND_PLAYWRIGHT=... CHROMIUM_PATH=... node tools/ctrl-soccer-browser.mjs <outDir> [--saved-left]
 * The same script runs against old and new code: it touches the joystick's own centre. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../tests/shell-ready.mjs';

const out=path.resolve(process.argv[2]||'ctrl-out'),savedLeft=process.argv.includes('--saved-left');await mkdir(out,{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
try{
  const VIEWPORTS=(process.env.VIEWPORTS||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
  for(const viewport of VIEWPORTS){
    const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
    if(savedLeft)await context.addInitScript(()=>{try{localStorage.setItem('island.soccer.handed','left');}catch{}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
    await page.evaluate(()=>{
      const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת שליטה',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
      if(!engine.state.buildings.some(b=>b.typeId==='soccer')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('soccer');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
      engine.setSoccerDifficulty('normal');engine.save();ui.closeModal();games.menu();
    });
    await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator('[data-stage="1"]').click();
    if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
    await waitForGameStart(page);await page.waitForLoadState('networkidle');
    await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.renderMetrics?.assetStatus==='ready'&&s.contractsStatus==='ready';},{},{timeout:120000});
    await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+10000));
    const fixture=()=>page.evaluate(()=>{
      const session=window.__island.games.current.session,model=session.debug.model,s=model.getState(),config=window.__island.data.config.minigames.soccer;session.setPaused(false);model.clearInput();
      Object.assign(s,{phase:'playing',restart:null,attackDir:1,controlled:0,switchCooldown:100,passTarget:null,mode:'attack',role:'field'});
      for(const p of s.players)Object.assign(p,{recover:p.id===0?0:1000,cooldown:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0,vx:0,vz:0,fx:p.team===0?1:-1,fz:0,hands:false,restartMotion:null});
      Object.assign(s.players[0],{x:0,z:0});Object.assign(s.ball,{owner:0,x:config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null});
      if(!window.__ctrlTrace){window.__ctrlTrace={events:[],steps:[]};for(const type of ['pointerdown','pointermove','pointerup'])addEventListener(type,e=>window.__ctrlTrace.events.push({type,id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now()}),true);
        const orig=model.update.bind(model);model.update=(dt,input)=>{const r=orig(dt,input);const p=model.getState().players[0],shown=model.renderState().players[0];window.__ctrlTrace.steps.push({t:performance.now(),moveX:input?.moveX||0,x:p.x,shownX:shown.x,vx:p.vx});return r;};}
      window.__ctrlTrace.events.length=0;window.__ctrlTrace.steps.length=0;
    });
    const centre=async sel=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const cdp=await context.newCDPSession(page),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:6,radiusY:6,force:1}))});
    const shot=name=>page.screenshot({path:path.join(out,`${tag}-${name}.png`)});
    const boxes=async()=>Object.fromEntries(await Promise.all(['#joystick','#shoot','#pass','#sprint','#soccer-switch'].map(async s=>[s,await page.locator(s).boundingBox()])));
    await fixture();await page.clock.runFor(48);const idle=await boxes();await shot('idle');
    // Tilt latency: finger down at the stick centre, then a 52 px push (full tilt) at a known time.
    const start=await centre('#joystick');await touch('touchStart',[{id:1,...start}]);await page.clock.runFor(32);
    const t0=await page.evaluate(()=>performance.now());await touch('touchMove',[{id:1,x:start.x+52,y:start.y}]);
    for(let i=0;i<14;i++)await page.clock.runFor(16);
    const trace=await page.evaluate(()=>({steps:window.__ctrlTrace.steps,events:window.__ctrlTrace.events}));
    const move=trace.events.filter(e=>e.type==='pointermove').pop(),after=trace.steps.filter(s=>s.t>=(move?.t??t0));
    const base=after[0]?.x??0,delivered=move?.t??t0;
    const firstInput=after.find(s=>Math.abs(s.moveX)>0),firstModel=after.find(s=>Math.abs(s.x-base)>1e-6),firstShown=after.find(s=>Math.abs(s.shownX-base)>1e-4),shown5=after.find(s=>Math.abs(s.shownX-base)>.05);
    const lat=s=>s?Math.round((s.t-delivered)*10)/10:null;
    const tilt={pointerDeliveredAt:delivered,inputSampledMs:lat(firstInput),modelMovedMs:lat(firstModel),renderedMovedMs:lat(firstShown),rendered5cmMs:lat(shown5),speedByStep:after.slice(0,8).map(s=>Math.round(s.vx*100)/100)};
    await shot('tilt');const tiltBoxes=await boxes();
    // Release: the finger lifts, count frames to rest.
    const x0=(await page.evaluate(()=>window.__ctrlTrace.steps.at(-1))).x;await touch('touchEnd',[]);
    for(let i=0;i<30;i++)await page.clock.runFor(16);
    const tail=await page.evaluate(()=>window.__ctrlTrace.steps.slice(-40));const rest=tail.findIndex(s=>Math.abs(s.vx)<.3);
    // Multi-touch: stick + sprint + kick together.
    await fixture();await page.clock.runFor(32);
    const sprint=await centre('#sprint'),shoot=await centre('#shoot'),s2=await centre('#joystick');
    await touch('touchStart',[{id:1,...s2}]);await touch('touchMove',[{id:1,x:s2.x+44,y:s2.y}]);await touch('touchStart',[{id:1,x:s2.x+44,y:s2.y},{id:2,...sprint}]);await touch('touchStart',[{id:1,x:s2.x+44,y:s2.y},{id:2,...sprint},{id:3,...shoot}]);
    await page.clock.runFor(96);const multi=await page.evaluate(()=>{const s=window.__island.games.current.session.snapshot;return {charging:s.charging,sprintActive:s.sprint.active,vx:Math.round(s.players[0].vx*100)/100,held:s.controlsState?.held};});
    await shot('multitouch');await touch('touchEnd',[]);await page.clock.runFor(64);
    // Floating stick: a touch elsewhere in the left pad puts the stick under the thumb; release returns it home.
    let floating=null;
    {await fixture();await page.clock.runFor(32);const home=await page.locator('#joystick').boundingBox(),at={x:viewport.width>viewport.height?190:120,y:viewport.height>viewport.width?viewport.height-230:viewport.height-150};
      await touch('touchStart',[{id:1,...at}]);await page.clock.runFor(32);const under=await page.locator('#joystick').boundingBox();await touch('touchMove',[{id:1,x:at.x+40,y:at.y-10}]);await page.clock.runFor(64);
      const moving=await page.evaluate(()=>window.__island.games.current.session.snapshot.players[0].vx);await shot('floating');await touch('touchEnd',[]);await page.clock.runFor(64);const back=await page.locator('#joystick').boundingBox();
      floating={touch:at,stickCentre:{x:Math.round(under.x+under.width/2),y:Math.round(under.y+under.height/2)},followsThumb:Math.abs(under.x+under.width/2-at.x)<2&&Math.abs(under.y+under.height/2-at.y)<2,movedPlayer:moving>1,returnsHome:Math.abs(back.x-home.x)<1&&Math.abs(back.y-home.y)<1};}
    // Layout safety: pad vs buttons, stacking order, clamped floating centre, orientation swap, pause/resume.
    const rectOf=sel=>page.locator(sel).boundingBox();
    const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
    const safety={};
    {await fixture();await page.clock.runFor(32);const padBox=await rectOf('.soccer-stick-pad');
      safety.padVsButtons=(await Promise.all(['#shoot','#pass','#sprint','#soccer-switch','[data-action="game-pause"]'].map(async sel=>[sel,overlap(padBox,await rectOf(sel))]))).filter(x=>x[1]).map(x=>x[0]);
      safety.buttonsOnTop=await page.evaluate(()=>['#shoot','#pass','#sprint','#soccer-switch'].every(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(sel)!==null;}));
      // extreme touches at the pad's far corners: the stick stays inside the pad
      const corners=[[padBox.x+padBox.width-2,padBox.y+2],[padBox.x+padBox.width-2,padBox.y+padBox.height-2],[padBox.x+2,padBox.y+2]];safety.cornerStickInside=[];
      for(const [x,y] of corners){await touch('touchStart',[{id:1,x,y}]);await page.clock.runFor(32);const b=await rectOf('#joystick');safety.cornerStickInside.push(b.x>=padBox.x-.5&&b.x+b.width<=padBox.x+padBox.width+.5&&b.y>=padBox.y-.5&&b.y+b.height<=padBox.y+padBox.height+.5&&b.x+b.width<=viewport.width/2+.5+ (viewport.width>viewport.height?0:viewport.width));await touch('touchEnd',[]);await page.clock.runFor(32);}
      // a touch in the right half never moves the stick
      const before=await rectOf('#joystick');await touch('touchStart',[{id:2,x:viewport.width*.55,y:viewport.height*.3}]);await page.clock.runFor(32);const rightTouch=await rectOf('#joystick');await touch('touchEnd',[]);safety.rightTouchIgnored=Math.abs(rightTouch.x-before.x)<1&&Math.abs(rightTouch.y-before.y)<1;
      // pause and resume
      await page.evaluate(()=>window.__island.games.current.session.setPaused(true));await page.clock.runFor(32);await page.evaluate(()=>window.__island.games.current.session.setPaused(false));await page.clock.runFor(48);
      const afterPause=await rectOf('#joystick');safety.pauseResumeHome=Math.abs(afterPause.x-before.x)<1&&afterPause.x+afterPause.width<viewport.width/2+(viewport.width>viewport.height?0:viewport.width);
      // orientation swap in the middle of the game
      await touch('touchStart',[{id:3,x:padBox.x+60,y:padBox.y+padBox.height-60}]);await page.clock.runFor(32);
      try{await page.setViewportSize({width:viewport.height,height:viewport.width});await page.clock.runFor(200);await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.clock.runFor(200);
        const j=await rectOf('#joystick'),acts=await Promise.all(['#shoot','#pass','#sprint','#soccer-switch'].map(rectOf)),pb=await rectOf('.soccer-stick-pad');
        safety.afterRotation={viewport:`${viewport.height}x${viewport.width}`,stickLeftOfAll:acts.every(a=>j.x+j.width<a.x),padVsButtons:acts.some(a=>overlap(pb,a)),stickInLeftHalf:j.x+j.width<=viewport.height/2+(viewport.height>viewport.width?0:0)||j.x+j.width<Math.min(...acts.map(a=>a.x)),leftClass:await page.locator('.soccer-controls.left-handed').count()};await shot('rotated');
        await page.setViewportSize(viewport);await page.clock.runFor(200);}catch(e){safety.afterRotation={error:String(e)};}
      await touch('touchEnd',[]).catch(()=>{});}
    const metrics=await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics);
    report.push({viewport:tag,savedLeftIgnored:savedLeft,idleBoxes:idle,tiltBoxes,stickLeftOfActions:idle['#joystick'].x+idle['#joystick'].width<Math.min(idle['#shoot'].x,idle['#pass'].x,idle['#sprint'].x,idle['#soccer-switch'].x),stickInLeftHalf:idle['#joystick'].x+idle['#joystick'].width<=viewport.width/2,actionsInRightHalf:['#shoot','#pass','#sprint','#soccer-switch'].every(s=>idle[s].x>=viewport.width/2-1),leftHandedClass:await page.locator('.soccer-controls.left-handed').count(),floating,safety,tilt,framesToRestAfterRelease:rest,multi,triangles:metrics?.triangles,errors});
    await cdp.detach().catch(()=>{});await context.close();
  }
}finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,1));await browser.close();await server.close();}
console.log(JSON.stringify(report.map(r=>({v:r.viewport,stickLeft:r.stickLeftOfActions,leftHalf:r.stickInLeftHalf,actionsRight:r.actionsInRightHalf,leftClass:r.leftHandedClass,tilt:r.tilt,rest:r.framesToRestAfterRelease,multi:r.multi,safety:r.safety,errors:r.errors})),null,1));
