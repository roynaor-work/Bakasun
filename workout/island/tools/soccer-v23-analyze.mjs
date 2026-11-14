/** Reads a soccer-v23-touch.mjs recording and prints the v23 measurements (evidence only).
 * Usage: node tools/soccer-v23-analyze.mjs <recording.json> [more.json ...] */
import {readFile} from 'node:fs/promises';

const deg=r=>r*180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const pct=(list,q)=>{if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(q*(s.length-1)+.5))];};
const LOCOMOTION=/run|sprint|jog|walk|jockey|dribble/;

/** World direction of the recognizer's stick (screen x/y times attackDir, as the session samples it). */
const stickWorld=f=>f.input&&Math.hypot(f.input.mx,f.input.mz)>.2?{x:f.input.mx*f.attackDir,z:f.input.mz*f.attackDir}:null;

/** Response of a newly selected player to the stick that is held at the moment of the switch. */
function response(frames,i0,id,dir,t0){
  const out={modelMove:null,renderMove:null,facing:null,locomotion:null,model90:null,clipAtSwitch:frames[i0].players[id]?.clip,dropped:false};
  const target=5.3;let prev=null;
  for(let i=i0;i<frames.length&&i<i0+90;i++){
    const f=frames[i],p=f.players[id];if(!p||f.controlled!==id)break;
    if(f.input&&f.fingers?.includes(1)&&!f.input.stick)out.dropped=true;
    const t=f.t-t0,along=p.vx*dir.x+p.vz*dir.z;
    if(out.modelMove===null&&along>=2)out.modelMove=t;
    if(out.model90===null&&along>=.9*Math.max(target*.8,Math.hypot(p.vx,p.vz)))out.model90=along>=2?t:null;
    if(prev&&p.rx!==undefined){const dt=(f.t-prev.t)/1000,rv=dt>0?((p.rx-prev.p.rx)*dir.x+(p.rz-prev.p.rz)*dir.z)/dt:0;if(out.renderMove===null&&rv>=2)out.renderMove=t;}
    if(out.facing===null&&p.yaw!==undefined){const a=Math.abs(wrap(p.yaw-Math.atan2(dir.x,dir.z)));if(a<=Math.PI/6)out.facing=t;}
    if(out.locomotion===null&&p.clip&&LOCOMOTION.test(p.clip)&&!/brake/.test(p.clip))out.locomotion=t;
    prev={t:f.t,p};
  }
  return out;
}

export function analyze(rec){
  const F=rec.frames,switches=[],autos=[],glitches={teleport:[],yawSnap:[],pop:[],bounce:[],clipThrash:[],ballJump:[],stickDrop:[]};
  let lastPress=null;const clipChanges=new Map();
  for(let i=1;i<F.length;i++){
    const f=F[i],g=F[i-1];
    for(const b of f.buttons||[])if(b.ev==='pointerdown'&&b.id==='soccer-switch')lastPress={t:b.t,frame:i};
    // the recognizer lost a stick the thumb still holds
    if(g.input?.stick==='move'&&!f.input?.stick&&g.fingers?.includes(1)&&f.fingers?.includes(1))glitches.stickDrop.push({frame:i,elapsed:f.elapsed,from:g.input.state,to:f.input?.state,phase:f.phase});
    if(f.controlled!==g.controlled&&f.phase==='playing'&&g.phase==='playing'){
      const dir=stickWorld(g)||stickWorld(f);
      const manual=lastPress&&f.t-lastPress.t<600;
      const t0=manual?lastPress.t:f.t;
      if(dir){const r=response(F,i,f.controlled,dir,t0);(manual?switches:autos).push({frame:i,elapsed:f.elapsed,from:g.controlled,to:f.controlled,selectMs:manual?f.t-lastPress.t:0,startSpeed:+Math.hypot(f.players[f.controlled].vx,f.players[f.controlled].vz).toFixed(2),startAlong:+(f.players[f.controlled].vx*dir.x+f.players[f.controlled].vz*dir.z).toFixed(2),...r});}
      if(manual)lastPress=null;
    }
    const live=f.phase==='playing'&&g.phase==='playing'&&!f.hold&&!g.hold&&!f.replaying&&!g.replaying;
    if(!live)continue;
    const dt=(f.t-g.t)/1000||1/60;
    for(const p of f.players){
      const q=g.players[p.id];if(!q||p.rx===undefined||q.rx===undefined)continue;
      const step=Math.hypot(p.rx-q.rx,p.rz-q.rz),speed=Math.max(Math.hypot(p.vx,p.vz),Math.hypot(q.vx,q.vz));
      if(step>Math.max(.3,speed*dt*1.8+.08))glitches.teleport.push({frame:i,elapsed:f.elapsed,id:p.id,step:+step.toFixed(3),speed:+speed.toFixed(2),clip:p.clip});
      const dy=Math.abs(wrap((p.yaw??0)-(q.yaw??0)));if(deg(dy)>30)glitches.yawSnap.push({frame:i,elapsed:f.elapsed,id:p.id,deg:+deg(dy).toFixed(1),clip:p.clip,controlled:p.id===f.controlled});
      if(p.pop>30&&p.clip===q.clip)glitches.pop.push({frame:i,elapsed:f.elapsed,id:p.id,deg:p.pop,bone:p.popBone,clip:p.clip,controlled:p.id===f.controlled});
      if(Math.abs((p.ry||0)-(q.ry||0))>.12)glitches.bounce.push({frame:i,elapsed:f.elapsed,id:p.id,dy:+(p.ry-q.ry).toFixed(3),clip:p.clip});
      if(p.clip!==q.clip){const list=clipChanges.get(p.id)||[];list.push(f.t);clipChanges.set(p.id,list);const recent=list.filter(t=>f.t-t<=600);if(recent.length>=4)glitches.clipThrash.push({frame:i,elapsed:f.elapsed,id:p.id,changes:recent.length,clip:p.clip});}
    }
    const b=f.ball,c=g.ball,bs=Math.hypot(b.x-c.x,b.z-c.z),bv=Math.max(Math.hypot(b.vx,b.vz),Math.hypot(c.vx,c.vz));
    if(bs>Math.max(.5,bv*dt*2+.15))glitches.ballJump.push({frame:i,elapsed:f.elapsed,step:+bs.toFixed(3),owner:b.owner});
  }
  const sum=list=>({n:list.length,median:pct(list,.5),p90:pct(list,.9),max:list.length?Math.max(...list):null});
  const stats=list=>({count:list.length,selectMs:sum(list.map(s=>s.selectMs)),modelMoveMs:sum(list.map(s=>s.modelMove).filter(v=>v!==null)),renderMoveMs:sum(list.map(s=>s.renderMove).filter(v=>v!==null)),facingMs:sum(list.map(s=>s.facing).filter(v=>v!==null)),locomotionMs:sum(list.map(s=>s.locomotion).filter(v=>v!==null)),neverMoved:list.filter(s=>s.modelMove===null).length,dropped:list.filter(s=>s.dropped).length});
  const seconds=F.length?(F.at(-1).t-F[0].t)/1000:0;
  return {frames:F.length,seconds:+seconds.toFixed(1),score:F.at(-1)?.score,manual:stats(switches),auto:stats(autos),
    glitches:Object.fromEntries(Object.entries(glitches).map(([k,v])=>[k,{count:v.length,perMinute:+(v.length/(seconds/60||1)).toFixed(2),examples:v.slice(0,6)}])),switches,autos};
}

if(import.meta.url===`file://${process.argv[1]}`){
  for(const file of process.argv.slice(2)){
    const rec=JSON.parse(await readFile(file,'utf8')),a=analyze(rec);
    const line=o=>JSON.stringify(o);
    console.log(`# ${file}\nframes ${a.frames} seconds ${a.seconds} score ${a.score}`);
    for(const kind of ['manual','auto']){const k=a[kind];console.log(`${kind}: count ${k.count} neverMoved ${k.neverMoved} dropped ${k.dropped}\n  select ${line(k.selectMs)}\n  modelMove ${line(k.modelMoveMs)}\n  renderMove ${line(k.renderMoveMs)}\n  facing ${line(k.facingMs)}\n  locomotion ${line(k.locomotionMs)}`);}
    for(const [k,v] of Object.entries(a.glitches))console.log(`glitch ${k}: ${v.count} (${v.perMinute}/min) ${line(v.examples.slice(0,3))}`);
  }
}
