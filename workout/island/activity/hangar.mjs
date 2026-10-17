/** Pure save-owned hangar; round temporaries never enter this object. */
export function initialHangar(){return {damage:0,coins:0,paint:0,rapid:0,shield:0,credits:0,spent:0};}
export function validHangar(h,c){return h&&Object.keys(h).length===7&&['damage','coins','paint','rapid','shield','credits'].every(k=>Number.isSafeInteger(h[k])&&h[k]>=0)&&h.damage<=c.maxDamage&&h.coins<=c.maxCoins&&h.paint<c.paints.length&&h.rapid<=c.maxRank&&h.shield<=c.maxRank&&h.credits<=c.maxCoins&&h.spent===h.rapid+h.shield&&Number.isSafeInteger(h.spent);}
export function hangarAction(h,action,c){
 if(action==='repair'){const cost=h.damage*c.repairCost;if(!h.damage||h.coins<cost)return false;h.coins-=cost;h.damage=0;return true;}
 if(action==='paint'){h.paint=(h.paint+1)%c.paints.length;return true;}
 if(['rapid','shield'].includes(action)&&h.credits>0&&h[action]<c.maxRank){h.credits--;h.spent++;h[action]++;return true;}
 return false;
}
