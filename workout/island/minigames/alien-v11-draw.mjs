/** v11 presentation: laser burst beams, small/big explosions, bonus timer ring, stronger shot warning.
 * Reads existing entities only (shots, model.blasts, telegraphs). */
const TAU=Math.PI*2;
const kindColor=['#88e7be','#77e9ff','#ffd17b','#8dbdff','#c4a2ff','#ffbb88'];
/** A thin glowing beam, clearly different from the round missile and the short standard bullets. */
export function drawV11Laser(p,s,aspect=1,scale=1){
 p.save();p.translate(s.x,s.y);p.scale(1/aspect,1);
 const g=p.createLinearGradient(0,-46*scale,0,26*scale);g.addColorStop(0,'#ffffff');g.addColorStop(.3,'#7ff3ff');g.addColorStop(1,'#7ff3ff00');
 p.globalAlpha=.35;p.strokeStyle='#4fe8ff';p.lineWidth=7*scale;p.beginPath();p.moveTo(0,-46*scale);p.lineTo(0,26*scale);p.stroke();
 p.globalAlpha=1;p.strokeStyle=g;p.lineWidth=2.4*scale;p.beginPath();p.moveTo(0,-46*scale);p.lineTo(0,26*scale);p.stroke();
 p.strokeStyle='#ffffff';p.lineWidth=1*scale;p.beginPath();p.moveTo(0,-46*scale);p.lineTo(0,10*scale);p.stroke();p.restore();
}
/** Short shock ring + sparks. Small ones are brief; the boss gets two rings and a bright flash. */
export function drawV11Blasts(p,m,aspect=1,scale=1){
 for(const b of m.blasts||[]){
  const u=Math.min(1,b.t/b.life),r=b.size*scale*(.35+.9*u);
  p.save();p.translate(b.x,b.y);p.scale(1/aspect,1);
  const flash=Math.max(0,1-u*2.2);if(flash>0){const g=p.createRadialGradient(0,0,0,0,0,r*1.1);g.addColorStop(0,`rgba(255,248,210,${flash})`);g.addColorStop(.5,`rgba(255,170,80,${flash*.6})`);g.addColorStop(1,'rgba(255,120,40,0)');p.fillStyle=g;p.beginPath();p.arc(0,0,r*1.1,0,TAU);p.fill();}
  p.globalAlpha=(1-u)**1.5;p.strokeStyle='#ffd8a0';p.lineWidth=(b.big?5:3)*scale*(1-u)+1;p.beginPath();p.arc(0,0,r,0,TAU);p.stroke();
  if(b.big){p.strokeStyle='#ff8a4a';p.lineWidth=3*scale*(1-u)+1;p.beginPath();p.arc(0,0,r*.62,0,TAU);p.stroke();}
  p.strokeStyle='#fff0c0';p.lineWidth=1.6*scale;const n=b.big?14:7;
  for(let i=0;i<n;i++){const a=i*TAU/n+b.x*.1,r0=r*.55,r1=r*(.75+.5*u);p.beginPath();p.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);p.lineTo(Math.cos(a)*r1,Math.sin(a)*r1);p.stroke();}
  p.restore();
 }
}
/** Timer ring around the ship for the active bonus; blinks in the last seconds. */
export function drawV11BonusTimer(p,m,aspect=1,scale=1,blink=2){
 const left=m.spreadTime>0?m.spreadTime:m.powerup>=0&&m.powerTime>0?m.powerTime:0;if(!(left>0)||!(m.powerMax>0))return;
 const kind=m.spreadTime>0?0:m.powerup,f=Math.min(1,left/m.powerMax),flash=left<blink&&Math.floor(m.time*8)%2===0;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 p.strokeStyle='#ffffff22';p.lineWidth=3*scale;p.beginPath();p.arc(0,0,30*scale,0,TAU);p.stroke();
 p.strokeStyle=flash?'#ff9a3c':kindColor[kind]||'#ffd84a';p.lineWidth=3*scale;p.beginPath();p.arc(0,0,30*scale,-Math.PI/2,-Math.PI/2+TAU*f);p.stroke();p.restore();
}
/** Stronger warning: pulsing red halo on the shooter and a short dashed lane toward where it will fire. */
export function drawV11Tells(p,m,aspect=1,scale=1){
 for(const t of m.telegraphs||[]){
  if(!(t.life>0)||t.kind==='dive')continue;
  const prog=1-t.life/Math.max(.001,t.maxLife||t.life),pulse=.5+.5*Math.sin(m.time*(10+prog*14));
  p.save();p.translate(t.x,t.y);p.scale(1/aspect,1);
  p.globalAlpha=.25+.45*prog*(.6+.4*pulse);p.fillStyle='#ff4a30';p.beginPath();p.arc(0,0,(13+prog*7)*scale,0,TAU);p.fill();
  const dx=((t.targetX??t.x)-t.x),dy=Math.max(40,(t.targetY??t.y+100)-t.y),len=Math.hypot(dx,dy),k=Math.min(1,110*scale/len);
  p.globalAlpha=.2+.4*prog;p.strokeStyle='#ff6a3a';p.lineWidth=1.4*scale;p.setLineDash([4*scale,5*scale]);p.beginPath();p.moveTo(0,10*scale);p.lineTo(dx*k,dy*k);p.stroke();p.setLineDash([]);
  p.restore();
 }
}
