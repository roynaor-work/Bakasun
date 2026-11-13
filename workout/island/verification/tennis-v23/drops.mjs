// Tennis v23 (13/11/2026), Roy after v22 on the phone: "the computer does get to the small shot, but there still has to be a situation where the
// ball takes time and bounces, with enough time to run even if you do not get there". Measured without a browser, through the SAME input path the
// phone uses (applyTennisSample with the press and release of a 70 ms tap inside one frame, judged on the press like the session does).
//   node workout/island/verification/tennis-v23/drops.mjs [mix|spam] [rank]   the before (v22) / after (v23) table, >=200 child drops per difficulty
// bot mix  = a child who never plays two drops in a row (a drop, then a normal shot, and so on), the way the drop is meant to be used
// bot spam = a child who presses the near-net button on every ball
import {createTennis} from '../../minigames/tennis.mjs';
import {applyTennisSample} from '../../minigames/tennis-controls.mjs';
import {baseConfig} from '../tennis-v14/sim.mjs';
export {baseConfig};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),NONE={hit:false,serve:false,lob:false,drop:false};
const rngOf=seed=>{let v=seed>>>0;return()=>{v=(v+0x6D2B79F5)>>>0;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
/** One controls sample per frame, shaped like createTennisControls().sample(); a tap is a press and a release inside the same frame. */
function sampler(){let previous={...NONE},gesture=0;return({moveX=0,moveZ=0,tap=null,aim=null}={})=>{const stickAim=aim||(Math.hypot(moveX,moveZ)?{x:moveX,z:moveZ,height:0,manual:true}:{x:1,z:0,height:0,manual:false});const events=tap?[{action:tap,type:'press',aim:stickAim,heldSeconds:0,gesture:++gesture},{action:tap,type:'release',aim:stickAim,heldSeconds:.07,gesture}]:[];const s={moveX,moveZ,kickHeld:false,passHeld:false,sprintHeld:false,dropHeld:false,kickAim:stickAim,passAim:stickAim,lobAim:stickAim,shotAim:tap&&tap!=='serve'?stickAim:null,holding:{...NONE},previousHolding:{...previous},events,switchPlayer:false};previous={...NONE};return s;};}
const gravityOf=(config,b)=>config.ball.gravity+(b.spin||0)*(config.ball.topspinGravity||.45);

/** A child bot (runs at the ball, taps when it arrives, serves in the green) against the computer, as in the session (return meter on,
 * press-judged). Records every near-net drop of the child and of the computer, every point, and the dead ball after a soft drop. */
export function playMatch({stage=1,difficulty='easy',seed=1,softDrop=true,bot='mix',ranks={speed:1,hit:1,serve:1},maxDrops=60,maxFrames=60*900,config=baseConfig}={}){
  const model=createTennis({config,stage,seed:(Math.imul(seed,2654435761)>>>0)||1,difficulty,ranks,returnMeter:true,softDrop}),next=sampler(),r=rngOf(seed*77+3);
  const out={drops:[],aiDrops:[],points:[],dead:[]};
  let eventId=model.getState().event.id,incomingKey=null,oppHit=0,tapped=false,lastStrokeDrop=false,drop=null,aiDrop=null,dead=null,pointStart=0,pointNo=-1;
  const closeDrop=(d,list,fields)=>{Object.assign(d,fields,{done:true});list.push(d);};
  for(let frame=0;frame<maxFrames&&out.drops.length<maxDrops&&model.getState().phase!=='complete';frame++){
    const s=model.getState();let opts={};
    if(s.pointNumber!==pointNo&&['serve','toss'].includes(s.phase)){pointNo=s.pointNumber;pointStart=s.elapsed;}
    if(s.server===0&&s.phase==='serve')opts.tap='serve';
    else if(s.server===0&&s.phase==='toss'){if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.07)opts.tap='serve';}
    else if(s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1&&s.ball.lastHitter===1){
      if(s.event.type==='hit'&&s.event.side===1)oppHit=s.event.id;const key=`${s.pointNumber}:${oppHit}`;if(key!==incomingKey){incomingKey=key;tapped=false;}
      const p=s.players[0];opts.moveX=clamp((s.contact.x-p.x)*4,-1,1);opts.moveZ=clamp((s.contact.z-p.z)*4,-1,1);
      if(!tapped&&s.contact.eta<=.08){tapped=true;const wantDrop=(bot==='spam'||!lastStrokeDrop)&&p.z<7.6;opts.tap=wantDrop?'drop':'hit';opts.aim={x:r()*2-1,z:0,height:0,manual:true};}
    }
    applyTennisSample(model,next(opts),1/60,{pressFires:true});
    const n=model.getState(),e=n.event,b=n.ball,ai=n.players[1];
    if(dead){if(['point','game'].includes(n.phase)){dead.frames++;dead.maxMove=Math.max(dead.maxMove,Math.hypot(b.x-dead.x0,b.z-dead.z0));dead.maxY=Math.max(dead.maxY,b.y);if(Math.abs(b.x)>5.1||Math.abs(b.z)>10)dead.inCourt=false;dead.bounces=n.deadBounces||0;if(dead.aiStop===null&&!ai.running)dead.aiStop=dead.frames/60;}else{out.dead.push(dead);dead=null;}}
    if(drop&&b.lastHitter===0){drop.apex=Math.max(drop.apex,b.y);if(drop.prevZ>0&&b.z<=0&&drop.netY===null)drop.netY=b.y;drop.prevZ=b.z;drop.backMost=Math.min(drop.backMost,ai.z);if(n.contact?.soft&&!drop.plan)drop.plan={reach:n.contact.soft.reach,readIn:n.contact.soft.readAt-drop.at,speed:n.contact.soft.speed};}
    if(aiDrop&&b.lastHitter===1)aiDrop.apex=Math.max(aiDrop.apex,b.y);
    if(e.id!==eventId){eventId=e.id;
      if(e.type==='hit'&&e.side===0)lastStrokeDrop=!e.serving&&Boolean(n.shot?.drop);
      if(e.type==='hit'&&e.side===0&&!e.serving&&n.shot?.drop)drop={at:n.elapsed,apex:b.y,netY:null,prevZ:b.z,b1:null,b2:null,upApex:null,landPastNet:null,touch:null,touchY:null,touchBounced:null,plan:null,startZ:ai.z,backMost:ai.z,zone:e.zone,rating:e.rating,repeat:Boolean(n.shot?.softRepeat),pointStart};
      if(e.type==='hit'&&e.side===1&&!e.serving&&drop&&drop.touch===null){drop.touch=n.elapsed-drop.at;drop.touchY=b.y;drop.touchBounced=drop.b1!==null;drop.putAway=Boolean(n.shot?.putAway);}
      if(e.type==='bounce'&&drop&&b.lastHitter===0&&drop.b1===null){const g=gravityOf(config,b);drop.b1=n.elapsed-drop.at;drop.landPastNet=-b.z;drop.b2=drop.b1+2*b.vy/g;drop.upApex=config.ball.radius+b.vy*b.vy/(2*g);}
      if(e.type==='hit'&&e.side===1&&!e.serving&&n.shot?.drop)aiDrop={at:n.elapsed,apex:b.y,b1:null,b2:null,touch:null,touchBounced:null};
      if(e.type==='hit'&&e.side===0&&!e.serving&&aiDrop&&aiDrop.touch===null){aiDrop.touch=n.elapsed-aiDrop.at;aiDrop.touchBounced=aiDrop.b1!==null;}
      if(e.type==='bounce'&&aiDrop&&b.lastHitter===1&&aiDrop.b1===null){const g=gravityOf(config,b);aiDrop.b1=n.elapsed-aiDrop.at;aiDrop.b2=aiDrop.b1+2*b.vy/g;aiDrop.upApex=config.ball.radius+b.vy*b.vy/(2*g);}
      if(['point','game','complete'].includes(e.type)){
        out.points.push({seconds:n.elapsed-pointStart,winner:e.winner,reason:e.reason,rallyHits:n.rallyHits});
        if(drop){closeDrop(drop,out.drops,{end:n.elapsed-drop.at,winner:e.winner,reason:e.reason,pointSeconds:n.elapsed-drop.pointStart,aiGap:Math.hypot(ai.x-b.x,ai.z-b.z),aiSpeedAtEnd:Math.hypot(ai.vx||0,ai.vz||0)});if(e.reason==='doubleBounce'&&drop.touch===null)dead={x0:b.x,z0:b.z,maxMove:0,maxY:b.y,inCourt:true,frames:0,bounces:0,aiStop:null,vAtEnd:Math.hypot(b.vx,b.vy,b.vz)};}
        if(aiDrop)closeDrop(aiDrop,out.aiDrops,{end:n.elapsed-aiDrop.at,winner:e.winner,reason:e.reason});
        drop=null;aiDrop=null;
      }
    }
    // a drop that was answered stops being "the drop" once the answer crosses the net
    if(drop&&drop.touch!==null&&b.lastHitter===1&&b.z>0){closeDrop(drop,out.drops,{end:drop.touch,winner:null,reason:'answered',pointSeconds:null});drop=null;}
    if(aiDrop&&aiDrop.touch!==null&&b.lastHitter===0&&b.z<0){closeDrop(aiDrop,out.aiDrops,{end:aiDrop.touch,winner:null,reason:'answered'});aiDrop=null;}
  }
  return out;
}
export const CELLS={easy:[1,6],normal:[10,14],hard:[24,25]};
export const quantile=(values,p)=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:null;};
/** Matches over the difficulty's two stages until there are at least `minDrops` child drops. */
export function measure({difficulty,softDrop=true,bot='mix',rank=1,minDrops=200,config=baseConfig}){
  const runs=[];let drops=0;
  for(let seed=1;drops<minDrops&&seed<500;seed++)for(const stage of CELLS[difficulty]){const o=playMatch({stage,difficulty,seed,softDrop,bot,ranks:{speed:rank,hit:rank,serve:rank},config});runs.push(o);drops+=o.drops.length;}
  return summarize(runs);
}
export function summarize(runs){
  const drops=runs.flatMap(o=>o.drops),reached=drops.filter(d=>d.touch!==null),won=drops.filter(d=>d.touch===null&&d.winner===0),missed=won.filter(d=>d.reason==='doubleBounce'),ai=runs.flatMap(o=>o.aiDrops),points=runs.flatMap(o=>o.points),dead=runs.flatMap(o=>o.dead);
  const q=(rows,key,p)=>quantile(rows.map(d=>d[key]),p);
  return {drops:drops.length,reached:reached.length/Math.max(1,drops.length),beforeBounce:reached.filter(d=>!d.touchBounced).length/Math.max(1,reached.length),wonUntouched:won.length/Math.max(1,drops.length),quickestWin:q(won,'end',0),
    firstBounce:[q(drops,'b1',.1),q(drops,'b1',.5),q(drops,'b1',.9)],secondBounce:[q(drops,'b2',.1),q(drops,'b2',.5),q(drops,'b2',.9)],apex:q(drops,'apex',.5),netCrossing:q(drops,'netY',.5),landPastNet:[q(drops,'landPastNet',.1),q(drops,'landPastNet',.9)],bounceHeight:q(drops,'upApex',.5),
    touch:q(reached,'touch',.5),touchHeight:q(reached,'touchY',.5),missAiGap:[q(missed,'aiGap',0),q(missed,'aiGap',.5)],missAiSpeed:q(missed,'aiSpeedAtEnd',.5),backpedal:quantile(missed.map(d=>d.startZ-d.backMost),.5),
    repeatReached:drops.filter(d=>d.repeat).length?drops.filter(d=>d.repeat&&d.touch!==null).length/drops.filter(d=>d.repeat).length:null,putAways:reached.filter(d=>d.putAway).length,
    points:points.length,pointSeconds:[quantile(points.map(p=>p.seconds),.1),quantile(points.map(p=>p.seconds),.5),quantile(points.map(p=>p.seconds),.9)],longestPoint:Math.max(0,...points.map(p=>p.seconds)),timeouts:points.filter(p=>p.reason==='timeout').length,
    aiDrops:ai.length,childReaches:ai.length?ai.filter(d=>d.touch!==null).length/ai.length:null,aiFirstBounce:q(ai,'b1',.5),aiSecondBounce:q(ai,'b2',.5),aiBounceHeight:q(ai,'upApex',.5),
    dead:dead.length,deadBounces:quantile(dead.map(d=>d.bounces),.5),deadRoll:quantile(dead.map(d=>d.maxMove),.99),deadInCourt:dead.length?dead.filter(d=>d.inCourt).length/dead.length:null};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const bot=process.argv[2]||'mix',rank=Number(process.argv[3])||1,f=v=>v===null||v===undefined?'-':(Math.round(v*100)/100).toFixed(2),pct=v=>v===null?'-':`${Math.round(100*v)}%`;
  console.log(`bot ${bot}, equipment rank ${rank}`);
  console.log('version | difficulty | child drops | opponent reaches | of those out of the air | won untouched | quickest untouched win s | release to 1st bounce s (p10/med/p90) | release to 2nd bounce s | top of the arc m | over the net m | bounce height m | points | point s (p10/med/p90) | longest s | opponent drops | child reaches them');
  for(const softDrop of [false,true])for(const difficulty of Object.keys(CELLS)){const m=measure({difficulty,softDrop,bot,rank});
    console.log(`${softDrop?'v23':'v22'} | ${difficulty} | ${m.drops} | ${pct(m.reached)} | ${pct(m.beforeBounce)} | ${pct(m.wonUntouched)} | ${f(m.quickestWin)} | ${m.firstBounce.map(f).join('/')} | ${m.secondBounce.map(f).join('/')} | ${f(m.apex)} | ${f(m.netCrossing)} | ${f(m.bounceHeight)} | ${m.points} | ${m.pointSeconds.map(f).join('/')} | ${f(m.longestPoint)} | ${m.aiDrops} | ${pct(m.childReaches)}`);}
}
