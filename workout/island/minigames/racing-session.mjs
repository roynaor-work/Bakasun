import {createRacing} from './racing-physics.mjs?v=island-alpine-20261028-1';
import {createRacingView} from './racing-view.mjs?v=island-alpine-20261028-1';
import {createRacingControls} from './racing-controls.mjs?v=island-alpine-20261028-1';
import {createRacingAudio} from './racing-audio.mjs?v=island-alpine-20261028-1';
import {createRacingSpeedometer} from './racing-speedometer.mjs?v=island-alpine-20261028-1';

export function runRacingSession(ctx){
 const model=createRacing({stage:ctx.level||1,seed:ctx.seed,difficulty:typeof ctx.difficulty==='string'?ctx.difficulty:'easy',config:{equipment:ctx.equipment}});
 const {canvas,controls,status,t}=ctx;let frame,view,input,last=0,paused=false,disposed=false,finished=false,messageUntil=0,toastText='',renderError=null;
 const abort=new AbortController();let audio;try{audio=createRacingAudio();}catch{audio=createRacingAudio({storage:null});}
 const session={setPaused(value){paused=!!value;last=0;input?.setEnabled(!paused);audio.setPaused(paused);if(paused)model.pause();else model.resume();},dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();input?.dispose();audio.dispose();view?.dispose();model.dispose();},get snapshot(){return {stage:model.state.stage,phase:model.state.phase,time:model.state.time,paused,disposed,player:{...model.state.player},cars:model.state.cars.map(c=>({...c})),result:model.state.result,renderMetrics:view?.metrics(),audioMetrics:audio.metrics(),error:renderError};}};
 if(!canvas)return session;
 const screen=canvas.closest('.game-screen'),stage=canvas.parentElement,css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./racing.css?v=island-alpine-20261028-1',import.meta.url).href;screen.append(css);
 const node=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 const hud=node('div','racing-hud'),rank=node('bdi','racing-rank','3'),of=node('small','racing-of','/ 5'),lap=node('span','racing-lap'),clock=node('bdi','racing-clock','0:00'),trackName=node('strong','racing-track',model.track.name);rank.append(of);const position=node('div','racing-position');position.append(rank,node('span','racing-position-label','מקום'));const info=node('div','racing-race-info');info.append(trackName,lap,clock);hud.append(position,info);stage.append(hud);
 lap.style.direction='rtl';
 const mini=node('canvas','racing-minimap');mini.width=180;mini.height=120;mini.setAttribute('aria-label','מפת המסלול');stage.append(mini);const mc=mini.getContext('2d');
 const speedometer=createRacingSpeedometer({parent:stage,document:canvas.ownerDocument});
 const energy=node('div','racing-energy'),energyFill=node('span','racing-energy-fill');energy.setAttribute('role','meter');energy.setAttribute('aria-label',t('racing.energy'));energy.setAttribute('aria-valuemin','0');energy.setAttribute('aria-valuemax','100');energy.append(energyFill);stage.append(energy);
 const drift=node('div','racing-drift-meter'),driftFill=node('span','racing-drift-fill');drift.append(driftFill);stage.append(drift);
 const countdown=node('div','racing-countdown'),toast=node('div','racing-toast'),hint=node('p','racing-hint','היגוי משמאל · החזיקו דריפט בפנייה ושחררו לבוסט · ניטרו מימין');stage.append(countdown,toast,hint);
 const loading=node('div','racing-loading','מכינים את מסלול המרוץ…');stage.append(loading);
 const credit=node('a','racing-credit','קרדיט לדגם');credit.href=new URL('../assets/racing/credits.html',import.meta.url).href;credit.target='_blank';credit.rel='noopener';credit.setAttribute('aria-label','קרדיט ורישיון דגם המכונית');controls.append(credit);
 input=createRacingControls({root:controls,canvas,t});input.setEnabled(!paused);
 screen.addEventListener('pointerdown',()=>audio.unlock(),{capture:true,signal:abort.signal});canvas.addEventListener('keydown',()=>audio.unlock(),{signal:abort.signal});
 canvas.addEventListener('webglcontextlost',e=>{if(disposed)return;e.preventDefault();renderError='webgl-context-lost';session.setPaused(true);loading.hidden=false;loading.textContent='התצוגה נעצרה. חזרו לאי ונסו שוב.';const back=node('button','secondary-button','חזרה לאי');back.onclick=()=>ctx.cancel();loading.append(back);stage.append(loading);},{signal:abort.signal});
 const dev=new URLSearchParams(location.search).get('dev')==='1';if(dev)session.debug={model,input,qualitySample:ms=>view?.observeFrame(ms),render:()=>view?.render(model.state,0)};
 createRacingView(canvas,model.track,{stage:model.stage,seed:ctx.seed}).then(loaded=>{if(disposed||renderError==='webgl-context-lost'){loaded.dispose();return;}view=loaded;loading.remove();last=0;frame=requestAnimationFrame(tick);}).catch(error=>{if(disposed)return;renderError=String(error?.message||error);loading.textContent='לא ניתן להפעיל תלת־ממד במכשיר כרגע.';const back=node('button','secondary-button','חזרה לאי');back.onclick=()=>ctx.cancel();loading.append(back);ctx.onError?.('racing.unavailable');});
 const bounds=model.track.points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 function mapPoint(p){const k=Math.min(152/(bounds.maxX-bounds.minX),95/(bounds.maxZ-bounds.minZ));return [90+(p.x-(bounds.minX+bounds.maxX)/2)*k,60+(p.z-(bounds.minZ+bounds.maxZ)/2)*k];}
 function minimap(){mc.clearRect(0,0,180,120);mc.lineCap='round';mc.lineJoin='round';mc.beginPath();model.track.points.forEach((p,i)=>{const [x,y]=mapPoint(p);i?mc.lineTo(x,y):mc.moveTo(x,y);});mc.closePath();mc.strokeStyle='#0d343d9c';mc.lineWidth=9;mc.stroke();mc.strokeStyle='#fff2d390';mc.lineWidth=2;mc.stroke();for(const c of [...model.state.cars].reverse()){const [x,y]=mapPoint(c);mc.beginPath();mc.arc(x,y,c.isPlayer?5:3,0,Math.PI*2);mc.fillStyle=c.isPlayer?'#ffe29a':'#faf6df';mc.fill();if(c.isPlayer){mc.strokeStyle='#14383b';mc.lineWidth=2;mc.stroke();}}}
 function tick(at){if(disposed)return;const dt=last?Math.min(.1,(at-last)/1000):0,ms=last?at-last:0;last=at;
  if(!paused&&!document.hidden){model.step(dt,input.sample());view.observeFrame(ms);}const s=model.state,p=s.player;
  audio.sync(paused?0:p.speed,p.boosting,{drifting:p.drifting,offroad:p.offroad,steer:p.steer});view.render(s,paused?0:dt);minimap();
  rank.firstChild.textContent=String(s.rank);lap.textContent=t('racing.lap',{lap:'\u2066'+p.lap,total:s.laps+'\u2069'});clock.textContent=`${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}`;speedometer.update(p.speed);energyFill.style.transform=`scaleX(${Math.min(1,p.nitro/100)})`;energy.setAttribute('aria-valuenow',String(Math.round(p.nitro)));drift.hidden=!p.drifting;driftFill.style.transform=`scaleX(${p.driftCharge/2.7})`;
  countdown.hidden=s.phase!=='countdown';countdown.textContent=Math.ceil(s.countdown)||'';hint.hidden=s.time>4.5;screen.dataset.boosting=String(p.boosting);screen.dataset.offroad=String(p.offroad);
  for(const e of s.events){if(e.car!=='player')continue;if(e.type==='pickup'){ctx.sound?.('bonus');toastText='אנרגיית ניטרו +31';messageUntil=s.time+1.4;}else if(['driftBoost','boostPad'].includes(e.type)){ctx.sound?.('upgrade');toastText=e.type==='driftBoost'?'דריפט מעולה · בוסט!':'מסלול בוסט!';messageUntil=s.time+1.1;}else if(e.type==='recovery'){toastText=t('racing.recover');messageUntil=s.time+2;}else if(e.type==='lap'){ctx.sound?.('bonus');status.textContent=t('racing.lap',{lap:p.lap,total:s.laps});}}
  toast.hidden=!(p.offroad||s.time<messageUntil);toast.textContent=p.offroad?t('racing.offroad'):toastText;
  if(s.result&&!finished){finished=true;ctx.onRacingSummary?.(s.result);ctx.finish({outcome:s.result.won?'win':'lose',score:s.result.checkpoints===s.result.requiredCheckpoints?6-s.result.rank:0,racing:s.result});return;}frame=requestAnimationFrame(tick);
 }
 return session;
}
export const startRacing=runRacingSession;
