// "Install the app" for the island (offline v25): keeps the browser's install prompt
// (beforeinstallprompt) from the moment the page opens, knows when the island already
// runs installed, and tells iOS users the share-sheet route (Safari has no prompt).
// game-shell.mjs keeps its own copy of the prompt for the game screens; both may hold
// the same event, only the first prompt() call wins and the other falls back to help.
let deferred=null,installed=false;const listeners=new Set();
const notify=()=>{for(const fn of listeners)try{fn(installState());}catch{}};
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;notify();});
  window.addEventListener('appinstalled',()=>{deferred=null;installed=true;notify();});
}
export const isIOS=(ua=globalThis.navigator?.userAgent||'',platform=globalThis.navigator?.platform||'',touch=globalThis.navigator?.maxTouchPoints||0)=>/iPad|iPhone|iPod/.test(ua)||(platform==='MacIntel'&&touch>1);
/** Opened from the home screen (any display mode but a browser tab), or iOS "standalone". */
export function isStandalone(){
  try{if(globalThis.navigator?.standalone===true)return true;if(typeof matchMedia!=='function')return false;return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||matchMedia('(display-mode: minimal-ui)').matches;}catch{return false;}
}
/** 'installed' | 'prompt' (a native prompt is ready) | 'ios' (share sheet) | 'manual' (browser menu). */
export function installState(){if(installed||isStandalone())return 'installed';if(deferred)return 'prompt';if(isIOS())return 'ios';return 'manual';}
export function onInstallChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
/** Show the native prompt. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall(){
  const event=deferred;if(!event)return 'unavailable';deferred=null;
  try{await event.prompt();const choice=await event.userChoice;notify();return choice?.outcome==='accepted'?'accepted':'dismissed';}catch{notify();return 'unavailable';}
}
export const INSTALL_TEXT=Object.freeze({
  installed:'האפליקציה מותקנת במכשיר. היא נפתחת מהאייקון גם בלי רשת.',
  prompt:'התקנה קבועה: אייקון על המסך, פתיחה במסך מלא, בלי סרגל דפדפן.',
  ios:'ב־Safari: לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), ואז ״הוספה למסך הבית״ ← ״הוספה״. הקיצור הישן אפשר למחוק.',
  manual:'בתפריט הדפדפן (שלוש נקודות) בוחרים ״התקנת אפליקציה״ או ״הוספה למסך הבית״, ואז פותחים מהאייקון החדש.',
});
/** For tests and for the panel: what makes manifest.webmanifest installable. */
export function installableManifest(manifest){
  const problems=[];
  if(!manifest?.name)problems.push('name');
  if(!manifest?.start_url)problems.push('start_url');
  if(!manifest?.id)problems.push('id');
  if(!['standalone','fullscreen','minimal-ui'].includes(manifest?.display))problems.push('display');
  const icons=manifest?.icons||[],has=size=>icons.some(i=>i.type==='image/png'&&String(i.sizes||'').split(/\s+/).includes(size));
  if(!has('192x192'))problems.push('icon 192');if(!has('512x512'))problems.push('icon 512');
  if(!icons.some(i=>/maskable/.test(i.purpose||'')))problems.push('maskable icon');
  return {ok:problems.length===0,problems};
}
