/** Tennis's original ten stage IDs keep their stars when the tour grows.
 * Shared persistence must call this before validating an existing save. The
 * function never changes its input, invents stars, or repairs malformed rows.
 */
export function expandLegacyTennisProgress(progress,totalStages=30){
 const legacy=10;
 if(!Number.isInteger(totalStages)||totalStages<=legacy||!progress||!Number.isInteger(progress.stage)||progress.stage<1||progress.stage>legacy||!Array.isArray(progress.stars)||progress.stars.length!==legacy)return progress;
 const valid=Array.from({length:legacy},(_,i)=>progress.stars[i]).every((n,i)=>Number.isInteger(n)&&n>=0&&n<=3&&(i<progress.stage-1?n>0:i>=progress.stage?n===0:progress.stage===legacy||n===0));
 if(!valid)return progress;
 const completed=progress.stage===legacy&&progress.stars[legacy-1]>0;
 return {...progress,stage:completed?legacy+1:progress.stage,stars:[...progress.stars,...Array(totalStages-legacy).fill(0)]};
}
