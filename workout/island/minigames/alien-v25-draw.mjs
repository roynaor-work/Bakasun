/** Aliens v25 presentation (reads model state only; nothing here changes the game). The Vulcan's massive look from the Codex package
 * aliens-vulcan-v2 (CC0, copies under assets/alien-v25): every Vulcan bullet is three plasma pellets that fan a little with distance, a
 * spinning muzzle flash on both barrels while the Vulcan fires, an impact burst where a Vulcan bullet strikes (0.18 s), and steam from the
 * barrels for half a second when the gauge locks. While a picture is still loading (or in a test) a drawn fallback keeps the same size.
 * Only with v25 on (?alienVulcan=v24 draws nothing here and the v24 tracers stay). */
import {pelletOffsets,V25_DEFAULTS,VULCAN_V25_ASSETS} from './alien-v25.mjs?v=island-v2-20261107-14';
const TAU=Math.PI*2;
const images=new Map();
/** Lazy picture next to this module (assets/alien-v25); null outside a browser, false until decoded. */
export function alienV25Image(name){
 if(typeof Image==='undefined')return null;
 let entry=images.get(name);
 if(!entry){const img=new Image();entry={img,ok:false};img.onload=()=>{entry.ok=true;};img.onerror=()=>{entry.failed=true;};img.src=new URL(`../assets/alien-v25/${name}?v=island-v2-20261107-14`,import.meta.url).href;images.set(name,entry);}
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
