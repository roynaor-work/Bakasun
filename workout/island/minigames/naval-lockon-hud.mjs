/** 13/11/2026 v23 lock-on HUD (screen pixels, drawn over the battle): the ring that fills under a resting finger, the lock itself
 * (four corner brackets around the hull, a padlock, a ring that spins while the turret is still turning and goes solid green when a
 * tap will hit), an arrow on the edge when the locked hull is out of the picture, a one-word reason when the shot cannot land on the
 * hull now (too far, another hull in the way, a submarine under water), and, until the first lock of a stage, a small "hold to lock"
 * hint over the nearest hull. Nothing is drawn unless lock-on is on (`?navalLock=0` keeps the v22 screen). */
import {navalEdgeHint} from './naval-aim-flag.mjs?v=island-v2-20261107-11';
const TAU=Math.PI*2;
export const NAVAL_LOCK_COLORS=Object.freeze({ready:'#62E6AA',turning:'#FFD166',far:'#FF9A5C',blocked:'#FF9A5C',miss:'#FF9A5C',dive:'#FF9A5C',press:'#FFFFFF',outline:'#103847'});
export const NAVAL_LOCK_WORDS=Object.freeze({far:'רחוק מדי · מתקרבים',blocked:'מטרה אחרת בדרך',dive:'מתחת למים · מחכים',hint:'החזיקו אצבע על ספינה'});
/** The hull's box on screen: its bow, stern and centre on the water and at the bar height. */
export function navalLockBox(e,project,balance){
 const L=(balance?.aim?.hullLength??34)*(e.hullScale||1)*.8,h=e.heading||0,lift=balance?.render?.effects?.healthLift??4.2;
 const pts=[project(e.x+Math.cos(h)*L,e.z+Math.sin(h)*L,1),project(e.x-Math.cos(h)*L,e.z-Math.sin(h)*L,1),project(e.x,e.z,0),project(e.x,e.z,lift*.6)];
 if(pts.some(q=>!q||!(q.depth>0)))return null;
 const xs=pts.map(q=>q.x),ys=pts.map(q=>q.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 return {x:cx,y:cy,w:Math.max(64,Math.max(...xs)-Math.min(...xs)+20),h:Math.max(38,Math.max(...ys)-Math.min(...ys)+18)};
}
function brackets(p,b,color,arm){
 p.lineCap='round';p.lineJoin='round';
 const draw=()=>{p.beginPath();for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const x=b.x+sx*b.w/2,y=b.y+sy*b.h/2;p.moveTo(x,y-sy*arm);p.lineTo(x,y);p.lineTo(x-sx*arm,y);}p.stroke();};
 p.strokeStyle=NAVAL_LOCK_COLORS.outline;p.lineWidth=6;draw();p.strokeStyle=color;p.lineWidth=3;draw();
}
function padlock(p,x,y,color,s=1){
 p.save();p.translate(x,y);p.scale(s,s);p.lineJoin='round';p.strokeStyle=NAVAL_LOCK_COLORS.outline;p.lineWidth=4.5;
 const shackle=()=>{p.beginPath();p.arc(0,-4,4.4,Math.PI,0);p.lineTo(4.4,0);p.moveTo(-4.4,0);p.lineTo(-4.4,-4);p.stroke();};
 shackle();p.strokeStyle=color;p.lineWidth=2.2;shackle();
 p.fillStyle=NAVAL_LOCK_COLORS.outline;p.beginPath();p.roundRect(-7.5,-1.5,15,11.5,2.5);p.fill();p.fillStyle=color;p.beginPath();p.roundRect(-6,0,12,8.5,2);p.fill();
 p.fillStyle=NAVAL_LOCK_COLORS.outline;p.beginPath();p.arc(0,3.6,1.6,0,TAU);p.fill();p.restore();
}
function pill(p,text,x,y,color){
 p.save();p.font='bold 12px sans-serif';p.direction='rtl';p.textAlign='center';p.textBaseline='middle';const w=Math.ceil(p.measureText(text).width)+18;
 p.fillStyle='#092a3ce8';p.beginPath();p.roundRect(x-w/2,y-10,w,20,10);p.fill();p.strokeStyle=color;p.lineWidth=1.4;p.stroke();p.fillStyle='#f3f0e2';p.fillText(text,x,y+.5);p.restore();
 return {x:x-w/2,y:y-10,w,h:20};
}
export function drawNavalLockHud(p,m,balance,project,width,height){
 if(!m?.lockEnabled)return null;
 const find=i=>(m.enemies||[]).find(e=>e.index===i&&e.active&&e.hp>0),out={};
 p.save();
 const press=m.lockPress,pressed=press&&find(press.index);
 if(pressed){const b=navalLockBox(pressed,project,balance);if(b){const r=Math.max(26,Math.min(44,b.w*.42));
  p.lineCap='round';p.strokeStyle=NAVAL_LOCK_COLORS.outline;p.lineWidth=7;p.beginPath();p.arc(b.x,b.y,r,0,TAU);p.globalAlpha=.55;p.stroke();p.globalAlpha=1;
  p.strokeStyle=NAVAL_LOCK_COLORS.press;p.lineWidth=4;p.beginPath();p.arc(b.x,b.y,r,-Math.PI/2,-Math.PI/2+TAU*press.progress);p.stroke();
  padlock(p,b.x,b.y-r-12,NAVAL_LOCK_COLORS.press,.9);out.press={index:press.index,x:Math.round(b.x),y:Math.round(b.y),r:Math.round(r),progress:+press.progress.toFixed(2)};}}
 const h=m.homing,locked=h&&find(h.index);
 if(locked){
  const status=h.status||'turning',color=NAVAL_LOCK_COLORS[status]||NAVAL_LOCK_COLORS.turning,b=navalLockBox(locked,project,balance),age=Math.max(0,(m.time??0)-(h.at??0));
  const onScreen=b&&b.x>=8&&b.x<=width-8&&b.y>=8&&b.y<=height-8;
  if(onScreen){
   // The lock "snaps" in: the brackets close in from a wider box over a quarter second.
   const k=Math.min(1,age/.25),grow=(1-k)*(1-k)*24,box={x:b.x,y:b.y,w:b.w+grow,h:b.h+grow*.6};
   brackets(p,box,color,Math.min(14,box.w*.2));
   const r=Math.max(16,Math.min(30,b.h*.55));p.lineWidth=2;p.strokeStyle=color;
   if(status==='turning'){p.setLineDash([5,5]);p.lineDashOffset=-(m.time??0)*40;}
   p.beginPath();p.arc(b.x,b.y,r,0,TAU);p.globalAlpha=.85;p.stroke();p.globalAlpha=1;p.setLineDash([]);
   for(let i=0;i<4;i++){const a=i*Math.PI/2;p.beginPath();p.moveTo(b.x+Math.cos(a)*(r-5),b.y+Math.sin(a)*(r-5));p.lineTo(b.x+Math.cos(a)*(r+5),b.y+Math.sin(a)*(r+5));p.stroke();}
   padlock(p,b.x+box.w/2+11,b.y-box.h/2-4,color,1);
   const word=NAVAL_LOCK_WORDS[status];if(word)out.word={text:word,...pill(p,word,b.x,b.y+box.h/2+16,color)};
   out.lock={index:h.index,status,x:Math.round(b.x),y:Math.round(b.y),w:Math.round(box.w),h:Math.round(box.h),offscreen:false};
  }else{
   const q=project(locked.x,locked.z,1.5),hint=navalEdgeHint(q,width,height,30);
   if(hint){p.save();p.translate(hint.x,hint.y);p.rotate(hint.angle);p.fillStyle=color;p.strokeStyle=NAVAL_LOCK_COLORS.outline;p.lineWidth=2;p.beginPath();p.moveTo(14,0);p.lineTo(-8,-10);p.lineTo(-3,0);p.lineTo(-8,10);p.closePath();p.fill();p.stroke();p.restore();
    padlock(p,hint.x-Math.cos(hint.angle)*22,hint.y-Math.sin(hint.angle)*22,color,.9);}
   out.lock={index:h.index,status,offscreen:true,arrow:hint?{x:Math.round(hint.x),y:Math.round(hint.y)}:null};
  }
 }
 // Until the first lock of the stage: a small hint over the nearest hull (open water only, never while aiming or pressing).
 if(!h&&!pressed&&!m.aiming&&(m.locksMade||0)===0&&(m.time??0)<9){
  const e=find(m.selectedTargetIndex)||(m.enemies||[]).find(x=>x.active&&x.hp>0),b=e&&navalLockBox(e,project,balance);
  if(b&&b.y>70&&b.y<height-40){const y=Math.max(58,b.y-b.h/2-30),pulse=.5+.5*Math.sin((m.time??0)*5);p.globalAlpha=.75+.25*pulse;
   const box=pill(p,NAVAL_LOCK_WORDS.hint,b.x,y,NAVAL_LOCK_COLORS.turning);padlock(p,box.x-10,y,NAVAL_LOCK_COLORS.turning,.8);p.globalAlpha=1;out.hint={x:Math.round(b.x),y:Math.round(y)};}
 }
 p.restore();
 return Object.keys(out).length?out:null;
}
