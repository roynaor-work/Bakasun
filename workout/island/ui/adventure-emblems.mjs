import {DATA_VERSION} from '../release.mjs?v=island-v2-20261107-12';
import {kitGameIcon,kitIntro} from './ui-kit.mjs?v=island-v2-20261107-12';
/** Frames captured from the real game scenes. Replace the WebP files to
 * update the library after a game-art delivery; no UI changes are needed. */
const ARTWORK=Object.freeze({
  boarDefense:{isNew:true,file:'boars.webp',category:'הגנת החוף',description:'אי החזירים — הגנת החווה: עמדת ירי בגוף ראשון מול פלישת חזירים רובוטיים, נשקים, בוסים ומוסך.'},
  catchCriminal:{file:'catch.webp',category:'עיר ובטחון',description:'תפוס את הפושע: זורקים רשת או חבל על פושע שבורח ברחובות העיר, עם רוח, מכשולים ושלוש זריקות.'},
  navalDuel:{file:'naval.webp',category:'ים פתוח',description:'קרב ספינות בין איים, מול צי היריב.'},
  fireRescue:{file:'fire.webp',category:'חילוץ והצלה',description:'צוות כיבוי, רחובות העיר ומשימת הצלה.'},
  alienDefense:{file:'space.webp',category:'חלל',description:'טיסת הגנה מול טייסת החייזרים.'},
  soccer:{file:'football.webp',category:'ספורט',description:'הקבוצה שלך, המגרש והדרך לאליפות.'},
  tennis:{file:'tennis.webp',category:'ספורט',description:'משחק טניס במגרש של העיר.'},
  islandRacing:{file:'racing.webp',category:'מרוצים',description:'מרוץ תלת־ממדי בין חופים, ג׳ונגלים ופסגות מול ארבעה נהגים.'},
  streetSlam:{file:'hoops.webp',category:'ספורט',description:'כדורסל מקצועי חמישה נגד חמישה באולם, עם קבוצה, אימונים ועונה.'},
  alpineRush:{file:'alpine.webp',category:'ספורט חורף',description:'מרוץ סנובורד בתלת־ממד מול חמישה גולשים, בשלושה מסלולים בהר.'},
});

export function gameArtwork(id){return ARTWORK[id]||ARTWORK.navalDuel;}

export function gameEmblem(id){
  const art=gameArtwork(id),holder=document.createElement('div'),image=document.createElement('img');
  holder.className='adventure-emblem';holder.dataset.scene=id;holder.setAttribute('aria-hidden','true');
  const url=new URL('../assets/ultra-hub/'+art.file,import.meta.url);url.searchParams.set('v',DATA_VERSION);image.src=url.href;
  image.alt='';image.width=960;image.height=600;image.decoding='async';image.draggable=false;
  // A missing capture stays a quiet surface, without substituting a drawing
  // for the game's real assets. The game entry remains available.
  image.onerror=()=>{holder.dataset.preview='unavailable';image.hidden=true;const card=kitIntro(id);if(card)holder.append(card);};
  holder.append(image);
  // The kit's game symbol sits on the card corner; a missing file simply leaves the capture alone.
  const icon=kitGameIcon(id,30);if(icon){const badge=document.createElement('span');badge.className='adventure-kit-badge';badge.append(icon);holder.append(badge);}
  return holder;
}
