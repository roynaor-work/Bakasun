// Deterministic input policies using the same visible targets, pressure and aim.
export function pilotInput(id,m,b,memory={}) {
  if(id==='alienDefense') {
    if(m.choosing&&m.chooseUpgrade){const wing=m.choices.indexOf('wing');m.chooseUpgrade(wing>=0?wing:0);}
    const target=m.aliens.reduce((a,b)=>!a||b.y>a.y?b:a,null);
    const danger=m.bolts.find(b=>b.y>m.player.y-110&&Math.abs(b.x-m.player.x)<45);
    return {firing:true,x:danger?Math.max(20,Math.min(340,m.player.x+(danger.x<m.player.x?70:-70))):target?.x??180};
  }
  if(id==='fireRescue') {
    if(m.water<=5)memory.refilling=true;if(m.water>=m.maxWater-1||m.reserve<=0)memory.refilling=false;
    const target=m.flames.find(f=>f.heat>0);
    if(m.pressure<.85)memory.resting=true;if(m.pressure>=.99)memory.resting=false;
    return {x:target?.x,y:target?.y,firing:!memory.resting&&!memory.refilling,refill:memory.refilling};
  }
  const angle=b.defaultAngle*Math.PI/180;let d=m.enemyX-b.shipX,v;
  for(let j=0;j<8;j++) {
    v=Math.sqrt(b.gravity*d*d/(2*Math.cos(angle)**2*(d*Math.tan(angle)+b.muzzleRise)));
    const flight=(v*Math.sin(angle)+Math.sqrt((v*Math.sin(angle))**2+2*b.gravity*b.muzzleRise))/b.gravity;
    d=b.enemyX+Math.sin(m.time+flight)*m.settings.drift-b.shipX;
  }
  memory.pressed=m.phase==='aim'&&!memory.pressed;
  return {angle:b.defaultAngle,power:(v-b.minSpeed)/(b.maxSpeed-b.minSpeed)*b.powerMaximum,firing:memory.pressed};
}
