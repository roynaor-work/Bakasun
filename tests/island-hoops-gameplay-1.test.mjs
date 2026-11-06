import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
import {inboundReceiverSpot,reboundCrasher,passReason} from '../workout/island/minigames/hoops-ai.mjs';
import {simulate} from '../workout/island/tools/hoops-gameplay-sim.mjs';
const full=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const cfg=full.minigames.streetSlam;
const court={hx:14.3,hz:7.6};

test('hoopsAI flag: v2 is the default, v1 restores the previous behaviour, and the session wires the URL flag', async () => {
 const clubs=matchTeams(structuredClone(cfg),initialHoops(cfg),{stage:1});
 assert.equal(createHoopsEngine({config:cfg,seed:1,teams:clubs.teams,profile:'quick'}).debug.api.aiV2,true);
 assert.equal(createHoopsEngine({config:cfg,seed:1,teams:clubs.teams,profile:'quick',aiVersion:'v1'}).debug.api.aiV2,false);
 const session=await readFile(new URL('../workout/island/minigames/hoops-session.mjs',import.meta.url),'utf8');
 assert.match(session,/params\.get\('hoopsAI'\)==='v1'\?'v1':'v2'/);
});

test('inbound receiver is never sent beyond the baseline or the sideline', () => {
 // team attacks +x; throw-in on the sideline 1.5 m from the attacked baseline: used to be x = 12.8 + 1.8 = 14.6 (out)
 const spot={x:12.8,z:8.0},old={x:spot.x+1.8,z:Math.sign(spot.z)*(court.hz-3.2)};
 assert.ok(old.x>court.hx,'the old target was out of bounds');
 const t=inboundReceiverSpot(old,spot,1,court);
 assert.ok(t.x<=court.hx-1.2&&t.x<spot.x,'comes back towards the court');
 assert.ok(Math.abs(t.z)<=court.hz-1.2);
 // every throw-in spot and direction ends inside the court with a margin
 for(const sx of [-14.7,-12.8,-6,0,6,12.8,14.7])for(const sz of [-8,-2,2,8])for(const s of [-1,1]){
  const raw={x:sx+s*(Math.abs(sz)>court.hz?1.8:3),z:Math.abs(sz)>court.hz?Math.sign(sz)*(court.hz-3.2):sz+(sz>0?-2:2)};
  const r=inboundReceiverSpot(raw,{x:sx,z:sz},s,court);
  assert.ok(Math.abs(r.x)<=court.hx-1.2+1e-9&&Math.abs(r.z)<=court.hz-1.2+1e-9,JSON.stringify({sx,sz,s,r}));
 }
});

test('a sideways pass under pressure needs a really open, at-least-as-good receiver (v2) and is free in v1', () => {
 const base={progress:0,pressure:1,hold:1.5,clock:15,myShot:0.7,worth:1};
 const need={open:1.8,gain:0.95};
 assert.equal(passReason({...base,receiverOpen:1.2,receiverShot:0.8}),'pressure','v1 behaviour: any receiver');
 assert.equal(passReason({...base,receiverOpen:1.2,receiverShot:0.8,sidewaysNeed:need}),null,'contested receiver: no pass');
 assert.equal(passReason({...base,receiverOpen:2.5,receiverShot:0.5,sidewaysNeed:need}),null,'worse look: no pass');
 assert.equal(passReason({...base,receiverOpen:2.5,receiverShot:0.75,sidewaysNeed:need}),'pressure','open and better: pass');
 assert.equal(passReason({...base,progress:1.5,receiverOpen:0.5,receiverShot:0.1,sidewaysNeed:need}),'advance','advancing passes are not restricted');
});

test('only the two bigs crash the offensive glass, never the shooter', () => {
 const mk=(id,pos)=>({id,pos}),five=[mk('a','PG'),mk('b','SG'),mk('c','SF'),mk('d','PF'),mk('e','C')];
 assert.deepEqual(five.filter(p=>reboundCrasher(p,five,'b')).map(p=>p.id),['d','e']);
 assert.deepEqual(five.filter(p=>reboundCrasher(p,five,'e')).map(p=>p.id),['d'],'the shooting big stays out; one crasher');
});

test('AI v2 vs v1 over fixed seeds: fewer pointless sideways passes, fewer offensive rebounds, no break in the rules', () => {
 const a=simulate({games:24,ai:'v1',profile:'quick',seedBase:4100}),b=simulate({games:24,ai:'v2',profile:'quick',seedBase:4100});
 assert.ok(b.passing.contestedLateralPct<a.passing.contestedLateralPct*0.6,`contested sideways ${a.passing.contestedLateralPct} -> ${b.passing.contestedLateralPct}`);
 assert.ok(b.rebounds.offensivePct<a.rebounds.offensivePct-5,`offensive rebounds ${a.rebounds.offensivePct} -> ${b.rebounds.offensivePct}`);
 assert.ok(b.shooting.fgPct>38&&b.shooting.fgPct<55&&b.shooting.pointsPerTeamGame>8,'still a normal game');
 assert.equal(b.turnovers.doubleDribble,0);assert.equal(b.turnovers.travel,0);
});
