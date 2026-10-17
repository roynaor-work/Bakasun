/** Capture seed, stage and selected difficulty before the round; reject malformed awards. */
export function tennisResult(raw,ctx,balance){
 const r=raw?.tennis,fields=['won','gamesFor','gamesAgainst','stage','stars','seed','durationSeconds','difficulty'];
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==fields.length||!fields.every(k=>Object.hasOwn(r,k)))return null;
 const games=balance.rules.gamesToWin;
 if(!['gamesFor','gamesAgainst'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=games))return null;
 if(typeof r.won!=='boolean'||r.won!==(r.gamesFor===games&&r.gamesAgainst<games)||!r.won&&!(r.gamesAgainst===games&&r.gamesFor<games))return null;
 if(r.stage!==ctx.level||!Number.isInteger(r.stage)||r.stage<1||r.stage>balance.levels.length||r.seed!==(ctx.seed>>>0)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff)return null;
 if(r.difficulty!==ctx.difficulty||!Object.hasOwn(balance.difficulties,r.difficulty)||!Number.isFinite(r.durationSeconds)||r.durationSeconds<=0||r.durationSeconds>balance.maximumSeconds)return null;
 const stars=r.won?r.gamesAgainst===0?3:r.gamesAgainst<=balance.rules.goodWinAgainst?2:1:balance.rules.lossStars;
 if(r.stars!==stars||raw.outcome!==(r.won?'win':'lose')||raw.score!==r.gamesFor)return null;
 return {outcome:raw.outcome,score:r.gamesFor,stars:r.won?stars:0,money:r.won?Math.floor((balance.levels[r.stage-1].winMoney+r.gamesFor)*balance.difficulties[r.difficulty].coinMultiplier):0};
}
