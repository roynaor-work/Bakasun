import {createRacing} from './racing-physics.mjs?v=island-v2-20261107-11';
import {createRacingView} from './racing-view.mjs?v=island-v2-20261107-11';
import {createRacingControls} from './racing-controls.mjs?v=island-v2-20261107-11';
import {createRacingAudio} from './racing-audio.mjs?v=island-v2-20261107-11';
import {bindAudioUnlock} from './racing-unlock.mjs?v=island-v2-20261107-11';
import {createRacingTower, towerEnabled} from './racing-tower.mjs';
import {createRacingSpeedometer} from './racing-speedometer.mjs?v=island-v2-20261107-11';
import {createBroadcast, broadcastEnabled} from './racing-broadcast.mjs?v=island-v2-20261107-11';

/** Finishing order of the whole grid and the car with the fastest lap, for the league result path only. */
export function leagueOrder(cars){
 const order=[...cars].filter(c=>c.scoring!==false).sort((a,b)=>a.rank-b.rank).map(c=>c.id);let fastest=null,best=Infinity;
 for(const c of cars)if(c.scoring!==false)for(const lap of c.lapTimes)if(lap>0&&lap<best){best=lap;fastest=c.id;}
 return {order,fastestLapId:fastest};
}

/** Grid size: ?racingField=N is the TOTAL number of cars (5..12; 5 = the old grid). Default 10; light phones (ctx.lite) 8. Returns the extra rivals beyond the five scoring cars. */
function fieldSize(lite=false){const q=new URLSearchParams(globalThis.location?.search||'').get('racingField');const total=q!==null&&q!==''?Number(q):(lite?8:10);return Math.max(0,Math.min(7,(Number.isFinite(total)?Math.round(total):10)-5));}

export function runRacingSession(ctx){
 const engineOn=new URLSearchParams(globalThis.location?.search||'').get('racingEngine')!=='0',topSoundOn=new URLSearchParams(globalThis.location?.search||'').get('racingTopSound')!=='0',samplesOn=new URLSearchParams(globalThis.location?.search||'').get('racingSamples')!=='0',soundStartOn=new URLSearchParams(globalThis.location?.search||'').get('racingSoundStart')!=='0';
 let lastRank=0;
 const model=createRacing({stage:ctx.level||1,seed:ctx.seed,difficulty:typeof ctx.difficulty==='string'?ctx.difficulty:'easy',config:{equipment:ctx.equipment,...(ctx.league?{drivers:ctx.league.drivers,stage:ctx.league.stageOverride}:{}),walls:new URLSearchParams(globalThis.location?.search||'').get('racingWalls')!=='0',feel:new URLSearchParams(globalThis.location?.search||'').get('racingFeel')!=='0',engine:engineOn,extraRivals:ctx.league?.extraRivals??fieldSize(Boolean(ctx.lite)),crash:new URLSearchParams(globalThis.location?.search||'').get('racingCrash')!=='0',shiftMap:new URLSearchParams(globalThis.location?.search||'').get('racingShiftMap')!=='0',ers:new URLSearchParams(globalThis.location?.search||'').get('racingErs')!=='0',ai:new URLSearchParams(globalThis.location?.search||'').get('racingAi')!=='0',grid:new URLSearchParams(globalThis.location?.search||'').get('racingGrid')!=='0',grind:new URLSearchParams(globalThis.location?.search||'').get('racingGrind')!=='0',topCap:new URLSearchParams(globalThis.location?.search||'').get('racingTopCap')!=='0',revShift:new URLSearchParams(globalThis.location?.search||'').get('racingRevShift')!=='0',crashFx:new URLSearchParams(globalThis.location?.search||'').get('racingCrashFx')!=='0'}});
 const {canvas,controls,status,t}=ctx;let lastInput={},frame,view,input,last=0,paused=false,disposed=false,finished=false,messageUntil=0,toastText='',renderError=null;
 const abort=new AbortController();let audio;try{audio=createRacingAudio({samples:engineOn&&samplesOn});}catch{audio=createRacingAudio({storage:null});}
 const session={get ready(){return Boolean(view)&&renderError!=='webgl-context-lost';},get loadFailed(){return renderError&&renderError!=='webgl-context-lost'?String(renderError):null;},setPaused(value){paused=!!value;last=0;input?.setEnabled(!paused);audio.setPaused(paused);if(paused)model.pause();else model.resume();},dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();input?.dispose();audio.dispose();view?.dispose();model.dispose();},get snapshot(){return {stage:model.state.stage,phase:model.state.phase,time:model.state.time,paused,disposed,player:{...model.state.player},cars:model.state.cars.map(c=>({...c})),result:model.state.result,renderMetrics:view?.metrics(),audioMetrics:audio.metrics(),error:renderError};}};
 if(!canvas)return session;
 const screen=canvas.closest('.game-screen'),stage=canvas.parentElement,css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./racing.css?v=island-v2-20261107-11',import.meta.url).href;screen.append(css);
 const node=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 const hud=node('div','racing-hud'),rank=node('bdi','racing-rank','3'),of=node('small','racing-of','/ '+model.state.cars.length),lap=node('span','racing-lap'),clock=node('bdi','racing-clock','0:00'),trackName=node('strong','racing-track',model.track.name);rank.append(of);const position=node('div','racing-position');position.append(rank,node('span','racing-position-label','מקום'));const info=node('div','racing-race-info');info.append(trackName,lap,clock);const lapInfo=node('span','racing-lapinfo');lapInfo.style.direction='rtl';info.append(lapInfo);hud.append(position,info);stage.append(hud);
 const draftBadge=node('div','racing-draft','סלפה');draftBadge.hidden=true;stage.append(draftBadge);
 const bestKey='island.racing.best.'+model.track.id;let bestLap=0;try{bestLap=Number(globalThis.localStorage?.getItem(bestKey))||0;}catch{}
 const fmt=v=>v>0?`${Math.floor(v/60)}:${(v%60).toFixed(2).padStart(5,'0')}`:'--';
 lap.style.direction='rtl';
 const mini=node('canvas','racing-minimap');mini.width=180;mini.height=120;mini.setAttribute('aria-label','מפת המסלול');stage.append(mini);const mc=mini.getContext('2d');
 const speedometer=createRacingSpeedometer({parent:stage,document:canvas.ownerDocument});
 const energy=node('div','racing-energy'),energyFill=node('span','racing-energy-fill');energy.setAttribute('role','meter');energy.setAttribute('aria-label',t('racing.energy'));energy.setAttribute('aria-valuemin','0');energy.setAttribute('aria-valuemax','100');const energyTag=node('span','racing-energy-tag','ERS');energy.append(energyFill,energyTag);stage.append(energy);
 const drift=node('div','racing-drift-meter'),driftFill=node('span','racing-drift-fill');drift.append(driftFill);stage.append(drift);
 const countdown=node('div','racing-countdown'),toast=node('div','racing-toast'),hint=node('p','racing-hint','גררו אגודל בצד שמאל להיגוי · לחצו על הגז (או הפעילו האצה אוטומטית) · החזיקו דריפט בפנייה ושחררו לבוסט · ניטרו מימין');stage.append(countdown,toast,hint);
 const loading=node('div','racing-loading','מכינים את מסלול המרוץ…');stage.append(loading);
 const credit=node('a','racing-credit','קרדיט לדגם');credit.href=new URL('../assets/racing/credits.html',import.meta.url).href;credit.target='_blank';credit.rel='noopener';credit.setAttribute('aria-label','קרדיט ורישיון דגם המכונית');controls.append(credit);
 input=createRacingControls({root:controls,canvas,t});input.setEnabled(!paused);
 if(soundStartOn)bindAudioUnlock({screen,canvas,audio,signal:abort.signal});else{screen.addEventListener('pointerdown',()=>audio.unlock(),{capture:true,signal:abort.signal});canvas.addEventListener('keydown',()=>audio.unlock(),{signal:abort.signal});}
 canvas.addEventListener('webglcontextlost',e=>{if(disposed)return;e.preventDefault();renderError='webgl-context-lost';session.setPaused(true);loading.hidden=false;loading.textContent='התצוגה נעצרה. חזרו לעיר ונסו שוב.';const back=node('button','secondary-button','חזרה לעיר');back.onclick=()=>ctx.cancel();loading.append(back);stage.append(loading);},{signal:abort.signal});
 const dev=new URLSearchParams(location.search).get('dev')==='1';if(dev)session.debug={model,input,audio,qualitySample:ms=>view?.observeFrame(ms),render:()=>view?.render(model.state,0)};
 createRacingView(canvas,model.track,{stage:model.stage,seed:ctx.seed,v7:ctx.balance?.v7,lite:Boolean(ctx.lite),cars:model.state.cars.map(c=>({id:c.id,name:c.name}))}).then(loaded=>{if(disposed||renderError==='webgl-context-lost'){loaded.dispose();return;}view=loaded;loading.remove();last=0;frame=requestAnimationFrame(tick);}).catch(error=>{if(disposed)return;renderError=String(error?.message||error);loading.textContent='לא ניתן להפעיל תלת־ממד במכשיר כרגע.';const back=node('button','secondary-button','חזרה לעיר');back.onclick=()=>ctx.cancel();loading.append(back);ctx.onError?.('racing.unavailable');});
 const bounds=model.track.points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 function mapPoint(p){const k=Math.min(152/(bounds.maxX-bounds.minX),95/(bounds.maxZ-bounds.minZ));return [90+(p.x-(bounds.minX+bounds.maxX)/2)*k,60+(p.z-(bounds.minZ+bounds.maxZ)/2)*k];}
 function minimap(){mc.clearRect(0,0,180,120);mc.lineCap='round';mc.lineJoin='round';mc.beginPath();model.track.points.forEach((p,i)=>{const [x,y]=mapPoint(p);i?mc.lineTo(x,y):mc.moveTo(x,y);});mc.closePath();mc.strokeStyle='#0d343d9c';mc.lineWidth=9;mc.stroke();mc.strokeStyle='#fff2d390';mc.lineWidth=2;mc.stroke();for(const c of [...model.state.cars].reverse()){const [x,y]=mapPoint(c);mc.beginPath();mc.arc(x,y,c.isPlayer?5:3,0,Math.PI*2);mc.fillStyle=c.isPlayer?'#ffe29a':'#faf6df';mc.fill();if(c.isPlayer){mc.strokeStyle='#14383b';mc.lineWidth=2;mc.stroke();}}}
 const podiumOn=new URLSearchParams(globalThis.location?.search||'').get('racingPodium')!=='0';
 const PODIUM_COLORS=['#d93228','#18b6bd','#d6aa3b','#566bd1','#b7c2ca','#e07b39','#7ac05a','#a05fc4','#e0c3a1','#4b6a88'];
 function showPodium(s,done){
  const ranked=[...s.cars].sort((x,y)=>x.rank-y.rank),top=ranked.slice(0,3),layout=[top[1],top[0],top[2]].filter(Boolean);
  const card=node('div','racing-podium');card.setAttribute('role','dialog');card.setAttribute('aria-label','פודיום');
  const title=node('strong','racing-podium-title',s.result.won?'ניצחון':s.player.rank<=3?'על הפודיום':'סיום המרוץ');card.append(title);
  const row=node('div','racing-podium-row');
  for(const car of layout){const place=car.rank,step=node('div','racing-podium-step place-'+place),swatch=node('i','racing-podium-car');swatch.style.background=PODIUM_COLORS[Math.max(0,s.cars.indexOf(car))%PODIUM_COLORS.length];
   const name=node('span','racing-podium-name',car.isPlayer?'אתם':car.name);if(car.isPlayer)step.classList.add('you');step.append(swatch,name,node('b','racing-podium-place',String(place)));row.append(step);}
  card.append(row,node('small','racing-podium-note',s.player.rank>3?`סיימתם במקום ${s.player.rank} מתוך ${s.cars.length}`:'לחצו להמשך'));stage.append(card);
  let closed=false;const close=()=>{if(closed||disposed)return;closed=true;clearTimeout(timer);card.remove();done();};
  const timer=setTimeout(close,4000);card.addEventListener('pointerdown',close,{signal:abort.signal});abort.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 }
 // racing-deep-m4 broadcast: start lights, race intro (holds the model until it closes), lower-third cards, full-field tower and podium. ?racingBroadcast=0 keeps the old HUD.
 const bc=broadcastEnabled()?createBroadcast({stage,model,league:Boolean(ctx.league),signal:abort.signal}):null;abort.signal.addEventListener('abort',()=>bc?.dispose(),{once:true});
 const tower=towerEnabled()?createRacingTower(stage,{broadcast:bc}):null;abort.signal.addEventListener('abort',()=>tower?.dispose(),{once:true});
 function tick(at){if(disposed)return;const dt=last?Math.min(.1,(at-last)/1000):0,ms=last?at-last:0;last=at;tower?.update(model.state,dt);
  if(!paused&&!document.hidden&&!bc?.holding()){lastInput=input.sample();model.step(dt,lastInput);view.observeFrame(ms);}const s=model.state,p=s.player;bc?.update(s,paused?0:dt,lastInput);view.setStartLamps?.(bc?.lamps(s)??0);
  if(engineOn&&!paused)audio.setOpponents?.(s.cars.slice(1).map(c=>{const dx=c.x-p.x,dz=c.z-p.z;return {rpm:c.rpm,gear:c.gear,throttle:c.speed>1?1:.3,distance:Math.hypot(dx,dz),pan:(dx*-Math.cos(p.heading)+dz*Math.sin(p.heading))/25};}));
  audio.sync(paused?0:p.speed,p.boosting,{drifting:p.drifting,offroad:p.offroad,steer:p.steer,...(engineOn?{kerb:Math.abs(p.lateral)>model.track.width/2-.8&&!p.offroad?1:0,topVar:topSoundOn,rpm:p.rpm,gear:p.gear,throttle:lastInput.brake?.1:(lastInput.autoAccelerate||lastInput.throttle)?1:0,brake:!!lastInput.brake&&!p.drifting}:{})});view.render(s,paused?0:dt);minimap();
  rank.firstChild.textContent=String(s.rank);lap.textContent=t('racing.lap',{lap:'\u2066'+p.lap,total:s.laps+'\u2069'});clock.textContent=`${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}`;speedometer.update(p.speed,engineOn?{gear:p.gear,rpm:p.rpm}:null);energyFill.style.transform=`scaleX(${Math.min(1,p.nitro/100)})`;energy.setAttribute('aria-valuenow',String(Math.round(p.nitro)));energy.dataset.charging=String(!!p.charging);const ersFull=p.nitro>=99.5;energy.dataset.full=String(ersFull);energyTag.textContent=ersFull?'ERS מלא':p.charging?'ERS ▲':'ERS';drift.hidden=!p.drifting;driftFill.style.transform=`scaleX(${p.driftCharge/2.7})`;
  if(lastRank&&s.rank<lastRank&&s.phase==='racing')audio.event?.('pass');lastRank=s.rank;
  lapInfo.textContent=p.lapTimes.length?`אחרונה ${fmt(p.lapTimes[p.lapTimes.length-1])} · שיא ${fmt(bestLap)}`:(bestLap?`שיא ${fmt(bestLap)}`:'');draftBadge.hidden=!(p.draft>.15);draftBadge.style.opacity=String(Math.min(1,.4+p.draft));countdown.hidden=Boolean(bc)||s.phase!=='countdown';countdown.textContent=Math.ceil(s.countdown)||'';hint.hidden=s.time>4.5;screen.dataset.boosting=String(p.boosting);screen.dataset.offroad=String(p.offroad);
  for(const e of s.events){if(e.car!=='player')continue;if(e.type==='crash'){audio.event?.('crash',e);view.kick?.(1);try{navigator.vibrate?.(60);}catch{}}else if(e.type==='wall'){audio.event?.('wall',e);view.kick?.(e.intensity);try{navigator.vibrate?.(Math.round(18+30*e.intensity));}catch{}}else if(e.type==='bump'){audio.event?.('bump',e);}else if(e.type==='crashRecover'){audio.event?.('crashRecover',e);}else if(e.type==='ersFull'){toastText='ERS מלא';messageUntil=s.time+1.2;try{navigator.vibrate?.(14);}catch{}}else if(e.type==='pickup'){ctx.sound?.('bonus');toastText='אנרגיית ניטרו +31';messageUntil=s.time+1.4;}else if(['driftBoost','boostPad'].includes(e.type)){ctx.sound?.('upgrade');toastText=e.type==='driftBoost'?'דריפט מעולה · בוסט!':'מסלול בוסט!';messageUntil=s.time+1.1;}else if(e.type==='recovery'){toastText=t('racing.recover');messageUntil=s.time+2;}else if(e.type==='lap'){if(e.lapTime>0&&(!bestLap||e.lapTime<bestLap)){bestLap=e.lapTime;try{globalThis.localStorage?.setItem(bestKey,String(bestLap));}catch{}toastText='הקפה מהירה ביותר '+fmt(e.lapTime);messageUntil=s.time+2;}ctx.sound?.('bonus');status.textContent=t('racing.lap',{lap:p.lap,total:s.laps});}}
  toast.hidden=!(p.offroad||s.time<messageUntil);toast.textContent=p.offroad?t('racing.offroad'):toastText;
  if(s.result&&!finished){finished=true;ctx.onRacingSummary?.(s.result);
   // racing-deep-fable (Roy, v21 phone: "finished track 2, it froze with engine noise after showing first place"): the engine falls silent at the finish,
   // and a result the engine refuses (ok:false) no longer leaves a frozen screen: a message and a way back to the city.
   audio.sync(0,false,{throttle:0});
   const done=()=>{const r=ctx.finish({outcome:s.result.won?'win':'lose',score:s.result.checkpoints===s.result.requiredCheckpoints?model.stage.opponents+2-s.result.rank:0,racing:s.result,...(ctx.league?{league:leagueOrder(s.cars)}:{})});
    if(r&&r.ok===false&&!disposed){audio.setPaused(true);loading.hidden=false;loading.textContent='המרוץ נגמר אבל התוצאה לא נשמרה. חזרו לעיר ונסו שוב.';const back=node('button','secondary-button','חזרה לעיר');back.onclick=()=>ctx.cancel();loading.append(back);stage.append(loading);}
    return r;};
   // racing-v11 podium: the top three of the finished race for 4 s (tap to skip), then the normal result. ?racingPodium=0 skips it.
   if(podiumOn){if(bc)bc.podium(s,done);else showPodium(s,done);return;}
   done();return;}frame=requestAnimationFrame(tick);
 }
 return session;
}
export const startRacing=runRacingSession;
