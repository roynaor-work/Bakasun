// Before/after frames of the AI keeper's distribution, 844x390. Run: ISLAND_CHROME=... node shots.mjs
import path from 'node:path';import {fileURLToPath} from 'node:url';import {mkdir} from 'node:fs/promises';
import {serveIsland,islandChromium} from '../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart} from '../../tests/shell-ready.mjs';
const out=path.dirname(fileURLToPath(import.meta.url));await mkdir(out,{recursive:true});
const server=await serveIsland('/workout/island/'),browser=await(await islandChromium()).launch({executablePath:process.env.ISLAND_CHROME||process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={};
const only=process.env.SCEN;
for(const kind of ['throw','punt'])for(const mode of ['before','after']){if(only&&only!==kind+'-'+mode)continue;
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
 await page.clock.install();await page.goto(server.url+'?dev=1'+(mode==='before'?'&keeperKick=0':''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
 await page.evaluate(()=>{const {engine:e,ui}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');e.buildReadyPlot(lot.id);}e.setSoccerDifficulty('normal');e.save();ui.closeModal();window.__island.games.start('soccer',undefined,1);});
 if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
 await waitForGameStart(page);await page.waitForLoadState('networkidle');await page.clock.runFor(1200);
 await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');
 await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+10000));
 const snap=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
 await page.evaluate(kind=>{const q=window.__island.games.current.session,m=q.debug.model,s=m.getState(),c=window.__island.data.config.minigames.soccer,hx=c.pitch.length/2;m.clearInput();
  Object.assign(s,{phase:'playing',phaseTime:0,attackDir:1,controlled:0,switchCooldown:100,passTarget:null,restart:null,mode:'attack',idle:0});
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.45,z:(p.id%3-1)*8,vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:0,slideTime:0,kickTime:0,hands:false,restartMotion:null,distribution:null});
  const k=s.players[2];Object.assign(k,{x:-hx+3,z:0,cooldown:0,hands:true,hold:0,think:0});if(kind==='throw'){s.players[1].x=-hx+12;s.players[1].z=7;}else{for(const p of s.players)if(p.team===0&&p.role!=='keeper'){p.x=hx*.3;}}
  Object.assign(s.ball,{owner:2,x:k.x+c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2,flight:null});q.debug.poseCamera(2);},kind);
 const frames=[];let released=false;
 const sample=()=>page.evaluate(kind=>{const q=window.__island.games.current.session,s=q.debug.model.getState(),ch=q.debug.view.characters[2],k=s.players[2],bone=ch.root.getObjectByName(kind==='punt'?'RightFoot':'RightHand');const w=bone?bone.getWorldPosition(new bone.position.constructor()):null;return {t:s.elapsed,x:ch.pivot.position.x,z:ch.pivot.position.z,yaw:ch.yaw,simx:k.x,simz:k.z,bx:s.ball.vx,bz:s.ball.vz,flight:s.ball.flight?{x:s.ball.flight.x,z:s.ball.flight.z}:null,owner:s.ball.owner,m:k.restartMotion?{e:k.restartMotion.elapsed,c:k.restartMotion.contact}:null,eff:w&&[w.x,w.y,w.z]};},kind);
 for(let i=0;i<400&&!released;i++){await page.clock.runFor(17);const s=await snap();if(s.ball.owner!==2&&s.players[2].restartMotion)released=true;}
 for(let i=0;i<60;i++){await page.clock.runFor(17);const f=await sample();frames.push(f);if(!f.m&&frames.length>30)break;if(i===0)await page.screenshot({path:path.join(out,`${kind}-${mode}-844x390-contact.png`)});if(i===12)await page.screenshot({path:path.join(out,`${kind}-${mode}-844x390-plus200.png`)});if(i===26)await page.screenshot({path:path.join(out,`${kind}-${mode}-844x390-plus450.png`)});}
 report[kind+'-'+mode]=frames;
 await context.close();
}
await browser.close();await server.close();
import {writeFile} from 'node:fs/promises';await writeFile(path.join(out,`browser-frames${only?'-'+only:''}.json`),JSON.stringify(report));
