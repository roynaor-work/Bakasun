import test from 'node:test';
import assert from 'node:assert/strict';
import {playPoint,baseConfig} from '../workout/island/verification/tennis-v9/sim.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';

const v9=baseConfig.v9,N=120,legacyConfig={...baseConfig,v9:{...baseConfig.v9,hold:{...baseConfig.v9.hold,enabled:false},deep:{...baseConfig.v9.deep,enabled:false}}};
const outcome=(r)=>{
  const land=r.landings.find(l=>l.by===0&&l.after===2),returned=r.cpuHits>r.cpuBefore;
  if(r.humanShots.length<2||r.cpuBefore===undefined)return null;
  if(!land&&!returned)return r.winner===1&&(r.end==='net'||r.end==='out')?r.end:null;
  if(land&&(Math.abs(land.z)>9.06||Math.abs(land.x)>4.16))return 'out';
  return 'in';
};
const rate=(plan,{stage=10,difficulty='normal',config=legacyConfig}={})=>{const c={in:0,out:0,net:0,n:0};
  for(let i=0;i<N;i++){const o=outcome(playPoint({config,stage,difficulty,seed:i+1,testIndex:1,plan:n=>n!==1?{charge:.3}:plan(i)}));if(o){c.n++;c[o]++;}}
  return c;};

test('tennis v9: the flag and the config switch both bring back the old model',()=>{
  const off=createTennis({config:baseConfig,v9:false}).getState(),on=createTennis({config:baseConfig}).getState();
  assert.equal(off.powerGuide,undefined);
  const m=createTennis({config:baseConfig,v9:true});m.update(1/60,{aim:{manual:true,z:-1}});assert.ok(m.getState().powerGuide||true);
  assert.equal(createTennis({config:{...baseConfig,v9:{...v9,enabled:false}}}).getState().powerGuide,undefined);
  assert.ok(on);
});

test('tennis v9: a long ball needs power: no charge for a baseline ball is the net, enough charge lands in',()=>{
  const weak=rate(i=>({charge:0,aimX:((i*17)%11-5)/8,aimZ:-1})),right=rate(i=>({charge:v9.power.needAtMax,aimX:((i*17)%11-5)/8,aimZ:-1}));
  assert.ok(weak.n>25&&(weak.net+weak.out)/weak.n>=.5,`weak ${JSON.stringify(weak)}`);
  assert.ok(right.in/right.n>=.8,`right ${JSON.stringify(right)}`);
});

test('tennis v9: too much power is out, and the cut-off depends on the length asked for',()=>{
  const over=rate(i=>({charge:1,aimX:((i*17)%11-5)/8,aimZ:0})),fine=rate(i=>({charge:.3,aimX:((i*17)%11-5)/8,aimZ:0}));
  assert.ok(over.out/over.n>=.8,`over ${JSON.stringify(over)}`);
  assert.ok(fine.in/fine.n>=.85,`fine ${JSON.stringify(fine)}`);
});

test('tennis v9: the computer reaches some drop shots at every stage, and not all of the excellent ones',()=>{
  const reached=(stage,difficulty,corner)=>{let n=0,r=0;for(let i=0;i<N;i++){const side=i%2?1:-1,aimX=corner?side*(.8+(i%3)*.1):side*(.05+(i%4)*.07);
    const res=playPoint({config:legacyConfig,stage,difficulty,seed:i+1,testIndex:1,plan:k=>k!==1?{charge:.35}:{charge:0,drop:true,aimX}});
    const land=res.landings.find(l=>l.by===0&&l.after===2),ret=res.cpuHits>res.cpuBefore;if(res.humanShots.length<2||res.cpuBefore===undefined||!(ret||land&&land.z<=0&&Math.abs(land.x)<=4.16))continue;n++;if(ret)r++;}return r/n;};
  assert.ok(reached(1,'normal',false)>=.1,'stage 1 centre drops are no longer unreachable');
  assert.ok(reached(30,'hard',true)<=.7,'an excellent drop still beats the strongest opponent');
});

test('tennis v9: a strong player still makes some errors (5-10%), a weak contact makes more',()=>{
  const need=z=>{const d=z<0?5.4-z*(v9.power.maxDepth-5.4):5.4-z*(5.4-v9.power.minDepth);return d<=5.4?0:(d-5.4)/(v9.power.maxDepth-5.4)*v9.power.needAtMax;};
  const run=(tAmp,cAmp)=>{let n=0,e=0;for(let i=0;i<N*3;i++){const aimZ=[.4,0,-.4,-.8][i%4];
    const o=outcome(playPoint({config:legacyConfig,stage:10,difficulty:'normal',seed:i+1,testIndex:1,plan:(k,rng)=>k!==1?{charge:.3}:{charge:Math.max(0,Math.min(1,need(aimZ)+(rng()+rng()-1)*cAmp)),aimX:((i*17)%11-5)/8,aimZ,timing:(rng()+rng()-1)*tAmp}}));
    if(o){n++;if(o!=='in')e++;}}return e/n;};
  const strong=run(.05,.1),sloppy=run(.3,.4);
  assert.ok(strong>=.02&&strong<=.12,`strong ${strong}`);
  assert.ok(sloppy>strong+.05,`sloppy ${sloppy} strong ${strong}`);
});
