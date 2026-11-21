/** Aliens v25 presentation (reads model state only; nothing here changes the game). The Vulcan's massive look from the Codex package
 * aliens-vulcan-v2 (CC0, copies under assets/alien-v25): every Vulcan bullet is three plasma pellets that fan a little with distance, a
 * spinning muzzle flash on both barrels while the Vulcan fires, an impact burst where a Vulcan bullet strikes (0.18 s), and steam from the
 * barrels for half a second when the gauge locks. While a picture is still loading (or in a test) a drawn fallback keeps the same size.
 * Only with v25 on (?alienVulcan=v24 draws nothing here and the v24 tracers stay). */
import {pelletOffsets,V25_DEFAULTS,VULCAN_V25_ASSETS} from './alien-v25.mjs?v=island-v2-20261107-22';
import {boltPoints,ARSENAL_DEFAULTS} from './alien-v25-arsenal.mjs?v=island-v2-20261107-22';
const TAU=Math.PI*2;
const images=new Map();
/** Lazy picture next to this module (assets/alien-v25); null outside a browser, false until decoded. */
export function alienV25Image(name){
 if(typeof Image==='undefined')return null;
 let entry=images.get(name);
 if(!entry){const img=new Image();entry={img,ok:false};img.onload=()=>{entry.ok=true;};img.onerror=()=>{entry.failed=true;};img.src=new URL(`../assets/alien-v25/${name}?v=island-v2-20261107-22`,import.meta.url).href;images.set(name,entry);}
 return entry.ok?entry.img:false;
}
/** Start loading the four atlases (the session calls it once, so the first Vulcan burst already has its plasma). */
export function preloadAlienV25(){for(const name of Object.values(VULCAN_V25_ASSETS))alienV25Image(name);}
// Atlas cells (256 px atlases): plasma 128 px cells (small, medium, large), the others 64 px cells.
const PLASMA=[[0,0],[128,0],[0,128]],CELL=64;
function cell64(index){return [(index%4)*CELL,Math.floor(index/4)*CELL];}
/** One Vulcan bullet: three plasma pellets along its flight direction. distance = how far it has flown (model units). */
export function drawV25Shot(p,s,m,aspect=1,scale=1){
 const cfg=m.vulcanCfg||V25_DEFAULTS,distance=Math.max(0,(m.player?.y??s.y)-s.y),offsets=pelletOffsets(distance,cfg),atlas=alienV25Image(VULCAN_V25_ASSETS.plasma);
 p.save();p.translate(s.x,s.y);p.scale(1/aspect,1);p.rotate(Math.atan2(s.vx||0,-(s.vy||-1)));p.globalCompositeOperation='lighter';
 for(let i=0;i<offsets.length;i++){
  if((s.pelletMask>>i)&1)continue;/* v24.4 (alien-hull.mjs): a side pellet that reached a ship stuck in it */
  const middle=i===(offsets.length-1)/2,h=(middle?34:26)*scale,w=h,x=offsets[i]*scale,y=middle?0:7*scale;
  if(atlas){const [sx,sy]=PLASMA[middle?2:1];p.drawImage(atlas,sx,sy,128,128,x-w/2,y-h/2,w,h);}
  else{const g=p.createLinearGradient(0,y-h*.4,0,y+h*.4);g.addColorStop(0,'rgba(255,250,214,.95)');g.addColorStop(.35,'rgba(255,183,72,.9)');g.addColorStop(1,'rgba(255,110,30,0)');p.strokeStyle=g;p.lineWidth=(middle?5:3.6)*scale;p.beginPath();p.moveTo(x,y-h*.38);p.lineTo(x,y+h*.4);p.stroke();}
 }
 p.restore();return offsets.length;
}
/** Muzzle flashes on both barrels while the Vulcan fires (8 frames at 25 fps), impacts, and steam after a lock. */
export function drawV25Fx(p,m,aspect=1,scale=1){
 if(!m.v25)return 0;let drawn=0;const t=m.time||0;
 const muzzleY=-((m.muzzleForward||22)+5)*scale,offset=(m.cannonOffset||11)*aspect;
 p.save();p.translate(m.player.x,m.player.y+(m.recoilOffset||0));p.scale(1/aspect,1);
 if(m.vulcanOn){
  const atlas=alienV25Image(VULCAN_V25_ASSETS.muzzle),frame=Math.floor(t*25)%8,size=30*scale;p.globalCompositeOperation='lighter';
  for(const side of [-1,1]){const x=side*offset,flip=(frame+(side>0?4:0))%8;
   if(atlas){const [sx,sy]=cell64(flip);p.drawImage(atlas,sx,sy,CELL,CELL,x-size/2,muzzleY-size/2,size,size);}
   else{const g=p.createRadialGradient(x,muzzleY,0,x,muzzleY,size*.5);g.addColorStop(0,'rgba(255,246,200,.95)');g.addColorStop(1,'rgba(255,140,40,0)');p.fillStyle=g;p.beginPath();p.arc(x,muzzleY,size*.5,0,TAU);p.fill();}
   drawn++;}
 }
 // Steam for 0.5 s after the gauge locked (6 frames at 12 fps), rising from the barrels.
 const steamAge=t-(m.vulcanLockAt??-Infinity);
 if(steamAge>=0&&steamAge<.5){const atlas=alienV25Image(VULCAN_V25_ASSETS.steam),frame=Math.min(5,Math.floor(steamAge*12)),size=28*scale;p.globalCompositeOperation='source-over';p.globalAlpha=1-steamAge/.5*.5;
  for(const side of [-1,1]){const x=side*offset,y=muzzleY-steamAge*30*scale;
   if(atlas){const [sx,sy]=cell64(frame);p.drawImage(atlas,sx,sy,CELL,CELL,x-size/2,y-size/2,size,size);}
   else{p.fillStyle='rgba(220,232,240,.55)';p.beginPath();p.arc(x,y,size*.3*(1+steamAge),0,TAU);p.fill();}
   drawn++;}
  p.globalAlpha=1;}
 p.restore();
 // Impact bursts where Vulcan bullets struck: one of four variants, 4 frames of 45 ms.
 const list=m.vulcanImpacts||[];if(list.length){const atlas=alienV25Image(VULCAN_V25_ASSETS.impact),size=26*scale;
  for(const d of list){const age=t-d.at;if(age<0||age>=.18)continue;const frame=(d.variant%4)*4+Math.min(3,Math.floor(age/.045));
   p.save();p.translate(d.x,d.y);p.scale(1/aspect,1);p.globalCompositeOperation='lighter';
   if(atlas){const [sx,sy]=cell64(frame);p.drawImage(atlas,sx,sy,CELL,CELL,-size/2,-size/2,size,size);}
   else{p.globalAlpha=1-age/.18;p.strokeStyle='#ffc46b';p.lineWidth=2*scale;p.beginPath();p.arc(0,0,(5+age*60)*scale,0,TAU);p.stroke();}
   p.restore();drawn++;}}
 return drawn;
}
/** v25 arsenal presentation: the lightning bolt (a jagged white core in a blue glow, re-jagged every 40 ms, fading over its 0.32 s), the
 * shockwave (a cyan double ring rolling up from the ship), and the falling ammo tokens (missile crate amber, battery blue, cell cyan), each a
 * token with its own drawn symbol on a halo so it reads as "take me". Only with the arsenal on (?alienArsenal=0 draws nothing here). */
export const AMMO_COLORS=Object.freeze(['#ff9c6b','#7fb8ff','#6fe3ff']);/* coral, not the Vulcan magazine's amber */
function bolt(p,pts,width,color,alpha){p.globalAlpha=alpha;p.strokeStyle=color;p.lineWidth=width;p.lineJoin='round';p.beginPath();pts.forEach((q,i)=>{i?p.lineTo(q.x,q.y):p.moveTo(q.x,q.y);});p.stroke();}
function ammoSymbol(p,kind,s){
 p.lineWidth=1.6*s/10;p.strokeStyle='#0b1620';p.fillStyle='#0b1620';
 if(kind===0){p.beginPath();p.moveTo(0,-s*.55);p.quadraticCurveTo(s*.22,-s*.3,s*.18,s*.3);p.lineTo(s*.34,s*.5);p.lineTo(-s*.34,s*.5);p.lineTo(-s*.18,s*.3);p.quadraticCurveTo(-s*.22,-s*.3,0,-s*.55);p.fill();}
 else if(kind===1){p.beginPath();p.moveTo(s*.12,-s*.55);p.lineTo(-s*.28,s*.08);p.lineTo(-s*.02,s*.08);p.lineTo(-s*.14,s*.55);p.lineTo(s*.3,-s*.1);p.lineTo(s*.04,-s*.1);p.closePath();p.fill();}
 else{for(const r of [s*.22,s*.46]){p.beginPath();p.arc(0,0,r,0,TAU);p.stroke();}}
}
export function drawV25Arsenal(p,m,aspect=1,scale=1){
 if(!m.arsenalOn)return 0;let drawn=0;const t=m.time||0,cfg=m.arsenalCfg||ARSENAL_DEFAULTS;
 const fx=m.lightningFx;if(fx){const age=t-fx.at,life=cfg.lightning.seconds;if(age>=0&&age<life){const k=1-age/life,seed=fx.seed+Math.floor(age/.04);let from=fx.from;
  p.save();p.globalCompositeOperation='lighter';
  for(let i=0;i<fx.points.length;i++){const to=fx.points[i],pts=boltPoints(from,to,seed+i*31,8,10*scale);
   bolt(p,pts,9*scale,'#3d7dff',.35*k);bolt(p,pts,4*scale,'#9fd0ff',.8*k);bolt(p,pts,1.6*scale,'#ffffff',k);
   p.globalAlpha=k;const g=p.createRadialGradient(to.x,to.y,0,to.x,to.y,16*scale);g.addColorStop(0,'rgba(214,236,255,.95)');g.addColorStop(1,'rgba(80,140,255,0)');p.fillStyle=g;p.beginPath();p.arc(to.x,to.y,16*scale,0,TAU);p.fill();from=to;drawn++;}
  p.restore();}}
 for(const ring of m.shockwaves||[]){const k=1-ring.r/cfg.shockwave.maxRadius;p.save();p.translate(ring.x,ring.y);p.scale(1/aspect,1);p.globalCompositeOperation='lighter';
  // The hit test stretches x by the aspect, so the ring that hits is a circle on the screen: radius r in this scaled frame.
  p.globalAlpha=Math.max(0,k);p.strokeStyle='#6fe3ff';p.lineWidth=6*scale;p.beginPath();p.arc(0,0,ring.r,Math.PI,TAU);p.stroke();
  p.strokeStyle='#e6fbff';p.lineWidth=2*scale;p.beginPath();p.arc(0,0,Math.max(0,ring.r-7*scale),Math.PI,TAU);p.stroke();p.restore();drawn++;}
 for(const d of m.ammoDrops||[]){const bob=Math.sin(t*4+d.id)*2*scale,size=20*scale,color=AMMO_COLORS[d.kind]||'#ffffff';
  p.save();p.translate(d.x,d.y+bob);p.scale(1/aspect,1);p.globalCompositeOperation='lighter';const g=p.createRadialGradient(0,0,0,0,0,size*1.4);g.addColorStop(0,color+'99');g.addColorStop(1,color+'00');p.fillStyle=g;p.fillRect(-size*1.4,-size*1.4,size*2.8,size*2.8);
  // A rounded crate (the Vulcan magazine is a round token), the weapon's colour and symbol on it.
  p.globalCompositeOperation='source-over';p.fillStyle=color;p.strokeStyle='#f6fbff';p.lineWidth=1.5*scale;const h=size*.6,r=size*.18;p.beginPath();p.moveTo(-h+r,-h);p.lineTo(h-r,-h);p.quadraticCurveTo(h,-h,h,-h+r);p.lineTo(h,h-r);p.quadraticCurveTo(h,h,h-r,h);p.lineTo(-h+r,h);p.quadraticCurveTo(-h,h,-h,h-r);p.lineTo(-h,-h+r);p.quadraticCurveTo(-h,-h,-h+r,-h);p.closePath();p.fill();p.stroke();ammoSymbol(p,d.kind,size*.9);p.restore();drawn++;}
 return drawn;
}
