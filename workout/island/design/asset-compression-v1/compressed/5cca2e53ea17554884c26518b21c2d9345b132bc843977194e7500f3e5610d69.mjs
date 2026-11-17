export const attributes=['power','pace','accuracy','stamina','defense'];
export function initialSoccerCard(progress,balance) {
  return {stars:(Array.isArray(progress?.stars)?progress.stars:[]).reduce((sum,n)=>sum+n,0),attributes:Object.fromEntries(attributes.map(key=>[key,balance.card.initial])),trainings:0,lastTrainingAt:0,difficulty:'easy'};
}
export function validSoccerCard(card,balance) {
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  return !!card&&typeof card==='object'&&!Array.isArray(card)&&Object.keys(card).length===5&&
    ['stars','trainings','lastTrainingAt'].every(key=>integer(card[key]))&&typeof card.difficulty==='string'&&Object.hasOwn(balance.difficulties,card.difficulty)&&
    !!card.attributes&&Object.keys(card.attributes).length===attributes.length&&attributes.every(key=>Number.isInteger(card.attributes[key])&&card.attributes[key]>=balance.card.min&&card.attributes[key]<=balance.card.max);
}
export function cardEffects(card,balance) {
  const c=balance.card,e=c.effects;
  const amount=key=>Math.max(0,Math.min(1,((card?.attributes?.[key]??c.initial)-c.initial)/(c.max-c.initial)));
  return {power:1+amount('power')*e.power,pace:1+amount('pace')*e.pace,spread:1-amount('accuracy')*e.accuracySpreadReduction,
    assistDegrees:amount('accuracy')*e.accuracyAssistDegrees,capacity:1+amount('stamina')*e.staminaCapacity,regen:1+amount('stamina')*e.staminaRegen,defense:amount('defense')*e.defense};
}
export function cardRating(card,balance) {
  const overall=Math.round(attributes.reduce((sum,key)=>sum+card.attributes[key],0)/attributes.length);
  return {overall,tier:overall>=balance.card.goldRating?'gold':overall>=balance.card.silverRating?'silver':'bronze'};
}
export function mergeSoccerCard(current,incoming) {
  for(const key of ['stars','trainings','lastTrainingAt'])current[key]=Math.max(current[key],incoming[key]);
  for(const key of attributes)current.attributes[key]=Math.max(current.attributes[key],incoming.attributes[key]);
  current.difficulty=incoming.difficulty;
}
/** The engine owns time and persistence, including rollback correction. */
export function trainingOffer(card,key,balance,now) {
  const settings=balance.training;
  if(!attributes.includes(key))return {ok:false,reason:'reason.invalid'};
  const cost=settings.baseCost+Math.floor(Math.max(0,card.attributes[key]-balance.card.initial)/settings.pointsPerCost);
  const remaining=card.trainings?Math.max(0,card.lastTrainingAt+settings.cooldownSeconds*settings.millisecondsPerSecond-now):0;
  if(card.attributes[key]>=balance.card.max)return {ok:false,reason:'soccer.training.max',cost,remaining};
  if(remaining)return {ok:false,reason:'soccer.training.wait',cost,remaining};
  if(card.stars<cost)return {ok:false,reason:'soccer.training.stars',cost,remaining};
  return {ok:true,cost,remaining};
}
