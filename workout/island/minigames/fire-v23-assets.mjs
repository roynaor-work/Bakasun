/** 13/11/2026 fire v23: the one map of every picture the two bonus modes draw, and where things stand in them.
 * Interim art = sprites rendered from the island's own 3D assets (fire-v7 street, Meshy engine, the island kid, the Codex fire tools)
 * and simple box rooms (verification/fire-v23/sprites). When the Codex interior, fire/smoke/water and rescue packs land, replacing a file
 * here (same name, same anchors in fire-v23-anchors.mjs) is the whole swap. Pure: URLs and numbers only. */
import {FIRE_V23_ANCHORS} from './fire-v23-anchors.mjs?v=island-v2-20261107-11';

const V23='../assets/fire-v23/',FX='../assets/fire-v7/particles/';
export const FIRE_V23_IMAGES=Object.freeze({
  street:V23+'street.webp',truck:V23+'truck.webp',
  'crew-0':V23+'crew-0.webp','crew-1':V23+'crew-1.webp','crew-2':V23+'crew-2.webp','crew-3':V23+'crew-3.webp','crew-4':V23+'crew-4.webp',
  'room-living':V23+'room-living.webp','room-kitchen':V23+'room-kitchen.webp','room-bedroom':V23+'room-bedroom.webp',
  'kid-living':V23+'kid-living.webp','kid-bedroom':V23+'kid-bedroom.webp',
  'kidrun-living-0':V23+'kidrun-living-0.webp','kidrun-living-1':V23+'kidrun-living-1.webp','kidrun-living-2':V23+'kidrun-living-2.webp','kidrun-living-3':V23+'kidrun-living-3.webp',
  'kidrun-bedroom-0':V23+'kidrun-bedroom-0.webp','kidrun-bedroom-1':V23+'kidrun-bedroom-1.webp','kidrun-bedroom-2':V23+'kidrun-bedroom-2.webp','kidrun-bedroom-3':V23+'kidrun-bedroom-3.webp',
  pet:V23+'pet-rabbit.png',
  'tool-extinguisher':V23+'tool-extinguisher.png','tool-blanket':V23+'tool-blanket.png','tool-hose':V23+'tool-hose.png',
  'victory-kid':V23+'victory-kid.webp','victory-crew':V23+'victory-crew.webp',
  flame:FX+'flame-256.png',smoke:FX+'smoke-256.png',steam:FX+'steam-256.png',water:FX+'water-256.png',ember:FX+'ember-256.png',
});
/** Which pictures each mode needs before it can draw (the rest load behind). */
export const FIRE_V23_NEEDS=Object.freeze({
  targets:['street','truck','crew-0','crew-1','crew-2','crew-3','crew-4','flame','smoke','steam','water'],
  interior:['street','truck','room-living','flame','smoke','steam','water','tool-hose','tool-extinguisher','kid-living'],
});
/** Button icons (24x24 line, the Codex fire-tools set, PR codex/fire-tools-v1) plus the island hose drop. */
export const FIRE_V23_ICONS=Object.freeze({
  water:'M3 21V3h18v18M17 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-3 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm3 0v7c0 3-5 3-5 0v-1m-1 0h2l1-2h-4l1 2Z',
  extinguisher:'M8 8V6h6v2m-7-5h8M10 3v3m3 0h3c3 0 3 2 3 4v3m-1 0h2l1 4h-4l1-4ZM9 8h4a2 2 0 0 1 2 2v10H7V10a2 2 0 0 1 2-2Zm-2 9h8',
  blanket:'M4 6h16v12H4V6Zm0 8h16M8 6v8M7 18v3m10-3v3M4 10h4',
  foam:'M3 7v8a5 5 0 0 0 10 0v-2m-3-6h7v6h-7V7Zm3 0V4h4v3m0 1 4-2v8l-4-2M3 7h7',
  spray:'M12 2C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-13z',
  crawl:'M6 9l6 6 6-6M6 4l6 6 6-6',
  door:'M5 21V4l9-1v18M14 21h5V6h-5M11 12v1',
  wind:'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8',
  star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  flame:'M13 2c2 6-2 6 2 9l2-4c7 8 2 15-5 15S2 15 7 9c0 4 3 4 3 1s3-5 3-8z',
  person:'M9 21v-7l-4 2m10 5v-7l4 2M6 10l6 3 6-3M12 13v-4m3-4a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  paw:'M12 13c-3 0-5 3-5 5 0 1.5 1.3 2 2.5 2 1 0 1.6-.6 2.5-.6s1.5.6 2.5.6c1.2 0 2.5-.5 2.5-2 0-2-2-5-5-5ZM7 9a1.6 2 0 1 0 0 .1M17 9a1.6 2 0 1 0 0 .1M10 5a1.6 2 0 1 0 0 .1M14 5a1.6 2 0 1 0 0 .1',
});
export function fireV23AssetURL(id,base=import.meta.url){const path=FIRE_V23_IMAGES[id];return path?new URL(path+'?v=island-v2-20261107-11',base).href:null;}
export const FIRE_V23_ANCHOR_DATA=FIRE_V23_ANCHORS;

/** Measured on street.webp (2000x900) where the generator has no 3D point: the corner store sign board, the sky above the roofs. */
const STREET_MANUAL=Object.freeze({awning1:[1392,571],awning2:[1458,571],awning3:[1524,571],skyLeft:[700,130],skyRight:[1250,150]});
const center=r=>({x:(r[0]+r[2])/2,y:(r[1]+r[3])/2,w:r[2]-r[0],h:r[3]-r[1]});
/** A named place in the street picture (scene px of street.webp): window w<row><col>, balcony<row><col> (the slab beside that window), roof and door points. */
export function streetAnchor(name,anchors=FIRE_V23_ANCHORS){
  const s=anchors.street,grid=s.grid||{};
  if(grid[name])return center(grid[name]);
  const balcony=/^balcony(\d)(\d)$/.exec(name);
  if(balcony){const r=grid['w'+balcony[1]+balcony[2]];if(!r)return null;const left=Number(balcony[2])===1;return {x:left?r[0]-17:r[2]+17,y:r[3]-11,w:22,h:30};}
  if(STREET_MANUAL[name])return {x:STREET_MANUAL[name][0],y:STREET_MANUAL[name][1],w:60,h:60};
  const p=s.points?.[name];return p?{x:p[0],y:p[1],w:80,h:50}:null;
}
/** A named place in a room picture (scene px of that picture). */
export function roomAnchor(image,name,anchors=FIRE_V23_ANCHORS){const p=anchors[image]?.points?.[name];return p?{x:p[0],y:p[1]}:null;}
/** Where a sprite rendered with the same camera as its background sits in that background (top-left corner and size, scene px). */
export function spriteBox(id,anchors=FIRE_V23_ANCHORS){const a=anchors[id];return a?.origin?{x:a.origin[0],y:a.origin[1],w:a.size[0],h:a.size[1]}:null;}
/** The water nozzle of a firefighter sprite in scene px. */
export function crewNozzle(index,anchors=FIRE_V23_ANCHORS){const a=anchors['crew-'+index];const p=a?.px?.['crew.waterNozzle'];return p?{x:a.origin[0]+p[0],y:a.origin[1]+p[1]}:null;}
