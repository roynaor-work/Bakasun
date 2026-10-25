/** Validate a Street Slam result against the round that was started; the
 * island economy credits it once. Malformed or impossible results are refused. */
export function streetSlamResult(raw,ctx,balance){
 const r=raw?.streetSlam,fields=['won','stars','scoreFor','scoreAgainst','overtimes','stage','seed','durationSeconds'];
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==fields.length||!fields.every(k=>Object.hasOwn(r,k)))return null;
 if(!['scoreFor','scoreAgainst','overtimes'].every(k=>Number.isInteger(r[k])&&r[k]>=0)||r.scoreFor>balance.maximumScore||r.scoreAgainst>balance.maximumScore)return null;
 if(r.scoreFor===r.scoreAgainst||typeof r.won!=='boolean'||r.won!==(r.scoreFor>r.scoreAgainst))return null;
 if(!Number.isInteger(r.stage)||r.stage!==ctx.level||r.stage<1||r.stage>balance.levels.length)return null;
 if(!Number.isInteger(r.seed)||r.seed!==(ctx.seed>>>0))return null;
 const minimum=balance.match.seconds+r.overtimes*balance.match.overtimeSeconds;
 if(!Number.isFinite(r.durationSeconds)||r.durationSeconds<minimum-.05||r.durationSeconds>balance.maximumSeconds)return null;
 const margin=r.scoreFor-r.scoreAgainst,stars=r.won?margin>=balance.stars.three?3:margin>=balance.stars.two?2:1:0;
 if(r.stars!==stars||raw.outcome!==(r.won?'win':'lose')||raw.score!==r.scoreFor)return null;
 return {outcome:raw.outcome,score:r.scoreFor,stars,money:r.won?balance.levels[r.stage-1].winMoney+Math.floor(r.scoreFor/4):0};
}
