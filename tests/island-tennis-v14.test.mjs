import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {baseConfig} from '../workout/island/verification/tennis-v14/sim.mjs';
import {play} from '../workout/island/verification/tennis-v14/drop.mjs';

const off={...baseConfig,v9:{...baseConfig.v9,dropFix:{...baseConfig.v9.dropFix,enabled:false}}};
const measure=(cfg,stage,diff,n=8)=>{const a={drops:0,instant:0,returned:0};for(let m=1;m<=n;m++){const o=play(stage,diff,m,cfg,3);a.drops+=o.drops;a.instant+=o.instant;a.returned+=o.returned;}return {drops:a.drops,instant:a.instant/a.drops,returned:a.returned/a.drops};};

test('tennis v14: a near-net drop shot is answered (the point does not end at once), at every difficulty',()=>{
  for(const [stage,diff] of [[1,'easy'],[6,'easy'],[10,'normal']]){
    const before=measure(off,stage,diff),after=measure(baseConfig,stage,diff);
    assert.ok(after.drops>=40,`${diff} drops ${after.drops}`);
    assert.ok(after.instant<=.15,`${diff} stage ${stage}: ${(100*after.instant).toFixed(0)}% of drops win outright (was ${(100*before.instant).toFixed(0)}%)`);
    assert.ok(before.instant>=.25,`${diff} stage ${stage}: before the fix ${(100*before.instant).toFixed(0)}% win outright`);
  }
});

test('tennis v14: the drop floats longer (slower, higher arc) and the flag turns the fix off',async()=>{
  const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.tennis;
  assert.ok(cfg.v9.dropFix.flightScale>=1.1);/* v15 (final-fix): 1.15, measured so the drop crosses the net at about 1.1-2.1 m instead of 2.9-3.4 m with 1.6; see verification/final-fix-fable/REPORT-tennis.md */assert.equal(cfg.v9.dropFix.enabled,true);
  const session=await readFile(new URL('../workout/island/minigames/tennis-session.mjs',import.meta.url),'utf8');
  assert.ok(session.includes("'tennisDrop')==='0'"));
});

test('tennis v14: the hit bar is up for every incoming ball and is big (static check; the browser test proves it on screen)',async()=>{
  const css=await readFile(new URL('../workout/island/minigames/tennis.css',import.meta.url),'utf8');
  assert.ok(/tennis-serve-meter\[data-mode=hit\]\{[^}]*height:128px/.test(css));
  const {createTennis}=await import('../workout/island/minigames/tennis.mjs');
  const m=createTennis({config:baseConfig,stage:5,seed:3,difficulty:'normal'}),s=m.getState();
  s.phase='rally';s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=6;Object.assign(s.ball,{x:0,z:6,y:baseConfig.ball.hitHeight,lastHitter:1,bounces:1});s.contact={side:0,at:s.elapsed+2,eta:2,x:0,z:6};
  m.update(1/60,{});assert.equal(m.getState().hitMeter.active,true,'an incoming ball shows the bar with nothing pressed');
  s.shot={serving:false,side:0};m.update(1/60,{});assert.equal(m.getState().hitMeter.active,false,'no incoming ball, no bar');
});
