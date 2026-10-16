import {createSoccer} from './soccer.mjs?v=g3b-20261016-1';
import {createSoccerView} from './soccer-view.mjs?v=g3b-20261016-1';
import {createControls} from './controls.mjs?v=g3b-20261016-1';
import {soccerTeam} from '../activity/soccer-team.mjs?v=g3b-20261016-1';
import {gameContext} from './context.mjs?v=g3b-20261016-1';

/** Uses the island's modal/result lifecycle; owns only this round's renderer and input. */
export function startSoccer(ctx) {
  const {balance,canvas,controls,status,t}=ctx;
  const defaults=gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed??0,'soccer',ctx.level);
  const context={...defaults,...ctx},seed=context.seed>>>0,team=soccerTeam(context,balance);
  const opponent=balance.opponents[(context.level-1)%balance.opponents.length];
  const model=createSoccer({config:balance,stage:context.level,seed,random:context.random,team});
  let view,input,frame,last=0,hud=0,eventId=0,paused=false,disposed=false,handed=balance.controls.rightHanded;
  const events=new AbortController(),options={signal:events.signal};
  function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);events.abort();input?.dispose();model.clearInput();view?.dispose();if(canvas)canvas.width=canvas.height=0;}
  function setPaused(value){paused=Boolean(value);last=0;input?.setEnabled(!paused&&(typeof document==='undefined'||!document.hidden));model.clearInput();if(!paused)canvas?.focus();}
  const session={dispose,setPaused,get snapshot(){return {...model.snapshot(),team,opponent,paused,disposed,renderMetrics:view?.metrics()};}};
  if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('dev')==='1')session.debug={model};
  // Engine tests can exercise a full model round without DOM/WebGL.
  if(!canvas)return session;
  const element=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text)node.textContent=text;return node;};
  try {
    const stick=element('div','soccer-joystick');stick.id='joystick';stick.setAttribute('aria-label',t('minigame.soccer.joystick'));stick.setAttribute('role','group');
    const knob=element('span','soccer-knob');knob.id='knob';stick.append(knob);
    const actions=element('div','soccer-actions'),shoot=element('button','primary-button',t('minigame.soccer.shoot')),swap=element('button','secondary-button',t('minigame.soccer.switch'));
    shoot.id='shoot';swap.id='switch';shoot.type=swap.type='button';shoot.dataset.gameControl='shoot';swap.dataset.gameControl='switch';
    const hand=element('button','secondary-button',t('minigame.soccer.hand'));hand.type='button';hand.dataset.action='soccer-hand';hand.setAttribute('aria-pressed',String(!handed));
    const pause=element('button','secondary-button',t('minigame.soccer.pause'));pause.type='button';pause.dataset.action='soccer-pause';
    const power=element('progress','soccer-power');power.max=balance.physics.chargeSeconds;power.value=0;power.setAttribute('aria-label',t('minigame.soccer.charging'));
    actions.append(power,shoot,swap);controls.classList.add('soccer-controls');controls.append(stick,actions,hand,pause);
    const roster=element('div','soccer-roster'),home=element('span','soccer-team-name',t(team.nameId)),away=element('span','soccer-team-name',t(opponent.nameId));
    for(const [badge,identity]of [[home,team],[away,opponent]]){badge.style.borderColor=identity.colors[0];badge.style.backgroundColor=identity.colors[1];}
    roster.append(home,away,element('span','soccer-player-names',t('minigame.soccer.roster',{players:team.players.map(p=>t(p.nameId)).join(' · ')})));
    status.after(roster);canvas.classList.add('soccer-canvas');
    input=createControls({root:controls,config:balance.controls,onCancel:()=>model.clearInput()});input.setHanded(handed);input.setEnabled(true);
    hand.addEventListener('click',()=>{handed=!handed;input.setHanded(handed);hand.setAttribute('aria-pressed',String(!handed));canvas.focus();},options);
    pause.addEventListener('click',()=>{setPaused(!paused);pause.textContent=t(paused?'minigame.soccer.resume':'minigame.soccer.pause');canvas.focus();},options);
    document.addEventListener('visibilitychange',()=>{last=0;input.setEnabled(!document.hidden&&!paused);model.clearInput();},options);
    window.addEventListener('pagehide',()=>ctx.cancel(),options);
    view=createSoccerView({canvas,config:{...balance,team,opponent},onContextLost:()=>{if(!disposed){ctx.onError?.('minigame.soccer.webglError');ctx.cancel();}}});
    function updateHud(){
      const s=model.getState();status.textContent=t('minigame.soccer.scoreboard',{team:t(team.nameId),opponent:t(opponent.nameId),goalsFor:s.score[0],goalsAgainst:s.score[1],half:t(s.half===1?'minigame.soccer.half1':'minigame.soccer.half2'),seconds:Math.max(0,Math.ceil(balance.match.halfSeconds-s.halfElapsed))});power.value=s.charge;
    }
    function tick(at){
      if(disposed)return;
      const dt=last?Math.min((at-last)/1000,balance.rules.maxUpdateSeconds):0,frameMs=last?at-last:0;last=at;
      if(!paused&&!document.hidden){model.update(dt,input.sample(model.getState().attackDir));view.render(model.getState(),dt,frameMs);hud+=dt;}
      const s=model.getState();
      if(s.eventId!==eventId){eventId=s.eventId;if(s.event?.type==='goal')ctx.sound?.('win');}
      if(hud>=.1||!last){hud=0;updateHud();}
      if(model.result){ctx.finish({outcome:model.result.won?'win':'lose',score:model.result.goalsFor,performance:model.result.won?1:0,soccer:model.result});return;}
      frame=requestAnimationFrame(tick);
    }
    updateHud();frame=requestAnimationFrame(tick);queueMicrotask(()=>{if(!disposed)canvas.focus();});
    return session;
  } catch(error){dispose();throw error;}
}
