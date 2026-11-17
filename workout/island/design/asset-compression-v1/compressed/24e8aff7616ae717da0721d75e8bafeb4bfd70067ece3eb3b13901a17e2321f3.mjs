/** v12 presentation: two wing-mounted rotary cannons (local drawing, no logos), muzzle flashes with
 * stars and sparks, and thin tracer bullets. Reads existing model state (player, cannonLast, spinAngle). */
const TAU=Math.PI*2;
function cannon(p,side,m,scale,flashAge,flashLen,flashOnly=false){
 p.save();p.translate(side*m.cannonOffset*(m._aspect||1),flashOnly?0:-3*scale);
 const spin=m.spinAngle||0,w=7*scale,len=flashOnly?(m.muzzleForward||22)-1*scale:17*scale;
 if(!flashOnly){
 // housing
 p.fillStyle='#2c3948';p.strokeStyle='#9fb4c6';p.lineWidth=1*scale;p.beginPath();p.rect(-w*.9,-2*scale,w*1.8,9*scale);p.fill();p.stroke();
 // rotating barrel cluster seen from above: six barrels, the front-facing ones show as moving stripes
 p.fillStyle='#46586b';p.fillRect(-w/2,-len,w,len-1*scale);
 for(let k=0;k<6;k++){const a=spin+k*TAU/6,x=Math.sin(a)*w*.42,front=Math.cos(a);if(front<0)continue;
  p.strokeStyle=`rgba(210,226,240,${.35+.55*front})`;p.lineWidth=1.1*scale;p.beginPath();p.moveTo(x,-len+1*scale);p.lineTo(x,-2*scale);p.stroke();}
 p.strokeStyle='#cfdbe6';p.lineWidth=1.2*scale;p.beginPath();p.rect(-w/2,-len,w,len-1*scale);p.stroke();
 p.fillStyle='#8a99a8';p.fillRect(-w*.62,-len-1.5*scale,w*1.24,2.2*scale);
 }
 // muzzle flash
 if(flashAge<flashLen){
  const k=1-flashAge/flashLen,r=(7+5*k)*scale;p.save();p.translate(0,-len-1*scale);p.globalCompositeOperation='lighter';
  const g=p.createRadialGradient(0,0,0,0,0,r*1.6);g.addColorStop(0,`rgba(255,244,190,${.9*k})`);g.addColorStop(1,'rgba(255,150,60,0)');p.fillStyle=g;p.beginPath();p.arc(0,0,r*1.6,0,TAU);p.fill();
  p.fillStyle=`rgba(255,250,220,${k})`;p.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8+spin*.3,rr=i%2?r*.38:r;i?p.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):p.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}p.closePath();p.fill();
  p.strokeStyle=`rgba(255,200,110,${k})`;p.lineWidth=1.2*scale;for(let i=0;i<3;i++){const a=-Math.PI/2+(i-1)*.5+Math.sin(spin+i)*.15;p.beginPath();p.moveTo(Math.cos(a)*r*.5,Math.sin(a)*r*.5);p.lineTo(Math.cos(a)*r*1.9,Math.sin(a)*r*1.9);p.stroke();}
  p.restore();
 }
 p.restore();
}
/** Two cannons, one per wing; each flashes when it fired in the last `flashSeconds`. */
export function drawV12Cannons(p,m,aspect=1,scale=1){
 if(!m.v12)return;
 const view={...m,_aspect:aspect};
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 const flash=m.flashSeconds||.045;
 const only=Boolean(m.shipV13);cannon(p,-1,view,scale,m.time-m.cannonLast[0],flash,only);cannon(p,1,view,scale,m.time-m.cannonLast[1],flash,only);
 p.restore();
}
/** A small bright tracer; no glow (dozens are on screen at once). */
export function drawV12Tracer(p,s,aspect=1,scale=1){
 p.save();p.translate(s.x,s.y);p.scale(1/aspect,1);p.rotate(Math.atan2(s.vx,-s.vy));
 p.strokeStyle='#ffd77a';p.lineWidth=2.2*scale;p.beginPath();p.moveTo(0,-5*scale);p.lineTo(0,5*scale);p.stroke();
 p.strokeStyle='#fffbe6';p.lineWidth=1*scale;p.beginPath();p.moveTo(0,-5*scale);p.lineTo(0,2*scale);p.stroke();p.restore();
}
