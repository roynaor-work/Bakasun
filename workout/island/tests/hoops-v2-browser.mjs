// V2 presentation acceptance: real island UI, shipped HTTP CSP and monitored workers.
// This proves 35 available finite clips and the pictured engine actions, not that
// every clip has naturally occurred in a single match. Run only after GPU quiet.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),island=path.join(repo,'workout/island');
assert.ok(process.env.HOOPS_V2_OUT&&path.isAbsolute(process.env.HOOPS_V2_OUT),'Set HOOPS_V2_OUT to an absolute external output directory');
const out=path.resolve(process.env.HOOPS_V2_OUT),relative=path.relative(repo,out);
assert.ok(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'V2 evidence belongs outside the repository');
await mkdir(out,{recursive:true});
const json=async p=>JSON.parse(await readFile(path.join(island,p),'utf8'));
const manifest=await json('design/motion2/hoops/manifest.json'),baseMotion=await json('design/motion/hoops.json'),lod=await json('design/hoops/lod/hoops-player-v2-provenance.json');
assert.equal(manifest.clips.length,25);assert.equal(Object.keys(baseMotion.states).length,10);
const expectedClips=[...Object.keys(baseMotion.states),...manifest.clips.map(c=>c.clip)].sort();assert.equal(new Set(expectedClips).size,35);
for(const entry of manifest.clips){const data=await json('design/motion2/hoops/'+entry.file);assert.ok(data.states?.[entry.clip],entry.file+' must contain its declared authored state');}
const roleNames={PG:'פוינט גארד',SG:'שוטינג גארד',SF:'סמול פורוורד',PF:'פאוור פורוורד',C:'סנטר'};
const abilityNames={shooting:'קליעה',dunk:'הטבעה',rebound:'ריבאונד',defense:'הגנה',passing:'מסירה',speed:'מהירות'};
const server=await serveIsland('/workout/island/'),origin=new URL(server.url).origin;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const viewports=(process.env.HOOPS_VIEWPORTS||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const report={browser:browser.version(),renderer:'SwiftShader software WebGL',physicalPhone:false,availableClips:35,manifestClips:25,baseClips:10,shippedCsp:server.csp,viewports:[],passed:false};
let suiteError=null;
function installV2Fixture(){
 const session=()=>window.__island.games.current.session,d=session().debug,e=d.engine,drain=e.drainEvents.bind(e);
 const neutral=()=>({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null});
 const qa=window.__hoopsV2={events:[],neutral,base(){
  const d=session().debug,e=d.engine,S=e.debug.state,a=e.debug.api;d.hold=true;d.controls.cancel();while(d.controls.held.queued)d.controls.consume();
  S.phase='live';S.phaseT=0;S.pending=null;S.inbound=null;S.ft=null;S.autopilot=false;S.clock=60;S.shotClock=24;S.shotClockOn=true;S.stoppage=null;
  const home=a.onCourt(0),away=a.onCourt(1),side=a.side(0);
  for(const p of [...home,...away]){p.act=null;p.actT=0;p.act2=null;p.shot=null;p.move=null;p.fake=null;p.air=-1;p.jumpH=0;p.jumpQueue=null;p.stumble=0;p.energy=.95;p.sprinting=false;p.think=100000;p.goal=null;p.goalSpeed=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};p.vx=p.vz=0;p.paintT=0;for(const key in p.cd)p.cd[key]=0;}
  home.forEach((p,i)=>e.debug.place(p.id,side*(4+i%2*2),(i-2)*1.8));away.forEach((p,i)=>e.debug.place(p.id,side*(9-i%2*2),(i-2)*1.8));
  const p=home.find(p=>p.pos==='PG')||home[0];e.debug.place(p.id,side*4,0);e.debug.give(p.id);S.controlled=p.id;S.frontcourtSet=true;S.lastPossessionTick=S.tick;d.step(1,neutral());qa.events.length=0;qa.selected=p.id;return {id:p.id,side};
 },start(kind){
  const selected=this.base(),d=session().debug,e=d.engine,S=e.debug.state,a=e.debug.api,home=a.onCourt(0),side=selected.side;let p=a.byId(selected.id),expected,started;
  if(kind==='pass_chest'||kind==='pass_overhead'){
   const target=home.find(q=>q.id!==p.id);e.debug.place(p.id,side*2,0);e.debug.place(target.id,side*(kind==='pass_overhead'?12:6),.5);for(const q of a.onCourt(1))e.debug.place(q.id,-side*10,q.z);
   started=a.startPass(p,target,kind==='pass_overhead'?'lob':'chest');d.step(Math.ceil((a.C.pass.windup+.045)*60),neutral());expected=kind;
  }else if(kind==='dunk'||kind==='layup'){
   if(kind==='dunk'){p=home.filter(q=>q.r.dunk>=a.C.shot.dunkMinRating).sort((x,y)=>y.r.dunk-x.r.dunk)[0];if(!p)throw Error('The actual starting five has no dunk-eligible athlete');}
   for(const q of a.onCourt(1))e.debug.place(q.id,-side*10,q.z);
   e.debug.place(p.id,side*(e.court.rimX-1.2),kind==='layup'?.35:0);e.debug.give(p.id);S.controlled=p.id;p.vx=kind==='dunk'?side*3.5:0;p.vz=0;started=a.startShot(p,true);expected=kind==='dunk'?'dunk':'layup_right';
   const frames=Math.max(1,Math.floor((p.shot.releaseAt-.025)*60));d.step(frames,neutral());
  }else if(kind==='shot_fake'){d.step(1,{...neutral(),fakePress:true});started=p.act==='fake';d.step(11,neutral());expected='shot_fake';}
  else throw Error('Unknown V2 action fixture');
  qa.selected=p.id;const snapshot=e.snapshot(),av=d.view.avatars.get(p.id);
  return {kind,started,expected,playerId:p.id,engineAct:p.act,shotType:p.shot?.type||null,ballState:snapshot.ball.state,owner:snapshot.ball.owner,motion:av.motionState,motionTime:av.motionTime,events:qa.events.map(e=>({...e}))};
 }};
 e.drainEvents=()=>{const events=drain();qa.events.push(...events.map(e=>({...e})));return events;};
}
try{
 for(const viewport of viewports){
  const tag=`${viewport.width}x${viewport.height}`,row={...viewport,checks:[],actions:[],screenshots:[]},context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(120000);
  const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
  const errors=[],httpErrors=[],outside=[],requested=new Set();
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
  page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)){if(url.origin!==origin)outside.push(url.href);requested.add(url.pathname);}});
  page.on('response',response=>{if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});
  await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
  const check=name=>{row.checks.push(name);console.log(tag,'ok',name);};
  const photo=async name=>{await page.evaluate(()=>{const d=window.__island.games.current.session.debug;d.hold=true;d.render();});await page.waitForTimeout(150);const file=tag+'-'+name+'.png';await page.screenshot({path:path.join(out,file),timeout:120000,animations:'disabled'});row.screenshots.push(file);};
  let rowError=null;
  try{
   await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:240000});await page.locator('[data-action=avatar-start]').click();
   const placed=await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;return false;});assert.ok(placed);
   await page.evaluate(()=>window.__island.games.stages('streetSlam'));
   const menu=await page.evaluate(()=>{const summary=window.__island.engine.hoops.summary();return {names:[...document.querySelectorAll('.hoops-start-team strong')].map(e=>e.textContent.trim()),teams:summary.teams.map(t=>({id:t.id,name:t.name})),cards:summary.cards.map(c=>({id:c.id,name:c.name,pos:c.pos,abilities:c.abilities})),visible:[...document.querySelectorAll('.hoops-start-team strong')].every(e=>!!e.getClientRects().length)};});
   assert.equal(menu.names.length,2);assert.equal(menu.visible,true);for(const name of menu.names){assert.ok(menu.teams.some(t=>t.name===name));assert.ok(/[\u0590-\u05ff]/.test(name)&&name.length>2,'full fictional team name is shown');}
   const details=page.locator('[data-hoops-more]');if(await details.count())await details.locator(':scope > summary').click();
   const cards=await page.locator('.hoops-club-card').evaluateAll(nodes=>nodes.map(node=>{const line=node.querySelector('.hoops-club-abilities'),style=line&&getComputedStyle(line),r=node.getBoundingClientRect(),b=line?.getBoundingClientRect();return {id:node.dataset.id,name:node.querySelector('.hoops-club-name')?.textContent,pos:node.querySelector('.hoops-club-pos')?.textContent,aria:node.getAttribute('aria-label'),title:node.title,visible:!!node.getClientRects().length,abilitiesText:line?.textContent,abilitiesVisible:!!line?.getClientRects().length&&style.visibility!=='hidden'&&Number(style.opacity)>0,abilitiesInsideCard:!!b&&b.x>=r.x-.5&&b.y>=r.y-.5&&b.right<=r.right+.5&&b.bottom<=r.bottom+.5};}));
   assert.equal(cards.length,menu.cards.length);assert.ok(cards.length>=5);for(const card of cards){const original=menu.cards.find(c=>c.id===card.id);assert.ok(original);assert.equal(card.visible,true);assert.equal(card.name,original.name);assert.equal(card.pos,roleNames[original.pos]);assert.equal(card.abilitiesVisible,true,'six abilities are actual visible text');assert.equal(card.abilitiesInsideCard,true,'visible abilities fit their player card');assert.deepEqual(Object.keys(original.abilities).sort(),Object.keys(abilityNames).sort());for(const [key,label]of Object.entries(abilityNames)){assert.ok(Number.isFinite(original.abilities[key])&&original.abilities[key]>=0&&original.abilities[key]<=100);assert.ok(card.abilitiesText.includes(label+' '+original.abilities[key])&&card.aria.includes(label+' '+original.abilities[key])&&card.title.includes(label+' '+original.abilities[key]),label+' visible and accessible summary');}}
   await page.locator('.hoops-club-card').first().scrollIntoViewIfNeeded();const clubImage=tag+'-club-abilities.png';await page.screenshot({path:path.join(out,clubImage),timeout:120000,animations:'disabled'});row.screenshots.push(clubImage);
   row.menu={...menu,cardsEvidence:cards};check('full fictional team names, full position names and all six visible and accessible abilities fit their real club cards');
   if(await details.count())await details.locator(':scope > summary').click();await page.locator('[data-action=hoops-play-next]').click();if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session?.snapshot;return s?.error||s?.renderMetrics?.calls>0&&s.renderMetrics.players===10;},null,{timeout:300000});
   const error=await page.evaluate(()=>window.__island.games.current.session.snapshot.error);assert.equal(error,null);await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});await page.evaluate(installV2Fixture);await page.evaluate(()=>window.__hoopsV2.base());
   const athleteProof=await page.evaluate(async()=>{
    const THREE=await import(new URL('vendor/three.module.js',location.href).href),d=window.__island.games.current.session.debug,snapshot=d.engine.snapshot();
    const rows=[...d.view.avatars.values()].filter(a=>a.root.visible).map(a=>{const meshes=[];a.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});const mesh=meshes[0],box=mesh.geometry.boundingBox||new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position),hand=name=>{const p=a.hands[name].getWorldPosition(new THREE.Vector3());return p.toArray();};return {id:a.card.id,version:a.root.userData.characterVersion,kind:a.kind,meshes:meshes.length,bones:mesh.skeleton.bones.map(b=>b.name),triangles:mesh.geometry.index.count/3,height:(box.max.y-box.min.y)*a.root.scale.y,expectedHeight:a.card.ratings.height/100,hands:[hand('r'),hand('l')],clips:Object.keys(a.actions).sort()};});
    const first=[...d.view.avatars.values()].find(a=>a.root.visible),clips=Object.values(first.actions).map(action=>{const clip=action.getClip();let finite=true,normalized=true,quaternionTracks=0;for(const track of clip.tracks){for(const value of track.values)if(!Number.isFinite(value))finite=false;if(track.name.endsWith('.quaternion')){quaternionTracks++;for(let i=0;i<track.values.length;i+=4)if(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)>.00003)normalized=false;}}return {name:clip.name,duration:clip.duration,tracks:clip.tracks.length,quaternionTracks,finite,normalized};});
    const venue=d.view.scene.getObjectByName('design-basketball-arena-v2'),parts=['roof','beams','scoreboard'].map(name=>{const m=venue?.getObjectByName(name),c=m?.geometry?.attributes.color;return {name,exists:!!m,basic:!!m?.material?.isMeshBasicMaterial,vertexColors:!!m?.material?.vertexColors,colorCount:c?.count||0,finite:!!c&&Array.from(c.array).every(Number.isFinite),variance:c?Math.max(...c.array)-Math.min(...c.array):0};});
    return {players:snapshot.players,athletes:rows,clips,venue:!!venue,parts,metrics:d.view.metrics(),liveScoreboard:!!d.view.scene.getObjectByName('design-live-scoreboard'),hangingScoreboard:!!d.view.scene.getObjectByName('live-hanging-scoreboard')};
   });
   assert.equal(athleteProof.players.length,10);assert.equal(athleteProof.players.filter(p=>p.team===0).length,5);assert.equal(athleteProof.players.filter(p=>p.team===1).length,5);assert.equal(athleteProof.athletes.length,10);
   for(const a of athleteProof.athletes){assert.equal(a.version,2);assert.equal(a.kind,'characters2');assert.equal(a.meshes,1);assert.equal(a.bones.length,20);assert.equal(a.triangles,lod.triangles);assert.ok(a.triangles>0&&a.triangles<=6500);assert.ok(Math.abs(a.height-a.expectedHeight)<.001);assert.ok(a.height>=1.65&&a.height<=2.4);assert.ok(a.hands.flat().every(Number.isFinite));assert.deepEqual(a.clips,expectedClips);}
   assert.equal(athleteProof.metrics.characterVersion,2);assert.equal(athleteProof.metrics.clipCount,35);assert.equal(athleteProof.metrics.arenaVersion,2);assert.equal(athleteProof.metrics.feel.authored,true);
   assert.equal(athleteProof.metrics.baked.length,3);assert.deepEqual(athleteProof.metrics.baked.map(part=>part.name).sort(),['beams','roof','scoreboard']);for(const part of athleteProof.metrics.baked){assert.equal(part.applied,true);assert.ok(part.total>0);assert.equal(part.matched,part.total);}
   assert.equal(athleteProof.clips.length,35);for(const c of athleteProof.clips){assert.ok(c.duration>0);assert.equal(c.finite,true,c.name);assert.equal(c.normalized,true,c.name);assert.equal(c.quaternionTracks,20,c.name);}
   for(const entry of manifest.clips)assert.ok(requested.has(new URL('design/motion2/hoops/'+entry.file,server.url).pathname),'the real app requested '+entry.file);
   assert.ok(requested.has(new URL('design/hoops/lod/hoops-player-v2-lod.glb',server.url).pathname));row.athletes=athleteProof;check('the live 5-on-5 uses the actual v2 LOD with 20 bones and 35 finite available clips; all 25 expansion files requested');
   assert.equal(athleteProof.venue,true);assert.equal(athleteProof.liveScoreboard,true);assert.equal(athleteProof.hangingScoreboard,true);for(const p of athleteProof.parts){assert.equal(p.exists,true);assert.equal(p.basic,true);assert.equal(p.vertexColors,true);assert.equal(p.finite,true);assert.ok(p.colorCount>0&&p.variance>0);}
   for(const file of ['design/models2/basketball-arena.glb','design/baked/basketball-arena-ao.webp','design/baked/basketball-arena-light.webp'])assert.ok(requested.has(new URL(file,server.url).pathname),'real arena bake resource requested: '+file);
   row.bakeEvidence='Real resources requested, all vertices of the roof, beams and scoreboard matched the authored bake, and the live static materials use those vertex colors.';check('models2 arena, live scoreboard faces and complete authored bake transfer are connected');
   const labels=await page.evaluate(()=>{const screen=document.querySelector('.game-screen[data-game=streetSlam]'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};},visible=e=>!e.hidden&&e.getClientRects().length;return {labels:[...screen.querySelectorAll('.hoops-role-label')].map(e=>({id:e.dataset.playerId,text:e.textContent,dir:e.dir,aria:e.getAttribute('aria-label'),visible:!!visible(e),rect:rect(e)})),hud:[...screen.querySelectorAll('.hoops-bug,.game-header button,.hoops-kit-trigger,[data-hoops-control]')].filter(visible).map(rect)};});
   assert.equal(labels.labels.length,10);let visibleLabels=0;const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
   for(const label of labels.labels){const p=athleteProof.players.find(p=>p.id===label.id);assert.ok(p);assert.equal(label.text,p.pos);assert.equal(label.dir,'ltr');assert.equal(label.aria,roleNames[p.pos]);assert.equal(p.positionName,roleNames[p.pos]);assert.deepEqual(Object.keys(p.abilities).sort(),Object.keys(abilityNames).sort());if(!label.visible)continue;visibleLabels++;assert.ok(label.rect.x>=0&&label.rect.y>=0&&label.rect.right<=viewport.width&&label.rect.bottom<=viewport.height);for(const h of labels.hud)assert.ok(!overlap(label.rect,h),'readable position label avoids live HUD');}
   assert.ok(visibleLabels>0);const shown=labels.labels.filter(l=>l.visible);for(let i=0;i<shown.length;i++)for(let j=0;j<i;j++)assert.ok(!overlap(shown[i].rect,shown[j].rect),'position labels do not collide');row.roleLabels=labels;check('role labels use LTR abbreviations with full Hebrew accessible names, viewport bounds and no label/HUD collisions');
   await photo('5-on-5-roles');
   for(const kind of ['pass_chest','pass_overhead','dunk','layup','shot_fake']){
    const action=await page.evaluate(kind=>window.__hoopsV2.start(kind),kind);assert.equal(action.started,true,kind);assert.equal(action.motion,action.expected,JSON.stringify(action));
    if(kind.startsWith('pass_')){assert.equal(action.engineAct,'pass');assert.ok(action.events.some(e=>e.type==='pass'&&e.kind===(kind==='pass_overhead'?'lob':'chest')));}
    if(kind==='shot_fake'){assert.equal(action.engineAct,'fake');assert.equal(action.ballState,'held');assert.equal(action.owner,action.playerId);assert.equal(action.events.some(e=>e.type==='release'),false);}
    row.actions.push(action);await photo(kind);check(kind+' is selected by the engine action and visibly uses its authored clip');
   }
   const tick=await page.evaluate(()=>{const s=window.__island.games.current.session;s.debug.hold=false;return s.snapshot.tick;});await page.waitForFunction(t=>window.__island.games.current.session.snapshot.tick>t,tick,{timeout:30000});
   const paused=await page.evaluate(()=>{const s=window.__island.games.current.session;s.setPaused(true);return {tick:s.snapshot.tick,time:s.debug.view.avatars.get(s.snapshot.controlled).motionTime};});await page.waitForTimeout(350);const stopped=await page.evaluate(()=>{const s=window.__island.games.current.session;return {tick:s.snapshot.tick,time:s.debug.view.avatars.get(s.snapshot.controlled).motionTime};});assert.deepEqual(stopped,paused);await page.evaluate(()=>{const s=window.__island.games.current.session;s.setPaused(false);s.debug.hold=true;});check('native RAF advances before pause; pause freezes both engine tick and v2 clip time');
   await page.evaluate(()=>window.__island.games.cleanup());assert.equal(await page.evaluate(()=>!!window.__island.games.current),false);check('leaving the real game releases the v2 session');
   await csp.assertClean();assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(outside,[]);row.errors=errors;row.httpErrors=httpErrors;row.externalRequests=outside;row.passed=true;
  }catch(error){rowError=error;suiteError=error;row.passed=false;row.error=error.stack||error.message;row.errors=errors;row.httpErrors=httpErrors;row.externalRequests=outside;try{await page.screenshot({path:path.join(out,tag+'-failure.png'),timeout:30000});}catch{}throw error;}
  finally{
   let auditError=null;try{await csp.assertClean();}catch(error){auditError=error;row.passed=false;row.cspFailure=error.stack||error.message;}
   try{await context.close();await csp.assertClean();}catch(error){auditError??=error;row.passed=false;row.cspAfterCloseFailure=error.stack||error.message;}
   row.csp=csp.snapshot();report.viewports.push(row);try{await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));}finally{await csp.dispose();}
   if(!rowError&&auditError)throw auditError;
  }
 }
 report.passed=true;await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('hoops v2 browser: all requested viewports passed');
}finally{try{await browser.close();}finally{await server.close();}}
