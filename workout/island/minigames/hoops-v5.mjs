/** Island Pro Basketball — the hoops v5 venue (design/hoops-v5, 04/11): hardwood court with a lacquered
 * clearcoat, a two-tier arena with 2,762 animated spectators, hanging scoreboard, both baskets and a leather ball.
 * Pure helpers only (no three.js), so node tests can run them; the loader is hoops-v5-venue.mjs.
 *
 * v5 is an upgrade, never a requirement: any load failure keeps the v4 (or v3) venue, and quality 0 never asks for it. */
export const V5_FILES=Object.freeze({arena:'arena.glb',court:'court.glb',hoops:'hoops.glb',crowd:'crowd.glb',ball:'ball.glb'});
/** Names the view needs from the files (checked before anything visible changes). */
export const V5_REQUIRED=Object.freeze({arena:['seats','scoreboard-screen','end-screens'],court:['court-surface','court-lines','painted-keys'],hoops:['rim','net','backboard-glass','shot-clock-screen'],crowd:['crowd-cards'],ball:['basketball']});

/** ?hoopsV5=0 forces the older venue (before/after captures), ?hoopsV5=1 forces v5 even when the config switch is off. */
export function v5Enabled(cfg,quality,params){
 const q=params?.get?.('hoopsV5');
 if(q==='0')return false;
 if(!cfg?.v5)return false;
 if(q==='1')return true;
 return cfg.v5.enabled!==false&&quality>=(cfg.v5.minQuality??1);
}

/** Crowd levels: 2 = every spectator and the sway, 1 = two thirds of the stands (sway on), 0 = one third, frozen. */
export const CROWD_LEVELS=Object.freeze([{level:0,keep:1/3,sway:false},{level:1,keep:2/3,sway:true},{level:2,keep:1,sway:true}]);
/** Whether spectator card `i` is drawn at `level` (deterministic: the stands thin out evenly, no random holes). */
export function crowdKeeps(level,i){return level>=2?true:level===1?i%3!==2:i%3===0;}
/** Starting level from the quality tier; ?hoopsV5Level=0..2 pins it (and turns the governor off). */
export function crowdStartLevel(quality,params){
 const q=params?.get?.('hoopsV5Level');
 if(q!=null&&q!==''&&Number.isFinite(Number(q)))return {level:Math.max(0,Math.min(2,Math.round(Number(q)))),pinned:true};
 return {level:quality>=2?2:1,pinned:false};
}

/** Runtime LOD: steps the crowd down one level when the frame time stays over `slowMs` for `window` frames
 * (phone target 30 fps, so 1000/28 by default). It never steps back up (no flicker between levels); frames over
 * `ignoreMs` are tab switches and loading hitches, not load, and do not count. Returns the new level or null. */
export function createCrowdGovernor({level=2,slowMs=1000/28,window=90,cooldown=240,ignoreMs=250,pinned=false}={}){
 let ema=slowMs/2,over=0,wait=0;
 return {
  get level(){return level;},
  get ema(){return ema;},
  observe(dtSeconds){
   if(pinned)return null;
   const ms=dtSeconds*1000;if(!(ms>0)||ms>ignoreMs)return null;
   ema+=(ms-ema)*0.1;
   if(wait>0){wait--;return null;}
   over=ema>slowMs?over+1:0;
   if(over>=window&&level>0){level--;over=0;wait=cooldown;return level;}
   return null;
  },
 };
}
