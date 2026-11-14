// racing-v24 browser proof (Roy after v23 on the phone). A real league race in Chromium/SwiftShader with REAL touch (CDP Input.dispatchTouchEvent: a finger on the gas,
// a finger on the left half that drags the floating wheel, a finger on the brake or the pit button), phone viewport 844x390, hasTouch + isMobile. The race state is
// only READ: an in-page pilot reads the model (where the road goes, how fast the car is) and the test turns that into finger moves, exactly as a child's thumbs would.
// Every model event and every Web Audio one-shot / loop level is logged with the race time, so "what played after the corner" is evidence, not a guess.
// Scenarios (RV24_SCENARIO):
//  turbo    drive the first corners braking with the brake button: drift boosts, boost time, blow-off / back-fire / gear sounds right after each corner
//  recover  full lock off the start straight: the flip and the way back to the road (frames every 100 ms)
//  offslow  roll slowly off the road onto the grass, then try to drive back with the gas and the wheel; then leave it there (auto return)
//  corner   full lock at speed without the brake: how much speed the turn itself takes (automatic slow-down), then the brake alone
//  brake    hard braking on the straight: which brake sound layers are audible
//  bump     steer into the car alongside at the start: contact, ricochet and slow-down
//  pit      tap the pit button, the car drives into the pit lane, stops, a tap changes the tyres, out again; the computer drivers pit too (whole race)
//  grid     the grid and the pack from behind: how the rivals look (formula or toy), draw calls and triangles
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js RV24_SCENARIO=turbo RV24_PART=racing-v24-fixes/turbo-after \
//        [RV24_QUERY='racingTurbo=v23'] [RV24_FPS=30] node workout/island/tests/racing-v24-touch-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
const scenario=process.env.RV24_SCENARIO||'turbo',part=process.env.RV24_PART||'racing-v24-fixes/'+scenario,extra=process.env.RV24_QUERY||'',FPS=Number(process.env.RV24_FPS)||30;
const dir=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(dir+'frames/',{recursive:true});
const FRAME=Math.round(1000/FPS);

/** In-page audio log, installed before the race session creates its AudioContext: one-shots (buffer sources without loop, oscillators) with the race time,
 * and the level of every looping layer whenever the game moves it (setTargetAtTime on the gain that the loop feeds). URLs come from the fetch that decoded them. */
function audioLog(){
 if(window.__rv24audio)return;const L=window.__rv24audio={shots:[],levels:[],osc:[],last:new Map()};const now=()=>window.__rv24t?.()??-1;
 const fp=ab=>{const u=new Uint8Array(ab);let h=u.length>>>0;const step=Math.max(1,Math.floor(u.length/97));for(let i=0;i<u.length;i+=step)h=(Math.imul(h,31)+u[i])>>>0;return u.length+':'+h;};
 const byFp=new Map(),byBuffer=new WeakMap(),tag=new WeakMap(),owner=new WeakMap();const short=url=>{try{return new URL(url,location.href).pathname.replace(/^.*\/assets\//,'');}catch{return String(url);}};
 const fetch0=window.fetch;window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||String(input);return fetch0.call(this,input,init).then(res=>{const ab=res.arrayBuffer.bind(res);res.arrayBuffer=()=>ab().then(buf=>{try{byFp.set(fp(buf),short(url));}catch{}return buf;});return res;});};
 // the game connects a loop to its gain before it starts it, so the source is tagged here from its buffer (the start wrapper tags it again)
 const connect0=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...a){let t=tag.get(this);if(!t&&this instanceof AudioBufferSourceNode&&this.buffer){t={url:byBuffer.get(this.buffer)||`generated:${this.buffer.length}`,loop:this.loop};tag.set(this,t);}if(t&&dest instanceof AudioNode&&!tag.get(dest))tag.set(dest,t);return connect0.call(this,dest,...a);};
 const st0=AudioParam.prototype.setTargetAtTime;AudioParam.prototype.setTargetAtTime=function(v,...a){const g=owner.get(this);if(g){const t=tag.get(g);if(t&&t.loop){const k=t.url,prev=L.last.get(k)??0;if((v>.0005)!==(prev>.0005)||Math.abs(v-prev)>Math.max(.002,prev*.25)){L.last.set(k,v);L.levels.push({t:+now().toFixed(3),url:k,v:+v.toFixed(4)});}}}return st0.call(this,v,...a);};
 const wrap=C=>{if(!C)return C;const W=function(...a){const ctx=new C(...a);
   const dec=ctx.decodeAudioData.bind(ctx);ctx.decodeAudioData=function(buf,ok,err){let url=null;try{url=byFp.get(fp(buf))||null;}catch{}const p=dec(buf).then(b=>{byBuffer.set(b,url||'untagged');return b;});if(ok)p.then(ok,err);return p;};
   const src=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const n=src(),start=n.start.bind(n);n.start=(...a)=>{const url=n.buffer?byBuffer.get(n.buffer)||`generated:${n.buffer.length}`:null;tag.set(n,{url,loop:n.loop});if(!n.loop)L.shots.push({t:+now().toFixed(3),url,rate:+n.playbackRate.value.toFixed(2)});return start(...a);};return n;};
   const osc=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{const n=osc(),start=n.start.bind(n);n.start=(...a)=>{if(n.type==='sine')L.osc.push({t:+now().toFixed(3),type:n.type,f:+n.frequency.value.toFixed(1)});return start(...a);};return n;};
   const gain=ctx.createGain.bind(ctx);ctx.createGain=()=>{const g=gain();owner.set(g.gain,g);return g;};
   window.__rv24ctx=ctx;return ctx;};W.prototype=C.prototype;Object.setPrototypeOf(W,C);return W;};
 window.AudioContext=wrap(window.AudioContext);if(window.webkitAudioContext)window.webkitAudioContext=window.AudioContext;
}

await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,assert,ready,nav})=>{
 const report={scenario,query:extra,fps:FPS,frames:[],events:[],samples:[]};const t0=Date.now();
 await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+(q?'&'+q:''));},extra);
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;try{localStorage.setItem('island.sound','on');}catch{}});
 await page.evaluate(audioLog);
 await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForFunction(()=>document.querySelector('[data-action=racing-league-go]'));
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
 await ready();await tick(100);await nav();
 if(await page.locator('[data-action=racing-intro-go]').count()){await page.locator('[data-action=racing-intro-go]').tap();await tick(32);}
 // frames at a steady FPS of the fake clock (a slow phone): the race model steps fixed 1/60 s, so the race is the same; only the input is sampled less often
 await page.evaluate(ms=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),ms);window.__rv24raf=raf;},FRAME);
 // read-only logs: every event of every model step, the race time for the audio log, and the in-page pilot (reads the model, writes nothing)
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;window.__rv24t=()=>m.state.time;window.__log=[];const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)if(e.type!=='overtake')window.__log.push({t:+m.state.time.toFixed(3),type:e.type,car:e.car,reason:e.reason,why:e.why,intensity:e.intensity!==undefined?+(+e.intensity).toFixed(2):undefined,strength:e.strength,charge:e.charge!==undefined?+(+e.charge).toFixed(2):undefined,lap:e.lap,phase:e.phase,with:e.with});return r;};
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  window.__rv24pilot=(o={})=>{const p=m.state.player,tr=m.track,pr=tr.project(p.x,p.z,p.s),look=10+p.speed*.5,lane=o.lane??0,tg=tr.sample(pr.s+look),tx=tg.x+tg.normal.x*lane,tz=tg.z+tg.normal.z*lane,err=wrap(Math.atan2(tx-p.x,tz-p.z)-p.heading);
   let vmax=99;for(let d=4;d<=96;d+=6){const c=Math.abs(tr.headingAt(pr.s+d+6)-tr.headingAt(pr.s+d-2))/8;if(c<.002)continue;const vc=Math.sqrt((o.aLat||16)/c),allowed=Math.sqrt(vc*vc+2*(o.aBrake||16)*Math.max(0,d-8));vmax=Math.min(vmax,allowed);}
   const turn=Math.abs(tr.headingAt(pr.s+20)-tr.headingAt(pr.s));
   return {steer:Math.max(-1,Math.min(1,err*1.7)),vmax,speed:p.speed,turn,time:m.state.time,phase:m.state.phase,lateral:p.lateral,half:tr.width/2};};
  window.__rv24state=()=>{const p=m.state.player,inp=window.__island.games.current.session.debug.input.sample();return {wall:Date.now(),input:{steer:+(inp.steer||0).toFixed(2),throttle:inp.throttle,brake:!!inp.brake,drift:!!inp.drift},t:+m.state.time.toFixed(3),phase:m.state.phase,speed:+p.speed.toFixed(2),gear:p.gear,rpm:+p.rpm.toFixed(3),boosting:!!p.boosting,boostTime:+(p.boostTime||0).toFixed(2),drifting:!!p.drifting,steer:+p.steer.toFixed(2),lateral:+p.lateral.toFixed(2),crashT:+(p.crashT||0).toFixed(3),air:+(p.crashAir||0).toFixed(2),offroad:!!p.offroad,lap:p.lap,checkpoints:p.checkpoints,tyre:p.tyre!==undefined?+p.tyre.toFixed(3):null,pit:p.pit?p.pit.phase:null,hidden:!!p.hidden,drop:+(p.dropY||0).toFixed(2),rank:p.rank,rollZ:null};};});
 for(let i=0;i<120&&(await snap()).phase!=='racing';i++)await tick(100);
 assert.equal((await snap()).phase,'racing','the race started');
 const cdp=await context.newCDPSession(page),touches=new Map();
 const send=async type=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
 const down=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchStart');};
 const move=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchMove');};
 // CDP (measured with a two-finger probe page): a touchEnd lists the fingers that LIFT; a touchMove without a finger does not lift it (in the first run the gas
 // stayed held under the brake that way), an empty touchEnd lifts all
 const up=async id=>{if(!touches.has(id))return;const t=touches.get(id);touches.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[t]});};
 const box=async sel=>(await page.locator(sel).count())?await page.locator(sel).first().boundingBox():null;
 const gas=await box('.racing-accelerate'),pad=await box('.racing-pad'),brakeBtn=await box('.racing-drift');
 assert.ok(gas&&pad&&brakeBtn,'gas, wheel pad and brake on screen');report.controls={gas,pad,brake:brakeBtn,brakeLabel:await page.locator('.racing-drift').getAttribute('aria-label')};
 const travel=Math.max(44,Math.min(70,pad.width*.14)),cx=pad.x+pad.width*.45,cy=pad.y+pad.height*.62;
 // model steer m -> finger offset (the controls: steer = -shape(dx/travel), dead zone .04, expo 1.2)
 const fingerX=m=>{const a=Math.min(1,Math.abs(m));if(a<.01)return cx;return cx-Math.sign(m)*(.04+.96*Math.pow(a,1/1.2))*travel;};
 let gasOn=false,brakeOn=false,wheelOn=false;
 const setGas=async on=>{if(on===gasOn)return;gasOn=on;if(on)await down(1,gas.x+gas.width/2,gas.y+gas.height/2);else await up(1);};
 const setBrake=async on=>{if(on===brakeOn)return;brakeOn=on;if(on)await down(3,brakeBtn.x+brakeBtn.width/2,brakeBtn.y+brakeBtn.height/2);else await up(3);};
 const setWheel=async m=>{if(!wheelOn){wheelOn=true;await down(2,cx,cy);}await move(2,fingerX(m),cy);};
 const state=()=>page.evaluate(()=>window.__rv24state());
 const sampleAudio=()=>page.evaluate(()=>{const L=window.__rv24audio;const out={shots:L.shots.splice(0),levels:L.levels.splice(0),osc:L.osc.splice(0)};return out;});
 const audio={shots:[],levels:[],osc:[]};const pullAudio=async()=>{const a=await sampleAudio();audio.shots.push(...a.shots);audio.levels.push(...a.levels);audio.osc.push(...a.osc);};
 const pixels=(png,name)=>page.evaluate(async({b})=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(bitmap.width,bitmap.height),g=c.getContext('2d');g.drawImage(bitmap,0,0);bitmap.close();
   const blob=await c.convertToBlob({type:'image/webp',quality:.55});return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});},{b:png.toString('base64')});
 const frame=async name=>{const webp=await pixels(await page.screenshot({type:'png'}));await writeFile(dir+'frames/'+name+'.webp',Buffer.from(webp,'base64'));const s=await state();report.frames.push({name,...s});return s;};
 /** pilot step: steer by the wheel finger, gas or brake by the pedal fingers; brakeMode 'kid' holds the brake from the brake point through the corner until the exit */
 let braking=false;
 const drive=async(o={})=>{const q=await page.evaluate(o=>window.__rv24pilot(o),o);await setWheel(o.steer!==undefined?o.steer:q.steer);
  if(o.brakes!==false){if(!braking&&q.speed>q.vmax+2)braking=true;else if(braking&&(q.speed<q.vmax-1||q.speed<9))braking=false;}else braking=false;
  await setBrake(braking);await setGas(!braking&&o.gas!==false);await tick(FRAME);return q;};
 const timeline=[];const log=async()=>{const s=await state();timeline.push({...s,gas:gasOn,brake:brakeOn});return s;};

 if(scenario==='turbo'||scenario==='corner'&&false){
  // a whole lap of driving like a child: gas, the wheel, and the brake button held from the brake point through the corner
  const until=Number(process.env.RV24_SECONDS)||45;let k=0;
  while(true){const q=await drive({aLat:15,aBrake:15});const s=await log();if(k%45===0)await frame('drive-'+String(k).padStart(4,'0'));if(k%15===0)await pullAudio();k++;if(s.t>until||s.phase!=='racing')break;}
  await pullAudio();
 }
 else if(scenario==='recover'){
  await setGas(true);await tick(2500);await frame('0-straight');
  await setWheel(-1);let flip=null;for(let i=0;i<400&&!flip;i++){await tick(FRAME);flip=await page.evaluate(()=>window.__log.find(e=>e.type==='crash'&&e.car==='player')||null);const s=await log();if(i%6===0)await frame('out-'+String(i).padStart(3,'0'));}
  assert.ok(flip,'driving off the circuit flips the car');report.flip=flip;await up(2);wheelOn=false;await setGas(false);
  for(let k=0;k<110;k++){const s=await log();await frame('flip-'+String(k).padStart(3,'0'));const back=await page.evaluate(()=>window.__log.find(e=>e.type==='crashRecover'&&e.car==='player'));if(back&&k>2&&s.crashT===0&&!s.hidden&&s.drop===0){report.backAt=back;break;}await tick(Math.round(1000/30));}
  for(let k=0;k<6;k++){await tick(100);await log();await frame('after-'+k);}
  report.land=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,q=tr.project(p.x,p.z,p.s);return {speed:p.speed,lateral:p.lateral,projLateral:q.lateral,headingError:Math.atan2(Math.sin(p.heading-tr.sample(p.s).heading),Math.cos(p.heading-tr.sample(p.s).heading)),crashT:p.crashT,phase:m.state.phase};});
  await setGas(true);await tick(1500);report.after=await log();await frame('drive-on');await pullAudio();
 }
 else if(scenario==='offslow'){
  // slowly off the road: a little gas to about 9 m/s, then a gentle turn to the right off the asphalt onto the run-off and the grass, gas off: the car rolls to a stop there
  await setGas(true);for(let i=0;i<60;i++){await tick(FRAME);const s=await log();if(s.speed>9)break;}await setGas(false);
  await setWheel(.55);for(let i=0;i<200;i++){await tick(FRAME);const s=await log();if(Math.abs(s.lateral)>(await page.evaluate(()=>window.__island.games.current.session.debug.model.track.width/2))+4.5)break;}
  await setWheel(0);for(let i=0;i<120;i++){await tick(FRAME);const s=await log();if(s.speed<.6)break;}await frame('1-stopped-off');report.stopped=await log();
  // try to drive back: the wheel towards the road and the gas held for 4 s
  const side=Math.sign(report.stopped.lateral)||1;await setWheel(side*.9);await setGas(true);const tries=[];
  for(let i=0;i<Math.round(4*FPS);i++){await tick(FRAME);const s=await log();tries.push(s);if(i%Math.round(FPS/2)===0)await frame('2-drive-back-'+String(i).padStart(3,'0'));}
  report.driveBack={start:report.stopped,end:tries.at(-1),maxSpeed:Math.max(...tries.map(s=>s.speed)),minAbsLateral:Math.min(...tries.map(s=>Math.abs(s.lateral))),events:await page.evaluate(()=>window.__log.filter(e=>e.car==='player'&&e.t>window.__rv24t()-4.2&&e.type!=='pass'))};
  // then: off again and left alone (no gas): how long until it is back on the road, and how
  await setGas(false);await setWheel(0);await up(2);wheelOn=false;
  const r2=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;return {t:m.state.time,lateral:m.state.player.lateral};});report.alone={from:r2};const alone=[];
  for(let i=0;i<Math.round(9*FPS);i++){await tick(FRAME);const s=await log();alone.push(s);if(i%FPS===0)await frame('3-alone-'+String(i).padStart(3,'0'));}
  report.alone.events=await page.evaluate(t=>window.__log.filter(e=>e.car==='player'&&e.t>=t&&e.type!=='pass'),r2.t);report.alone.end=alone.at(-1);
  await pullAudio();
 }
 else if(scenario==='corner'){
  // the turn alone: on the straight at speed, full lock without the brake for 1 s (a few corners' worth of steering); then straight; then the brake alone for 0.6 s
  await setGas(true);for(let i=0;i<Math.round(14*FPS);i++){await drive({brakes:false});const s=await log();if(s.speed>36)break;}
  const v0=(await log()).speed;await setWheel(.85);const turn=[];for(let i=0;i<FPS;i++){await tick(FRAME);turn.push(await log());}
  report.turn={from:v0,to:turn.at(-1).speed,loss:+(v0-turn.at(-1).speed).toFixed(2),lossPerSecond:+((v0-turn.at(-1).speed)).toFixed(2)};await frame('1-turn');
  await setWheel(0);for(let i=0;i<Math.round(1.5*FPS);i++){await drive({brakes:false});await log();}
  const v1s=await log(),v1=v1s.speed;await pullAudio();await setGas(false);await setBrake(true);const br=[];for(let i=0;i<Math.round(.6*FPS);i++){await tick(FRAME);br.push(await log());}
  report.brake={from:v1,to:br.at(-1).speed,decel:+((v1-br.at(-1).speed)/.6).toFixed(1),t0:v1s.t,t1:br.at(-1).t};await frame('2-brake');await setBrake(false);await tick(FRAME*3);await pullAudio();
  // which looping layers the game turned up while the brake was held (the audio log: the gain the loop feeds, set by the game every frame)
  report.brake.audible=[...new Set(audio.levels.filter(l=>l.t>=report.brake.t0-.05&&l.t<=report.brake.t1+.05&&l.v>.0005).map(l=>l.url))];
  report.brake.levels=audio.levels.filter(l=>l.t>=report.brake.t0-.05&&l.t<=report.brake.t1+.1);
 }
 else if(scenario==='brake'){
  await setGas(true);for(let i=0;i<Math.round(14*FPS);i++){await drive({brakes:false});const s=await log();if(s.speed>34)break;}
  await pullAudio();audio.shots.length=0;audio.levels.length=0;audio.osc.length=0;const tb=(await log()).t;report.brakeFrom=tb;
  await setGas(false);await setBrake(true);for(let i=0;i<Math.round(1.2*FPS);i++){await drive({brakes:false,gas:false});await log();}await setBrake(false);
  for(let i=0;i<Math.round(.5*FPS);i++){await drive({brakes:false});await log();}await pullAudio();
  report.audible=[...new Set(audio.levels.filter(l=>l.v>.0005).map(l=>l.url))];
 }
 else if(scenario==='bump'){
  // launch and steer into the car beside on the grid (the player starts in slot 3: the car to the side is one row ahead/behind), then hold the line
  await setGas(true);const side=Number(process.env.RV24_SIDE)||1;await setWheel(side*.45);let hit=null;
  for(let i=0;i<Math.round(6*FPS)&&!hit;i++){await tick(FRAME);await log();hit=await page.evaluate(()=>window.__log.find(e=>e.type==='bump'&&(e.car==='player'||e.with==='player'))||null);if(i%3===0)await frame('launch-'+String(i).padStart(3,'0'));}
  report.hit=hit;await setWheel(0);for(let k=0;k<Math.round(1.2*FPS);k++){await tick(FRAME);await log();if(k%3===0)await frame('after-hit-'+String(k).padStart(3,'0'));}
  report.bumpEvents=await page.evaluate(()=>window.__log.filter(e=>e.type==='bump'));await pullAudio();
 }
 else if(scenario==='pit'){
  // drive like a child; tap the pit button when it shows; at the box tap the tyre change; watch the computer drivers pit as well. RV24_SECONDS race seconds.
  const until=Number(process.env.RV24_SECONDS)||170;let k=0,tapped=false,changed=0;const pitShots=new Set();
  while(true){const s0=await state();
   if(s0.pit&&['entry','lane','stop','change','exit','merge'].includes(s0.pit)){await setBrake(false);await setGas(false);if(wheelOn){await up(2);wheelOn=false;}
    if(s0.pit==='stop'&&!changed){const b=await box('[data-action=racing-pit-change]');if(b){await page.waitForTimeout(10);await down(5,b.x+b.width/2,b.y+b.height/2);await tick(FRAME);await up(5);changed++;report.changeTap={...(await state()),button:b,crew:await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics?.pitCrew||null)};}}
    if(s0.pit==='change'&&!report.crewAtChange)report.crewAtChange=await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics?.pitCrew||null);
    if(!pitShots.has(s0.pit)){pitShots.add(s0.pit);await frame('pit-'+s0.pit);}else if(['stop','change','leave'].includes(s0.pit)&&k%4===0)await frame('pit-'+s0.pit+'-'+String(k).padStart(5,'0'));
    await tick(FRAME);await log();k++;if(k%30===0)await pullAudio();continue;}
   const q=await drive({aLat:Number(process.env.RV24_ALAT)||15,aBrake:Number(process.env.RV24_ABRAKE)||15});const s=await log();
   if(!tapped&&s.t>Number(process.env.RV24_TAP||20)){const b=await box('[data-action=racing-pit]');if(b){await down(4,b.x+b.width/2,b.y+b.height/2);await tick(FRAME);await up(4);tapped=true;report.pitTap={...(await state()),button:b};await frame('pit-button');}}
   if(k%150===0)await frame('race-'+String(k).padStart(5,'0'));if(k%30===0)await pullAudio();k++;if(s.t>until||s.phase!=='racing')break;}
  report.pitEvents=await page.evaluate(()=>window.__log.filter(e=>/^pit/.test(e.type)));report.tower=await page.evaluate(()=>[...document.querySelectorAll('.rt-row')].filter(r=>r.style.display!=='none').map(r=>({id:r.dataset.id,pos:r.querySelector('.rt-pos')?.textContent,gap:r.querySelector('.rt-gap')?.textContent,pit:r.dataset.pit||null})));
  report.cars=await page.evaluate(()=>window.__island.games.current.session.debug.model.state.cars.map(c=>({id:c.id,rank:c.rank,lap:c.lap,tyre:c.tyre!==undefined?+c.tyre.toFixed(3):null,pits:c.pits??null,pitLaps:c.pitLaps??null})));await pullAudio();
 }
 else if(scenario==='grid'){
  await frame('0-grid');report.gridMetrics=await page.evaluate(()=>{const m=window.__island.games.current.session.snapshot.renderMetrics;return {drawCalls:m.drawCalls,triangles:m.triangles,formulaAll:m.formulaAll||null,carAsset:m.carAsset};});
  // let the pack go and follow at the back: a few seconds without gas, then gas, frames from behind the pack
  await tick(2500);await frame('1-pack-leaves');await setGas(true);for(let i=0;i<Math.round(5*FPS);i++){await drive({brakes:true});await log();if(i%Math.round(FPS)===0)await frame('2-behind-'+i);}
  report.packMetrics=await page.evaluate(()=>{const m=window.__island.games.current.session.snapshot.renderMetrics;return {drawCalls:m.drawCalls,triangles:m.triangles,formulaAll:m.formulaAll||null};});
 }
 await setGas(false);await setBrake(false);if(wheelOn)await up(2);
 report.events=await page.evaluate(()=>window.__log.filter(e=>e.type!=='pass').slice(0,400));report.timeline=timeline;report.audio=audio;report.wallSeconds=Math.round((Date.now()-t0)/1000);
 // summary per scenario
 const ev=report.events.filter(e=>e.car==='player');report.summary={driftBoosts:ev.filter(e=>e.type==='driftBoost').length,boostSeconds:+(timeline.filter(s=>s.boosting).length/FPS).toFixed(2),
  blowoffs:audio.shots.filter(s=>/turbo-blowoff/.test(s.url||'')).length,backfires:audio.shots.filter(s=>/exhaust-pop/.test(s.url||'')).length,shiftShots:audio.shots.filter(s=>/shift-(up|down)/.test(s.url||'')).length,thumps:audio.osc.filter(o=>o.type==='sine').length,
  gearChanges:timeline.reduce((n,s,i)=>n+(i&&s.gear!==timeline[i-1].gear?1:0),0),crashes:ev.filter(e=>e.type==='crash').length,recoveries:ev.filter(e=>e.type==='crashRecover').length};
 await writeFile(dir+'frames.json',JSON.stringify(report,null,1)+'\n');
 return report.summary;
});
