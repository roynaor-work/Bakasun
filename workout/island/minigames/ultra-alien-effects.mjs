const TAU=Math.PI*2;
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`;};
function glow(p,x,y,r,color,aspect,alpha=1){
 p.save();p.translate(x,y);p.scale(1/aspect,1);p.globalAlpha=alpha;const g=p.createRadialGradient(0,0,0,0,0,r);
 g.addColorStop(0,rgba(color,.8));g.addColorStop(.18,rgba(color,.35));g.addColorStop(1,rgba(color,0));p.fillStyle=g;p.fillRect(-r,-r,r*2,r*2);p.restore();
}
function thruster(p,x,y,time,aspect,enemy=false,scale=1){
 const flicker=1+Math.sin(time*51+x)*.12,color=enemy?'#c27aff':'#68dfff';glow(p,x,y,15*scale,color,aspect,.7);
 p.save();p.translate(x,y);p.scale(scale/aspect,scale*(enemy?-1:1));
 const g=p.createLinearGradient(0,0,0,22*flicker);g.addColorStop(0,'#edffff');g.addColorStop(.15,color);g.addColorStop(.55,rgba(color,.35));g.addColorStop(1,rgba(color,0));p.fillStyle=g;
 p.beginPath();p.moveTo(-3,0);p.quadraticCurveTo(-4,8,0,24*flicker);p.quadraticCurveTo(4,8,3,0);p.fill();p.restore();
}

/** Presentation only; every effect reads an existing entity or simulation timer. */
export function drawUltraAlienEffects(p,m,balance,pixelAspect=1,config={height:480}){
 const displayHeight=p.canvas?.clientHeight||config.height,screenScale=config.height/displayHeight;
 const playerLength=Math.min(76,displayHeight*.18)*screenScale;
 p.save();p.globalCompositeOperation='lighter';
 thruster(p,m.player.x,m.player.y+playerLength*.48,m.time,pixelAspect,false,.85*screenScale);
 for(const a of m.aliens)if(a.y>0&&a.y<480){thruster(p,a.x,a.y-a.radius*.8,m.time+a.phase,pixelAspect,true,a.boss?.8:.33);if(a.hitTime>0)glow(p,a.x,a.y,19,'#fff2b7',pixelAspect,a.hitTime/balance.hitFlashSeconds*.5);}
 for(const s of m.shots){
  const color=s.kind===1?'#65eeff':'#93dbff';glow(p,s.x,s.y,13,color,pixelAspect,.65);
  p.save();p.translate(s.x,s.y);p.scale(1/pixelAspect,1);p.rotate(Math.atan2(s.vx,-s.vy));
  const g=p.createLinearGradient(0,-14,0,23);g.addColorStop(0,'#ffffff');g.addColorStop(.28,color);g.addColorStop(1,rgba(color,0));p.strokeStyle=g;p.lineWidth=s.kind===1?4:2.5;p.beginPath();p.moveTo(0,-14);p.lineTo(0,23);p.stroke();p.restore();
 }
 for(const b of m.bolts){
  const color=b.mine?'#c986ff':'#ff6d7f';glow(p,b.x,b.y,b.mine?18:12,color,pixelAspect,.8);
  p.save();p.translate(b.x,b.y);p.scale(1/pixelAspect,1);p.strokeStyle=color;p.fillStyle='#ffe4d7';p.lineWidth=1.5;
  if(b.mine){p.rotate(m.time*.5);p.strokeRect(-6,-6,12,12);p.rotate(Math.PI/4);p.strokeRect(-4,-4,8,8);}else{p.rotate(Math.atan2(-(b.vx||0),b.vy||1));p.fillRect(-1.1,-8,2.2,12);p.strokeRect(-2,-7,4,10);}p.restore();
 }
 for(const s of m.sparks){const alpha=Math.max(0,s.life/balance.sparkSeconds);glow(p,s.x,s.y,9,'#ffb56e',pixelAspect,alpha*.55);p.save();p.globalAlpha=alpha;p.strokeStyle=alpha>.65?'#fff0c4':'#ee9b59';p.lineWidth=1.2;p.beginPath();p.moveTo(s.x,s.y);p.lineTo(s.x-s.vx*.024/pixelAspect,s.y-s.vy*.024);p.stroke();p.restore();}
 const n=m.nova;
 if(n.flight>0){
  for(let i=1;i<=12;i++)glow(p,n.x+Math.sin(i*2+m.time)*i*.12/pixelAspect,n.y+i*5,8+i*.6,'#ffb777',pixelAspect,(1-i/13)*.5);
  p.save();p.translate(n.x,n.y);p.scale(1/pixelAspect,1);p.fillStyle='#bdccd6';p.strokeStyle='#f6f9fa';p.lineWidth=1;
  p.beginPath();p.moveTo(0,-15);p.quadraticCurveTo(5,-8,4,9);p.lineTo(8,14);p.lineTo(2,12);p.lineTo(-2,12);p.lineTo(-8,14);p.lineTo(-4,9);p.quadraticCurveTo(-5,-8,0,-15);p.fill();p.stroke();p.fillStyle='#5e8b9e';p.fillRect(-3,-4,6,5);p.restore();
  thruster(p,n.x,n.y+13,m.time,pixelAspect,false,1.5);
 }
 if(n.life>0){const t=1-n.life/balance.nova.seconds,r=Math.max(1,Math.min(n.radius,balance.nova.visualRadius)*Math.min(1,t*2));
  glow(p,n.x,n.y,r,'#ffbc7f',pixelAspect,(1-t)*.8);p.save();p.translate(n.x,n.y);p.scale(1/pixelAspect,1);p.globalAlpha=(1-t)**2;p.strokeStyle='#bcefff';p.lineWidth=4*(1-t)+.5;p.beginPath();p.arc(0,0,r,0,TAU);p.stroke();p.strokeStyle='#ffbd7e';p.lineWidth=1;p.beginPath();p.arc(0,0,r*.78,0,TAU);p.stroke();p.restore();
 }
 p.restore();
 for(const d of [...m.pickups,...m.loot]){
  const pickup=m.pickups.includes(d),color=pickup?'#87ebde':d.kind?'#b7a1f6':'#e7c78c';glow(p,d.x,d.y,18,color,pixelAspect,.5);
  p.save();p.translate(d.x,d.y);p.scale(1/pixelAspect,1);p.rotate(pickup?m.time*.5:0);p.strokeStyle=color;p.fillStyle='#0b2131';p.lineWidth=1.3;p.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=Math.cos(a)*7,y=Math.sin(a)*7;i?p.lineTo(x,y):p.moveTo(x,y);}p.closePath();p.fill();p.stroke();p.fillStyle=color;p.fillRect(-2,-3,4,6);p.restore();
 }
}
