/** Island Pro Basketball session: connects the 5 on 5 engine, the arena view, input, sound
 * and the icon HUD to the island game shell. One RAF, fixed 1/60 s steps with interpolation;
 * pause and hidden tabs freeze the simulation and the input. No words on the game screen. */
import {gameContext} from './context.mjs?v=island-clean-ui-20261026-1';
import {createHoopsEngine,HOOPS_DT} from './hoops-engine.mjs?v=island-clean-ui-20261026-1';
import {createHoopsControls} from './hoops-controls.mjs?v=island-clean-ui-20261026-1';
import {createHoopsAudio} from './hoops-audio.mjs?v=island-clean-ui-20261026-1';
import {hoopsIcon} from './hoops-icons.mjs?v=island-clean-ui-20261026-1';
import {createFixedLoop} from './hoops-loop.mjs?v=island-clean-ui-20261026-1';
import {createCourt} from './hoops-court.mjs?v=island-clean-ui-20261026-1';
import {matchTeams} from './hoops-franchise.mjs?v=island-clean-ui-20261026-1';

const fmtClock=s=>{s=Math.max(0,s);if(s<60)return `${Math.floor(s)}.${Math.floor((s*10)%10)}`;const m=Math.floor(s/60);return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`;};

export function startHoops(ctx){
 if(ctx.engine)ctx={...gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed>>>0,'streetSlam',ctx.level),...ctx};
 const balance=ctx.balance,t=ctx.t||(k=>k),seed=ctx.seed>>>0,stage=ctx.level||1;
 const params=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
 const storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})();
 const setup=matchTeams(balance,ctx.hoops,{stage,equipment:ctx.equipment||{},power:ctx.power||1,game:ctx.hoopsGame});
 const profile=params.get('hoopsProfile')||setup.profile||'standard';
 const engine=createHoopsEngine({config:balance,seed,teams:setup.teams,userTeam:0,profile,difficulty:setup.difficulty,assist:setup.assist,autopilot:params.get('hoopsAuto')==='1'});
 engine.setAutoSub(setup.autoSub!==false);
 let view=null,controls=null,frame,last=0,paused=false,disposed=false,finished=false,prev=engine.snapshot(),cur=prev,error=null,stepsRun=0,replayOffer=0,dribbleClock=0;
 const loop=createFixedLoop({dt:HOOPS_DT,maxFrame:balance.simulation.maxFrameSeconds,maxSteps:balance.simulation.maxStepsPerFrame});
 const abort=new AbortController(),on={signal:abort.signal};let audio;
 try{audio=createHoopsAudio({config:balance.audio,storage});}catch{audio=createHoopsAudio({config:balance.audio,storage:null});}
 const session={
  setPaused(value){paused=!!value;last=0;loop.reset();controls?.setEnabled(!paused);audio.setPaused(paused);},
  dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();controls?.dispose();audio.dispose();view?.dispose();view=null;engine.dispose();
   try{if(document.fullscreenElement)void screen.orientation?.lock?.('landscape')?.catch(()=>{});}catch{}},
  get snapshot(){return {...engine.snapshot(),paused,disposed,stepsRun,error,renderMetrics:view?.metrics(),audioMetrics:audio.metrics(),input:controls?.held,replaying:!!view?.replaying};},
 };
 const canvas=ctx.canvas;if(!canvas)return session;
 const doc=canvas.ownerDocument,screenEl=canvas.closest('.game-screen'),stageEl=canvas.parentElement,root=ctx.controls;
 try{void screen.orientation?.unlock?.();}catch{}
 const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('./hoops.css?v=island-clean-ui-20261026-1',import.meta.url).href;screenEl.append(css);
 const node=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const labels=Object.fromEntries(['stick','shoot','jump','block','pass','steal','cross','switch','sprint','timeout','call','callForBall','replay','bench'].map(k=>[k,t('hoops.'+k)]));

 // HUD: broadcast score bug — team colour, score, quarter pips, clock, shot clock (digits only)
 const looks=setup.teams.map(x=>x.look);
 const bug=node('div','hoops-bug');bug.dir='ltr';bug.setAttribute('role','status');
 const side=(i)=>{const s=node('div','hoops-team');s.style.setProperty('--team',looks[i].primary);s.style.setProperty('--team2',looks[i].secondary);const chip=node('span','hoops-chip');const sc=node('bdi','hoops-score','0');const fouls=node('span','hoops-fouls');for(let k=0;k<5;k++)fouls.append(node('i'));const poss=node('span','hoops-poss');s.append(chip,sc,fouls,poss);return {s,sc,fouls,poss};};
 const home=side(0),away=side(1);
 const mid=node('div','hoops-mid'),pips=node('span','hoops-pips');for(let k=0;k<4;k++)pips.append(node('i'));
 const clock=node('bdi','hoops-clock','0:00'),shotc=node('bdi','hoops-shotclock','24');mid.append(pips,clock,shotc);
 bug.append(home.s,mid,away.s);
 const meter=node('div','hoops-meter');meter.hidden=true;meter.setAttribute('aria-hidden','true');const meterWin=node('span','hoops-meter-win'),meterFill=node('span','hoops-meter-fill');meter.append(meterWin,meterFill);
 const grade=node('div','hoops-grade');grade.hidden=true;let gradeUntil=0;
 const toast=node('div','hoops-toast');toast.hidden=true;toast.setAttribute('aria-live','polite');let toastUntil=0;
 const replayBtn=node('button','hoops-replay');replayBtn.type='button';replayBtn.dataset.action='hoops-replay';replayBtn.setAttribute('aria-label',labels.replay);replayBtn.title=labels.replay;replayBtn.append(hoopsIcon('replay',doc));replayBtn.hidden=true;
 const benchPanel=node('div','hoops-bench');benchPanel.hidden=true;benchPanel.setAttribute('role','dialog');benchPanel.setAttribute('aria-label',labels.bench);
 const loading=node('div','hoops-loading');loading.setAttribute('role','status');loading.setAttribute('aria-label',t('hoops.loading'));const ringEl=node('span','hoops-progress');loading.append(ringEl);
 stageEl.append(bug,meter,grade,toast,replayBtn,benchPanel,loading);
 controls=createHoopsControls({root,doc,onEscape:()=>{const b=screenEl.querySelector('[data-action=game-pause]');if(b&&!paused)b.click();},icons:name=>hoopsIcon(name,doc),labels,basis:()=>view?view.screenBasis():{rx:1,rz:0,ux:0,uz:1}});
 root.classList.add('hoops-controls');controls.setEnabled(!paused);
 screenEl.addEventListener('pointerdown',()=>audio.unlock(),{...on,capture:true});doc.defaultView.addEventListener('keydown',()=>audio.unlock(),on);
 const statusEl=ctx.status;

 function fail(reason){
  if(disposed)return;error=reason;loading.hidden=false;loading.replaceChildren();loading.classList.add('failed');loading.setAttribute('role','alert');
  // icons only on the game screen: the reason is read out by screen readers, not printed
  loading.setAttribute('aria-label',t('hoops.unavailable'));loading.append(hoopsIcon('warning',doc));
  const retry=node('button','hoops-retry');retry.type='button';retry.dataset.action='hoops-retry';retry.setAttribute('aria-label',t('hoops.retry'));retry.append(hoopsIcon('retry',doc));
  const back=node('button','hoops-back');back.type='button';back.dataset.action='hoops-back';back.setAttribute('aria-label',t('hoops.back'));back.append(hoopsIcon('back',doc));
  retry.onclick=()=>{loading.classList.remove('failed');loading.setAttribute('role','status');loading.setAttribute('aria-label',t('hoops.loading'));loading.replaceChildren(ringEl);error=null;load();};back.onclick=()=>ctx.cancel();
  loading.append(retry,back);ctx.onError?.('hoops.unavailable');
 }
 const dev=params.get('dev')==='1';
 function load(){
  const forceFail=dev&&params.get('hoopsFail')==='1';
  const court=createCourt(balance.court);
  const assetBase=new URL('../',import.meta.url);
  const quality=Number(params.get('hoopsQuality')||setup.quality||2);
  const viewModule=forceFail?Promise.reject(new Error('forced')):import('./hoops-view.mjs?v=island-clean-ui-20261026-1');
  viewModule.then(m=>m.createHoopsView(canvas,{...balance,view:{...balance.view,preserve:dev}},{court,teams:setup.teams,quality,assetBase,onProgress:p=>ringEl.style.setProperty('--p',String(p))})).then(loaded=>{
   if(disposed){loaded.dispose();return;}
   view=loaded;const r=stageEl.getBoundingClientRect();view.resize(r.width,r.height,devicePixelRatio||1);loading.hidden=true;last=0;loop.reset();
   if(frame===undefined)frame=requestAnimationFrame(tick);
  }).catch(e=>fail(String(e?.message||e)));
 }
 const ro=new ResizeObserver(()=>{if(!view)return;const r=stageEl.getBoundingClientRect();view.resize(r.width,r.height,devicePixelRatio||1);});ro.observe(stageEl);abort.signal.addEventListener('abort',()=>ro.disconnect());
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(disposed)return;view?.dispose();view=null;session.setPaused(true);fail('webgl-context-lost');},on);
 replayBtn.addEventListener('click',()=>{if(!view||view.replaying)return;const frames=engine.replay();replayBtn.hidden=true;controls.setEnabled(false);view.startReplay(frames,()=>{controls.setEnabled(!paused);last=0;loop.reset();});},on);
 if(dev)session.debug={engine,controls,get view(){return view;},
  step(n=1,input){for(let i=0;i<n;i++){prev=cur;engine.step(input||controls.consume());cur=engine.snapshot();handleEvents(engine.drainEvents());}if(view){if(n>1)view.snapCamera();view.render(prev,cur,1,1/60);}hud(cur,performance.now());return cur;},
  render(){if(view){view.render(prev,cur,1,1/60);hud(cur,performance.now());}}};
 load();

 function showToast(content,kind,ms=900){toast.hidden=false;toast.dataset.kind=kind;toast.replaceChildren(content);toastUntil=performance.now()+ms;}
 function handleEvents(events){
  if(!events.length)return;view?.effects(events);audio.events(events);
  for(const e of events){
   if(e.type==='timing'&&e.playerId===cur.controlled){const g=e.quality>0.8?'perfect':e.early?'early':'late';grade.hidden=false;grade.dataset.grade=g;grade.replaceChildren(hoopsIcon(g,doc));gradeUntil=performance.now()+800;}
   if(e.type==='score'){if(statusEl)statusEl.textContent=t('hoops.scoreStatus',{home:e.score[0],away:e.score[1]});replayOffer=performance.now()+4500;showToast(doc.createTextNode('+'+e.points),e.team===0?'home':'away',900);}
   if(e.type==='foul'||e.type==='violation'){showToast(hoopsIcon('whistle',doc),'whistle',900);}
   if(e.type==='block'&&cur.players.find(p=>p.id===e.playerId)?.team===0)showToast(hoopsIcon('block',doc),'home',700);
   if((e.type==='steal'||e.type==='interception')&&cur.players.find(p=>p.id===e.playerId)?.team===0)showToast(hoopsIcon('steal',doc),'home',700);
   if(e.type==='timeout'&&e.team===0)openBench();
  }
 }

 function openBench(){
  benchPanel.hidden=false;benchPanel.replaceChildren();
  const roster=engine.roster(0);let pick=null;
  const row=(list,cls)=>{const r=node('div','hoops-bench-row '+cls);for(const p of list){const b=node('button','hoops-card');b.type='button';b.dataset.id=p.id;b.setAttribute('aria-label',t('hoops.playerCard',{number:p.number,name:p.name}));
   const num=node('bdi','hoops-card-num',String(p.number)),bar=node('span','hoops-card-energy');bar.style.setProperty('--e',String(p.energy));const fouls=node('span','hoops-card-fouls');for(let k=0;k<p.fouls;k++)fouls.append(node('i'));
   b.append(num,bar,fouls);b.onclick=()=>{if(!pick){pick=p;b.classList.add('picked');return;}const a=pick.onCourt?pick:p,c=pick.onCourt?p:pick;pick=null;if(a.onCourt&&!c.onCourt){engine.substitute(0,a.id,c.id);}openBench();};r.append(b);}return r;};
  benchPanel.append(row(roster.filter(p=>p.onCourt),'court'),row(roster.filter(p=>!p.onCourt),'bench'));
  const close=node('button','hoops-bench-close');close.type='button';close.setAttribute('aria-label',t('hoops.close'));close.append(hoopsIcon('back',doc));close.onclick=()=>{benchPanel.hidden=true;};benchPanel.append(close);
 }

 function hud(s,now){
  home.sc.textContent=String(s.score[0]);away.sc.textContent=String(s.score[1]);
  [...home.fouls.children].forEach((n,i)=>n.classList.toggle('on',i<s.teamFouls[0]));[...away.fouls.children].forEach((n,i)=>n.classList.toggle('on',i<s.teamFouls[1]));
  home.poss.classList.toggle('on',s.possession===0);away.poss.classList.toggle('on',s.possession===1);
  [...pips.children].forEach((n,i)=>n.classList.toggle('on',i<Math.min(4,s.quarter)));pips.dataset.ot=String(s.overtime);
  const c=fmtClock(s.clock);if(clock.textContent!==c)clock.textContent=c;
  const sc=String(Math.ceil(s.shotClock));if(shotc.textContent!==sc)shotc.textContent=sc;shotc.dataset.low=String(s.shotClock<=5);shotc.hidden=!s.shotClockOn&&s.phase==='live';
  bug.setAttribute('aria-label',t('hoops.board',{home:s.score[0],away:s.score[1],clock:c,quarter:s.quarter}));
  const me=s.players.find(p=>p.id===s.controlled);
  const mode=me?.hasBall?'ball':s.possession===0&&s.ball.state!=='loose'?'offense':'defense';
  controls.setMode(mode,{call:s.call[0],defense:engine.debug.state.teams[0].tactics.defense});
  // shot meter above the shooter while the button is held
  const shooting=me&&me.act==='shoot'&&me.hasBall;
  meter.hidden=!shooting;
  if(shooting&&view){
   const rel=balance.anim[me.shotType==='dunk'?'layup':me.shotType==='ft'?'freethrow':me.shotType]?.release||0.8,w=balance.shot.window,max=rel+w*1.2;
   const p=view.project(me.x,2.5,me.z);meter.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;
   meterWin.style.bottom=`${Math.max(0,(rel-w*0.35)/max*100)}%`;meterWin.style.height=`${w*0.7/max*100}%`;meterFill.style.height=`${Math.min(1,me.actT/max)*100}%`;
  }
  if(!grade.hidden&&now>gradeUntil)grade.hidden=true;
  if(!toast.hidden&&now>toastUntil)toast.hidden=true;
  replayBtn.hidden=!(now<replayOffer&&!view?.replaying);
  if(s.phase!=='timeout'&&!benchPanel.hidden&&s.phase==='live')benchPanel.hidden=true;
  screenEl.dataset.hoopsPhase=s.phase;
 }

 function tick(now){
  frame=undefined;if(disposed)return;frame=requestAnimationFrame(tick);
  const dt=last?(now-last)/1000:0;last=now;
  if(!view)return;
  if(session.debug?.hold)return; // dev only: keeps the last frame for a screenshot
  if(!paused&&!doc.hidden&&!view.replaying){
   loop.advance(dt,()=>{prev=cur;engine.step(controls.consume());cur=engine.snapshot();stepsRun++;handleEvents(engine.drainEvents());return cur.phase!=='final';});
  }
  const holder=cur.players.find(p=>p.hasBall);
  if(holder&&cur.phase==='live'&&!paused){dribbleClock+=dt;const per=balance.view.dribblePeriod;if(dribbleClock>per){dribbleClock=0;audio.dribble(Math.hypot(holder.vx,holder.vz));}}
  const alpha=paused?1:loop.alpha;
  view.render(prev,cur,alpha,paused?0:dt);hud(cur,now);
  if(cur.phase==='final'&&!finished){
   finished=true;const r=engine.result;cancelAnimationFrame(frame);frame=undefined;
   const sc=r.score,won=sc[0]>sc[1];
   const box=r.box[0].map(p=>({id:p.id,pts:p.pts,reb:p.reb,ast:p.ast,stl:p.stl,blk:p.blk,sec:p.sec,fgm:p.fgm,fga:p.fga,tpm:p.tpm,tpa:p.tpa,ftm:p.ftm,fta:p.fta,pf:p.pf,tov:p.tov}));
   const prof=balance.rules.profiles[profile],gameSeconds=4*prof.quarterSeconds+r.overtime*prof.overtimeSeconds;
   ctx.finish({outcome:won?'win':'lose',score:sc[0],streetSlam:{won,scoreFor:sc[0],scoreAgainst:sc[1],quarters:r.quarters,overtime:r.overtime,profile,stage,seed,gameSeconds,gameId:ctx.hoopsGame?.id??null,opponent:setup.teams[1].id,box,mvp:r.mvp}});
  }
 }
 return session;
}
