export function gameResult(raw,ctx,balance) {
  if(!raw||!['win','lose'].includes(raw.outcome)||!Number.isSafeInteger(raw.score)||raw.score<0||raw.score>balance.maximumScore)return null;
  const thresholds=ctx.config?.starThresholds||ctx.engine.data.config.minigames.starThresholds;
  const performance=Number.isFinite(raw.performance)?Math.max(0,Math.min(1,raw.performance)):0;
  const stars=raw.outcome==='win'?1+thresholds.filter(n=>performance>=n).length:0;
  return {stars,outcome:raw.outcome,score:raw.score,money:Math.floor(raw.score/balance.pointsPerCoin)+(raw.outcome==='win'?balance.levels[ctx.level-1].winMoney:0)};
}
