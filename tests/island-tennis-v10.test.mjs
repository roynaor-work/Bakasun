import test from 'node:test';
import assert from 'node:assert/strict';
import {playPoint,baseConfig} from '../workout/island/verification/tennis-v10/sim.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';

const N=400;
const classify=r=>{const land=r.landings.find(l=>l.by===0&&l.after===2),ret=r.cpuHits>r.cpuBefore;if(r.humanShots.length<2||r.cpuBefore===undefined)return null;
 if(!land&&!ret)return r.winner===1&&(r.end==='net'||r.end==='out')?'bad':null;if(land&&(Math.abs(land.z)>9.06||Math.abs(land.x)>4.16))return 'bad';return 'in';};
const byZone=(config,offsets)=>{const g={};for(let i=0;i<N;i++){const t=offsets[i%offsets.length]*(i%2?1:-1);
  const r=playPoint({config,stage:10,difficulty:'normal',seed:i+1,testIndex:1,plan:n=>n!==1?{charge:.3}:{charge:.3,aimX:((i*17)%11-5)/8,aimZ:0,timing:t}});
  const c=classify(r);if(!c||!r.grade)continue;g[r.grade]??={n:0,in:0};g[r.grade].n++;if(c==='in')g[r.grade].in++;}return g;};

test('tennis v11: one bar, only while the hit button is held; the needle is the charge measured from the ideal one, green in the centre',()=>{
  const m=createTennis({config:baseConfig,stage:5,seed:3,difficulty:'normal'});
  const s=m.getState();s.phase='rally';s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=6;Object.assign(s.ball,{x:0,z:6,y:baseConfig.ball.hitHeight,lastHitter:1,bounces:1});s.contact={side:0,at:s.elapsed+2,eta:2,x:0,z:6};
  m.update(1/60,{});assert.equal(m.getState().hitMeter.active,false,'no button, no bar');
  m.update(1/60,{prepare:true,aim:{manual:false,x:0,z:0}});let hm=m.getState().hitMeter;assert.equal(hm.active,true);assert.equal(hm.zone,'green','a quick tap at the default length is green');assert.ok(Math.abs(hm.value-.5)<hm.greenHalf);
  for(let i=0;i<70;i++)m.update(1/60,{prepare:true,aim:{manual:false,x:0,z:0}});hm=m.getState().hitMeter;assert.ok(hm.value>.5+hm.greenHalf&&hm.zone!=='green','holding too long moves the needle above the green');
  const deep=createTennis({config:baseConfig,stage:5,seed:3,difficulty:'normal'}),ds=deep.getState();ds.phase='rally';ds.shot={serving:false,side:1};ds.contact={side:0,at:ds.elapsed+2,eta:2,x:0,z:6};
  deep.update(1/60,{prepare:true,aim:{manual:true,x:0,z:-1}});const dm=deep.getState().hitMeter;assert.ok(dm.value<.5-dm.greenHalf,'a deep ball with no charge sits below the green: it needs power');
  const off=createTennis({config:baseConfig,stage:5,seed:3,difficulty:'normal',meter:false}),os=off.getState();os.phase='rally';os.shot={serving:false,side:1};off.update(1/60,{prepare:true});assert.equal(os.hitMeter,undefined);
});

test('tennis v10: green is nearly always in, the rims are worse, and the worse the zone the likelier net or out',()=>{
  const g=byZone(baseConfig,[0,.04,.06,.08,.2]),rate=z=>g[z]?g[z].in/g[z].n:null;
  assert.ok(g.good.n>30&&g.weak.n>15,JSON.stringify(g));
  assert.ok(rate('good')>=.88,`good ${rate('good')}`);
  assert.ok(rate('weak')<=.65&&rate('weak')>=.35,`weak ${rate('weak')}`);
  assert.ok(g.medium.n>15&&rate("medium")<rate("good")&&rate("weak")<rate("medium"),`order ${JSON.stringify(g)}`);
});
