import {actionIcon} from './soccer-icons.mjs?v=g3f-20261018-2';
import {createSoccer} from './soccer.mjs?v=g3f-20261018-2';
import {createSoccerDrill} from './soccer-drill.mjs?v=g3f-20261018-2';
import {createSoccerView} from './soccer-view.mjs?v=g3f-20261018-2';
import {createControls} from './controls.mjs?v=g3f-20261018-2';
import {soccerViewConfig} from '../activity/soccer-team.mjs?v=g3f-20261018-2';
import {gameContext} from './context.mjs?v=g3f-20261018-2';

/** Uses the island's modal/result lifecycle; owns only this round's renderer and input. */
export function startSoccer(ctx) {
  const {balance,canvas,controls,status,t}=ctx;
  const defaults=gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed??0,'soccer',ctx.level);
  const context={...defaults,...ctx},seed=context.seed>>>0,viewConfig=soccerViewConfig(context,balance),{team,opponent}=viewConfig;
  const model=(context.drill?createSoccerDrill:createSoccer)({config:balance,kind:context.drill,stage:context.level,seed,random:context.random,team,difficulty:context.difficulty,card:context.soccerCard,role:context.role});
  let view,input,frame,last=0,hud=0,eventId=0,paused=false,disposed=false,handed=balance.controls.rightHanded,hudSignature='',mode='',started=false;
  const events=new AbortController(),options={signal:events.signal};
  function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);events.abort();input?.dispose();model.clearInput();view?.dispose();if(canvas)canvas.width=canvas.height=0;}
  function setPaused(value){paused=Boolean(value);last=0;input?.setEnabled(!paused&&(typeof document==='undefined'||!document.hidden));model.clearInput();if(!paused)canvas?.focus();}
  const session={dispose,setPaused,get snapshot(){return {...model.snapshot(),team,opponent,paused,disposed,renderMetrics:view?.metrics()};}};
  if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('dev')==='1')session.debug={model,qualitySample:(...args)=>view?.qualitySample(...args),poseCamera:(...args)=>view?.poseCamera(...args)};
  // Engine tests can exercise a full model round without DOM/WebGL.
  if(!canvas)return session;
  const element=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text)node.textContent=text;return node;};
  try {
    const stick=element('div','soccer-joystick');stick.id='joystick';stick.setAttribute('aria-label',t('minigame.soccer.joystick'));stick.setAttribute('role','group');
    const zone=element('div','soccer-stick-zone');zone.setAttribute('aria-label',t('minigame.soccer.joystick'));zone.append(stick);
    const knob=element('span','soccer-knob');knob.id='knob';stick.append(knob);
    const actions=element('div','soccer-actions'),shoot=element('button','primary-button',t('minigame.soccer.shoot'));
    shoot.id='shoot';shoot.type='button';shoot.dataset.gameControl='shoot';
    const pass=element('button','secondary-button'),sprint=element('button','secondary-button soccer-sprint',t('soccer.sprint'));
    pass.id='pass';sprint.id='sprint';pass.type=sprint.type='button';pass.dataset.gameControl='pass';sprint.dataset.gameControl='sprint';sprint.setAttribute('aria-label',t('soccer.sprint'));
    const meter=element('span','soccer-energy-fill');meter.setAttribute('role','meter');meter.setAttribute('aria-label',t('soccer.energy'));meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');const energy=element('div','soccer-energy');energy.append(meter);controls.append(energy);
    actions.append(shoot,pass,sprint);controls.classList.add('soccer-controls');controls.append(zone,actions);
    try{const saved=localStorage.getItem(balance.controls.handednessKey);if(saved!==null)handed=saved==='right';}catch{}
    const roster=element('div','soccer-scoreboard'),home=element('span','soccer-team-name',t(team.nameId).slice(0,balance.view.teamAbbreviationLength)),away=element('span','soccer-team-name',t(opponent.nameId).slice(0,balance.view.teamAbbreviationLength)),score=element('bdi','soccer-score'),clock=element('bdi','soccer-clock');
    roster.setAttribute('aria-label',t('soccer.scoreboard'));
    for(const [badge,identity]of [[home,team],[away,opponent]]){badge.style.borderColor=identity.colors[0];badge.style.backgroundColor=identity.colors[1];}
    roster.append(home,score,away,clock);status.after(roster);status.classList.add('soccer-live-status');canvas.classList.add('soccer-canvas');
    input=createControls({root:controls,config:balance.controls,onCancel:()=>model.clearInput(),autoAim:action=>{const s=model.getState(),p=s.players[s.controlled],target=s.practiceTarget||(s.restart?.type==='corner'?{x:s.attackDir*balance.pitch.length/2-s.attackDir*balance.pitch.penaltyDepth/2,z:0}:null)||(action==='pass'?s.players.filter(q=>q.team===p.team&&q.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]:null);return {x:(target?.x??s.attackDir*balance.pitch.length/2)-p.x,z:(target?.z??0)-p.z};}});input.setHanded(handed);input.setEnabled(true);
    document.addEventListener('visibilitychange',()=>{last=0;input.setEnabled(!document.hidden&&!paused);model.clearInput();},options);
    window.addEventListener('pagehide',()=>ctx.cancel(),options);
    const banner=element('div','soccer-goal-banner',t('soccer.goal'));banner.hidden=true;banner.setAttribute('role','status');canvas.after(banner);
    const phaseBanner=element('div','soccer-phase-banner');phaseBanner.hidden=true;phaseBanner.setAttribute('role','status');canvas.after(phaseBanner);
    const edge=element('span','soccer-edge-arrow','➤');edge.hidden=true;edge.setAttribute('aria-hidden','true');canvas.after(edge);
    view=createSoccerView({canvas,config:viewConfig,onEdge:point=>{edge.hidden=!point;if(point){edge.style.left=`${point.x}px`;edge.style.top=`${point.y}px`;edge.style.transform=`translate(-50%,-50%) rotate(${point.angle}rad)`;}},onContextLost:()=>{if(!disposed){ctx.onError?.('minigame.soccer.webglError');ctx.cancel();}}});
    function updateHud(){
      const s=model.getState(),signature=JSON.stringify([s.score,s.half]);
      if(signature!==hudSignature){hudSignature=signature;status.textContent=t('soccer.liveScore',{team:t(team.nameId),opponent:t(opponent.nameId),goalsFor:s.score[0],goalsAgainst:s.score[1],half:s.half});}
      score.textContent=`${s.score[0]} : ${s.score[1]}`;
      const seconds=Math.max(0,Math.ceil(balance.match.halfSeconds-s.halfElapsed));clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      const percent=Math.round(s.sprint.value/s.sprint.capacity*100);meter.setAttribute('aria-valuenow',String(percent));meter.style.height=`${percent}%`;sprint.dataset.exhausted=String(s.sprint.locked);
      if(mode!==s.mode){
        mode=s.mode;controls.dataset.mode=mode;
        const shotLabel=t(context.role==='keeper'?'soccer.keeperDive':mode==='defense'?'soccer.slide':'minigame.soccer.shoot'),passLabel=t(mode==='defense'&&context.role!=='keeper'?'soccer.steal':'soccer.pass');
        shoot.replaceChildren(actionIcon(mode==='defense'?'slide':'shoot'),element('span','',shotLabel));pass.replaceChildren(actionIcon(mode==='defense'?'steal':'pass'),element('span','',passLabel));
        shoot.setAttribute('aria-label',shotLabel);pass.setAttribute('aria-label',passLabel);
      }


    }
    function tick(at){
      if(disposed)return;
      const dt=last?Math.min((at-last)/1000,balance.rules.maxUpdateSeconds):0,frameMs=last?at-last:0;last=at;
      if(!paused&&!document.hidden){if(!started){started=true;ctx.sound?.('soccerWhistle');}model.update(dt,input.sample(model.getState().attackDir));view.render(model.getState(),dt,frameMs);hud+=dt;}else view.render(model.getState(),0);
      banner.hidden=model.getState().phase!=='goal';
      const s=model.getState();
      const phaseText=s.drill?t('soccer.drill.live',{drill:t('soccer.drill.'+s.drill.kind),attempt:s.drill.attempts+1,total:balance.training.drillAttempts,hits:s.drill.hits}):s.phase.startsWith('restart')?`${{throwIn:'🙌',corner:'🚩',goalKick:'🥅'}[s.restart.type]} ${t('minigame.soccer.restart.'+s.restart.type)}`:s.phase==='halftime'?t('minigame.soccer.halftime'):'';
      phaseBanner.hidden=!phaseText;if(phaseBanner.textContent!==phaseText)phaseBanner.textContent=phaseText;
      if(s.eventId!==eventId){eventId=s.eventId;const sound={post:'hit',restart:'soccerWhistle',header:'soccerKick',volley:'soccerKick',loft:'soccerPass',shot:'soccerKick',pass:'soccerPass',slide:'soccerSlide',goal:'soccerCrowd',halftime:'soccerWhistle',fulltime:'soccerWhistle',play:'soccerWhistle'}[s.event?.type];if(sound)ctx.sound?.(sound);}
      if(hud>=.1||!last){hud=0;updateHud();}
      if(model.result){ctx.finish(context.drill?{drill:model.result}:{outcome:model.result.won?'win':'lose',score:model.result.goalsFor,performance:model.result.won?1:0,soccer:model.result});return;}
      frame=requestAnimationFrame(tick);
    }
    updateHud();frame=requestAnimationFrame(tick);queueMicrotask(()=>{if(!disposed)canvas.focus();});
    return session;
  } catch(error){dispose();throw error;}
}
