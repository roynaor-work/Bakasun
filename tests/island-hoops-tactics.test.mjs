import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
import {compileHoopsTactics,loadHoopsTactics,createHoopsTacticsController,tacticalWorldPoint} from '../workout/island/minigames/hoops-tactics.mjs';

const root=new URL('../workout/island/',import.meta.url),cfg=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.streetSlam;
const authored=JSON.parse(await readFile(new URL('design/tactics/basketball.json',root),'utf8'));
function fixture(){
 const setup=matchTeams(cfg,initialHoops(cfg)),e=createHoopsEngine({config:cfg,seed:27,teams:setup.teams,userTeam:0,profile:'quick'}),a=e.debug.api,s=a.S;
 e.debug.setPhase('live');s.clock=80;s.shotClock=24;
 for(const team of s.teams){team.tactics={offense:'motion',defense:'man'};team.ai={assign:{},lastPossession:0,transition:0};for(const p of a.onCourt(team.index)){p.think=1e6;p.goal=null;p.intent={x:0,z:0,speed:0,face:null,sprint:false};team.ai.assign[p.id]=a.onCourt(1-team.index).find(q=>q.pos===p.pos).id;}}
 const pg=a.onCourt(0).find(p=>p.pos==='PG');e.debug.give(pg.id);s.controlled=pg.id;e.drainEvents();return {e,a,s,pg};
}
const near=(actual,expected)=>assert.ok(Math.hypot(actual.x-expected.x,actual.z-expected.z)<.001,JSON.stringify({actual,expected}));
const world=(e,point,side=1)=>tacticalWorldPoint(point,side,e.court);

test('the loader compiles the real basketball package, including authored rules and timeline',async()=>{
 let requested;const data=await loadHoopsTactics({fetcher:async url=>{requested=url;return {ok:true,json:async()=>structuredClone(authored)};}});
 assert.match(String(requested),/design\/tactics\/basketball\.json$/);assert.equal(data.source,'design/tactics/basketball.json');
 assert.equal(data.settings.decision,authored.parameters.decisionIntervalMs.example/1000);assert.equal(data.settings.screenStop,.25);
 assert.equal(data.offense.pick_and_roll.frames.at(-1).owner,'C');assert.equal(data.offense.pick_and_roll.frames[1].id,'screen_set');
 assert.throws(()=>compileHoopsTactics({...authored,sport:'other'}),/contract/);
 const invalid=structuredClone(authored);invalid.offense[0].keyframes[0].positions.PG.x=2;assert.throws(()=>compileHoopsTactics(invalid),/position/);
 await assert.rejects(()=>loadHoopsTactics({fetcher:async()=>({ok:false,status:404})}),/unavailable: 404/);
});

test('engine tactics change real off-ball goals, preserve user movement and use both court directions',()=>{
 const {e,a,s,pg}=fixture(),compiled=compileHoopsTactics(authored),sg=a.onCourt(0).find(p=>p.pos==='SG');
 const sentinel={x:1,z:2};pg.goal=sentinel;e.debug.place(pg.id,1,1);const coords={x:pg.x,z:pg.z};
 e.setTacticsData(compiled);e.step(NO_INPUT);
 assert.equal(e.tacticsMetrics.loaded,true);assert.equal(e.tacticsMetrics.teams[0].plan,'spacing');assert.equal(pg.goal,sentinel);near(pg,coords);
 const frame=authored.offense.find(p=>p.id==='spacing').keyframes[0];near(sg.goal,world(e,frame.positions.SG));
 assert.ok(sg.intent.speed>0,'AI physically steers toward the authored point');
 s.dir=[-1,1];e.callPlay(0,'iso');e.step(NO_INPUT);const iso=authored.offense.find(p=>p.id==='isolation').keyframes[0];near(sg.goal,world(e,iso.positions.SG,-1));
 assert.equal(e.tacticsMetrics.teams[0].plan,'isolation');
 e.setTacticsData(null);assert.equal(e.tacticsMetrics.loaded,false);
});

test('authored targets move AI players rather than teleporting them or assigning possession',()=>{
 const {e,a,s}=fixture(),sg=a.onCourt(0).find(p=>p.pos==='SG'),before={x:sg.x,z:sg.z};e.setTacticsData(compileHoopsTactics(authored));
 e.step(NO_INPUT);const target={...sg.goal},afterOne={x:sg.x,z:sg.z};assert.ok(Math.hypot(sg.x-before.x,sg.z-before.z)<.02);assert.ok(Math.hypot(sg.x-target.x,sg.z-target.z)>1);
 const owner=s.ball.owner;for(let i=0;i<40;i++)e.step(NO_INPUT);
 assert.ok(Math.hypot(sg.x-target.x,sg.z-target.z)<Math.hypot(afterOne.x-target.x,afterOne.z-target.z));assert.equal(s.ball.owner,owner);
});

test('pick and roll waits for a real stationary screen, handler clearance and actual center possession',()=>{
 const {e,a,s,pg}=fixture(),compiled=compileHoopsTactics(authored);compiled.settings.timeout=20;const ctl=createHoopsTacticsController(compiled),center=a.onCourt(0).find(p=>p.pos==='C');s.teams[0].call='pnr';
 const phase=()=>ctl.metrics().teams[0].phase,step=dt=>ctl.step(a,dt,'live'),plan=authored.offense.find(p=>p.id==='pick_and_roll');
 step(.001);assert.equal(phase(),'setup');step(.9);assert.equal(phase(),'screen_set');
 step(.4);assert.equal(phase(),'screen_set','elapsed time does not substitute for an arrived and stopped screener');
 const screen=world(e,plan.keyframes.find(f=>f.id==='screen_set').positions.C);e.debug.place(center.id,screen.x,screen.z);center.vx=1;
 step(.3);assert.equal(phase(),'screen_set','a moving center cannot set the screen');center.vx=0;
 for(let i=0;i<6;i++)step(.05);assert.equal(phase(),'screen_ready');step(.6);assert.equal(phase(),'clear_screen');
 e.debug.place(pg.id,screen.x,screen.z+.2);step(.6);assert.equal(phase(),'clear_screen','handler must clear lateral body spacing');
 const clear=world(e,plan.keyframes.find(f=>f.id==='clear_screen').positions.PG);e.debug.place(pg.id,clear.x,clear.z);step(.01);assert.equal(phase(),'turn_corner');
 step(.2);assert.equal(phase(),'turn_corner','handler must get ahead of the screen before the roll');
 const corner=world(e,plan.keyframes.find(f=>f.id==='turn_corner').positions.PG);e.debug.place(pg.id,corner.x,corner.z);step(.01);assert.equal(phase(),'roll_start');assert.equal(center.role,'roll');
 step(1.2);assert.equal(phase(),'roll_start');assert.equal(s.ball.owner,pg.id,'timeline does not fabricate the requested pass');
 e.debug.give(center.id);step(.01);assert.equal(phase(),'roll_receive');assert.equal(s.ball.owner,center.id);
});

test('late clock cancels the authored play and frees the handler; defense uses actual gaps, zone and a single helper',()=>{
 const {e,a,s,pg}=fixture(),ctl=createHoopsTacticsController(compileHoopsTactics(authored));s.teams[0].call='pnr';s.autopilot=true;ctl.step(a,.01,'live');
 s.shotClock=3;pg.goal={x:99,z:99};ctl.step(a,.25,'live');assert.equal(ctl.metrics().teams[0].cancelled,true);assert.equal(ctl.metrics().teams[0].plan,'spacing');assert.equal(pg.goal.x,99,'late-clock handler keeps the legacy shooting/drive decision');
 s.shotClock=24;s.autopilot=false;
 const defender=a.onCourt(1).find(p=>p.pos==='PG'),rim=e.court.rim(1);e.debug.place(pg.id,rim.x-3,0);e.debug.place(defender.id,rim.x-5,0);
 ctl.step(a,.3,'live');const helpers=a.onCourt(1).filter(p=>p.role==='help');assert.equal(helpers.length,1);
 assert.ok(Math.hypot(defender.goal.x-pg.x,defender.goal.z-pg.z)<1.5,'on-ball man follows the actual ball handler');
 s.teams[1].tactics.defense='zone';ctl.step(a,.3,'live');assert.equal(ctl.metrics().teams[1].plan,'zone_2_3');assert.ok(a.onCourt(1).every(p=>p.role==='zone'||p.role==='help'));
 const zone=authored.defense.find(p=>p.id==='zone_2_3');assert.ok(Math.abs(defender.goal.x-world(e,zone.positions.PG,-1).x)<.01);
});

test('substitutions remap authored positions and duplicate-position lineups keep five unique movers',()=>{
 const {e,a,s}=fixture(),ctl=createHoopsTacticsController(compileHoopsTactics(authored));ctl.step(a,.01,'live');
 const out=a.onCourt(0).find(p=>p.pos==='SG'),incoming=s.teams[0].roster.find(p=>!p.onCourt&&p.pos==='SG');out.onCourt=false;incoming.onCourt=true;incoming.goal=null;ctl.step(a,.3,'live');assert.ok(incoming.goal,'newly substituted player receives the role target');
 for(const p of a.onCourt(0))p.pos='SF';s.teams[0].call='iso';ctl.step(a,.3,'live');
 const movers=a.onCourt(0).filter(p=>p.id!==s.controlled);assert.ok(movers.every(p=>p.goal&&Number.isFinite(p.goal.x)&&Number.isFinite(p.goal.z)));assert.equal(new Set(movers.map(p=>p.goal)).size,4);
});

test('a whole game using the actual tactical package scores, substitutes and retains the result contract',t=>{
 const h=initialHoops(cfg),saved=JSON.stringify(h),setup=matchTeams(cfg,h),e=createHoopsEngine({config:cfg,seed:331,teams:setup.teams,userTeam:0,profile:'quick',autopilot:true});e.setTacticsData(compileHoopsTactics(authored));e.setAutoSub(true);e.debug.setEnergy(e.debug.api.onCourt(0).find(p=>p.pos==='SG').id,.01);
 let steps=0,subs=0;for(;steps<60000&&!e.result;steps++){e.step(NO_INPUT);subs+=e.drainEvents().filter(v=>v.type==='sub').length;}
 assert.ok(e.result,'the authored tactics do not stall a match');assert.ok(e.result.score.every(n=>n>=10));assert.ok(subs>0);
 assert.deepEqual(Object.keys(e.result).sort(),['won','score','userTeam','quarters','overtime','profile','box','mvp','seed','teams','energy'].sort());
 assert.ok(e.result.box.flat().every(p=>!('abilities' in p)&&!('positionName' in p)));assert.equal(JSON.stringify(h),saved);
 t.diagnostic('tactical match: '+e.result.score.join(':')+', '+steps+' steps, '+subs+' substitutions');
});
