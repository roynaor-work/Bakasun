/** Uses visible targets and the same explicit touch actions exposed to a player. */
export function pilotInput(id,m,b,memory={}){
 if(id==='alienDefense'){
  if(m.choosing){const priority=['wing','laser','damage','shield','rapid'];const at=priority.map(id=>m.choices.indexOf(id)).find(i=>i>=0);m.chooseUpgrade(at??0);}
  const target=m.aliens.reduce((a,b)=>!a||b.y>a.y?b:a,null),danger=m.bolts.find(b=>b.y>m.player.y-110&&Math.abs(b.x-m.player.x)<40);
  return {firing:true,spread:m.spreadCooldown===0,nova:m.aliens.length>5&&m.nova.flight===0&&m.nova.life===0,x:danger?Math.max(20,Math.min(340,m.player.x+(danger.x<m.player.x?65:-65))):target?.x??180};
 }
 if(id==='fireRescue'){
  if(m.water<=8)memory.refilling=true;if(m.water>=m.maxWater-1||m.reserve<=0)memory.refilling=false;
  if(m.pressure<.45)memory.pumping=true;if(m.pressure>=m.maxPressure*.98)memory.pumping=false;
  const target=m.flames.find(f=>f.heat>0);
  return {x:target?.x,y:target?.y,firing:!memory.pumping&&!memory.refilling,refill:memory.refilling,charge:memory.pumping||memory.refilling};
 }
 memory.pressed=m.phase==='aim'&&!memory.pressed;
 const heal=m.lives<m.maxLives*.7&&m.ammo[3]>0,kind=heal?3:m.ammo[1]>0?1:m.ammo[2]>0?2:m.ammo[0]>0?0:3;
 return {targetX:m.enemyShip.x,targetZ:m.enemyShip.z,ammoIndex:kind,firing:memory.pressed};
}
