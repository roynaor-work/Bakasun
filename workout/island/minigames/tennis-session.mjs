import {gameContext} from './context.mjs?v=g4b-20261017-1';
import {createTennis} from './tennis.mjs?v=g4b-20261017-1';
import {createTennisView,createTennisFallback} from './tennis-view.mjs?v=g4b-20261017-1';
import {createControls} from './controls.mjs?v=g4b-20261017-1';
import {actionIcon} from './soccer-icons.mjs?v=g4b-20261017-1';
export function tennisOpponent(balance,stage,shirt=balance.render.shirtColor){const opponent=balance.opponents[(stage-1)%balance.opponents.length];return {...opponent,shirtColor:opponent.shirtColor===shirt?balance.opponents.find(o=>o.shirtColor!==shirt).shirtColor:opponent.shirtColor};}
export function startTennis(ctx){
 ctx={...gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed>>>0,'tennis',ctx.level),...ctx};
 const {balance,canvas,controls,status,t}=ctx,opponent=tennisOpponent(balance,ctx.level,ctx.state.avatar.shirtColor),viewConfig={...balance,render:{...balance.render,shirtColor:ctx.state.avatar.shirtColor},opponentShirtColor:opponent.shirtColor},model=createTennis({config:balance,stage:ctx.level,seed:ctx.seed>>>0,ranks:ctx.equipment,difficulty:ctx.difficulty});
 let view,frame,last=0,paused=false,disposed=false,serveHeld=false,eventId=0;const abort=new AbortController();let input;
 function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();input?.dispose();view?.dispose();}
 const session={dispose,setPaused(value){paused=Boolean(value);last=0;input?.setEnabled(!paused);serveHeld=false;},get snapshot(){return {...model.snapshot(),opponent,paused,renderMetrics:view?.metrics()};}};
 if(!canvas)return session;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
 const zone=node('div','soccer-stick-zone'),stick=node('div','soccer-joystick'),knob=node('span','soccer-knob');stick.id='joystick';knob.id='knob';stick.append(knob);zone.append(stick);zone.setAttribute('aria-label',t('tennis.joystick'));const actions=node('div','soccer-actions');
 for(const [id,key,icon]of [['shoot','hit','shoot'],['pass','serve','pass'],['sprint','lob','pass']]){const b=node('button','secondary-button');b.id=id;b.type='button';b.setAttribute('aria-label',t('tennis.'+key));b.append(actionIcon(icon),node('span','',t('tennis.'+key)));actions.append(b);}
 controls.classList.add('soccer-controls');controls.append(zone,actions);status.classList.add('soccer-live-status');const board=node('div','soccer-scoreboard'),games=node('bdi','soccer-score'),points=node('bdi','soccer-clock');board.setAttribute('aria-label',t('tennis.score',{home:0,away:0}));board.append(games,points);status.after(board);const banner=node('div','soccer-goal-banner',t('tennis.point'));banner.hidden=true;canvas.after(banner);
 input=createControls({root:controls,config:balance.controls});let right=balance.controls.rightHanded;try{const v=localStorage.getItem(balance.controls.handednessKey);if(v!==null)right=v==='right';}catch{}input.setHanded(right);input.setEnabled(!paused);
 if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,fallback,qualitySample:(...args)=>view?.observeFrame(...args)};
 function fallback(){if(disposed||view?.metrics().mode==='canvas')return;view?.dispose();view=createTennisFallback(canvas,viewConfig);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();},{signal:abort.signal});
 createTennisView(canvas,viewConfig).then(loaded=>{if(disposed){loaded.dispose();return;}view=loaded;last=0;frame=requestAnimationFrame(tick);}).catch(()=>{if(!disposed){fallback();last=0;frame=requestAnimationFrame(tick);}});
 function tick(at){if(disposed)return;const dt=last?Math.min((at-last)/1000,balance.simulation.maxDelta):0,frameMs=last?at-last:0;last=at;
  if(!paused&&!document.hidden){const sample=input.sample(),servePulse=serveHeld&&!sample.passHeld;serveHeld=sample.passHeld;model.update(dt,{move:sample.moveX,swing:sample.kickHeld||sample.sprintHeld||servePulse,charge:sample.passHeld,lob:sample.sprintHeld});view.observeFrame(frameMs);if(view.metrics().quality>=balance.render.fallbackQuality)fallback();}view.render(model.getState(),paused?0:dt);
  const s=model.getState();games.textContent=s.score.games.join(' : ');points.textContent=s.pointLabels.map(v=>typeof v==='string'?t('tennis.'+v):v).join(' : ');banner.hidden=!['point','game'].includes(s.phase);status.textContent=t('tennis.score',{home:s.score.games[0],away:s.score.games[1]});
  if(s.event.id!==eventId){eventId=s.event.id;if(s.event.type==='hit')ctx.sound?.('soccerKick');else if(['point','game'].includes(s.event.type))ctx.sound?.('soccerCrowd');}
  if(model.result){ctx.finish({outcome:model.result.won?'win':'lose',score:model.result.gamesFor,tennis:model.result});return;}frame=requestAnimationFrame(tick);
 }
 return session;
}
