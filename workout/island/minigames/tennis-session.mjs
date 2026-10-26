import {createTennisAudio} from './g4e-audio.mjs?v=island-clean-ui-20261026-1';
import {gameContext} from './context.mjs?v=island-clean-ui-20261026-1';
import {createTennis} from './tennis.mjs?v=island-clean-ui-20261026-1';
import {createTennisView,createTennisFallback} from './tennis-view.mjs?v=island-clean-ui-20261026-1';
import {createTennisControls,applyTennisSample} from './tennis-controls.mjs?v=island-clean-ui-20261026-1';
import {tennisIcon,tennisScoreCells,tennisEventFeedback,tennisLiveFeedback} from './tennis-ui.mjs?v=island-clean-ui-20261026-1';
export function tennisOpponent(balance,stage,shirt=balance.render.shirtColor){const opponent=balance.opponents[(stage-1)%balance.opponents.length];return {...opponent,shirtColor:opponent.shirtColor===shirt?balance.opponents.find(o=>o.shirtColor!==shirt).shirtColor:opponent.shirtColor};}
export function startTennis(ctx){
 ctx={...gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed>>>0,'tennis',ctx.level),...ctx};
 const {balance,canvas,controls,status,t}=ctx,opponent=tennisOpponent(balance,ctx.level,ctx.state.avatar.shirtColor),viewConfig={...balance,render:{...balance.render,shirtColor:ctx.state.avatar.shirtColor},opponentShirtColor:opponent.shirtColor},model=createTennis({config:balance,stage:ctx.level,seed:ctx.seed>>>0,ranks:ctx.equipment,difficulty:ctx.difficulty});
 let view,frame,last=0,paused=false,disposed=false,eventId=0,feedbackEvent=-1,feedbackLeft=0,transientFeedback=null;const abort=new AbortController();let input;const audio=createTennisAudio({config:balance.audio,storage:globalThis.localStorage});
 const cancel=()=>{model.update(0,{cancelCharge:true});};
 function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();input?.dispose();audio.dispose();view?.dispose();}
 const session={dispose,setPaused(value){paused=Boolean(value);audio.setPaused(paused);last=0;input?.setEnabled(!paused);cancel();},get snapshot(){return {...model.snapshot(),opponent,paused,renderMetrics:view?.metrics(),audioMetrics:audio.metrics()};}};
 if(!canvas)return session;
 const screen=canvas.closest('.game-screen'),style=document.createElement('link'),css=new URL('./tennis.css',import.meta.url),version=new URL(import.meta.url).searchParams.get('v');if(version)css.searchParams.set('v',version);style.rel='stylesheet';style.href=css;screen.append(style);
 const powerStyle=document.createElement('link');powerStyle.rel='stylesheet';powerStyle.href=new URL('./g4f-tennis.css?v=island-clean-ui-20261026-1',import.meta.url);screen.append(powerStyle);
 screen.addEventListener('pointerdown',()=>audio.unlock(),{capture:true,signal:abort.signal});
 const node=(tag,cls)=>{const n=document.createElement(tag);n.className=cls||'';return n;};
 const zone=node('div','soccer-stick-zone'),stick=node('div','soccer-joystick'),knob=node('span','soccer-knob'),home=node('div','tennis-stick-home');
 stick.id='joystick';knob.id='knob';stick.append(knob);home.setAttribute('aria-hidden','true');home.innerHTML='<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="15" fill="#ffffff88"/><path d="M40 7V19M34 13 40 7 46 13M40 61V73M34 67 40 73 46 67M7 40H19M13 34 7 40 13 46M61 40H73M67 34 73 40 67 46"/></svg>';
 zone.append(home,stick);zone.setAttribute('aria-label',t('tennis.joystick'));const actions=node('div','soccer-actions');
 for(const [id,key]of [['shoot','hit'],['pass','serve'],['sprint','lob'],['drop','drop']]){const b=node('button','secondary-button'),caption=node('span','tennis-control-caption');b.id=id;b.type='button';b.dataset.gameControl=key;b.setAttribute('aria-label',t('tennis.'+key));caption.textContent=t('tennis.'+key);caption.setAttribute('aria-hidden','true');b.append(tennisIcon(key),caption);actions.append(b);}
 const serveIcon=actions.querySelector('#pass svg');serveIcon.classList.add('tennis-serve-hint');
 controls.classList.add('soccer-controls');controls.append(zone,actions);status.classList.add('soccer-live-status');
 const board=node('div','soccer-scoreboard tennis-board'),cells=[];
 for(let i=0;i<2;i++){const dot=node('span','tennis-player-dot'),games=node('bdi','tennis-games'),points=node('bdi','tennis-points');dot.style.setProperty('--shirt',i?opponent.shirtColor:viewConfig.render.shirtColor);board.append(dot,games,points);cells.push({dot,games,points});}
 status.after(board);
 const feedback=node('aside','tennis-feedback'),stageLabel=node('span','tennis-stage-label'),feedbackText=node('strong','tennis-feedback-text'),feedbackDetail=node('span','tennis-feedback-detail');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
 const stageData=balance.levels[ctx.level-1],stageTitle=stageData?.titleId?t(stageData.titleId):stageData?.feature;
 stageLabel.textContent=t('tennis.feedback.stage',{stage:ctx.level,total:balance.levels.length})+(stageTitle?' · '+stageTitle:'');feedback.append(stageLabel,feedbackText,feedbackDetail);screen.append(feedback);
 const meter=node('div','tennis-serve-meter'),needle=node('span','tennis-serve-needle'),perfectBand=node('span','tennis-perfect-band');meter.setAttribute('aria-label',t('tennis.accuracy'));meter.append(perfectBand,needle);canvas.after(meter);
 perfectBand.style.height=`${balance.serve.perfectWidth*100}%`;perfectBand.style.bottom=`${(1-balance.serve.perfectWidth)*50}%`;
 const powerMeter=node('div','tennis-power-meter'),powerFill=node('span','tennis-power-fill');powerMeter.setAttribute('role','meter');powerMeter.setAttribute('aria-label',t('tennis.power'));powerMeter.setAttribute('aria-valuemin','0');powerMeter.setAttribute('aria-valuemax','100');powerMeter.style.setProperty('--safe',`${balance.shotPower.safeMax[ctx.difficulty]*100}%`);powerMeter.append(powerFill);canvas.after(powerMeter);
 input=createTennisControls({root:controls,config:balance.controls,onCancel:cancel,onGesture:()=>audio.unlock()});let right=balance.controls.rightHanded;try{const v=localStorage.getItem(balance.controls.handednessKey);if(v!==null)right=v==='right';}catch{}input.setHanded(right);input.setEnabled(!paused);
 if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,fallback,inspectCamera:(...args)=>view?.inspectCamera?.(...args),qualitySample:(...args)=>view?.observeFrame(...args)};
 function fallback(){if(disposed||view?.metrics().mode==='canvas')return;view?.dispose();view=createTennisFallback(canvas,viewConfig);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();},{signal:abort.signal});
 createTennisView(canvas,viewConfig).then(loaded=>{if(disposed){loaded.dispose();return;}view=loaded;last=0;frame=requestAnimationFrame(tick);}).catch(()=>{if(!disposed){fallback();last=0;frame=requestAnimationFrame(tick);}});
 function tick(at){if(disposed)return;const dt=last?Math.min((at-last)/1000,balance.simulation.maxDelta):0,frameMs=last?at-last:0;last=at;
  if(!paused&&!document.hidden){applyTennisSample(model,input.sample(),dt);
   view.observeFrame(frameMs);if(view.metrics().quality>=balance.render.fallbackQuality)fallback();
  }
  audio.sync();view.render(model.getState(),paused?0:dt);
  const s=model.getState(),ready=s.server===0&&['serve','toss'].includes(s.phase);meter.hidden=s.phase!=='toss';meter.dataset.zone=s.serveZone;
  controls.dataset.tennisPhase=s.phase;
  const incoming=s.phase==='rally'&&s.contact?.side===0,near=incoming&&(s.contactWindow?.eligible??(s.contact.eta>=-s.timingWindow/2&&s.contact.eta<=s.timingWindow/2));
  controls.querySelector('#shoot').classList.toggle('hit-ready',Boolean(near));
  feedbackLeft=Math.max(0,feedbackLeft-(paused?0:dt));
  if(s.event.id!==feedbackEvent){feedbackEvent=s.event.id;const next=tennisEventFeedback(s);if(next){transientFeedback=next;feedbackLeft=next.mode==='hit'?.7:1.15;}else if(s.event.type==='ready'){transientFeedback=null;feedbackLeft=0;}}
  const message=feedbackLeft>0&&transientFeedback?transientFeedback:tennisLiveFeedback(s),copy=message.mode==='serve'&&s.server===0?t('tennis.serve'):t('tennis.feedback.'+message.key);
  feedback.dataset.mode=message.mode;if(feedbackText.textContent!==copy)feedbackText.textContent=copy;
  const detail=message.mode==='serve'&&s.server===0?t('tennis.feedback.serve'):'';feedbackDetail.hidden=!detail;if(feedbackDetail.textContent!==detail)feedbackDetail.textContent=detail;
  powerMeter.hidden=s.phase!=='rally'||s.charge<=0;powerMeter.dataset.over=String(s.charge>balance.shotPower.safeMax[ctx.difficulty]);powerMeter.setAttribute('aria-valuenow',String(Math.round(s.charge*100)));powerFill.style.height=`${s.charge*100}%`;
  const projected=view.playerScreenPosition?.(s);if(projected){powerMeter.style.left=`${canvas.offsetLeft+projected.x+22}px`;powerMeter.style.top=`${canvas.offsetTop+projected.y-65}px`;}
  const green=balance.serve.green[ctx.difficulty]+(s.ranks.serve-1)*balance.serve.rankGreenBonus,low=(.5-green/2)*100,high=(.5+green/2)*100,yellow=balance.serve.yellowWidth*50;
  meter.style.background=`linear-gradient(to top,#f06960 0% ${low-yellow}%,#efc355 ${low-yellow}% ${low}%,#67d398 ${low}% ${high}%,#efc355 ${high}% ${high+yellow}%,#f06960 ${high+yellow}%)`;needle.style.bottom=`${s.serveMeter*100}%`;
  controls.querySelector('#pass').classList.toggle('serve-ready',ready);const points=tennisScoreCells(s.score,balance.rules);
  cells.forEach((row,i)=>{row.dot.dataset.serving=String(s.server===i);row.games.textContent=s.score.games[i];row.points.textContent=points[i];});
  const label=t('tennis.score',{home:s.score.games[0],away:s.score.games[1]})+'; '+s.pointLabels.map(v=>typeof v==='string'&&v?t('tennis.'+v):v).join(' : ');board.setAttribute('aria-label',label);status.textContent=label;
  if(s.event.id!==eventId){eventId=s.event.id;if(s.event.type==='hit')audio.play('hit');else if(s.event.type==='bounce'||s.event.reason==='doubleBounce')audio.play('bounce');else if(s.event.reason==='net'||s.event.impact==='net')audio.play('net');if(['point','game','complete'].includes(s.event.type))audio.play('applause');}
  if(model.result){ctx.finish({outcome:model.result.won?'win':'lose',score:model.result.gamesFor,tennis:model.result});return;}frame=requestAnimationFrame(tick);
 }
 return session;
}
