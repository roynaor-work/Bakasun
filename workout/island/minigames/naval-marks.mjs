import {navalBallisticPoint} from './naval-ballistics.mjs?v=island-ready-plots-20261026-1';
const TAU=Math.PI*2;
/** Model units per display pixel, so marks keep their pixel size on any screen. */
export function navalPixelUnit(p){
 try{const t=p.getTransform?.(),c=p.canvas;if(!t||!c?.clientWidth)return 1;const ratio=c.width/c.clientWidth;return ratio>0&&t.a>0?ratio/t.a:1;}catch{return 1;}
}
/** Which mark a prediction gets: water, hull or the weak centre. */
export function navalMarkKind(prediction){return !prediction?.contact?'water':prediction.contact.critical?'critical':'hull';}
function ring(p,x,y,d,u,dashed){p.setLineDash(dashed?[4*u,3*u]:[]);p.beginPath();p.ellipse(x,y,d/2*u,d/2*u*.46,0,0,TAU);p.stroke();p.setLineDash([]);}
function diamond(p,x,y,s,u){const h=s/2*u;p.beginPath();p.moveTo(x,y-h*1.25);p.lineTo(x+h,y);p.lineTo(x,y+h*1.25);p.lineTo(x-h,y);p.closePath();}
/** Landing ring and diamond in screen pixels. Shapes differ without colour:
 * dashed ring + hollow diamond (water), solid ring + filled diamond (hull),
 * double ring + diamond with a centre dot (weak centre). */
export function drawNavalAimMarks(p,m,project,balance){
 const pr=m.prediction;if(!m.aiming||!pr||pr.guided)return null;
 const look=balance.aimLook||{},kind=navalMarkKind(pr),spec=look[kind]||{color:'#ffffff',ring:24,diamond:10},u=navalPixelUnit(p),outline=(look.markOutline??2),dark=look.arcOutline||'#103847';
 const water=project(kind==='water'?pr.landing.x:pr.contact.x,kind==='water'?pr.landing.z:pr.contact.z,0),tip=kind==='water'?water:project(pr.contact.x,pr.contact.z,(pr.contact.h||0)*balance.render.worldScale);
 if(!(water.depth>0))return null;
 p.save();p.lineJoin='round';
 const stroke=(width,draw)=>{p.strokeStyle=dark;p.lineWidth=(width+outline*2)*u;draw();p.strokeStyle=spec.color;p.lineWidth=width*u;draw();};
 stroke(2,()=>ring(p,water.x,water.y,spec.ring,u,kind==='water'));
 if(kind==='critical')stroke(1.6,()=>ring(p,water.x,water.y,spec.ring-9,u,false));
 if(tip.depth>0){
  diamond(p,tip.x,tip.y,spec.diamond,u);p.strokeStyle=dark;p.lineWidth=(1.6+outline*2)*u;p.stroke();
  if(kind==='water'){p.strokeStyle=spec.color;p.lineWidth=1.8*u;p.stroke();}
  else{p.fillStyle=spec.color;p.fill();if(kind==='critical'){p.fillStyle=dark;p.beginPath();p.arc(tip.x,tip.y,1.8*u,0,TAU);p.fill();}}
 }
 p.restore();return {kind,ring:spec.ring,diamond:spec.diamond,x:water.x,y:water.y};
}
/** White-hot core, orange halo and a tapered trail that is the shell's own
 * path over the last trailSeconds (from the shared ballistic launch). Display
 * only: the collision body and the speed are untouched. Cannon and salvo
 * (Vulcan) read differently: the salvo has smaller, yellower cores. */
export function drawNavalShellTracers(p,m,balance){
 const look=balance.aimLook?.shell;if(!look)return 0;const u=navalPixelUnit(p),shots=[...(m.ball?.active?[m.ball]:[]),...(m.extraShots||[])].filter(s=>s.active&&s.launch&&s.launch.kind==='arc'&&s.owner==='player');
 if(!shots.length||!m.screenPoint)return 0;
 const project=(q)=>m.screenPoint(q.x,q.z,(q.h||0)*balance.render.worldScale);let drawn=0;
 p.save();p.lineCap='round';
 for(const s of shots){
  const salvo=Boolean(s.salvo),head=project(navalBallisticPoint(s.launch,s.age));if(!(head.depth>0))continue;
  const pts=[];for(let i=0;i<=8;i++){const q=project(navalBallisticPoint(s.launch,Math.max(0,s.age-look.trailSeconds*i/8)));if(q.depth>0)pts.push(q);}
  let length=0;for(let i=1;i<pts.length;i++)length+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
  const max=(salvo?look.trailMin:look.trailMax)*u,min=look.trailMin*u*(salvo?.6:1),scale=length>max?max/length:length<min&&length>0?Math.min(2.5,min/length):1;
  for(let i=1;i<pts.length;i++){const a={x:head.x+(pts[i-1].x-head.x)*scale,y:head.y+(pts[i-1].y-head.y)*scale},b={x:head.x+(pts[i].x-head.x)*scale,y:head.y+(pts[i].y-head.y)*scale},f=1-i/pts.length;p.strokeStyle=salvo?`rgba(255,226,140,${.75*f})`:`rgba(255,196,120,${.85*f})`;p.lineWidth=Math.max(.8,(salvo?3:4.5)*f)*u;p.beginPath();p.moveTo(a.x,a.y);p.lineTo(b.x,b.y);p.stroke();}
  p.fillStyle=salvo?'rgba(255,214,90,.35)':`rgba(255,150,60,${look.haloOpacity})`;p.beginPath();p.arc(head.x,head.y,(salvo?look.halo*.75:look.halo)/2*u,0,TAU);p.fill();
  p.fillStyle=salvo?'#fff2b8':'#fffaf0';p.beginPath();p.arc(head.x,head.y,(salvo?look.core*.7:look.core)/2*u,0,TAU);p.fill();drawn++;
 }
 p.restore();return drawn;
}
/** A real hit, in display pixels at the contact point: a short local flash,
 * four to six sparks, and for the weak centre a larger flash (the gold star
 * is the HUD feedback icon). Nothing here runs for a miss or a splash. */
export function drawNavalHitFeedback(p,m,project,balance){
 const b=m.blast,look=balance.aimLook?.hit;if(!look||!b?.hit||!Number.isFinite(b.at))return null;
 const age=m.time-b.at;if(!(age>=0)||age>Math.max(look.flashSeconds,look.sparkSeconds))return null;
 const q=project(b.x,b.z,(b.h||0)*balance.render.worldScale+.3);if(!(q.depth>0))return null;
 const u=navalPixelUnit(p),critical=Boolean(b.critical&&b.owner==='player'),seed=Math.abs(Math.sin(b.at*12.9898+b.x*.078)*43758.5453)%1,n=look.sparksMin+Math.floor(seed*(look.sparksMax-look.sparksMin+1));
 const out={flash:false,sparks:0,critical,diameter:critical?look.criticalFlashPixels:look.flashPixels};
 p.save();
 if(age<look.flashSeconds){const k=1-age/look.flashSeconds,r=out.diameter/2*u;p.globalAlpha=.35+.65*k;const g=p.createRadialGradient(q.x,q.y,0,q.x,q.y,r);g.addColorStop(0,'#fffaf0');g.addColorStop(.45,look.flash);g.addColorStop(1,'rgba(255,225,163,0)');p.fillStyle=g;p.beginPath();p.arc(q.x,q.y,r,0,TAU);p.fill();out.flash=true;}
 if(age<look.sparkSeconds){const k=age/look.sparkSeconds;p.lineCap='round';p.globalAlpha=1-k;
  for(let i=0;i<n;i++){const a=seed*TAU+i*TAU/n+Math.sin(i*7.1+seed*9)*.35,len=(look.sparkMin+(look.sparkMax-look.sparkMin)*((Math.sin(i*3.7+seed*5)+1)/2))*u,r0=(3+k*14)*u,r1=r0+len*(1-.35*k);
   p.strokeStyle=i%2?look.flash:'#ffb35c';p.lineWidth=Math.max(1,2.2*(1-k))*u;p.beginPath();p.moveTo(q.x+Math.cos(a)*r0,q.y+Math.sin(a)*r0*.8);p.lineTo(q.x+Math.cos(a)*r1,q.y+Math.sin(a)*r1*.8);p.stroke();}
  out.sparks=n;}
 p.restore();return out;
}
/** The part of an enemy bar that a hit just removed: held, then faded. */
export function navalLostHealth(enemy,time,look){
 if(!look||enemy.lostAt===undefined||!(enemy.lostFrom>enemy.hp))return null;const age=time-enemy.lostAt;if(age<0||age>look.lostHold+look.lostFade)return null;
 return {from:enemy.hp,to:enemy.lostFrom,alpha:age<look.lostHold?1:1-(age-look.lostHold)/look.lostFade};
}
