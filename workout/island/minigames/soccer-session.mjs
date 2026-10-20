import {createG3hAudio} from './g3h-audio.mjs?v=g9-20261020-1';
import {actionIcon} from './soccer-icons.mjs?v=g9-20261020-1';
import {createSoccer} from './soccer.mjs?v=g9-20261020-1';
import {soccerShotIcon} from './soccer-presentation.mjs?v=g9-20261020-1';
import {createSoccerDrill} from './soccer-drill.mjs?v=g9-20261020-1';
import {createSoccerView} from './soccer-view.mjs?v=g9-20261020-1';
import {createControls} from './controls.mjs?v=g9-20261020-1';
import {soccerViewConfig} from '../activity/soccer-team.mjs?v=g9-20261020-1';
import {gameContext} from './context.mjs?v=g9-20261020-1';

/** Uses the island's modal/result lifecycle; owns only this round's renderer and input. */
export function startSoccer(ctx) {
  const {balance,canvas,controls,status,t}=ctx;
  const defaults=gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed??0,'soccer',ctx.level);
  const context={...defaults,...ctx},seed=context.seed>>>0,viewConfig=soccerViewConfig(context,balance),{team,opponent}=viewConfig;
  const model=(context.drill?createSoccerDrill:createSoccer)({config:balance,kind:context.drill,stage:context.level,seed,random:context.random,team,difficulty:context.difficulty,card:context.soccerCard,role:context.role});
  let storage;try{storage=globalThis.localStorage;}catch{}
  const audio=createG3hAudio({storage});
  let view,input,frame,last=0,hud=0,paused=false,disposed=false,handed=balance.controls.rightHanded,hudSignature='',mode='',started=false,pendingSwap=false;
  const events=new AbortController(),options={signal:events.signal};
  function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);events.abort();audio.dispose({finish:Boolean(model.result&&!context.drill)});input?.dispose();model.clearInput();view?.dispose();if(canvas)canvas.width=canvas.height=0;}
  function setPaused(value){paused=Boolean(value);audio.setPaused(paused);pendingSwap=false;last=0;input?.setEnabled(!paused&&(typeof document==='undefined'||!document.hidden));model.clearInput();if(!paused)canvas?.focus();}
  const session={dispose,setPaused,get snapshot(){return {...model.snapshot(),team,opponent,paused,disposed,audio:audio.snapshot,renderMetrics:view?.metrics()};}};
  if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('dev')==='1')session.debug={model,qualitySample:(...args)=>view?.qualitySample(...args),poseCamera:(...args)=>view?.poseCamera(...args)};
  // Engine tests can exercise a full model round without DOM/WebGL.
  if(!canvas)return session;
  const styleURL=new URL('./g3h-soccer.css?v=g9-20261020-1',import.meta.url).href;
  if(!document.querySelector('link[data-soccer-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=styleURL;link.dataset.soccerStyle='';document.head.append(link);}
  if(!document.querySelector('link[data-g3j-soccer-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./g3j-soccer.css?v=g9-20261020-1',import.meta.url).href;link.dataset.g3jSoccerStyle='';document.head.append(link);}
  const element=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text)node.textContent=text;return node;};
  try {
    document.addEventListener('pointerdown',()=>void audio.unlock(),options);
    const stick=element('div','soccer-joystick');stick.id='joystick';stick.setAttribute('aria-label',t('minigame.soccer.joystick'));stick.setAttribute('role','group');
    const zone=element('div','soccer-stick-zone');zone.setAttribute('aria-label',t('minigame.soccer.joystick'));zone.append(stick);
    const knob=element('span','soccer-knob');knob.id='knob';stick.append(knob);
    const actions=element('div','soccer-actions'),shoot=element('button','primary-button',t('minigame.soccer.shoot'));
    shoot.id='shoot';shoot.type='button';shoot.dataset.gameControl='shoot';
    const pass=element('button','secondary-button'),sprint=element('button','secondary-button soccer-sprint');
    const ring=element('span','soccer-stamina-ring');ring.setAttribute('aria-hidden','true');sprint.append(actionIcon('sprint'),ring);
    pass.id='pass';sprint.id='sprint';pass.type=sprint.type='button';pass.dataset.gameControl='pass';sprint.dataset.gameControl='sprint';sprint.setAttribute('aria-label',t('soccer.sprint'));
    const meter=element('span','soccer-energy-fill');meter.setAttribute('role','meter');meter.setAttribute('aria-label',t('soccer.energy'));meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');const energy=element('div','soccer-energy');energy.append(meter);controls.append(energy);
    const swap=element('button','secondary-button soccer-swap');swap.id='soccer-switch';swap.type='button';swap.append(actionIcon('switch'));swap.setAttribute('aria-label',t('minigame.soccer.switch'));swap.addEventListener('pointerdown',event=>{event.preventDefault();if(!paused)pendingSwap=true;},options);swap.addEventListener('click',event=>{if(!event.detail&&!paused)pendingSwap=true;},options);
    actions.append(shoot,pass,sprint,swap);controls.classList.add('soccer-controls');controls.append(zone,actions);
    try{const saved=localStorage.getItem(balance.controls.handednessKey);if(saved!==null)handed=saved==='right';}catch{}
    const roster=element('div','soccer-scoreboard'),home=element('span','soccer-kit'),away=element('span','soccer-kit'),score=element('span','soccer-score'),homeScore=element('bdi'),awayScore=element('bdi'),clock=element('bdi','soccer-clock');
    roster.setAttribute('aria-label',t('soccer.scoreboard'));roster.setAttribute('role','group');
    for(const [badge,identity]of [[home,team],[away,opponent]]){badge.style.backgroundColor=identity.colors[0];badge.style.borderColor=identity.colors[1];badge.setAttribute('aria-label',t(identity.nameId));}
    score.append(homeScore,awayScore);roster.append(home,score,away,clock);status.after(roster);status.classList.add('soccer-live-status');canvas.classList.add('soccer-canvas');
    input=createControls({root:controls,config:balance.controls,onGesture:()=>void audio.unlock(),onCancel:()=>model.clearInput(),autoAim:action=>{const s=model.getState(),p=s.players[s.controlled],target=s.practiceTarget||(s.restart?.type==='corner'?{x:s.attackDir*balance.pitch.length/2-s.attackDir*balance.pitch.penaltyDepth/2,z:0}:null)||(action==='pass'?s.players.filter(q=>q.team===p.team&&q.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]:null);return {x:(target?.x??s.attackDir*balance.pitch.length/2)-p.x,z:(target?.z??0)-p.z};}});input.setHanded(handed);input.setEnabled(true);
    document.addEventListener('visibilitychange',()=>{last=0;input.setEnabled(!document.hidden&&!paused);model.clearInput();},options);
    window.addEventListener('pagehide',()=>ctx.cancel(),options);
    const banner=element('div','soccer-goal-banner','⚽');banner.hidden=true;banner.setAttribute('aria-label',t('soccer.goal'));banner.setAttribute('role','status');canvas.after(banner);
    const phaseBanner=element('div','soccer-phase-banner');phaseBanner.hidden=true;phaseBanner.setAttribute('role','status');canvas.after(phaseBanner);
    const edge=element('span','soccer-edge-arrow','➤');edge.hidden=true;edge.setAttribute('aria-hidden','true');canvas.after(edge);
    view=createSoccerView({canvas,config:viewConfig,onEdge:point=>{edge.hidden=!point;if(point){edge.style.left=`${point.x}px`;edge.style.top=`${point.y}px`;edge.style.transform=`translate(-50%,-50%) rotate(${point.angle}rad)`;}},onContextLost:()=>{if(!disposed){ctx.onError?.('minigame.soccer.webglError');ctx.cancel();}}});
    function updateHud(){
      const s=model.getState(),signature=JSON.stringify([s.score,s.half]);
      if(signature!==hudSignature){hudSignature=signature;status.textContent=t('soccer.liveScore',{team:t(team.nameId),opponent:t(opponent.nameId),goalsFor:s.score[0],goalsAgainst:s.score[1],half:s.half});}
      homeScore.textContent=String(s.score[0]);awayScore.textContent=String(s.score[1]);
      const seconds=Math.max(0,Math.floor(s.elapsed));clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      const percent=Math.round(s.sprint.value/s.sprint.capacity*100);meter.setAttribute('aria-valuenow',String(percent));ring.style.setProperty('--stamina',`${percent}%`);sprint.dataset.exhausted=String(s.sprint.locked);
      shoot.style.setProperty('--charge',`${s.charging?Math.round(s.charge/(s.chargeKind==='pass'?balance.passing.chargeSeconds:balance.physics.chargeSeconds)*100):0}%`);
      const icon=soccerShotIcon(s,balance),signatureMode=s.mode+icon;
      if(mode!==signatureMode){
        mode=signatureMode;controls.dataset.mode=s.mode;
        const shotLabel=t(icon==='header'?'soccer.header':context.role==='keeper'?'soccer.keeperDive':s.mode==='defense'?'soccer.slide':'minigame.soccer.shoot'),passLabel=t(s.mode==='defense'&&context.role!=='keeper'?'soccer.steal':'soccer.pass');
        shoot.replaceChildren(actionIcon(icon));pass.replaceChildren(actionIcon(s.mode==='defense'?'steal':'pass'));
        shoot.setAttribute('aria-label',shotLabel);pass.setAttribute('aria-label',passLabel);
      }


    }
    function tick(at){
      if(disposed)return;
      const dt=last?Math.min((at-last)/1000,balance.rules.maxUpdateSeconds):0,frameMs=last?at-last:0;last=at;
      if(!paused&&!document.hidden){if(!started){started=true;void audio.unlock();audio.play('whistle');}if(dt>0){const sample=input.sample(model.getState().attackDir);if(pendingSwap)sample.switchPlayer=true;pendingSwap=false;model.update(dt,sample);}view.render(model.getState(),dt,frameMs);hud+=dt;}else view.render(model.getState(),0);
      banner.hidden=model.getState().phase!=='goal';
      const s=model.getState();
      const phaseText=s.drill?`${s.drill.attempts+1}/${balance.training.drillAttempts} · ${s.drill.hits}`:s.phase.startsWith('restart')?{throwIn:'🙌',corner:'🚩',goalKick:'🥅'}[s.restart.type]:s.phase==='halftime'?'↔':'';
      phaseBanner.hidden=!phaseText;if(phaseBanner.textContent!==phaseText)phaseBanner.textContent=phaseText;
      audio.update(s);
      for(const event of model.drainEvents?.()||[]){audio.event(event);}
      if(hud>=.1||shoot.querySelector('svg')?.dataset.soccerIcon!==soccerShotIcon(s,balance)){hud=0;updateHud();}
      if(model.result){ctx.finish(context.drill?{drill:model.result}:{outcome:model.result.won?'win':'lose',score:model.result.goalsFor,performance:model.result.won?1:0,soccer:model.result});return;}
      frame=requestAnimationFrame(tick);
    }
    updateHud();frame=requestAnimationFrame(tick);queueMicrotask(()=>{if(!disposed)canvas.focus();});
    return session;
  } catch(error){dispose();throw error;}
}
