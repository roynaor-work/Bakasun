import {verify} from './night-browser.mjs';
// ALIEN_V10=0 captures v9 into verification/aliens-v10-before/, default into aliens-v10/.
const legacy=process.env.ALIEN_V10==='0';
await verify(legacy?'aliens-v10-before':'aliens-v10',[{width:844,height:390}],async({page,tick,snap,start,shot,tap})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV10=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(5000);
 // 1) danger vs bonus side by side
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.aliens.length=Math.min(m.aliens.length,6);
  for(let i=0;i<4;i++)m.bolts.push({x:30+i*32,y:200+(i%2)*20,vx:0,vy:1,mine:false,kind:i,shape:['needle','orb','diamond','fork'][i]});
  m.bolts.push({x:165,y:215,vx:0,vy:1,mine:true,kind:4,shape:'ring'});
  for(let i=0;i<6;i++)m.pickups.push({x:30+i*50,y:150,vy:0,kind:i});});
 await tick(16);await shot('01-danger-vs-bonus');
 // 2) missile lock + trail
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.bolts.length=0;m.pickups.length=0;});
 await tap('#pass');await tick(350);await shot('02-missile-flight');
 await tick(1500);
 // 3) companion with timer
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.pickups.push({x:m.player.x,y:m.player.y,vy:0,kind:4});});
 await tick(1500);await shot('03-companion-timer');
 await tick(9000);await shot('04-companion-fading');
 const s=await snap();return {wingTime:s.wingTime,missilesFired:s.missilesFired,missilesHit:s.missilesHit};
});
