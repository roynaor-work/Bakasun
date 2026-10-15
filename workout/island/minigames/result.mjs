export function gameResult(raw,ctx,balance) {
  if(!raw||!['win','lose'].includes(raw.outcome)||!Number.isSafeInteger(raw.score)||raw.score<0||raw.score>balance.maximumScore)return null;
  return {outcome:raw.outcome,score:raw.score,money:Math.floor(raw.score/balance.pointsPerCoin)+(raw.outcome==='win'?balance.levels[ctx.level-1].winMoney:0)};
}
