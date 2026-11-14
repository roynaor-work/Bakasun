/** Ships v24 HUD (screen pixels, over the battle; reads the model only):
 *  - enemy fire: every shot that is on its way or about to be fired is a red pulsing decal on the water where it will land (the Codex
 *    `water-target.png` from refill-enemyfire-v1, laid flat on the sea by the camera's own projection), pulsing faster as it nears;
 *    a torpedo also draws its bubble line. Replaces the v23 orange outlines (`?navalEnemyFire=v23` keeps them).
 *  - submarine: a diving submarine is a cyan sonar ring with bubbles (so it can be found and locked), a shell that passes over it says
 *    "under water", the player's torpedo leaves a bubble line, and a torpedo hit under water is the Codex `water_explosion.png`.
 *  - aim: "where to hit": a ring on the hull where the shell will meet it (the forecast fleet), green when the shot will hit, amber while
 *    the turret still turns, orange when it will not land; an arrow from the hull now to that ring; one short word.
 * Nothing is drawn for a part whose switch is off. */
import {NAVAL_V24_COLORS,navalChanceColor} from './naval-v24.mjs?v=island-v2-20261107-13';
const TAU=Math.PI*2;
const images=new Map();
/** Lazy picture under assets/game-naval/fx; null outside a browser, false until decoded. */
export function navalFx(name){
 if(typeof Image==='undefined')return null;let entry=images.get(name);
 if(!entry){const img=new Image();entry={img,ok:false};img.onload=()=>{entry.ok=true;};img.src=new URL(`../assets/game-naval/fx/${name}?v=island-v2-20261107-13`,import.meta.url).href;images.set(name,entry);}
 return entry.ok?entry.img:false;
}
export const NAVAL_V24_WORDS=Object.freeze({hit:'פגיעה',turning:'מכוון…',far:'רחוק מדי',near:'קרוב מדי',miss:'לא יפגע',underwater:'מתחת למים · רק טורפדו',torpedo:'טורפדו'});
/** Every enemy threat with a landing point: about to be fired (a hull's attack, a salvo's points, a shore gun, an aircraft) or on its way. */
export function navalV24Threats(m){
 const out=[],now=m.time??0;
 for(const e of m.enemies||[]){if(!e.active||!(e.hp>0))continue;
  const list=e.attacks?.length?e.attacks:e.attack?(e.attack.points||[e.attack]):[];
  for(const a of list)out.push({x:a.x,z:a.z,seconds:Math.max(0,(a.fireTime??e.attack?.fireTime??now)-now)+(e.attack?.flight??1.2),incoming:false,torpedo:(e.attack?.kind??a.kind)===2,fromX:e.x,fromZ:e.z});}
 for(const a of m.air||[])if(a.attack)out.push({x:a.attack.x,z:a.attack.z,seconds:Math.max(0,a.attack.fireTime-now)+.9,incoming:false,torpedo:false});
 for(const s of m.enemyShots||[])out.push({x:s.targetX,z:s.targetZ,seconds:Math.max(0,s.duration-s.age),incoming:true,torpedo:s.kind===2,fromX:s.fromX,fromZ:s.fromZ,x0:s.x,z0:s.z});
 return out;
}
/** A flat decal on the sea: the unit disc mapped through the projection of two sea axes (so the camera foreshortens it). */
function onWater(p,project,x,z,r,draw){
 const q=project(x,z,.08),a=project(x+r,z,.08),b=project(x,z+r,.08);if(!q||!a||!b||!(q.depth>0)||!(a.depth>0)||!(b.depth>0))return null;
 p.save();p.transform(a.x-q.x,a.y-q.y,b.x-q.x,b.y-q.y,q.x,q.y);draw();p.restore();return q;
}
function decal(p,project,threat,time,r){
 const sheet=navalFx('water-target.png'),urgent=threat.seconds<1.2,rate=urgent?14:8,frame=Math.floor(time*rate)%8,pulse=1+(urgent?.16:.08)*Math.sin(time*(urgent?18:10));
 return onWater(p,project,threat.x,threat.z,r*pulse,()=>{
  if(sheet){p.globalAlpha=urgent?1:.88;p.drawImage(sheet,frame*128,0,128,128,-1.15,-1.15,2.3,2.3);}
  else{p.lineWidth=.09;p.strokeStyle=NAVAL_V24_COLORS.decal;p.fillStyle='#ff3b3026';p.beginPath();p.arc(0,0,1,0,TAU);p.fill();p.stroke();p.beginPath();p.arc(0,0,.55,0,TAU);p.stroke();}
 });
}
function bubbleLine(p,project,x0,z0,x1,z1,time,color=NAVAL_V24_COLORS.bubbles){
 const n=Math.max(3,Math.min(16,Math.round(Math.hypot(x1-x0,z1-z0)/9)));p.save();p.fillStyle=color;
 for(let i=0;i<=n;i++){const u=i/n,q=project(x0+(x1-x0)*u,z0+(z1-z0)*u,.05);if(!q||!(q.depth>0))continue;const w=Math.sin(time*9+i*1.7);p.globalAlpha=.25+.55*u;p.beginPath();p.arc(q.x+w*1.5,q.y,(1.2+1.6*u)*(1+.2*w),0,TAU);p.fill();}
 p.restore();
}
function pill(p,text,x,y,color){
 p.save();p.font='bold 12px sans-serif';p.direction='rtl';p.textAlign='center';p.textBaseline='middle';const w=Math.ceil(p.measureText(text).width)+18;
 p.fillStyle='#092a3ce8';p.beginPath();p.roundRect(x-w/2,y-10,w,20,10);p.fill();p.strokeStyle=color;p.lineWidth=1.4;p.stroke();p.fillStyle='#f3f0e2';p.fillText(text,x,y+.5);p.restore();return {x:x-w/2,y:y-10,w,h:20};
}
function arrow(p,a,b,color){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<14)return false;const ux=dx/len,uy=dy/len,end={x:b.x-ux*14,y:b.y-uy*14};
 p.save();p.lineCap='round';p.strokeStyle='#103847';p.lineWidth=6;p.beginPath();p.moveTo(a.x,a.y);p.lineTo(end.x,end.y);p.stroke();p.strokeStyle=color;p.lineWidth=3;p.setLineDash([7,5]);p.beginPath();p.moveTo(a.x,a.y);p.lineTo(end.x,end.y);p.stroke();p.setLineDash([]);
 p.fillStyle=color;p.strokeStyle='#103847';p.lineWidth=1.5;p.beginPath();p.moveTo(end.x+ux*9,end.y+uy*9);p.lineTo(end.x-uy*7-ux*3,end.y+ux*7-uy*3);p.lineTo(end.x+uy*7-ux*3,end.y-ux*7-uy*3);p.closePath();p.fill();p.stroke();p.restore();return true;
}
export function drawNavalV24(p,m,balance,project,width,height){
 if(!m||!(m.enemyFireV24||m.subV24||m.aimV24))return null;
 const time=m.time??0,out={};p.save();
 // Enemy fire: red pulsing decals (and torpedo bubble lines).
 if(m.enemyFireV24||m.subV24){
  const threats=navalV24Threats(m),r=(balance.aim?.hullBeam??16)*1.25;let decals=0,lines=0;
  for(const t of threats){
   if(t.torpedo&&t.incoming&&Number.isFinite(t.x0)){bubbleLine(p,project,t.fromX,t.fromZ,t.x0,t.z0,time,NAVAL_V24_COLORS.bubbles);lines++;}
   if(m.enemyFireV24||t.torpedo){if(decal(p,project,t,time,r))decals++;}
  }
  out.decals=decals;out.threats=threats.length;out.torpedoLines=lines;
 }
 // Submarines: sonar rings over the divers, the player's torpedo bubbles, the underwater blast, the "under water" word.
 if(m.subV24){
  let sonar=0;for(const e of m.enemies||[]){if(e.subMode!=='v24'||!e.active||!(e.hp>0)||!(e.depth>0))continue;const q=project(e.x,e.z,0);if(!q||!(q.depth>0))continue;
   for(let k=0;k<3;k++){const u=((time*.7+k/3)%1);onWater(p,project,e.x,e.z,10+u*26,()=>{p.globalAlpha=(1-u)*.8;p.strokeStyle=NAVAL_V24_COLORS.sonar;p.lineWidth=.07;p.beginPath();p.arc(0,0,1,0,TAU);p.stroke();});}
   p.globalAlpha=1;bubbleLine(p,project,e.x-Math.cos(e.heading||0)*20,e.z-Math.sin(e.heading||0)*20,e.x,e.z,time,NAVAL_V24_COLORS.sonar);sonar++;}
  out.sonar=sonar;
  for(const s of [...(m.ball?.active?[m.ball]:[]),...(m.extraShots||[])])if(s.active&&s.ammo===2&&s.owner==='player'&&Number.isFinite(s.fromX)){bubbleLine(p,project,s.fromX,s.fromZ,s.x,s.z,time);out.torpedoTrail=(out.torpedoTrail||0)+1;}
  const b=m.blast;if(b?.underwater&&Number.isFinite(b.at)){const age=time-b.at;if(age>=0&&age<.67){const sheet=navalFx('water_explosion.png'),f=Math.min(15,Math.floor(age*24)),q=project(b.x,b.z,0);if(q&&q.depth>0){const s=120;p.save();if(sheet)p.drawImage(sheet,(f%4)*64,Math.floor(f/4)*64,64,64,q.x-s/2,q.y-s*.85,s,s);else{p.strokeStyle='#e8fbff';p.lineWidth=3;p.globalAlpha=1-age/.67;p.beginPath();p.ellipse(q.x,q.y,14+age*90,6+age*36,0,0,TAU);p.stroke();}p.restore();out.underwaterBlast=true;}}}
  const f=m.lastFeedback;if(f?.kind==='underwater'&&time-f.time<1.6){const q=project(f.x,f.z,1.2);if(q&&q.depth>0){out.word=NAVAL_V24_WORDS.underwater;pill(p,NAVAL_V24_WORDS.underwater,Math.max(80,Math.min(width-80,q.x)),Math.max(90,q.y-28),NAVAL_V24_COLORS.sonar);}}
 }
 // Aim: where the shell will meet the hull (the forecast), coloured by the hit chance, with an arrow from the hull now.
 const h=m.aimV24?m.aimHint:null;
 if(h&&!m.result){
  const color=navalChanceColor(h.chance),a=project(h.from.x,h.from.z,0),b=project(h.to.x,h.to.z,0);
  if(b&&b.depth>0&&b.x>-30&&b.x<width+30&&b.y>-30&&b.y<height+30){
   const moved=a&&a.depth>0?arrow(p,a,b,color):false,pulse=1+.12*Math.sin(time*7);
   onWater(p,project,h.to.x,h.to.z,(balance.aim?.hullBeam??16)*1.1*pulse,()=>{p.strokeStyle='#103847';p.lineWidth=.16;p.beginPath();p.arc(0,0,1,0,TAU);p.stroke();p.strokeStyle=color;p.lineWidth=.09;p.beginPath();p.arc(0,0,1,0,TAU);p.stroke();p.beginPath();p.arc(0,0,.45,0,TAU);p.stroke();});
   const word=h.chance>=.95?NAVAL_V24_WORDS.hit:h.status==='turning'?NAVAL_V24_WORDS.turning:h.status==='far'?NAVAL_V24_WORDS.far:h.status==='near'?NAVAL_V24_WORDS.near:NAVAL_V24_WORDS.miss;
   if(!m.homing)pill(p,word,Math.max(60,Math.min(width-60,b.x)),Math.min(height-24,b.y+30),color);
   out.aim={index:h.index,x:Math.round(b.x),y:Math.round(b.y),color,chance:h.chance,arrow:moved,word};
  }
 }
 p.restore();return Object.keys(out).length?out:null;
}
