/** Upgrade offer, pure core (07/11/2026): decides which single upgrade to offer at the end of a stage.
 * No DOM, no storage, no save changes. The UI (upgrade-offer.mjs) shows the card and the host buys through the existing paths
 * (activity.upgrade for island coins, engine.racingLeague.buy for league coins).
 * Rules: only the category that was just played; only an upgrade the child can pay for now; the cheapest one; one offer per stage;
 * "later" is remembered for that stage and upgrade, so the same stage does not ask again. `?upgradeOffer=0` turns it all off. */
import {equipmentOffer} from '../activity/equipment.mjs?v=island-v2-20261107-8';
import {UPGRADES,UPGRADE_COST,MAX_LEVEL} from '../minigames/racing-league-core.mjs?v=island-v2-20261107-8';

export const offerEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('upgradeOffer')!=='0';

/** Plain Hebrew category names and kit icon per equipment track. Unknown tracks fall back to the generic icon. */
export const CATEGORY=Object.freeze({islandRacing:'מרוצים',alienDefense:'חלליות',fireRescue:'כיבוי אש',navalDuel:'ספינות',soccer:'כדורגל',tennis:'טניס',streetSlam:'כדורסל',alpineRush:'סקי',catchCriminal:'תפוס את הפושע'});
export const TRACK_ICON=Object.freeze({
  islandRacing:{engine:'engine',grip:'tires',nitro:'nitro'},
  alienDefense:{damage:'cannon',rate:'speed',shield:'shield',weapon:'upgrade'},
  fireRescue:{pressure:'throw-power',range:'arrow-up',tank:'armor',hose:'upgrade'},
  navalDuel:{shield:'shield',hull:'armor',rate:'accuracy',damage:'cannon',ammo:'speed'},
  soccer:{speed:'speed',kick:'kick',guard:'goalkeeper'},
  tennis:{speed:'speed',hit:'tennis-power',serve:'racket'},
  streetSlam:{shoes:'speed',touch:'accuracy',spring:'jump'},
  alpineRush:{wax:'speed',tank:'upgrade'},
  catchCriminal:{net:'throw-power',scope:'accuracy'}});
const LEAGUE_ICON=Object.freeze({engine:'engine',tires:'tires',brakes:'brakes',aero:'aerodynamics',steering:'speed'});

const int=v=>Number.isSafeInteger(v)&&v>=0;
/** Island money drifts in fractions (income ticks); the child sees and pays whole coins. */
const whole=v=>Number.isFinite(v)&&v>=0?Math.floor(v):0;

/** A finished stage is worth an offer when it was a win, earned a star or coins, or was a league race (every league finish pays coins).
 * Cancelled or empty runs never offer. */
export function stageEligible(result){
  if(!result||result.cancelled)return false;
  if(result.league)return true;
  return result.outcome==='win'||Number(result.stars)>0||Number(result.money)>0;
}
export const stageKey=(gameId,result)=>result?.league?`${gameId}:league:${result.league.season}:${result.league.race}`:`${gameId}:${result?.stage??0}`;

/** Island-coin upgrades of one game: the next game level plus every equipment track. `title(key)` gives the Hebrew track name. */
export function moneyCandidates(state,data,gameId,title=k=>k){
  const out=[],cfg=data?.config;if(!state||!cfg||!cfg.minigameLevels?.[gameId])return out;
  const level=state.minigameLevels?.[gameId],next=cfg.minigameLevels[gameId][level];
  if(next&&next.cost>0)out.push({id:'level',kind:'level',gameId,category:CATEGORY[gameId]||'',name:'רמה חדשה במשחק',icon:'upgrade',unit:'coins',price:next.cost,balance:whole(state.money)});
  for(const [key,track] of Object.entries(cfg.minigames?.[gameId]?.equipment||{})){
    const offer=equipmentOffer(state,data,gameId,key);if(!offer||offer.cost===undefined)continue;
    out.push({id:'track:'+key,kind:'track',track:key,gameId,category:CATEGORY[gameId]||'',name:title(track.title)||key,icon:TRACK_ICON[gameId]?.[key]||'upgrade',unit:'coins',price:offer.cost,balance:whole(state.money),
      locked:offer.reason==='equipment.starsReason',lockReason:offer.stars?`נפתח ב-${offer.stars} כוכבים`:undefined});
  }
  return out;
}
/** League upgrades: paid with league coins only (a separate purse from island coins). */
export function leagueCandidates(league){
  const out=[];if(!league||!league.upgrades)return out;
  for(const [key,spec] of Object.entries(UPGRADES)){
    const level=league.upgrades[key];if(!int(level)||level>=MAX_LEVEL)continue;
    out.push({id:'league:'+key,kind:'league',track:key,gameId:'islandRacing',category:'ליגת המירוצים',name:spec.name,icon:LEAGUE_ICON[key]||'upgrade',unit:'coins',price:UPGRADE_COST[level],balance:league.coins});
  }
  return out;
}

/** Remembers, for this visit only, what the child put off. Nothing here is saved.
 * dismissed: stage+upgrade pairs. quiet: after "later" the game rests for one stage, so a child who is not interested is not asked every time. */
export function createOfferMemory(){return {dismissed:new Set(),seen:new Set(),count:{},quiet:{},done:new Set()};}
export const dismiss=(memory,key,id,gameId=key.split(':')[0])=>{memory.dismissed.add(key+'|'+id);memory.quiet[gameId]=(memory.count[gameId]||0)+1;};
/** racing-deep-m4: after a purchase the stage is settled, so a re-rendered result screen (next season, refresh) never shows a second card for it. */
export const settle=(memory,key)=>{(memory.done??=new Set()).add(key);};
export const isDismissed=(memory,key,id)=>memory.dismissed.has(key+'|'+id);
export const affordable=c=>Boolean(c)&&!c.locked&&Number.isSafeInteger(c.price)&&c.price>0&&int(c.balance)&&c.balance>=c.price;

/** The one offer for a finished stage, or null. `candidates` may include other games; only the played one counts.
 * Counts the stage once (a repeat call for the same stage key does not advance the rest period). */
export function pickOffer({gameId,key,candidates,memory=createOfferMemory()}){
  if(memory.done?.has(key))return null;
  if(!memory.seen.has(key)){memory.seen.add(key);memory.count[gameId]=(memory.count[gameId]||0)+1;}
  if(memory.count[gameId]===memory.quiet[gameId])return null;
  const list=(candidates||[]).filter(c=>c&&c.gameId===gameId&&affordable(c)&&!isDismissed(memory,key,c.id));
  if(!list.length)return null;
  // cheapest first; a game level and a part with the same price: the part (more concrete for a young child)
  list.sort((a,b)=>a.price-b.price||(a.kind==='level')-(b.kind==='level')||String(a.id).localeCompare(String(b.id)));
  return list[0];
}
