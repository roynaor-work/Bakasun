// Headless measurement of the lob -> header chain with a simulated child. A winger holds the pass button (loft) towards a striker in the box;
// the receiver heads automatically (aerial.autoHeaderDelaySeconds) or the child presses the kick button when the ball is in reach.
// Everything is seeded. Usage: node tools/soccer-cross-bench.mjs [runs] [--teams 7] [--set "a.b=1;c.d=2"] [--json]
import {readFile} from 'node:fs/promises';
import {createSoccer,seededRandom} from '../minigames/soccer.mjs';
import {applySoccerTeams} from '../minigames/soccer-teams.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export async function loadConfig(){return JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;}
// The bench isolates the lob -> header chain, so the match runs without feel v2 (defenders marking the receiver of a lob in flight halve the
// striker's headers: 46.7% with it, 12/11/2026); FEEL=v2 in the environment measures the full match instead.
function simulateCross(config,{seed,hold=.55,errorDegrees=8,press='auto',feel=process.env.FEEL||'off'}){
  const rng=seededRandom(seed*2654435761>>>0||1),game=createSoccer({config,seed,stage:3,difficulty:'normal',feelVersion:feel,...(process.env.AI?{aiVersion:process.env.AI}:{})}),s=game.getState();
  const step=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2;
  const home=s.players.filter(p=>p.team===0),opps=s.players.filter(p=>p.team===1);
  const place=(p,x,z)=>{p.x=x;p.z=z;p.vx=p.vz=0;p.recover=0;p.cooldown=0;p.hold=0;};
  const carrier=s.players[0],mates=home.filter(p=>p.id!==0&&p.role!=='keeper');
  const side=rng()<.5?-1:1,pd=config.pitch.penaltyDepth,pw=config.pitch.penaltyWidth;
  place(carrier,hx-pd-4-rng()*6,side*(hz*.5+rng()*3));carrier.fx=1;carrier.fz=0;
  const striker=mates[0];place(striker,hx-1.6-rng()*(pd-2.4),(rng()-.5)*(pw-3));
  mates.slice(1).forEach((m,i)=>place(m,hx-18-i*3,(rng()-.5)*2*(hz-5)));
  place(home.find(p=>p.role==='keeper'),-hx+1.2,0);
  for(const o of opps){if(o.role==='keeper')place(o,hx-1.2,0);else{place(o,-hx+6+rng()*(hx),(rng()-.5)*2*(hz-3));o.recover=99;}}
  s.ball.owner=0;s.ball.x=carrier.x+.49;s.ball.z=carrier.z;s.ball.y=config.physics.ballRadius;s.ball.vx=s.ball.vz=0;s.ball.grace=0;s.controlled=0;
  const start={x:striker.x,z:striker.z};
  const bearing=Math.atan2(striker.z-carrier.z,striker.x-carrier.x),angle=bearing+(rng()*2-1)*errorDegrees*Math.PI/180;
  const input={moveX:Math.cos(angle),moveZ:Math.sin(angle),passHeld:false,kickHeld:false,sprintHeld:false,switchPlayer:false};
  const holdTicks=Math.round(hold/step)+3;
  const r={seed,loft:false,header:false,onTarget:false,goal:false,heightAtStriker:null,missBy:null,receiver:null,shots:0};
  let released=false,closest=Infinity;
  for(let i=0;i<Math.round(6/step);i++){
    input.passHeld=i<holdTicks;
    // the striker waits in the box until the ball is close (his own AI drifts out of it); the receiver's own run takes over afterwards
    if(!(released&&dist(s.ball,striker)<6)){striker.x=start.x;striker.z=start.z;striker.vx=striker.vz=0;}
    // the child presses kick when the controlled player is in reach of a high ball
    const c=s.players[s.controlled];
    input.kickHeld=press==='press'&&c&&s.ball.owner===null&&dist(c,s.ball)<1.4&&s.ball.y>config.aerial.minHeight;
    game.update(step,{...input});
    for(const e of game.drainEvents()){
      if(e.type==='loft'&&e.team===0&&e.player===0){r.loft=true;released=true;r.targetCorrect=e.target===striker.id;}
      if(e.type==='header'&&e.team===0){r.header=true;r.receiver=e.player;r.headerAt=i*step;const b=s.ball;r.headerSpeed=Math.hypot(b.vx,b.vz);r.towardGoal=b.vx>0;r.headerZ=b.z;}
      if(e.type==='shot'&&e.team===0)r.shots++;
      if(e.type==='goal'&&e.team===0)r.goal=true;
    }
    if(process.env.DBG&&released&&dist(s.ball,striker)<4)console.error(i,'ball',s.ball.x.toFixed(2),s.ball.y.toFixed(2),s.ball.z.toFixed(2),'vy',s.ball.vy.toFixed(1),'owner',s.ball.owner,'striker',striker.x.toFixed(2),striker.z.toFixed(2),'d',dist(s.ball,striker).toFixed(2),'flight',!!s.ball.flight,'pt',s.passTarget?.player,striker.id,'ctl',s.controlled);
    if(released&&s.ball.owner===null){const d=dist(s.ball,striker);if(d<closest){closest=d;r.heightAtStriker=s.ball.y;}}
    if(r.header&&!r.onTarget&&Math.abs(s.ball.x)>=hx-.1&&Math.abs(s.ball.z)<config.pitch.goalWidth/2)r.onTarget=true;
    if(s.phase!=='playing'&&s.phase!=='goal'&&!r.goal&&r.header)break;
    if(r.goal)break;
    if(!released&&i>holdTicks+60)break;
  }
  r.missBy=closest<Infinity?closest:null;return r;
}
const pct=(a,f)=>a.length?Math.round(1000*a.filter(f).length/a.length)/10:null;
export function runCross(config,{runs=150,press='auto',hold=.55}={}){
  const rows=[];for(let seed=1;seed<=runs;seed++)rows.push(simulateCross(config,{seed:1000+seed,press,hold}));
  const lofts=rows.filter(r=>r.loft);
  return {runs,lofted:pct(rows,r=>r.loft),targetCorrect:pct(lofts,r=>r.targetCorrect),headed:pct(lofts,r=>r.header),headOnTarget:pct(lofts,r=>r.onTarget),goals:pct(lofts,r=>r.goal),
    medianMissBy:(()=>{const v=lofts.map(r=>r.missBy).filter(x=>x!==null).sort((a,b)=>a-b);return v.length?+v[Math.floor(v.length/2)].toFixed(2):null;})(),
    medianHeight:(()=>{const v=lofts.map(r=>r.heightAtStriker).filter(x=>x!==null).sort((a,b)=>a-b);return v.length?+v[Math.floor(v.length/2)].toFixed(2):null;})()};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const runs=Number(process.argv[2])||150,args=process.argv,tIdx=args.indexOf('--teams');let config=await loadConfig();
  if(tIdx>0)config=applySoccerTeams(config,args[tIdx+1]);
  const sIdx=args.indexOf('--set');if(sIdx>0)for(const pair of args[sIdx+1].split(';')){const [path,raw]=pair.split('=');const keys=path.split('.');let o=config;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)]=JSON.parse(raw);}
  const out={auto:runCross(config,{runs,press:'auto'}),press:runCross(config,{runs,press:'press'})};
  console.log(JSON.stringify(out,null,1));
}
export {simulateCross};
