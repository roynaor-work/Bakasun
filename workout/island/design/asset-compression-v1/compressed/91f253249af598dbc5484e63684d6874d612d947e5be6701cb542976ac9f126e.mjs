/** Authored basketball opening art and an optional, cosmetic uniform picker.
 * SVGs are preview assets, not GLB UV maps: the chosen manifest palette/pattern
 * is handed to the view through onKit without touching match state or saves. */
let screenId=0;
export function createHoopsScreens({stageEl,loading,teams=[],onOpen=()=>{},onClose=()=>{},onKit=()=>{},fetcher=globalThis.fetch}={}){
 const doc=stageEl.ownerDocument,abort=new AbortController(),events={signal:abort.signal};
 const base=new URL('../design/screens/',import.meta.url);
 let disposed=false,opened=false,selected=null,kits=[],returnFocus=null;
 const node=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const picture=(path,cls)=>{const img=node('img',cls);img.src=new URL(path,base).href;img.alt='';img.draggable=false;img.width=256;img.height=256;return img;};
 const intro=picture('intro/hoops.svg','hoops-intro-art');intro.width=512;intro.height=512;intro.setAttribute('aria-hidden','true');loading?.prepend(intro);
 const trigger=node('button','hoops-kit-trigger');trigger.type='button';trigger.hidden=true;trigger.setAttribute('aria-label','תלבושות');trigger.title='תלבושות';trigger.setAttribute('aria-expanded','false');
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');
 const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M11 5H7L5 13l5 3v12h12V16l5-3-2-8h-4c0 5-10 5-10 0ZM11 5c0 5 10 5 10 0M13 14h6M16 14v9');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linejoin','round');path.setAttribute('stroke-linecap','round');svg.append(path);trigger.append(svg);
 const overlay=node('div','hoops-kit-overlay');overlay.hidden=true;overlay.dir='rtl';
 const dialog=node('section','hoops-kit-dialog');dialog.id='hoops-kit-dialog-'+(++screenId);dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;trigger.setAttribute('aria-controls',dialog.id);
 const head=node('div','hoops-kit-head'),title=node('h2','hoops-kit-title','תלבושת הקבוצה שלי');title.id=dialog.id+'-title';dialog.setAttribute('aria-labelledby',title.id);
 const closeButton=node('button','hoops-kit-close','×');closeButton.type='button';closeButton.setAttribute('aria-label','סגירת תלבושות');head.append(title,closeButton);
 const team=node('p','hoops-kit-team',teams[0]?.name||teams[0]?.look?.name||'');const grid=node('div','hoops-kit-grid');
 dialog.append(head,team,grid);overlay.append(dialog);stageEl.append(trigger,overlay);
 function open(){
  if(disposed||opened||!kits.length)return false;
  returnFocus=doc.activeElement;opened=true;overlay.hidden=false;trigger.setAttribute('aria-expanded','true');onOpen();
  (grid.querySelector('[aria-pressed=true]')||grid.querySelector('button')||closeButton).focus();return true;
 }
 function close({notify=true,focus=true}={}){
  if(!opened)return;opened=false;overlay.hidden=true;trigger.setAttribute('aria-expanded','false');
  if(notify)onClose();
  if(focus&&returnFocus?.isConnected)returnFocus.focus();
 }
 trigger.addEventListener('click',()=>opened?close():open(),events);
 closeButton.addEventListener('click',()=>close(),events);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();},events);
 doc.addEventListener('keydown',event=>{
  if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(event.key!=='Tab')return;
  const buttons=[...dialog.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);
  if(!buttons.length){event.preventDefault();dialog.focus();return;}
  if(event.shiftKey&&(doc.activeElement===first||!dialog.contains(doc.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(doc.activeElement===last||!dialog.contains(doc.activeElement))){event.preventDefault();first.focus();}
 },{...events,capture:true});
 const ready=(async()=>{
  try{
   const res=await fetcher(new URL('manifest.json',base),{signal:abort.signal});if(!res.ok)throw Error('uniform manifest unavailable');
   const manifest=await res.json();if(disposed)return false;
   kits=manifest.kits.filter(kit=>kit.sport==='hoops');
   for(const kit of kits){
    const button=node('button','hoops-kit-option');button.type='button';button.dataset.hoopsKit=kit.id;button.setAttribute('aria-label','תלבושת '+kit.label);button.setAttribute('aria-pressed','false');
    const preview=node('span','hoops-kit-preview');preview.append(picture(kit.shirt,'hoops-kit-shirt'),picture(kit.shorts,'hoops-kit-shorts'));
    button.append(preview,node('span','hoops-kit-label',kit.label));
    button.addEventListener('click',()=>{selected=kit;for(const other of grid.children)other.setAttribute('aria-pressed',String(other===button));onKit(kit,0);close();},events);grid.append(button);
   }
   trigger.hidden=!kits.length;return !!kits.length;
  }catch{return false;}
 })();
 return {open,close,ready,elements:{intro,trigger,overlay,dialog,grid},get opened(){return opened;},get selectedKit(){return selected;},
  dispose(){if(disposed)return;disposed=true;close({notify:false,focus:false});abort.abort();intro.remove();trigger.remove();overlay.remove();},
 };
}
