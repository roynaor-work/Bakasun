import {gameResult} from '../minigames/result.mjs?v=island-alpine-20261026-1';
import { startAliens } from '../minigames/aliens.mjs?v=island-alpine-20261026-1';

export function install(registry,data) {
  const balance=data.config.minigames.alienDefense;
  registry.registerMinigame({
    ...data.extensions.alienDefense,
    start:ctx=>startAliens({...ctx,balance}),
    onResult(raw,ctx) {
      const level=balance.levels[ctx.level-1];
      const maximum=level.scoreLimit;
      if(!raw || !['win','lose'].includes(raw.outcome) || !Number.isSafeInteger(raw.score) || raw.score<0 || raw.score>maximum) return null;
      const result=gameResult(raw,ctx,{...balance,maximumScore:maximum});
      if(result)result.money=Math.floor(Math.min(raw.score,level.rewardScoreLimit)/balance.pointsPerCoin)+(raw.outcome==='win'?level.winMoney:0);
      return result;
    }
  });
}
