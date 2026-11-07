import {verify} from './night-browser.mjs';
// ALIEN_V11=0 captures v10 into verification/aliens-v11-before/, default into aliens-v11/.
const legacy=process.env.ALIEN_V11==='0';
await verify(legacy?'aliens-v11-before':'aliens-v11',[{width:844,height:390}],async({page,tick,snap,start,shot})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV11=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(5000);
 const m=()=>window.__island.games.current.session.debug.model;
 await shot('01-start');
 // hold fire a while: lasers + tells + blasts
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;mm.__f=true;});
 const hold=async ms=>{await page.evaluate(()=>{window.__island.games.current.session.debug.model.__orig??=window.__island.games.current.session.debug.model.update;const mm=window.__island.games.current.session.debug.model;mm.update=(dt,i={})=>mm.__orig(dt,{...i,firing:true});});await tick(ms);};
 await hold(6500);await shot('02-firing-lasers');
 await tick(2000);await shot('03-alien-fire-and-tells');
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;mm.pickups.push({x:mm.player.x,y:mm.player.y,vy:0,kind:3});});
 await tick(1500);await shot('04-bonus-timer');
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;if(!mm.blasts)return;mm.blasts.push({x:90,y:150,t:.08,life:.45,size:30,big:false},{x:250,y:150,t:.12,life:1.1,size:64,big:true});});
 await tick(40);await shot('05-explosions');
 const s=await snap();return {lasersFired:s.lasersFired,blastsMade:s.blastsMade,fired:s.fired,boltsFired:s.boltsFired,playerHits:s.playerHits,bonuses:s.bonusesDropped};
});
