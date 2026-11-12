import {navalLostHealth,navalMarkKind,navalArcColor} from './naval-marks.mjs?v=island-v2-20261107-10';
import {navalEdgeHint,navalAimSpin} from './naval-aim-flag.mjs?v=island-v2-20261107-10';
import {NAVAL_AIR_LIFT,NAVAL_AIR_WING,navalSkyPoint,navalSkyAngles} from './naval-air.mjs?v=island-v2-20261107-10';
const TAU=Math.PI*2;
const percent=(value,max)=>Math.round(Math.max(0,Math.min(1,value/max))*100);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const translated=(t,key,fallback)=>{const value=t?.(key);return value&&value!==key?value:fallback;};
const feedbackCopy={hit:'פגיעה במטרה',miss:'פספוס · הקדימו מטרה נעה',damage:'נפגענו · המשיכו לשוט',evaded:'הירי חלף לידנו',mine:'מוקש נפרס בנתיב',repair:'גוף הספינה תוקן',full:'גוף הספינה כבר מלא',resupply:'מלאי הפגזים חודש'};
const objectiveCopy={fleet:'הטביעו את כל הצי',flagship:'הטביעו את ספינת הדגל',intercept:'יירטו את סירות האגף',subhunt:'הטביעו את הצוללות'};
const weaponHints=['ירי מהיר · הקדימו מטרה נעה','עוקב אחרי היעד · גם בצלילה','על פני המים · טוב מקרוב','נפרס בכוונת · חוסם נתיב','שלושה פגזים · מכסה שטח','מתקן רבע גוף · ללא ירי'];
function clippedText(p,text,x,y,maxWidth){let copy=String(text);while(copy.length>1&&p.measureText(copy).width>maxWidth)copy=copy.slice(0,-2)+'…';p.fillText(copy,x,y);}
function panel(p,x,y,w,h,r=12){p.beginPath();p.roundRect(x,y,w,h,r);p.fill();}
function glass(p,x,y,w,h,r=12){p.fillStyle='#092a3ce0';panel(p,x,y,w,h,r);p.strokeStyle='#d3e4df36';p.lineWidth=1;p.stroke();p.strokeStyle='#d8bd7a55';p.beginPath();p.moveTo(x+r,y+.5);p.lineTo(x+w-r,y+.5);p.stroke();}
function bar(p,x,y,w,h,value,max,color='#8edcc7'){p.fillStyle='#020f1c80';panel(p,x,y,w,h,h/2);if(value<=0)return;p.fillStyle=color;panel(p,x,y,Math.max(h,w*Math.max(0,Math.min(1,value/max))),h,h/2);}
function vesselMark(p,x,y){p.save();p.translate(x,y);p.strokeStyle='#e3d2a5';p.fillStyle='#bccdd0';p.lineWidth=1.4;p.beginPath();p.moveTo(-14,4);p.lineTo(13,4);p.lineTo(9,11);p.lineTo(-8,11);p.closePath();p.fill();p.stroke();p.fillStyle='#5c7f8b';p.fillRect(-7,-2,11,6);p.strokeRect(-7,-2,11,6);p.beginPath();p.moveTo(-1,-2);p.lineTo(-1,-12);p.lineTo(5,-7);p.lineTo(-1,-7);p.moveTo(-17,15);p.quadraticCurveTo(-11,12,-5,15);p.quadraticCurveTo(1,18,7,15);p.quadraticCurveTo(11,13,16,15);p.stroke();p.restore();}

/** Exact landing footprints remain small even when the camera moves close. */
export function navalDangerMarks(m,balance,project,width,height){
  const threats=m.enemies.filter(e=>e.active&&e.hp>0).flatMap(e=>e.attacks?.length?e.attacks:e.attack?[e.attack]:[]).concat((m.air||[]).filter(a=>a.attack).map(a=>a.attack)).map(a=>({x:a.x,z:a.z,seconds:Math.max(0,a.fireTime-m.time),incoming:false}));
  for(const shot of m.enemyShots||[])threats.push({x:shot.targetX,z:shot.targetZ,seconds:Math.max(0,shot.duration-shot.age),incoming:true});
  return threats.slice(0,8).flatMap(threat=>{
    const q=project(threat.x,threat.z,.1);if(!q||q.depth<=0||q.x<-40||q.x>width+40||q.y<-40||q.y>height+40)return [];
    const heading=m.playerShip.heading||0,c=Math.cos(heading),s=Math.sin(heading),points=[];
    for(let i=0;i<=32;i++){const a=i/32*TAU,x=Math.cos(a)*balance.aim.hullLength,z=Math.sin(a)*balance.aim.hullBeam,r=project(threat.x+x*c-z*s,threat.z+x*s+z*c,.1);if(!r||r.depth<=0)return [];points.push(r);}
    const radius=Math.max(...points.map(point=>Math.hypot(point.x-q.x,point.y-q.y))),scale=Math.min(1,32/Math.max(1,radius));
    return [{...threat,q,points:points.map(point=>({x:q.x+(point.x-q.x)*scale,y:q.y+(point.y-q.y)*scale}))}];
  });
}
function drawDanger(p,marks,time,width,height){
  for(const mark of marks){
    p.save();p.strokeStyle=mark.incoming?'#ffad76':'#ffc27b';p.fillStyle='#f39a4d12';p.lineWidth=1.5;p.globalAlpha=.75+Math.sin(time*7)*.15;p.beginPath();for(let i=0;i<mark.points.length;i++){const q=mark.points[i];if(i)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);}p.closePath();p.fill();p.stroke();
    const {x,y}=mark.q;p.beginPath();p.moveTo(x-4,y);p.lineTo(x+4,y);p.moveTo(x,y-3);p.lineTo(x,y+3);p.stroke();p.globalAlpha=1;
    const bx=clamp(x,30,width-30),by=clamp(y-25,99,height-131);p.fillStyle='#3d2c1ff0';panel(p,bx-22,by-10,44,19,5);p.strokeStyle='#ffc27b88';p.lineWidth=.8;p.stroke();p.fillStyle='#ffce99';p.font='bold 10px sans-serif';p.direction='ltr';p.textAlign='center';p.fillText((mark.incoming?'↓ ':'! ')+mark.seconds.toFixed(1)+'s',bx,by+3);p.restore();
  }
}

function shieldMark(p,x,y,fill){p.save();p.translate(x,y);p.beginPath();p.moveTo(0,-11);p.lineTo(9,-7);p.quadraticCurveTo(9,6,0,11);p.quadraticCurveTo(-9,6,-9,-7);p.closePath();p.fillStyle=fill>0?'#7fc7e8':'#2a4652';p.fill();p.strokeStyle='#e3d2a5';p.lineWidth=1.4;p.stroke();if(fill>0&&fill<1){p.clip();p.fillStyle='#2a4652';p.fillRect(-10,-11,20,22*(1-fill));}p.restore();}
function targetMark(p,x,y){p.save();p.translate(x,y);p.strokeStyle='#f3e2b3';p.lineWidth=1.6;p.beginPath();p.arc(0,0,12,0,TAU);for(const [a,b]of [[0,-15],[0,15],[-15,0],[15,0]]){p.moveTo(a*.55,b*.55);p.lineTo(a,b);}p.stroke();enemyMark(p,0,-2);p.restore();}
function checkMark(p,x,y){p.save();p.strokeStyle='#8edcc7';p.lineWidth=2;p.beginPath();p.moveTo(x-3,y);p.lineTo(x-1,y+2.5);p.lineTo(x+3.5,y-3);p.stroke();p.restore();}
function windMark(p,x,y,angle,lines){
 // A 26 px windsock, a 22 px arrow along the wind's push on the shell, and one to three curling wind lines.
 p.save();p.fillStyle='#092a3cc0';panel(p,x-16,y-16,84,32,16);p.translate(x,y);
 p.strokeStyle='#e0e8df';p.lineWidth=1.6;p.beginPath();p.moveTo(-6,13);p.lineTo(-6,-13);p.stroke();
 p.fillStyle='#ffb36b';p.beginPath();p.moveTo(-6,-12);p.lineTo(8,-9);p.lineTo(8,-4);p.lineTo(-6,-1);p.closePath();p.fill();p.fillStyle='#f3f1e6';p.fillRect(0,-10.4,2.6,7.9);
 p.save();p.translate(19,0);p.rotate(angle);p.lineCap='round';p.strokeStyle='#103847';p.lineWidth=4.6;p.beginPath();p.moveTo(-11,0);p.lineTo(7,0);p.stroke();p.strokeStyle='#fff3df';p.lineWidth=2.4;p.beginPath();p.moveTo(-11,0);p.lineTo(7,0);p.stroke();
 p.fillStyle='#fff3df';p.strokeStyle='#103847';p.lineWidth=1.2;p.beginPath();p.moveTo(11,0);p.lineTo(4,-5);p.lineTo(4,5);p.closePath();p.fill();p.stroke();p.restore();
 const n=Math.max(1,Math.min(3,lines)),wave=(oy)=>{p.beginPath();p.moveTo(36,oy);p.bezierCurveTo(41,oy-4,45,oy+4,50,oy);p.quadraticCurveTo(55,oy-3.5,52,oy-6);};
 p.lineCap='round';for(let i=0;i<n;i++){const oy=(i-(n-1)/2)*7+2;p.strokeStyle='#103847';p.lineWidth=4;wave(oy);p.stroke();p.strokeStyle='#D8EDF2';p.lineWidth=2;wave(oy);p.stroke();}
 p.restore();}
function enemyMark(p,x,y,color='#e39b88'){p.save();p.translate(x,y);p.fillStyle=color;p.strokeStyle='#f5dccf';p.lineWidth=1;p.beginPath();p.moveTo(-9,2);p.lineTo(9,2);p.lineTo(6,7);p.lineTo(-6,7);p.closePath();p.fill();p.stroke();p.fillRect(-4,-3,6,5);p.beginPath();p.moveTo(0,-3);p.lineTo(7,-6);p.stroke();p.restore();}
/** Feedback is an icon at the actual impact point: burst, gold star, ripple, cross. */
function feedbackIcon(p,kind,q,u){
  p.save();p.translate(q.x,q.y-18-u*16);p.globalAlpha=Math.max(0,Math.min(1,(1-u)*2.4));p.lineWidth=2.4;p.lineJoin='round';
  // Gold star for the weak centre (22 px); an ordinary hit is the flash and sparks at the contact point.
  if(kind==='critical'){p.fillStyle='#ffe27a';p.strokeStyle='#7a4a12';p.lineWidth=1.8;p.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?4.6:11;p.lineTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();p.stroke();}
  else if(kind==='miss'||kind==='evaded'){p.strokeStyle='#e9fbff';for(const r of [5,10])p.beginPath(),p.ellipse(0,0,r+u*6,(r+u*6)*.45,0,0,TAU),p.stroke();}
  else if(kind==='damage'){p.strokeStyle='#ff8d74';p.beginPath();p.moveTo(-8,-8);p.lineTo(8,8);p.moveTo(8,-8);p.lineTo(-8,8);p.stroke();}
  else if(kind==='repair'||kind==='full'){p.strokeStyle='#73e7aa';p.beginPath();p.moveTo(-8,0);p.lineTo(8,0);p.moveTo(0,-8);p.lineTo(0,8);p.stroke();}
  else if(kind==='mine'){p.strokeStyle='#d69bf4';p.beginPath();p.arc(0,0,6,0,TAU);p.stroke();for(let i=0;i<6;i++){const a=i*TAU/6;p.beginPath();p.moveTo(Math.cos(a)*7,Math.sin(a)*7);p.lineTo(Math.cos(a)*11,Math.sin(a)*11);p.stroke();}}
  else if(kind==='resupply'){p.fillStyle='#ffd36e';p.beginPath();p.roundRect(-4,-9,8,15,3);p.fill();}
  else if(kind==='supply'||kind==='empty'){p.fillStyle=kind==='empty'?'#ff8a6a':'#ffb060';p.strokeStyle='#103847';p.lineWidth=1.4;p.beginPath();p.roundRect(-9,-6,18,14,3);p.fill();p.stroke();p.strokeStyle='#103847';p.beginPath();p.moveTo(0,-6);p.lineTo(0,8);p.moveTo(-9,1);p.lineTo(9,1);p.stroke();}
  p.restore();
}

/** 11/11/2026: an arrow on the screen edge toward something that left the picture (landing mark, aircraft). */
function edgeArrow(p,hint,color,size=11){p.save();p.translate(hint.x,hint.y);p.rotate(hint.angle);p.fillStyle=color;p.strokeStyle='#103847';p.lineWidth=2;p.lineJoin='round';p.beginPath();p.moveTo(size,0);p.lineTo(-size*.6,-size*.7);p.lineTo(-size*.25,0);p.lineTo(-size*.6,size*.7);p.closePath();p.fill();p.stroke();p.restore();}
function planeMark(p,x,y,color='#ffd2a6'){p.save();p.translate(x,y);p.fillStyle=color;p.strokeStyle='#103847';p.lineWidth=1.2;p.beginPath();p.moveTo(0,-9);p.lineTo(2.2,-2);p.lineTo(11,1);p.lineTo(11,3.5);p.lineTo(2.2,2.2);p.lineTo(1.4,7);p.lineTo(4.5,9);p.lineTo(4.5,10.5);p.lineTo(-4.5,10.5);p.lineTo(-4.5,9);p.lineTo(-1.4,7);p.lineTo(-2.2,2.2);p.lineTo(-11,3.5);p.lineTo(-11,1);p.lineTo(-2.2,-2);p.closePath();p.fill();p.stroke();p.restore();}
/** 11/11/2026 ammo limit: the loaded shells (or the selected weapon's stock) as icon, count and bar under the hull panel, the Vulcan belt beside it,
 * a plain line when empty, the supply buoy as a ring on the water with an edge arrow when it is out of the picture. */
export function drawNavalAmmoHud(p,m,balance,project,width,height){
  const state=m.ammoState,mags=m.magazines;if(!state||!mags)return null;
  const index=m.ammoIndex||0,count=index===0?m.loaded:m.ammo[index],max=index===0?mags.ammo[0]:(m.settings?.ammunition?.[index]||1),color=state.level==='empty'?'#ff7a66':state.level==='low'?'#ffb060':'#8edcc7';
  const shown={level:state.level,count,max,buoys:0,buoyArrow:false,message:null};
  p.save();glass(p,16,72,196,30,10);
  // Shell icon, count over magazine, bar.
  p.save();p.translate(36,87);p.fillStyle=color;p.strokeStyle='#103847';p.lineWidth=1.2;p.beginPath();p.moveTo(-4,7);p.lineTo(-4,-3);p.quadraticCurveTo(-4,-9,0,-9);p.quadraticCurveTo(4,-9,4,-3);p.lineTo(4,7);p.closePath();p.fill();p.stroke();p.restore();
  p.direction='ltr';p.textAlign='left';p.font='bold 13px sans-serif';p.fillStyle='#f3e2b3';p.fillText(`${count}/${max}`,48,92);
  bar(p,100,83,70,7,count,max,color);
  // Vulcan belt beside it when the gun exists.
  if(m.vulcan&&Number.isFinite(m.belt)){const bc=m.belt<=0?'#ff7a66':m.belt<=30?'#ffb060':'#ffe27a';p.fillStyle=bc;p.fillRect(178,80,3,12);p.fillRect(183,80,3,12);p.fillRect(188,80,3,12);bar(p,176,95,30,4,m.belt,mags.belt,bc);shown.belt=m.belt;}
  p.restore();
  // Supply buoy on the water and the message.
  for(const b of m.buoys||[]){const q=project(b.x,b.z,.2),hint=navalEdgeHint(q,width,height,30);shown.buoys++;
    if(hint){edgeArrow(p,hint,'#ffb060',12);shown.buoyArrow=true;continue;}
    p.save();p.strokeStyle='#ffb060';p.lineWidth=2;p.setLineDash([5,4]);p.beginPath();p.ellipse(q.x,q.y,22,10,0,0,TAU);p.stroke();p.setLineDash([]);
    p.fillStyle='#3d2c1ff0';panel(p,q.x-26,q.y-34,52,18,5);p.fillStyle='#ffd9a6';p.font='bold 11px sans-serif';p.textAlign='center';p.direction='rtl';p.fillText('אספקה',q.x,q.y-21);p.restore();}
  if(state.level==='empty'&&(m.buoys?.length||index===0)){const text=index===0?'נגמרה התחמושת, אוספים אספקה':'הנשק הזה נגמר, בוחרים נשק אחר';shown.message=text;p.save();p.font='bold 14px sans-serif';const w=p.measureText(text).width+28,x=width/2-w/2,y=height-128;p.fillStyle='#3d1f1af0';panel(p,x,y,w,30,9);p.strokeStyle='#ff8a6a88';p.lineWidth=1;p.stroke();p.fillStyle='#ffe0d6';p.textAlign='center';p.direction='rtl';p.fillText(text,width/2,y+20);p.restore();}
  return shown;
}
/** Manual Vulcan: the sky crosshair where the held drag points (yellow and filled when inside the hit cone of an aircraft). */
export function drawNavalSkyHud(p,m,balance,project,width,height){
  const sky=m.sky,v=m.vulcan;if(!sky||!v)return null;
  const target=(m.air||[]).find(a=>a.id===v.target&&a.state!=='down'),dist=target?navalSkyAngles(m.playerShip,target,balance).dist:110,pt=navalSkyPoint(m.playerShip,sky,dist,balance),q=project(pt.x,pt.z,Math.max(0,pt.h)*NAVAL_AIR_LIFT);
  const hint=navalEdgeHint(q,width,height,30);if(hint){edgeArrow(p,hint,'#ffe27a',12);return {x:null,y:null,edge:true,onTarget:Boolean(v.onTarget)};}
  p.save();p.strokeStyle=v.onTarget?'#ffe27a':'#f6f2e6';p.lineWidth=v.onTarget?2.6:1.8;p.lineCap='round';p.beginPath();p.arc(q.x,q.y,13,0,TAU);p.stroke();
  for(const [sx,sy]of [[-1,0],[1,0],[0,-1],[0,1]]){p.beginPath();p.moveTo(q.x+sx*7,q.y+sy*7);p.lineTo(q.x+sx*19,q.y+sy*19);p.stroke();}
  if(v.onTarget){p.fillStyle='#ffe27a';p.beginPath();p.arc(q.x,q.y,3.5,0,TAU);p.fill();}
  if(v.firing){p.fillStyle='#ffe27a66';p.beginPath();p.arc(q.x,q.y,22+Math.abs(Math.sin(m.time*40))*4,0,TAU);p.fill();}
  p.restore();return {x:Math.round(q.x),y:Math.round(q.y),edge:false,onTarget:Boolean(v.onTarget),firing:Boolean(v.firing)};
}
/** Vulcan panel (heat, kills) while aircraft are about, a ring on the gun's target, edge arrows for aircraft out of the picture. */
export function drawNavalAirHud(p,m,balance,project,width,height){
  const v=m.vulcan,air=m.air||[];if(!v||!air.length&&!(v.heat>0))return null;
  const shown={aircraft:air.length,target:null,arrows:0,firing:Boolean(v.firing)};
  for(const a of air){const q=project(a.x,a.z,Math.max(0,a.h)*NAVAL_AIR_LIFT);const hint=navalEdgeHint(q,width,height,30);
    if(hint){edgeArrow(p,hint,'#ffd2a6',10);shown.arrows++;continue;}
    if(a.state==='down')continue;
    // Corner brackets outside the body (QA 11/11: a 16 px ring hid the head-on helicopter): the half-size follows the wingspan on screen.
    const wing=project(a.x,a.z+NAVAL_AIR_WING*balance.combat.laneSpacing/balance.render.enemySpacing,Math.max(0,a.h)*NAVAL_AIR_LIFT),half=Math.max(20,Math.min(70,(wing&&wing.depth>0?Math.hypot(wing.x-q.x,wing.y-q.y):16)*1.15+8)),arm=Math.max(6,half*.38);
    const chosen=a.id===v.target,on=chosen&&v.onTarget;p.save();p.strokeStyle=on?'#ffe27a':chosen?'#ffd2a6':'#ffd2a680';p.lineWidth=chosen?2.2:1.4;p.lineCap='round';p.beginPath();
    for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){p.moveTo(q.x+sx*half,q.y+sy*(half-arm));p.lineTo(q.x+sx*half,q.y+sy*half);p.lineTo(q.x+sx*(half-arm),q.y+sy*half);}p.stroke();
    if(chosen)shown.target={id:a.id,x:q.x,y:q.y,half:Math.round(half),onTarget:Boolean(v.onTarget)};
    bar(p,q.x-14,q.y+half+6,28,4,a.hp,a.maxHp,'#ffd2a6');p.restore();}
  // Panel: a plane icon, the Vulcan heat bar (turns orange when it must cool) and the number shot down.
  const x=width-278,y=16,w=104;glass(p,x,y,w,50,12);planeMark(p,x+18,y+25);
  bar(p,x+36,y+14,58,7,v.heat,1,v.overheated?'#ff9a5c':v.firing?'#ffe27a':'#8edcc7');
  p.fillStyle='#f3e2b3';p.font='bold 13px sans-serif';p.direction='ltr';p.textAlign='left';p.fillText('×'+String(v.kills||0),x+36,y+42);
  if(v.manual&&!v.held&&air.some(a=>a.state!=='down')){p.fillStyle='#ffd2a6';p.font='bold 10px sans-serif';p.textAlign='center';p.direction='rtl';p.fillText('לחצו וולקן',x+w/2,y+62);shown.hint=true;}
  if(v.firing){p.fillStyle='#ffe27a';p.beginPath();p.arc(x+86,y+38,4+Math.abs(Math.sin(m.time*40))*2,0,TAU);p.fill();}
  return shown;
}
/** Mission, hulls and incoming fire read as icons, bars and rings: no explanatory lines in battle. */
export function drawNavalHud(p,m,{config,balance,art,t},project){
  const width=config.width,height=config.height,index=m.aiming?m.lockedTargetIndex:m.selectedTargetIndex,selected=m.enemies.find(e=>e.index===index&&e.active&&e.hp>0)||m.enemies.find(e=>e.active&&e.hp>0);
  const marks=navalDangerMarks(m,balance,project,width,height),mission=m.mission||{id:'fleet'},missionState=m.missionState||{completed:0,total:m.enemies.length},shown={marks:marks.length,icons:[],selected:selected?.index??null,feedback:null,texts:[]};
  const text=(value,x,y,maxWidth)=>{shown.texts.push(String(value));if(maxWidth)clippedText(p,value,x,y,maxWidth);else p.fillText(value,x,y);};
  drawDanger(p,marks,m.time,width,height);
  // Health: our hull silhouette, a shield and a thick bar; the percentage is secondary.
  p.save();glass(p,16,16,196,50,12);p.save();p.translate(40,38);p.scale(1.15,1.15);vesselMark(p,0,0);p.restore();
  const shield=m.playerShip?.maxShield>0?m.playerShip.shield/m.playerShip.maxShield:0;shieldMark(p,72,40,shield);
  bar(p,88,34,104,8,m.lives,m.maxLives,m.lives/m.maxLives<.35?'#e4a184':'#8edcc7');
  p.direction='ltr';p.textAlign='right';p.font='11px sans-serif';p.fillStyle='#c5d4d6';text(percent(m.lives,m.maxLives)+'%',192,58);shown.icons.push('hull','shield');
  let missionRect;
  if(width>=620){
    // One objective icon, the counter and the clock. The title and duplicate hull pips are gone.
    const w=112,x=(width+96-w)/2;missionRect={x,y:16,w,h:50};glass(p,x,16,w,50,12);
    targetMark(p,x+26,41);p.direction='ltr';p.textAlign='left';p.fillStyle='#f3e2b3';p.font='bold 18px sans-serif';text(`${missionState.completed}/${missionState.total}`,x+50,49);shown.icons.push('objective');
    p.fillStyle='#abc5cb';p.font='10px sans-serif';p.textAlign='left';const seconds=Math.max(0,Math.ceil(m.remaining));text(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,x+50,30);
  }
  const targets=[];
  for(const enemy of m.enemies){
    if(!enemy.active||enemy.hp<=0)continue;
    const q=project(enemy.x,enemy.z,balance.render.effects.healthLift),edge=22;
    if(q.depth<=0||q.x<edge||q.x>width-edge||q.y<edge||q.y>config.height-edge){const x=q.depth<=0?width/2:Math.max(edge,Math.min(width-edge,q.x)),y=q.depth<=0?22:Math.max(96,Math.min(config.height-90,q.y));p.fillStyle='#ffcf79';p.beginPath();p.moveTo(x,y-5);p.lineTo(x-5,y+4);p.lineTo(x+5,y+4);p.closePath();p.fill();shown.icons.push('offscreen');continue;}
    targets.push({enemy,q});
  }
  for(const {enemy,q} of targets){
    const chosen=enemy===selected,priority=mission.id==='flagship'?enemy.boss:mission.id==='subhunt'?enemy.behavior==='dive':mission.id==='intercept'?enemy.behavior==='flank':false,x=Math.max(30,Math.min(width-30,q.x)),y=Math.max(90,q.y-8);
    p.fillStyle=chosen?'#092a3cee':'#092638c0';panel(p,x-28,y-6,56,10,5);bar(p,x-25,y-3,50,4,enemy.hp,enemy.maxHp,enemy.boss?'#ddbd78':chosen?'#a4ecd8':'#91bcb3');
    const lost=navalLostHealth(enemy,m.time,balance.aimLook?.hit);if(lost){const a=x-25+50*Math.max(0,lost.from/enemy.maxHp),b=x-25+50*Math.min(1,lost.to/enemy.maxHp);p.save();p.globalAlpha=lost.alpha;p.fillStyle=balance.aimLook.hit.lost;p.fillRect(a,y-3,Math.max(1,b-a),4);p.restore();shown.lost=(shown.lost||0)+1;}
    if(priority){p.fillStyle='#e7c77f';p.beginPath();p.moveTo(x-36,y-5);p.lineTo(x-32,y-1);p.lineTo(x-36,y+3);p.lineTo(x-40,y-1);p.closePath();p.fill();}
    if(chosen){const aim=project(enemy.x,enemy.z,1.1);if(aim.depth>0){p.strokeStyle=m.aiming?'#a4ecd8':'#e7c77f';p.lineWidth=1.6;p.beginPath();for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){p.moveTo(aim.x+sx*18,aim.y+sy*6);p.lineTo(aim.x+sx*18,aim.y+sy*11);p.lineTo(aim.x+sx*11,aim.y+sy*11);}p.stroke();}}
  }
  const feedback=m.lastFeedback,age=feedback?m.time-feedback.time:Infinity;
  if(m.resupplyTime>0){const u=Math.min(1,m.resupplyTime/2),q={x:width/2,y:height-70};p.save();p.strokeStyle='#e7cf9e';p.lineWidth=3;p.beginPath();p.arc(q.x,q.y,14,-Math.PI/2,-Math.PI/2+u*TAU);p.stroke();feedbackIcon(p,'resupply',{x:q.x,y:q.y+18},0);p.restore();shown.feedback='resupplying';}
  else if(feedback&&age>=0&&age<(feedback.kind==='critical'?(balance.aimLook?.hit?.starSeconds??.45):1.1)){const span=feedback.kind==='critical'?(balance.aimLook?.hit?.starSeconds??.45):1.1,q=feedback.x===undefined?{x:width/2,y:height/2,depth:1}:project(feedback.x,feedback.z,1.2);if(q.depth>0){feedbackIcon(p,feedback.kind,q,age/span);shown.feedback=feedback.kind;}}
  // Wind: a windsock, an arrow along the wind's push and one to three wind lines.
  const target=project(m.aim.x,m.aim.z),end=project(m.aim.x+m.wind.x,m.aim.z+m.wind.z),angle=Math.atan2(end.y-target.y,end.x-target.x),strength=Math.hypot(m.wind.x,m.wind.z),bars=strength>70?3:strength>45?2:1;
  if(!missionRect||missionRect.x>314){windMark(p,240,40,angle,bars);shown.icons.push('wind');shown.windLines=bars;}p.restore();
  // 11/11/2026 spin aim: when the landing mark leaves the picture (the turret turned faster than the camera), an arrow on the edge says where it is.
  if(m.aiming&&m.prediction&&!m.prediction.guided&&navalAimSpin()){const pr=m.prediction,at=pr.contact||pr.landing,q=project(at.x,at.z,0),hint=navalEdgeHint(q,width,height,28);if(hint){edgeArrow(p,hint,navalArcColor(navalMarkKind(pr),balance.aimLook||{}),13);shown.landingArrow={x:Math.round(hint.x),y:Math.round(hint.y),behind:hint.behind};}}
  if(m.vulcan)shown.air=drawNavalAirHud(p,m,balance,project,width,height);
  shown.ammo=drawNavalAmmoHud(p,m,balance,project,width,height);shown.sky=drawNavalSkyHud(p,m,balance,project,width,height);
  // 11/11/2026 enemy base: a fortress icon with the base's health bar and the count of main targets left, under the mission panel.
  const bh=m.baseHealth;if(bh&&missionRect){const x=missionRect.x-16,y=missionRect.y+missionRect.h+6,w=missionRect.w+32;glass(p,x,y,w,26,9);p.save();p.translate(x+16,y+13);p.fillStyle='#e3d2a5';p.strokeStyle='#103847';p.lineWidth=1;p.beginPath();p.moveTo(-8,7);p.lineTo(-8,-3);p.lineTo(-5,-3);p.lineTo(-5,-6);p.lineTo(-2,-6);p.lineTo(-2,-3);p.lineTo(2,-3);p.lineTo(2,-6);p.lineTo(5,-6);p.lineTo(5,-3);p.lineTo(8,-3);p.lineTo(8,7);p.closePath();p.fill();p.stroke();p.restore();
   bar(p,x+32,y+9,w-72,8,bh.hp,bh.max,bh.hp/bh.max<.35?'#ff9a5c':'#e39b88');p.fillStyle='#f3e2b3';p.font='bold 12px sans-serif';p.direction='ltr';p.textAlign='right';p.fillText(`${bh.total-bh.left}/${bh.total}`,x+w-8,y+18);shown.base={hp:+(bh.hp/bh.max).toFixed(2),left:bh.left,total:bh.total};}
  return shown;
}

/** All six original weapon buttons remain in an expandable dock. */
export function mountNavalWeaponPicker(ctx,getModel){
  const controls=ctx.controls,rack=controls.querySelector('.ammo-rack');if(!rack)return {update(){},dispose(){}};
  const fireIcon=controls.querySelector('#shoot .game-icon'),originalFire=fireIcon?.innerHTML;if(fireIcon)fireIcon.innerHTML='<path d="m20 29 29-17 5 8-29 17Z" fill="currentColor"/><path d="m45 10 4-2 8 13-4 2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 36h12l8 14H12Z" fill="currentColor"/><path d="M10 53h36" stroke="currentColor" stroke-width="3"/><path d="m55 8 5-5M57 29l6 1" stroke="currentColor" stroke-width="2"/>';
  const events=new AbortController(),picker=document.createElement('button'),icon=document.createElement('span'),count=document.createElement('span'),name=document.createElement('span'),copy=document.createElement('span'),arrow=document.createElement('span'),hint=document.createElement('span'),fire=controls.querySelector('#shoot'),originalFireLabel=fire?.getAttribute('aria-label'),originalButtons=[];
  picker.type='button';picker.className='naval-weapon-picker';icon.className='naval-picked-icon';count.className='naval-picked-count';name.className='naval-picked-name';copy.className='naval-picked-copy';copy.append(name,count);arrow.textContent='⌃';arrow.className='naval-picker-arrow';picker.append(icon,copy,arrow);hint.className='naval-weapon-hint';hint.id='naval-weapon-hint';picker.setAttribute('aria-describedby',hint.id);controls.append(picker,hint);controls.classList.add('naval-adventure-controls');
  for(const [index,button] of [...rack.querySelectorAll('[data-ammo-index]')].entries()){const title=document.createElement('span');title.className='naval-ammo-name';title.textContent=ctx.t(ctx.balance.ammo[index].title);button.append(title);originalButtons.push({button,title:button.getAttribute('title'),description:button.getAttribute('aria-description')});const text=translated(ctx.t,'naval.weapon.hint.'+ctx.balance.ammo[index].id,weaponHints[index]);button.title=title.textContent+' · '+text;button.setAttribute('aria-description',text);}
  rack.id='naval-weapon-dock';picker.setAttribute('aria-controls',rack.id);let open=false,last='',lastWeapon=-1;
  function expand(value){if(!value&&rack.contains(document.activeElement))picker.focus();open=value;controls.dataset.weaponMenu=String(value);picker.setAttribute('aria-expanded',String(value));rack.inert=!value;}
  picker.addEventListener('click',()=>expand(!open),{signal:events.signal});
  rack.addEventListener('pointerup',()=>expand(false),{signal:events.signal});
  rack.addEventListener('click',event=>{if(event.target.closest('[data-ammo-index]'))expand(false);},{signal:events.signal});
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.stopPropagation();expand(false);picker.focus();}},{signal:events.signal});expand(false);
  for(const type of ['keydown','keyup'])controls.addEventListener(type,event=>{if(event.code==='Space'&&event.target.closest('.naval-weapon-picker,.ammo-rack'))event.stopPropagation();},{signal:events.signal});
  return {update(){
    const model=getModel();if(!model)return;const index=model.ammoIndex,cooldown=Math.max(0,model.cooldowns?.[index]||0),ready=cooldown<=0&&model.ammo[index]>0,key=index+':'+model.ammo[index]+':'+Math.ceil(cooldown*10)+':'+Boolean(model.resupplyTime);if(last===key)return;last=key;
    if(lastWeapon!==index){const button=rack.querySelector(`[data-ammo-index="${index}"]`),drawing=button?.querySelector('.game-icon');icon.replaceChildren(...(drawing?[drawing.cloneNode(true)]:[]));name.textContent=ctx.t(ctx.balance.ammo[index].title);picker.style.setProperty('--naval-weapon',button?.style.getPropertyValue('--naval-weapon')||'#ffcf79');lastWeapon=index;}count.textContent=String(model.ammo[index]);picker.setAttribute('aria-label',name.textContent+', '+count.textContent+', בחירת נשק');
    hint.textContent=cooldown>0?translated(ctx.t,'naval.weapon.reloading','טוענים')+' · '+cooldown.toFixed(1)+'s':model.resupplyTime>0?translated(ctx.t,'naval.feedback.resupplying','אספקה בדרך'):translated(ctx.t,'naval.weapon.hint.'+ctx.balance.ammo[index].id,weaponHints[index]);hint.dataset.reloading=String(cooldown>0);controls.dataset.weaponReady=String(ready);controls.dataset.reloading=String(cooldown>0);fire?.setAttribute('aria-label',name.textContent+' · '+hint.textContent);
   },
    dispose(){events.abort();rack.inert=false;if(fireIcon)fireIcon.innerHTML=originalFire;for(const {button,title,description}of originalButtons){if(title===null)button.removeAttribute('title');else button.setAttribute('title',title);if(description===null)button.removeAttribute('aria-description');else button.setAttribute('aria-description',description);}if(fire){if(originalFireLabel===null)fire.removeAttribute('aria-label');else fire.setAttribute('aria-label',originalFireLabel);}rack.querySelectorAll('.naval-ammo-name').forEach(n=>n.remove());picker.remove();hint.remove();controls.classList.remove('naval-adventure-controls');delete controls.dataset.weaponMenu;delete controls.dataset.weaponReady;delete controls.dataset.reloading;},
  };
}
