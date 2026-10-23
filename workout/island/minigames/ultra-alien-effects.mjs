import {drawAlienFeedback} from './ultra-alien-feedback.mjs';
export {drawAlienFallbackFeedback} from './ultra-alien-feedback.mjs';
const TAU=Math.PI*2;
const threatColors={needle:'#ff8298',orb:'#ffbf8b',diamond:'#ffabd0',fork:'#dc9fff',ring:'#ffa58c'};
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
 for(const a of m.aliens)if(a.y>0&&a.y<config.height){thruster(p,a.x,a.y-a.radius*.8,m.time+a.phase,pixelAspect,true,a.boss?.8:.33);if(a.hitTime>0)glow(p,a.x,a.y,19,'#fff2b7',pixelAspect,a.hitTime/balance.hitFlashSeconds*.5);}
 for(const s of m.shots){
  const laser=s.kind===1,color=s.wing?'#c5b2ff':laser?'#65eeff':'#93dbff';glow(p,s.x,s.y,laser?17:11,color,pixelAspect,laser?.72:.55);
  p.save();p.translate(s.x,s.y);p.scale(1/pixelAspect,1);p.rotate(Math.atan2(s.vx,-s.vy));
  const length=laser?24:13,g=p.createLinearGradient(0,-length,0,laser?28:16);g.addColorStop(0,'#ffffff');g.addColorStop(.28,color);g.addColorStop(1,rgba(color,0));p.strokeStyle=g;p.lineWidth=laser?5:2.5;p.beginPath();p.moveTo(0,-length);p.lineTo(0,laser?28:16);p.stroke();
  if(laser){p.strokeStyle='#e1ffff';p.lineWidth=1;p.beginPath();p.moveTo(0,-length);p.lineTo(0,20);p.stroke();p.strokeStyle='#65eeff99';p.beginPath();p.moveTo(-4,-14);p.lineTo(-4,12);p.moveTo(4,-14);p.lineTo(4,12);p.stroke();}
  p.restore();
 }
 for(const b of m.bolts){
  const shape=b.shape||balance.enemyTypes?.[b.kind||0]?.projectile||'needle',color=b.mine?'#c986ff':threatColors[shape]||'#ff8298';glow(p,b.x,b.y,b.mine?18:12,color,pixelAspect,.8);
  p.save();p.translate(b.x,b.y);p.scale(1/pixelAspect,1);p.strokeStyle=color;p.fillStyle='#ffe4d7';p.lineWidth=1.5;
  p.rotate(Math.atan2(-(b.vx||0),b.vy||1));p.beginPath();
  if(b.mine){p.rotate(m.time*.5);for(let i=0;i<6;i++){const a=i*TAU/6,x=Math.cos(a)*7,y=Math.sin(a)*7;i?p.lineTo(x,y):p.moveTo(x,y);}p.closePath();p.stroke();p.beginPath();p.arc(0,0,2.5,0,TAU);p.fill();}
  else if(shape==='orb'){p.arc(0,0,5,0,TAU);p.fill();p.beginPath();p.arc(0,0,7,0,TAU);p.stroke();}
  else if(shape==='diamond'){p.moveTo(0,-8);p.lineTo(5,0);p.lineTo(0,8);p.lineTo(-5,0);p.closePath();p.stroke();p.fillRect(-1,-3,2,6);}
  else if(shape==='fork'){p.moveTo(-5,-7);p.lineTo(-5,6);p.lineTo(0,1);p.lineTo(5,6);p.lineTo(5,-7);p.stroke();p.fillRect(-1,-5,2,8);}
  else if(shape==='ring'){p.lineWidth=2;p.arc(0,0,6.5,0,TAU);p.stroke();p.fillRect(-1,-1,2,2);}
  else{p.moveTo(0,-11);p.lineTo(2.5,5);p.lineTo(0,8);p.lineTo(-2.5,5);p.closePath();p.fill();}
  p.restore();
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
 for(const d of m.loot){
  const color=d.kind?'#b7a1f6':'#e7c78c';glow(p,d.x,d.y,18,color,pixelAspect,.5);
  p.save();p.translate(d.x,d.y);p.scale(1/pixelAspect,1);p.strokeStyle=color;p.fillStyle='#0b2131';p.lineWidth=1.4;p.beginPath();
  if(d.kind){p.moveTo(0,-9);p.lineTo(6,0);p.lineTo(0,9);p.lineTo(-6,0);p.closePath();p.fill();p.stroke();p.beginPath();p.moveTo(0,-9);p.lineTo(-1,0);p.lineTo(0,9);p.moveTo(-6,0);p.lineTo(6,0);p.stroke();}
  else{p.arc(0,0,7,0,TAU);p.fill();p.stroke();p.beginPath();p.arc(0,0,4.5,0,TAU);p.stroke();p.fillStyle=color;p.fillRect(-.8,-3.5,1.6,7);}
  p.restore();
 }
 drawAlienFeedback(p,m,balance,pixelAspect,config);
}
