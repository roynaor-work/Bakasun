/** 13/11/2026 fire v23: the shell side of the two bonus missions (water targets, inside the building): a section after the
 * 30 campaign stages, two shortcuts on the fire game's home screen and the result card. Bonus missions have no save field,
 * so the cards show no stars; they open with campaign progress. `?fireTargets=0` / `?fireInterior=0` hide each mode. */
import {fireBonusCards,fireBonusOn,TARGET_STAGES,INTERIOR_STAGES,fireBonusUnlocked,fireBonusNumber} from '../minigames/fire-bonus.mjs?v=island-v2-20261107-11';
import {kitStageLabel,kitResultPanel,kitPrimary} from './ui-kit.mjs?v=island-v2-20261107-11';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const STAGES={targets:TARGET_STAGES,interior:INTERIOR_STAGES};

/** Same gates as a campaign stage (today's task, the fire station), then the game screen with the bonus mission. */
export function launchFireBonus(activity,mode,level){
  if(activity.requireDaily?.('fireRescue'))return;if(activity.requireBuilding?.('fireRescue'))return;
  activity.launch('fireRescue',undefined,1,{fireMode:mode,level});
}
/** The section under the campaign's stage map. */
export function fireBonusMap(activity,dialog){
  const progress=activity.engine.state.minigameProgress.fireRescue,count=activity.data.config.minigames.fireRescue.levels.length,cards=fireBonusCards(progress?.stage,undefined,count);
  if(!cards.length)return null;
  const box=el('section','fire-bonus-map');box.dataset.fireBonusMap='true';box.append(el('h3','',activity.t('fire.v23.section')),el('p','fire-bonus-hint',activity.t('fire.v23.sectionHint')));
  const grid=el('div','stage-map fire-bonus-grid');
  for(const c of cards){
    const node=kitStageLabel(button('','fire-bonus-play',()=>launchFireBonus(activity,c.mode,c.level)),activity.t('fire.v23.number',{number:c.number}),{locked:c.locked,stars:null});
    node.dataset.fireBonus=c.mode;node.dataset.level=String(c.level);node.dataset.stage=String(c.number);node.disabled=c.locked;
    const sub=el('small','stage-feature',c.locked?activity.t('fire.v23.unlockAt',{stage:c.unlock}):activity.t(c.titleKey));node.append(sub);node.title=activity.t(c.titleKey);
    node.setAttribute('aria-label',activity.t('fire.v23.number',{number:c.number})+' · '+activity.t(c.titleKey)+(c.locked?' · '+activity.t('fire.v23.unlockAt',{stage:c.unlock}):''));grid.append(node);
  }
  box.append(grid);dialog.append(box);return box;
}
/** Two shortcuts on the fire game's home screen (the next open target stage, and the building). */
export function fireBonusHome(activity,actions){
  const progress=activity.engine.state.minigameProgress.fireRescue?.stage;
  if(fireBonusOn('targets')){const open=TARGET_STAGES.filter(s=>fireBonusUnlocked('targets',s.level,progress)),level=open.length?open[open.length-1].level:1;
    const b=button(activity.t('fire.v23.targetsHome'),'fire-bonus-targets',()=>launchFireBonus(activity,'targets',level));b.disabled=!open.length;actions.append(b);}
  if(fireBonusOn('interior')){const ok=fireBonusUnlocked('interior',1,progress);const b=button(activity.t('fire.v23.interiorHome'),'fire-bonus-interior',()=>launchFireBonus(activity,'interior',1));b.disabled=!ok;if(!ok)b.title=activity.t('fire.v23.unlockAt',{stage:INTERIOR_STAGES[0].unlock});actions.append(b);}
}
/** Game screen title for a bonus mission. */
export function fireBonusHeading(activity,{fireMode,level}){const def=STAGES[fireMode]?.[level-1];return def?activity.t('fire.v23.result.title',{title:activity.t(def.titleKey),number:fireBonusNumber(fireMode,level,activity.data.config.minigames.fireRescue.levels.length)}):'';}
/** Result card: coins and stars only (nothing else is recorded), again / next / stage map / back to the city. */
export function fireBonusResult(activity,result,eventId){
  const {mode,level,number,summary}=result.fireBonus,def=STAGES[mode]?.[level-1];
  activity.ui.modalCleanup=null;
  const dialog=activity.modal('minigame.win','minigame.resultHint',eventId);dialog.dataset.result='fireRescue';dialog.dataset.fireBonusResult=mode;activity.sound.play('win');
  const rows=el('div','game-result');
  const row=(label,value,key)=>{const r=el('p','result-row');if(key)r.dataset.fireBonusSummary=key;r.append(el('span','',label),el('bdi','',String(value)));rows.append(r);};
  for(const key of ['score','money','stars'])row(activity.t(`minigame.result.${key}`),result[key]);
  if(summary&&mode==='targets'&&Number.isInteger(summary.hits))row(activity.t('fire.v23.result.hits'),summary.hits,'hits');
  if(summary&&mode==='interior'){if(Number.isInteger(summary.rooms))row(activity.t('fire.v23.result.rooms'),summary.rooms,'rooms');if(Number.isInteger(summary.rescued))row(activity.t('fire.v23.result.rescued'),summary.rescued,'rescued');}
  const title=def?activity.t('fire.v23.result.title',{title:activity.t(def.titleKey),number}):'';
  const panel=kitResultPanel({win:true,stars:result.stars,ratingLabel:activity.t('minigame.stageStars',{stage:number,stars:result.stars})},rows);
  dialog.append(el('h3','',title),panel,kitPrimary(button(activity.t('minigame.again'),'game-again',()=>launchFireBonus(activity,mode,level),'primary-button')));
  const progress=activity.engine.state.minigameProgress.fireRescue?.stage,next=STAGES[mode]?.[level];
  if(next&&fireBonusUnlocked(mode,next.level,progress))dialog.append(button(activity.t('minigame.continue'),'game-next-stage',()=>launchFireBonus(activity,mode,next.level),'primary-button'));
  else if(mode==='targets'&&fireBonusOn('interior')&&fireBonusUnlocked('interior',1,progress))dialog.append(button(activity.t('fire.v23.interiorHome'),'fire-bonus-interior',()=>launchFireBonus(activity,'interior',1),'primary-button'));
  dialog.append(button(activity.t('minigame.stages'),'game-stages',()=>activity.stages('fireRescue')),button(activity.t('minigame.exit'),'game-exit',()=>activity.ui.closeModal()));
  activity.engine.narration?.announce?.('minigame.win');
  return dialog;
}
