// Honest aim (29/10/2026) in the live page, stage 3 with a patrolling ship.
// 1. Aimed ahead of the moving ship: the mark and the whole arc turn green, the
//    lead ring shows where the ship will be, and the release hits.
// 2. Aimed long, over the ship: no landing mark on the ship's picture, a double
//    chevron above it instead, and the arc stays pale.
// Touch at 844x390 and 740x360 (right and left hand), mouse at 1366x768.
// NAVAL_HONEST_BEFORE=1 only captures (for the old code, no assertions).
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const evidence=new URL('../verification/naval-honest/',import.meta.url);await mkdir(evidence,{recursive:true});
const before=process.env.NAVAL_HONEST_BEFORE==='1',prefix=before?'before-':'';
const sizes=[{width:844,height:390},{width:740,height:360},{width:1366,height:768}].filter(v=>!process.env.NAVAL_HONEST_ONLY||String(v.width)===process.env.NAVAL_HONEST_ONLY);
await verify(before?'naval-honest-before':'naval-honest',sizes,async({page,context,viewport,tick,snap,start,assert})=>{
 const tag=`${viewport.width}x${viewport.height}`,phone=viewport.width<1000,left=viewport.width===740,client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const capture=name=>page.screenshot({path:new URL(`${prefix}${tag}-${name}.jpg`,evidence).pathname,type:'jpeg',quality:90});
 await page.evaluate(left=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=3;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;localStorage.setItem('island.naval.hand',left?'left':'right');},left);
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(1200);
 const drive=input=>page.evaluate(input=>window.__island.games.current.session.debug.drive(.02,input),input);
 const b=await page.locator('#shoot').boundingBox(),pad={x:b.x+b.width/2+(left?1:-1)*viewport.width*.27,y:b.y+b.height/2-40};
 const hold=async()=>{if(phone)await touch('touchStart',[pad]);else{await page.mouse.move(pad.x,pad.y);await page.mouse.down();}};
 const release=async()=>{if(phone)await touch('touchEnd');else await page.mouse.up();};
 // Turret settings (yaw + reach, what the drag sets) that land on a water point `ahead` seconds from now.
 const settings=(behind,ahead)=>page.evaluate(async({behind,ahead})=>{
  const s=window.__island.games.current.session,m=s.debug.model,bal=window.__island.data.config.minigames.navalDuel,C=await import('./minigames/naval-controls.mjs'),B=await import('./minigames/naval-ballistics.mjs');
  const e=m.enemies.find(q=>q.active&&q.hp>0),R=C.navalReachRange(bal),pressure=3,make=(yaw,v)=>{const a=C.navalReachAim(v,bal,0);return B.navalLaunch({ship:m.playerShip,yaw,elevation:a.elevation,power:a.power,wind:m.wind,ammo:0,pressure},bal);};
  let target={x:e.x+behind,z:e.z},yaw=0,v=14;
  for(let round=0;round<3;round++){
   yaw=Math.atan2(target.z-m.playerShip.z,target.x-m.playerShip.x);
   for(let pass=0;pass<8;pass++){const mz=B.navalMuzzle(m.playerShip,yaw,bal),cy=Math.cos(yaw),sy=Math.sin(yaw),want=(target.x-mz.x)*cy+(target.z-mz.z)*sy;let lo=R.min,hi=R.max;
    for(let i=0;i<36;i++){const mid=(lo+hi)/2,l=make(yaw,mid),q=B.navalLanding(l);if((q.x-l.origin.x)*cy+(q.z-l.origin.z)*sy<want)lo=mid;else hi=mid;}
    v=(lo+hi)/2;const q=B.navalLanding(make(yaw,v));yaw+=Math.atan2((target.z-q.z)*cy-(target.x-q.x)*sy,Math.max(1,Math.hypot(q.x-mz.x,q.z-mz.z)));}
   const t=ahead+make(yaw,v).duration;target={x:e.x+behind+(e.vx||0)*t,z:e.z+(e.vz||0)*t};
  }
  const a=C.navalReachAim(v,bal,0);return {aimYaw:yaw,aimElevation:a.elevation,aimPower:a.power,enemy:e.index};
 },{behind,ahead});
 const report={tag,left};
 // 1. Green ahead of the moving ship.
 let green=null;
 for(let attempt=0;attempt<6&&!green;attempt++){
  const set=await settings(0,.45);await drive({aimYaw:set.aimYaw,aimElevation:set.aimElevation,aimPower:set.aimPower});await hold();await tick(420);
  const s=await snap();const pr=s.prediction,arc=s.renderMetrics.aimArc;
  if(before||pr.kind==='hull'||pr.kind==='critical'){green={prediction:pr,arc,fired:s.fired};await capture('1-green');}
  if(!green){await release();await tick(1600);continue;}
  await release();await tick(40);const shot=await snap();await tick(Math.round((shot.ball.duration||1)*1000)+300);const done=await snap();
  green.result=done.lastShot?.actual;green.enemy=set.enemy;
  if(!before){assert.equal(green.arc.kind,green.prediction.kind,'the arc wears the mark kind');assert.equal(green.arc.color,(green.prediction.kind==='critical'?'#FFD166':'#62E6AA'));
   assert.ok(green.prediction.lead,'the lead ring is on from stage 3');assert.notEqual(green.result?.victim,null,'released on green, the moving ship is hit');}
 }
 if(!before)assert.ok(green,'a green mark was reached on the moving ship');report.green=green&&{kind:green.prediction.kind,arc:green.arc.color,lead:green.prediction.lead,hit:green.result};
 await tick(1500);
 // 2. Over the ship: a chevron above the hull instead of a landing mark on its picture.
 let over=null;
 for(const behind of [70,95,120]){
  if(over)break;const set=await settings(behind,.45);await drive({aimYaw:set.aimYaw,aimElevation:set.aimElevation,aimPower:set.aimPower});await hold();await tick(420);
  const s=await snap(),pr=s.prediction;
  if(before||pr.over){over={prediction:pr,arc:s.renderMetrics.aimArc,marks:s.hud?.marks??null};await capture('2-over');}
  await page.evaluate(()=>window.__island.games.current.session.debug.view.resetPeak());await release();await tick(1800);
 }
 if(!before){assert.ok(over,'an over-the-hull aim was reached');assert.equal(over.prediction.kind,'water');assert.equal(over.arc.kind,'water');assert.equal(over.arc.color,'#B8F6FF','the arc stays pale over the ship');}
 report.over=over&&{kind:over.prediction.kind,over:over.prediction.over,arc:over.arc.color};
 return report;
});
