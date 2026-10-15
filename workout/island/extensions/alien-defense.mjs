import { startAliens } from '../minigames/aliens.mjs';

export function install(registry,data) {
  const balance=data.config.minigames.alienDefense;
  registry.registerMinigame({
    ...data.extensions.alienDefense,
    start:ctx=>startAliens({...ctx,balance}),
    onResult(raw,ctx) {
      const level=balance.levels[ctx.level-1];
      const maximum=level.rows*level.columns*level.waves*level.points;
      if(!raw || !['win','lose'].includes(raw.outcome) || !Number.isSafeInteger(raw.score) || raw.score<0 || raw.score>maximum) return null;
      return {outcome:raw.outcome,score:raw.score,money:Math.floor(raw.score/balance.pointsPerCoin)+(raw.outcome==='win'?level.winMoney:0)};
    }
  });
}
