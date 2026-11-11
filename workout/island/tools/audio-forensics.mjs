/** Audio forensics (evidence only): runs each sport in headless Chromium with every
 * Web Audio node logged (oscillators, buffer sources with the URL they were decoded
 * from, filters, gain path) and an AnalyserNode tapping each context's destination
 * 20 times a second. The pure classifier (minigames/audio-guard.mjs) then marks
 * whistle-like segments: a narrow 1.5-5 kHz line that lasts, or a pitch glide.
 * Usage: node tools/audio-forensics.mjs <outDir> [--games=streetSlam,soccer,tennis,alpineRush,islandRacing,city]
 *        [--seconds=180] [--city-seconds=30] [--assert] [--query=extra&params]
 * --assert exits 1 when a sustained tone, a steady bright hum or repeated glides appear during a live-play phase. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {whistleLike,summarizeFrames,LIVE_PHASES} from '../minigames/audio-guard.mjs';

const args=process.argv.slice(2),outDir=args.find(a=>!a.startsWith('--'))||'audio-forensics-out';
const opt=(name,fallback)=>{const hit=args.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const GAMES=opt('games','streetSlam,soccer,tennis,alpineRush,islandRacing,city').split(',').filter(Boolean);
const SECONDS=Number(opt('seconds',180)),CITY_SECONDS=Number(opt('city-seconds',30)),ASSERT=args.includes('--assert'),EXTRA=opt('query','');
// config.minigames[id].requiresBuilding: alpine and racing need none (a fake typeId breaks the city view).
const BUILDING={streetSlam:'basketball',soccer:'soccer',tennis:'tennis'};
await mkdir(outDir,{recursive:true});

/** Attribution and classification of one game's raw log; also used by --from=<dir>
 * to re-run the classifier on saved logs after a threshold change. */
function classify(game,log,seconds){
  const t0s=log.frames[0]?.t??0;if(!log.normalized){for(const f of log.frames)f.t=+(f.t-t0s).toFixed(3);for(const n of log.nodes)if(n.wall!==undefined)n.wall=+(n.wall-t0s).toFixed(3);log.normalized=true;}
  const segments=whistleLike(log.frames),live=new Set(LIVE_PHASES[game]||[]);
  for(const s of segments){s.live=s.phases.some(p=>live.has(p));
    // Sources sounding while the segment sounded: the evidence that names the file.
    s.sources=log.nodes.filter(n=>n.wall!==undefined&&n.kind!=='filter'&&n.wall<=s.end&&(n.endedAt===undefined?true:(n.wall+(n.endedAt-n.startedAt))>=s.start)).map(n=>n.kind==='oscillator'?`osc ${n.type} ${n.frequency}Hz`:`${n.url}${n.loop?' loop':''}`).filter((v,i,a)=>a.indexOf(v)===i).slice(0,8);}
  const byUrl={};for(const n of log.nodes){if(n.kind==='filter'||n.wall===undefined)continue;const k=n.kind==='oscillator'?`osc:${n.type}`:n.url||'?';const e=byUrl[k]||(byUrl[k]={count:0,live:0,loop:0,phases:{}});e.count++;if(n.loop)e.loop++;if(live.has(n.ph))e.live++;e.phases[n.ph]=(e.phases[n.ph]||0)+1;}
  const oscillators=log.nodes.filter(n=>n.kind==='oscillator'&&n.wall!==undefined).map(n=>({type:n.type,frequency:n.frequency,automation:n.automation.slice(0,6),path:n.path,ph:n.ph}));
  const filters=log.nodes.filter(n=>n.kind==='filter').map(n=>({type:n.type,frequency:n.frequency,Q:n.Q,automation:n.automation.slice(0,4)}));
  const result={game,seconds,contexts:log.contexts,frames:log.frames.length,phases:summarizeFrames(log.frames),sources:byUrl,oscillators:oscillators.length,filters:filters.length,segments,liveTones:segments.filter(s=>s.live&&s.kind==='tone'),liveGlides:segments.filter(s=>s.live&&s.kind==='glide'),liveHums:segments.filter(s=>s.live&&s.kind==='hum'),errors:log.errors,timeline:log.timeline};
  return {result,file:{...result,oscillatorDetail:oscillators.slice(0,40),filterDetail:filters.slice(0,40),decoded:log.decoded,nodes:log.nodes,frames:log.frames,normalized:true}};
}
const FROM=opt('from','');
if(FROM){
  const {readFile}=await import('node:fs/promises');
  const summary={generatedAt:new Date().toISOString(),reclassifiedFrom:FROM,games:{}};
  for(const game of GAMES){
    let log;try{log=JSON.parse(await readFile(path.join(FROM,`${game}.json`),'utf8'));}catch{continue;}
    const {result,file}=classify(game,log,log.seconds);summary.games[game]=result;
    await writeFile(path.join(outDir,`${game}.json`),JSON.stringify(file));
    console.log(JSON.stringify({game,segments:result.segments.map(s=>({kind:s.kind,hz:s.hz,from:s.fromHz,to:s.toHz,seconds:s.seconds,live:s.live,phases:s.phases,sources:s.sources}))}));
  }
  await writeFile(path.join(outDir,'summary.json'),JSON.stringify(summary,null,1));process.exit(0);
}

/** Installed before navigation: wraps the audio constructors, tags decoded buffers
 * with their fetch URL (by content fingerprint, so .slice(0) copies still match)
 * and samples the spectrum of every context through a tap before destination. */
function initScript(){
  const F=window.__audioForensics={contexts:[],nodes:[],decoded:[],frames:[],fetches:0};
  const fp=ab=>{const u=new Uint8Array(ab);let h=u.length>>>0;const step=Math.max(1,Math.floor(u.length/97));for(let i=0;i<u.length;i+=step)h=(Math.imul(h,31)+u[i])>>>0;return u.length+':'+h;};
  const urlByFp=new Map(),urlByBuffer=new WeakMap(),owner=new WeakMap(),edges=new WeakMap(),label=new WeakMap(),ctxMeta=new WeakMap();
  const short=url=>{try{const u=new URL(url,location.href);return u.pathname.replace(/^.*\/island\//,'')+(u.search&&!/[?&]v=/.test(u.search)?u.search:'');}catch{return String(url);}};
  const fetch0=window.fetch;
  window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||String(input);return fetch0.call(this,input,init).then(res=>{F.fetches++;const ab=res.arrayBuffer.bind(res);res.arrayBuffer=()=>ab().then(buf=>{try{urlByFp.set(fp(buf),short(url));}catch{}return buf;});return res;});};
  const r3=x=>typeof x==='number'?+x.toFixed(3):x;
  for(const m of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime']){
    const o=AudioParam.prototype[m];if(!o)continue;
    AudioParam.prototype[m]=function(...a){const own=owner.get(this);if(own){own.rec.automation.push([own.name,m.replace(/ToValueAtTime|AtTime/,''),...a.map(r3)]);if(own.rec.automation.length>80)own.rec.automation.splice(0,40);}return o.apply(this,a);};
  }
  const connect0=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(dest,...a){
    const meta=ctxMeta.get(this.context);let d=dest;
    if(meta&&dest===this.context.destination)d=meta.tap;
    let s=edges.get(this);if(!s){s=new Set();edges.set(this,s);}s.add(d);
    return connect0.call(this,d,...a);
  };
  const describe=n=>{const kind=label.get(n)||n.constructor.name;
    if(n instanceof GainNode)return `gain(${r3(n.gain.value)})`;
    if(n instanceof BiquadFilterNode)return `${n.type}(${Math.round(n.frequency.value)}Hz Q${r3(n.Q.value)})`;
    if(n instanceof DynamicsCompressorNode)return `limiter(${r3(n.threshold.value)}dB)`;
    if(kind==='tap')return 'destination';return kind;};
  // Depth-first walk from a source to the destination tap, reading gains and filters now.
  const pathOf=node=>{const out=[],seen=new Set();let cur=node,guard=0;
    while(cur&&guard++<24){const next=[...(edges.get(cur)||[])].filter(x=>x instanceof AudioNode);if(!next.length)return out.concat('(unconnected)').join('>');cur=next[0];if(seen.has(cur))return out.concat('(loop)').join('>');seen.add(cur);out.push(describe(cur));if(label.get(cur)==='tap')break;}
    return out.join('>');};
  const own=(node,name,rec)=>{if(node[name])owner.set(node[name],{rec,name});};
  let nextId=0;
  function register(ctx,kind){
    const meta={id:++nextId,kind,sampleRate:ctx.sampleRate,createdAt:+performance.now().toFixed(0),stack:(new Error().stack||'').split('\n').slice(2,5).map(s=>s.trim().replace(/^at /,'').replace(/\?v=[^:)]*/,'')).join(' < ')};
    F.contexts.push(meta);ctxMeta.set(ctx,meta);
    if(kind!=='OfflineAudioContext'){
      try{const tap=ctx.createGain(),an=ctx.createAnalyser();an.fftSize=4096;an.smoothingTimeConstant=0;label.set(tap,'tap');label.set(an,'analyser');connect0.call(tap,an);connect0.call(tap,ctx.destination);meta.tap=tap;meta.analyser=an;
        const bins=new Float32Array(an.frequencyBinCount),hz=ctx.sampleRate/an.fftSize,nb=Math.round(200/hz);
        // hi = strongest bin in 0.9-5 kHz (the squeak starts at 1.08 kHz); the classifier decides the band.
        const lo=Math.ceil(900/hz),hi=Math.floor(5000/hz),b2=Math.ceil(2000/hz),b1=Math.ceil(1000/hz),floor=Math.ceil(60/hz);
        const med=(arr)=>{const c=Array.from(arr).sort((a,b)=>a-b);return c[c.length>>1];};
        meta.timer=setInterval(()=>{
          if(ctx.state!=='running')return;an.getFloatFrequencyData(bins);
          let tot=0,e25=0,e12=0,kmax=floor,khi=lo;
          for(let i=floor;i<bins.length;i++){const e=Math.pow(10,bins[i]/10);tot+=e;if(i>=b2&&i<=hi)e25+=e;else if(i>=b1&&i<b2)e12+=e;if(bins[i]>bins[kmax])kmax=i;if(i>=lo&&i<=hi&&bins[i]>bins[khi])khi=i;}
          if(!(bins[kmax]>-110))return; // silence: nothing to classify
          const neigh=[...bins.subarray(Math.max(floor,khi-nb),Math.max(floor,khi-2)),...bins.subarray(khi+3,Math.min(bins.length,khi+nb))];
          F.frames.push({t:+(performance.now()/1000).toFixed(3),ct:+ctx.currentTime.toFixed(2),ctx:meta.id,lvl:+bins[kmax].toFixed(1),dom:Math.round(kmax*hz),s25:+(e25/tot).toFixed(3),s12:+(e12/tot).toFixed(3),hi:{f:Math.round(khi*hz),db:+bins[khi].toFixed(1),prom:+(bins[khi]-med(neigh)).toFixed(1),rel:+(bins[khi]-bins[kmax]).toFixed(1)},ph:window.__phaseProbe?.()??null});
        },50);
      }catch(e){meta.tapError=String(e);}
    }
    const decode0=ctx.decodeAudioData.bind(ctx);
    ctx.decodeAudioData=function(buf,ok,err){let url=null;try{url=urlByFp.get(fp(buf))||null;}catch{}
      const p=decode0(buf).then(b=>{urlByBuffer.set(b,url||'untagged');F.decoded.push({ctx:meta.id,url,duration:+b.duration.toFixed(3),sampleRate:b.sampleRate});return b;});
      if(ok)p.then(ok,err);return p;};
    const wrapSource=(node,kind,fill)=>{
      const rec={id:F.nodes.length+1,ctx:meta.id,kind,createdAt:+performance.now().toFixed(0),automation:[]};F.nodes.push(rec);
      const start0=node.start.bind(node),stop0=node.stop.bind(node);
      node.start=(...a)=>{Object.assign(rec,fill(node),{startAt:r3(a[0]??ctx.currentTime),startedAt:r3(ctx.currentTime),wall:+(performance.now()/1000).toFixed(3),path:pathOf(node),ph:window.__phaseProbe?.()??null});return start0(...a);};
      node.stop=(...a)=>{rec.stopAt=r3(a[0]??ctx.currentTime);return stop0(...a);};
      node.addEventListener('ended',()=>{rec.endedAt=r3(ctx.currentTime);});
      return node;};
    const osc0=ctx.createOscillator.bind(ctx);
    ctx.createOscillator=()=>{const n=osc0();own(n,'frequency',null);const node=wrapSource(n,'oscillator',x=>({type:x.type,frequency:r3(x.frequency.value),detune:r3(x.detune.value)}));owner.set(n.frequency,{rec:F.nodes[F.nodes.length-1],name:'frequency'});return node;};
    const buf0=ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource=()=>{const n=buf0();const node=wrapSource(n,'buffer',x=>({url:x.buffer?urlByBuffer.get(x.buffer)||`generated:${x.buffer.length}@${x.buffer.sampleRate}`:null,duration:x.buffer?r3(x.buffer.duration):null,loop:x.loop,loopStart:r3(x.loopStart),loopEnd:r3(x.loopEnd),rate:r3(x.playbackRate.value)}));owner.set(n.playbackRate,{rec:F.nodes[F.nodes.length-1],name:'playbackRate'});return node;};
    const biq0=ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter=()=>{const n=biq0();const rec={id:F.nodes.length+1,ctx:meta.id,kind:'filter',createdAt:+performance.now().toFixed(0),automation:[],get snapshot(){return {type:n.type,frequency:r3(n.frequency.value),Q:r3(n.Q.value)};}};F.nodes.push(rec);owner.set(n.frequency,{rec,name:'frequency'});owner.set(n.Q,{rec,name:'Q'});return n;};
    return ctx;
  }
  const wrapCtor=(name)=>{const C=window[name];if(!C)return;const W=function(...a){const ctx=new C(...a);return register(ctx,name);};W.prototype=C.prototype;Object.setPrototypeOf(W,C);window[name]=W;};
  for(const name of ['AudioContext','webkitAudioContext','OfflineAudioContext'])wrapCtor(name);
  F.drain=()=>({frames:F.frames.splice(0)});
  F.nodesSnapshot=()=>F.nodes.map(n=>n.kind==='filter'?{...n,...n.snapshot}:n);
}

const bots={
  // Same scripted bot as tools/perf-soccer.mjs, applied by wrapping model.update.
  soccer:()=>{const d=window.__island.games.current.session.debug,model=d.model,balance=window.__island.data.config.minigames.soccer;let n=0x9e3779b9;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};let hold=0,passHold=0,since=0;
    const bot=(s,dt)=>{const p=s.players[s.controlled],b=s.ball,goalX=s.attackDir*balance.pitch.length/2,input={moveX:0,moveZ:0,kickHeld:false,passHeld:false,sprintHeld:false,switchPlayer:false};since+=dt;let dx,dz;
      if(b.owner===p.id){dx=goalX-p.x;dz=-p.z*.35;if(hold<=0&&passHold<=0&&since>.6){since=0;if(Math.abs(goalX-p.x)<15&&random()<.55)hold=.3+random()*.3;else if(random()<.2)passHold=.08+random()*.3;}}
      else{dx=b.x-p.x;dz=b.z-p.z;input.sprintHeld=Math.hypot(dx,dz)>6;}
      const l=Math.hypot(dx,dz)||1;input.moveX=dx/l;input.moveZ=dz/l;if(hold>0){hold-=dt;input.kickHeld=hold>0;}if(passHold>0){passHold-=dt;input.passHeld=passHold>0;}return input;};
    const update=model.update.bind(model);model.update=(dt,input)=>update(dt,Object.assign(input||{},bot(model.getState(),dt)));
    window.__phaseProbe=()=>model.getState().phase;},
  // Autopilot comes from ?hoopsAuto=1 (hoops-session); only the phase probe is needed.
  streetSlam:()=>{const s=window.__island.games.current.session;window.__phaseProbe=()=>s.snapshot.phase;},
  // Same pilot as tools/perf-tennis-page.mjs: serve, run to the contact point, swing on time.
  tennis:()=>{const model=window.__island.games.current.session.debug.model;let pulse=false;
    const pilot=s=>{const input={};if(s.server===0&&s.phase==='serve')input.serve=true;else if(s.server===0&&s.phase==='toss')input.serve=s.phaseTime<.62;
      else if(s.phase==='rally'){const c=s.contact;if(c&&c.side===0){const dx=c.x-s.players[0].x,dz=c.z-s.players[0].z;input.move=Math.max(-1,Math.min(1,dx*2.2));input.moveZ=Math.max(-1,Math.min(1,dz*2.2));if(c.eta<=.03&&c.eta>-.2&&!pulse){input.swing=true;pulse=true;}else if(c.eta>.1)pulse=false;}else{input.move=-s.players[0].x*.8;input.moveZ=(4.2-s.players[0].z)*.8;pulse=false;}}
      return input;};
    const update=model.update.bind(model);model.update=(dt,input)=>update(dt,Object.assign({},input||{},pilot(model.getState())));
    window.__phaseProbe=()=>model.getState().phase;},
  // Lane pilot from tools/perf-alpine.mjs; restarts from the menu when a run ends.
  alpineRush:()=>{const session=window.__island.games.current.session,engine=session.debug.engine,input=session.debug.input(),balance=window.__island.data.config.minigames.alpineRush;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),objects=engine.course.objects,P=balance.physics,pipe=engine.pipe;let cursor=0,frame=0,best=0,tricked=false,wallUntil=-1,lastWall=0;
    input.sample=player=>{frame++;const s=player.s??0,x=player.x??0;while(cursor<objects.length&&objects[cursor].s<s+1)cursor++;
      if(frame%6===1){let bc=Infinity;best=x;for(let cx=-8;cx<=8;cx+=.4){let c=Math.abs(cx-x)*.12;for(let i=cursor;i<objects.length&&objects[i].s<s+40;i++){const o=objects[i],near=1/(1+(o.s-s)/18);if(o.type==='rock'&&Math.abs(cx-o.x)<o.radius*P.rockHitScale+P.board.halfWidth+.25)c+=100*near;else if(o.type==='gate'&&Math.abs(Math.abs(cx-o.x)-P.gateHalfWidth)<1.2)c+=100*near;else if(o.type==='ramp'){const off=Math.abs(cx-o.x);if(off>=1.6&&off<2.5)c+=60*near;else if(off<1.6)c-=6*near;}else if(o.type==='boost'&&Math.abs(cx-o.x)<1.3)c-=4*near;else if(o.type==='coin'&&Math.abs(cx-o.x)<.6)c-=1.5*near;}if(c<bc){bc=c;best=cx;}}
        const clear=!objects.slice(cursor,cursor+6).some(o=>o.type!=='coin'&&o.s<s+45);if(clear&&s-lastWall>120&&!player.airborne){wallUntil=frame+70;lastWall=s;}}
      const target=frame<wallUntil?pipe.lip:best;if(!player.airborne)tricked=false;let trick=null;if(player.airborne&&!player.trick&&!tricked){trick='grab';tricked=true;}
      return {steer:clamp((target-x)*.8-(player.lean??0)*.2,-1,1),boost:!player.airborne,trick};};
    window.__phaseProbe=()=>engine.phase;window.__alpineKick=()=>{if(engine.phase==='menu')session.start();};window.__alpineKick();},
  // Pure pursuit on the centre line, as in tools/perf-racing-page.mjs.
  islandRacing:()=>{const d=window.__island.games.current.session.debug,model=d.model,track=model.track,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    d.input.sample=()=>{const p=model.state.player,pr=track.project(p.x,p.z,p.s),tg=track.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return {steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:Math.abs(err)>.22&&p.speed>14,nitro:p.nitro>70&&Math.abs(err)<.08};};
    window.__phaseProbe=()=>model.state.phase;}
};
const ready={
  soccer:()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},
  streetSlam:()=>{const c=window.__island.games.current;return !!(c?.session.debug?.view&&c.session.snapshot.renderMetrics);},
  tennis:()=>!!window.__island.games.current?.session.ready,
  alpineRush:()=>!!window.__island.games.current?.session.snapshot?.loaded,
  islandRacing:()=>(window.__island.games.current?.session.snapshot?.renderMetrics?.frames??0)>1
};

const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const summary={generatedAt:new Date().toISOString(),seconds:SECONDS,games:{}};
let failures=0;
for(const game of GAMES){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
  await context.addInitScript(initScript);
  const page=await context.newPage(),errors=[],consoleAudio=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/audio|sound|whistle/i.test(m.text()))consoleAudio.push(m.text());});
  const log={game,errors,consoleAudio,frames:[],nodes:[],decoded:[],contexts:[],timeline:[]};
  const t0=Date.now(),mark=what=>log.timeline.push({at:+((Date.now()-t0)/1000).toFixed(1),what});
  try{
    const query=['dev=1',game==='streetSlam'?'hoopsAuto=1':'',EXTRA].filter(Boolean).join('&');
    await page.goto(`${server.url}?${query}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
    await page.evaluate(typeId=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(typeId&&!e.state.buildings.some(b=>b.typeId===typeId))e.state.buildings.push({id:'t-'+typeId,typeId,x:0,y:0,level:1});},BUILDING[game]||null);
    const seconds=game==='city'?CITY_SECONDS:SECONDS;
    if(game==='city'){
      // Shell idle: unlock the shell's own sound (sound.mjs) with a tap, then wait.
      await page.mouse.click(400,200);mark('city idle');
    }else{
      await page.evaluate(id=>window.__island.games.start(id,undefined,1),game);
      if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
      await page.waitForFunction(ready[game],null,{timeout:300000});mark('ready');
      await page.evaluate(bots[game]);
      // Audio unlocks on a gesture in every session; tap the canvas and press a key.
      const canvas=page.locator('.minigame-canvas').first();await canvas.click({position:{x:60,y:60},force:true}).catch(()=>{});await page.keyboard.press('Shift');
      mark('bot running');
    }
    const until=Date.now()+seconds*1000;let lastPull=Date.now();
    while(Date.now()<until){
      await page.waitForTimeout(1000);
      if(game==='alpineRush')await page.evaluate(()=>window.__alpineKick?.()).catch(()=>{});
      if(Date.now()-lastPull>5000){lastPull=Date.now();const d=await page.evaluate(()=>window.__audioForensics.drain());log.frames.push(...d.frames);}
    }
    const rest=await page.evaluate(()=>{const F=window.__audioForensics;return {frames:F.frames.splice(0),nodes:F.nodesSnapshot(),decoded:F.decoded,contexts:F.contexts.map(c=>({id:c.id,kind:c.kind,sampleRate:c.sampleRate,createdAt:c.createdAt,stack:c.stack,tapError:c.tapError})),fetches:F.fetches};});
    log.frames.push(...rest.frames);Object.assign(log,{nodes:rest.nodes,decoded:rest.decoded,contexts:rest.contexts,fetches:rest.fetches});mark('done');
    try{await page.evaluate(()=>window.__island.games.current?.cancel?.());}catch{}
  }catch(e){errors.push('tool: '+e.message);mark('error '+e.message);}
  finally{await context.close();}
  // Classification: whistle-like segments overall and inside live-play phases.
  const {result,file}=classify(game,log,game==='city'?CITY_SECONDS:SECONDS);
  // --assert: a sustained tone or a steady bright hum in live play fails, and so do three or more squeak glides (a repeat is a pattern, one may be a stray).
  summary.games[game]=result;if(result.liveTones.length||result.liveHums.length||result.liveGlides.length>=3)failures++;
  await writeFile(path.join(outDir,`${game}.json`),JSON.stringify(file));
  console.log(JSON.stringify({game,contexts:log.contexts.length,frames:log.frames.length,phases:result.phases,sources:result.sources,segments:result.segments.map(s=>({kind:s.kind,hz:s.hz,from:s.fromHz,to:s.toHz,seconds:s.seconds,live:s.live,phases:s.phases,sources:s.sources})),errors}));
}
await browser.close();await server.close();
await writeFile(path.join(outDir,'summary.json'),JSON.stringify(summary,null,1));
if(ASSERT&&failures){console.error(`audio-forensics: whistle-like sound during live play in ${failures} game(s)`);process.exit(1);}
