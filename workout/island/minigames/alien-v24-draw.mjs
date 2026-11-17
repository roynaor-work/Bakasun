/** Aliens v24 presentation (reads model state only): the falling Vulcan magazine (the Codex icon `vulcan-magazine.png` from
 * refill-enemyfire-v1 on an amber halo, a drawn hexagon with three rounds while the picture loads or in a test), the Codex
 * pick-up burst over the ship for 0.3 s, and the cold bar next to the ship: while a magazine keeps the barrels cold the Vulcan's
 * bar is cyan and drains with the cold time (instead of the v23 heat bar). Nothing is drawn with ?alienRefill=0 (no refills). */
import {REFILL_COLORS} from './alien-v24.mjs?v=island-v2-20261107-16';
const TAU=Math.PI*2;
const images=new Map();
/** Lazy picture next to this module (assets/alien-v24); null outside a browser, false until decoded. */
export function alienV24Image(name){
 if(typeof Image==='undefined')return null;
 let entry=images.get(name);
 if(!entry){const img=new Image();entry={img,ok:false};img.onload=()=>{entry.ok=true;};img.onerror=()=>{entry.failed=true;};img.src=new URL(`../assets/alien-v24/${name}?v=island-v2-20261107-16`,import.meta.url).href;images.set(name,entry);}
 return entry.ok?entry.img:false;
}
function magazineGlyph(p,s){
 p.fillStyle='#16202c';p.strokeStyle=REFILL_COLORS.token;p.lineWidth=2;p.beginPath();
 for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6;i?p.lineTo(Math.cos(a)*s,Math.sin(a)*s):p.moveTo(Math.cos(a)*s,Math.sin(a)*s);}p.closePath();p.fill();p.stroke();
 p.fillStyle=REFILL_COLORS.token;for(const x of [-s*.38,0,s*.38]){p.beginPath();p.moveTo(x-s*.13,s*.32);p.lineTo(x-s*.13,-s*.18);p.lineTo(x,-s*.45);p.lineTo(x+s*.13,-s*.18);p.lineTo(x+s*.13,s*.32);p.closePath();p.fill();}
 p.fillRect(-s*.62,s*.34,s*1.24,s*.16);
}
export function drawV24Refills(p,m,aspect=1,scale=1){
 const list=m.refills||[];if(!list.length&&!m.refillPicked)return 0;
 const icon=alienV24Image('vulcan-magazine.png');let drawn=0;
 for(const d of list){
  const bob=Math.sin((m.time||0)*4+d.x*.05)*2*scale,size=46*scale,pulse=.7+.25*Math.sin((m.time||0)*6+d.id);
  p.save();p.translate(d.x,d.y+bob);p.scale(1/aspect,1);
  p.globalCompositeOperation='lighter';const g=p.createRadialGradient(0,0,0,0,0,size);g.addColorStop(0,REFILL_COLORS.halo+'aa');g.addColorStop(.45,REFILL_COLORS.halo+'44');g.addColorStop(1,REFILL_COLORS.halo+'00');p.globalAlpha=pulse;p.fillStyle=g;p.fillRect(-size,-size,size*2,size*2);
  p.globalCompositeOperation='source-over';p.globalAlpha=1;p.rotate(Math.sin((m.time||0)*2+d.id)*.18);
  // A thin amber ring (the bonus look of the game) around the Codex magazine icon, so it reads as "take me" next to the explosions.
  p.strokeStyle=REFILL_COLORS.token;p.lineWidth=2*scale;p.globalAlpha=.9;p.beginPath();p.arc(0,0,size*.62,0,TAU);p.stroke();p.globalAlpha=1;
  if(icon)p.drawImage(icon,-size*.55,-size*.55,size*1.1,size*1.1);else magazineGlyph(p,size*.44);
  p.restore();drawn++;
 }
 // Pick-up burst: the Codex 6-frame sheet (128 px cells, 20 fps, once) over the ship.
 const picked=m.refillPicked;if(picked&&Number.isFinite(picked.at)){const age=(m.time||0)-picked.at;if(age>=0&&age<.3){const sheet=alienV24Image('pickup-burst.png'),f=Math.min(5,Math.floor(age*20)),s=70*scale;
  p.save();p.translate(m.player?.x??picked.x,m.player?.y??picked.y);p.scale(1/aspect,1);
  if(sheet)p.drawImage(sheet,f*128,0,128,128,-s/2,-s/2,s,s);else{p.strokeStyle=REFILL_COLORS.cold;p.globalAlpha=1-age/.3;p.lineWidth=3*scale;p.beginPath();p.arc(0,0,(14+age*90)*scale,0,TAU);p.stroke();}
  p.restore();}}
 return drawn;
}
/** While a magazine keeps the barrels cold: a cyan bar next to the ship (where the v23 heat bar sits) that drains with the cold time. */
export function drawV24Cold(p,m,aspect=1,scale=1){
 if(!(m.refillCold>0)||!(m.refillColdMax>0))return false;
 const f=Math.max(0,Math.min(1,m.refillCold/m.refillColdMax)),w=8*scale,h=42*scale,x=40*scale,y=16*scale;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 p.globalAlpha=.9;p.fillStyle='#0a1622';p.fillRect(x-1,-y-1,w+2,h+2);p.fillStyle='#1c2c3c';p.fillRect(x,-y,w,h);
 p.fillStyle=REFILL_COLORS.cold;p.fillRect(x,-y+h*(1-f),w,h*f);p.globalAlpha=1;p.lineWidth=1.5*scale;p.strokeStyle=REFILL_COLORS.cold;p.strokeRect(x-1.5*scale,-y-1.5*scale,w+3*scale,h+3*scale);
 // A small snowflake-like star on top: "cold".
 p.strokeStyle=REFILL_COLORS.cold;p.lineWidth=1.4*scale;const cx=x+w/2,cy=-y-8*scale;for(let i=0;i<3;i++){const a=i*Math.PI/3;p.beginPath();p.moveTo(cx+Math.cos(a)*4*scale,cy+Math.sin(a)*4*scale);p.lineTo(cx-Math.cos(a)*4*scale,cy-Math.sin(a)*4*scale);p.stroke();}
 p.restore();return true;
}
