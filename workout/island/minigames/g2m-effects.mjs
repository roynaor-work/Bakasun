const TAU=Math.PI*2;
export function drawAlienShots(p,shots,pixelAspect=1){
 for(const s of shots){p.save();p.translate(s.x,s.y);p.scale(1/pixelAspect,1);p.rotate(Math.atan2(s.vx,-s.vy));p.strokeStyle=s.kind===1?'#b8ffff':'#ffe28a';p.lineWidth=s.kind===1?5:3;p.beginPath();p.moveTo(0,10);p.lineTo(0,-12);p.stroke();p.strokeStyle='#fffdf1';p.lineWidth=1;p.stroke();p.restore();}
}
export function rocketPoint(nova,balance,t){
 return {x:nova.fromX,y:nova.fromY-(nova.fromY-nova.stopY)*t,angle:0};
}
/** Screen-plane effects are shared by the depth view and the Canvas fallback. */
export function drawAlienEffects(p,m,balance,pixelAspect=1){
 const n=m.nova;
 p.save();
 if(n.flight>0){
  const t=1-n.flight/balance.nova.throwSeconds;
  for(let i=18;i>0;i--){const u=t-i*.012;if(u<0)continue;const point=rocketPoint(n,balance,u);p.globalAlpha=(1-i/20)*.55;p.fillStyle=i<6?'#ffad55':'#8295aa';p.beginPath();p.ellipse(point.x+Math.sin(i*2)*2,point.y,2+i*.32,3+i*.32,0,0,TAU);p.fill();}
  const q=rocketPoint(n,balance,t);p.globalAlpha=1;p.translate(q.x,q.y);p.scale(1/pixelAspect,1);p.rotate(q.angle);
  p.fillStyle='#ff663d';p.beginPath();p.moveTo(-5,10);p.lineTo(0,28+Math.sin(m.time*80)*4);p.lineTo(5,10);p.fill();p.fillStyle='#fff3a8';p.fillRect(-2,9,4,12);
  p.fillStyle='#f4f8ff';p.beginPath();p.moveTo(0,-16);p.lineTo(6,-3);p.lineTo(6,10);p.lineTo(-6,10);p.lineTo(-6,-3);p.closePath();p.fill();p.fillStyle='#ff604e';p.fillRect(-6,3,12,4);p.fillStyle='#8cffff';p.fillRect(-2,-6,4,6);
 }
 p.restore();
 if(n.life>0){
  const t=1-n.life/balance.nova.seconds,r=Math.max(1,Math.min(n.radius,balance.nova.visualRadius)*Math.min(1,t*2));p.save();p.globalAlpha=1-t;p.strokeStyle='#c8fbff';p.lineWidth=8*(1-t)+2;p.beginPath();p.ellipse(n.x,n.y,r/pixelAspect,r,0,0,TAU);p.stroke();
  const glow=p.createRadialGradient(n.x,n.y,0,n.x,n.y,r);glow.addColorStop(0,'#ffffff');glow.addColorStop(.2,'#fff3b3');glow.addColorStop(.55,'#ff803d88');glow.addColorStop(1,'#ff603d00');p.translate(n.x,n.y);p.scale(1/pixelAspect,1);p.translate(-n.x,-n.y);p.fillStyle=glow;p.beginPath();p.arc(n.x,n.y,r,0,TAU);p.fill();p.restore();
 }
}
export function drawAlienBolts(p,bolts,balance,pixelAspect=1){
 for(const b of bolts){const type=balance.enemyTypes[b.kind||0],shape=b.shape||type.projectile;p.save();p.translate(b.x,b.y);p.scale(1/pixelAspect,1);p.fillStyle=b.color||type.color;p.strokeStyle=p.fillStyle;p.lineWidth=3;
  p.beginPath();if(shape==='needle'){p.moveTo(0,-10);p.lineTo(4,6);p.lineTo(0,11);p.lineTo(-4,6);}else if(shape==='orb'){p.arc(0,0,7,0,TAU);}else if(shape==='diamond'){p.moveTo(0,-9);p.lineTo(6,0);p.lineTo(0,9);p.lineTo(-6,0);}else if(shape==='fork'){p.moveTo(-6,-7);p.lineTo(-6,7);p.lineTo(0,1);p.lineTo(6,7);p.lineTo(6,-7);}else{p.arc(0,0,8,0,TAU);}p.closePath();if(shape==='ring')p.stroke();else p.fill();p.fillStyle='#ffffff';p.fillRect(-1,-2,2,4);p.restore();
 }
}
