// racing-v24.5 browser proof (Roy after v24.4 on the phone). The v24 touch harness (racing-v24-touch-browser.mjs: Chromium/SwiftShader, phone viewport 844x390,
// hasTouch + isMobile, REAL touch through CDP Input.dispatchTouchEvent, the race state only READ) with the scenarios of this round:
//  kid       a child on the gas who never brakes: the wheel finger follows the road, the gas finger stays down for RV245_SECONDS of race; every gear change, lift,
//            off-road second and slip angle is logged with the race time, plus the engine's noise bed level (audio.engine().noise) and the sample layer's wind level
//  shoulder  on the main straight the wheel finger takes the car 3 m out onto the run-off and holds it there for 3 s, then 6 m out (the gravel): the speed on each
// Run both with RV245_QUERY='racingTyreFeel=v244&racingCarry=v244&racingShoulder=v244&racingGears=v244&racingRound=v244&racingAir=v244' (v24.4) and without (v24.5).
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js RV245_SCENARIO=kid RV245_PART=racing-v24-5/kid-after \
//        [RV245_QUERY=...] [RV245_STAGE=1] [RV245_SECONDS=70] node workout/island/tests/racing-v24-5-touch-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
const scenario=process.env.RV245_SCENARIO||'kid',part=process.env.RV245_PART||'racing-v24-5/'+scenario,extra=process.env.RV245_QUERY||'',FPS=Number(process.env.RV245_FPS)||30;
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
 // RV245_STAGE=N (default 1) races the quick race of stage N; RV245_STAGE=league the next league race
 if((process.env.RV245_STAGE||'1')!=='league'){const n=Number(process.env.RV245_STAGE||1);await page.evaluate(n=>{const e=window.__island.engine;e.state.money=Math.max(e.state.money||0,100000);window.__island.games.start('islandRacing',undefined,n);},n);await tick(100);}
 else{await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForFunction(()=>document.querySelector('[data-action=racing-league-go]'));
  await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);}
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
  window.__rv24state=()=>{const p=m.state.player,inp=window.__island.games.current.session.debug.input.sample();return {wall:Date.now(),input:{steer:+(inp.steer||0).toFixed(2),throttle:inp.throttle,brake:!!inp.brake,drift:!!inp.drift},t:+m.state.time.toFixed(3),phase:m.state.phase,speed:+p.speed.toFixed(2),gear:p.gear,rpm:+p.rpm.toFixed(3),boosting:!!p.boosting,boostTime:+(p.boostTime||0).toFixed(2),drifting:!!p.drifting,steer:+p.steer.toFixed(2),lateral:+p.lateral.toFixed(2),crashT:+(p.crashT||0).toFixed(3),air:+(p.crashAir||0).toFixed(2),offroad:!!p.offroad,lap:p.lap,checkpoints:p.checkpoints,tyre:p.tyre!==undefined?+p.tyre.toFixed(3):null,pit:p.pit?p.pit.phase:null,hidden:!!p.hidden,drop:+(p.dropY||0).toFixed(2),rank:p.rank,rollZ:null,lifting:!!p.lifting,liftTo:+(p.liftTo||0).toFixed(1),slip:+(p.slipAngle||0).toFixed(4),noise:+(window.__island.games.current.session.debug.audio.engine().noise||0).toFixed(4),wind:window.__island.games.current.session.debug.audio.engine().samples?.wind??null,air:window.__island.games.current.session.debug.audio.engine().air};};});
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


 if(scenario==='kid'){
  // the child: gas down the whole time, the wheel follows the road, never the brake
  const until=Number(process.env.RV245_SECONDS)||70;let k=0;
  while(true){await drive({brakes:false});const s=await log();if(k%60===0)await frame('kid-'+String(k).padStart(5,'0'));if(k%15===0)await pullAudio();k++;if(s.t>until||s.phase!=='racing')break;}
  await pullAudio();
 }
 else if(scenario==='shoulder'){
  // wait for the main straight after the start (the first 2 s of the race), then 3 m out on the run-off for 3 s, back, 6 m out for 3 s
  const half=await page.evaluate(()=>window.__island.games.current.session.debug.model.track.width/2);report.half=half;
  for(let i=0;i<Math.round(4*FPS);i++){await drive({brakes:false});await log();}
  const hold=async(beyond,label)=>{const rows=[];for(let i=0;i<Math.round(3*FPS);i++){await drive({lane:half+beyond,brakes:false});const s=await log();rows.push(s);if(i===Math.round(1.5*FPS))await frame(label);}
   report[label]={beyond,speedStart:rows[0].speed,speedEnd:rows.at(-1).speed,minSpeed:Math.min(...rows.map(r=>r.speed)),offroadShare:+(rows.filter(r=>r.offroad).length/rows.length).toFixed(2),maxLateral:Math.max(...rows.map(r=>Math.abs(r.lateral)))};};
  await hold(3,'runoff-3m');for(let i=0;i<Math.round(2*FPS);i++){await drive({brakes:false});await log();}await hold(6,'gravel-6m');
  await pullAudio();
 }
 await setGas(false);await setBrake(false);if(wheelOn)await up(2);
 report.events=await page.evaluate(()=>window.__log.filter(e=>e.type!=='pass').slice(0,400));report.timeline=timeline;report.audio=audio;report.wallSeconds=Math.round((Date.now()-t0)/1000);
 // summary per scenario
 const ev=report.events.filter(e=>e.car==='player');report.summary={lifts:ev.filter(e=>e.type==='lift').length,downshifts:timeline.reduce((n,s,i)=>n+(i&&s.gear<timeline[i-1].gear?1:0),0),offroadSeconds:+(timeline.filter(s=>s.offroad).length/FPS).toFixed(2),maxSlipDeg:+(Math.max(0,...timeline.map(s=>Math.abs(s.slip||0)))*180/Math.PI).toFixed(2),flips:ev.filter(e=>e.type==='crash').length,raceSeconds:timeline.at(-1)?.t??0,meanNoise:+(timeline.reduce((n,s)=>n+(s.noise||0),0)/Math.max(1,timeline.length)).toFixed(4),maxNoise:Math.max(0,...timeline.map(s=>s.noise||0)),maxWind:Math.max(0,...timeline.map(s=>s.wind||0)),shoulder:report['runoff-3m']||null,gravel:report['gravel-6m']||null,driftBoosts:ev.filter(e=>e.type==='driftBoost').length,boostSeconds:+(timeline.filter(s=>s.boosting).length/FPS).toFixed(2),
  blowoffs:audio.shots.filter(s=>/turbo-blowoff/.test(s.url||'')).length,backfires:audio.shots.filter(s=>/exhaust-pop/.test(s.url||'')).length,shiftShots:audio.shots.filter(s=>/shift-(up|down)/.test(s.url||'')).length,thumps:audio.osc.filter(o=>o.type==='sine').length,
  gearChanges:timeline.reduce((n,s,i)=>n+(i&&s.gear!==timeline[i-1].gear?1:0),0),crashes:ev.filter(e=>e.type==='crash').length,recoveries:ev.filter(e=>e.type==='crashRecover').length};
 await writeFile(dir+'frames.json',JSON.stringify(report,null,1)+'\n');
 return report.summary;
});
