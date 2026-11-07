// Steering feel, headless: yaw response of the real physics to the input the wheel produces. Usage: node tools/racing-feel.mjs [out.json]
import {createRacing} from '../minigames/racing-physics.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const r2=v=>Math.round(v*1000)/1000;
function run(speed,steerAt,seconds,assist=true){
  const race=createRacing({stage:1,seed:1,config:{countdown:0,walls:false,steeringAssist:assist,stage:{opponents:0}}}),p=race.state.player,tr=race.track;
  const pt=tr.sample(30);Object.assign(p,{x:pt.x,y:pt.y,z:pt.z,heading:pt.heading,speed,s:pt.s,routeS:30,previousS:30,progress:30,lateral:0,nitro:0});
  const log=[];let last=p.heading;
  for(let n=0;n<Math.round(seconds*60);n++){const t=n/60,steer=steerAt(t);race.step(1/60,{autoAccelerate:true,steer:-steer});p.speed=speed; // hold speed constant: isolates steering from drag
    const yaw=Math.atan2(Math.sin(p.heading-last),Math.cos(p.heading-last))*60;last=p.heading;log.push({t:t+1/60,yaw:-yaw,steer:p.steer,slip:p.slipAngle});}
  race.dispose();return log;
}
const out={};
// 1. yaw at full lock and at 25% input (steady state, 1 s), per speed
out.yaw={};for(const v of [20,30,40,45]){const full=run(v,()=>1,1.2,false),part=run(v,()=>.25,1.2,false);
  const ss=l=>l.slice(-20).reduce((a,b)=>a+b.yaw,0)/20;
  out.yaw[v]={fullDegPerS:r2(ss(full)*180/Math.PI),quarterDegPerS:r2(ss(part)*180/Math.PI),latAccelFullMs2:r2(ss(full)*v),ratioQuarterToFull:r2(ss(part)/ss(full))};}
// 2. response: time to 63% of steady yaw after a step of full lock
out.response={};for(const v of [20,40]){const l=run(v,t=>t>.1?1:0,1.3,false),ss=l.slice(-10).reduce((a,b)=>a+b.yaw,0)/10;const hit=l.find(x=>x.t>.1&&x.yaw>=.63*ss);out.response[v]={t63ms:Math.round((hit.t-.1)*1000)};}
// 3. return to centre: full lock for 0.5 s then release at 40 m/s; time until |yaw| < 5% of lock yaw, and heading overshoot (deg) after release
{const v=40,l=run(v,t=>t<.5?1:0,2.5,true),lock=l.find(x=>x.t>=.49).yaw,after=l.filter(x=>x.t>.5),settle=after.find(x=>Math.abs(x.yaw)<.05*Math.abs(lock));
 let h=0,peak=0,tot=0;for(const x of l){h+=x.yaw/60;if(x.t<=.5)tot=h;peak=Math.max(peak,Math.abs(h));}
 out.release={speed:v,settleMs:settle?Math.round((settle.t-.5)*1000):null,extraTurnDegAfterRelease:r2((h-tot)*180/Math.PI),turnAtReleaseDeg:r2(tot*180/Math.PI)};}
// 4. zig-zag at 45 m/s (0.8 Hz full lock): max slip and yaw reversal time
{const l=run(45,t=>Math.sin(t*Math.PI*1.6)>0?1:-1,3,false).filter(x=>Math.abs(x.yaw)<4);out.zigzag={maxSlipDeg:r2(Math.max(...l.map(x=>Math.abs(x.slip)))*180/Math.PI),maxLatAccelMs2:r2(Math.max(...l.map(x=>Math.abs(x.yaw)*45)))};}
// 5. pad: pixels of drag for a given steer (travel 59 px)
{const travel=59,dead=.04,expo=1.2,shape=px=>{const a=Math.abs(px/travel);if(a<=dead)return 0;return Math.pow(Math.min(1,(a-dead)/(1-dead)),expo);};
 out.pad={travelPx:travel,px5:r2(shape(5)),px10:r2(shape(10)),px20:r2(shape(20)),px30:r2(shape(30)),px45:r2(shape(45)),px59:r2(shape(59)),firstSteerPx:Math.ceil(dead*travel+1)};}
console.log(JSON.stringify(out,null,1));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
