import {equipmentOffer} from '../activity/equipment.mjs?v=island-naval-aim-20261030-1';
// Keep the five established save slots valid, including legacy shield purchases.
// The four visible tracks reuse hull/damage/rate/ammo, so v15 saves need no migration.
export const NAVAL_TRACKS=Object.freeze({hull:'hull',cannon:'damage',aim:'rate',speed:'ammo'});
export function navalUpgradeRanks(state){const saved=state?.minigameEquipment?.navalDuel||{};return Object.fromEntries(Object.entries(NAVAL_TRACKS).map(([name,key])=>[name,Math.max(0,Math.min(3,Number.isInteger(saved[key])?saved[key]:0))]));}
const choices=new WeakMap();
export const navalDifficulty=engine=>choices.get(engine)||'normal';
export function ensureNavalTheme(){
 if(!document.querySelector('[data-naval-upgrade-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./naval-upgrades.css?v=island-naval-aim-20261030-1',import.meta.url).href;link.dataset.navalUpgradeStyle='';document.head.append(link);}
 if(!document.querySelector('[data-naval-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./naval.css?v=island-naval-aim-20261030-1',import.meta.url).href;link.dataset.navalStyle='';document.head.append(link);}
}
const upgradeMarks={hull:'M8 26h48l-8 17H18ZM19 26V16h23v10M26 16V9h10v7M7 51q8-6 16 0t16 0 17 0',cannon:'m15 35 31-18 4 7-31 18ZM22 39l9 11H11ZM40 15l5-3 8 13-5 3M7 53h46',aim:'M32 6v11M32 47v11M6 32h11M47 32h11M32 13a19 19 0 1 0 0 38 19 19 0 0 0 0-38ZM32 25a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',speed:'m27 13 16 19-16 19M12 17l13 15-13 15M43 21l10 11-10 11'};
function upgradeMark(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');svg.classList.add('naval-upgrade-mark');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',upgradeMarks[name]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linejoin','round');path.setAttribute('stroke-linecap','round');svg.append(path);return svg;}
export function navalUpgradePanel({engine,activity,data,t,refresh}){
 ensureNavalTheme();
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text||'';if(cls)n.className=cls;return n;},panel=node('section','','naval-prep');panel.dataset.navalUpgrades='';
 const stars=engine.state.minigameProgress.navalDuel.stars.reduce((a,b)=>a+b,0),heading=node('div','','naval-prep-heading'),resources=node('div','','naval-resources');resources.append(node('span',`${Math.floor(engine.state.money)} 🪙`),node('span',`${stars} ★`));heading.append(node('h3',t('naval.upgrades.title')),resources);panel.append(heading);
 const grid=node('div','','naval-upgrade-grid'),ranks=navalUpgradeRanks(engine.state);
 for(const [name,key]of Object.entries(NAVAL_TRACKS)){const card=node('article','','naval-upgrade-card'),rank=ranks[name],offer=equipmentOffer(engine.state,data,'navalDuel',key),buy=node('button',offer.cost===undefined?t('naval.upgrades.full'):t('naval.upgrades.buy',{cost:offer.cost}), 'secondary-button');buy.type='button';buy.dataset.navalUpgrade=name;buy.disabled=!offer.ok;buy.onclick=()=>{const result=activity.upgrade('navalDuel',key);if(result.ok)refresh();};const levels=node('p','','naval-upgrade-rank');levels.setAttribute('aria-label',`${rank} / 3`);for(let i=0;i<3;i++){const segment=node('i');segment.dataset.earned=String(i<rank);segment.setAttribute('aria-hidden','true');levels.append(segment);}card.append(upgradeMark(name),node('strong',t(`naval.upgrades.${name}`)),levels,node('small',t(`naval.upgrades.${name}.hint`)),buy);if(offer.stars>stars)card.append(node('small',t('naval.upgrades.stars',{stars:offer.stars})));grid.append(card);}
 const difficulty=node('div','','naval-difficulties');difficulty.setAttribute('role','group');difficulty.setAttribute('aria-label',t('naval.difficulty'));
 for(const name of ['easy','normal','hard']){const button=node('button',t('naval.difficulty.'+name),'secondary-button');button.type='button';button.dataset.navalDifficulty=name;button.setAttribute('aria-pressed',String(navalDifficulty(engine)===name));button.onclick=()=>{choices.set(engine,name);refresh();};difficulty.append(button);}const difficultyWrap=node('div','','naval-difficulty-wrap');difficultyWrap.append(node('span',t('naval.difficulty'),'naval-difficulty-label'),difficulty);
 // Aiming side: the same per-game hand setting the other island games use.
 const key=data.config.minigames.navalDuel.aimControls?.handednessKey,handWrap=node('div','','naval-difficulty-wrap naval-hand-wrap'),hand=node('button','','secondary-button naval-hand');hand.type='button';hand.dataset.navalHand='';
 let right=data.config.minigames.navalDuel.controls?.rightHanded!==false;try{const saved=localStorage.getItem(key);if(saved==='left'||saved==='right')right=saved==='right';}catch{}
 const render=()=>{hand.textContent=t(right?'naval.hand.right':'naval.hand.left');hand.setAttribute('aria-pressed',String(!right));hand.dataset.side=right?'right':'left';};
 hand.onclick=()=>{right=!right;try{localStorage.setItem(key,right?'right':'left');}catch{}render();};render();handWrap.append(node('span',t('naval.hand.title'),'naval-difficulty-label'),hand);
 const buzzWrap=node('div','','naval-difficulty-wrap naval-hand-wrap'),buzz=node('button','','secondary-button naval-hand');buzz.type='button';buzz.dataset.navalVibration='';
 let buzzOn=true;try{buzzOn=localStorage.getItem('island.naval.vibration')!=='off';}catch{}
 const renderBuzz=()=>{buzz.textContent=t(buzzOn?'naval.vibration.on':'naval.vibration.off');buzz.setAttribute('aria-pressed',String(buzzOn));};
 buzz.onclick=()=>{buzzOn=!buzzOn;try{localStorage.setItem('island.naval.vibration',buzzOn?'on':'off');}catch{}renderBuzz();};renderBuzz();buzzWrap.append(node('span',t('naval.vibration.title'),'naval-difficulty-label'),buzz);
 panel.append(grid,difficultyWrap,handWrap,buzzWrap);return panel;
}
