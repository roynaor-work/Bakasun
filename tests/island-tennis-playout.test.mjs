import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// v24.4 (Roy after v24.3: "on a bad serve too, the ball should carry on to the end and not stop suddenly"): a serve into the net drops off the net on
// the server's side, a serve out bounces on past the line, and only then the second serve (phase 'fault'); a double fault plays out through the
// point pause instead of freezing in the air. The session turns playOut on; ?tennisPlayOut=0 (playOut:false) restores v24.3.
const {createTennis}=await import('../workout/island/minigames/tennis.mjs');
const config=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.tennis;
const dt=config.simulation.step;
function serveAt(value,{playOut=true,seed=4107,model}={}){
 model??=createTennis({config,seed,difficulty:'easy',ranks:{speed:1,hit:1,serve:1},phoneFixE:true,stopDead:true,playOut});const s=model.getState();
 model.update(0,{serve:true});model.update(0,{});while(s.serveMeter+1e-9<value)model.update(dt);model.update(0,{serve:true});model.update(0,{});
 return {model,s};
}
const toFault=(model,s)=>{for(let i=0;i<500&&s.phase==='rally';i++)model.update(dt);};
function follow(model,s,seconds){const path=[];for(let t=0;t<seconds;t+=dt){model.update(dt);path.push({phase:s.phase,x:s.ball.x,y:s.ball.y,z:s.ball.z});}return path;}

test('a serve into the net drops off the net onto the server side and rests on the ground, then the second serve',()=>{
 const {model,s}=serveAt(.06);toFault(model,s);
 assert.equal(s.event.type,'fault');assert.equal(s.event.reason,'net');assert.equal(s.phase,'fault');
 const at={y:s.ball.y,z:s.ball.z},path=follow(model,s,.9);
 assert.ok(path.every(p=>p.phase==='fault'),'the second serve waits for the ball');
 assert.ok(path.every(p=>p.z>0),'the ball stays on the server side of the net');
 assert.ok(path.every(p=>Math.abs(p.z)<2.5),'it drops at the net, not flying back to the server');
 assert.ok(path.at(-1).y<=config.ball.radius+.02&&at.y>path.at(-1).y,'it falls to the ground');
 follow(model,s,.6);assert.equal(s.phase,'serve','then the second serve');assert.equal(s.faults,1);
});
test('a serve out lands beyond the service line and bounces on (it does not stop on the landing point)',()=>{
 const {model,s}=serveAt(.94);toFault(model,s);
 assert.equal(s.event.reason,'out');assert.equal(s.phase,'fault');const land={x:s.ball.x,z:s.ball.z};
 assert.ok(Math.abs(land.z)>config.court.serviceLength);
 const path=follow(model,s,.6),far=path.at(-1);
 assert.ok(Math.hypot(far.x-land.x,far.z-land.z)>1.5,`moved on ${Math.hypot(far.x-land.x,far.z-land.z).toFixed(2)} m`);
 assert.ok(Math.max(...path.map(p=>p.y))>.3,'it bounces up again');
 assert.ok(Math.abs(s.faultMark.z)===Math.abs(land.z),'the out mark stays on the landing point');
 follow(model,s,1);assert.equal(s.phase,'serve');assert.ok(Math.abs(s.ball.z)<=config.court.halfLength+3.2+1e-9,'held by the back wall');
});
test('a double fault into the net plays out through the point pause (no ball frozen in the air)',()=>{
 const {model,s}=serveAt(.06);toFault(model,s);follow(model,s,1.3);assert.equal(s.phase,'serve');
 serveAt(.06,{model});toFault(model,s);assert.equal(s.event.reason,'doubleFault');assert.equal(s.phase,'point');
 const y0=s.ball.y,path=follow(model,s,1.25);assert.ok(path.every(p=>p.phase==='point'));assert.ok(path.at(-1).y<y0-.05||y0<=config.ball.radius+.02,'the ball falls from the net');
 assert.ok(path.at(-1).y<=config.ball.radius+.02,'and rests on the ground');
});
test('playOut:false restores v24.3: the second serve comes in the same frame and the double fault freezes the ball',()=>{
 const {model,s}=serveAt(.06,{playOut:false});toFault(model,s);
 assert.equal(s.event.reason,'net');assert.equal(s.phase,'serve');
 serveAt(.06,{model,playOut:false});toFault(model,s);assert.equal(s.event.reason,'doubleFault');
 const y0=s.ball.y;follow(model,s,.5);assert.equal(s.ball.y,y0,'v24.3: frozen');
});
test('rally points are unchanged (stopDead still stops the ball after a rally point)',()=>{
 for(const playOut of [true,false]){const model=createTennis({config,seed:9,difficulty:'easy',phoneFixE:true,stopDead:true,playOut}),s=model.getState();
  let guard=0;while(s.pointNumber===0&&guard++<20000){model.update(dt,{serve:s.phase==='serve'&&guard%40<2,swing:guard%9===0,prepare:guard%9<5});}
  if(s.event.reason==='doubleFault')continue;const b={...s.ball};follow(model,s,.3);
  if(s.phase==='point'&&!s.deadBall)assert.deepEqual([s.ball.x,s.ball.y,s.ball.z],[b.x,b.y,b.z]);}
});
