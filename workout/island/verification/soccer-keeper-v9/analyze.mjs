// Reads browser-frames.json: per scenario, effector (hand for throw, foot for punt) direction at contact vs ball
// direction, and body travel / turn from contact to the end of the clip (visible pivot, not the simulation).
import {readFile,writeFile} from 'node:fs/promises';
const frames=JSON.parse(await readFile(new URL('browser-frames.json',import.meta.url),'utf8')),deg=r=>r*180/Math.PI,wrap=v=>Math.atan2(Math.sin(v),Math.cos(v)),out={};
for(const [key,f] of Object.entries(frames)){
  const ci=f.findIndex(r=>r.owner!==2);if(ci<1){out[key]={error:'no release'};continue;}
  const last=f.map((r,i)=>r.m?i:-1).filter(i=>i>=0).at(-1)??f.length-1;
  const c=f[ci],b=f[ci-1],ball=c.flight?{x:c.flight.x-c.simx,z:c.flight.z-c.simz}:{x:c.bx,z:c.bz},bd=Math.atan2(ball.z,ball.x);
  const ev={x:c.eff[0]-b.eff[0],z:c.eff[2]-b.eff[2]},ed=Math.atan2(ev.z,ev.x);
  // visible body travel after contact, along the ball direction, and yaw vs ball direction (view yaw is atan2(fx,fz))
  const e=f[last],dx=e.x-c.x,dz=e.z-c.z,along=dx*Math.cos(bd)+dz*Math.sin(bd);
  const yawBall=Math.atan2(Math.cos(bd),Math.sin(bd));
  // effector motion after contact relative to the body, along the ball direction: most negative = swings backwards
  let minRel=0;for(let i=ci;i<=last;i++){const rel=(f[i].eff[0]-f[i].x)*Math.cos(bd)+(f[i].eff[2]-f[i].z)*Math.sin(bd),rel0=(c.eff[0]-c.x)*Math.cos(bd)+(c.eff[2]-c.z)*Math.sin(bd);minRel=Math.min(minRel,rel-rel0);}
  out[key]={frames:f.length,contactIndex:ci,clipEndIndex:last,effectorDirVsBallDeg:+deg(wrap(ed-bd)).toFixed(1),bodyYawVsBallAtContactDeg:+deg(wrap(c.yaw-yawBall)).toFixed(1),bodyYawVsBallAtClipEndDeg:+deg(wrap(e.yaw-yawBall)).toFixed(1),bodyTravelAlongBallAfterContactM:+along.toFixed(2),effectorMaxBackwardAfterContactM:+(-minRel).toFixed(2),secondsContactToClipEnd:+(e.t-c.t).toFixed(2)};
}
console.log(JSON.stringify(out,null,1));await writeFile(new URL('browser-metrics.json',import.meta.url),JSON.stringify(out,null,1));
