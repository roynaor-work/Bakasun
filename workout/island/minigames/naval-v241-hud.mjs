/** Ships v24.1 HUD (screen pixels, over the battle; reads the model only, see naval-v241.mjs):
 *  - the radar acquisition: amber corner brackets that close in on the hull while a gauge ring fills around it and a radar sweep turns,
 *    with an open padlock above (it closes, green, when the lock is made: that part is the v23 lock HUD); an edge arrow when the hull is
 *    off the picture;
 *  - a refused or lost lock: red brackets that fade, and one short reason ("out of the radar's range" / "lock lost");
 *  - the clear-sky wait at the end of a stage: a banner over the battle ("a helicopter is up, shoot it down with the Vulcan") and an edge
 *    arrow toward the aircraft when it is off the picture.
 * Nothing is drawn for a part whose switch is off (the model reports `radarOn`, `airFinale`). */
import {navalLockBox,NAVAL_LOCK_COLORS} from './naval-lockon-hud.mjs?v=island-v2-20261107-18';
import {navalEdgeHint} from './naval-aim-flag.mjs?v=island-v2-20261107-18';
import {NAVAL_AIR_LIFT} from './naval-air.mjs?v=island-v2-20261107-18';
import {NAVAL_V241_COLORS,NAVAL_V241_WORDS,NAVAL_V241_DEFAULTS,navalRadarRange} from './naval-v241.mjs?v=island-v2-20261107-18';
const TAU=Math.PI*2,OUTLINE=NAVAL_LOCK_COLORS.outline;
function brackets(p,b,color,arm,alpha=1){
 p.save();p.globalAlpha=alpha;p.lineCap='round';p.lineJoin='round';
 const draw=()=>{p.beginPath();for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const x=b.x+sx*b.w/2,y=b.y+sy*b.h/2;p.moveTo(x,y-sy*arm);p.lineTo(x,y);p.lineTo(x-sx*arm,y);}p.stroke();};
 p.strokeStyle=OUTLINE;p.lineWidth=6;draw();p.strokeStyle=color;p.lineWidth=3;draw();p.restore();
}
/** A padlock; `open` lifts the shackle off one side (the radar has not locked yet). */
export function navalPadlock(p,x,y,color,s=1,open=false){
 p.save();p.translate(x,y);p.scale(s,s);p.lineJoin='round';p.lineCap='round';
 const shackle=()=>{p.beginPath();if(open){p.moveTo(-4.4,0);p.lineTo(-4.4,-6.5);p.arc(0,-6.5,4.4,Math.PI,0);p.lineTo(4.4,-4.5);}else{p.moveTo(-4.4,0);p.lineTo(-4.4,-4);p.arc(0,-4,4.4,Math.PI,0);p.lineTo(4.4,0);}p.stroke();};
 p.strokeStyle=OUTLINE;p.lineWidth=4.5;shackle();p.strokeStyle=color;p.lineWidth=2.2;shackle();
 p.fillStyle=OUTLINE;p.beginPath();p.roundRect(-7.5,-1.5,15,11.5,2.5);p.fill();p.fillStyle=color;p.beginPath();p.roundRect(-6,0,12,8.5,2);p.fill();
 p.fillStyle=OUTLINE;p.beginPath();p.arc(0,3.6,1.6,0,TAU);p.fill();p.restore();
}
function pill(p,text,x,y,color,size=12){
 p.save();p.font=`bold ${size}px sans-serif`;p.direction='rtl';p.textAlign='center';p.textBaseline='middle';const w=Math.ceil(p.measureText(text).width)+20,h=size+9;
 p.fillStyle='#092a3ceb';p.beginPath();p.roundRect(x-w/2,y-h/2,w,h,h/2);p.fill();p.strokeStyle=color;p.lineWidth=1.5;p.stroke();p.fillStyle='#f3f0e2';p.fillText(text,x,y+.5);p.restore();
 return {x:Math.round(x-w/2),y:Math.round(y-h/2),w,h};
}
function edgeArrow(p,hint,color){p.save();p.translate(hint.x,hint.y);p.rotate(hint.angle);p.fillStyle=color;p.strokeStyle=OUTLINE;p.lineWidth=2;p.beginPath();p.moveTo(14,0);p.lineTo(-8,-10);p.lineTo(-3,0);p.lineTo(-8,10);p.closePath();p.fill();p.stroke();p.restore();}
const live=(m,i)=>(m.enemies||[]).find(e=>e.index===i&&e.active&&e.hp>0);
export function drawNavalV241(p,m,balance,project,width,height){
 if(!m||!(m.radarOn||m.airFinale))return null;
 const time=m.time??0,out={};p.save();
 // 1. Radar acquisition.
 const r=m.radarOn?m.radar:null,e=r&&live(m,r.index);
 if(e){const b=navalLockBox(e,project,balance),k=Math.max(0,Math.min(1,r.progress||0));
  if(b&&b.x>=8&&b.x<=width-8&&b.y>=8&&b.y<=height-8){
   const grow=(1-k)*(1-k)*52,box={x:b.x,y:b.y,w:b.w+grow,h:b.h+grow*.6},R=Math.max(20,Math.min(36,b.h*.62));
   brackets(p,box,NAVAL_V241_COLORS.radar,Math.min(16,box.w*.2));
   // The gauge: a dark track, the filled part in amber, a tick at the top; the sweep: a short wedge that turns once every 0.6 s.
   p.lineCap='round';p.strokeStyle=OUTLINE;p.lineWidth=7;p.globalAlpha=.6;p.beginPath();p.arc(b.x,b.y,R,0,TAU);p.stroke();p.globalAlpha=1;
   p.strokeStyle=NAVAL_V241_COLORS.radar;p.lineWidth=4;p.beginPath();p.arc(b.x,b.y,R,-Math.PI/2,-Math.PI/2+TAU*k);p.stroke();
   const a=Number.isFinite(r.sweep)?r.sweep:time*TAU/.6;p.save();p.globalAlpha=.32;p.fillStyle=NAVAL_V241_COLORS.radar;p.beginPath();p.moveTo(b.x,b.y);p.arc(b.x,b.y,R-4,a-.55,a);p.closePath();p.fill();p.globalAlpha=.9;p.strokeStyle=NAVAL_V241_COLORS.radar;p.lineWidth=1.6;p.beginPath();p.moveTo(b.x,b.y);p.lineTo(b.x+Math.cos(a)*(R-4),b.y+Math.sin(a)*(R-4));p.stroke();p.restore();
   navalPadlock(p,b.x+box.w/2+11,b.y-box.h/2-4,NAVAL_V241_COLORS.radar,1,true);
   out.radar={index:r.index,progress:+k.toFixed(2),need:+(r.need||0).toFixed(2),queued:Boolean(r.queued),...(Number.isFinite(r.sweep)?{sweep:r.sweep,scans:r.scans,bearing:r.bearing}:{}),x:Math.round(b.x),y:Math.round(b.y),r:Math.round(R),box:{w:Math.round(box.w),h:Math.round(box.h)},offscreen:false};
  }else{const q=project(e.x,e.z,1.5),hint=navalEdgeHint(q,width,height,30);if(hint)edgeArrow(p,hint,NAVAL_V241_COLORS.radar);out.radar={index:r.index,progress:+k.toFixed(2),offscreen:true,arrow:hint?{x:Math.round(hint.x),y:Math.round(hint.y)}:null};}
 }
 // 2. A lock refused (out of the radar's range) or lost (the hull left it): red brackets that fade and one short reason.
 const lost=m.radarOn?m.radarLost:null,span=NAVAL_V241_DEFAULTS.radar.lostSeconds;
 if(lost&&time-lost.time>=0&&time-lost.time<span){const t=live(m,lost.index),b=t&&navalLockBox(t,project,balance),fade=1-(time-lost.time)/span;
  const word=lost.reason==='range'?NAVAL_V241_WORDS.range:NAVAL_V241_WORDS.lost;
  // The radar's reach as a dashed ring on the water around our ship, so "out of range" shows how far to sail.
  // Only the part of the ring in front of the camera is drawn (the ring is wider than the picture and passes behind the camera).
  const ship=m.playerShip,R=navalRadarRange(m.ammoIndex,m.radarConfig||NAVAL_V241_DEFAULTS.radar);if(ship){p.save();p.globalAlpha=.75*Math.max(0,fade);p.setLineDash([7,6]);p.lineDashOffset=-time*30;let drawn=0,pen=false;p.beginPath();
   for(let i=0;i<=96;i++){const a=i/96*TAU,q=project(ship.x+Math.cos(a)*R,(ship.z||0)+Math.sin(a)*R,.05),ok=q&&q.depth>0&&q.x>-200&&q.x<width+200&&q.y>-200&&q.y<height+200;if(!ok){pen=false;continue;}if(pen)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);pen=true;drawn++;}
   if(drawn>1){p.strokeStyle=OUTLINE;p.lineWidth=4.5;p.stroke();p.strokeStyle=NAVAL_V241_COLORS.lost;p.lineWidth=2;p.stroke();out.rangeRing=Math.round(R);}p.restore();}
  if(b&&b.x>=8&&b.x<=width-8&&b.y>=8&&b.y<=height-8){brackets(p,{x:b.x,y:b.y,w:b.w+8,h:b.h+6},NAVAL_V241_COLORS.lost,Math.min(14,b.w*.2),Math.max(0,fade));p.save();p.globalAlpha=Math.min(1,fade*2);const box=pill(p,word,Math.max(70,Math.min(width-70,b.x)),Math.min(height-24,b.y+b.h/2+18),NAVAL_V241_COLORS.lost);p.restore();out.lost={index:lost.index,reason:lost.reason,word,box};}
  else{p.save();p.globalAlpha=Math.min(1,fade*2);const box=pill(p,word,width/2,height*.3,NAVAL_V241_COLORS.lost);p.restore();out.lost={index:lost.index,reason:lost.reason,word,box,offscreen:true};}
 }
 // 3. The clear-sky wait: the fleet is down, an aircraft is still up.
 if(m.airFinale){const air=(m.air||[]).filter(a=>a.state!=='down'),a=air[0]||null,leaving=Boolean(a)&&air.every(x=>x.state==='out');
  const word=!a?NAVAL_V241_WORDS.leaving:leaving?NAVAL_V241_WORDS.leaving:a.kind==='plane'?NAVAL_V241_WORDS.plane:NAVAL_V241_WORDS.air,pulse=.82+.18*Math.sin(time*5);
  p.save();p.globalAlpha=pulse;const box=pill(p,word,width/2,74,NAVAL_V241_COLORS.air,14);p.restore();out.air={word,box,aircraft:air.length,leaving,arrows:0};
  for(const x of air){const q=project(x.x,x.z,Math.max(0,x.h)*NAVAL_AIR_LIFT),hint=navalEdgeHint(q,width,height,30);if(hint){edgeArrow(p,hint,NAVAL_V241_COLORS.air);out.air.arrows++;}}
 }
 p.restore();return Object.keys(out).length?out:null;
}
