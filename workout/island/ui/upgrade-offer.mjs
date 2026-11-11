/** Upgrade offer card at the end of a stage (07/11/2026). Loaded on demand from ui/activity.mjs; the kit (assets/upgrade-offer, Codex PR 354)
 * is display only. Buying goes through the existing paths, so nothing about the save changes. Any failure leaves the result screen as it was.
 * `?upgradeOffer=0` turns it off. */
import {offerEnabled,stageEligible,stageKey,moneyCandidates,leagueCandidates,pickOffer,createOfferMemory,dismiss,settle} from './upgrade-offer-core.mjs?v=island-v2-20261107-8';

const memory=createOfferMemory();
let kit=null;
function loadKit(){
  return kit??=import('../assets/upgrade-offer/offer.mjs?v=island-v2-20261107-8').then(mod=>{
    if(!document.querySelector('link[data-upgrade-offer-css]')){
      const link=document.createElement('link');link.rel='stylesheet';link.dataset.upgradeOfferCss='true';
      link.href=new URL('../assets/upgrade-offer/offer.css?v=island-v2-20261107-8',import.meta.url).href;document.head.append(link);
    }
    return mod;
  }).catch(error=>{kit=null;throw error;});
}

/** Candidates for the game that was just played, from the live state. */
export function candidatesFor({engine,data,gameId,result,t}){
  if(result?.league)return leagueCandidates(engine.state.islandRacingLeague);
  return moneyCandidates(engine.state,data,gameId,k=>t(k));
}

/** Show the one offer, if any, by calling `place(host)` to put the card in the result screen. Resolves to the offer shown or null; never throws. */
export async function offerUpgrade({engine,activity,data,t,gameId,result,place,sound}){
  try{
    if(!offerEnabled()||!stageEligible(result)||!data?.featureFlags?.minigames)return null;
    const key=stageKey(gameId,result),offer=pickOffer({gameId,key,candidates:candidatesFor({engine,data,gameId,result,t}),memory});
    if(!offer)return null;
    // racing-deep-m4: one card per stage on screen: a second call for the same stage (the result screen re-rendered) finds the first card and stops
    const open=document.querySelector(`[data-upgrade-offer][data-upgrade-key="${CSS.escape(key)}"]`);if(open?.isConnected)return null;
    const mod=await loadKit();
    const host=document.createElement('div');host.dataset.upgradeOffer=offer.id;host.dataset.upgradeGame=gameId;host.dataset.upgradeKey=key;
    host.style.cssText='display:flex;justify-content:center;margin:12px 0;';
    const view={category:offer.category,name:offer.name,icon:offer.icon,unit:offer.unit,price:offer.price,balance:offer.balance,mode:'dark'};
    const card=mod.create(host,{
      initial:view,
      onUpgrade(){
        const bought=offer.kind==='league'?engine.racingLeague.buy(offer.track):activity.upgrade(gameId,offer.kind==='track'?offer.track:undefined);
        if(!bought?.ok){card.destroy();host.remove();return;}
        settle(memory,key);
        card.update({...view,balance:offer.balance-offer.price,purchased:true,price:offer.price});
        const later=host.querySelector('.uo-later');if(later)later.textContent='המשך';
        sound?.('win');
      },
      onLater(){dismiss(memory,key,offer.id,gameId);card.destroy();host.remove();}
    });
    place(host);
    host.scrollIntoView?.({block:'nearest'});
    return offer;
  }catch(error){globalThis.__offerError=String(error?.stack||error);return null;}
}
export const resetOfferMemory=()=>memory.dismissed.clear();
