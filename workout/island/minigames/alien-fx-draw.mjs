/** Aliens v24 effects, the drawing (canvas 2D, the same overlay the 3D view and the 2D fallback share). Every function returns false when the effects are
 * off (?alienFx=0) or its sheet has not loaded, and the caller draws the v23 effect then. Sizes are in screen pixels times `scale` (model units per screen
 * pixel), inside a p.scale(1/aspect,1) frame, like the v23 drawing, so a sprite keeps its proportions on any screen. Reads the model only. */
import {FX_SPRITES,frameAt,frameRect,fxFor,BURST_SECONDS} from './alien-fx.mjs?v=island-v2-20261107-11';
export {fxFor};
const S=FX_SPRITES;
/** px: on-screen size of the frame at the reference phone (844x390); the flames, meter, rings and impacts are tuned for a child's eye, not the sheet size. */
export const FX_SIZES=Object.freeze({flame:30,burst:40,bar:Object.freeze({w:100,h:12.5,gap:30}),shield:96,impact:3.4,explosion:4.6,boss:5.2,spark:38,muzzle:46,laser:Object.freeze({v11:84,bonus:56})});

function frame(p,img,s,i,x,y,w,h){const r=frameRect(s,i);p.drawImage(img,r.x,r.y,r.w,r.h,x,y,w,h);}
/** draw one frame of sprite `key` centred on its pivot at (x, y) in model units, size w x h in screen px (times scale) */
function at(p,fx,key,i,x,y,w,h,aspect,scale,rotate=0){
 const img=fx.image(key);if(!img||i<0)return false;const s=S[key];
 p.save();p.translate(x,y);p.scale(1/aspect,1);if(rotate)p.rotate(rotate);frame(p,img,s,i,-w*scale*s.pivot[0],-h*scale*s.pivot[1],w*scale,h*scale);p.restore();return true;
}
/** the muzzle line: the Codex ship's barrels end muzzleForward ahead of its centre; the drawn v12 cannons end 21 px ahead */
const muzzleY=(m,scale)=>m.player.y-(m.shipV13?(m.muzzleForward||22):21*scale);

/** The cannon flames: the one-shot flame of each regular shot on its cannon, and while the Vulcan streams the burst flame on both muzzles (a 500 ms cycle from
 * the moment it started). Replaces the drawn v12 muzzle flash. */
export function drawFxFlames(p,m,aspect=1,scale=1){
 const fx=fxFor(m);if(!fx||!fx.image('cannon'))return false;
 const t=m.time||0,tr=fx.tracker,off=m.cannonOffset||0,y=muzzleY(m,scale);
 if(tr.vulcanStart>=0&&fx.image('vulcan')){const i=frameAt(S.vulcan,((t-tr.vulcanStart)%BURST_SECONDS)*1000);for(const side of [-1,1])at(p,fx,'vulcan',i,m.player.x+side*off,y,FX_SIZES.burst,FX_SIZES.burst,aspect,scale);}
 for(const e of tr.effects)if(e.kind==='flame'){const i=frameAt(S.cannon,(t-e.t)*1000);if(i>=0)at(p,fx,'cannon',i,m.player.x+(e.x?1:-1)*off,y,FX_SIZES.flame,FX_SIZES.flame,aspect,scale);}
 return true;
}

/** The Vulcan meter next to the ship: the sprite bar (flame icon, frame, green-yellow-red fill, two marks) filled to the heat, on the side away from the
 * nearer screen edge; while the Vulcan is locked the six shutdown frames play in step with the model's drain (empty with the pause mark at the end).
 * Hidden when the gauge is cold and the Vulcan open, like v23. */
export function drawFxHeat(p,m,aspect=1,scale=1,width=360){
 const fx=fxFor(m),bar=fx?.image('heatBar');if(!bar)return false;
 const locked=Boolean(m.vulcanLocked),heat=Math.max(0,Math.min(1,m.vulcanHeat||0));
 if(!locked&&!(heat>.03))return true;
 const {w:bw,h:bh,gap}=FX_SIZES.bar,w=bw*scale,h=bh*scale,right=m.player.x<width*.72,x=right?gap*scale:-gap*scale-w,y=-h/2,s=S.heatBar;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);p.globalAlpha=.95;
 const shut=locked?fx.image('shutdown'):null;
 if(shut)frame(p,shut,S.shutdown,Math.min(5,Math.max(0,Math.floor((1-heat)*6))),x,y,w,h);
 else{
  frame(p,bar,s,0,x,y,w,h);const k=w/s.w,f=s.fill;
  p.fillStyle=s.background;p.fillRect(x+(f.x+f.w*heat)*k,y+f.y*h/s.h,f.w*(1-heat)*k,f.h*h/s.h);
  p.fillStyle=s.divider;for(const d of s.dividers)if(d>f.x+f.w*heat)p.fillRect(x+d*k,y+9*h/s.h,2*k,14*h/s.h);
 }
 p.restore();return true;
}

/** A laser (the v11 volley, kind 2, or the laser bonus, kind 1): the v16 beam, pointing along the shot. */
export function drawFxLaser(p,m,s,aspect=1,scale=1){
 const fx=fxFor(m);if(!fx||!fx.image('laser'))return false;
 const len=s.kind===2?FX_SIZES.laser.v11:FX_SIZES.laser.bonus,i=frameAt(S.laser,(m.time||0)*1000+s.x*7);
 return at(p,fx,'laser',i,s.x,s.y,len,len/2,aspect,scale,Math.atan2(s.vx||0,-(s.vy||-1))-Math.PI/2);
}

/** Everything that lives in the tracker: the shield ring around the ship, impact sparks, explosions, the boss explosion, the v16 sparks and muzzle flashes. */
export function drawFxEffects(p,m,aspect=1,scale=1){
 const fx=fxFor(m);if(!fx)return false;
 const t=m.time||0,ms=e=>(t-e.t)*1000;
 p.save();p.globalCompositeOperation='source-over';
 if(m.powerup===3||m.invulnerable>0)at(p,fx,'shield',frameAt(S.shield,t*1000),m.player.x,m.player.y,FX_SIZES.shield,FX_SIZES.shield,aspect,scale);
 for(const e of fx.tracker.effects){
  if(e.kind==='impact'){const d=Math.max(22,e.size*FX_SIZES.impact/scale);at(p,fx,'impact',frameAt(S.impact,ms(e)),e.x,e.y,d,d,aspect,scale);}
  else if(e.kind==='explosion'){const s=S.explosion,artW=Math.max(40,e.size*FX_SIZES.explosion/scale),w=artW*s.w/s.art.w;at(p,fx,'explosion',frameAt(s,ms(e)),e.x,e.y,w,w*s.h/s.w,aspect,scale);}
  else if(e.kind==='boss'){const d=Math.max(110,e.size*FX_SIZES.boss/scale);if(!at(p,fx,'boss',frameAt(S.boss,ms(e)),e.x,e.y,d,d,aspect,scale)){const s=S.explosion,w=d*s.w/s.art.w;at(p,fx,'explosion',frameAt(s,ms(e)),e.x,e.y,w,w*2,aspect,scale);}}
  else if(e.kind==='spark')at(p,fx,'spark',frameAt(S.spark,ms(e)),e.x,e.y,FX_SIZES.spark,FX_SIZES.spark,aspect,scale);
  else if(e.kind==='muzzle')at(p,fx,'muzzle',frameAt(S.muzzle,ms(e)),e.x,e.y,FX_SIZES.muzzle,FX_SIZES.muzzle,aspect,scale);
 }
 p.restore();return true;
}
/** v23's drawn effects that a loaded sheet replaces: the v11 kill blasts (explosions), the 'enemy-hit' strokes (impact sparks). */
export const fxReplaces=(m,what)=>{const fx=fxFor(m);return Boolean(fx&&fx.image(what==='blasts'?'explosion':what==='enemy-hit'?'impact':what));};
