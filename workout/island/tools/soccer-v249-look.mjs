/** Soccer v24.9 evidence: player close-ups for the look review. The match runs under the touch bot; at four moments the debug pose camera frames the selected
 * player, the fastest rival, the fastest team-mate and a keeper.
 * Usage: ISLAND_PLAYWRIGHT=... node workout/island/tools/soccer-v249-look.mjs <outDir> [--tag=a] [--query=soccerLook=0] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ISLAND_ROOT||new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const {createTouchBot,controlLayout,mulberry}=await import(root+'/tools/soccer-v23-touch.mjs');
const {openFull}=await import(root+'/tools/soccer-11v11-touch.mjs');
const args=process.argv.slice(2),out=path.resolve(args[0]);const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
const query=opt('query',''),tag=opt('tag','a'),stage=Number(opt('stage',4)),frameMs=33,wide=opt('wide','1')==='1';
await mkdir(out,{recursive:true});
const h=await openFull({query,stage});const layout=await controlLayout(h),bot=createTouchBot({layout,rng:mulberry(11),switchEvery:6,airEvery:.6,pitchHalf:52.5,pitchWide:34});
const read=()=>{const session=window.__island.games.current?.session;if(!session)return null;const model=session.debug.model,view=session.debug.view,s=model.getState(),b=s.ball;
 return {phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),half:s.half,score:[...s.score],restart:s.restart?{type:s.restart.type,team:s.restart.team,player:s.restart.player}:null,
 ball:{x:b.x,y:b.y,z:b.z,vx:b.vx,vz:b.vz,owner:b.owner,flight:b.flight?1:0},players:s.players.map(p=>({x:p.x,z:p.z,team:p.team,role:p.role,v:Math.hypot(p.vx,p.vz)})),hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),result:Boolean(model.result),air:{prompt:'',slot:'',armed:''}};};
const moments=[1.2,2.6,4.2,6],log=[];let mi=0,wideAt=0,wn=0;
for(let i=0;i<4000;i++){await h.page.clock.runFor(frameMs);const f=await h.page.evaluate(read);if(!f)break;
 if(wide&&f.elapsed>=wideAt&&f.phase==='playing'){wideAt=f.elapsed+1.5;const name=`${tag}-wide-${wn++}.jpg`;await h.page.screenshot({path:path.join(out,name),type:'jpeg',quality:80,timeout:120000}).catch(()=>{});process.stderr.write(name+' t='+f.elapsed+'\n');}
 if(mi<moments.length&&f.elapsed>=moments[mi]){
  // the controlled player, the fastest rival, the fastest mate that is not controlled, a keeper
  const pick=(fn)=>f.players.map((p,id)=>({...p,id})).filter(fn).sort((a,b)=>b.v-a.v)[0]?.id;
  const ids={me:f.controlled,rival:pick(p=>p.team===1&&p.role!=='keeper'),mate:pick(p=>p.team===0&&p.role!=='keeper'&&p.id!==f.controlled),keeper:pick(p=>p.role==='keeper'&&p.team===(mi%2))};
  for(const [k,id] of Object.entries(ids)){if(id==null)continue;await h.page.evaluate(id=>{const d=window.__island.games.current.session.debug;d.poseCamera(id);d.view.render(d.model.renderState?.()??d.model.getState(),0);},id);
   const name=`${tag}-m${mi}-${k}.jpg`;await h.page.screenshot({path:path.join(out,name),type:'jpeg',quality:88,timeout:120000}).catch(()=>{});log.push({name,t:f.elapsed,id,v:f.players[id].v});process.stderr.write(name+'\n');}
  await h.page.evaluate(()=>window.__island.games.current.session.debug.poseCamera(null));mi++;if(mi>=moments.length&&(!wide||f.elapsed>8))break;}
 await bot.step(f,h.touch,frameMs/1000);if(f.elapsed>9)break;}
await writeFile(path.join(out,tag+'.json'),JSON.stringify({log,errors:h.errors},null,1));await h.close();
