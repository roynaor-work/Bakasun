import {gameResult} from '../minigames/result.mjs';
import { startAliens } from '../minigames/aliens.mjs';

export function install(registry,data) {
  const balance=data.config.minigames.alienDefense;
  registry.registerMinigame({
    ...data.extensions.alienDefense,
    start:ctx=>startAliens({...ctx,balance}),
    onResult(raw,ctx) {
      const level=balance.levels[ctx.level-1];
      const maximum=(level.rows*level.columns*level.waves+Number(level.boss))*level.points;
      if(!raw || !['win','lose'].includes(raw.outcome) || !Number.isSafeInteger(raw.score) || raw.score<0 || raw.score>maximum) return null;
      return gameResult(raw,ctx,{...balance,maximumScore:maximum});
    }
  });
}
