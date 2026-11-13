/** 13/11/2026 fire v23: the one map of every picture the two bonus modes draw, and where things stand in them.
 * Art = sprites rendered from 3D assets (verification/fire-v23/sprites), now the Codex packs: the street buildings
 * (fire-building-v1), the three rooms (fire-rooms-v1), the rescue friends (girl/cat/dog, fire-rescue-v1), the fire/smoke/water
 * sheets (fire-fx-v1) and the fire tools (fire-tools). Swapping a file here (same name, same anchors in fire-v23-anchors.mjs)
 * is the whole swap. Pure: URLs, grids and numbers only, no DOM. */
import {FIRE_V23_ANCHORS} from './fire-v23-anchors.mjs?v=island-v2-20261107-11';

const V23='../assets/fire-v23/',FX=V23+'fx/';
const base=f=>f.replace(/\.[a-z0-9]+$/i,'');
/** Every rendered file gets an id = its file name without the extension, so a new render needs no edit here. */
function imagesFromAnchors(anchors){
  const out={};
  for(const a of Object.values(anchors)){
    if(a.file)out[base(a.file)]=V23+a.file;
    if(a.overlays)for(const o of Object.values(a.overlays))if(o&&o.file)out[base(o.file)]=V23+o.file;
  }
  return out;
}
/** The fire/smoke/water/spark sheets (Codex fire-fx-v1): a grid of frames, each with a ground/nozzle anchor and a blend mode. */
export const FIRE_V23_FX=Object.freeze({
  'flame-small':{cols:4,rows:2,fw:128,fh:256,n:8,fps:12,ax:64,ay:238,loop:true,add:true},
  'flame-medium':{cols:4,rows:2,fw:128,fh:256,n:8,fps:12,ax:64,ay:238,loop:true,add:true},
  'flame-large':{cols:4,rows:2,fw:128,fh:256,n:8,fps:12,ax:64,ay:238,loop:true,add:true},
  'flame-extinguish':{cols:4,rows:2,fw:128,fh:256,n:8,fps:14,ax:64,ay:238,loop:false,add:true},
  'smoke-black':{cols:4,rows:4,fw:128,fh:128,n:16,fps:12,ax:64,ay:116,loop:true},
  'steam-white':{cols:4,rows:4,fw:128,fh:128,n:16,fps:12,ax:64,ay:116,loop:true},
  'water-jet':{cols:4,rows:2,fw:256,fh:128,n:8,fps:16,ax:8,ay:64,loop:true},
  'water-droplets':{cols:4,rows:2,fw:128,fh:128,n:8,fps:16,ax:8,ay:64,loop:true},
  'water-impact':{cols:3,rows:2,fw:128,fh:128,n:6,fps:15,ax:64,ay:102,loop:false},
  'water-puddle':{cols:1,rows:1,fw:256,fh:128,n:1,fps:0,ax:128,ay:64,loop:false},
  'foam-bubbles':{cols:3,rows:2,fw:128,fh:128,n:6,fps:10,ax:64,ay:112,loop:true},
  sparks:{cols:4,rows:4,fw:128,fh:128,n:16,fps:16,ax:64,ay:116,loop:true,add:true},
});
const FX_FILES=Object.fromEntries(Object.keys(FIRE_V23_FX).map(id=>[id,FX+id+'.png']));

export const FIRE_V23_IMAGES=Object.freeze({...imagesFromAnchors(FIRE_V23_ANCHORS),...FX_FILES});
/** Which pictures each mode needs before it can draw (the rest load behind). */
export const FIRE_V23_NEEDS=Object.freeze({
  targets:['street','truck','crew-0','crew-1','crew-2','crew-3','crew-4','flame-medium','flame-large','smoke-black','water-jet','water-droplets',
    'target-bin-green','target-bin-ash','target-crate','target-barrel','target-crate-small'],
  interior:['street','truck','room-living','flame-medium','flame-large','smoke-black','steam-white','water-jet','tool-hose','tool-extinguisher','friend-living-scared'],
});
/** Which pictures a mode loads at all (the rest of FIRE_V23_IMAGES is the other mode's). */
export function fireV23ModeImages(mode){
  const ids=Object.keys(FIRE_V23_IMAGES);
  if(mode==='targets')return ids.filter(id=>/^(street|truck|crew-|target-|victory-|street-|flame|smoke|steam|water|spark)/.test(id));
  return ids.filter(id=>/^(street|truck|room-|friend-|victory-|tool-|flame|smoke|steam|water|foam|spark|pet)/.test(id));
}
/** Button icons (24x24 line, the Codex fire-tools set) plus the island hose drop. */
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

const center=r=>({x:(r[0]+r[2])/2,y:(r[1]+r[3])/2,w:r[2]-r[0],h:r[3]-r[1]});
/** Where the firefighter and the sky sit on street.webp when the generator has no 3D point for them. */
const STREET_MANUAL=Object.freeze({skyLeft:[693,114],skyRight:[1315,86]});
/** A named place in the street picture (scene px of street.webp). Windows are win_1..9 (boxes), the roof roof1..3, the
 * knock-down cans target_* (and target_*_fallen where they land), plus door and sky points. */
export function streetAnchor(name,anchors=FIRE_V23_ANCHORS){
  const s=anchors.street||{},boxes=s.boxes||{},points=s.points||{};
  if(boxes[name])return center(boxes[name]);
  if(points[name]){const p=points[name];return {x:p[0],y:p[1],w:80,h:50};}
  if(STREET_MANUAL[name])return {x:STREET_MANUAL[name][0],y:STREET_MANUAL[name][1],w:60,h:60};
  return null;
}
/** The burnt/open overlay of a street element: {id,x,y,w,h} to draw over the background, or null. */
export function streetOverlay(name,anchors=FIRE_V23_ANCHORS){const o=anchors.street?.overlays?.[name];return o?{id:base(o.file),x:o.origin[0],y:o.origin[1],w:o.size[0],h:o.size[1]}:null;}
/** The sprite id of a knock-down can for its anchor name (target_bin_green -> target-bin-green). */
export function targetSprite(at){return at.replace(/^target_/,'target-').replace(/_/g,'-');}

/** A named place in a room picture (scene px). Rescue head reads rescueTop; the model's petTop/kidTop alias it. */
export function roomAnchor(image,name,anchors=FIRE_V23_ANCHORS){
  const a=anchors[image];if(!a)return null;const p=a.points||{};
  const alias={petTop:'rescueTop',kidTop:'rescueTop',exitTop:'exit',kid:'rescue',pet:'rescue'}[name]||name;
  const q=p[alias];return q?{x:q[0],y:q[1]}:null;
}
/** The burnt overlay of a room spot: {id,x,y,w,h} or null. */
export function roomOverlay(image,spotId,anchors=FIRE_V23_ANCHORS){const o=anchors[image]?.overlays?.['burnt-'+spotId];return o?{id:base(o.file),x:o.origin[0],y:o.origin[1],w:o.size[0],h:o.size[1]}:null;}

/** Where a sprite rendered with the same camera as its background sits in that background (top-left corner and size, scene px). */
export function spriteBox(id,anchors=FIRE_V23_ANCHORS){const a=anchors[id];return a?.origin?{x:a.origin[0],y:a.origin[1],w:a.size[0],h:a.size[1]}:null;}
/** A frame of a sprite sheet (friends, victory). Returns the source rect and where to place the frame, or null. */
export function spriteFrame(id,index,anchors=FIRE_V23_ANCHORS){const a=anchors[id];if(!a?.frames)return null;const f=a.frames,[cw,ch]=f.cell,i=((index%f.count)+f.count)%f.count;
  return {sx:i*cw,sy:0,w:cw,h:ch,x:f.origin[0],y:f.origin[1],count:f.count};}
/** The water nozzle of a firefighter sprite in scene px: the hands, near the top-front of the small sprite. */
export function crewNozzle(index,anchors=FIRE_V23_ANCHORS){const a=anchors['crew-'+index];if(!a?.origin)return null;return {x:a.origin[0]+a.size[0]*.5,y:a.origin[1]+a.size[1]*.32};}
