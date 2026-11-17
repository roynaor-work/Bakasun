/** Basketball position profiles are derived for a match; saved ratings stay untouched. */
export const POSITION_NAMES=Object.freeze({PG:'פוינט גארד',SG:'שוטינג גארד',SF:'סמול פורוורד',PF:'פאוור פורוורד',C:'סנטר'});
export const ABILITY_NAMES=Object.freeze({shooting:'קליעה',dunk:'הטבעה',rebound:'ריבאונד',defense:'הגנה',passing:'מסירה',speed:'מהירות'});
const FOCUS=Object.freeze({
 PG:{speed:1.06,pass:1.1,handle:1.06,three:1.01,dunk:.86,rebound:.88,block:.85},
 SG:{mid:1.08,three:1.12,release:1.07,ft:1.05,speed:1.02,rebound:.9,block:.9},
 SF:{inside:1.03,mid:1.02,three:1.02,dunk:1.05,vertical:1.04,perimD:1.02},
 PF:{inside:1.06,rebound:1.09,interiorD:1.08,strength:1.07,dunk:1.06,three:.93,speed:.97},
 C:{inside:1.08,rebound:1.12,block:1.14,interiorD:1.12,dunk:1.1,strength:1.08,three:.86,mid:.94,speed:.92,pass:.95}
});
const clamp=n=>Math.max(20,Math.min(99,n));
export const positionName=pos=>POSITION_NAMES[pos]||POSITION_NAMES.SF;
export function runtimeRatings(card){
 const result={...card.ratings},focus=FOCUS[card.pos]||FOCUS.SF;
 for(const [key,multiplier] of Object.entries(focus))if(Number.isFinite(result[key]))result[key]=clamp(result[key]*multiplier);
 return result;
}
export function playerAbilities(card){
 const r=card.r||runtimeRatings(card),value=k=>Number.isFinite(r[k])?r[k]:50;
 return Object.freeze({shooting:Math.round(value('three')*.4+value('mid')*.35+value('release')*.25),dunk:Math.round(value('dunk')*.75+value('vertical')*.25),rebound:Math.round(value('rebound')*.8+value('strength')*.2),defense:Math.round(value('perimD')*.25+value('interiorD')*.3+value('block')*.25+value('steal')*.2),passing:Math.round(value('pass')*.8+value('handle')*.2),speed:Math.round(value('speed')*.85+value('stamina')*.15)});
}
export function abilitySummary(card){const a=card.abilities||playerAbilities(card);return Object.keys(ABILITY_NAMES).map(k=>ABILITY_NAMES[k]+' '+a[k]).join(' · ');}
