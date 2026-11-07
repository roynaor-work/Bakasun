/** Soccer motion v9: per-rendered-frame timeline of the controlled player (evidence only).
 * Scenarios: idle (arms), run (arms, ArrowRight held), slide (forced slide, then ArrowRight held at once).
 * Output JSON: arm angles from live bones (model space), slide timing in SIMULATION seconds,
 * frames where a hand/elbow/foot is inside the torso line.
 * Usage: node tools/soccer-motion-v9-timeline.mjs <outFile> [query] */
import {writeFile} from 'node:fs/promises';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const [outFile,extra='']=process.argv.slice(2);
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const out={query:extra,errors};
try{
 await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
 await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:240000});
 await page.evaluate(()=>{
  const D=()=>window.__island.games.current.session.debug,deg=r=>r*180/Math.PI;
  window.__rec=[];window.__on=false;
  const names=['Hips','Neck','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftFoot','RightFoot','LeftLeg','RightLeg'];
  function sample(){
   if(!window.__on)return requestAnimationFrame(sample);
   const d=D(),s=d.model.getState(),p=s.players[s.controlled],ch=d.view.characters[s.controlled];
   const Vec=ch.root.position.constructor;ch.root.updateMatrixWorld(true);
   const inv=ch.root.matrixWorld.clone().invert(),P={};
   for(const n of names){const b=ch.root.getObjectByName(n);const v=b.getWorldPosition(new Vec());P[n]=v.applyMatrix4(inv);}
   const sub=(a,b)=>a.clone().sub(b),ang=(a,b)=>deg(a.angleTo(b));
   const arm=side=>{const u=sub(P[side+'ForeArm'],P[side+'Arm']),f=sub(P[side+'Hand'],P[side+'ForeArm']);const abd=deg(Math.atan2((side==='Left'?1:-1)*u.x,-u.y)),fwd=deg(Math.atan2(u.z,-u.y));return {abd,fwd,flex:ang(u,f)};};
   // torso line Hips->Neck: distance of hands/elbows/feet
   const a=P.Hips,b=P.Neck,ab=sub(b,a),L=ab.length();
   const dist=v=>{const t=Math.max(0,Math.min(1,sub(v,a).dot(ab)/(L*L)));return v.distanceTo(a.clone().add(ab.clone().multiplyScalar(t)));};
   const inside=['LeftHand','RightHand','LeftForeArm','RightForeArm','LeftFoot','RightFoot'].filter(n=>dist(P[n])<.07);
   const l=arm('Left'),r=arm('Right');
   window.__rec.push({sim:+s.elapsed.toFixed(3),slideTime:+(p.slideTime||0).toFixed(3),recover:+(p.recover||0).toFixed(3),speed:+Math.hypot(p.vx||0,p.vz||0).toFixed(2),clip:ch.active,mode:ch.mode,slideT:ch.motion.slide?+ch.motion.slide.time.toFixed(3):null,hipsY:+(ch.root.getObjectByName('Hips').getWorldPosition(new Vec()).y).toFixed(3),abdL:+l.abd.toFixed(1),abdR:+r.abd.toFixed(1),fwdL:+l.fwd.toFixed(1),fwdR:+r.fwd.toFixed(1),flexL:+l.flex.toFixed(1),flexR:+r.flex.toFixed(1),inside:inside.join(',')});
   requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
 });
 const take=async(name,ms)=>{await page.evaluate(()=>{window.__rec.length=0;window.__on=true;});await page.waitForTimeout(ms);const r=await page.evaluate(()=>{window.__on=false;return window.__rec.slice();});out[name]=r;};
 await take('idle',2500);
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1500);await take('run',2500);await page.keyboard.up('ArrowRight');await page.waitForTimeout(600);
 // slide, then keep running as soon as control returns
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled],o=s.players.find(q=>q.team!==p.team&&q.role!=='keeper');s.phase='playing';o.x=p.x+3;o.z=p.z;s.ball.owner=o.id;s.ball.x=o.x;s.ball.z=o.z;p.slideKind='straight';p.slideTime=.35;p.slideX=1;p.slideZ=0;p.slideCooldown=1.2;p.slideAttempted=false;p.slideWon=true;});
 await page.evaluate(()=>{window.__rec.length=0;window.__on=true;});
 await page.waitForTimeout(500);await page.keyboard.down('ArrowRight');await page.waitForTimeout(6000);
 out.slide=await page.evaluate(()=>{window.__on=false;return window.__rec.slice();});
}finally{await context.close();await browser.close();await server.close();}
await writeFile(outFile,JSON.stringify(out));
const sum=a=>({n:a.length,abdMax:Math.max(...a.map(r=>Math.max(r.abdL,r.abdR))),abdAvg:+(a.reduce((x,r)=>x+(r.abdL+r.abdR)/2,0)/a.length).toFixed(1),flexAvg:+(a.reduce((x,r)=>x+(r.flexL+r.flexR)/2,0)/a.length).toFixed(1),inside:a.filter(r=>r.inside).length});
console.log(JSON.stringify({errors,idle:sum(out.idle),run:sum(out.run),slideFrames:out.slide.length,slideInside:out.slide.filter(r=>r.inside).length}));
