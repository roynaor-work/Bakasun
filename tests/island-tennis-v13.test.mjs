import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {baseConfig} from '../workout/island/verification/tennis-v13/sim.mjs';
import {rally} from '../workout/island/verification/tennis-v13/hold-sim.mjs';

const off={...baseConfig,v9:{...baseConfig.v9,hold:{...baseConfig.v9.hold,carry:{...baseConfig.v9.hold.carry,enabled:false}}}};
const summary=(config,diff,hold,n=30)=>{const t={n:0,good:0,power:0};for(let seed=1;seed<=n;seed++){const r=rally(diff,hold,seed,config);if(!r)continue;t.n++;if(r.grade==='good')t.good++;t.power+=r.power;}return {n:t.n,good:t.good/Math.max(1,t.n),power:t.power/Math.max(1,t.n)};};

test('tennis v13: press when the ball leaves the opponent and release in the green: the shot waits for the ball and is a good one',()=>{
  for(const diff of ['easy','normal','hard']){
    const centre=summary(baseConfig,diff,1.3),before=summary(off,diff,1.3);
    assert.ok(centre.n>=25,`${diff} hits ${centre.n}`);
    assert.ok(centre.good>=(diff==="hard"?.5:.7),`${diff} v13 good ${centre.good}`);
    assert.ok(before.good<=.3,`${diff} v12 good ${before.good}`);
  }
});

test('tennis v13: the further from the centre of the bar, the weaker the shot (power and grade)',()=>{
  const edgeLow=summary(baseConfig,'normal',.5),centre=summary(baseConfig,"normal",1.3);
  assert.ok(centre.power>edgeLow.power+.05,`power ${edgeLow.power.toFixed(2)} -> ${centre.power.toFixed(2)}`);
  assert.ok(centre.good>edgeLow.good+.5,`good ${edgeLow.good} -> ${centre.good}`);
});

test('tennis v13: holding the whole flight fires by itself, and is too strong (not the green)',()=>{
  const whole=summary(baseConfig,'normal',null);
  assert.ok(whole.n>=25,'the held shot fires when the ball arrives');
  const centre=summary(baseConfig,'normal',1.3);assert.ok(whole.good<=centre.good,`whole flight good ${whole.good} vs centre ${centre.good}`);assert.ok(whole.power>centre.power,'holding to the arrival is stronger than the centre release (and so a little too strong)');
});

test('tennis v13: the crowd faces the camera part of the way, sways, hops after a point and has a shaded base; each has its flag',async()=>{
  const src=await readFile(new URL('../workout/island/minigames/tennis-v12-stadium.mjs',import.meta.url),'utf8');
  for(const part of ['tennisFansTurn','uTime','cheerNow','smoothstep(0.0,0.55,uv.y)','dummy.scale.setScalar'])assert.ok(src.includes(part),part);
  const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.tennis;
  assert.equal(config.v9.hold.carry.enabled,true);assert.ok(config.v9.hold.carry.releaseWait>=1.2);
});
