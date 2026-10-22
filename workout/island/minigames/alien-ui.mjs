import {dataURL} from '../release.mjs?v=naval-art-20261022-1';

const paths={fire:'m14 2-9 12h6l-1 8 9-13h-6Z',nova:'M12 2C8 5 8 9 8 16h8c0-7 0-11-4-14ZM8 10l-4 7 4-1m8-6 4 7-4-1M10 19l2 3 2-3M10.5 8h3',pause:'M8 4v16M16 4v16',repair:'m14 4 2 4 4 2-5 5-4-4-7 7-2-2 7-7-4-4 5-5',upgrade:'m12 3 8 9h-5v9H9v-9H4Z',paint:'M12 3C10 6 5 10 5 15a7 7 0 0 0 14 0c0-5-5-9-7-12Z',hand:'M4 12h16m-5-5 5 5-5 5M4 5v14',play:'m7 3 14 9-14 9Z',shield:'m12 3 9 4-2 9-7 5-7-5-2-9Z'};
export function alienIcon(kind){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 if(kind==='nova'){
  svg.setAttribute('viewBox','0 0 32 32');
  for(const [d,fill]of [
   ['M11 14 5 24l6-2m10-8 6 10-6-2','#bfe9ff'],
   ['M16 2C11 7 11 12 11 22h10C21 12 21 7 16 2Z','#fff9e8'],
   ['m13 25 3 6 3-6Z','#ffea76']
  ]){
   const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',d);shape.setAttribute('fill',fill);shape.setAttribute('stroke','#51291e');shape.setAttribute('stroke-width','1.2');shape.setAttribute('stroke-linejoin','round');svg.append(shape);
  }
  const window=document.createElementNS(svg.namespaceURI,'circle');window.setAttribute('cx','16');window.setAttribute('cy','12');window.setAttribute('r','2.6');window.setAttribute('fill','#398fa8');svg.append(window);return svg;
 }
 const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.upgrade);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.8');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
}
export function alienHandedness(c){try{const hand=localStorage.getItem(c.handednessKey);return hand===null?c.rightHanded:hand==='right';}catch{return c.rightHanded;}}

// These preflight screens belong to the shared UI. Decorate only alien-owned
// nodes, so parallel games need no edits to that UI or the shared stylesheet.
if(typeof document!=='undefined'){
 for(const file of ['./alien.css','./g2p-alien.css?v=naval-art-20261022-1']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url).href;document.head.append(link);}
 void Promise.all([fetch(dataURL('data/config.json')).then(r=>r.json()),fetch(dataURL('data/strings.he.json')).then(r=>r.json())]).then(([config,strings])=>{
  const c=config.minigames.alienDefense.controls;
  const decorate=()=>{
   for(const dialog of document.querySelectorAll('.modal')){
    const intro=dialog.querySelector('[data-action=game-understood]')&&dialog.querySelector('h2')?.textContent===strings['minigame.alienDefense'];
    if(dialog.dataset.stageMap!=='alienDefense'&&dialog.dataset.hangar!=='true'&&!intro)continue;
    if(!dialog.querySelector('[data-alien-hand]')){
     const label=document.createElement('div');label.className='alien-hand';label.dataset.alienHand='true';const input=document.createElement('button');input.type='button';input.setAttribute('role','switch');input.setAttribute('aria-label',strings['alien.stickSide']);let right=alienHandedness(c);const text=document.createElement('span');const update=()=>{input.setAttribute('aria-checked',String(right));text.textContent=strings[right?'alien.stickLeft':'alien.stickRight'];};
     input.onclick=()=>{right=!right;try{localStorage.setItem(c.handednessKey,right?'right':'left');}catch{}update();};update();input.append(alienIcon('hand'));label.append(input,text);dialog.append(label);
    }
    if(dialog.dataset.hangar==='true')for(const button of dialog.querySelectorAll('.hangar-actions button,.hangar-choices button,[data-action=hangar-play]')){
     if(button.dataset.alienIcon)continue;button.dataset.alienIcon='true';const kind=button.dataset.action.replace('hangar-',''),name=button.textContent;button.setAttribute('aria-label',name);button.title=name;button.replaceChildren(alienIcon(kind==='rapid'?'fire':kind));
    }
   }
  };
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});decorate();
 }).catch(()=>{});
}
