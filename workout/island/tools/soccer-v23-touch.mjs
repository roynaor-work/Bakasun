/** Soccer v23 real-touch harness (evidence only; never writes match state).
 * Chromium + swiftshader, 844x390, hasTouch + isMobile, the page clock stepped one 60 Hz frame at a time.
 * The island save is prepared the way a player would have it (avatar, a soccer building), the match is
 * entered through the menu, and a bot plays it with CDP touches only: the floating stick on the left pad and
 * the real action buttons. Every frame records the model, the rendered characters (pivot, yaw, clip, bone
 * pops), the input recognizer and the audio sources that started, for the measurements in the v23 report.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node tools/soccer-v23-touch.mjs <outDir>
 *        [--query=soccerSwitch=v22] [--seconds=120] [--scenario=play|switch|air] [--tag=name] [--shots] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../tests/shell-ready.mjs';

const FRAME_MS=16;

/** In-page recorder: observation only. Wraps drainEvents (returns the same events), the Web Audio start calls and fetch (to name the decoded buffers). */
function installProbe(){
  const P=window.__v23={audio:[],buttons:[],urls:new WeakMap(),buffers:new WeakMap(),events:[],prev:new Map(),wrapped:null};
  const fetch0=window.fetch;
  window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||String(input);return fetch0.call(this,input,init).then(res=>{const ab=res.arrayBuffer.bind(res);res.arrayBuffer=()=>ab().then(buf=>{P.urls.set(buf,url);return buf;});return res;});};
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    const decode=AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData=function(bytes,...rest){const url=P.urls.get(bytes);const out=decode.call(this,bytes,...rest);if(out&&out.then)out.then(buffer=>{if(url)P.buffers.set(buffer,url.replace(/^.*\/island\//,'').replace(/\?.*$/,''));});return out;};
    const startBuffer=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(when,...rest){P.audio.push({t:performance.now(),kind:'buffer',url:P.buffers.get(this.buffer)||'?',loop:this.loop,ctx:this.context.currentTime,when:when||0});return startBuffer.call(this,when,...rest);};
    const startOsc=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(when,...rest){P.audio.push({t:performance.now(),kind:'osc',type:this.type,hz:Math.round(this.frequency.value),ctx:this.context.currentTime,when:when||0});return startOsc.call(this,when,...rest);};
  }
  for(const type of ['pointerdown','pointerup','pointercancel'])addEventListener(type,e=>{const b=e.target.closest?.('button');P.buttons.push({t:performance.now(),ev:type,pid:e.pointerId,id:b?.id||(typeof e.target.className==='string'?e.target.className:'?'),type:e.pointerType,x:Math.round(e.clientX),y:Math.round(e.clientY)});},true);
}

/** One frame of evidence, read after the frame was rendered. */
function readFrame(){
  const P=window.__v23,session=window.__island.games.current?.session;if(!session)return null;
  const d=session.debug,model=d.model,view=d.view,s=model.getState();
  if(P.wrapped!==model){const drain=model.drainEvents.bind(model);model.drainEvents=()=>{const list=drain();for(const e of list)P.events.push({...e,at:performance.now(),elapsed:s.elapsed});return list;};P.wrapped=model;}
  const chars=view?.characters||[],players=[];
  for(const p of s.players){
    const c=chars[p.id],pv=c?.pivot,rec={id:p.id,team:p.team,role:p.role,x:+p.x.toFixed(3),z:+p.z.toFixed(3),vx:+p.vx.toFixed(3),vz:+p.vz.toFixed(3),fx:+p.fx.toFixed(3),fz:+p.fz.toFixed(3),slide:p.slideTime>0?1:0,rec:p.recover>0?+p.recover.toFixed(2):0,kick:p.kickTime>0?1:0,head:p.headerTime>0?1:0};
    if(pv){rec.rx=+pv.position.x.toFixed(3);rec.ry=+pv.position.y.toFixed(3);rec.rz=+pv.position.z.toFixed(3);rec.yaw=+(c.yaw??0).toFixed(3);rec.clip=c.motion?.state||c.active||null;rec.vis=pv.visible?1:0;
      // largest local bone rotation change since the previous frame (degrees), the "pop" of a clip
      let pop=0,worst='';const prev=P.prev.get(p.id)||new Map();
      c.root.traverse(o=>{if(!o.isBone)return;const q=o.quaternion,last=prev.get(o.name);if(last){const dot=Math.min(1,Math.abs(q.x*last[0]+q.y*last[1]+q.z*last[2]+q.w*last[3]));const a=2*Math.acos(dot)*180/Math.PI;if(a>pop){pop=a;worst=o.name;}}prev.set(o.name,[q.x,q.y,q.z,q.w]);});
      P.prev.set(p.id,prev);rec.pop=+pop.toFixed(1);rec.popBone=worst;
      if(p.id===s.ball.owner||p.id===s.restart?.player){let best=Infinity;const w={x:0,y:0,z:0};c.root.traverse(o=>{if(!o.isBone||!/(Foot|Toe)/.test(o.name))return;o.getWorldPosition?.(P.v||(P.v=new o.position.constructor()));const v=P.v;const dd=Math.hypot(v.x-s.ball.x,v.y-s.ball.y,v.z-s.ball.z);if(dd<best)best=dd;});rec.foot=+best.toFixed(3);}}
    players.push(rec);
  }
  const b=s.ball,cs=session.snapshot.controlsState,rm=view?.metrics?.();
  const ballRoot=view?.scene?.getObjectByName?.('soccer-ball-root');
  const audio=P.audio.splice(0),buttons=P.buttons.splice(0),events=P.events.splice(0);
  return {t:performance.now(),phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),score:[...s.score],restart:s.restart?{type:s.restart.type,team:s.restart.team,x:+s.restart.x.toFixed(2),z:+s.restart.z.toFixed(2),player:s.restart.player}:null,
    ball:{x:+b.x.toFixed(3),y:+b.y.toFixed(3),z:+b.z.toFixed(3),vx:+b.vx.toFixed(2),vz:+b.vz.toFixed(2),owner:b.owner,flight:b.flight?1:0,...(ballRoot?{rx:+ballRoot.position.x.toFixed(3),ry:+ballRoot.position.y.toFixed(3),rz:+ballRoot.position.z.toFixed(3)}:null)},charging:s.charging,charge:+s.charge.toFixed(2),chargeKind:s.chargeKind,sprint:s.sprint.active,
    input:cs?{state:cs.state,enabled:cs.enabled,mx:+cs.movement.x.toFixed(3),mz:+cs.movement.z.toFixed(3),stick:cs.stickMode,held:cs.held}:null,
    hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),quality:rm?.quality,players,audio,buttons,events,result:Boolean(model.result),
    air:{prompt:document.querySelector('#shoot')?.dataset.air||'',slot:document.querySelector('#soccer-switch')?.dataset.air||'',slotLabel:document.querySelector('#soccer-switch .soccer-action-label')?.textContent||'',armed:Boolean(s.headerArm)}};
}

export async function openSoccer({query='',viewport={width:844,height:390},deviceScaleFactor=1,stage=1}={}){
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:process.env.V23_MOBILE!=='0',deviceScaleFactor,serviceWorkers:'block'});
  await context.addInitScript(installProbe);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await page.clock.install();
  await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate((stageWanted)=>{
    const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת מגע',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
    if(!engine.state.buildings.some(b=>b.typeId==='soccer')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('soccer');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
    engine.setSoccerDifficulty('normal');if(engine.state.minigameProgress?.soccer)engine.state.minigameProgress.soccer.stage=Math.max(engine.state.minigameProgress.soccer.stage,stageWanted);engine.save();ui.closeModal();games.menu();
  },stage);
  await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator(`[data-stage="${stage}"]`).click();
  if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
  await waitForGameStart(page);await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.renderMetrics?.assetStatus==='ready'&&s.contractsStatus==='ready';},{},{timeout:180000});
  await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+5000));
  const cdp=await context.newCDPSession(page),fingers=new Map();
  const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers].map(([id,p])=>({id,x:p.x,y:p.y,radiusX:6,radiusY:6,force:1}))});
  const touch={
    async down(id,x,y){fingers.set(id,{x,y});await send('touchStart');},
    async move(id,x,y){if(!fingers.has(id))return touch.down(id,x,y);const f=fingers.get(id);if(Math.abs(f.x-x)<.5&&Math.abs(f.y-y)<.5)return;fingers.set(id,{x,y});await send('touchMove');},
    // CDP releases the points a touchEnd lists (measured: listing the fingers that stay lifted the stick instead of the button).
    async up(id){if(!fingers.has(id))return;const f=fingers.get(id);fingers.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,x:f.x,y:f.y,radiusX:6,radiusY:6,force:1}]});},
    held:id=>fingers.has(id),
  };
  const rect=sel=>page.locator(sel).boundingBox();
  const frame=async()=>{await page.clock.runFor(FRAME_MS);return page.evaluate(readFrame);};
  const close=async()=>{await cdp.detach().catch(()=>{});await context.close().catch(()=>{});await browser.close().catch(()=>{});await server.close().catch(()=>{});};
  return {server,browser,context,page,cdp,touch,rect,frame,errors,close,fingers,read:()=>page.evaluate(readFrame)};
}

/** Real-touch bot. Decides from what it reads (like a child looking at the screen), acts only through touches. */
export function createTouchBot({layout,rng=mulberry(7),switchEvery=0,airEvery=0,aimEvery=.25,aimTurnDeg=20,pitchHalf=34,pitchWide=21,outEvery=0}){
  const STICK=1,BUTTON=2;let anchor=null,lastAim=null,aimAge=99,buttonDown=null,buttonAge=0,nextPass=1.5,nextShot=0,since=0,nextSwitch=switchEvery,lastSwitchAt=-9,freeze=0;
  const padRect=layout.pad,cosTurn=Math.cos(aimTurnDeg*Math.PI/180);
  return {
    async step(f,touch,dt){
      since+=dt;aimAge+=dt;buttonAge+=dt;freeze=Math.max(0,freeze-dt);
      if(buttonDown){if(buttonAge>=buttonDown.hold){await touch.up(BUTTON);if(buttonDown.sel==='switch')freeze=.35;buttonDown=null;}return {pressed:null};}
      if(!f||f.hold||f.replaying||f.phase==='goal'||f.phase==='halftime'||f.phase==='finished'){if(touch.held(STICK))await touch.up(STICK);anchor=null;lastAim=null;return {pressed:null};}
      const me=f.players[f.controlled],b=f.ball,goalX=f.attackDir*pitchHalf,defending=f.mode==='defense';
      // the thumb re-aims a few times a second when the wanted direction clearly changed (never every frame);
      // right after a switch it stays where it was for 0.35 s, so the measured response is to a held stick
      if(aimAge>=aimEvery&&!freeze){
        let dx,dz;
        if(f.phase.startsWith('restart')){dx=0;dz=0;}
        else if(b.owner===f.controlled&&outEvery){const wide=Math.sign(me.z||1);dx=goalX-me.x;dz=wide*(pitchWide+2)-me.z;}
        else if(b.owner===f.controlled){dx=goalX-me.x;dz=(rng()-.5)*6-me.z*.4;}
        else{const lead=defending?.25:.1;dx=b.x+b.vx*lead-me.x;dz=b.z+b.vz*lead-me.z;}
        const len=Math.hypot(dx,dz);
        if(len<.3){if(touch.held(STICK)){await touch.up(STICK);anchor=null;lastAim=null;}aimAge=0;}
        else{
          const aim={x:dx/len,z:dz/len};
          if(!lastAim||!touch.held(STICK)||aim.x*lastAim.x+aim.z*lastAim.z<cosTurn){
            aimAge=0;
            if(!anchor||!touch.held(STICK)){anchor={x:padRect.x+padRect.width*.38,y:padRect.y+padRect.height*.62};await touch.down(STICK,anchor.x,anchor.y);}
            // screen: stick x = world x * attackDir, stick y = world z * attackDir
            const r=52;lastAim=aim;await touch.move(STICK,anchor.x+aim.x*f.attackDir*r,anchor.y+aim.z*f.attackDir*r);
          }
        }
      }
      const press=async(sel,hold)=>{const r=layout[sel];if(!r)return null;await touch.down(BUTTON,r.x+r.width/2+(rng()-.5)*8,r.y+r.height/2+(rng()-.5)*8);buttonDown={sel,hold};buttonAge=0;return sel;};
      if(f.phase==='restartReady'&&f.restart?.team===0&&since>.8){since=0;return {pressed:await press('pass',.08)};}
      if(f.phase!=='playing')return {pressed:null};
      const dist=Math.hypot(b.x-me.x,b.z-me.z);
      // air scenario: the lob button with the ball in the attacking half, the header button whenever it pulses
      if(airEvery&&f.air?.prompt==='header'&&!f.air.armed&&since>.25){since=0;return {pressed:await press('shoot',.08),air:'header'};}
      if(airEvery&&f.air?.slot==='lob'&&b.owner===f.controlled&&me.x*f.attackDir>-4&&since>.9&&rng()<airEvery){since=0;return {pressed:await press('switch',.08),air:'lob'};}
      if(switchEvery&&defending&&touch.held(STICK)&&f.elapsed-lastSwitchAt>=nextSwitch&&dist>4){lastSwitchAt=f.elapsed;nextSwitch=switchEvery*(.8+rng()*.4);return {pressed:await press('switch',.09+rng()*.05),aim:lastAim};}
      if(defending&&dist<1.6&&since>.5){since=0;return {pressed:await press(rng()<.75?'pass':'shoot',.07)};}
      // set pieces: with the ball near a line, a hard kick puts it out (throw-in, goal kick or corner for the other side)
      if(outEvery&&b.owner===f.controlled&&(Math.abs(me.z)>pitchWide-5||Math.abs(goalX-me.x)<9)&&since>.6){since=0;return {pressed:await press('shoot',.35)};}
      if(b.owner===f.controlled){
        const toGoal=Math.abs(goalX-me.x);
        if(toGoal<16&&since>nextShot){since=0;nextShot=1.2+rng();return {pressed:await press('shoot',.18+rng()*.3)};}
        if(since>nextPass){since=0;nextPass=1.6+rng()*2;const lofted=airEvery&&rng()<airEvery;return {pressed:await press('pass',lofted?.55:.09),lofted};}
      }
      return {pressed:null};
    },
    get anchor(){return anchor;},get aim(){return lastAim;}
  };
}
export function mulberry(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

export async function controlLayout(h){
  const [pad,stick,shoot,pass,sprint,swap]=await Promise.all(['.soccer-stick-pad','#joystick','#shoot','#pass','#sprint','#soccer-switch'].map(h.rect));
  return {pad,stick,shoot,pass,sprint,switch:swap};
}

async function main(){
  const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'soccer-v23-out');
  const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
  const seconds=Number(opt('seconds',60)),query=opt('query',''),scenario=opt('scenario','play'),tag=opt('tag',scenario+(query?'-'+query.replace(/[^a-z0-9]+/gi,'_'):''));
  const stage=Number(opt('stage',1)),dsf=Number(opt('dsf',1)),shots=new Set((opt('shots','')||'').split(',').filter(Boolean)),taken={};
  await mkdir(out,{recursive:true});
  const h=await openSoccer({query,stage,deviceScaleFactor:dsf});const frames=[];const t0=Date.now();
  /** Screenshot triggers (each once): the moment a viewer checks the pitch, a set piece, a high ball or a header. */
  const trigger=f=>{
    if(!f||f.hold||f.replaying)return null;const b=f.ball,me=f.players[f.controlled],hx=34;
    if(shots.has('kickoff')&&!taken.kickoff&&f.phase==='playing'&&f.elapsed>.2&&f.elapsed<1.5)return 'kickoff';
    if(shots.has('box')&&!taken.box&&f.phase==='playing'&&b.owner===f.controlled&&b.x*f.attackDir>hx-14&&Math.abs(b.z)<9)return 'box';
    for(const type of ['goalKick','corner','throwIn','freeKick','penalty'])if(shots.has(type)&&!taken[type]&&f.phase==='restartReady'&&f.restart?.type===type)return type;
    for(const e of f.events||[])for(const type of ['loft','header','clearance'])if(shots.has(type)&&!taken[type]&&e.type===type&&e.team===0)return type;
    if(shots.has('prompt')&&!taken.prompt&&f.air?.prompt==='header')return 'prompt';
    if(shots.has('lobslot')&&!taken.lobslot&&f.air?.slot==='lob')return 'lobslot';
    return null;
  };
  try{
    let layout=await controlLayout(h);
    const bot=createTouchBot({layout,switchEvery:scenario==='switch'?2.2:scenario==='play'?6:0,airEvery:scenario==='air'?.5:0,outEvery:scenario==='setpieces'?1:0});
    for(let i=0;i<seconds*62.5;i++){
      const f=await h.frame();if(!f)break;f.fingers=[...h.fingers.keys()];frames.push(f);
      const shot=trigger(f);if(shot){taken[shot]=f.elapsed;try{await h.page.screenshot({path:path.join(out,`${tag}-${shot}.png`),timeout:90000});}catch(e){process.stderr.write(`${tag} screenshot ${shot} failed: ${e.message}\n`);}f.shot=shot;process.stderr.write(`${tag} shot ${shot} at ${f.elapsed}\n`);if(shots.size&&[...shots].every(k=>taken[k]!==undefined))break;}
      if(i%120===0)layout=await controlLayout(h);
      const act=await bot.step(f,h.touch,FRAME_MS/1000);if(act?.pressed)f.bot=act;
      if(f.result)break;
      if(i%600===0)process.stderr.write(`${tag} frame ${i} t=${((Date.now()-t0)/1000).toFixed(0)}s elapsed=${f.elapsed} score=${f.score}\n`);
    }
  }finally{
    await writeFile(path.join(out,`${tag}.json`),JSON.stringify({query,scenario,stage,shots:taken,frames,errors:h.errors}));
    await h.close();
  }
  console.log(JSON.stringify({tag,frames:frames.length,errors:h.errors.slice(0,5),wall:(Date.now()-t0)/1000}));
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
