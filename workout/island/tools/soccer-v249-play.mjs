/** Soccer v24.9 evidence: a 20-second real-touch sequence (844x390, hasTouch, CDP touches, stepped clock), one screenshot a game second and during every hold.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/soccer-v249-play.mjs <outDir> [--tag=a] [--seconds=22] [--stage=4] [--query=soccerV249=0] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ISLAND_ROOT||new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const {createTouchBot,controlLayout,mulberry}=await import(root+'/tools/soccer-v23-touch.mjs');
const {openFull}=await import(root+'/tools/soccer-11v11-touch.mjs');
const args=process.argv.slice(2),out=path.resolve(args[0]);const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
const query=opt('query',''),tag=opt('tag','a'),stage=Number(opt('stage',4)),seconds=Number(opt('seconds',20)),every=Number(opt('every',1)),frameMs=33;
await mkdir(out,{recursive:true});
const h=await openFull({query,stage});const layout=await controlLayout(h),bot=createTouchBot({layout,rng:mulberry(11),switchEvery:6,airEvery:.6,pitchHalf:52.5,pitchWide:34});
const read=()=>{const session=window.__island.games.current?.session;if(!session)return null;const model=session.debug.model,view=session.debug.view,s=model.getState(),b=s.ball;
 return {phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),half:s.half,score:[...s.score],restart:s.restart?{type:s.restart.type,team:s.restart.team,player:s.restart.player}:null,
 ball:{x:b.x,y:b.y,z:b.z,vx:b.vx,vz:b.vz,owner:b.owner,flight:b.flight?1:0},players:s.players.map(p=>({x:p.x,z:p.z,team:p.team})),hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),result:Boolean(model.result),air:{prompt:'',slot:'',armed:''}};};
let next=0,n=0,last,holdShots=0;const log=[];
for(let i=0;i<Math.ceil(seconds*1000/frameMs)*3;i++){await h.page.clock.runFor(frameMs);const f=await h.page.evaluate(read);if(!f)break;last=f;
 const holdShot=(f.hold||f.phase!=='playing')&&i%25===0&&holdShots<14;
 if(f.elapsed>=next||holdShot){if(holdShot&&f.elapsed<next)holdShots++;else next=f.elapsed+every;const name=`${tag}-${String(n++).padStart(2,'0')}.jpg`;try{await h.page.screenshot({path:path.join(out,name),type:'jpeg',quality:70,timeout:120000});}catch(e){}log.push({name,t:f.elapsed,phase:f.phase,score:f.score,hold:f.hold,restart:f.restart?.type});process.stderr.write(name+' t='+f.elapsed+' '+f.phase+'\n');}
 await bot.step(f,h.touch,frameMs/1000);if(f.elapsed>=seconds||f.result)break;}
await writeFile(path.join(out,tag+'.json'),JSON.stringify({log,errors:h.errors,last},null,1));await h.close();
