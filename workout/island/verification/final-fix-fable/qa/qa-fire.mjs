// Independent QA (12/11/2026) of the fireRescue final fix against Roy's six complaints.
// Real island shell, real CDP touch (Input.dispatchTouchEvent) on the on-screen joystick, buttons and map; measurements are read
// from the scene graph (world matrices) and the session snapshot. Nothing in the game state is set to produce the behaviour under test.
// Time is game time: the page clock is paused and advanced with page.clock.runFor (load-independent).
//   ISLAND_PLAYWRIGHT=... CHROMIUM_PATH=... node qa-fire.mjs <run> [<run> ...]      (runs listed in RUNS below; `merge` writes the summaries)
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from '../../../tests/shell-ready.mjs';

const DIR=fileURLToPath(new URL('./',import.meta.url));
const OLD='&fireTruckModel=v20&fireHeading=v20&fireLadder=v20&fireRescue=v20&fireHud=v20';
const OLD_MESHY='&fireHeading=v20&fireLadder=v20&fireRescue=v20&fireHud=v20';
const OLD_V19='&fireTruckModel=v20&fireHeading=v20&fireLadder=v19&fireRescue=v20&fireHud=v20&fireDraw=v19&fireSound=v19';
export const RUNS={
 'drive-new':{query:'',scenario:'drive',build:'after'},
 'drive-old':{query:OLD,scenario:'drive',build:'before'},
 'drive-oldmeshy':{query:OLD_MESHY,scenario:'drive',build:'before'},
 'drive-pumper':{query:'&fireTruckModel=v20',scenario:'drive',build:'after'},
 'drive-v19':{query:OLD_V19,scenario:'drive',build:'before'},
 'turns-new':{query:'',scenario:'turns',build:'after'},
 'turns-old':{query:OLD,scenario:'turns',build:'before'},
 'rescue-new-tap':{query:'',scenario:'rescue',stage:3,taps:[100],early:true,build:'after'},
 'rescue-new-press':{query:'',scenario:'rescue',stage:3,taps:[500,100],build:'after'},
 'rescue-new-early':{query:'',scenario:'rescue',stage:3,taps:[100],early:true,build:'after'},
 'rescue-new-double':{query:'',scenario:'rescue',stage:3,taps:[100],double:300,build:'after'},
 'rescue-old-tap':{query:OLD,scenario:'rescue',stage:3,taps:[100],hold:1600,build:'before'},
 'rescue-oldmeshy-tap':{query:OLD_MESHY,scenario:'rescue',stage:3,taps:[100],hold:1600,build:'before'},
 'wind-new':{query:'',scenario:'rescue',stage:7,taps:[100],wrongStick:true,build:'after'},
 'wind-old':{query:OLD,scenario:'rescue',stage:7,taps:[100],hold:3000,build:'before'},
};

const deg=r=>r*180/Math.PI,round=(v,n=2)=>v===null||v===undefined||!Number.isFinite(v)?v:+v.toFixed(n);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/** In-page measurement from the live scene graph. Meshy nose = the truck root's local -Z: verified from the rendered geometry
 * (windshield, grille and headlights face local -Z, `qa-fire-model-meshy-*.png`). Pumper nose = centroid of its cab glass. */
async function measureInPage(){
 const g=window.__island.games.current;if(!g)return null;
 const T=await import('/workout/island/vendor/three.module.js'),deg=r=>r*180/Math.PI;
 const sess=g.session,view=sess.debug.view,w=view.world,m=sess.debug.model,s=sess.snapshot;
 const out={time:s.time,renderMode:s.renderMode,truck:{x:s.truck.x,z:s.truck.z,vx:s.truck.velocityX||0,vz:s.truck.velocityZ||0,yaw:s.truck.yaw,drawYaw:s.truck.drawYaw,driving:s.truck.driving,speed:s.truck.speed,blocked:Boolean(s.truck.blocked)},
  truckScreen:s.truckScreen,latch:sess.debug.rescueLatch,rescuing:s.rescuing,spraying:s.spraying,refilling:s.refilling,atHydrant:s.atHydrant,water:s.water,maxWater:s.maxWater,pressure:s.pressure,
  ladder:{extension:s.ladder.extension,sway:s.ladder.sway,stable:s.ladder.stable,engaged:s.ladder.engaged,available:s.ladder.available,mode:s.ladder.mode},
  rescues:s.rescues.map(r=>({rescued:r.rescued,expired:r.expired,progress:r.progress,seconds:r.seconds,near:r.near,safe:r.safe,descent:r.descent,remaining:r.remaining,world:r.world,fireIndex:r.fireIndex})),
  flames:s.flames.map(f=>({active:f.active,heat:f.heat,warning:f.warning})),coach:document.querySelector('.fire-instruction')?.textContent||null,
  navigation:{active:s.navigation.active,kind:s.navigation.kind},indicators:s.indicators.map(i=>({kind:i.kind,edge:i.edge,x:i.x,y:i.y,size:i.size})),
  audio:{state:s.audio.state,loops:s.audio.loops,played:s.audio.played}};
 const parts=w?.truckParts?.();out.kind=parts?.kind||null;
 if(parts){
  const root=parts.root;root.updateMatrixWorld(true);const o=root.localToWorld(new T.Vector3(0,0,0));
  const body=root.localToWorld(new T.Vector3(0,0,-1)).sub(o); // body axis toward local -Z
  let nose;
  if(parts.kind==='v7'){const c=new T.Vector3(),t=new T.Vector3();let n=0;root.traverse(x=>{if(x.isMesh&&x.material?.name==='vehicle/glass'){const p=x.geometry.attributes.position;for(let i=0;i<p.count;i++){t.fromBufferAttribute(p,i);x.localToWorld(t);c.add(t);n++;}}});
   const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3());nose=n?c.multiplyScalar(1/n).sub(center):null;out.noseMethod='cab-glass-centroid';}
  else{nose=body.clone();out.noseMethod='root-local-minusZ (front verified on render)';}
  if(nose){nose.y=0;nose.normalize();out.nose=[nose.x,nose.z];}
  // roof ladder of the model (meshes under the turret): its long axis in world space against the body axis
  const ladderMeshes=[];parts.turret.traverse(x=>{if(x.isMesh)ladderMeshes.push(x);});
  if(ladderMeshes.length){
   const lm=ladderMeshes.reduce((a,b)=>a.geometry.attributes.position.count>=b.geometry.attributes.position.count?a:b);lm.geometry.computeBoundingBox();const bb=lm.geometry.boundingBox;
   const cx=(bb.min.x+bb.max.x)/2,cy=(bb.min.y+bb.max.y)/2,A=lm.localToWorld(new T.Vector3(cx,cy,bb.min.z)),B=lm.localToWorld(new T.Vector3(cx,cy,bb.max.z)),axis=B.clone().sub(A);
   const len=axis.length(),bodyN=body.clone().normalize(),cos=Math.abs(axis.dot(bodyN))/len;
   const pivot=parts.arm?parts.arm.getWorldPosition(new T.Vector3()):null;let tip=null;
   if(pivot)tip=A.distanceTo(pivot)>B.distanceTo(pivot)?A:B;
   out.roofLadder={meshVertices:lm.geometry.attributes.position.count,deviationDeg:deg(Math.acos(Math.min(1,cos))),pitchDeg:deg(Math.asin(Math.abs(axis.y)/len)),length:len,tip:tip?tip.toArray():null,ends:[A.toArray(),B.toArray()]};
  }
 }
 const box=w?.ladderRoot?.();if(box){box.updateMatrixWorld(true);out.boxLadder={visible:box.visible,tip:box.localToWorld(new T.Vector3(0,1,0)).toArray(),base:box.localToWorld(new T.Vector3(0,0,0)).toArray()};}
 const target=m.ladder.target;
 if(target){const aim=new T.Vector3(target.world[0]+m.ladder.sway*2,target.world[1]+.85,target.world[2]);out.ladderTarget=aim.toArray();
  const tip=out.roofLadder?.tip?new T.Vector3(...out.roofLadder.tip):out.boxLadder?.visible?new T.Vector3(...out.boxLadder.tip):null;
  if(tip&&(out.ladder.extension>0||out.boxLadder?.visible)){out.tipToTarget=tip.distanceTo(aim);out.tipToTargetFlat=Math.hypot(tip.x-aim.x,tip.z-aim.z);out.tipHeightMinusTarget=tip.y-aim.y;}
 }
 return out;
}
function gaugeInPage(){
 const g=document.querySelector('.fire-water-gauge');if(!g)return null;const r=g.getBoundingClientRect(),cs=getComputedStyle(g),text=g.querySelector('.fire-gauge-text'),fill=g.querySelector('.fire-gauge-fill');
 return {percent:Number(g.dataset.percent),level:g.dataset.level,text:g.textContent.trim(),box:{x:r.x,y:r.y,w:r.width,h:r.height},visible:r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none',
  fontSize:text&&getComputedStyle(text).fontSize,textColor:text&&getComputedStyle(text).color,textAnimation:text&&getComputedStyle(text).animationName,fill:fill&&{transform:fill.style.transform,background:getComputedStyle(fill).backgroundImage}};
}
function domInPage(){
 const pick=(sel)=>[...document.querySelectorAll(sel)].map(n=>{const r=n.getBoundingClientRect(),cs=getComputedStyle(n);return {sel,id:n.id||null,cls:typeof n.className==='string'?n.className:null,text:(n.textContent||'').trim().slice(0,80),box:{x:r.x,y:r.y,w:r.width,h:r.height},visible:r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&!n.hidden&&Number(cs.opacity)>0};});
 const items=[...pick('.fire-hud'),...pick('.fire-water-gauge'),...pick('.fire-coach'),...pick('.game-header .game-pause'),...pick('.game-header .sound-toggle'),...pick('#shoot'),...pick('#fire-refill'),...pick('#pass'),...pick('#fire-finish'),...pick('.fire-ladder-balance'),...pick('#joystick')].filter(i=>i.visible);
 const overlaps=[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i].box,b=items[j].box,ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(ox>1&&oy>1)overlaps.push({a:items[i].sel,b:items[j].sel,ox:Math.round(ox),oy:Math.round(oy)});}
 const inView=items.filter(i=>i.box.x<-1||i.box.y<-1||i.box.x+i.box.w>innerWidth+1||i.box.y+i.box.h>innerHeight+1).map(i=>i.sel);
 const screen=document.querySelector('.game-screen');const waterWords=[];if(screen){const walker=document.createTreeWalker(screen,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(/מים/.test(n.textContent)){const el=n.parentElement,r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(r.width>0&&cs.visibility!=='hidden'&&cs.display!=='none')waterWords.push({text:n.textContent.trim(),cls:el.className,parentId:el.parentElement?.id||null,box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}});}}}
 const refill=document.querySelector('#fire-refill');
 return {items,overlaps,outOfView:inView,waterWords,refill:refill?{text:refill.textContent.trim(),aria:refill.getAttribute('aria-label'),labels:refill.querySelectorAll('.fire-control-label').length}:null,
  ladderButton:(()=>{const p=document.querySelector('#pass');return p?{text:p.textContent.trim(),disabled:p.disabled,held:p.classList.contains('held')}:null;})()};
}
/** Output level of the game's real AudioContext (an analyser branch on every connection to the destination; see init script). */
function audioLevelInPage(){
 const taps=window.__qaAudio?.taps||[];return taps.map(t=>{const a=t.an,buf=new Float32Array(a.fftSize);a.getFloatTimeDomainData(buf);let s=0,peak=0;for(const v of buf){s+=v*v;peak=Math.max(peak,Math.abs(v));}
  const spec=new Float32Array(a.frequencyBinCount);a.getFloatFrequencyData(spec);let num=0,den=0,band=0;const hz=i=>i*t.ctx.sampleRate/a.fftSize;
  for(let i=1;i<spec.length;i++){if(!Number.isFinite(spec[i]))continue;const p=10**(spec[i]/10);num+=p*hz(i);den+=p;if(hz(i)>=300&&hz(i)<=4000)band+=p;}
  // band 300-4000 Hz: roughly what a small phone speaker reproduces
  return {state:t.ctx.state,rms:Math.sqrt(s/buf.length),rmsDb:20*Math.log10(Math.sqrt(s/buf.length)||1e-9),peak,centroidHz:den?num/den:0,phoneBandShare:den?band/den:0,sampleRate:t.ctx.sampleRate};}).filter(x=>x.rms>0||x.peak>0);
}
/** The truck as placed in the scene, rendered alone from fixed sides with a red stick on the truck root's local -Z (the claimed nose). */
async function modelViewsInPage(){
 const T=await import('/workout/island/vendor/three.module.js');const parts=window.__island.games.current.session.debug.view.world.truckParts();if(!parts)return null;
 const scene=new T.Scene();scene.background=new T.Color('#dde6ea');scene.add(new T.HemisphereLight('#ffffff','#667766',2.2));const sun=new T.DirectionalLight('#ffffff',2);sun.position.set(5,10,7);scene.add(sun);
 const clone=parts.root.clone(true);clone.position.set(0,0,0);clone.rotation.set(0,0,0);scene.add(clone);
 const stickMesh=new T.Mesh(new T.BoxGeometry(.15,.15,1.5),new T.MeshBasicMaterial({color:'#ff0000'}));stickMesh.position.set(0,.1,-3.7);scene.add(stickMesh);
 const canvas=document.createElement('canvas'),r=new T.WebGLRenderer({canvas,antialias:true});r.setSize(640,360,false);r.outputColorSpace=T.SRGBColorSpace;const cam=new T.PerspectiveCamera(35,640/360,.1,100),shots={};
 for(const [name,pos]of Object.entries({side:[12,3,0],front:[0,3,-12],threeQ:[8,6,-8]})){cam.position.set(...pos);cam.lookAt(0,1.2,0);cam.updateMatrixWorld();r.render(scene,cam);shots[name]=canvas.toDataURL('image/png');}
 r.dispose();r.forceContextLoss();stickMesh.geometry.dispose();stickMesh.material.dispose();return shots;
}
function saveShapeInPage(){
 const raw=localStorage.getItem('island.v1');const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
 if(!raw)return {keys,save:null};const save=JSON.parse(raw),paths=[];
 const walk=(v,p)=>{if(Array.isArray(v)){paths.push(p+'[]');if(v.length&&typeof v[0]==='object')walk(v[0],p+'[]');}else if(v&&typeof v==='object'){for(const k of Object.keys(v).sort())walk(v[k],p?p+'.'+k:k);}else paths.push(p+':'+typeof v);};
 walk(save,'');return {keys:keys.sort(),version:save.version,paths,fireProgress:save.minigameProgress?.fireRescue,fireCertificates:save.fireCertificates,bytes:raw.length};
}

async function runOne(browser,server,name){
 const spec=RUNS[name];if(!spec)throw Error('unknown run '+name);
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context);
 await context.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});
  // measurement only: tap every connection to an AudioDestinationNode into an AnalyserNode (does not change what is heard)
  const connect=AudioNode.prototype.connect;window.__qaAudio={taps:[]};
  AudioNode.prototype.connect=function(dest,...rest){const result=connect.call(this,dest,...rest);try{if(typeof AudioDestinationNode!=='undefined'&&dest instanceof AudioDestinationNode){let tap=window.__qaAudio.taps.find(t=>t.ctx===this.context);if(!tap){const an=this.context.createAnalyser();an.fftSize=4096;tap={ctx:this.context,an};window.__qaAudio.taps.push(tap);}connect.call(this,tap.an);}}catch{}return result;};});
 const page=await context.newPage();await csp.attachPage(page);
 const errors=[],outside=[],rec={run:name,...spec,startedAt:new Date().toISOString(),errors,outside,shots:[]};
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
 const assetLog=[];rec.assetLog=assetLog;const T00=Date.now();page.on('request',r=>{const u=new URL(r.url());if(/\.(glb|ktx2|png|jpg|ogg)$/i.test(u.pathname)&&/fire|truck|engine|models/.test(u.pathname))assetLog.push({t:Date.now()-T00,ev:'req',path:u.pathname.replace('/workout/island/','')});});page.on('requestfinished',r=>{const u=new URL(r.url());if(/fire-truck-512|engine-pumper/.test(u.pathname))assetLog.push({t:Date.now()-T00,ev:'done',path:u.pathname.replace('/workout/island/','')});});
 const client=await context.newCDPSession(page),active=new Map();
 const touch=async(type,id,x,y)=>{if(type==='touchEnd'||type==='touchCancel')active.delete(id);else active.set(id,{x:Math.round(x),y:Math.round(y),id});await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...active.values()]});};
 const tick=ms=>page.clock.runFor(ms);
 // In-game time advances in single frames of 32 ms (page.clock.fastForward fires exactly one requestAnimationFrame): a ~31 fps phone.
 // 32 ms is not above the game's own 3D fallback threshold (render.fallbackFrameMs 32), so no configuration is touched.
 let frameCount=0;const frames=async ms=>{while(ms>0){const d=Math.min(32,ms);await page.clock.fastForward(d);frameCount++;ms-=d;}};
 const T0=Date.now(),progress=(...a)=>console.log(`[${name} ${Math.round((Date.now()-T0)/1000)}s]`,...a);
 const save=()=>writeFile(DIR+`qa-fire-run-${name}.json`,JSON.stringify({...rec,partial:true,frameCount},null,1)+'\n').catch(()=>{});
 const measure=()=>page.evaluate(measureInPage),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
 const box=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height};};
 const taps=[];rec.taps=taps;
 const tap=async(x,y,ms=80,id=7)=>{const hit=await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.id?'#'+e.id:'')+'.'+String(e.className||e.tagName).split(' ').join('.'):null;},[x,y]);taps.push({x:Math.round(x),y:Math.round(y),ms,hit});await touch('touchStart',id,x,y);await frames(ms);await touch('touchEnd',id,x,y);await frames(32);return hit;};
 const shot=async(label,crop=true)=>{const file=`qa-fire-${name}-${label}.jpg`;await page.screenshot({path:DIR+file,type:'jpeg',quality:80});rec.shots.push(file);
  if(crop){try{const m=await measure();const sx=m?.truckScreen?.x,sy=m?.truckScreen?.y;if(Number.isFinite(sx)&&Number.isFinite(sy)){const W=260,H=180,x=Math.max(0,Math.min(844-W,Math.round(sx-W/2))),y=Math.max(0,Math.min(390-H,Math.round(sy-H/2)));const cf=`qa-fire-${name}-${label}-zoom.jpg`;execFileSync('convert',[DIR+file,'-crop',`${W}x${H}+${x}+${y}`,'+repage','-filter','Lanczos','-resize','300%','-quality','88',DIR+cf]);rec.shots.push(cf);}}catch(e){rec.cropError=String(e);}}
  return file;};
 const exit=async()=>{await page.locator('[data-action=game-pause]').tap();await tick(32);await page.locator('[data-action=game-exit]').tap();await waitForGameNavigation(page);};
 try{
  await page.clock.install();await page.goto(server.url+'?dev=1'+spec.query,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));
  await page.locator('[data-action=avatar-start]').tap();await tick(32);
  // island fixture (not the behaviour under test): a fire station unlocks the game; no events or economy ticks interfere
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['fireStation']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}});
  rec.saveBefore=await page.evaluate(saveShapeInPage);
  const stage=spec.stage||1;
  // fixture: a later stage opens only after the earlier ones are won (the shell refuses with "קודם מנצחים בשלב הקודם"); mark them won
  if(stage>1)await page.evaluate(s=>{const p=window.__island.engine.state.minigameProgress.fireRescue;p.stage=Math.max(p.stage,s);p.stars.fill(1,0,s-1);},stage);
  await page.evaluate(s=>window.__island.games.start('fireRescue',undefined,s),stage);await tick(32);
  if(await page.locator('[data-action=game-understood]').count()){rec.help=await page.evaluate(()=>[...document.querySelectorAll('.game-help-lines p')].map(p=>p.textContent));await shot('help',false);await page.locator('[data-action=game-understood]').tap();}
  await waitForGameStart(page);await waitForGameNavigation(page);
  for(let i=0;i<400;i++){const s=await snap();if(s?.renderMetrics?.truck?.loaded)break;await frames(64);}progress('truck loaded');
  const s0=await snap();rec.truckMetrics=s0.renderMetrics.truck;rec.renderMode=s0.renderMode;rec.flags=await page.evaluate(()=>location.search);
  const stick=await box('#joystick');rec.stick=stick;
  const stickDown=async()=>touch('touchStart',1,stick.x,stick.y),stickTo=async(dx,dy)=>touch('touchMove',1,stick.x+dx,stick.y+dy),stickUp=async()=>touch('touchEnd',1,stick.x,stick.y);
  const samples=[];rec.samples=samples;const indicatorHits=[];rec.indicatorsUnderGauge=indicatorHits;
  // The left 48% x lower 82% of the screen is the joystick zone (fire-v9): a tap there moves the stick instead of selecting a target.
  const inStickZone=p=>p.x<844*.48&&p.y>390*.18;
  /** Drive along the street grid to (tx,tz) with the joystick, stopping at each junction to turn, as a careful child would. */
  const GRID=[-18,-6,6,18],nearRoad=v=>GRID.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
  async function driveTo(tx,tz,phase){
   const legAxis=async(axis,goal)=>{ // axis 'x' moves along a horizontal street, 'z' along a vertical one
    for(let k=0;k<6;k++){let m=await measure();const pos=()=>axis==='x'?m.truck.x:m.truck.z,rem=()=>goal-pos();if(Math.abs(rem())<1)break;
     const sign=Math.sign(rem()),full=Math.abs(rem())>4,dx=axis==='x'?sign*(full?70:30):0,dy=axis==='z'?sign*(full?70:30):0;
     await touch('touchStart',1,stick.x,stick.y);await touch('touchMove',1,stick.x+dx,stick.y+dy);
     for(let g=0;g<80;g++){await frames(64);m=await sample(phase);const v=Math.hypot(m.truck.vx,m.truck.vz);if(Math.abs(rem())<=Math.max(.6,v*v/90+.3)||Math.sign(rem())!==sign)break;}
     await touch('touchEnd',1,stick.x,stick.y);for(let g=0;g<30;g++){await frames(64);m=await sample(phase);if(Math.hypot(m.truck.vx,m.truck.vz)<.3)break;}}
   };
   for(let leg=0;leg<6;leg++){
    const m=await measure(),x=m.truck.x,z=m.truck.z;if(Math.hypot(tx-x,tz-z)<1.5)return true;
    const onVertical=Math.abs(x-nearRoad(x))<1.6,onHorizontal=Math.abs(z-nearRoad(z))<1.6,targetVertical=Math.abs(tx-nearRoad(tx))<.5,targetHorizontal=Math.abs(tz-nearRoad(tz))<.5;
    if(onHorizontal&&targetHorizontal&&Math.abs(nearRoad(z)-tz)<.5){await legAxis('x',tx);continue;}
    if(onVertical&&targetVertical&&Math.abs(nearRoad(x)-tx)<.5){await legAxis('z',tz);continue;}
    if(onHorizontal&&targetVertical){await legAxis('x',nearRoad(tx));continue;}
    if(onVertical&&targetHorizontal){await legAxis('z',nearRoad(tz));continue;}
    if(onHorizontal){await legAxis('x',nearRoad(x));continue;}
    await legAxis('z',nearRoad(z));
   }
   const m=await measure();return Math.hypot(tx-m.truck.x,tz-m.truck.z)<1.5;
  }

  let gaugeBox=null;{const g=await page.evaluate(gaugeInPage);gaugeBox=g?.box||null;}
  const sample=async phase=>{const m=await measure();if(!m)return null;const row={phase,...m};samples.push(row);
   if(gaugeBox)for(const i of m.indicators){if(i.x+i.size>gaugeBox.x&&i.x-i.size<gaugeBox.x+gaugeBox.w&&i.y+i.size>gaugeBox.y&&i.y-i.size<gaugeBox.y+gaugeBox.h)indicatorHits.push({time:m.time,phase,...i});}
   return row;};
  rec.domStart=await page.evaluate(domInPage);rec.gaugeStart=await page.evaluate(gaugeInPage);await shot('start');
  if(spec.scenario==='drive')await driveScenario();else if(spec.scenario==='turns')await turnsScenario();else await rescueScenario();
  rec.domEnd=await page.evaluate(domInPage);
  await exit();await tick(200);
  rec.saveAfter=await page.evaluate(saveShapeInPage);

  async function driveScenario(){
   // ---- 1/2: driving along the streets with the joystick: up, turn right at the junction, down, left, then a push across a block -------
   try{const views=await page.evaluate(modelViewsInPage);if(views)for(const [k,v]of Object.entries(views)){const f=`qa-fire-${name}-model-${k}.png`;await writeFile(DIR+f,Buffer.from(v.split(',')[1],'base64'));rec.shots.push(f);}}catch(e){rec.modelViewError=String(e);}
   // a child turns while the truck is inside the junction (the crossing street's band, centre +-3.1)
   const legs=[{phase:'up',dx:0,dy:-70,until:m=>m.truck.z<=7.6,max:3200},{phase:'right',dx:70,dy:0,until:m=>m.truck.x>=16.4,max:3800},{phase:'down',dx:0,dy:70,until:m=>m.truck.z>=16.4,max:3800},{phase:'left',dx:-70,dy:0,until:m=>m.truck.x<=0,max:3800},{phase:'acrossBlock',dx:0,dy:-70,until:()=>false,max:1600}];
   await stickDown();
   for(const leg of legs){await stickTo(leg.dx,leg.dy);let shotTaken=false;
    for(let t=0;t<leg.max;t+=128){await frames(128);const m=await sample(leg.phase);if(!shotTaken&&m&&Math.hypot(m.truck.vx,m.truck.vz)>12&&t>=500){await shot('drive-'+leg.phase);shotTaken=true;}if(m&&leg.until(m))break;}
    if(!shotTaken)await shot('drive-'+leg.phase);progress('leg',leg.phase,'done');await save();}
   await stickUp();for(let i=0;i<5;i++){await frames(96);await sample('stop');}
   // ---- 1/5/6: tap a burning building on the map, the truck drives there; hold spray (roof ladder must stay down; gauge follows the tank) ----
   let s=await snap();const fires=s.flames.map((f,i)=>({i,f,p:s.flameScreens[i]})).filter(o=>o.f.active&&o.f.heat>0&&o.p.x>40&&o.p.x<600&&o.p.y>80&&o.p.y<300);
   rec.fireTapped=fires[0]?{index:fires[0].i,screen:fires[0].p}:null;
   if(fires[0]){await tap(fires[0].p.x,fires[0].p.y);for(let i=0;i<120;i++){await frames(192);const m=await sample('toFire');if(m&&!m.navigation.active&&!m.truck.driving&&i>2)break;}}progress('at fire');await save();
   const audioSeries=async label=>{const out=[];for(let i=0;i<12;i++){await frames(64);out.push(...await page.evaluate(audioLevelInPage));}const max=k=>Math.max(...out.map(x=>x[k]));const med=k=>{const v=out.map(x=>x[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};return {label,n:out.length,medianRmsDb:round(med('rmsDb'),1),maxRmsDb:round(max('rmsDb'),1),medianCentroidHz:Math.round(med('centroidHz')),medianPhoneBandShare:round(med('phoneBandShare'),3),state:out[0]?.state};};
   rec.audioIdle=await audioSeries('fire burning, not spraying');rec.audioIdleLoops=(await snap()).audio;
   const spray=await box('#shoot');rec.sprayButton=spray;
   const gaugeTrack=[];rec.gaugeTrack=gaugeTrack;
   const gaugeSample=async phase=>{const g=await page.evaluate(gaugeInPage),m=await sample(phase);if(m)gaugeTrack.push({phase,time:m.time,water:m.water,maxWater:m.maxWater,model:Math.round(100*m.water/m.maxWater),gauge:g?g.percent:null,level:g?.level??null,text:g?.text??null,spraying:m.spraying,refilling:m.refilling});return {g,m};};
   await touch('touchStart',2,spray.x,spray.y);
   for(let i=0;i<20;i++){await frames(160);const {m}=await gaugeSample('spray');if(i===6){rec.audioSpray=await audioSeries('spraying');rec.audioSprayLoops=(await snap()).audio;rec.domSpray=await page.evaluate(domInPage);await shot('spray');}}
   await touch('touchEnd',2,spray.x,spray.y);
   // keep spraying in bursts (as a child does when the pressure runs out) until the tank is nearly empty
   progress('sprayed');await save();
   for(let burst=0;burst<10;burst++){const last=gaugeTrack.at(-1);if(last&&last.model<=12)break;for(let i=0;i<6;i++){await frames(192);await gaugeSample('pause');}
    const sp=await snap();if(!sp.flames.some(f=>f.active&&f.heat>0)){rec.allFiresOut=true;}
    await touch('touchStart',2,spray.x,spray.y);for(let i=0;i<16;i++){await frames(160);const {g}=await gaugeSample('spray');if(g&&g.level==='low'&&!rec.shotLow){rec.shotLow=await shot('water-low');}if(g&&g.level==='critical'&&!rec.shotCritical){rec.shotCritical=await shot('water-critical');rec.gaugeCritical=g;}}
    await touch('touchEnd',2,spray.x,spray.y);progress('burst',burst,gaugeTrack.at(-1)?.model);}
   await save();rec.gaugeAfterSpray=await page.evaluate(gaugeInPage);if(!rec.shotCritical)rec.shotEmpty=await shot('water-end');
   // ---- 5: tap the hydrant marker (water drop) on the map; the truck drives to it and refills; the gauge turns green and rises ----
   s=await snap();const hydrants=await page.evaluate(()=>{const g=window.__island.games.current.session,v=g.debug.view,b=window.__island.data.config.minigames.fireRescue;return b.city.hydrants.map(h=>v.projectWorld([h[0],h[1]+b.hydrant.height+1.2,h[2]]));});
   const ind=s.indicators.find(i=>i.kind==='hydrant'),onScreen=hydrants.find(p=>p&&p.x>40&&p.x<600&&p.y>90&&p.y<300);rec.hydrantTap=onScreen?{screen:onScreen}:ind?{indicator:{x:ind.x,y:ind.y}}:null;
   const hp=onScreen||ind;
   if(hp){rec.hydrantTap.inStickZone=inStickZone(hp);rec.hydrantTap.hit=await tap(hp.x,hp.y);for(let i=0;i<6;i++){await frames(96);await gaugeSample('hydrantTap');}rec.hydrantTap.navigationAfterTap=(await measure()).navigation;}
   if(hp&&!(await measure()).navigation.active){ // the tap did not start a drive: drive to the nearest hydrant with the joystick
    const hs=await page.evaluate(()=>window.__island.data.config.minigames.fireRescue.city.hydrants),m0=await measure(),h=hs.slice().sort((a,b)=>Math.hypot(a[0]-m0.truck.x,a[2]-m0.truck.z)-Math.hypot(b[0]-m0.truck.x,b[2]-m0.truck.z))[0];
    const gx=Math.abs(h[0]-nearRoad(h[0]))<Math.abs(h[2]-nearRoad(h[2]))?nearRoad(h[0]):h[0],gz=gx===h[0]?nearRoad(h[2]):h[2];rec.hydrantDrive={hydrant:h,goal:[gx,gz],ok:await driveTo(gx,gz,'driveToHydrant')};progress('drove to hydrant',JSON.stringify(rec.hydrantDrive));}
   if(hp){for(let i=0;i<150;i++){await frames(192);const {m}=await gaugeSample('toHydrant');if(m&&m.refilling&&!rec.shotRefill){for(let k=0;k<6;k++){await frames(160);await gaugeSample('refill');}rec.shotRefill=await shot('refill');rec.gaugeRefill=await page.evaluate(gaugeInPage);}if(m&&m.water>=m.maxWater-0.5&&rec.shotRefill)break;if(m&&!m.navigation.active&&!m.truck.driving&&!m.atHydrant&&i>8){rec.hydrantNotReached=true;break;}}}
   rec.gaugeEnd=await page.evaluate(gaugeInPage);progress('refill done');await save();
  }

  async function turnsScenario(){
   // ---- 2: turning at a junction. At full speed the stick is pushed sideways at a given distance before the junction centre
   //      (negative = already past it), toward the city centre; where does the truck actually turn?
   const trials=[4,2,0,-1.5,1,0,3,-1],roads=[-18,-6,6,18],turns=[];rec.turns=turns;
   await stickDown();await stickTo(0,-70);for(let i=0;i<5;i++){await frames(128);await sample('turns-accel');}
   for(const d of trials){
    let m=await measure();const vx=m.truck.vx,vz=m.truck.vz,alongX=Math.abs(vx)>Math.abs(vz),sign=Math.sign(alongX?vx:vz)||-1;
    const pos=alongX?m.truck.x:m.truck.z,perpPos=alongX?m.truck.z:m.truck.x;
    const ahead=roads.filter(c=>(c-pos)*sign>Math.max(d,0)+1.2).sort((a,b)=>(a-pos)*sign-(b-pos)*sign)[0];if(ahead===undefined){rec.turnsStopped='edge of the city';break;}
    const toward=perpPos>0?-1:1,push=alongX?{dx:0,dy:toward*70,dir:{x:0,z:toward}}:{dx:toward*70,dy:0,dir:{x:toward,z:0}};
    const before=()=>((alongX?m.truck.x:m.truck.z)-ahead)*-sign;
    for(let g=0;g<200&&before()>d;g++){await frames(before()>8?96:32);m=await sample('turns-approach');}
    const junction=alongX?{x:ahead,z:Math.round(perpPos)}:{x:Math.round(perpPos),z:ahead},interior=Math.abs(junction.x)===6&&Math.abs(junction.z)===6;
    const trigger={d,actualBefore:round(before()),speed:round(Math.hypot(m.truck.vx,m.truck.vz),1),time:m.time,from:{x:round(m.truck.x),z:round(m.truck.z)},junction,interior,push:push.dir};
    await stickTo(push.dx,push.dy);let turnedAt=null,maxOffNewRoad=0,blockedFrames=0,shotTaken=false;
    for(let t=0;t<3600;t+=96){await frames(96);m=await sample('turns-d'+d);const v=Math.hypot(m.truck.vx,m.truck.vz);if(m.truck.blocked)blockedFrames++;
     if(!shotTaken&&t>=384){await shot(`turn-${turns.length}-d${d}`);shotTaken=true;}
     if(v>5&&!turnedAt&&(m.truck.vx*push.dir.x+m.truck.vz*push.dir.z)/v>Math.cos(Math.PI/9))turnedAt={x:round(m.truck.x),z:round(m.truck.z),time:m.time};
     if(turnedAt&&m.time-turnedAt.time>.7)break;}
    const oldAxis=turnedAt?(alongX?turnedAt.x:turnedAt.z):null,at=oldAxis===null?null:roads.reduce((a,b)=>Math.abs(b-oldAxis)<Math.abs(a-oldAxis)?b:a);
    turns.push({...trigger,turnedAt,turnedAtJunctionCoordinate:at,intended:ahead,turnedWhereIntended:at===ahead,secondsToTurn:turnedAt?round(turnedAt.time-trigger.time):null,blockedSamples:blockedFrames});
    progress('turn',JSON.stringify(turns.at(-1)));await save();
   }
   await stickUp();for(let i=0;i<4;i++){await frames(96);await sample('stop');}
  }

  async function rescueScenario(){
   const rescues=[];rec.rescues=rescues;const total=(await snap()).rescues.length;rec.rescueCount=total;
   const ladderBtn=await box('#pass'),spray=await box('#shoot');rec.ladderButton=ladderBtn;
   for(let ri=0;ri<total;ri++){
    const R={index:ri,events:[]};rescues.push(R);const ev=(what,m)=>R.events.push({what,time:m?.time??null});
    // 1. tap the person in the window (or its edge marker): the truck drives there by itself
    let s=await snap();const inView=p=>p&&p.x>=0&&p.x<=844&&p.y>=0&&p.y<=390;let point=inView(s.rescueScreens[ri])&&!s.rescues[ri].rescued?s.rescueScreens[ri]:s.indicators.find(a=>a.kind==='rescue'&&a.index===ri);
    if(!point){R.error='no rescue marker';break;}R.tapAt={x:point.x,y:point.y,marker:inView(s.rescueScreens[ri])?'person':'edge'};
    if(spec.early&&ri===0){ // a child presses the ladder before the truck is there: the latch must not open anything on its own
     await tap(ladderBtn.x,ladderBtn.y,100);for(let i=0;i<10;i++){await frames(96);const m=await sample('earlyTap');}R.early=samples.filter(x=>x.phase==='earlyTap').map(x=>({time:x.time,latch:x.latch,ext:x.ladder.extension,dev:x.roofLadder?.deviationDeg}));}
    R.tapAt.inStickZone=inStickZone(point);R.tapAt.hit=await tap(point.x,point.y);let m;
    for(let i=0;i<4;i++){await frames(96);m=await sample('afterPersonTap');}R.tapAt.navigationAfterTap=m.navigation;
    if(!m.navigation.active&&!m.rescues[ri].near){const w=m.rescues[ri].world,gx=Math.abs(w[0]-nearRoad(w[0]))<Math.abs(w[2]-nearRoad(w[2]))?nearRoad(w[0]):w[0],gz=gx===w[0]?nearRoad(w[2]):w[2];R.manualDrive={goal:[gx,gz],ok:await driveTo(gx,gz,'driveToWindow')};progress('manual drive',ri,JSON.stringify(R.manualDrive));}
    for(let i=0;i<160;i++){await frames(192);m=await sample('toWindow');if(m.rescues[ri].near&&!m.truck.driving&&!m.navigation.active)break;}progress('arrived',ri);await save();
    R.arrived={near:m.rescues[ri].near,time:m.time,distance:Math.hypot(m.truck.x-m.rescues[ri].world[0],m.truck.z-m.rescues[ri].world[2]),heat:m.flames[m.rescues[ri].fireIndex]?.heat,safe:m.rescues[ri].safe};ev('arrived',m);
    await shot(`r${ri}-arrived`);
    // 2. the fire at the window first, until its flames are gone (real spray button; the window fire is tapped first only when it is
    //    within hose reach, so the tap selects it instead of driving away)
    const fi=m.rescues[ri].fireIndex;let guard=0;
    while((await measure()).flames[fi].heat>0&&guard++<8){
     s=await snap();const fp=s.flameScreens[fi],reach=Math.hypot(s.flames[fi].x-s.nozzle.x,s.flames[fi].y-s.nozzle.y)<=s.range*.88;
     if(fp&&inView(fp)&&reach){await tap(fp.x,fp.y);R.windowFireTapped=(R.windowFireTapped||0)+1;}
     await touch('touchStart',2,spray.x,spray.y);for(let i=0;i<30;i++){await frames(160);m=await sample('clearWindow');if(m.flames[fi].heat<=0||m.rescues[ri].expired)break;}await touch('touchEnd',2,spray.x,spray.y);
     m=await measure();if(m.water<5){R.needsRefill=true;break;}if(m.flames[fi].heat>0){for(let i=0;i<6;i++){await frames(192);await sample('pressure');}}
    }
    m=await measure();R.windowCleared={safe:m.rescues[ri].safe,heat:m.flames[fi]?.heat,time:m.time,water:m.water};ev('windowCleared',m);
    if(!m.rescues[ri].safe){R.error='window fire not cleared';break;}
    progress('window cleared',ri,R.windowCleared);await save();for(let i=0;i<3;i++){await frames(96);await sample('ready');}
    // 3. the ladder button: one press of the given length, then watch the rescue without touching anything
    for(const [ti,ms] of spec.taps.entries()){
     const label=`r${ri}-tap${ms}`;const before=await measure();if(before.rescues[ri].rescued)break;
     await touch('touchStart',3,ladderBtn.x,ladderBtn.y);
     for(let held=0;held<ms;held+=50){await frames(Math.min(50,ms-held));await sample(label+'-holding');}
     await touch('touchEnd',3,ladderBtn.x,ladderBtn.y);
     if(spec.double&&ti===0){await frames(spec.double);await sample(label+'-gap');await touch('touchStart',3,ladderBtn.x,ladderBtn.y);await frames(100);await touch('touchEnd',3,ladderBtn.x,ladderBtn.y);R.secondTapAfterMs=spec.double;} // a child taps twice
     const t0=before.time;let rescued=false,wrong=false,maxDev=0,minTip=Infinity;
     for(let i=0;i<80;i++){
      // wind: a second finger pushes the stick fully the wrong way (with the wind, +X) during the last rescue
      if(spec.wrongStick&&ri===total-1&&i===3){await touch('touchStart',1,stick.x,stick.y);await touch('touchMove',1,stick.x+70,stick.y);wrong=true;}
      await frames(96);const mm=await sample(label);if(mm.roofLadder)maxDev=Math.max(maxDev,mm.roofLadder.deviationDeg);if(Number.isFinite(mm.tipToTarget))minTip=Math.min(minTip,mm.tipToTarget);
      if(i===6)await shot(label+'-mid');
      if(mm.rescues[ri].rescued){rescued=true;ev('rescued',mm);break;}
      if(i>=25&&mm.rescues[ri].progress===0&&!mm.latch)break; // nothing is happening any more
     }
     if(wrong){await touch('touchEnd',1,stick.x,stick.y);}
     const after=await measure();R['tap'+ms]={pressMs:ms,rescued,seconds:rescued?round(after.time-t0):null,maxProgress:Math.max(...samples.filter(x=>x.phase.startsWith(label)).map(x=>x.rescues[ri].progress/x.rescues[ri].seconds)),maxExtension:Math.max(...samples.filter(x=>x.phase.startsWith(label)).map(x=>x.ladder.extension)),maxLadderDeviationDeg:round(maxDev,1),minTipToTarget:Number.isFinite(minTip)?round(minTip):null,wrongStick:wrong};
     progress('press',ms,R['tap'+ms]);await save();
     if(rescued){await shot(label+'-rescued');break;}
     await shot(label+'-after');
    }
    // 4. old behaviour: hold the ladder button
    if(spec.hold&&!(await measure()).rescues[ri].rescued){
     const label=`r${ri}-hold${spec.hold}`,t0=(await measure()).time;await touch('touchStart',3,ladderBtn.x,ladderBtn.y);let rescued=false;
     for(let held=0;held<spec.hold;held+=96){await frames(96);const mm=await sample(label);if(held===600)await shot(label+'-mid');if(mm.rescues[ri].rescued){rescued=true;break;}}
     await touch('touchEnd',3,ladderBtn.x,ladderBtn.y);for(let i=0;i<10;i++){await frames(96);const mm=await sample(label+'-release');if(mm.rescues[ri].rescued)rescued=true;}
     const rows=samples.filter(x=>x.phase.startsWith(label));R['hold'+spec.hold]={rescued,seconds:rescued?round(rows.find(x=>x.rescues[ri].rescued)?.time-t0):null,maxProgress:Math.max(...rows.map(x=>x.rescues[ri].progress/x.rescues[ri].seconds)),unstableShare:round(rows.filter(x=>!x.ladder.stable).length/Math.max(1,rows.length)),maxSway:round(Math.max(...rows.map(x=>Math.abs(x.ladder.sway))))};
    }
    // 5. the person climbs down; the ladder folds back
    for(let i=0;i<45;i++){await frames(96);const mm=await sample(`r${ri}-descent`);if(i===8)await shot(`r${ri}-descent`);if(mm.rescues[ri].descent>=1&&mm.ladder.extension===0&&i>15)break;}
    for(let i=0;i<10;i++){await frames(96);await sample(`r${ri}-folded`);}
    const fin=samples.at(-1);R.folded={time:fin.time,extension:fin.ladder.extension,deviationDeg:fin.roofLadder?round(fin.roofLadder.deviationDeg,2):null,pitchDeg:fin.roofLadder?round(fin.roofLadder.pitchDeg,2):null,boxLadderVisible:fin.boxLadder?.visible??null,rescued:fin.rescues[ri].rescued};
    await shot(`r${ri}-folded`);progress('rescue',ri,'folded',R.folded);await save();
   }
   rec.domRescue=await page.evaluate(domInPage);
  }
 }catch(e){rec.error=e.stack||String(e);console.error(name,'error',e);try{await shot('error',false);}catch{}}
 finally{
  try{await csp.assertClean();rec.csp={clean:true};}catch(e){rec.csp={clean:false,error:String(e).slice(0,2000)};}
  rec.cspSnapshot=(()=>{try{const s=csp.snapshot();return {htmlResponsesSeen:s.htmlResponsesSeen,violations:s.violations.length,policyErrors:s.policyErrors.length};}catch{return null;}})();
  await context.close();try{await csp.dispose();}catch{}
 }
 rec.finishedAt=new Date().toISOString();
 await writeFile(DIR+`qa-fire-run-${name}.json`,JSON.stringify(rec,null,1)+'\n');
 return rec;
}

/** Summaries from the per-run files (numbers only; the judgement is in QA-fire.md). */
async function merge(){
 const files=(await readdir(DIR)).filter(f=>/^qa-fire-run-.*\.json$/.test(f)),runs={};
 for(const f of files){const r=JSON.parse(await readFile(DIR+f,'utf8'));runs[r.run]=r;}
 const summary=r=>{if(!r)return null;const S=r.samples||[];
  const moving=S.filter(x=>['up','right','down','left','acrossBlock'].includes(x.phase)&&x.nose&&Math.hypot(x.truck.vx,x.truck.vz)>1.5);
  const slip=x=>{const v=Math.hypot(x.truck.vx,x.truck.vz);return deg(Math.acos(Math.max(-1,Math.min(1,(x.nose[0]*x.truck.vx+x.nose[1]*x.truck.vz)/v))));};
  // distance from the truck centre to the nearest street centre line (city grid x,z in {-18,-6,6,18}, streets span -18..18; road width 6.2)
  const roads=[-18,-6,6,18],seg=(a,b)=>Math.hypot(a,Math.max(0,Math.abs(b)-18)),offRoad=x=>Math.min(...roads.map(c=>seg(x.truck.x-c,x.truck.z)).concat(roads.map(c=>seg(x.truck.z-c,x.truck.x))));
  const legs={};for(const ph of ['up','right','down','left','acrossBlock']){const rows=moving.filter(x=>x.phase===ph),fast=rows.filter(x=>Math.hypot(x.truck.vx,x.truck.vz)>12);
   legs[ph]={samples:rows.length,fastSamples:fast.length,medianSlipFast:fast.length?round(fast.map(slip).sort((a,b)=>a-b)[Math.floor(fast.length/2)],1):null,maxSlipFast:fast.length?round(Math.max(...fast.map(slip)),1):null,maxSlipAll:rows.length?round(Math.max(...rows.map(slip)),1):null,maxOffRoadCenter:rows.length?round(Math.max(...rows.map(offRoad)),2):null};}
  const drive=S.filter(x=>['up','right','down','left','acrossBlock','toFire','toHydrant','toWindow'].includes(x.phase)&&x.truck.driving);
  // open = the model's roof ladder leaves the body axis (3D angle, includes lifting relative to the body) by more than 3 degrees, or is stretched
  const rest=S.find(x=>x.roofLadder)?.roofLadder.length,isOpen=x=>x.roofLadder&&(x.roofLadder.deviationDeg>3||(rest&&x.roofLadder.length>rest*1.05));
  const ladderOpenDriving=drive.filter(isOpen).length,boxDriving=drive.filter(x=>x.boxLadder?.visible).length;
  const spray=S.filter(x=>x.spraying);const ladderOpenSpray=spray.filter(isOpen).length;
  const g=r.gaugeTrack||[];const mismatch=g.filter(x=>x.gauge!==null&&x.gauge!==x.model).length;
  return {run:r.run,query:r.query,build:r.build,kind:r.truckMetrics?.kind,renderMode:r.renderMode,error:r.error||null,errors:r.errors,outside:r.outside,csp:r.csp,
   drive:r.scenario==='drive'?{legs,drivingSamples:drive.length,roofLadderOpenWhileDriving:drive.length?round(ladderOpenDriving/drive.length,3):null,maxRoofLadderDeviationDriving:drive.length&&drive[0].roofLadder?round(Math.max(...drive.map(x=>x.roofLadder?.deviationDeg||0)),1):null,boxLadderVisibleWhileDriving:drive.length?round(boxDriving/drive.length,3):null,
    spraySamples:spray.length,roofLadderOpenWhileSpraying:spray.length?round(ladderOpenSpray/spray.length,3):null,maxRoofLadderDeviationSpraying:spray.length&&spray[0].roofLadder?round(Math.max(...spray.map(x=>x.roofLadder?.deviationDeg||0)),1):null}:null,
   gauge:r.scenario==='drive'?{start:r.gaugeStart,critical:r.gaugeCritical,refill:r.gaugeRefill,end:r.gaugeEnd,samples:g.length,mismatches:mismatch,levels:[...new Set(g.map(x=>x.level))],minModel:g.length?Math.min(...g.map(x=>x.model)):null}:null,
   dom:{start:r.domStart&&{overlaps:r.domStart.overlaps,outOfView:r.domStart.outOfView,waterWords:r.domStart.waterWords,refill:r.domStart.refill},spray:r.domSpray&&{overlaps:r.domSpray.overlaps},rescue:r.domRescue&&{overlaps:r.domRescue.overlaps}},
   indicatorsUnderGauge:(r.indicatorsUnderGauge||[]).length,audio:{idle:r.audioIdle,spray:r.audioSpray,idleLoops:r.audioIdleLoops?.loops,sprayLoops:r.audioSprayLoops?.loops,state:r.audioSprayLoops?.state},
   rescues:r.rescues?.map(x=>({index:x.index,tapAt:x.tapAt,manualDrive:x.manualDrive,arrived:x.arrived,windowCleared:x.windowCleared,early:x.early,secondTapAfterMs:x.secondTapAfterMs,tap100:x.tap100,tap500:x.tap500,hold:x.hold1600||x.hold3000,folded:x.folded,error:x.error})),
   turns:r.turns,taps:r.taps,hydrant:{tap:r.hydrantTap,drive:r.hydrantDrive,notReached:r.hydrantNotReached||false},assetLog:r.assetLog,
   save:{before:r.saveBefore&&{version:r.saveBefore.version,keys:r.saveBefore.keys,paths:r.saveBefore.paths?.length},after:r.saveAfter&&{version:r.saveAfter.version,keys:r.saveAfter.keys,paths:r.saveAfter.paths?.length,fireProgress:r.saveAfter.fireProgress}}};};
 const pick=b=>Object.fromEntries(Object.values(runs).filter(r=>r.build===b).map(r=>[r.run,summary(r)]));
 // the save written by the new build must have exactly the same shape as the one written by the old build
 const shapes={};for(const r of Object.values(runs))if(r.saveAfter?.paths)shapes[r.run]=r.saveAfter.paths;
 const ref=shapes['drive-old']||Object.values(shapes)[0];const saveDiff=Object.fromEntries(Object.entries(shapes).map(([k,p])=>[k,{onlyHere:p.filter(x=>!ref.includes(x)),missingHere:ref.filter(x=>!p.includes(x))}]));
 await writeFile(DIR+'qa-fire-after.json',JSON.stringify({build:'default (no flags)',browser:'Chromium/SwiftShader, hasTouch+isMobile, 844x390, CDP touch',physicalPhone:false,runs:pick('after'),saveShapeDiffVsDriveOld:saveDiff},null,1)+'\n');
 await writeFile(DIR+'qa-fire-before.json',JSON.stringify({build:'old behaviour via kill switches',browser:'Chromium/SwiftShader, hasTouch+isMobile, 844x390, CDP touch',physicalPhone:false,runs:pick('before')},null,1)+'\n');
 console.log('merged',Object.keys(runs));
}

const args=process.argv.slice(2);
if(args[0]==='merge'){await merge();}
else{
 const names=args.length?args:Object.keys(RUNS);
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
 try{for(const n of names){const t=Date.now();const r=await runOne(browser,server,n);console.log(n,'done in',Math.round((Date.now()-t)/1000)+'s',r.error?'ERROR '+r.error.split('\n')[0]:'ok','errors',r.errors.length);}}
 finally{await browser.close();await server.close();}
}
