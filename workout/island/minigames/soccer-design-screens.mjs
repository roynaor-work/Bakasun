const assets=new URL('../design/screens/',import.meta.url),preferenceKey='island.soccer.kit';
const selector='[data-game-home="soccer"], [data-stage-map="soccer"]';
const installation=Symbol.for('island.soccer.designScreens');
let memorySelection='03',sequence=0;

/** These SVGs are front-view previews, not UV maps for the athlete mesh. */
export const SOCCER_DESIGN_KITS=Object.freeze([
  ['01','ירוק · פס אלכסוני','#B8F65B','#173F32'],
  ['02','אלמוג · שני פסים','#FF806C','#442D46'],
  ['03','תכלת · פס מרכזי','#78C9FF','#173653'],
  ['04','זהב · חץ רחב','#FFD16A','#4E396C'],
  ['05','סגול · חצאים','#BDB0FF','#352B5D'],
  ['06','בהיר · חגורה','#F1EDDA','#2A6472'],
  ['07','טורקיז · שלושה פסים','#59D4C3','#163D51'],
  ['08','ורוד · ריבועים','#F6ABD1','#573C60']
].map(([id,name,primary,secondary])=>Object.freeze({id,name,primary,secondary,colors:Object.freeze([primary,secondary]),shorts:primary,shortsTrim:secondary,socks:primary,socksTrim:secondary})));

function storageOrNull(){try{return globalThis.localStorage;}catch{return null;}}
function selectedId(storage=storageOrNull()){
  try{const saved=storage?.getItem(preferenceKey);if(SOCCER_DESIGN_KITS.some(kit=>kit.id===saved))return saved;}catch{}
  return memorySelection;
}

/** Home field players only; keepers and the opponent keep their contrasting kit. */
export function selectedSoccerKit({team=0,keeper=false,storage=storageOrNull()}={}){
  if(team!==0||keeper)return null;
  const id=selectedId(storage);return SOCCER_DESIGN_KITS.find(kit=>kit.id===id)||SOCCER_DESIGN_KITS[2];
}

const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
function image(path,className){const node=element('img',className);node.src=new URL(path,assets).href;node.alt='';node.decoding='async';node.draggable=false;return node;}

function kitChooser(){
  const details=element('details','soccer-design-kits'),summary=element('summary','soccer-design-kits-summary','תלבושת הקבוצה');
  details.dataset.soccerDesignKits='';details.dir='rtl';details.append(summary);
  const field=element('fieldset','soccer-design-kit-grid'),legend=element('legend','','בחירת תלבושת'),output=element('output','soccer-design-kit-current');
  output.setAttribute('aria-live','polite');field.append(legend);const selected=selectedId(),group=`soccer-design-kit-${++sequence}`;
  for(const kit of SOCCER_DESIGN_KITS){
    const label=element('label','soccer-design-kit-choice'),radio=element('input','soccer-design-kit-radio'),preview=element('span','soccer-design-kit-preview'),name=element('span','soccer-design-kit-name',kit.name),mark=element('span','soccer-design-kit-mark','✓ נבחרה');
    radio.type='radio';radio.name=group;radio.value=kit.id;radio.checked=kit.id===selected;radio.setAttribute('aria-label',kit.name);radio.dataset.soccerKit=kit.id;
    const shirt=image(`kits/soccer/${kit.id}-shirt.svg`,'soccer-design-kit-shirt'),shorts=image(`kits/soccer/${kit.id}-shorts.svg`,'soccer-design-kit-shorts');shirt.width=shorts.width=72;shirt.height=shorts.height=72;shirt.loading=shorts.loading='lazy';preview.append(shirt,shorts);mark.setAttribute('aria-hidden','true');
    radio.addEventListener('change',()=>{if(!radio.checked)return;memorySelection=kit.id;try{storageOrNull()?.setItem(preferenceKey,kit.id);}catch{}output.textContent=`נבחרה תלבושת ${kit.name}`;});
    label.append(radio,preview,name,mark);field.append(label);
  }
  details.append(field,output);return details;
}

function decorate(dialog){
  if(!dialog.matches(selector))return;
  dialog.dir='rtl';
  if(dialog.dataset.gameHome==='soccer'){
    const hero=dialog.querySelector('.adventure-game-hero');
    if(hero){
      let intro=hero.querySelector('[data-soccer-design-intro]');
      if(!intro){intro=image('intro/soccer.svg','soccer-design-intro');intro.width=intro.height=512;intro.dataset.soccerDesignIntro='';intro.setAttribute('aria-hidden','true');}
      // The native emblem is an image inside a positioned wrapper, not an SVG.
      // Replace that entire illustration so it cannot overlap menu controls.
      const category=hero.querySelector('.adventure-game-category');
      if(hero.firstElementChild!==intro||hero.children.length!==(category?2:1)){hero.replaceChildren(intro);if(category)hero.append(category);}
    }
  }
  if(!dialog.querySelector('[data-soccer-design-kits]')){
    const chooser=kitChooser(),back=dialog.querySelector('[data-action="game-home-back"], [data-action="game-library-back"]');
    if(back?.parentElement===dialog)dialog.insertBefore(chooser,back);else dialog.append(chooser);
  }
}

/** One page-lifetime observer; it only decorates the two native soccer dialogs. */
export function installSoccerDesignScreens(){
  if(typeof document==='undefined'||typeof MutationObserver==='undefined')return null;
  if(globalThis[installation])return globalThis[installation];
  let observing=false,disposed=false;
  if(!document.querySelector('link[data-soccer-design-screens]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./ultra-soccer-design.css',import.meta.url).href;link.dataset.soccerDesignScreens='';document.head.append(link);}
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.target.nodeType===1){const dialog=record.target.closest(selector);if(dialog)decorate(dialog);}
      for(const added of record.addedNodes)if(added.nodeType===1){if(added.matches(selector))decorate(added);for(const dialog of added.querySelectorAll(selector))decorate(dialog);}
    }
  });
  const start=()=>{if(disposed||observing||!document.body)return;observing=true;observer.observe(document.body,{childList:true,subtree:true});for(const dialog of document.querySelectorAll(selector))decorate(dialog);};
  const stop=()=>{observer.disconnect();observing=false;};
  const ready=()=>start();if(document.body)start();else document.addEventListener('DOMContentLoaded',ready,{once:true});
  globalThis.addEventListener?.('pagehide',stop);globalThis.addEventListener?.('pageshow',start);
  const handle={refresh:()=>{for(const dialog of document.querySelectorAll(selector))decorate(dialog);},dispose(){if(disposed)return;disposed=true;stop();document.removeEventListener('DOMContentLoaded',ready);globalThis.removeEventListener?.('pagehide',stop);globalThis.removeEventListener?.('pageshow',start);delete globalThis[installation];}};
  globalThis[installation]=handle;return handle;
}
