/** Soccer v25.0 real-touch proof (evidence only): Chromium + SwiftShader, 844x390, hasTouch + isMobile, the island entered through its menu,
 * CDP touches only (the floating stick, the real buttons, taps on the pitch), the page clock stepped one frame at a time. Each scenario
 * stages one moment on the live match (players and ball are placed through the dev handle, exactly as the unit tests place them), then
 * plays it with touches and saves frames:
 *   camera     the selected player's height on the screen in pixels (run again with --query=soccerV250=0 for the v24.9 number)
 *   tapPass    a tap on a team-mate: the pass to him;  tapSpace  a tap on open grass ahead: the ball into that space
 *   tapSwitch  a tap on a team-mate while the rival has the ball: he is selected
 *   freeKick   the child's free kick 24 m out: the wall, the dotted flight, the stick moves the target, the shot button sends it
 *   corner     the child's corner: the stick moves the ring in the box, the shot button crosses to it
 *   curl       the stick turned while the shot button is held: a curled shot
 *   rivalFreeKick  the rival's free kick: the child's team builds the wall
 *   defence    open play at stage 5 with the touch bot: a frame whenever a rival has the second-man job near the ball
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/soccer-v250-touch.mjs <outDir>
 *        [--scenarios=camera,tapPass,...] [--query=soccerV250=0] [--tag=a] [--stage=3] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.ISLAND_ROOT||new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const {createTouchBot,controlLayout,mulberry}=await import(root+'/tools/soccer-v23-touch.mjs');
const {openFull}=await import(root+'/tools/soccer-11v11-touch.mjs');
const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'soccer-v250-out');const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
const query=opt('query',''),tag=opt('tag','a'),stage=Number(opt('stage',3)),frameMs=33,wanted=opt('scenarios','camera,tapPass,tapSpace,tapSwitch,freeKick,corner,curl,rivalFreeKick,defence').split(',');
await mkdir(out,{recursive:true});
const report={query,stage,scenarios:{},errors:[]};

/** In-page: the state a viewer (and the bot) can see, and the events since the last read. */
function read(){
  const session=window.__island.games.current?.session;if(!session)return null;
  const model=session.debug.model,view=session.debug.view,s=model.getState(),P=window.__v250||(window.__v250={wrapped:null,events:[]});
  if(P.wrapped!==model){const drain=model.drainEvents.bind(model);model.drainEvents=()=>{const list=drain();for(const e of list)P.events.push({type:e.type,team:e.team??(e.player!=null?s.players[e.player]?.team:null),player:e.player??null,target:e.target??null,curl:e.curl??null,space:e.space??null,loft:e.loft??null,tap:e.tap??null,kind:e.kind??null,restart:e.restart??null,t:+s.elapsed.toFixed(2)});return list;};P.wrapped=model;}
  const b=s.ball,me=s.players[s.controlled],foot=view.screenPoint(me.x,0,me.z),head=view.screenPoint(me.x,1.75,me.z);
  return {phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),half:s.half,score:[...s.score],
    restart:s.restart?{type:s.restart.type,team:s.restart.team,player:s.restart.player,aim:s.restart.aim250?{...s.restart.aim250}:null,wall:s.restart.wall||null}:null,
    ball:{x:b.x,y:b.y,z:b.z,vx:b.vx,vz:b.vz,owner:b.owner,curve:b.curve||0,flight:b.flight?1:0},players:s.players.map(p=>({x:p.x,z:p.z,team:p.team,duty:p.duty||'',role:p.role})),
    hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),result:Boolean(model.result),events:P.events.splice(0),playerPixels:+(foot.y-head.y).toFixed(1),
    camera:session.snapshot.renderMetrics?.full?.camera||null,banner:document.querySelector('.soccer-phase-banner')?.textContent||'',feedback:document.querySelector('.soccer-action-feedback:not([hidden])')?.textContent||'',air:{prompt:'',slot:'',armed:''}};
}
/** In-page: stage a moment. Everyone but the named players is moved out of the way; the child's player gets the ball unless `owner` says otherwise. */
function stageMoment({me:[mx,mz]=[0,0],mates=[],rivals=[],owner='me',clear=true}){
  const m=window.__island.games.current.session.debug.model,s=m.getState(),d=s.attackDir,me=s.players[s.controlled];
  const field=t=>s.players.filter(p=>p.team===t&&p.role!=='keeper'&&p.id!==me.id);
  if(clear)for(const p of s.players){if(p.role==='keeper'||p.id===me.id)continue;p.x=d*(p.team===0?-30:44);p.z=((p.id%10)-4.5)*5.5;p.vx=p.vz=0;p.think=3;p.cooldown=1.5;}
  Object.assign(me,{x:d*mx,z:mz,vx:0,vz:0,fx:d,fz:0,cooldown:0,recover:0,slideTime:0});
  const used={mates:[],rivals:[]};
  field(0).slice(0,mates.length).forEach((p,i)=>{p.x=d*mates[i][0];p.z=mates[i][1];p.vx=d*(mates[i][2]||0);p.vz=0;used.mates.push(p.id);});
  field(1).slice(0,rivals.length).forEach((p,i)=>{p.x=d*rivals[i][0];p.z=rivals[i][1];p.vx=p.vz=0;p.think=3;p.cooldown=1.5;used.rivals.push(p.id);});
  const holder=owner==='me'?me:owner==='rival'?s.players[used.rivals[0]]:null;
  if(holder)Object.assign(s.ball,{x:holder.x+holder.fx*.45,z:holder.z,y:.11,vx:0,vz:0,vy:0,curve:0,owner:holder.id,lastTeam:holder.team,lastPlayer:holder.id,grace:0,flight:null,shot:null});
  s.passTarget=null;return {...used,me:me.id};
}
const h=await openFull({query,stage});const layout=await controlLayout(h);const {page,touch}=h;
const run=async n=>{let f=null;for(let i=0;i<n;i++){await page.clock.runFor(frameMs);}f=await page.evaluate(read);return f;};
const shot=async name=>{const file=path.join(out,`${tag}-${name}.jpg`);try{await page.screenshot({path:file,type:'jpeg',quality:72,timeout:120000});}catch(e){report.errors.push('screenshot '+name+': '+e.message.split('\n')[0]);}process.stderr.write(`${tag} ${name}\n`);return file;};
const untilPlaying=async()=>{let f=await run(1);for(let i=0;i<400&&!(f.phase==='playing'&&!f.hold&&!f.replaying);i++)f=await run(2);return f;};
const screenOf=(x,y,z)=>page.evaluate(([x,y,z])=>{const v=window.__island.games.current.session.debug.view,r=document.querySelector('canvas.soccer-canvas').getBoundingClientRect(),q=v.screenPoint(x,y,z);return {x:q.x+r.left,y:q.y+r.top};},[x,y,z]);
const tap=async(x,y)=>{await touch.down(7,x,y);await touch.up(7);};
const STICK=1,BUTTON=2,pad=layout.pad,anchor={x:pad.x+pad.width*.4,y:pad.y+pad.height*.6};
const stick=async(wx,wz,dir)=>{if(!touch.held(STICK))await touch.down(STICK,anchor.x,anchor.y);const l=Math.hypot(wx,wz)||1;await touch.move(STICK,anchor.x+wx/l*dir*52,anchor.y+wz/l*dir*52);};
const centre=r=>[r.x+r.width/2,r.y+r.height/2];
const eventsOf=(list,type)=>list.filter(e=>e.type===type);
try{
  let f=await untilPlaying();f=await run(30);
  for(const name of wanted){
    const R=report.scenarios[name]={};f=await untilPlaying();const d=f.attackDir;
    if(name==='camera'){
      await page.evaluate(stageMoment,{me:[4,2],mates:[[14,-8],[10,9],[-6,-3]],rivals:[[12,1],[18,-5],[9,-11]]});
      await stick(1,0,d);f=await run(45);R.playerPixels=f.playerPixels;R.camera=f.camera;await shot('camera');await touch.up(STICK);
    }
    if(name==='tapPass'){
      const ids=await page.evaluate(stageMoment,{me:[2,3],mates:[[15,-9]],rivals:[[20,6]]});f=await run(40);
      const mate=f.players[ids.mates[0]],at=await screenOf(mate.x,.9,mate.z);R.mate=ids.mates[0];R.tapAt={x:Math.round(at.x),y:Math.round(at.y)};
      await shot('tap-pass-0-before');await tap(at.x,at.y);f=await run(1);const ev=[...f.events];await shot('tap-pass-1-tapped');f=await run(29);ev.push(...f.events);await shot('tap-pass-2-received');
      R.tapPass=eventsOf(ev,'tap-pass')[0]||null;R.pass=eventsOf(ev,'pass')[0]||eventsOf(ev,'loft')[0]||null;R.controlledAfter=f.controlled;R.ownerAfter=f.ball.owner;R.ok=Boolean(R.tapPass&&R.tapPass.target===R.mate&&f.controlled===R.mate);
    }
    if(name==='tapSpace'){
      const ids=await page.evaluate(stageMoment,{me:[0,4],mates:[[8,-10,5]],rivals:[[22,8]]});f=await run(30);
      const me=f.players[ids.me],at=await screenOf(me.x+d*20,0,-9);R.tapAt={x:Math.round(at.x),y:Math.round(at.y)};
      await shot('tap-space-0-before');await tap(at.x,at.y);f=await run(1);const ev=[...f.events];await shot('tap-space-1-tapped');f=await run(43);ev.push(...f.events);await shot('tap-space-2-run');
      R.tapPass=eventsOf(ev,'tap-pass')[0]||null;R.pass=eventsOf(ev,'pass')[0]||eventsOf(ev,'loft')[0]||null;R.feedback=f.feedback;R.ok=Boolean(R.tapPass?.space);
    }
    if(name==='tapSwitch'){
      const ids=await page.evaluate(stageMoment,{me:[0,-5],mates:[[-5,-10]],rivals:[[2,-2]],owner:'rival'});f=await run(6);
      const mate=f.players[ids.mates[0]],at=await screenOf(mate.x,.9,mate.z);R.before=f.controlled;R.mate=ids.mates[0];
      await shot('tap-switch-0-before');await tap(at.x,at.y);f=await run(2);R.after=f.controlled;R.switch=eventsOf(f.events,'switch')[0]||null;await shot('tap-switch-1-selected');R.ok=R.after===R.mate;
    }
    if(name==='freeKick'||name==='rivalFreeKick'){
      const team=name==='freeKick'?0:1,sx=team===0?d*30:-d*30;
      await page.evaluate(([team,x])=>{const m=window.__island.games.current.session.debug.model;m.restartAt('freeKick',team,x,team===0?6:-5);},[team,sx]);
      f=await run(2);for(let i=0;i<260&&f.phase!=='restartReady';i++)f=await run(2);
      R.restart=f.restart;R.banner=f.banner;R.wall=(f.restart?.wall||[]).map(id=>({id,x:+f.players[id].x.toFixed(2),z:+f.players[id].z.toFixed(2),team:f.players[id].team}));
      R.wallDistance=R.wall.map(w=>+Math.hypot(w.x-sx,w.z-(team===0?6:-5)).toFixed(2));await shot(name==='freeKick'?'free-kick-0-wall':'rival-free-kick-wall');
      if(team===0){
        const aim0=f.restart.aim.z;await stick(0,-1,d);f=await run(14);R.aimMoved=[+aim0.toFixed(2),+f.restart.aim.z.toFixed(2)];await shot('free-kick-1-aimed');await touch.up(STICK);
        const [bx,by]=centre(layout.shoot);await touch.down(BUTTON,bx,by);f=await run(13);await shot('free-kick-2-power');await touch.up(BUTTON);
        const ev=[];let peak=0,maxCurve=0;for(let i=0;i<70;i++){f=await run(1);ev.push(...f.events);peak=Math.max(peak,f.ball.y);maxCurve=Math.max(maxCurve,Math.abs(f.ball.curve));if(i===22||i===34)await shot('free-kick-'+(i===22?'3-flight':'4-flight'));if(f.phase==='goal'||eventsOf(ev,'parry').length||eventsOf(ev,'possession').length)break;}
        await shot('free-kick-5-end');R.shot=eventsOf(ev,'shot')[0]||null;R.peakHeight=+peak.toFixed(2);R.maxCurve=+maxCurve.toFixed(2);R.outcome=f.phase==='goal'?'goal':eventsOf(ev,'wall-block').length?'wall':eventsOf(ev,'parry').length?'parry':eventsOf(ev,'possession').length?'held':'other';R.score=f.score;R.ok=R.shot?.curl==='free'&&R.wall.length>=2;
      }else{R.ok=R.wall.length>=2&&R.wall.every(w=>w.team===0);f=await run(150);}
    }
    if(name==='corner'){
      await page.evaluate(d=>{const m=window.__island.games.current.session.debug.model;m.restartAt('corner',0,d*52,33);},d);
      f=await run(2);for(let i=0;i<260&&f.phase!=='restartReady';i++)f=await run(2);
      R.restart=f.restart;R.banner=f.banner;await shot('corner-0-ready');const aim0={...f.restart.aim};
      await stick(-1,.6,d);f=await run(12);R.aimMoved=[aim0,f.restart.aim];await shot('corner-1-aimed');await touch.up(STICK);
      const [bx,by]=centre(layout.shoot);await touch.down(BUTTON,bx,by);f=await run(5);await touch.up(BUTTON);
      const ev=[];for(let i=0;i<90;i++){f=await run(1);ev.push(...f.events);if(i===24)await shot('corner-2-cross');if(eventsOf(ev,'header').length||f.phase==='goal'||i>30&&eventsOf(ev,'possession').length)break;}
      await shot('corner-3-end');R.loft=eventsOf(ev,'loft')[0]||null;R.header=eventsOf(ev,'header').length;R.target=R.loft?{x:+(ev.find(e=>e.type==='loft')?.x??NaN)}:null;R.ok=Boolean(R.loft);
    }
    if(name==='curl'){
      await page.evaluate(stageMoment,{me:[26,9],mates:[[20,-12]],rivals:[[30,-14]]});f=await run(10);
      await stick(1,-.2,d);f=await run(8);const [bx,by]=centre(layout.shoot);await touch.down(BUTTON,bx,by);f=await run(6);await shot('curl-0-charging');
      await stick(.55,-1,d);f=await run(9);await touch.up(BUTTON);const ev=[];const track=[];for(let i=0;i<50;i++){f=await run(1);ev.push(...f.events);if(f.ball.owner===null)track.push([+f.ball.x.toFixed(2),+f.ball.z.toFixed(2)]);if(i===3)R.curveAtRelease=+f.ball.curve.toFixed(2);if(i===10||i===22)await shot('curl-'+(i===10?'1':'2')+'-flight');if(f.phase==='goal'||eventsOf(ev,'possession').length||eventsOf(ev,'parry').length)break;}
      await touch.up(STICK);await shot('curl-3-end');R.shot=eventsOf(ev,'shot')[0]||null;R.feedback=f.feedback;R.track=track.filter((_,i)=>i%4===0);
      // the bend: how far the middle of the flight sits from the straight line between its ends
      if(track.length>6){const a=track[0],b=track[track.length-1],m=track[track.length>>1],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;R.bendMetres=+Math.abs(((b[0]-a[0])*(a[1]-m[1])-(a[0]-m[0])*(b[1]-a[1]))/L).toFixed(2);}
      R.outcome=f.phase==='goal'?'goal':'other';R.ok=R.shot?.curl==='curl';
    }
    if(name==='defence'){
      const bot=createTouchBot({layout,rng:mulberry(11),switchEvery:6,airEvery:.6,pitchHalf:52.5,pitchWide:34});let shots=0,ticks=0,doubles=0,marks=0,carry=0,near2=0;
      for(let i=0;i<30*Number(opt('defenceSeconds',20));i++){await page.clock.runFor(frameMs);f=await page.evaluate(read);if(!f)break;
        if(f.phase==='playing'&&f.ball.owner!==null&&f.players[f.ball.owner].team===0){carry++;const rivals=f.players.filter(p=>p.team===1&&p.role!=='keeper'),b=f.ball;
          const dd=rivals.filter(p=>p.duty==='double'),close=dd.filter(p=>Math.hypot(p.x-b.x,p.z-b.z)<5.5);doubles+=dd.length?1:0;marks+=rivals.some(p=>p.duty==='mark')?1:0;
          if(rivals.filter(p=>Math.hypot(p.x-b.x,p.z-b.z)<4).length>=2)near2++;
          if(close.length&&shots<3&&ticks-(R.lastShot??-99)>60){R.lastShot=ticks;await shot('defence-'+(shots++)+'-second-man');}}
        ticks++;await bot.step(f,touch,frameMs/1000);if(f.result)break;}
      await touch.up(STICK);await touch.up(BUTTON);R.carryFrames=carry;R.secondManShare=carry?+(doubles/carry).toFixed(2):null;R.markingShare=carry?+(marks/carry).toFixed(2):null;R.twoRivalsWithin4m=carry?+(near2/carry).toFixed(3):null;R.score=f?.score;R.frames=shots;R.ok=query.includes('soccerV250=0')||doubles>0;
    }
    process.stderr.write(`${tag} ${name}: ${JSON.stringify(R).slice(0,600)}\n`);
  }
}catch(e){report.errors.push(String(e?.stack||e));}
finally{report.errors.push(...h.errors);await writeFile(path.join(out,tag+'.json'),JSON.stringify(report,null,1));await h.close();}
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(report.scenarios).map(([k,v])=>[k,v.ok??v.playerPixels])))+' errors '+report.errors.length+'\n');
