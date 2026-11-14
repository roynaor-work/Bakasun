/** Aliens v25 HUD pieces (DOM; the rules are in alien-v25-arsenal.mjs).
 *  - The special button (#pass, the missile button so far) fires the selected special weapon; its icon and its count follow the selection.
 *  - A small round switch beside it (#special-switch, 46 px, the C key) shows the NEXT weapon and its charges; a tap selects it.
 *  - alien-v25.css: the same three rings from the bottom corner up (reachable), the switch on the inner side of the special button, and no
 *    text block next to the stick (the short notices move to the top centre). Only with the v24 HUD rings and without ?alienHud=v24. */
import {SPECIALS,nextSpecial} from './alien-v25-arsenal.mjs?v=island-v2-20261107-14';
let styled=false;
export function ensureAlienV25Style(doc=globalThis.document){if(styled||!doc?.head)return;styled=true;const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./alien-v25.css?v=island-v2-20261107-14',import.meta.url).href;doc.head.append(link);}
const PATHS={
 lightning:'M13.5 2.5 5.5 13.2h5.6l-1.8 8.3 9.2-12.1h-5.8z',
 shockwave:'M3 15.5a9 9 0 0 1 18 0M6.4 15.5a5.6 5.6 0 0 1 11.2 0M9.8 15.5a2.2 2.2 0 0 1 4.4 0',
 missile:'M12 2.5c2 1.6 3 4.3 3 7.6v5.4l2.6 2.9v2.1l-3.6-1.4H10l-3.6 1.4v-2.1L9 15.5v-5.4c0-3.3 1-6 3-7.6zM12 8.3v3.4'
};
/** A stroke icon for a special weapon (the missile has its own icon in alien-ui; this one is for the switch). */
export function specialIcon(kind,doc=globalThis.document){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.dataset.special=kind;
 const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',PATHS[kind]||PATHS.missile);p.setAttribute('fill',kind==='lightning'?'currentColor':'none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
}
/** The switch and the special button's face. missileIcon: the node the session put in #pass for the missile (kept for the missile). */
export function createAlienSpecialSwitch({controls,special,missileIcon,labels={},onGesture=()=>{},windowTarget=globalThis.window,documentTarget=globalThis.document,key='KeyC'}={}){
 const abort=new AbortController(),options={signal:abort.signal};
 const button=documentTarget.createElement('button');button.type='button';button.id='special-switch';button.className='alien-special-switch';button.dataset.gameControl='special-switch';
 const icons=Object.fromEntries(SPECIALS.map(k=>[k,specialIcon(k,documentTarget)])),count=documentTarget.createElement('small');count.className='alien-switch-count';count.setAttribute('aria-hidden','true');
 button.append(icons[SPECIALS[1]],count);controls.append(button);
 const faces=Object.fromEntries(SPECIALS.map(k=>[k,k==='missile'?missileIcon:specialIcon(k,documentTarget)]));
 let enabled=false,pulse=false,shownNext=null,shownSelected='missile',lastCount='';
 button.addEventListener('pointerdown',event=>{if(!enabled||event.button>0)return;event.preventDefault();onGesture();pulse=true;},options);
 windowTarget?.addEventListener('keydown',event=>{if(!enabled||event.code!==key||event.repeat||event.target?.matches?.('input,select,textarea,[contenteditable=true]'))return;event.preventDefault();onGesture();pulse=true;},options);
 return {
  button,
  /** True once per press (the model reads it as an edge). */
  sample(){const p=enabled&&pulse;pulse=false;return p;},
  /** Faces: the special button shows the selected weapon, the switch the next one and its charges. */
  update(model){
   const selected=SPECIALS[model.special]||'missile',next=SPECIALS[nextSpecial(model.special)],ammo=model.specialAmmo||[];
   if(selected!==shownSelected&&special){const old=special.querySelector(`svg`);const face=faces[selected];if(old&&face&&old!==face)old.replaceWith(face);shownSelected=selected;special.dataset.special=selected;special.setAttribute('aria-label',labels[selected]||selected);}
   if(next!==shownNext){button.querySelector('svg')?.replaceWith(icons[next]);shownNext=next;button.dataset.next=next;button.setAttribute('aria-label',(labels.switch||'החלפת נשק')+': '+(labels[next]||next));}
   const c=String(ammo[nextSpecial(model.special)]??'');if(c!==lastCount){count.textContent=c;lastCount=c;}
   controls.dataset.alienSpecial=selected;
  },
  setEnabled(value){enabled=Boolean(value);if(!enabled)pulse=false;},
  dispose(){enabled=false;abort.abort();button.remove();delete controls.dataset.alienSpecial;if(special&&missileIcon&&shownSelected!=='missile'){special.querySelector('svg')?.replaceWith(missileIcon);}}
 };
}
