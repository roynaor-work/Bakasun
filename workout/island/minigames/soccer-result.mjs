/** The saved selection is captured by the engine before the session starts. */
export function soccerResult(raw,ctx,balance) {
  if(ctx.drill){const d=raw?.drill,c=balance.training;if(!d||d.kind!==ctx.drill||!['targets','penalties','cones'].includes(d.kind)||!Number.isInteger(d.attempts)||d.attempts<0||d.attempts>c.drillAttempts||!Number.isInteger(d.hits)||d.hits<0||d.hits>d.attempts||!Number.isFinite(d.elapsed)||d.elapsed<c.minDrillSeconds||d.elapsed>c.drillSeconds+balance.rules.maxUpdateSeconds)return null;return {outcome:'lose',score:d.hits,money:0,drill:d};}
  const r=raw?.soccer,fields=['won','goalsFor','goalsAgainst','stage','stars','seed','durationSeconds','difficulty'];
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==fields.length||!fields.every(key=>Object.hasOwn(r,key)))return null;
  if(typeof r.won!=='boolean'||r.won!==(r.goalsFor>r.goalsAgainst))return null;
  if(!Object.hasOwn(balance.difficulties,r.difficulty)||r.difficulty!==ctx.difficulty)return null;
  if(!['goalsFor','goalsAgainst'].every(key=>Number.isSafeInteger(r[key])&&r[key]>=0&&r[key]<=balance.maximumScore))return null;
  if(!Number.isInteger(r.stage)||r.stage!==ctx.level||r.stage<1||r.stage>balance.levels.length)return null;
  if(!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||r.seed!==(ctx.seed>>>0))return null;
  const duration=balance.match.halfSeconds*2;
  if(!Number.isFinite(r.durationSeconds)||Math.abs(r.durationSeconds-duration)>.001)return null;
  const stars=r.won&&r.goalsAgainst===0?3:r.won&&r.goalsFor-r.goalsAgainst>=2?2:1;
  if(!Number.isInteger(r.stars)||r.stars!==stars)return null;
  const outcome=r.won?'win':'lose';
  if(raw.outcome!==outcome||raw.score!==r.goalsFor)return null;
  return {outcome,score:r.goalsFor,money:r.won?Math.floor((balance.levels[r.stage-1].winMoney+Math.floor(r.goalsFor/balance.pointsPerCoin))*balance.difficulties[r.difficulty].coinMultiplier):0,stars:r.won?r.stars:0};
}
