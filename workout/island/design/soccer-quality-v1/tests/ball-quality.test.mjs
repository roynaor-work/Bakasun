import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {measureBallQuality} from '../sim/ball-scenarios.mjs';

const source=resolve(process.env.SOCCER_QUALITY_SOURCE||process.cwd());
const baseline=resolve(process.env.SOCCER_QUALITY_BASE||process.cwd());
const load=(root,name)=>import(pathToFileURL(resolve(root,`workout/island/minigames/${name}.mjs`)).href);
const [loft,assist,physics,rules,oldLoft,oldAssist]=await Promise.all([load(source,'soccer-loft'),load(source,'soccer-assistance'),load(source,'soccer-physics'),load(source,'soccer-rules'),load(baseline,'soccer-loft'),load(baseline,'soccer-assistance')]);
const base=JSON.parse(await readFile(resolve(source,'workout/island/data/config.json'),'utf8')).minigames.soccer;
const c={...base,quality:{loft:true,passing:true}};
const api={...loft,...assist,...physics,...rules};
const player=(id,x,z,extra={})=>({id,x,z,team:0,role:'support',fx:1,fz:0,vx:0,vz:0,recover:0,slideTime:0,...extra});
const state=(players,extra={})=>({controlled:0,attackDir:1,aim:{x:1,z:0},ball:{x:0,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0},players:[player(0,0,0),...players],...extra});
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ~= ${b}`);

test('ball calibration meets the targets declared before tuning',()=>{
  const m=measureBallQuality(api,c);
  assert.ok(m.loftIntentPercent>=90);assert.ok(m.landingRollPercent>=95);
  assert.ok(m.groundReceiverPercent>=95);assert.ok(m.throughIntentPercent>=90);
  assert.equal(m.throughUnsafeRejectPercent,100);
  assert.equal(m.roll.outOfPitchSamples,0);assert.ok(m.loftLandingErrorMaxMetres<1e-5);
  assert.equal(m.counts.throughEligible,10);assert.equal(m.counts.throughUnsafe,8);
});

test('absent and disabled flags preserve the production helpers exactly',()=>{
  for(const degrees of [-170,-80,-42,-24,0,24,42,80,170])for(const power of [0,.2,.5,1]){
    const a=degrees*Math.PI/180,s=state([player(1,10,2),player(2,7,-3),player(8,5,1,{team:1})],{aim:{x:Math.cos(a),z:Math.sin(a)}});
    for(const config of [base,{...base,quality:{loft:false,passing:false}}]){
      assert.deepEqual(loft.loftDestination(s,config,power,{snap:true}),oldLoft.loftDestination(s,base,power,{snap:true}));
      assert.deepEqual(assist.assistedPassDestination(s,config,power),oldAssist.assistedPassDestination(s,base,power));
      assert.equal(assist.groundPassSeconds(13,config),oldAssist.groundPassSeconds(13,base));
      assert.equal(assist.passExecutionError(s,config,.75),oldAssist.passExecutionError(s,base,.75));
      assert.deepEqual(loft.createLoftFlight(s.ball,{x:14,z:3},config,power),oldLoft.createLoftFlight(s.ball,{x:14,z:3},base,power));
    }
  }
});

test('quality assists do not turn an explicit manual drag',()=>{
  const aim={x:1,z:0,manual:true},s=state([player(1,13,3)],{passAim:aim,aim,throughPass:true});
  for(const power of [0,.2,.5,.8]){
    const ground=assist.assistedPassDestination(s,c,power),high=loft.loftDestination(s,c,power,{snap:true});
    near(ground.z,0);near(high.z,0);assert.equal(ground.assisted,false);assert.equal(high.assisted,false);
    assert.equal(assist.throughPassDestination(s,c),null);
  }
});

test('quality narrow preservation skips a sliding receiver for an available teammate',()=>{
  const s=state([player(1,10,0,{slideTime:1}),player(2,12,3)]);
  assert.equal(assist.assistedPassDestination(s,base).target,1,'legacy target is unchanged with the flag off');
  assert.equal(assist.assistedPassDestination(s,c).target,2,'quality fallback excludes the unavailable receiver');
});

test('explicit through choice reuses safe running lanes and rejects a body on its path',()=>{
  const runner=player(2,10,5,{vx:4.2}),s=state([player(1,5,0),runner],{throughPass:true});
  const result=assist.assistedPassDestination(s,c);
  assert.equal(result.target,2);assert.equal(result.through,true);near(result.x-runner.x,3.15);
  const blocked=state([player(1,5,0),player(2,10,0,{vx:4.2})],{throughPass:true});
  assert.equal(assist.throughPassDestination(blocked,c),null);
  blocked.players[1].team=1;
  assert.equal(assist.throughPassDestination(blocked,c),null,'a defender also blocks the through lane');
  const behind=state([player(2,-10,5,{vx:-4.2})],{throughPass:true});
  assert.equal(assist.throughPassDestination(behind,c),null);
});

test('physical landing retains forward motion, dissipates energy and never applies scheduled midair damping',()=>{
  const ball=state([]).ball;Object.assign(ball,loft.createLoftFlight(ball,{x:14,z:0},c,.8));
  let landed=false;
  for(let i=0;i<600&&ball.flight;i++){
    const expected={...ball};physics.rollBall(expected,c.match.fixedStep,c);
    const speedBefore=Math.hypot(ball.vx,ball.vz),contact=loft.stepLoftBall(ball,c.match.fixedStep,c);
    if(contact){landed=true;assert.ok(ball.vx>0);assert.ok(Math.hypot(ball.vx,ball.vz)<=speedBefore);}
    else{near(ball.vx,expected.vx);near(ball.vy,expected.vy);}
  }
  assert.ok(landed);const x=ball.x;for(let i=0;i<60;i++)physics.rollBall(ball,c.match.fixedStep,c);
  assert.ok(ball.x>x+.5,'continues rolling after the first actual contact');
});

test('charge errors keep the assisted apex stable at the same physical range',()=>{
  const b=state([]).ball,a=loft.createLoftFlight(b,{x:10,z:0},c,.4),z=loft.createLoftFlight(b,{x:10,z:0},c,1);
  near(a.flight.height,z.flight.height);near(a.flight.duration,z.flight.duration);
  assert.ok(a.flight.height>=1.65&&a.flight.height<=3.1);
});
