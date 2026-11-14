/** Aliens v23: the Vulcan button (Roy, 13/11/2026: "Vulcan fire that heats up, and the regular fire on another button").
 * Alien-owned DOM next to the shared controls: the fire button (#shoot, shared controls) stays the steady cannon; this
 * module adds #vulcan with its own pointer (multi-touch: each button keeps its own finger), the Z key, and a heat ring
 * on the button (green, yellow, red; red blink while locked). sample() is read once per simulation frame, and a press
 * that starts and ends between two frames still counts once. Only created when the model runs v23 (?alienFire=v15 keeps
 * the single v22 button). */
import {vulcanLevel,vulcanBlink,V23_DEFAULTS} from './alien-v23.mjs?v=island-v2-20261107-11';

const VULCAN_ICON='M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M10.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M15.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M12.9 16.33a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M7.9 16.33a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M5.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M7.9 7.67a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M12.9 7.67a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0';
let styled=false;
function ensureStyle(doc){
 if(styled||!doc?.head)return;styled=true;
 const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./alien-v23.css?v=island-v2-20261107-11',import.meta.url).href;doc.head.append(link);
}
export function vulcanIcon(doc=globalThis.document){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',VULCAN_ICON);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');svg.append(p);return svg;
}
/** The Vulcan button and its input. controls = the game's controls root (.alien-controls). */
export function createAlienVulcan({controls,cfg=V23_DEFAULTS,label='וולקן',lockedLabel='וולקן מתקרר',regularLabel='ירי רגיל',onGesture=()=>{},windowTarget=globalThis.window,documentTarget=globalThis.document}={}){
 ensureStyle(documentTarget);
 const abort=new AbortController(),options={signal:abort.signal};
 const button=documentTarget.createElement('button');button.type='button';button.id='vulcan';button.className='control-vulcan alien-vulcan';button.dataset.gameControl='vulcan';
 button.setAttribute('aria-label',label);button.title=label;button.dataset.level='green';button.dataset.blink='off';button.style.setProperty('--heat','0%');
 const ring=documentTarget.createElement('span');ring.className='alien-vulcan-ring';ring.setAttribute('aria-hidden','true');
 // A short word under each fire button, so a child knows which is which on the first round.
 const caption=text=>{const node=documentTarget.createElement('small');node.className='alien-fire-caption';node.setAttribute('aria-hidden','true');node.textContent=text;return node;};
 button.append(ring,vulcanIcon(documentTarget),caption(label));
 const shoot=controls.querySelector('#shoot'),shootCaption=shoot?caption(regularLabel):null;if(shootCaption)shoot.append(shootCaption);
 controls.dataset.alienFire='v23';controls.append(button);
 let enabled=false,pointer=null,pulse=false,keyHeld=false,lastLevel='green',lastBlink='off',lastPct=-1,lastLocked=false;
 const visual=()=>button.classList.toggle('held',pointer!==null||keyHeld);
 function release(id){try{if(button.hasPointerCapture?.(id))button.releasePointerCapture(id);}catch{}}
 function reset(){if(pointer!==null)release(pointer);pointer=null;pulse=false;keyHeld=false;visual();}
 button.addEventListener('pointerdown',event=>{
  if(!enabled||pointer!==null||event.button>0)return;event.preventDefault();onGesture();
  pointer=event.pointerId;pulse=true;try{button.setPointerCapture(event.pointerId);}catch{}visual();
 },options);
 button.addEventListener('pointerup',event=>{if(event.pointerId!==pointer)return;release(event.pointerId);pointer=null;visual();},options);
 for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,event=>{if(event.pointerId!==pointer)return;pointer=null;if(type==='pointercancel')pulse=false;visual();},options);
 // The shared controls ignore this key, so the Vulcan key never reaches the steady cannon (and Space never reaches the Vulcan).
 windowTarget?.addEventListener('keydown',event=>{
  if(!enabled||event.code!==cfg.vulcanKey||event.target?.matches?.('input,select,textarea,[contenteditable=true]'))return;
  event.preventDefault();if(event.repeat)return;onGesture();keyHeld=true;pulse=true;visual();
 },options);
 windowTarget?.addEventListener('keyup',event=>{if(event.code!==cfg.vulcanKey)return;keyHeld=false;visual();},options);
 windowTarget?.addEventListener('blur',reset,options);
 return {
  button,
  /** Held this frame (finger on the button, the key down, or a press shorter than a frame). Clears the press pulse. */
  sample(){const held=enabled&&(pulse||pointer!==null||keyHeld);pulse=false;return held;},
  get held(){return pointer!==null||keyHeld;},
  /** Ring on the button: fill = heat, colour = band, red blink while locked (same phase as the bar next to the ship). */
  update(model){
   const locked=Boolean(model.vulcanLocked),heat=Math.max(0,Math.min(1,model.vulcanHeat||0)),level=vulcanLevel(heat,locked,cfg),blink=vulcanBlink(model.time||0,locked)?'on':'off',pct=Math.round(heat*100);
   if(level!==lastLevel){button.dataset.level=lastLevel=level;}
   if(blink!==lastBlink){button.dataset.blink=lastBlink=blink;}
   if(pct!==lastPct){lastPct=pct;button.style.setProperty('--heat',`${pct}%`);}
   if(locked!==lastLocked){lastLocked=locked;button.dataset.locked=String(locked);button.setAttribute('aria-label',locked?lockedLabel:label);}
  },
  setEnabled(value){enabled=Boolean(value);if(!enabled)reset();},
  reset,
  dispose(){enabled=false;reset();abort.abort();button.remove();shootCaption?.remove();delete controls.dataset.alienFire;}
 };
}
