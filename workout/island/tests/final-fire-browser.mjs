// 11/11/2026 final fix, fire rescue: acceptance through the real island shell with real touch (Chromium, hasTouch + isMobile, 844x390,
// CDP Input.dispatchTouchEvent on the on-screen joystick and buttons). MODE=before runs the v20 behaviour (kill switches) and passes only
// when the old faults are reproduced; the default MODE=after must be clean. Exit code is non-zero on any failure.
//   CHROMIUM_PATH=... ISLAND_PLAYWRIGHT=... node workout/island/tests/final-fire-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';
const MODE=process.env.MODE==='before'?'before':'after';
const directory=fileURLToPath(new URL('../verification/final-fix-fable/',import.meta.url)),frames=directory+'frames/';await mkdir(frames,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const KILL='&fireHeading=v20&fireLadder=v20&fireRescue=v20&fireHud=v20';
const variants=MODE==='after'?[{name:'meshy',query:''},{name:'pumper',query:'&fireTruckModel=v20'}]:[{name:'meshy-v20',query:KILL},{name:'pumper-v20',query:'&fireTruckModel=v20'+KILL}];
const deg=r=>r*180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),fold=a=>{let d=Math.abs(wrap(a));return d>Math.PI/2?Math.PI-d:d;};
const reports=[];let failures=0;
for(const variant of variants){
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[],checks={},rec={variant:variant.name,mode:MODE,query:variant.query,checks,errors};reports.push(rec);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const client=await context.newCDPSession(page),touch=(type,point)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...point,id:1}]});
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
 const shot=name=>page.screenshot({path:frames+'fire-'+MODE+'-'+variant.name+'-'+name+'.jpg',type:'jpeg',quality:72});
 const tapAt=async(x,y,ms=60)=>{await touch('touchStart',{x,y});await tick(ms);await touch('touchEnd');await tick(32);};
 const center=async s=>{const b=await page.locator(s).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 /** Nose of the rendered truck in world XZ (unit vector) and the roof ladder's pose, read from the scene graph. */
 const truckPose=()=>page.evaluate(()=>{const w=window.__island.games.current.session.debug.view.world,parts=w?.truckParts();if(!parts)return null;const root=parts.root;root.updateMatrixWorld(true);
  const V=root.position.constructor;let nose;
  if(parts.kind==='v7'){let n=0;const c=new V();const t=new V();root.traverse(o=>{if(o.isMesh&&o.material?.name==='vehicle/glass'){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){t.fromBufferAttribute(p,i);o.localToWorld(t);c.add(t);n++;}}});if(!n)return null;c.multiplyScalar(1/n).sub(root.position);nose=[c.x,c.z];}
  else{const d=new V(0,0,-1).applyQuaternion(root.quaternion);nose=[d.x,d.z];}
  const l=Math.hypot(nose[0],nose[1])||1;nose=[nose[0]/l,nose[1]/l];
  const turretYaw=parts.turret.rotation.y,arm=parts.arm?{pitch:parts.arm.rotation.x,scale:parts.arm.scale.z}:null;return {kind:parts.kind,nose,turretYaw,arm};});
 const start=async stage=>{await page.evaluate(s=>{const {engine:e}=window.__island,p=e.state.minigameProgress.fireRescue;if(s>1){p.stage=Math.max(p.stage,s);p.stars.fill(1,0,s-1);}window.__island.games.start('fireRescue',undefined,s);},stage);
  if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}await waitForGameStart(page);await waitForGameNavigation(page);
  for(let i=0;i<300;i++){if((await snap())?.renderMetrics?.truck?.loaded)break;await tick(50);}const s=await snap();if(!s?.renderMetrics?.truck?.loaded)throw Error('truck model did not load');return s;};
 const exit=async()=>{await page.locator('[data-action=game-pause]').tap();await tick(32);await page.locator('[data-action=game-exit]').tap();await waitForGameNavigation(page);};
 try{
  await page.clock.install();await page.goto(server.url+'?dev=1'+variant.query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await page.locator('[data-action=avatar-start]').tap();await tick(32);
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['soccer','tennis','fireStation','airbase']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}e.place('road',0,7);e.place('harbor',0,8);data.config.minigames.fireRescue.render.fallbackFrameMs=10000;});
  // ---- 1. driving: nose along the motion, roof ladder stowed, box ladder hidden -------------------------------------------------
  let s=await start(1);rec.truck=s.renderMetrics.truck;rec.renderMode=s.renderMode;
  const stick=await center('#joystick');const samples=[];
  const sample=async phase=>{const t=await truckPose(),s=await snap(),v=[s.truck.velocityX,s.truck.velocityZ],speed=Math.hypot(...v);const slip=speed>1.5?deg(Math.acos(Math.max(-1,Math.min(1,(t.nose[0]*v[0]+t.nose[1]*v[1])/speed)))):null;samples.push({phase,time:s.time,speed:+speed.toFixed(2),slipDeg:slip===null?null:+slip.toFixed(1),turretDeg:+deg(fold(t.turretYaw)).toFixed(1),armScale:t.arm?+t.arm.scale.toFixed(3):null,boxLadder:s.renderMetrics.truck.boxLadderVisible,yaw:+s.truck.yaw.toFixed(3)});};
  await touch('touchStart',stick);await touch('touchMove',{x:stick.x,y:stick.y-70});for(let i=0;i<12;i++){await tick(100);await sample('up');}await shot('drive-up');
  await touch('touchMove',{x:stick.x+70,y:stick.y});for(let i=0;i<25;i++){await tick(100);await sample('right');}await shot('drive-right');
  await touch('touchMove',{x:stick.x,y:stick.y+70});for(let i=0;i<20;i++){await tick(100);await sample('down');}await shot('drive-down');
  await touch('touchEnd');await tick(300);
  const moving=samples.filter(x=>x.slipDeg!==null),straight=moving.filter(x=>x.speed>15);
  const maxSlipStraight=Math.max(...straight.map(x=>x.slipDeg)),ladderOpen=moving.filter(x=>x.turretDeg>10).length/Math.max(1,moving.length),boxLadderSeen=samples.some(x=>x.boxLadder);
  rec.drive={samples,maxSlipStraight,ladderOpenShare:+ladderOpen.toFixed(3),boxLadderSeen};
  checks.noseFollowsMotion={pass:straight.length>=10&&maxSlipStraight<=20,maxSlipStraight,straightSamples:straight.length};
  const hasRoofLadder=s.renderMetrics.truck.cannonFaces>1; // the v7 pumper carries no roof ladder piece: its empty aim pivot is not a ladder
  checks.roofLadderStowedWhileDriving={pass:!hasRoofLadder||ladderOpen<=.02,ladderOpenShare:ladderOpen,applies:hasRoofLadder};
  checks.boxLadderHiddenWhileDriving={pass:!boxLadderSeen};
  // ---- 2. sound: water jet while spraying, fire roar while flames burn (synthesized; by ear only on the phone) ---------------------
  const spray=await center('#shoot');await touch('touchStart',spray);await tick(700);s=await snap();
  // ---- 2b. water gauge (Roy, 11/11): no word inside the water button; a bar with percent that turns orange/red as the tank empties ------
  const gaugeBefore=await page.evaluate(()=>{const g=document.querySelector('.fire-water-gauge');if(!g)return null;const r=g.getBoundingClientRect();const overlaps=[...document.querySelectorAll('.fire-coach,.fire-hud,.fire-counter,.game-controls button,.game-header button')].filter(o=>{const b=o.getBoundingClientRect();return b.width>0&&b.x<r.right&&b.right>r.x&&b.y<r.bottom&&b.bottom>r.y;}).map(o=>o.className||o.id);return {percent:Number(g.dataset.percent),level:g.dataset.level,text:g.textContent.trim(),box:{x:r.x,y:r.y,w:r.width,h:r.height},visible:r.width>0&&r.height>0&&getComputedStyle(g).visibility!=='hidden',onTop:overlaps.length===0,overlaps};});
  // holding the hose drains the pump too; a child releases and presses again (the coach says so), so spray in bursts until the tank is low
  await touch('touchEnd');for(let cycle=0;cycle<5;cycle++){await tick(2200);await touch('touchStart',spray);for(let i=0;i<30;i++)await tick(100);await touch('touchEnd');}await touch('touchStart',spray);await tick(300);await shot('water-low');
  const gaugeLow=await page.evaluate(()=>{const g=document.querySelector('.fire-water-gauge');return g?{percent:Number(g.dataset.percent),level:g.dataset.level}:null;}),refillText=await page.locator('#fire-refill').evaluate(n=>n.textContent.trim()),low=await snap();
  await touch('touchEnd');await tick(32);
  const inside=b=>b&&b.x>=0&&b.y>=0&&b.x+b.w<=844&&b.y+b.h<=390;
  checks.waterGauge={pass:Boolean(gaugeBefore?.visible&&gaugeBefore.onTop&&inside(gaugeBefore.box)&&gaugeBefore.text.includes('%')&&gaugeLow&&gaugeLow.percent<gaugeBefore.percent&&gaugeLow.percent===Math.round(100*low.water/low.maxWater)&&['low','critical'].includes(gaugeLow.level)&&refillText===''),before:gaugeBefore,low:gaugeLow,modelPercent:Math.round(100*low.water/low.maxWater),refillButtonText:refillText};
  const loops=s.audio.loops||{};checks.waterAndFireSound={pass:s.audio.state==='running'&&(loops.jet?.gain>0||loops.spray?.gain>0)&&loops.fire?.gain>0&&s.spraying,state:s.audio.state,jet:loops.jet?.gain??null,spray:loops.spray?.gain??null,fire:loops.fire?.gain??null,played:s.audio.played};
  await exit();
  // ---- 3. rescue at stage 3: tap the person, the truck drives there, one tap on the ladder button rescues ----------------------------
  s=await start(3);if(!s.rescues.length)throw Error('stage 3 has no rescue');
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,r=m.rescues[0],f=m.flames[r.fireIndex];f.heat=0;f.warning=0;}); // the window is already cool: the rescue control is what is under test
  await tick(100);s=await snap();const inView=p=>p&&p.x>=0&&p.x<=844&&p.y>=0&&p.y<=390;let point=inView(s.rescueScreens[0])?s.rescueScreens[0]:s.indicators.find(a=>a.kind==='rescue');if(!point)throw Error('no rescue marker on screen');
  await tapAt(point.x,point.y);await tick(100);s=await snap();rec.navigation={activeAfterTap:s.navigation.active,kind:s.navigation.kind};
  let near=false;for(let i=0;i<400;i++){await tick(100);s=await snap();if(s.rescues[0].near&&!s.truck.driving){near=true;break;}}
  checks.tapNavigatesToPerson={pass:near,navigationActive:rec.navigation.activeAfterTap,distance:+Math.hypot(s.truck.x-s.rescues[0].world[0],s.truck.z-s.rescues[0].world[2]).toFixed(2)};
  await shot('rescue-arrived');
  const ladderButton=await center('#pass');await tapAt(ladderButton.x,ladderButton.y,80); // a short tap, not a hold
  const during=[];let rescued=false,opened=false;for(let i=0;i<40;i++){await tick(100);s=await snap();const t=await truckPose();during.push({time:+s.time.toFixed(2),rescuing:s.rescuing,progress:+s.rescueProgress.toFixed(2),extension:+s.ladder.extension.toFixed(2),turretDeg:+deg(fold(t.turretYaw)).toFixed(1),armScale:t.arm?+t.arm.scale.toFixed(2):null,armPitchDeg:t.arm?+deg(t.arm.pitch).toFixed(1):null,boxLadder:s.renderMetrics.truck.boxLadderVisible});if(s.ladder.extension>0&&(t.arm?t.arm.scale>1.05||Math.abs(t.arm.pitch)>.05:s.renderMetrics.truck.boxLadderVisible))opened=true;if(i===8)await shot('rescue-ladder');if(s.rescues[0].rescued){rescued=true;break;}}
  const descent=[];for(let i=0;i<60;i++){await tick(100);const d=await snap();descent.push({time:+d.time.toFixed(2),descent:+(d.rescues[0].descent??0).toFixed(2),extension:+d.ladder.extension.toFixed(2),boxLadder:d.renderMetrics.truck.boxLadderVisible});if(d.rescues[0].descent>=1&&i>=8)break;} // the person climbs down for descentSeconds, then the ladder folds back
  for(let i=0;i<15;i++)await tick(100); // the fold-back eases over about a second
  const after=await truckPose(),afterSnap=await snap();rec.descent=descent;
  rec.rescue={during,rescued,opened,afterTurretDeg:+deg(fold(after.turretYaw)).toFixed(1),afterArmScale:after.arm?+after.arm.scale.toFixed(2):null,afterBoxLadder:afterSnap.renderMetrics.truck.boxLadderVisible};
  checks.singleTapRescues={pass:rescued,seconds:rescued?+(s.time-during[0].time).toFixed(2):null};
  checks.ladderOpensOnlyDuringRescue={pass:opened&&(after.arm?rec.rescue.afterTurretDeg<=3&&after.arm.scale<=1.01:true)&&!afterSnap.renderMetrics.truck.boxLadderVisible,opened,after:{turretDeg:rec.rescue.afterTurretDeg,armScale:rec.rescue.afterArmScale,boxLadder:rec.rescue.afterBoxLadder}};
  await shot('rescue-done');await exit();
 }catch(e){rec.error=e.stack||String(e);checks.suite={pass:false,error:String(e)};}
 finally{await context.close();}
 rec.errors=errors;checks.noPageErrors={pass:errors.length===0,errors};
 const failed=Object.entries(checks).filter(([,c])=>!c.pass).map(([k])=>k);rec.failed=failed;
 if(MODE==='after'){if(failed.length){failures++;console.error('final-fire FAILED',variant.name,failed);}else console.log('final-fire verified',variant.name);}
 else{ // the old behaviour must be reproduced: the pumper drives sideways; the Meshy roof ladder turns while driving; a tap alone does not rescue
  const expected=variant.name==='pumper-v20'?['noseFollowsMotion','singleTapRescues','waterGauge']:['roofLadderStowedWhileDriving','singleTapRescues','waterGauge'];
  const missing=expected.filter(k=>!failed.includes(k));rec.expectedFailures=expected;rec.notReproduced=missing;
  if(missing.length||checks.suite||errors.length){failures++;console.error('final-fire BEFORE: old fault not reproduced',variant.name,missing,checks.suite?.error||'');}else console.log('final-fire before: old faults reproduced',variant.name,failed);
 }
}
await writeFile(directory+`fire-verification-${MODE}.json`,JSON.stringify({mode:MODE,browser:'Chromium / SwiftShader, hasTouch + isMobile, 844x390',physicalPhone:false,reports},null,1)+'\n');
await browser.close();await server.close();
if(failures){console.error('final-fire:',failures,'variant(s) failed');process.exit(1);}
