import {equipmentOffer} from '../activity/equipment.mjs?v=g9-20261020-1';
// Keep the five established save slots valid, including legacy shield purchases.
// The four visible tracks reuse hull/damage/rate/ammo, so v15 saves need no migration.
export const NAVAL_TRACKS=Object.freeze({hull:'hull',cannon:'damage',aim:'rate',speed:'ammo'});
export function navalUpgradeRanks(state){const saved=state?.minigameEquipment?.navalDuel||{};return Object.fromEntries(Object.entries(NAVAL_TRACKS).map(([name,key])=>[name,Math.max(0,Math.min(3,Number.isInteger(saved[key])?saved[key]:0))]));}
const choices=new WeakMap();
export const navalDifficulty=engine=>choices.get(engine)||'normal';
export function navalUpgradePanel({engine,activity,data,t,refresh}){
 if(!document.querySelector('[data-naval-upgrade-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./naval-upgrades.css?v=g9-20261020-1',import.meta.url).href;link.dataset.navalUpgradeStyle='';document.head.append(link);}
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text||'';if(cls)n.className=cls;return n;},panel=node('section','','naval-prep');panel.dataset.navalUpgrades='';
 const stars=engine.state.minigameProgress.navalDuel.stars.reduce((a,b)=>a+b,0);panel.append(node('h3',t('naval.upgrades.title')),node('p',`${Math.floor(engine.state.money)} 🪙 · ${stars} ★`));
 const grid=node('div','','naval-upgrade-grid'),ranks=navalUpgradeRanks(engine.state);
 for(const [name,key]of Object.entries(NAVAL_TRACKS)){const card=node('article','','naval-upgrade-card'),rank=ranks[name],offer=equipmentOffer(engine.state,data,'navalDuel',key),buy=node('button',offer.cost===undefined?t('naval.upgrades.full'):t('naval.upgrades.buy',{cost:offer.cost}), 'secondary-button');buy.type='button';buy.dataset.navalUpgrade=name;buy.disabled=!offer.ok;buy.onclick=()=>{const result=activity.upgrade('navalDuel',key);if(result.ok)refresh();};card.append(node('strong',t(`naval.upgrades.${name}`)),node('p','●'.repeat(rank)+'○'.repeat(3-rank)),node('small',t(`naval.upgrades.${name}.hint`)),buy);if(offer.stars>stars)card.append(node('small',t('naval.upgrades.stars',{stars:offer.stars})));grid.append(card);}
 const difficulty=node('div','','naval-difficulties');difficulty.setAttribute('role','group');difficulty.setAttribute('aria-label',t('naval.difficulty'));
 for(const name of ['easy','normal','hard']){const button=node('button',t('naval.difficulty.'+name),'secondary-button');button.type='button';button.dataset.navalDifficulty=name;button.setAttribute('aria-pressed',String(navalDifficulty(engine)===name));button.onclick=()=>{choices.set(engine,name);refresh();};difficulty.append(button);}panel.append(grid,difficulty);return panel;
}
