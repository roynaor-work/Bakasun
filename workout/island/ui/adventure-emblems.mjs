import {DATA_VERSION} from '../release.mjs?v=island-nitro-20261025-1';
/** Frames captured from the real game scenes. Replace the WebP files to
 * update the library after a game-art delivery; no UI changes are needed. */
const ARTWORK=Object.freeze({
  navalDuel:{file:'naval.webp',category:'ים פתוח',description:'קרב ספינות בין איים, מול צי היריב.'},
  fireRescue:{file:'fire.webp',category:'חילוץ והצלה',description:'צוות כיבוי, רחובות העיר ומשימת הצלה.'},
  alienDefense:{file:'space.webp',category:'חלל',description:'טיסת הגנה מול טייסת החייזרים.'},
  soccer:{file:'football.webp',category:'ספורט',description:'הקבוצה שלך, המגרש והדרך לאליפות.'},
  tennis:{file:'tennis.webp',category:'ספורט',description:'משחק טניס במגרש של האי.'},
  islandRacing:{file:'racing.webp',category:'מרוצים',description:'מרוץ תלת־ממדי בין חופים, ג׳ונגלים ופסגות מול ארבעה נהגים.'},
});

export function gameArtwork(id){return ARTWORK[id]||ARTWORK.navalDuel;}

export function gameEmblem(id){
  const art=gameArtwork(id),holder=document.createElement('div'),image=document.createElement('img');
  holder.className='adventure-emblem';holder.dataset.scene=id;holder.setAttribute('aria-hidden','true');
  const url=new URL('../assets/ultra-hub/'+art.file,import.meta.url);url.searchParams.set('v',DATA_VERSION);image.src=url.href;
  image.alt='';image.width=960;image.height=600;image.decoding='async';image.draggable=false;
  // A missing capture stays a quiet surface, without substituting a drawing
  // for the game's real assets. The game entry remains available.
  image.onerror=()=>{holder.dataset.preview='unavailable';image.hidden=true;};
  holder.append(image);return holder;
}
