const TAU=Math.PI*2;
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(n)?n:lo));
export const ALIEN_PICKUPS=Object.freeze([
 Object.freeze({id:'spread',label:'ירי מפוזר',color:'#88e7be'}),
 Object.freeze({id:'laser',label:'לייזר חודר',color:'#77e9ff'}),
 Object.freeze({id:'rapid',label:'ירי מהיר',color:'#ffd17b'}),
 Object.freeze({id:'shield',label:'מגן אור',color:'#8dbdff'}),
 Object.freeze({id:'wing',label:'חללית ליווי',color:'#c4a2ff'}),
 Object.freeze({id:'nova',label:'טיל נוסף',color:'#ffbb88'})
]);

/** Shared vocabulary for the world token and the cockpit's SVG. */
export function alienPickup(value){
 if(typeof value==='number')return ALIEN_PICKUPS[value]||null;
 const id=typeof value==='object'&&value?value.id??value.kind:value;
 return ALIEN_PICKUPS.find(item=>item.id===id)||null;
}
/** A timed phase barrier is separate from the enemies' finite shield charges.
 * The core owns every deadline; this reader only formats its remaining time. */
export function alienBossGuardReadout(boss,minBossSeconds=16){
 if(typeof boss?.guardActive!=='boolean')return null;
 const remaining=Math.max(0,Number(boss.guardRemaining)||0),entry=boss.entry>0||(boss.hp/Math.max(1,boss.maxHp)>2/3+.001);
 const duration=entry?2:Math.max(.001,(Number.isFinite(minBossSeconds)?minBossSeconds:16)/3),active=boss.guardActive;
 return {active,remaining,progress:active?clamp(1-remaining/duration):1,
  label:active?(remaining>0?`${entry?'מגן כניסה':'מגן מעבר'} · ${Math.ceil(remaining)}ש׳`:'המגן נפתח'):'פגיע עכשיו'};
}
export function alienBossReadout(model,minBossSeconds=16){
 let boss;for(const enemy of model.aliens||[])if(enemy.boss&&enemy.hp>0&&(!boss||enemy.maxHp>boss.maxHp))boss=enemy;
 if(!boss)return null;
 const ratio=clamp(boss.hp/Math.max(1,boss.maxHp)),phase=clamp(Math.floor(boss.bossPhase??(1+(ratio<=.66?1:0)+(ratio<=.33?1:0))),1,3);
 const style=model.behavior?.bossStyle==='final'?['sweep','cross','fan'][phase-1]:model.behavior?.bossStyle;
 const patterns={sweep:'מטח סריקה',cross:'מטח צולב',fan:'מטח מניפה',pulse:'פעימת פלזמה',escort:'ירי מאגפים'};
 const readout={id:boss.id,hp:Math.max(0,boss.hp),maxHp:Math.max(1,boss.maxHp),ratio,phase,pattern:patterns[style]||(boss.attackPattern===1?'מטח רחב':'מטח ממוקד')},guard=alienBossGuardReadout(boss,minBossSeconds);
 if(guard)readout.guard=guard;return readout;
}
function polygon(p,points){p.beginPath();for(let i=0;i<points.length;i++)i?p.lineTo(...points[i]):p.moveTo(...points[i]);p.closePath();}
function line(p,points){p.beginPath();for(let i=0;i<points.length;i++)i?p.lineTo(...points[i]):p.moveTo(...points[i]);p.stroke();}

/** Canvas glyphs remain readable when color cannot be distinguished. No GLB
 * material or gameplay entity is modified to show a collectible. */
export function drawAlienPickupGlyph(p,value,x,y,r=12,aspect=1,alpha=1){
 const item=alienPickup(value);if(!item)return false;
 p.save();p.translate(x,y);p.scale(r/12/aspect,r/12);p.globalAlpha=alpha;
 p.fillStyle='#091a2be8';p.strokeStyle=item.color;p.lineWidth=1.5;p.lineJoin='round';p.lineCap='round';
 polygon(p,[[0,-14],[11,-7],[11,7],[0,14],[-11,7],[-11,-7]]);p.fill();p.stroke();
 p.strokeStyle=item.color;p.fillStyle=item.color;p.lineWidth=1.7;
 if(item.id==='spread'){
  for(const side of [-1,0,1]){const x=side*6;line(p,[[side*2,6],[x,-6]]);line(p,[[x-2,-3],[x,-7],[x+2,-3]]);}
 }else if(item.id==='laser'){
  p.lineWidth=3;line(p,[[0,8],[0,-8]]);p.lineWidth=1;line(p,[[-5,-7],[-7,-7],[-7,-3]]);line(p,[[5,7],[7,7],[7,3]]);
 }else if(item.id==='rapid'){
  polygon(p,[[1,-9],[-6,1],[-1,1],[-2,9],[6,-3],[1,-3]]);p.fill();
 }else if(item.id==='shield'){
  polygon(p,[[0,-8],[7,-5],[5,4],[0,8],[-5,4],[-7,-5]]);p.stroke();line(p,[[-3,0],[-1,3],[4,-3]]);
 }else if(item.id==='wing'){
  for(const side of [-1,1]){p.save();p.translate(side*5,side===-1?2:-2);polygon(p,[[0,-6],[4,4],[0,2],[-4,4]]);p.stroke();p.restore();}
 }else{
  polygon(p,[[0,-9],[4,-3],[4,5],[0,3],[-4,5],[-4,-3]]);p.stroke();line(p,[[-4,1],[-7,7],[-3,6]]);line(p,[[4,1],[7,7],[3,6]]);line(p,[[-1,6],[0,10],[1,6]]);
 }
 p.restore();return true;
}

export function alienFeedbackEvents(model){
 const feedback=model.feedback;
 if(Array.isArray(feedback))return feedback.filter(e=>e&&e.life>0);
 return feedback&&feedback.life>0?[feedback]:[];
}
function inScreenPixels(p,config,draw){
 const w=p.canvas?.clientWidth||config.width,h=p.canvas?.clientHeight||config.height;
 p.save();p.scale(config.width/w,config.height/h);draw(w,h);p.restore();
}
function bossHud(p,model,config,balance){
 const boss=alienBossReadout(model,balance.balance?.minBossSeconds??16);if(!boss)return;
 inScreenPixels(p,config,(w,h)=>{
  const width=Math.min(310,w*.36),x=(w-width)/2,y=34;
  p.fillStyle='#071421d9';p.fillRect(x-9,y-12,width+18,43);p.strokeStyle='#d9b17a66';p.lineWidth=1;p.strokeRect(x-9,y-12,width+18,43);
  p.fillStyle='#f2d6aa';p.font='500 11px Assistant, Arial, sans-serif';p.textAlign='center';p.textBaseline='middle';p.fillText(`ספינת פיקוד · שלב ${boss.phase} · ${boss.pattern}`,w/2,y-3);
  p.fillStyle='#3d2631';p.fillRect(x,y+8,width,6);p.fillStyle=boss.phase===3?'#ef8f87':'#dfba80';p.fillRect(x,y+8,width*boss.ratio,6);
  p.fillStyle='#08121c';for(let i=1;i<3;i++)p.fillRect(x+width*i/3-1,y+8,2,6);
  p.textAlign='right';p.direction='ltr';p.fillStyle='#c5d7e5';p.font='10px Assistant, Arial, sans-serif';p.fillText(`${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`,x+width,y+23);
  p.textAlign='left';p.direction='rtl';p.fillStyle=boss.guard?(boss.guard.active?'#a8dcff':'#a5e6c0'):'#9eb7ca';p.fillText(boss.guard?.label||'חיי הבוס',x+(boss.guard?.active?14:0),y+23);
  if(boss.guard?.active){
   // Clock and continuous charge, rather than charge counters or HP segments.
   p.strokeStyle='#a8dcff';p.lineWidth=1;p.beginPath();p.arc(x+5,y+23,4,0,TAU);p.stroke();line(p,[[x+5,y+20],[x+5,y+23],[x+7,y+24]]);
   p.fillStyle='#26405b';p.fillRect(x,y+30,width,2);p.fillStyle='#90caff';p.fillRect(x,y+30,width*boss.guard.progress,2);
  }
 });
}

function bossGuardField(p,m,aspect,config,scale,minBossSeconds){
 for(const boss of m.aliens||[]){
  if(!boss.boss||boss.hp<=0)continue;const guard=alienBossGuardReadout(boss,minBossSeconds);if(!guard?.active)continue;
  const height=p.canvas?.clientHeight||config.height,radius=Number.isFinite(boss.radius)?boss.radius:28;
  const pixels=Math.min(100,radius*2*height/config.height*1.65),r=Math.max(16,pixels/2*scale)*1.14;
  p.save();p.translate(boss.x,boss.y);p.scale(1/aspect,1);p.rotate(Math.sin((m.time||0)*.8)*.035);p.lineWidth=1.35*scale;
  p.fillStyle='#78b8ff09';p.strokeStyle='#8cc9ff55';p.beginPath();p.ellipse(0,0,r,r*.88,0,0,TAU);p.fill();p.stroke();
  p.strokeStyle='#bee3ff';p.globalAlpha=.62+Math.sin((m.time||0)*4)*.1;p.lineWidth=2.4*scale;p.beginPath();p.ellipse(0,0,r+3*scale,r*.88+3*scale,0,-Math.PI/2,-Math.PI/2+TAU*guard.progress);p.stroke();p.restore();
 }
}

/** An arming cue is anchored to the attacker. It never draws a target marker
 * over the player or a persistent aiming line across the arena. */
export function drawAlienTelegraph(p,t,aspect=1,time=0,scale=1){
 if(!(t.life>0))return false;
 const progress=1-clamp(t.life/Math.max(.001,t.maxLife||t.life)),dive=t.kind==='dive',boss=t.kind==='boss',color=dive?'#e5a5ff':boss?'#ffbd83':'#ffd58e';
 const dx=((t.targetX??t.x)-t.x)*aspect,dy=(t.targetY??t.y+1)-t.y,angle=Math.atan2(dx,dy),r=(11+progress*5)*scale;
 p.save();p.translate(t.x,t.y);p.scale(1/aspect,1);p.rotate(-angle);p.strokeStyle=color;p.fillStyle=color;p.lineWidth=1.6*scale;p.globalAlpha=.6+progress*.35;
 if(dive){
  for(let i=0;i<3;i++){const y=(10+i*9+progress*5)*scale;line(p,[[-5*scale,y],[0,y+5*scale],[5*scale,y]]);}
  p.lineWidth=2*scale;p.beginPath();p.arc(0,0,r,Math.PI*1.05,Math.PI*1.95);p.stroke();
 }else{
  p.beginPath();p.arc(0,0,r,Math.PI*.12,Math.PI*(.12+1.76*progress));p.stroke();
  const count=boss?3:1;for(let i=0;i<count;i++){p.save();p.rotate((i-(count-1)/2)*.36);polygon(p,[[0,17*scale],[-3*scale,23*scale],[0,21*scale],[3*scale,23*scale]]);p.fill();p.restore();}
 }
 p.restore();return true;
}
function telegraphs(p,m,aspect,scale){
 const events=m.telegraphs||[];
 if(events.length){for(const tell of events)drawAlienTelegraph(p,tell,aspect,m.time,scale);return;}
 for(const enemy of m.aliens||[])if(enemy.tellTime>0)drawAlienTelegraph(p,{x:enemy.x,y:enemy.y,targetX:m.player.x,targetY:m.player.y,kind:enemy.attackKind||enemy.tellKind||(enemy.boss?'boss':'shot'),life:enemy.tellTime,maxLife:enemy.tellMax},aspect,m.time,scale);
}
function impact(p,event,aspect,scale){
 const guard=event.kind==='boss-guard',shield=event.kind==='shield-hit',player=event.kind==='player-hit',duration=event.maxLife||(player?.55:.35),alpha=clamp(event.life/duration),spread=1-alpha;
 p.save();p.translate(event.x,event.y);p.scale(1/aspect,1);p.globalAlpha=alpha*(guard?.7:1);p.strokeStyle=player?'#ff9f9d':guard?'#b8d9ff':shield?'#9de9ff':'#fff0c2';p.lineWidth=(player?2.4:1.5)*scale;
 if(guard){
  const r=(14+spread*10)*scale;line(p,[[-r,-r*.2],[-r*.8,r*.55],[0,r*.9],[r*.8,r*.55],[r,-r*.2]]);line(p,[[-4*scale,0],[0,-5*scale],[4*scale,0]]);
 }else if(player||shield){
  for(let i=0;i<3;i++){p.beginPath();p.arc(0,0,(player?25+spread*25:16+spread*14)*scale,i*TAU/3+.1,i*TAU/3+1.45);p.stroke();}
 }else{
  for(let i=0;i<4;i++){const a=i*TAU/4+.35,r=(5+spread*10)*scale;line(p,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+5*scale),Math.sin(a)*(r+5*scale)]]);}
 }
 p.restore();
}
function damageVignette(p,event,config){
 if(event.kind!=='player-hit')return;
 const alpha=clamp(event.life/(event.maxLife||1.2));
 inScreenPixels(p,config,(w,h)=>{
  const g=p.createRadialGradient(w/2,h/2,h*.22,w/2,h/2,Math.max(w,h)*.58);g.addColorStop(0,'#ee6f7300');g.addColorStop(.7,'#ee6f7300');g.addColorStop(1,`rgba(238,111,115,${alpha*.35})`);p.fillStyle=g;p.fillRect(0,0,w,h);
 });
}

/** Stateless screen-plane feedback: no animation clock, listeners, textures or
 * renderer resources survive the owning game session. */
export function drawAlienFeedback(p,m,balance,aspect=1,config={width:640,height:480}){
 const scale=config.height/(p.canvas?.clientHeight||config.height);
 p.save();
 bossGuardField(p,m,aspect,config,scale,balance.balance?.minBossSeconds??16);
 telegraphs(p,m,aspect,scale);
 for(const pickup of m.pickups||[])drawAlienPickupGlyph(p,pickup.kind,pickup.x,pickup.y,12*scale,aspect);
 let guardImpact=false;for(const event of alienFeedbackEvents(m)){
  if(event.kind==='player-hit'||event.kind==='enemy-hit'||event.kind==='shield-hit')impact(p,event,aspect,scale);
  if(event.kind==='boss-guard'&&!guardImpact){impact(p,event,aspect,scale);guardImpact=true;}
  if(event.kind==='pickup'){
   const pickup=alienPickup(event.value),alpha=clamp(event.life/(event.maxLife||1.1));
   if(pickup){p.save();p.translate(event.x,event.y);p.scale(1/aspect,1);p.globalAlpha=alpha;p.strokeStyle=pickup.color;p.lineWidth=1.5*scale;p.beginPath();p.arc(0,0,(19+(1-alpha)*27)*scale,0,TAU);p.stroke();p.restore();drawAlienPickupGlyph(p,pickup.id,event.x,event.y-(1-alpha)*34*scale,10*scale,aspect,alpha);}
  }
  damageVignette(p,event,config);
 }
 bossHud(p,m,config,balance);p.restore();
}

export const drawAlienFallbackFeedback=drawAlienFeedback;
