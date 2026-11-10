import test from 'node:test';
import assert from 'node:assert/strict';
import {baseConfig} from '../workout/island/verification/tennis-v12/sim.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';

const hold=baseConfig.v9.hold;
function swingAt(seconds,{difficulty='normal',seed=7,aim={manual:true,x:.2,z:0},flag}={}){
  const m=createTennis({config:baseConfig,stage:10,seed,difficulty,ranks:{speed:3,hit:3,serve:3},...(flag===false?{hold:false}:{})}),s=m.getState();
  s.phase='rally';s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=6;Object.assign(s.ball,{x:0,z:6,y:baseConfig.ball.hitHeight,lastHitter:1,bounces:1});s.contact={side:0,at:s.elapsed,eta:0,x:0,z:6};
  m.update(baseConfig.simulation.step*1.01,{prepare:true,aim});s.charge=Math.min(1,seconds/(flag===false?baseConfig.player.chargeSeconds:hold.seconds));
  m.update(baseConfig.simulation.step*1.01,{prepare:true,aim});const bar=s.hitMeter;m.update(0,{prepare:true,aim,swing:true});m.update(0,{swing:false,aim});return {bar,shot:s.shot};
}
const verdict=r=>{const v=r.shot.v9;return v.error==='net'||v.error==='out'?'error':Math.abs(v.landing)>9.06?'out':Math.abs(v.landing-v.depth)<=1.2?'target':v.landing<v.depth?'short':'long';};

test('tennis v12 (v13 numbers): the bar fills over 3 s and the green is a wide window in the middle, not the first instant',()=>{
  assert.equal(hold.seconds,3);
  assert.equal(swingAt(.2).bar.active,false,'a quick tap shows no bar');
  assert.equal(swingAt(1.35).bar.zone,'green','the centre of the bar (1.35 s) is green');
  const span=[...Array(31)].map((_,i)=>.1*i).filter(t=>swingAt(t).bar?.zone==='green').length*.1;
  assert.ok(span>=1.0,`the green window is ${span.toFixed(1)} s wide`);
  assert.equal(swingAt(3).bar.zone,'red','holding to the very end is red');
});

test('tennis v12: a quick tap still makes a good shot, holding inside the window does too, a hold that is too long is out',()=>{
  for(const difficulty of ['easy','normal','hard']){
    let ok=0,n=40;
    for(let seed=1;seed<=n;seed++){
      const tap=verdict(swingAt(.2,{difficulty,seed})),inWindow=verdict(swingAt(1.35,{difficulty,seed})),late=verdict(swingAt(3,{difficulty,seed}));
      if(tap==='target'&&inWindow==='target')ok++;
      assert.ok(['out','long'].includes(late)||late==='error','3 s of holding is too much: '+late);
    }
    assert.ok(ok/n>=.8,`${difficulty}: tap and window shots are on target ${ok}/${n}`);
  }
});

test('tennis v12: the flag brings back the v11 timing (a 0.5 s hold is already too much)',()=>{
  const old=swingAt(.5,{flag:false});assert.ok(['out','long'].includes(verdict(old))||verdict(old)==='error');
  assert.ok(['yellow','red'].includes(swingAt(.5).bar.zone));
});

test('tennis v12: easy has a wider green than hard',()=>{
  const width=d=>[...Array(25)].map((_,i)=>.1*i).filter(t=>swingAt(t,{difficulty:d}).bar?.zone==='green').length;
  assert.ok(width('easy')>width('hard'),`easy ${width('easy')} hard ${width('hard')}`);
});
