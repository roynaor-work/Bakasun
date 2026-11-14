/** Basketball v24.1 real-touch proof (evidence only; never writes match state). The soccer v23/v24 rig on the basketball court:
 * Chromium + SwiftShader, 844x390, hasTouch + isMobile, the island save prepared the way a player has it (avatar, a basketball court),
 * the match entered through the menu (game-enter, play, the club card's play button), and a bot that plays only through CDP touches (the
 * floating stick on the left, the real action buttons on the right). The page clock is stepped one 60 Hz frame at a time, so a slow machine
 * plays the same match as a phone. Recorded per frame: the engine events (drainEvents is wrapped, the list is returned unchanged), the audio
 * buffers that started (URL of the decoded file), the renderer's triangles / draw calls, the crowd's level of detail, each player's clip and
 * the largest bone rotation step between frames ("pops"), and the soles' height over the floor for the players on the ground.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/hoops-v241-touch.mjs <outDir>
 *        [--query=hoopsV241=0] [--tag=before] [--seconds=60] [--shots=steal,crowd,basket,close,final] [--viewport=844x390]
 * The summary is <outDir>/<tag>.json (written every 600 frames too), screenshots <outDir>/<tag>-<name>.png. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../tests/shell-ready.mjs';

const FRAME_MS=16;

/** In-page recorder (installed before the page scripts): fetch and decodeAudioData are wrapped to name each decoded buffer by its file, and
 * every AudioBufferSourceNode / OscillatorNode start is logged. Observation only: the calls go through unchanged. */
function installProbe(){
  const P=window.__h241={audio:[],urls:new WeakMap(),buffers:new WeakMap(),events:[],wrapped:null,prev:new Map()};
  const fetch0=window.fetch;
  window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||String(input);return fetch0.call(this,input,init).then(res=>{const ab=res.arrayBuffer.bind(res);res.arrayBuffer=()=>ab().then(buf=>{P.urls.set(buf,url);return buf;});return res;});};
  const slice=ArrayBuffer.prototype.slice;ArrayBuffer.prototype.slice=function(...a){const out=slice.apply(this,a);const u=P.urls.get(this);if(u)P.urls.set(out,u);return out;};
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    const decode=AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData=function(bytes,...rest){const url=P.urls.get(bytes);const out=decode.call(this,bytes,...rest);if(out&&out.then)out.then(buffer=>{if(url)P.buffers.set(buffer,url.replace(/^.*\/island\//,'').replace(/\?.*$/,''));}).catch(()=>{});return out;};
    const startBuffer=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(when,...rest){P.audio.push({t:performance.now(),kind:'buffer',url:P.buffers.get(this.buffer)||'?',loop:this.loop,ctx:+this.context.currentTime.toFixed(3),when:+(when||0).toFixed(3)});return startBuffer.call(this,when,...rest);};
    const startOsc=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(when,...rest){P.audio.push({t:performance.now(),kind:'osc',type:this.type,hz:Math.round(this.frequency.value)});return startOsc.call(this,when,...rest);};
  }
}

/** One frame of evidence, read after the frame was rendered. `deep` adds the per-player motion records (pops, soles). */
function readFrame(deep){
  const P=window.__h241,session=window.__island.games.current?.session;if(!session?.debug)return null;
  const d=session.debug,engine=d.engine,view=d.view;
  if(P.wrapped!==engine){const drain=engine.drainEvents.bind(engine);engine.drainEvents=()=>{const list=drain();for(const e of list)P.events.push({...e});return list;};P.wrapped=engine;}
  const s=session.snapshot,m=s.renderMetrics||{},screen=document.querySelector('.game-screen[data-game=streetSlam]');
  const players=[];
  if(deep&&view){
    const V=P.V||(P.V={});
    for(const p of s.players){
      const av=view.avatars.get(p.id);if(!av||!av.root.visible)continue;
      const rec={id:p.id,team:p.team,ctrl:p.controlled?1:0,ball:p.hasBall?1:0,act:p.act,air:p.air?1:0,speed:+Math.hypot(p.vx,p.vz).toFixed(2),clip:av.motionState||null,lod:av.lod??0};
      // largest local bone rotation change since the previous frame (degrees): a clip "pop" (the soccer v23 measure)
      let pop=0,worst='';const prev=P.prev.get(p.id)||new Map();
      av.root.traverse(o=>{if(!o.isBone)return;const q=o.quaternion,last=prev.get(o.name);if(last){const dot=Math.min(1,Math.abs(q.x*last[0]+q.y*last[1]+q.z*last[2]+q.w*last[3]));const a=2*Math.acos(dot)*180/Math.PI;if(a>pop){pop=a;worst=o.name;}}prev.set(o.name,[q.x,q.y,q.z,q.w]);});
      P.prev.set(p.id,prev);rec.pop=+pop.toFixed(1);rec.popBone=worst;
      // soles: the lowest skinned sole vertex in the world (CPU skinning of the bottom 2% of the bind pose; the floor top is y = 0.008)
      let mesh=null;av.root.traverse(o=>{if(!mesh&&o.isSkinnedMesh&&o.visible&&!o.userData?.v22Hair)mesh=o;});
      if(mesh){
        const pos=mesh.geometry.attributes.position;P.soleIdx=P.soleIdx||new WeakMap();let idx=P.soleIdx.get(pos);
        if(!idx){let lo=Infinity,hi=-Infinity;for(let i=0;i<pos.count;i++){const y=pos.getY(i);if(y<lo)lo=y;if(y>hi)hi=y;}const cut=lo+(hi-lo)*.02;idx=[];for(let i=0;i<pos.count;i++)if(pos.getY(i)<=cut)idx.push(i);P.soleIdx.set(pos,idx);}
        V.v=V.v||new mesh.position.constructor();let low=Infinity;
        for(const i of idx){mesh.getVertexPosition(i,V.v);V.v.applyMatrix4(mesh.matrixWorld);if(V.v.y<low)low=V.v.y;}
        rec.foot=Number.isFinite(low)?+low.toFixed(3):null;
      }else rec.foot=null;
      rec.rootY=+av.root.position.y.toFixed(3);
      players.push(rec);
    }
  }
  // --seatvis: which of the v8 hall's seats the game camera shows this frame (NDC inside the screen, in front of the camera)
  if(P.seats&&view?.camera){
    const cam=view.camera;cam.updateMatrixWorld();const v=P.sv||(P.sv=new cam.position.constructor());P.seatFrames=(P.seatFrames||0)+1;
    P.seats.forEach((s,i)=>{v.set(s.x,s.y+.7,s.z).project(cam);if(v.z<1&&v.z>-1&&Math.abs(v.x)<=1.05&&Math.abs(v.y)<=1.05)P.seatSeen[i]++;});
  }
  const audio=P.audio.splice(0),events=P.events.splice(0);
  return {t:performance.now(),phase:s.phase,clock:+(+s.clock).toFixed(2),quarter:s.quarter,score:[...s.score],possession:s.possession,controlled:s.controlled,userTeam:s.userTeam??0,replaying:!!s.replaying,
    mode:screen?.querySelector('.hoops-controls')?.dataset.hoopsMode||screen?.querySelector('[data-hoops-mode]')?.dataset.hoopsMode||null,
    ball:{x:+s.ball.x.toFixed(2),y:+s.ball.y.toFixed(2),z:+s.ball.z.toFixed(2),state:s.ball.state},
    me:(()=>{const p=s.players.find(q=>q.id===s.controlled);return p?{id:p.id,x:p.x,z:p.z,hasBall:p.hasBall,act:p.act,shotHeld:p.shotHeld,team:p.team}:null;})(),
    handler:(()=>{const p=s.players.find(q=>q.hasBall);return p?{id:p.id,x:p.x,z:p.z,team:p.team}:null;})(),
    dir:s.dir,render:{calls:m.calls,triangles:m.triangles,frameMs:m.frameMs,quality:m.quality,crowd:m.crowd,crowd3d:m.crowd3d,crowdLevel:m.crowdLevel,v241:m.v241||null,bodyV2:m.bodyV2??null,motionSource:m.motionSource},
    audio,events,players};
}

export async function openHoops({query='',viewport={width:844,height:390},deviceScaleFactor=1}={}){
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor,serviceWorkers:'block'});
  await context.addInitScript(installProbe);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  page.setDefaultTimeout(240000);
  await page.clock.install();
  await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{
    const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת מגע',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
    if(!engine.state.buildings.some(b=>b.typeId==='basketball')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('basketball');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
    engine.save();ui.closeModal();games.menu();
  });
  await page.locator('[data-action="game-enter"][data-game-id="streetSlam"]').click();
  await page.locator('[data-action="game-play"]').click();
  await page.locator('[data-action="hoops-play-next"]').click();
  if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
  await waitForGameStart(page);
  // the view loads on real timers (fetch, decoders); the paused-in-the-future page clock lets them run until the first frame is drawn
  for(let i=0;i<600;i++){
    const ok=await page.evaluate(()=>{const s=window.__island.games.current?.session?.snapshot;return s?.error?'error:'+s.error:(s?.renderMetrics?.calls>0&&s.renderMetrics.players===10)?'ready':null;});
    if(ok==='ready')break;if(ok?.startsWith('error'))throw Error(ok);
    await page.clock.runFor(100);await page.waitForTimeout(150);
  }
  await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+2000));
  const cdp=await context.newCDPSession(page),fingers=new Map();
  const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers].map(([id,p])=>({id,x:p.x,y:p.y,radiusX:6,radiusY:6,force:1}))});
  const touch={
    async down(id,x,y){fingers.set(id,{x,y});await send('touchStart');},
    async move(id,x,y){if(!fingers.has(id))return touch.down(id,x,y);const f=fingers.get(id);if(Math.abs(f.x-x)<.5&&Math.abs(f.y-y)<.5)return;fingers.set(id,{x,y});await send('touchMove');},
    async up(id){if(!fingers.has(id))return;const f=fingers.get(id);fingers.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,x:f.x,y:f.y,radiusX:6,radiusY:6,force:1}]});},
    held:id=>fingers.has(id),
  };
  const frame=async(deep=false)=>{await page.clock.runFor(FRAME_MS);return page.evaluate(readFrame,deep);};
  const close=async()=>{await cdp.detach().catch(()=>{});await context.close().catch(()=>{});await browser.close().catch(()=>{});await server.close().catch(()=>{});};
  return {server,browser,context,page,cdp,touch,frame,errors,close,fingers};
}

/** Screen rectangles of the stick zone and the visible action buttons. */
export async function hoopsLayout(h){
  return h.page.evaluate(()=>{
    const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
    const s=document.querySelector('.game-screen[data-game=streetSlam]'),zone=s.querySelector('.hoops-stick-zone'),out={zone:zone?r(zone):null,buttons:{}};
    for(const b of s.querySelectorAll('[data-hoops-control]'))if(!b.closest('[hidden]')&&b.getClientRects().length)out.buttons[b.dataset.hoopsControl]=r(b);
    return out;
  });
}
/** Screen point of a world position (the view's own projection). */
const project=(h,x,y,z)=>h.page.evaluate(([x,y,z])=>window.__island.games.current.session.debug.view.project(x,y,z),[x,y,z]);

function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/** Real-touch bot: reads the frame like a child looking at the screen (who has the ball, where the basket is), acts only through touches.
 * Defence: run at the handler and tap steal when close (steals are the v24.1 whistle). Attack: drive at the basket, shoot near it (hold and
 * release), pass now and then. Inbounds and free throws: the pass / shoot button. */
export function createHoopsBot({rng=mulberry(11),stealRange=1.6}={}){
  const STICK=1,BUTTON=2;let anchor=null,lastAim=null,aimAge=99,buttonDown=null,buttonAge=0,since=0,layout=null,nextPass=2,shotHold=.55;
  return {
    async step(h,f,dt){
      since+=dt;aimAge+=dt;buttonAge+=dt;
      if(!layout||Math.random()<.01)layout=await hoopsLayout(h);
      if(buttonDown){if(buttonAge>=buttonDown.hold){await h.touch.up(BUTTON);buttonDown=null;}return null;}
      if(!f||f.replaying||f.phase==='final'||!f.me){if(h.touch.held(STICK))await h.touch.up(STICK);anchor=null;lastAim=null;return null;}
      const press=async(key,hold)=>{const r=layout.buttons[key];if(!r)return null;await h.touch.down(BUTTON,r.x+r.width/2+(rng()-.5)*6,r.y+r.height/2+(rng()-.5)*6);buttonDown={key,hold};buttonAge=0;return key;};
      if(f.phase==='inbound'||f.phase==='freethrow'){
        if(h.touch.held(STICK)){await h.touch.up(STICK);anchor=null;}
        if(f.me.hasBall&&since>.9){since=0;return press(f.phase==='freethrow'?'shoot':'pass',f.phase==='freethrow'?shotHold:.08);}
        return null;
      }
      if(f.phase!=='live')return null;
      const team=f.me.team,attack=f.dir?.[team]??1,rimX=attack*12.8;
      let tx,tz;
      const defending=f.handler&&f.handler.team!==team;
      if(f.me.hasBall){tx=rimX-attack*(1.2+rng()*.5);tz=(rng()-.5)*2;}
      else if(defending){tx=f.handler.x;tz=f.handler.z;}
      else if(f.ball.state==='loose'||!f.handler){tx=f.ball.x;tz=f.ball.z;}
      else{tx=rimX-attack*5;tz=f.me.z>0?3.5:-3.5;}
      const dist=Math.hypot(tx-f.me.x,tz-f.me.z);
      // the thumb re-aims a few times a second: the screen direction from the player to the target (the camera decides what is "up")
      if(aimAge>=.2&&layout.zone){
        aimAge=0;
        if(dist<.5){if(h.touch.held(STICK)){await h.touch.up(STICK);anchor=null;lastAim=null;}}
        else{
          const a=await project(h,f.me.x,0,f.me.z),b=await project(h,tx,0,tz),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,aim={x:dx/len,y:dy/len};
          if(!anchor||!h.touch.held(STICK)){anchor={x:layout.zone.x+Math.min(layout.zone.width*.45,120),y:layout.zone.y+layout.zone.height*.6};await h.touch.down(STICK,anchor.x,anchor.y);}
          if(!lastAim||aim.x*lastAim.x+aim.y*lastAim.y<.94){lastAim=aim;await h.touch.move(STICK,anchor.x+aim.x*48,anchor.y+aim.y*48);}
        }
      }
      if(defending&&Math.hypot(f.handler.x-f.me.x,f.handler.z-f.me.z)<stealRange&&since>.45){since=0;return press('steal',.07);}
      if(f.me.hasBall){
        const toRim=Math.hypot(rimX-f.me.x,f.me.z);
        if(toRim<3.2&&since>.6){since=0;return press('shoot',shotHold);}
        if(since>nextPass&&rng()<.3){since=0;nextPass=2+rng()*2.5;return press('pass',.08);}
      }
      return null;
    }
  };
}

async function main(){
  const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'hoops-v241-out');
  const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
  const query=opt('query',''),tag=opt('tag','after'),seconds=Number(opt('seconds',60)),deepEvery=Number(opt('deep',3));
  const [vw,vh]=opt('viewport','844x390').split('x').map(Number);
  const wanted=new Set(opt('shots','steal,crowd,basket,final').split(',').filter(Boolean)),taken={};
  await mkdir(out,{recursive:true});
  const h=await openHoops({query,viewport:{width:vw,height:vh}}),t0=Date.now();
  const events={},audio=[],steals=[],pops=[],soles=[],clipCounts={},samples=[];let frames=0,last=null,pendingShot=null;
  const summarize=()=>({tag,query,frames,gameSeconds:+(frames*FRAME_MS/1000).toFixed(1),wallSeconds:+((Date.now()-t0)/1000).toFixed(0),last:last&&{phase:last.phase,score:last.score,quarter:last.quarter,clock:last.clock},
    events,steals,audioByUrl:audio.reduce((o,a)=>{if(a.kind==='buffer')o[a.url]=(o[a.url]||0)+1;else o['osc:'+a.type]=(o['osc:'+a.type]||0)+1;return o;},{}),audio,
    clips:clipCounts,pops:{samples:pops.length,over30:pops.filter(p=>p.pop>30).length,over45:pops.filter(p=>p.pop>45).length,worst:[...pops].sort((a,b)=>b.pop-a.pop).slice(0,12),byClip:byClip(pops,list=>({samples:list.length,over30:list.filter(p=>p.pop>30).length,over45:list.filter(p=>p.pop>45).length}))},
    soles:summarizeSoles(soles),solesByClip:byClip(soles,summarizeSoles),render:samples,shots:taken,errors:h.errors.slice(0,20)});
  const shot=async name=>{if(!wanted.has(name)||taken[name]!==undefined)return;taken[name]=frames;const file=path.join(out,`${tag}-${name}.png`);
    try{await h.page.screenshot({path:file,timeout:120000});}catch(e){process.stderr.write(`shot ${name} failed: ${e.message.split('\n')[0]}\n`);}};
  let seatvis=null;
  if(args.includes('--seatvis')){
    const {seatingLayout}=await import('../minigames/hoops-v8-venue.mjs');
    const seats=seatingLayout(0).map(s=>({x:s.x,y:s.y,z:s.z,tier:s.tier,row:s.row,angle:s.angle}));
    await h.page.evaluate(seats=>{window.__h241.seats=seats;window.__h241.seatSeen=new Array(seats.length).fill(0);},seats);
    seatvis=async()=>{const r=await h.page.evaluate(()=>({seen:window.__h241.seatSeen,frames:window.__h241.seatFrames||0}));
      const group=s=>`t${s.tier} ${Math.abs(s.angle)<.01?'near':Math.abs(Math.abs(s.angle)-Math.PI)<.01?'far':Math.abs(Math.abs(s.angle)-Math.PI/2)<.01?'end':'corner'}`,by={};
      seats.forEach((s,i)=>{const g=group(s),e=by[g]||(by[g]={seats:0,seenFrames:0,everSeen:0});e.seats++;e.seenFrames+=r.seen[i];if(r.seen[i])e.everSeen++;});
      for(const e of Object.values(by))e.meanVisible=+(e.seenFrames/Math.max(1,e.seats*r.frames)).toFixed(3);
      return {frames:r.frames,groups:by,perSeat:r.seen};};
  }
  try{
    const bot=createHoopsBot();const limit=Math.round(seconds*1000/FRAME_MS);
    for(let i=0;i<limit;i++){
      const deep=i%deepEvery===0;const f=await h.frame(deep);if(!f)break;frames++;last=f;
      for(const e of f.events){events[e.type]=(events[e.type]||0)+1;if(e.type==='steal'||e.type==='interception')steals.push({frame:i,type:e.type,playerId:e.playerId,fromId:e.fromId,clock:f.clock,audio:[]});}
      for(const a of f.audio){audio.push({frame:i,...a});if(a.kind==='buffer'&&/whistle/.test(a.url))for(const s of steals)if(i-s.frame<=3)s.audio.push(a.url);}
      for(const p of f.players){
        if(p.pop!=null&&i>2)pops.push({frame:i,id:p.id,pop:p.pop,bone:p.popBone,clip:p.clip,act:p.act,speed:p.speed});
        if(p.foot!=null&&!p.air&&!/shot|dunk|layup|jump|block|rebound|celebrate/.test(p.clip||'')&&p.act==null)soles.push({foot:p.foot,clip:p.clip,speed:p.speed,id:p.id});
        if(p.clip)clipCounts[p.clip.replace(/^dribble:/,'')]=(clipCounts[p.clip.replace(/^dribble:/,'')]||0)+1;
      }
      if(i%120===0)samples.push({frame:i,phase:f.phase,...f.render});
      if(f.events.some(e=>e.type==='steal'||e.type==='interception'))pendingShot=pendingShot||{name:'steal',at:i+6};
      if(f.events.some(e=>e.type==='score'))pendingShot=pendingShot||{name:'basket',at:i+30};
      if(pendingShot&&i>=pendingShot.at){await shot(pendingShot.name);pendingShot=null;}
      if(i===Math.round(limit*.35)&&f.phase==='live')await shot('crowd');
      const act=await bot.step(h,f,FRAME_MS/1000);if(act)f.bot=act;
      if(i%600===599){await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summarize(),null,1));process.stderr.write(`${tag} frame ${i} wall=${((Date.now()-t0)/1000).toFixed(0)}s score=${f.score} phase=${f.phase} steals=${steals.length}\n`);}
      if(f.phase==='final'){await shot('final');break;}
    }
  }finally{
    const summary=summarize();if(seatvis)summary.seatvis=await seatvis().catch(e=>({error:e.message}));
    await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summary,null,1));await h.close();
    console.log(JSON.stringify({tag,frames:summary.frames,gameSeconds:summary.gameSeconds,wall:summary.wallSeconds,events:summary.events,steals:summary.steals.length,whistlesOnSteal:summary.steals.filter(s=>s.audio.length).length,pops:summary.pops.over30,errors:summary.errors.slice(0,3)}));
  }
}
/** Group records by their clip (the 'dribble:' prefix dropped) and summarise each group with `fn`; groups under 30 samples are left out. */
function byClip(list,fn){const g={};for(const r of list){const k=(r.clip||'?').replace(/^dribble:/,'');(g[k]||(g[k]=[])).push(r);}return Object.fromEntries(Object.entries(g).filter(([,v])=>v.length>=30).sort((a,b)=>b[1].length-a[1].length).map(([k,v])=>[k,fn(v)]));}
/** Sole heights of grounded players without a jump clip: the floor top is 0.008 m. */
export function summarizeSoles(list){
  if(!list.length)return null;const v=list.map(s=>s.foot).sort((a,b)=>a-b),q=k=>+v[Math.min(v.length-1,Math.floor(k*v.length))].toFixed(3);
  return {samples:v.length,min:v[0],p05:q(.05),p50:q(.5),p95:q(.95),max:v.at(-1),below0:list.filter(s=>s.foot<-.01).length,above8cm:list.filter(s=>s.foot>.08).length};
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
