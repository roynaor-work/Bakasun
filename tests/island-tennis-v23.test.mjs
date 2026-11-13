// Tennis v23 (13/11/2026). Roy after v22 on the phone: "the computer does get to the small shot, but there still has to be a situation where the
// ball takes time and bounces, with enough time to run even if you do not get there. And the bar that shows when to press is in the way of the game,
// it should be more to the side."
// Measured through the same input path the phone uses (workout/island/verification/tennis-v23/drops.mjs), >=200 child drops per difficulty,
// v22 (softDrop off, the model default) against v23 (softDrop on, what the session turns on from config).
//   node workout/island/verification/tennis-v23/drops.mjs            prints the before/after table
//   CHROMIUM_PATH=... node workout/island/tests/tennis-v23-browser.mjs   the bar on screen, through the real island with real touch
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {measure,playMatch,baseConfig} from '../workout/island/verification/tennis-v23/drops.mjs';

const DIFFS=['easy','normal','hard'],sdc=baseConfig.v9.softDrop,cache=new Map();
const get=(difficulty,softDrop,bot='mix')=>{const key=`${difficulty}:${softDrop}:${bot}`;if(!cache.has(key))cache.set(key,measure({difficulty,softDrop,bot}));return cache.get(key);};
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('tennis v23: the near-net drop floats (1.6 to 2 s to the first bounce, 2.3 s or more to the second), lands close to the net and bounces where it can be seen',()=>{
  for(const difficulty of DIFFS){
    const after=get(difficulty,true),before=get(difficulty,false);
    assert.ok(after.drops>=200,`${difficulty}: ${after.drops} drops`);
    assert.ok(after.firstBounce[1]>=1.6&&after.firstBounce[1]<=2,`${difficulty}: release to the first bounce ${after.firstBounce} s (v22 ${before.firstBounce})`);
    assert.ok(after.firstBounce[0]>=1.55,`${difficulty}: the quickest drops still float (p10 ${after.firstBounce[0]} s)`);
    assert.ok(after.secondBounce[1]>=2.3,`${difficulty}: release to the second bounce ${after.secondBounce} s (v22 ${before.secondBounce})`);
    assert.ok(after.bounceHeight>=.6,`${difficulty}: the bounce rises to ${after.bounceHeight} m (v22 ${before.bounceHeight} m)`);
    assert.ok(after.landPastNet[0]>=1.2&&after.landPastNet[1]<=2.3,`${difficulty}: lands ${after.landPastNet} m past the net`);
    assert.ok(after.apex>=3.3&&after.apex<=5,`${difficulty}: top of the arc ${after.apex} m`);
    assert.ok(before.firstBounce[1]<1.6&&before.bounceHeight<.4,`${difficulty}: v22 fell in ${before.firstBounce[1]} s and bounced ${before.bounceHeight} m`);
  }
});

test('tennis v23: the opponent never takes the drop out of the air, and reaches about 90% on easy, 60% on normal, 40% on hard (the share is in config)',()=>{
  assert.deepEqual(sdc.reach,{easy:.9,normal:.6,hard:.4});
  for(const difficulty of DIFFS){
    const after=get(difficulty,true),before=get(difficulty,false),target=sdc.reach[difficulty];
    assert.equal(after.beforeBounce,0,`${difficulty}: ${(100*after.beforeBounce).toFixed(0)}% of the reached drops were taken before the bounce`);
    assert.ok(Math.abs(after.reached-target)<=.1,`${difficulty}: the opponent reaches ${(100*after.reached).toFixed(0)}% (target ${100*target}%, v22 ${(100*before.reached).toFixed(0)}%)`);
    assert.ok(after.touchHeight>=.5,`${difficulty}: it hits the ball near the top of the bounce (${after.touchHeight} m)`);
    assert.ok(before.reached>=.88,`${difficulty}: v22 reached ${(100*before.reached).toFixed(0)}%`);
  }
  assert.ok(get('normal',false).beforeBounce>=.5&&get('hard',false).beforeBounce>=.5,'v22 took most drops out of the air');
});

test('tennis v23: a drop still never wins in a second (quickest untouched win over 2.2 s) and the median point stays between 5 and 12 s',()=>{
  for(const difficulty of DIFFS){
    const after=get(difficulty,true),before=get(difficulty,false);
    assert.ok(after.quickestWin>=2.2,`${difficulty}: the quickest untouched drop win took ${after.quickestWin} s (v22 ${before.quickestWin} s)`);
    assert.ok(after.pointSeconds[1]>=5&&after.pointSeconds[1]<=12,`${difficulty}: median point ${after.pointSeconds[1]} s (v22 ${before.pointSeconds[1]} s)`);
    assert.equal(after.timeouts,0,`${difficulty}: rallies that hit the 90 s cut-off`);
  }
});

test('tennis v23: when the opponent does not get there it was running for it: it took the high ball for a lob, stepped back, sprinted in, and is still over a metre away at the second bounce',()=>{
  for(const difficulty of ['normal','hard']){
    const after=get(difficulty,true);
    assert.ok(after.missAiGap[0]>=1,`${difficulty}: the closest the opponent got by the second bounce was ${after.missAiGap[0]} m (median ${after.missAiGap[1]} m)`);
    assert.ok(after.missAiSpeed>=2,`${difficulty}: it was still running at ${after.missAiSpeed} m/s`);
    assert.ok(after.backpedal>=.5,`${difficulty}: it first stepped back ${after.backpedal} m`);
  }
});

test('tennis v23: after the second bounce the dead ball keeps bouncing and rolls out on the court; in v22 it froze where it was',()=>{
  const after=get('normal',true),before=get('normal',false);
  assert.ok(after.dead>=20,`dead balls ${after.dead}`);
  assert.ok(after.deadBounces>=1,`bounces after the point ${after.deadBounces}`);
  assert.ok(after.deadRoll<=3&&after.deadInCourt>=.9,`rolls up to ${after.deadRoll} m, ${(100*after.deadInCourt).toFixed(0)}% stay on the court`);
  const frozen=Array.from({length:6},(_,i)=>playMatch({stage:10,difficulty:'normal',seed:i+1,softDrop:false})).flatMap(o=>o.dead);
  assert.ok(frozen.length>=3&&frozen.every(d=>d.maxMove===0&&d.bounces===0),'v22: the ball stops dead at the point');
});

test('tennis v23: the opponent\'s own drop floats the same way, so the child has time to run in and can now reach it (v22: never)',()=>{
  for(const difficulty of ['normal','hard']){
    const after=get(difficulty,true),before=get(difficulty,false);
    assert.ok(after.aiDrops>=30&&before.aiDrops>=30,`${difficulty}: opponent drops ${after.aiDrops}/${before.aiDrops}`);
    assert.ok(after.aiFirstBounce>=1.6&&after.aiBounceHeight>=.6,`${difficulty}: the opponent's drop ${after.aiFirstBounce} s to the bounce, bounces ${after.aiBounceHeight} m`);
    assert.ok(after.childReaches>=.6,`${difficulty}: the child bot reaches ${(100*after.childReaches).toFixed(0)}% (v22 ${(100*before.childReaches).toFixed(0)}%)`);
    assert.equal(before.childReaches,0,`${difficulty}: in v22 the opponent's drop bounced under the child's lowest legal contact`);
  }
});

test('tennis v23: pressing the drop button on every ball does not pay: a repeated drop is read and put away, and there is no endless rally of drops',()=>{
  for(const difficulty of DIFFS){
    const spam=get(difficulty,true,'spam'),mix=get(difficulty,true);
    assert.ok(spam.repeatReached>=Math.min(1,sdc.reach[difficulty]+sdc.readRepeat)-.12,`${difficulty}: a repeated drop is reached ${(100*spam.repeatReached).toFixed(0)}%`);
    assert.ok(spam.reached>mix.reached,`${difficulty}: spamming is reached more (${(100*spam.reached).toFixed(0)}% vs ${(100*mix.reached).toFixed(0)}%)`);
    assert.equal(spam.timeouts,0,`${difficulty}: rallies cut off at 90 s`);assert.ok(spam.longestPoint<45,`${difficulty}: longest point ${spam.longestPoint} s`);
  }
  assert.ok(get('easy',true,'spam').putAways>=5,'the opponent puts away the drops it read');
});

test('tennis v23: model default is v22 (the session turns v23 on), flags and config keys',async()=>{
  const session=await read('../workout/island/minigames/tennis-session.mjs'),config=JSON.parse(await read('../workout/island/data/config.json')).minigames.tennis;
  assert.ok(session.includes("'tennisSoftDrop')==='0'")&&session.includes('balance.v9?.softDrop?.enabled!==false'),'?tennisSoftDrop=0 brings v22 back');
  assert.ok(session.includes("'tennisMeter')==='v15'"),'?tennisMeter=v15 puts the bar next to the player again');
  assert.ok(session.includes("'tennisMeter')==='0'"),'?tennisMeter=0 still removes the meter (v11 switch)');
  const v=config.v9.softDrop;assert.equal(v.enabled,true);assert.equal(config.v9.meter.place,'side');
  for(const d of DIFFS){assert.ok(v.flight[d]>=1.6&&v.flight[d]<=2.4,`flight ${d}`);assert.ok(v.reach[d]>0&&v.reach[d]<=1);}
  // same seed and inputs: omitting softDrop is exactly v22
  const run=extra=>{const m=createTennis({config:baseConfig,stage:9,seed:77,difficulty:'normal',returnMeter:true,...extra});for(let i=0;i<60*40;i++){const s=m.getState();m.update(1/60,{serve:s.server===0&&(s.phase==='serve'||s.phase==='toss'&&Math.abs(s.serveMeter-.5)<.05),swing:s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<.05,drop:i%3===0,move:s.contact?.side===0?Math.sign(s.contact.x-s.players[0].x):0});}return m.snapshot();};
  assert.deepEqual(run({}),run({softDrop:false}),'softDrop omitted = softDrop false');
  const soft=run({softDrop:true});assert.notDeepEqual(soft,run({}),'softDrop true changes the match');
});

test('tennis v23: the bar has one home at the side, left of the buttons, and is dimmed when not in use (static; the browser script proves it on screen)',async()=>{
  const css=await read('../workout/island/minigames/tennis.css'),session=await read('../workout/island/minigames/tennis-session.mjs');
  const side=css.match(/\.tennis-serve-meter\[data-place=side\],[^{]*\{([^}]*)\}/);assert.ok(side,'side rule');
  const width=Number(/width:(\d+)px/.exec(side[1])?.[1]),height=Number(/height:(\d+)px/.exec(side[1])?.[1]);
  assert.ok(width>=20&&height>=128,`side bar ${width}x${height}`);
  const idle=css.match(/\[data-place=side\]\[data-idle=true\]\{([^}]*)\}/),opacity=Number(/opacity:([\d.]+)/.exec(idle?.[1]||'')?.[1]);
  assert.ok(opacity>.2&&opacity<.6,`dimmed to ${opacity} when not in use`);
  assert.ok(/tennis-serve-meter\[data-mode=hit\]\{[^}]*height:128px/.test(css),'the v15 placement (?tennisMeter=v15) keeps its size');
  assert.ok(session.includes("meter.dataset.place='side'")&&/placeSide[^]*soccer-actions/.test(session)&&session.includes('meter.dataset.idle'),'placed from the real action buttons, idle state');
  const strings=JSON.parse(await read('../workout/island/data/strings.he.json'));
  assert.match(strings['minigame.tennis.help.1'],/בצד/);assert.doesNotMatch(strings['minigame.tennis.help.1'],/ליד השחקן/);
});
