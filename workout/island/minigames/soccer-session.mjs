import {createG3hAudio} from './g3h-audio.mjs?v=island-naval-aim-20261030-1';
import {actionIcon} from './soccer-icons.mjs?v=island-naval-aim-20261030-1';
import {createSoccer} from './soccer.mjs?v=island-naval-aim-20261030-1';
import {soccerShotIcon} from './soccer-presentation.mjs?v=island-naval-aim-20261030-1';
import {stageObjective} from './soccer-campaign.mjs?v=island-naval-aim-20261030-1';
import {createSoccerPenalties} from './soccer-penalties.mjs?v=island-naval-aim-20261030-1';
import {createSoccerDrill} from './soccer-drill.mjs?v=island-naval-aim-20261030-1';
import {createSoccerView} from './soccer-view.mjs?v=island-naval-aim-20261030-1';
import {createControls} from './controls.mjs?v=island-naval-aim-20261030-1';
import {soccerViewConfig} from '../activity/soccer-team.mjs?v=island-naval-aim-20261030-1';
import {gameContext} from './context.mjs?v=island-naval-aim-20261030-1';

/** Native focused buttons support the same hold/release contract as touch.
 * This adapter is soccer-only; the shared pointer/arrow controls stay separate. */
export function createSoccerButtonInput({buttons,enabled=()=>true,onGesture=()=>{},onCancel=()=>{},signal}){
  const states=Object.entries(buttons).map(([action,node])=>({action,node,key:null,pulse:false})),options={signal};
  function reset(){let changed=false;for(const state of states){changed=changed||state.key!==null||state.pulse;state.key=null;state.pulse=false;state.node.classList.remove('held');}if(changed)onCancel();}
  for(const state of states){
    const {node}=state;
    node.addEventListener('keydown',event=>{
      if(!['Space','Enter'].includes(event.code)||!enabled())return;
      event.preventDefault();
      if(event.repeat||state.key!==null)return;
      state.key=event.code;state.pulse=true;node.classList.add('held');onGesture();
    },options);
    node.addEventListener('keyup',event=>{
      if(event.code!==state.key)return;
      event.preventDefault();state.key=null;node.classList.remove('held');
    },options);
    node.addEventListener('click',event=>{
      // Pointer input already belongs to createControls. A detail-zero click is
      // native keyboard/assistive activation, without inventing pointer events.
      if(event.detail!==0||event.pointerType||!enabled()||state.key!==null)return;
      state.pulse=true;onGesture();
    },options);
    node.addEventListener('blur',()=>{if(state.key!==null||state.pulse)reset();},options);
  }
  const doc=states[0]?.node.ownerDocument;
  doc?.defaultView?.addEventListener('blur',reset,options);
  doc?.addEventListener('visibilitychange',reset,options);
  return {reset,sample(base={}){for(const state of states){if(state.key!==null||state.pulse)base[state.action]=true;state.pulse=false;}return base;}};
}

/** Visible names must follow actual model actions, including a keeper in possession. */
export function soccerActionLabels(state,config){
  const icon=soccerShotIcon(state,config),diving=state.role==='keeper'&&state.ball.owner!==state.controlled;
  return {icon,shot:diving?'soccer.keeperDive':icon==='header'?'soccer.header':state.mode==='defense'?'soccer.slide':'minigame.soccer.shoot',pass:state.mode==='defense'?'soccer.steal':'soccer.pass',switchable:state.role!=='keeper'};
}

/** Uses the island's modal/result lifecycle; owns only this round's renderer and input. */
export function startSoccer(ctx) {
  const {balance,canvas,controls,status,t}=ctx;
  const defaults=gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed??0,'soccer',ctx.level);
  const context={...defaults,...ctx},seed=context.seed>>>0,viewConfig=soccerViewConfig(context,balance),{team,opponent}=viewConfig;
  let model=(context.drill?createSoccerDrill:createSoccer)({config:balance,kind:context.drill,stage:context.level,seed,random:context.random,team,difficulty:context.difficulty,card:context.soccerCard,role:context.role,league:!context.drill});
  let storage;try{storage=globalThis.localStorage;}catch{}
  const audio=createG3hAudio({storage});
  // Bonus penalties follow every league match; the match result is kept untouched.
  let shootout=null,shootoutWait=0;const penaltiesOn=!context.drill&&!!balance.league?.penalties&&!!balance.league?.leagues?.length;
  let view,input,buttonInput,frame,last=0,hud=0,paused=false,disposed=false,handed=balance.controls.rightHanded,hudSignature='',mode='',started=false,pendingSwap=false;
  const events=new AbortController(),options={signal:events.signal};
  function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);events.abort();buttonInput?.reset();audio.dispose({finish:Boolean(model.result&&!context.drill)});input?.dispose();model.clearInput();view?.dispose();if(canvas)canvas.width=canvas.height=0;}
  function setPaused(value){paused=Boolean(value);audio.setPaused(paused);pendingSwap=false;last=0;buttonInput?.reset();input?.setEnabled(!paused&&(typeof document==='undefined'||!document.hidden));model.clearInput();if(!paused)canvas?.focus();}
  const session={dispose,setPaused,get snapshot(){return {...model.snapshot(),team,opponent,paused,disposed,audio:audio.snapshot,renderMetrics:view?.metrics()};}};
  if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('dev')==='1')session.debug={get model(){return model;},get view(){return view;},qualitySample:(...args)=>view?.qualitySample(...args),poseCamera:(...args)=>view?.poseCamera(...args)};
  // Engine tests can exercise a full model round without DOM/WebGL.
  if(!canvas)return session;
  const styleURL=new URL('./g3h-soccer.css?v=island-naval-aim-20261030-1',import.meta.url).href;
  if(!document.querySelector('link[data-soccer-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=styleURL;link.dataset.soccerStyle='';document.head.append(link);}
  if(!document.querySelector('link[data-g3j-soccer-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./g3j-soccer.css?v=island-naval-aim-20261030-1',import.meta.url).href;link.dataset.g3jSoccerStyle='';document.head.append(link);}
  const element=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text)node.textContent=text;return node;};
  try {
    document.addEventListener('pointerdown',()=>void audio.unlock(),options);
    const stick=element('div','soccer-joystick');stick.id='joystick';stick.setAttribute('aria-label',t('minigame.soccer.joystick'));stick.setAttribute('role','group');
    const zone=element('div','soccer-stick-zone');zone.setAttribute('aria-label',t('minigame.soccer.joystick'));zone.append(stick);const moveHint=element('span','soccer-move-hint',t('minigame.soccer.joystick'));moveHint.setAttribute('aria-hidden','true');zone.append(moveHint);
    const knob=element('span','soccer-knob');knob.id='knob';stick.append(knob);
    const actions=element('div','soccer-actions'),shoot=element('button','primary-button',t('minigame.soccer.shoot'));
    shoot.id='shoot';shoot.type='button';shoot.dataset.gameControl='shoot';
    const pass=element('button','secondary-button'),sprint=element('button','secondary-button soccer-sprint');
    const ring=element('span','soccer-stamina-ring');ring.setAttribute('aria-hidden','true');sprint.append(actionIcon('sprint'),ring);
    pass.id='pass';sprint.id='sprint';pass.type=sprint.type='button';pass.dataset.gameControl='pass';sprint.dataset.gameControl='sprint';sprint.setAttribute('aria-label',t('soccer.sprint'));
    const meter=element('span','soccer-energy-fill');meter.setAttribute('role','meter');meter.setAttribute('aria-label',t('soccer.energy'));meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');const energy=element('div','soccer-energy');energy.append(meter);controls.append(energy);
    const swap=element('button','secondary-button soccer-swap');swap.id='soccer-switch';swap.type='button';swap.append(actionIcon('switch'));swap.setAttribute('aria-label',t('minigame.soccer.switch'));swap.addEventListener('pointerdown',event=>{event.preventDefault();if(!paused)pendingSwap=true;},options);swap.addEventListener('click',event=>{if(!event.detail&&!paused)pendingSwap=true;},options);
    const keyName=code=>code==='Space'?'Space':code?.startsWith('Shift')?'Shift':code?.replace(/^Key/,'')||'';
    const labelNode=(node,label,key)=>{const name=element('span','soccer-action-label',label),hint=element('kbd','soccer-action-key',keyName(key));hint.setAttribute('aria-hidden','true');node.append(name,hint);node.setAttribute('aria-keyshortcuts',keyName(key));};
    labelNode(sprint,t('soccer.sprint'),balance.controls.sprintKeys[0]);labelNode(swap,t('minigame.soccer.switch'),balance.controls.switchKey);
    actions.append(shoot,pass,sprint,swap);controls.classList.add('soccer-controls');controls.append(zone,actions);
    try{const saved=localStorage.getItem(balance.controls.handednessKey);if(saved!==null)handed=saved==='right';}catch{}
    const roster=element('div','soccer-scoreboard'),home=element('span','soccer-kit'),away=element('span','soccer-kit'),score=element('span','soccer-score'),homeScore=element('bdi'),awayScore=element('bdi'),clock=element('bdi','soccer-clock');
    roster.setAttribute('aria-label',t('soccer.scoreboard'));roster.setAttribute('role','group');
    for(const [badge,identity]of [[home,team],[away,opponent]]){badge.style.backgroundColor=identity.colors[0];badge.style.borderColor=identity.colors[1];badge.setAttribute('aria-label',t(identity.nameId));}
    score.append(homeScore,awayScore);roster.append(home,score,away,clock);status.after(roster);status.classList.add('soccer-live-status');canvas.classList.add('soccer-canvas');
    input=createControls({root:controls,config:balance.controls,keyboardFromButtons:true,onGesture:()=>void audio.unlock(),onCancel:()=>model.clearInput(),autoAim:action=>{const s=model.getState(),p=s.players[s.controlled],target=s.practiceTarget||(s.restart?.type==='corner'?{x:s.attackDir*balance.pitch.length/2-s.attackDir*balance.pitch.penaltyDepth/2,z:0}:null);if(action==='pass'&&!target)return s.moving?{...s.aim}:{x:p.fx,z:p.fz};return {x:(target?.x??s.attackDir*balance.pitch.length/2)-p.x,z:(target?.z??0)-p.z};}});input.setHanded(handed);input.setEnabled(true);
    buttonInput=createSoccerButtonInput({buttons:{kickHeld:shoot,passHeld:pass,sprintHeld:sprint},signal:events.signal,enabled:()=>!paused&&!disposed&&!document.hidden,onGesture:()=>void audio.unlock(),onCancel:()=>model.clearInput()});
    document.addEventListener('visibilitychange',()=>{last=0;input.setEnabled(!document.hidden&&!paused);model.clearInput();},options);
    window.addEventListener('pagehide',()=>ctx.cancel(),options);
    const banner=element('div','soccer-goal-banner','⚽');banner.hidden=true;banner.setAttribute('aria-label',t('soccer.goal'));banner.setAttribute('role','status');canvas.after(banner);
    const phaseBanner=element('div','soccer-phase-banner');phaseBanner.hidden=true;phaseBanner.setAttribute('role','status');canvas.after(phaseBanner);
    const edge=element('span','soccer-edge-arrow','➤');edge.hidden=true;edge.setAttribute('aria-hidden','true');canvas.after(edge);
    const fixture=element('div','soccer-fixture'),stageLabel=element('span'),objectiveLabel=element('span','soccer-objective');fixture.append(stageLabel,objectiveLabel);canvas.after(fixture);fixture.hidden=Boolean(context.drill);
    const feedback=element('div','soccer-action-feedback');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');canvas.after(feedback);let feedbackTime=0;
    const number=id=>model.getState().players[id]?.card?.number??id+1;
    function actionFeedback(event){
      if(event.team===1||event.player!==undefined&&model.getState().players[event.player]?.team===1)return;
      const key={pass:'pass',loft:'loft',shot:'shot',header:'header',clearance:'header',steal:event.won?'steal':'blocked','slide-contact':event.won?'steal':'blocked',possession:'received',switch:'switch','heavy-touch':'heavyTouch',dive:'dive'}[event.type];
      if(!key)return;
      // Ordinary AI touches stay quiet; the selected player's actions get a cue.
      if(event.type==='possession'&&event.player!==model.getState().controlled)return;
      feedback.textContent=t(key==='pass'&&event.target==null?'soccer.pass':`soccer.feedback.${key}`,{number:number(event.target??event.player)});feedback.dataset.action=key;feedback.hidden=false;feedbackTime=1.1;
    }
    view=createSoccerView({canvas,config:viewConfig,onEdge:point=>{edge.hidden=!point;if(point){edge.style.left=`${point.x}px`;edge.style.top=`${point.y}px`;edge.style.transform=`translate(-50%,-50%) rotate(${point.angle}rad)`;}},onContextLost:()=>{if(!disposed){ctx.onError?.('minigame.soccer.webglError');ctx.cancel();}}});
    function updateHud(){
      const s=model.getState(),score=shootout?[shootout.match.goalsFor,shootout.match.goalsAgainst]:s.score,signature=JSON.stringify([score,s.half,!!shootout]);
      if(signature!==hudSignature){hudSignature=signature;status.textContent=t('soccer.liveScore',{team:t(team.nameId),opponent:t(opponent.nameId),goalsFor:score[0],goalsAgainst:score[1],half:s.half});}
      homeScore.textContent=String(score[0]);awayScore.textContent=String(score[1]);
      fixture.hidden=Boolean(context.drill||shootout);
      if(s.campaign&&!context.drill&&!shootout){const objective=stageObjective(s);stageLabel.textContent=s.league?.leagues?t('soccer.league.matchLabel',{league:t(s.league.nameId),match:s.league.match,count:s.league.per}):t('soccer.campaign.stageLabel',{stage:s.stage,name:t(s.campaign.nameId)});objectiveLabel.textContent=`${t(objective.nameId,{target:objective.target})} · ${Math.min(objective.current,objective.target)}/${objective.target}`;objectiveLabel.dataset.complete=String(objective.complete);}
      const seconds=Math.max(0,Math.floor(s.elapsed));clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      const percent=Math.round(s.sprint.value/s.sprint.capacity*100);meter.setAttribute('aria-valuenow',String(percent));ring.style.setProperty('--stamina',`${percent}%`);sprint.dataset.exhausted=String(s.sprint.locked);
      shoot.style.setProperty('--charge',`${s.charging&&s.chargeKind==='shot'?Math.round(s.charge/balance.physics.chargeSeconds*100):0}%`);
      pass.style.setProperty('--charge',`${s.charging&&s.chargeKind==='pass'?Math.round(s.charge/balance.passing.chargeSeconds*100):0}%`);
      const labels=soccerActionLabels(s,balance),{icon}=labels,signatureMode=s.mode+icon+labels.shot;
      if(mode!==signatureMode){
        mode=signatureMode;controls.dataset.mode=s.mode;
        const shotLabel=t(labels.shot),passLabel=t(labels.pass);
        shoot.replaceChildren(actionIcon(icon));pass.replaceChildren(actionIcon(s.mode==='defense'?'steal':'pass'));
        labelNode(shoot,shotLabel,balance.controls.kickKey);labelNode(pass,passLabel,balance.controls.passKey);
        shoot.setAttribute('aria-label',shotLabel);pass.setAttribute('aria-label',passLabel);
        swap.hidden=!labels.switchable;
      }


    }
    function tick(at){
      if(disposed)return;
      const dt=last?Math.min((at-last)/1000,balance.rules.maxUpdateSeconds):0,frameMs=last?at-last:0;last=at;
      const loading=view.loading();loader.hidden=!loading; // metrics() builds a large report; the loop only needs this flag
      if(!paused&&!document.hidden&&!loading){if(!started){started=true;void audio.unlock();audio.play('whistle');}if(dt>0){const sample=buttonInput.sample(input.sample(model.getState().attackDir));if(pendingSwap)sample.switchPlayer=true;pendingSwap=false;model.update(dt,sample);}view.render(model.renderState?.()??model.getState(),dt,frameMs);hud+=dt;}else view.render(model.renderState?.()??model.getState(),0);
      banner.hidden=model.getState().phase!=='goal';
      const s=model.getState();
      const phaseText=s.drill?`${s.drill.attempts+1}/${balance.training.drillAttempts} · ${s.drill.hits}`:s.phase.startsWith('restart')?{throwIn:'🙌',corner:'🚩',goalKick:'🥅'}[s.restart.type]:s.phase==='halftime'?'↔':'';
      phaseBanner.hidden=!phaseText;if(phaseBanner.textContent!==phaseText)phaseBanner.textContent=phaseText;
      audio.update(s);
      for(const event of model.drainEvents?.()||[]){audio.event(event);actionFeedback(event);}
      if(!paused){feedbackTime=Math.max(0,feedbackTime-dt);feedback.hidden=feedbackTime<=0;}
      if(hud>=.1||shoot.querySelector('svg')?.dataset.soccerIcon!==soccerShotIcon(s,balance)){hud=0;updateHud();}
      if(model.result&&penaltiesOn&&!shootout){
        // A short beat after the final whistle before the kicks start.
        shootoutWait+=dt;if(shootoutWait<(balance.league.penalties.delaySeconds??1.2)){frame=requestAnimationFrame(tick);return;}
        // Full time: three bonus kicks from the spot, same rival keeper and difficulty.
        shootout={match:model.result};model=createSoccerPenalties({config:balance,stage:context.level,seed:(seed^0x5bd1e995)>>>0,team,difficulty:context.difficulty,card:context.soccerCard,league:true});
        model.drainEvents();hudSignature='';mode='';audio.play('whistle');updateHud();frame=requestAnimationFrame(tick);return;
      }
      if(model.result){const m=shootout?shootout.match:model.result;ctx.finish(context.drill?{drill:model.result}:{outcome:m.won?'win':'lose',score:m.goalsFor,performance:m.won?1:0,soccer:m,...(shootout?{penalties:{attempts:model.result.attempts,hits:model.result.hits}}:{})});return;}
      frame=requestAnimationFrame(tick);
    }
    // Kickoff waits for the approved athletes; no old figure is shown meanwhile.
    const loader=element('div','soccer-loading');loader.setAttribute('role','status');loader.setAttribute('aria-label',t('soccer.loading'));canvas.after(loader);
    updateHud();frame=requestAnimationFrame(tick);queueMicrotask(()=>{if(!disposed)canvas.focus();});
    return session;
  } catch(error){dispose();throw error;}
}
