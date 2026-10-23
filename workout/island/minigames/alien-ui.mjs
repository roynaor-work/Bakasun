import {dataURL} from '../release.mjs?v=island-ultra-20261023-1';

const paths={fire:'m14 2-9 12h6l-1 8 9-13h-6Z',nova:'M12 2C8 5 8 9 8 16h8c0-7 0-11-4-14ZM8 10l-4 7 4-1m8-6 4 7-4-1M10 19l2 3 2-3M10.5 8h3',pause:'M8 4v16M16 4v16',repair:'m14 4 2 4 4 2-5 5-4-4-7 7-2-2 7-7-4-4 5-5',upgrade:'m12 3 8 9h-5v9H9v-9H4Z',paint:'M12 3C10 6 5 10 5 15a7 7 0 0 0 14 0c0-5-5-9-7-12Z',hand:'M4 12h16m-5-5 5 5-5 5M4 5v14',play:'m7 3 14 9-14 9Z',shield:'m12 3 9 4-2 9-7 5-7-5-2-9Z'};
export function alienIcon(kind){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.upgrade);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.8');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
}
export function alienHandedness(c){try{const hand=localStorage.getItem(c.handednessKey);return hand===null?c.rightHanded:hand==='right';}catch{return c.rightHanded;}}

// These preflight screens belong to the shared UI. Decorate only alien-owned
// nodes, so parallel games need no edits to that UI or the shared stylesheet.
if(typeof document!=='undefined'){
 for(const file of ['./alien.css','./g2p-alien.css?v=island-ultra-20261023-1']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url).href;document.head.append(link);}
 void Promise.all([fetch(dataURL('data/config.json')).then(r=>r.json()),fetch(dataURL('data/strings.he.json')).then(r=>r.json())]).then(([config,strings])=>{
  const c=config.minigames.alienDefense.controls;
  const decorate=()=>{
   for(const rotate of document.querySelectorAll('.game-screen[data-game=alienDefense] .soccer-rotate')){
    if(rotate.dataset.alienDecorated)continue;rotate.dataset.alienDecorated='true';
    const title=document.createElement('h3'),hint=document.createElement('p'),pause=rotate.querySelector('[data-action=game-rotate-pause]');
    title.textContent='מסובבים את הטלפון';hint.textContent='משחקים במצב רוחב כדי לראות את כל הזירה';
    rotate.insertBefore(title,pause);rotate.insertBefore(hint,pause);
    if(pause){const label=document.createElement('span');label.textContent='תפריט השהיה';pause.replaceChildren(alienIcon('pause'),label);}
   }
   for(const dialog of document.querySelectorAll('.modal')){
    const intro=dialog.querySelector('[data-action=game-understood]')&&dialog.querySelector('h2')?.textContent===strings['minigame.alienDefense'];
    if(dialog.dataset.stageMap!=='alienDefense'&&dialog.dataset.hangar!=='true'&&!intro)continue;
    dialog.dataset.alienPresentation='true';
    if(!dialog.querySelector('[data-alien-hand]')){
     const label=document.createElement('div');label.className='alien-hand';label.dataset.alienHand='true';const input=document.createElement('button');input.type='button';input.setAttribute('role','switch');input.setAttribute('aria-label',strings['alien.stickSide']);let right=alienHandedness(c);const text=document.createElement('span');const update=()=>{input.setAttribute('aria-checked',String(right));text.textContent=strings[right?'alien.stickLeft':'alien.stickRight'];};
     input.onclick=()=>{right=!right;try{localStorage.setItem(c.handednessKey,right?'right':'left');}catch{}update();};update();input.append(alienIcon('hand'));label.append(input,text);dialog.append(label);
    }
    if(dialog.dataset.hangar==='true'){
     const stats=dialog.querySelector(':scope > p:not(.modal-subtitle)');
     if(stats&&!stats.dataset.alienStats){
      stats.dataset.alienStats='true';const values=stats.textContent.split(' · ');
      if(values.length===3)stats.replaceChildren(...values.map(value=>{
       const [name,...parts]=value.split(':'),item=document.createElement('span'),label=document.createElement('small'),amount=document.createElement('bdi');label.textContent=name;amount.textContent=parts.join(':').trim();item.append(label,amount);return item;
      }));
     }
     for(const button of dialog.querySelectorAll('.hangar-actions button,.hangar-choices button,[data-action=hangar-play]')){
      if(button.dataset.alienIcon)continue;button.dataset.alienIcon='true';const kind=button.dataset.action.replace('hangar-',''),name=kind==='paint'?'תאורת רציף':button.textContent,label=document.createElement('span');label.textContent=name;button.setAttribute('aria-label',kind==='paint'?'צבע תאורת רציף':name);button.title=kind==='paint'?'החלפת צבע תאורת הרציף':name;button.replaceChildren(alienIcon(kind==='rapid'?'fire':kind),label);
     }
    }
   }
  };
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});decorate();
 }).catch(()=>{});
}
