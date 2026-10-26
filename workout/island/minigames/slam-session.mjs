/** Street Slam session: connects the deterministic engine, the 3D view, input,
 * sound and HUD to the island game shell. One RAF, fixed 1/60 s steps with
 * interpolation; pause/hidden freeze the simulation and the input. */
import {gameContext} from './context.mjs?v=island-citydetail-20261025-2';
import {createSlamEngine,SLAM_DT} from './slam-engine.mjs?v=island-citydetail-20261025-2';
import {createSlamControls} from './slam-controls.mjs?v=island-citydetail-20261025-2';
import {createSlamAudio} from './slam-audio.mjs?v=island-citydetail-20261025-2';
import {slamIcon} from './slam-icons.mjs?v=island-citydetail-20261025-2';
import {createFixedLoop} from './slam-loop.mjs?v=island-citydetail-20261025-2';

const fmtClock=ms=>{const s=Math.ceil(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

export function startStreetSlam(ctx){
 if(ctx.engine)ctx={...gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed>>>0,'streetSlam',ctx.level),...ctx};
 const balance=ctx.balance,t=ctx.t||(k=>k),seed=(ctx.seed>>>0)||1,stage=ctx.level||1;
 const params=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
 const storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})();
 const practiceDone=()=>{try{return storage?.getItem(balance.practiceKey)==='done';}catch{return true;}};
 const wantPractice=params.get('slamPractice')==='1'||params.get('slamPractice')!=='0'&&!practiceDone();
 const gear={equipment:ctx.equipment||{},power:ctx.power||1};
 let engine=createSlamEngine({config:balance,seed,stage,mode:wantPractice?'practice':'match',...gear});
 let view=null,controls=null,frame,last=0,paused=false,disposed=false,finished=false,prev=engine.snapshot(),cur=prev,error=null,toastUntil=0,stepsRun=0;
 const loop=createFixedLoop({dt:SLAM_DT,maxFrame:balance.simulation.maxFrameSeconds,maxSteps:balance.simulation.maxStepsPerFrame});
 const abort=new AbortController(),on={signal:abort.signal};let audio;
 try{audio=createSlamAudio({config:balance.audio,storage});}catch{audio=createSlamAudio({config:balance.audio,storage:null});}

 const session={
  setPaused(value){paused=!!value;last=0;loop.reset();controls?.setEnabled(!paused);audio.setPaused(paused);if(paused)engine.pause();else engine.resume();},
  dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();controls?.dispose();audio.dispose();view?.dispose();view=null;engine.dispose();
   try{if(document.fullscreenElement)void screen.orientation?.lock?.('landscape')?.catch(()=>{});}catch{}},
  get snapshot(){return {...engine.snapshot(),paused,disposed,stepsRun,error,mode:cur.mode,renderMetrics:view?.metrics(),audioMetrics:audio.metrics(),input:controls?.held};},
 };
 const canvas=ctx.canvas;if(!canvas)return session;
 const doc=canvas.ownerDocument,screenEl=canvas.closest('.game-screen'),stageEl=canvas.parentElement,root=ctx.controls;
 // Portrait-first like the design; the shared entry may have locked landscape.
 try{void screen.orientation?.unlock?.();}catch{}
 const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('./slam.css?v=island-citydetail-20261025-2',import.meta.url).href;screenEl.append(css);
 const node=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const labels={stick:t('slam.stick'),shoot:t('slam.shoot'),dunk:t('slam.dunk'),pass:t('slam.pass'),block:t('slam.block'),steal:t('slam.steal'),rebound:t('slam.rebound'),switch:t('slam.switch')};

 // HUD: compact board, energy, charge window, toasts. Numbers stay LTR.
 const board=node('div','slam-board'),homeScore=node('bdi','slam-score home','0'),clock=node('bdi','slam-clock','3:00'),awayScore=node('bdi','slam-score away','0'),ot=node('span','slam-ot');
 board.dir='ltr';board.setAttribute('role','status');board.append(homeScore,node('span','slam-clock-wrap'),awayScore);board.children[1].append(clock,ot);ot.hidden=true;
 const energy=node('div','slam-energy'),energyFill=node('span','slam-energy-fill');energy.append(slamIcon('dunk',doc),energyFill);energy.setAttribute('role','meter');energy.setAttribute('aria-label',t('slam.energy'));energy.setAttribute('aria-valuemin','0');energy.setAttribute('aria-valuemax','100');
 const charge=node('div','slam-charge'),chargeWin=node('span','slam-charge-window'),chargeFill=node('span','slam-charge-fill');charge.append(chargeWin,chargeFill);charge.hidden=true;charge.setAttribute('aria-hidden','true');
 const w=balance.shot;let windowKey='';
 const grade=node('div','slam-grade');grade.hidden=true;grade.setAttribute('aria-hidden','true');let gradeUntil=0;
 const heat=node('div','slam-heat');heat.hidden=true;heat.setAttribute('role','status');heat.setAttribute('aria-label',t('slam.heat'));heat.append(slamIcon('fire',doc));
 const toast=node('div','slam-toast');toast.hidden=true;toast.setAttribute('aria-live','polite');
 const loading=node('div','slam-loading');loading.setAttribute('role','status');loading.setAttribute('aria-label',t('slam.loading'));loading.append(node('span','slam-spinner'));
 const practice=node('div','slam-practice');practice.hidden=true;const skip=node('button','slam-skip');skip.type='button';skip.dataset.action='slam-skip';skip.setAttribute('aria-label',t('slam.skipPractice'));skip.title=t('slam.skipPractice');skip.append(slamIcon('skip',doc));
 const steps=node('div','slam-practice-steps');steps.setAttribute('aria-hidden','true');for(const icon of ['move','pass','shoot']){const s=node('span','slam-practice-step');s.append(slamIcon(icon,doc));steps.append(s);}practice.append(steps,skip);
 stageEl.append(board,charge,grade,toast,energy,heat,practice,loading);
 screenEl.dataset.slamMode=engine.snapshot().mode;
 controls=createSlamControls({root,doc,onEscape:()=>{const b=screenEl.querySelector('[data-action=game-pause]');if(b&&!paused)b.click();},icons:name=>slamIcon(name,doc),labels,basis:()=>view?view.screenBasis():{rx:1,rz:0,ux:0,uz:-1}});
 root.classList.add('slam-controls');controls.setEnabled(!paused);
 screenEl.addEventListener('pointerdown',()=>audio.unlock(),{...on,capture:true});doc.defaultView.addEventListener('keydown',()=>audio.unlock(),on);
 const statusEl=ctx.status;

 function startMatch(){
  try{storage?.setItem(balance.practiceKey,'done');}catch{}
  engine.dispose();engine=createSlamEngine({config:balance,seed,stage,mode:'match',...gear});prev=cur=engine.snapshot();loop.reset();screenEl.dataset.slamMode='match';practice.hidden=true;
  controls.cancel();
 }
 skip.addEventListener('click',()=>{if(cur.mode==='practice')startMatch();canvas.focus();},on);

 function insets(){
  const c=canvas.getBoundingClientRect(),b=board.getBoundingClientRect(),z=controls.elements.zone.getBoundingClientRect(),p=controls.elements.primary.getBoundingClientRect();
  const landscape=c.width>c.height*1.15;
  return {top:Math.max(40,b.bottom-c.top+8),bottom:landscape?Math.max(24,c.bottom-Math.min(z.top,p.top)-50):Math.max(60,c.bottom-Math.min(z.top,p.top)+8),side:landscape?Math.max(12,z.width*.4):10};
 }
 function fail(reason){
  if(disposed)return;error=reason;loading.hidden=false;loading.replaceChildren();loading.classList.add('failed');loading.setAttribute('role','alert');
  loading.append(node('p','slam-error-text',t('slam.unavailable')));
  const retry=node('button','slam-retry');retry.type='button';retry.dataset.action='slam-retry';retry.setAttribute('aria-label',t('slam.retry'));retry.append(slamIcon('retry',doc));
  const back=node('button','slam-back');back.type='button';back.dataset.action='slam-back';back.setAttribute('aria-label',t('slam.back'));back.append(slamIcon('back',doc));
  retry.onclick=()=>{loading.classList.remove('failed');loading.setAttribute('role','status');loading.replaceChildren(node('span','slam-spinner'));error=null;load();};back.onclick=()=>ctx.cancel();
  loading.append(retry,back);ctx.onError?.('slam.unavailable');
 }
 const dev=params.get('dev')==='1';
 function load(){
  const forceFail=dev&&params.get('slamFail')==='1';
  const viewModule=forceFail?Promise.reject(new Error('forced')):import('./slam-view.mjs?v=island-citydetail-20261025-2');
  viewModule.then(m=>m.createSlamView(canvas,balance,{insets})).then(loaded=>{
   if(disposed){loaded.dispose();return;}
   view=loaded;const r=stageEl.getBoundingClientRect();view.resize(r.width,r.height,devicePixelRatio||1);loading.hidden=true;last=0;loop.reset();
   if(frame===undefined)frame=requestAnimationFrame(tick);
  }).catch(e=>fail(String(e?.message||e)));
 }
 const ro=new ResizeObserver(()=>{if(!view)return;const r=stageEl.getBoundingClientRect();view.resize(r.width,r.height,devicePixelRatio||1);});ro.observe(stageEl);abort.signal.addEventListener('abort',()=>ro.disconnect());
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(disposed)return;view?.dispose();view=null;session.setPaused(true);fail('webgl-context-lost');},on);
 if(dev)session.debug={get engine(){return engine;},controls,get view(){return view;},startMatch,insets,
  /** Deterministic stepping for browser tests: n steps with a fixed frame. */
  step(n=1,input){for(let i=0;i<n;i++){prev=cur;engine.step(input||controls.consume());cur=engine.snapshot();handleEvents(engine.drainEvents());}}};
 load();

 function showToast(content,kind,ms=900){toast.hidden=false;toast.dataset.kind=kind;toast.replaceChildren(content);toastUntil=performance.now()+ms;}
 function handleEvents(events){
  if(!events.length)return;view?.effects(events);audio.events(events);
  for(const e of events){
   if(e.type==='shotStart'&&e.playerId===cur.controlledPlayerId&&e.grade!=='tap'){grade.hidden=false;grade.dataset.grade=e.grade;grade.replaceChildren(slamIcon(e.grade,doc));gradeUntil=performance.now()+800;}
   if(e.type==='heatUp'&&e.team==='home')showToast(slamIcon('fire',doc),'heat',1100);
   else if(e.type==='alleyOop'&&e.playerId[0]==='h')showToast(slamIcon('oop',doc),'oop',800);
   else if(e.type==='score'&&e.team==='home')showToast(e.oop?slamIcon('oop',doc):e.kind==='dunk'?slamIcon('dunk',doc):doc.createTextNode('+'+e.points),'home');
   else if(e.type==='score')showToast(doc.createTextNode('+'+e.points),'away',700);
   else if(e.type==='steal'&&e.playerId[0]==='h')showToast(slamIcon('steal',doc),'steal',700);
   else if(e.type==='block'&&e.playerId[0]==='h')showToast(slamIcon('block',doc),'block',700);
   else if(e.type==='switch')screenEl.dataset.switched=String(e.seq);
   else if(e.type==='practiceStep'){/* the next highlighted control is enough */}
   if(e.type==='score'&&statusEl)statusEl.textContent=t('slam.scoreStatus',{home:cur.score.home,away:cur.score.away});
  }
 }

 function hud(s,now){
  homeScore.textContent=String(s.score.home);awayScore.textContent=String(s.score.away);
  const c=fmtClock(s.remainingMs);if(clock.textContent!==c)clock.textContent=c;
  ot.hidden=!s.overtimes;if(s.overtimes)ot.textContent='+'+s.overtimes;
  board.dataset.buzzer=String(s.buzzer);board.setAttribute('aria-label',t('slam.board',{home:s.score.home,away:s.score.away,clock:c}));
  const me=s.players.find(p=>p.id===s.controlledPlayerId);
  controls.setActions(s.availableActions,{dunkReady:s.dunkReady});
  const e=Math.round((me?.stamina||0)*100);energyFill.style.transform=`scaleX(${(me?.stamina||0).toFixed(3)})`;energy.setAttribute('aria-valuenow',String(e));energy.dataset.ready=String((me?.stamina||0)>=s.dunkCost);
  const sw=s.shotWindow,key=sw.perfectFrom+':'+sw.perfectTo;if(key!==windowKey){windowKey=key;chargeWin.style.left=`${sw.perfectFrom/sw.maxHold*100}%`;chargeWin.style.width=`${(sw.perfectTo-sw.perfectFrom)/sw.maxHold*100}%`;}
  heat.hidden=!(me?.heat>0);screenEl.dataset.slamHeat=String(me?.heat>0);screenEl.dataset.slamGuard=String(!!s.guarding);
  if(!grade.hidden){if(now>gradeUntil)grade.hidden=true;else if(view){const p=view.actorScreen(s.controlledPlayerId,2.9);if(p)grade.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;}}
  const charging=me&&me.charge>=0;charge.hidden=!charging;
  if(charging&&view){const p=view.actorScreen(me.id,2.6);if(p){charge.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;}chargeFill.style.width=`${Math.min(1,me.charge/w.maxHold)*100}%`;charge.dataset.zone=me.charge>=sw.perfectFrom&&me.charge<=sw.perfectTo?'perfect':me.charge>sw.perfectTo?'late':'early';}
  if(!toast.hidden&&now>toastUntil)toast.hidden=true;
  if(s.mode==='practice'){practice.hidden=false;practice.dataset.step=String(s.practice?.step??0);root.dataset.practiceStep=String(s.practice?.step??0);[...steps.children].forEach((n,i)=>{n.dataset.state=i<s.practice.step?'done':i===s.practice.step?'now':'next';});}
  else {delete root.dataset.practiceStep;practice.hidden=true;}
  screenEl.dataset.slamPhase=s.phase;
 }

 function tick(now){
  frame=undefined;if(disposed)return;frame=requestAnimationFrame(tick);
  const dt=last?(now-last)/1000:0;last=now;
  if(!view)return;
  if(!paused&&!doc.hidden){
   loop.advance(dt,()=>{prev=cur;engine.step(controls.consume());cur=engine.snapshot();stepsRun++;handleEvents(engine.drainEvents());return cur.phase!=='finished';});
   view.observeFrame(dt*1000);
  }
  const alpha=paused?1:loop.alpha;
  view.render(prev,cur,alpha,paused?0:dt);hud(cur,now);
  if(cur.phase==='finished'&&!finished){
   if(cur.mode==='practice'){startMatch();return;}
   finished=true;const r=engine.result;cancelAnimationFrame(frame);frame=undefined;
   ctx.finish({outcome:r.won?'win':'lose',score:r.scoreFor,streetSlam:r});
  }
 }
 return session;
}
