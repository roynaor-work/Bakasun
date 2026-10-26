import {getRacingStage} from './racing-tracks.mjs?v=island-naval-aim-20261026-3';

/** Rewards depend on the selected race and a complete, ordered checkpoint run. */
export function racingResult(raw,ctx,balance) {
  const r=raw?.racing;
  const fields=['won','stars','rank','stage','seed','durationSeconds','laps','checkpoints','requiredCheckpoints','finished'];
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==fields.length||!fields.every(key=>Object.hasOwn(r,key)))return null;
  if(!Number.isInteger(r.stage)||r.stage!==ctx.level||r.stage<1||r.stage>balance.levels.length)return null;
  const stage=getRacingStage(r.stage),required=stage.laps*16;
  if(!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||r.seed!==(ctx.seed>>>0))return null;
  if(!Number.isInteger(r.rank)||r.rank<1||r.rank>stage.opponents+1||r.finished!==true)return null;
  if(!Number.isFinite(r.durationSeconds)||r.durationSeconds<=0||r.durationSeconds>Math.min(balance.maximumSeconds,stage.timeLimit+.2))return null;
  if(!Number.isInteger(r.laps)||r.laps<0||r.laps>stage.laps||!Number.isInteger(r.checkpoints)||r.checkpoints<0||r.checkpoints>required||r.requiredCheckpoints!==required)return null;
  if(r.laps!==Math.floor(r.checkpoints/16))return null;
  const complete=r.checkpoints===required&&r.laps===stage.laps;
  const won=complete&&r.rank<=stage.targetRank,stars=won?Math.max(1,4-r.rank):0,score=complete?stage.opponents+2-r.rank:0;
  if(r.won!==won||r.stars!==stars||raw.outcome!==(won?'win':'lose')||raw.score!==score)return null;
  return {outcome:raw.outcome,score,stars,money:won?balance.levels[r.stage-1].winMoney+score:0};
}
