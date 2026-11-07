/** v10 presentation: one look for danger (red/orange, sharp spikes, pulsing halo) and a different
 * look for bonuses (gold ring, green plate, round, rotating, with an icon). Shape differs as well as
 * colour, so the two stay distinguishable without colour. Reads existing entities only. */
const TAU=Math.PI*2;
export const DANGER={core:'#ff3d2e',halo:'#ff7a2f',edge:'#fff0d0'};
export const BONUS={ring:'#ffd84a',plate:'#0d3b2b',glyph:'#9dffb8'};
function halo(p,x,y,r,color,aspect,alpha){
 p.save();p.translate(x,y);p.scale(1/aspect,1);p.globalAlpha=alpha;const g=p.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,color+'cc');g.addColorStop(.35,color+'66');g.addColorStop(1,color+'00');p.fillStyle=g;p.fillRect(-r,-r,r*2,r*2);p.restore();
}
/** Enemy fire: sharp downward spikes (mines are spiked stars), red core, orange halo. */
export function drawV10Bolts(p,bolts,time,aspect=1,scale=1){
 for(const b of bolts){
  const pulse=.75+.25*Math.sin(time*14+b.x*.1);
  p.save();p.globalCompositeOperation='lighter';halo(p,b.x,b.y,(b.mine?22:17)*scale,DANGER.halo,aspect,pulse);p.restore();
  p.save();p.translate(b.x,b.y);p.scale(1.35*scale/aspect,1.35*scale);p.lineJoin='miter';p.lineWidth=1.6;p.fillStyle=DANGER.core;p.strokeStyle=DANGER.edge;
  if(b.mine){p.rotate(time*.8);p.beginPath();for(let i=0;i<12;i++){const r=i%2?5:11,a=i*TAU/12;i?p.lineTo(Math.cos(a)*r,Math.sin(a)*r):p.moveTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();p.stroke();}
  else{p.rotate(Math.atan2(-(b.vx||0),b.vy||1));p.beginPath();p.moveTo(0,12);p.lineTo(5.5,-4);p.lineTo(0,-1);p.lineTo(-5.5,-4);p.closePath();p.fill();p.stroke();p.fillStyle=DANGER.edge;p.fillRect(-.8,-1,1.6,6);}
  p.restore();
 }
}
/** A bonus: round gold-ringed token with a green plate and the bonus icon, bobbing and spinning ring. */
export function drawV10Pickup(p,pickup,time,aspect,scale,drawGlyph){
 const bob=Math.sin(time*4+pickup.x*.05)*2*scale,x=pickup.x,y=pickup.y+bob;
 p.save();p.globalCompositeOperation='lighter';halo(p,x,y,24*scale,BONUS.ring,aspect,.6+.2*Math.sin(time*5));p.restore();
 p.save();p.translate(x,y);p.scale(scale/aspect,scale);
 p.fillStyle=BONUS.plate;p.beginPath();p.arc(0,0,13,0,TAU);p.fill();
 p.strokeStyle=BONUS.ring;p.lineWidth=2.2;p.beginPath();p.arc(0,0,13,0,TAU);p.stroke();
 p.setLineDash([4,4]);p.lineDashOffset=-time*14;p.lineWidth=1.4;p.beginPath();p.arc(0,0,17.5,0,TAU);p.stroke();p.setLineDash([]);
 p.restore();
 drawGlyph(p,pickup.kind,x,y,10*scale,aspect,1,{round:true,color:BONUS.glyph});
}
/** Missile: dashed guide line and lock ring on the target, smoke trail, rotated body. */
export function drawV10Missile(p,m,aspect=1,scale=1){
 const n=m.nova;if(!(n.flight>0))return;
 if(Number.isFinite(n.targetX)&&m.aliens.some(a=>a.id===n.targetId)){
  p.save();p.strokeStyle='#ffe9a8';p.globalAlpha=.8;p.lineWidth=1.3*scale;p.setLineDash([5*scale,5*scale]);p.lineDashOffset=-m.time*40;
  p.beginPath();p.moveTo(n.x,n.y);p.lineTo(n.targetX,n.targetY);p.stroke();p.setLineDash([]);
  p.translate(n.targetX,n.targetY);p.scale(1/aspect,1);p.lineWidth=2*scale;p.globalAlpha=.9;const r=(22+Math.sin(m.time*10)*2)*scale;
  p.beginPath();p.arc(0,0,r,0,TAU);p.stroke();for(let i=0;i<4;i++){const a=i*TAU/4;p.beginPath();p.moveTo(Math.cos(a)*(r-4*scale),Math.sin(a)*(r-4*scale));p.lineTo(Math.cos(a)*(r+6*scale),Math.sin(a)*(r+6*scale));p.stroke();}
  p.restore();
 }
 const trail=n.trail||[];
 for(let i=0;i<trail.length;i++){const t=trail[i],k=(i+1)/trail.length;p.save();p.globalAlpha=k*.6;p.fillStyle=k>.7?'#ffd08a':'#aab6c4';p.beginPath();p.ellipse(t.x,t.y,(2+k*5)*scale/aspect,(2+k*5)*scale,0,0,TAU);p.fill();p.restore();}
 p.save();p.translate(n.x,n.y);p.scale(scale/aspect,scale);p.rotate(n.angle+Math.PI/2);
 p.fillStyle='#ff8a3c';p.beginPath();p.moveTo(-4,10);p.lineTo(0,22+Math.sin(m.time*70)*3);p.lineTo(4,10);p.fill();
 p.fillStyle='#f4f8ff';p.strokeStyle='#27475a';p.lineWidth=1;p.beginPath();p.moveTo(0,-15);p.quadraticCurveTo(6,-8,5,10);p.lineTo(-5,10);p.quadraticCurveTo(-6,-8,0,-15);p.closePath();p.fill();p.stroke();
 p.fillStyle='#ff5a45';p.fillRect(-5,2,10,4);p.restore();
}
/** Timer ring around a temporary companion; blinks out during the last seconds. */
export function drawV10WingTimer(p,m,aspect=1,scale=1,blink=2.5){
 if(!(m.wingTime>0)||!(m.wingMax>0))return;
 const f=Math.min(1,m.wingTime/m.wingMax),flash=m.wingTime<blink&&Math.floor(m.time*8)%2===0;
 for(const w of m.wings){if(!w.active)continue;
  p.save();p.translate(w.x,w.y);p.scale(1/aspect,1);p.strokeStyle='#ffffff22';p.lineWidth=3*scale;p.beginPath();p.arc(0,0,21*scale,0,TAU);p.stroke();
  p.strokeStyle=flash?'#ff9a3c':BONUS.ring;p.lineWidth=3*scale;p.beginPath();p.arc(0,0,21*scale,-Math.PI/2,-Math.PI/2+TAU*f);p.stroke();p.restore();}
}
/** Wings blink in the last seconds so the bonus visibly runs out. */
export const wingVisible=(m,blink=2.5)=>!(m.wingTime>0&&m.wingTime<blink)||Math.floor(m.time*8)%2===0;
