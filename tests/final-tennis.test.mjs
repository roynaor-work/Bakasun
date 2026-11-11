// Final-fix round (11/11/2026), tennis: Roy's two complaints measured through the SAME input path the on-screen controls use
// (applyTennisSample with press/release events, as tennis-controls.mjs delivers a child's tap), not by poking the model directly.
//   node --test tests/final-tennis.test.mjs            the acceptance numbers
//   node tests/final-tennis.test.mjs table             print the before/after table used in REPORT-tennis.md
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {applyTennisSample} from '../workout/island/minigames/tennis-controls.mjs';
import {baseConfig} from '../workout/island/verification/tennis-v14/sim.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),NONE={hit:false,serve:false,lob:false,drop:false};
const rngOf=seed=>{let v=seed>>>0;return()=>{v=(v+0x6D2B79F5)>>>0;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
/** One controls sample per frame, shaped exactly like createTennisControls().sample(): held flags, the previous held flags and the buffered
 * press/release edges. A child's tap is a press and a release inside one frame (70 ms on the phone), so the edge list carries both. */
function sampler(){let previous={...NONE},gesture=0;return({moveX=0,moveZ=0,tap=null,aim=null}={})=>{const stickAim=aim||(Math.hypot(moveX,moveZ)?{x:moveX,z:moveZ,height:0,manual:true}:{x:1,z:0,height:0,manual:false});const events=tap?[{action:tap,type:'press',aim:stickAim,heldSeconds:0,gesture:++gesture},{action:tap,type:'release',aim:stickAim,heldSeconds:.07,gesture}]:[];const s={moveX,moveZ,kickHeld:false,passHeld:false,sprintHeld:false,dropHeld:false,kickAim:stickAim,passAim:stickAim,lobAim:stickAim,shotAim:tap&&tap!=='serve'?stickAim:null,holding:{...NONE},previousHolding:{...previous},events,switchPlayer:false};previous={...NONE};return s;};}

/** A child who taps the hit button when the ball arrives (never holds), and taps the near-net drop button on every `dropEvery`-th return.
 * Returns what the bar did on every tapped return and how every drop point ended. */
export function playMatch({stage=1,difficulty='easy',seed=1,config=baseConfig,bar=true,dropFix=true,dropEvery=2,maxDrops=25,maxFrames=60*900,ranks={speed:1,hit:1,serve:1}}={}){
  const model=createTennis({config,stage,seed:(Math.imul(seed,2654435761)>>>0)||1,difficulty,ranks,bar,dropFix}),next=sampler(),r=rngOf(seed*77+3);
  const out={returns:[],drops:[],points:0,frames:0};let eventId=model.getState().event.id,incomingKey=null,incoming=null,pending=null,returnNo=0;
  for(let frame=0;frame<maxFrames&&out.drops.length<maxDrops&&model.getState().phase!=='complete';frame++){
    const s=model.getState();let opts={};
    if(s.server===0&&s.phase==='serve')opts.tap='serve';
    else if(s.server===0&&s.phase==='toss'){if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.07)opts.tap='serve';}
    else if(s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1&&s.ball.lastHitter===1){
      const key=`${s.pointNumber}:${s.rallyHits}`;
      if(key!==incomingKey){if(incoming)out.returns.push(incoming);incomingKey=key;incoming={key,activeBefore:false,activeAtTap:null,zoneAtTap:null,greenHalf:null,yellowHalf:null,tapped:false,drop:false,frames:0,activeFrames:0};}
      incoming.frames++;if(s.hitMeter?.active)incoming.activeFrames++;
      const p=s.players[0];opts.moveX=clamp((s.contact.x-p.x)*4,-1,1);opts.moveZ=clamp((s.contact.z-p.z)*4,-1,1);
      if(!incoming.tapped){
        if(s.contact.eta>.2&&s.hitMeter?.active)incoming.activeBefore=true;
        if(s.contact.eta<=.08){incoming.tapped=true;incoming.activeAtTap=Boolean(s.hitMeter?.active);incoming.zoneAtTap=s.hitMeter?.zone??null;incoming.greenHalf=s.hitMeter?.greenHalf??null;incoming.yellowHalf=s.hitMeter?.yellowHalf??null;
          const drop=dropEvery>0&&returnNo%dropEvery===dropEvery-1&&p.z<7.6;returnNo++;incoming.drop=drop;opts.tap=drop?'drop':'hit';opts.aim={x:r()*2-1,z:0,height:0,manual:true};}
      }
    }
    applyTennisSample(model,next(opts),1/60);out.frames++;
    const n=model.getState(),e=n.event;
    if(e.id!==eventId){eventId=e.id;
      if(e.type==='hit'&&e.side===0&&!e.serving&&n.shot?.drop)pending={at:n.elapsed,reached:false,landZ:null,pointNumber:n.pointNumber};
      if(e.type==='hit'&&e.side===1&&!e.serving&&pending)pending.reached=true;
      if(e.type==='bounce'&&pending&&pending.landZ===null&&n.ball.lastHitter===0)pending.landZ=Math.round(n.ball.z*100)/100;
      if(['point','game','complete'].includes(e.type)){out.points++;if(incoming){out.returns.push(incoming);incoming=null;incomingKey=null;}if(pending){out.drops.push({...pending,seconds:Math.round((n.elapsed-pending.at)*1000)/1000,winner:e.winner,reason:e.reason,rallyHits:n.rallyHits});pending=null;}}}
  }
  if(incoming)out.returns.push(incoming);
  return out;
}
export function summarize(runs){
  const returns=runs.flatMap(o=>o.returns).filter(r=>r.tapped),drops=runs.flatMap(o=>o.drops);
  const untouchedFast=drops.filter(d=>!d.reached&&d.seconds<=1.05),untouched=drops.filter(d=>!d.reached&&d.winner===0),reached=drops.filter(d=>d.reached);
  const seconds=drops.map(d=>d.seconds).sort((a,b)=>a-b),median=seconds.length?seconds[Math.floor(seconds.length/2)]:null;
  return {tapped:returns.length,untouchedShare:drops.length?untouched.length/drops.length:null,barBefore:returns.filter(r=>r.activeBefore).length,barAtTap:returns.filter(r=>r.activeAtTap).length,drops:drops.length,reached:reached.length,untouched:untouched.length,untouchedFast:untouchedFast.length,reachedShare:drops.length?reached.length/drops.length:null,untouchedFastShare:drops.length?untouchedFast.length/drops.length:null,medianSeconds:median,minSeconds:seconds[0]??null,points:runs.reduce((a,o)=>a+o.points,0)};
}
const cells=[[1,'easy'],[6,'easy'],[10,'normal'],[25,'hard']];
const measure=(opts,seeds=6)=>summarize(Array.from({length:seeds},(_,i)=>playMatch({...opts,seed:i+1})));
const seedsFor=difficulty=>difficulty==='easy'?6:difficulty==='normal'?10:14;/* the harder the match, the fewer points before it ends */

test('final tennis: a tapped return (press+release in one frame, as the phone sends it) has the bar up before the finger lands and when it lands; with ?tennisBar=0 (v20) it never does',()=>{
  for(const [stage,difficulty] of cells){
    const after=measure({stage,difficulty,dropEvery:0,maxDrops:1,maxFrames:60*120},3),before=measure({stage,difficulty,dropEvery:0,maxDrops:1,maxFrames:60*120,bar:false},3);
    assert.ok(after.tapped>=8,`${difficulty} ${stage}: tapped returns ${after.tapped}`);
    assert.equal(after.barBefore,after.tapped,`${difficulty} ${stage}: bar up before the tap on ${after.barBefore}/${after.tapped}`);
    assert.equal(after.barAtTap,after.tapped,`${difficulty} ${stage}: bar up at the tap on ${after.barAtTap}/${after.tapped}`);
    assert.equal(before.barBefore,0,`${difficulty} ${stage}: v20 showed the bar before a tap on ${before.barBefore}/${before.tapped}`);
    assert.equal(before.barAtTap,0,`${difficulty} ${stage}: v20 showed the bar at a tap on ${before.barAtTap}/${before.tapped}`);
  }
});

test('final tennis: the return bar carries a green centre with yellow around it, with the same widths the session draws for the serve-style gradient',async()=>{
  const o=playMatch({stage:3,difficulty:'normal',dropEvery:0,maxDrops:1,maxFrames:60*90}),tapped=o.returns.filter(r=>r.tapped);
  assert.ok(tapped.length>=3);
  for(const r of tapped){assert.ok(r.greenHalf>0&&r.greenHalf<.5,`green half ${r.greenHalf}`);assert.ok(r.yellowHalf>r.greenHalf&&r.yellowHalf<=.5,`yellow half ${r.yellowHalf}`);assert.ok(['green','yellow','red'].includes(r.zoneAtTap));}
  const session=await readFile(new URL('../workout/island/minigames/tennis-session.mjs',import.meta.url),'utf8');
  // the hit bar reuses the serve bar element and the serve colours (red / yellow / green / yellow / red), so both look the same
  const gradients=session.match(/linear-gradient\(to top,#f06960 0% [^`]*?\)/g)||[];
  assert.ok(gradients.length>=2,'serve and hit gradients');for(const g of gradients){assert.ok(g.includes('#67d398')&&g.includes('#efc355'),g);}
  assert.ok(session.includes("'tennisBar')==='0'")&&session.includes("'tennisDrop')==='0'"),'kill switches in the session');
});

test('final tennis: a near-net drop tapped through the controls is not an automatic win: the opponent reaches most of them, and the point lasts well over a second',()=>{
  for(const [stage,difficulty] of cells){
    const n=seedsFor(difficulty),after=measure({stage,difficulty},n),before=measure({stage,difficulty,dropFix:false},n);
    assert.ok(after.drops>=30,`${difficulty} ${stage}: drops ${after.drops}`);
    // target: under 15% for a good opponent (normal/hard); the easy opponent, built for a 7 year old, is allowed to be beaten a little more often
    assert.ok(after.untouchedShare<=(difficulty==='easy'?.2:.15),`${difficulty} ${stage}: ${(100*after.untouchedShare).toFixed(0)}% of drops win with nobody touching the ball (before: ${(100*before.untouchedShare).toFixed(0)}%)`);
    assert.ok(after.reachedShare>=.5,`${difficulty} ${stage}: opponent reaches ${(100*after.reachedShare).toFixed(0)}% (before: ${(100*before.reachedShare).toFixed(0)}%)`);
    assert.ok(after.minSeconds>=1.2,`${difficulty} ${stage}: the quickest drop point lasted ${after.minSeconds} s from the drop (before: ${before.minSeconds})`);
    assert.ok(after.medianSeconds>=1.2,`${difficulty} ${stage}: median seconds from the drop to the end of the point ${after.medianSeconds} (before: ${before.medianSeconds})`);
    if(difficulty!=='hard')assert.ok(before.untouchedShare>=.3,`${difficulty} ${stage}: the v20 code let ${(100*before.untouchedShare).toFixed(0)}% of drops win untouched`);
  }
});

if(process.argv[1]&&process.argv[1].endsWith('final-tennis.test.mjs')&&process.argv.includes('table')){
  console.log('stage | diff | mode | tapped | bar before | bar at tap | drops | reached | untouched win | untouched<=1.05s | median s | min s');
  for(const [stage,difficulty] of cells)for(const mode of ['before','after']){
    const m=measure({stage,difficulty,bar:mode==='after',dropFix:mode==='after'},seedsFor(difficulty));
    console.log(`${stage} | ${difficulty} | ${mode} | ${m.tapped} | ${m.barBefore} | ${m.barAtTap} | ${m.drops} | ${(100*m.reachedShare).toFixed(0)}% | ${(100*m.untouchedShare).toFixed(0)}% | ${(100*m.untouchedFastShare).toFixed(0)}% | ${m.medianSeconds} | ${m.minSeconds}`);
  }
}
