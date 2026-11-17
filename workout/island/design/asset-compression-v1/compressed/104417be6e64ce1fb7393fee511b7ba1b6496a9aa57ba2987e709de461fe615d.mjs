/** 13/11/2026 fire v23 (Roy: "more in the game than spraying and the ladder: water shooting at targets, going into a building
 * and acting inside, or simply a static screen inside a building"). Two bonus missions beside the 30-stage campaign:
 *  - targets: the engine stands, one thumb aims and the other holds the hose; windows, a roof, cans, smoke and a floating fireball.
 *  - interior: the engine arrives, the firefighter goes in, three static rooms (living room, kitchen, bedroom) and a victory screen.
 * They are shown after the campaign (stage numbers 31+ on screen only), live in no save field and pay coins only: the engine runs
 * them on stage 1 data and never records stars, stage progress, certificates, wins or a high score for them.
 * `?fireTargets=0` and `?fireInterior=0` take each mode out entirely (the previous game). Pure: no DOM. */
import {polishValue} from './polish-flag.mjs';

export const FIRE_BONUS_MODES=Object.freeze(['targets','interior']);
const FLAG={targets:'fireTargets',interior:'fireInterior'};
/** On unless its URL flag is 0. */
export function fireBonusOn(mode,search){return FIRE_BONUS_MODES.includes(mode)&&polishValue(FLAG[mode],search)!=='0';}

/** Target stages. Positions name anchors of the street picture (w<row><col> = apartment window, rows from the ground up);
 * `wind` is the steady push on the stream (scene px/s²), `gust` its swing; `move` makes a target sway (scene px, rad/s). */
export const TARGET_STAGES=Object.freeze([
  {level:1,unlock:1,par:28,winMoney:24,wind:0,gust:0,titleKey:'fire.v23.targets.1',
    targets:[{kind:'window',at:'win_5'},{kind:'window',at:'win_1'},{kind:'window',at:'win_3'}]},
  {level:2,unlock:2,par:40,winMoney:30,wind:0,gust:0,titleKey:'fire.v23.targets.2',
    targets:[{kind:'window',at:'win_7'},{kind:'window',at:'win_9'},{kind:'roof',at:'roof2'},{kind:'can',at:'target_bin_green'},{kind:'can',at:'target_bin_ash'}]},
  {level:3,unlock:3,par:48,winMoney:36,wind:240,gust:0,assist:36,regrow:.05,titleKey:'fire.v23.targets.3',
    targets:[{kind:'smoke',at:'win_5',covers:1},{kind:'window',at:'win_5'},{kind:'window',at:'win_2'},{kind:'window',at:'win_8'},{kind:'can',at:'target_crate'},{kind:'can',at:'target_barrel'},{kind:'roof',at:'roof1'}]},
  {level:4,unlock:4,par:56,winMoney:42,wind:-160,gust:300,assist:34,regrow:.05,titleKey:'fire.v23.targets.4',
    targets:[{kind:'fireball',at:'skyLeft',move:{ax:170,ay:30,wx:.5,wy:1.2}},{kind:'window',at:'win_4'},{kind:'window',at:'win_1'},{kind:'smoke',at:'win_9',covers:4},{kind:'window',at:'win_9'},
      {kind:'can',at:'target_bin_green'},{kind:'can',at:'target_bin_ash'},{kind:'can',at:'target_crate_small'}]},
  {level:5,unlock:5,par:68,winMoney:48,wind:220,gust:260,assist:38,regrow:.07,titleKey:'fire.v23.targets.5',
    targets:[{kind:'fireball',at:'skyLeft',move:{ax:170,ay:34,wx:.5,wy:1.2}},{kind:'fireball',at:'skyRight',move:{ax:140,ay:40,wx:.6,wy:1,phase:2}},{kind:'roof',at:'roof3'},{kind:'window',at:'win_7'},{kind:'window',at:'win_9'},
      {kind:'smoke',at:'win_5',covers:6,move:{ax:26,ay:0,wx:.5,wy:0}},{kind:'window',at:'win_5'},{kind:'can',at:'target_bin_green'},{kind:'can',at:'target_bin_ash'},{kind:'can',at:'target_barrel'}]},
]);

/** One interior mission: three rooms in a row, each teaching one rule and opening one tool. Spots and the rescue name anchors of the room picture. */
export const INTERIOR_STAGES=Object.freeze([
  {level:1,unlock:3,winMoney:60,par:110,titleKey:'fire.v23.interior.1',rooms:[
    {id:'living',image:'room-living',rule:'electric',tool:'extinguisher',smokeSeconds:80,smokeStart:0,
      spots:[{id:'sofa',kind:'normal',at:'sofa',r:80},{id:'rug',kind:'normal',at:'rug',r:70},{id:'television',kind:'electric',at:'television',r:70}],
      rescue:{kind:'kid',at:'rescue',near:'rug'}},
    {id:'kitchen',image:'room-kitchen',rule:'oil',tool:'blanket',smokeSeconds:70,smokeStart:.05,
      spots:[{id:'oil_pot',kind:'oil',at:'oil_pot',r:60},{id:'kitchen_table',kind:'normal',at:'kitchen_table',r:72},{id:'power_strip',kind:'normal',at:'power_strip',r:58}],
      rescue:{kind:'pet',at:'rescue',near:'power_strip'}},
    {id:'bedroom',image:'room-bedroom',rule:'smoke',tool:'foam',smokeSeconds:70,smokeStart:.8,
      spots:[{id:'mattress',kind:'heavy',at:'mattress',r:92},{id:'wardrobe',kind:'heavy',at:'wardrobe',r:84},{id:'curtain_left',kind:'normal',at:'curtain_left',r:60}],
      rescue:{kind:'kid',at:'rescue',near:'mattress',low:true}},
  ]},
]);

const STAGES={targets:TARGET_STAGES,interior:INTERIOR_STAGES};
/** A bonus stage opens with campaign progress (the saved current stage), so it needs no save field of its own. */
export function fireBonusUnlocked(mode,level,progressStage){const def=STAGES[mode]?.[level-1];return Boolean(def&&Number.isInteger(progressStage)&&progressStage>=def.unlock);}
/** Shown after the campaign: targets 31-35, interior 36. Display only. */
export function fireBonusNumber(mode,level,campaignLength=30){return campaignLength+(mode==='targets'?level:TARGET_STAGES.length+level);}
/** Engine gate: a launch request for a bonus mission. */
export function fireBonusMission(mode,level,progress,search){
  if(!FIRE_BONUS_MODES.includes(mode))return {ok:false,reason:'reason.invalid'};
  if(!fireBonusOn(mode,search))return {ok:false,reason:'reason.locked'};
  const def=STAGES[mode][level-1];if(!Number.isInteger(level)||!def)return {ok:false,reason:'reason.invalid'};
  if(!fireBonusUnlocked(mode,level,progress?.stage))return {ok:false,reason:'minigame.stageLockedReason'};
  return {ok:true,mode,level,def};
}
/** Cards for the stage map, in play order. */
export function fireBonusCards(progressStage,search,campaignLength=30){
  const cards=[];for(const mode of FIRE_BONUS_MODES)if(fireBonusOn(mode,search))for(const def of STAGES[mode])cards.push({mode,level:def.level,number:fireBonusNumber(mode,def.level,campaignLength),titleKey:def.titleKey,locked:!fireBonusUnlocked(mode,def.level,progressStage),unlock:def.unlock});
  return cards;
}
/** Coins and stars for a finished bonus mission. Score is capped like the campaign (balance.maximumScore). */
export function fireBonusResult(raw,mode,level,balance){
  const def=STAGES[mode]?.[level-1];
  if(!def||!raw||raw.outcome!=='win'||!Number.isSafeInteger(raw.score)||raw.score<0)return null;
  const score=Math.min(balance.maximumScore,raw.score),performance=Number.isFinite(raw.performance)?Math.max(0,Math.min(1,raw.performance)):0;
  const stars=1+(performance>=.45)+(performance>=.8);
  return {outcome:'win',score,stars,money:Math.floor(score/balance.pointsPerCoin)+def.winMoney};
}
