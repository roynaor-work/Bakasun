/** Island HUD icons v2 (Codex package design/ui-icons-v2, CC0; the runtime copies of the icons in use live in assets/ui-icons-v2).
 * Pictograms only: an icon replaces a symbol that was already there (a drawn glyph or a text character), on the same button, with the same
 * accessible name and the same size, so nothing new is laid over the play area and no caption is added.
 * Where they show (v25.0): the pause button of every game, the pause sheet (resume, sound), and the island's top bar (the coin beside the money).
 * The parents' gear stays as it was: the package's settings icon is a set of sliders on a dark plate, which stood out among the light buttons around it.
 * The icons are drawn for a dark HUD plate (#14212e), so the buttons that carry them get that plate (ui-icons.css).
 * A file that fails to load puts the earlier symbol back. ?uiIcons=0 keeps v24.9 exactly. */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function uiIconsEnabled(search=globalThis.location?.search||''){return param('uiIcons',search)!=='0';}
/** The ids copied to assets/ui-icons-v2 (normal and pressed). */
export const UI_ICONS=Object.freeze(['pause','resume','sound','mute','coin']);
export const uiIconUrl=(id,state='normal',base=import.meta.url)=>new URL(`../assets/ui-icons-v2/${state}/${id}.svg?v=island-v2-20261107-25`,base).href;
/** Decorative image of one icon (the button keeps its own aria-label). */
export function uiIcon(id,size=32,state='normal'){
 const img=document.createElement('img');img.src=uiIconUrl(id,state);img.width=size;img.height=size;img.alt='';img.decoding='async';img.draggable=false;
 img.className='ui-icon2';img.dataset.uiIcon=id;return img;
}
/** The pack icon when the kit is on and has it, otherwise (and when the file fails) whatever `fallback()` builds: the earlier symbol. */
export function uiIconOr(id,fallback,size=32,search){
 if(!uiIconsEnabled(search)||!UI_ICONS.includes(id))return fallback();
 const img=uiIcon(id,size);img.onerror=()=>{const old=fallback();if(typeof old==='string')img.replaceWith(document.createTextNode(old));else img.replaceWith(old);};
 return img;
}
/** Marks the page so ui-icons.css applies (the pause button's glyph is CSS). Call once at start. */
export function installUiIcons(root=globalThis.document?.documentElement,search){
 const on=uiIconsEnabled(search);root?.classList?.toggle('ui-icons-v2',on);return on;
}
