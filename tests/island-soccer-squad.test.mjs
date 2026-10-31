import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandSoccerConfig,soccerMatchCards} from '../workout/island/minigames/soccer-squad.mjs';
import {rosterCards,initialSoccerRoster} from '../workout/island/activity/soccer-roster.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {soccerTacticsRuntimeData} from '../workout/island/tools/soccer-tactics-build.mjs';
import {SOCCER_TACTICS_DATA} from '../workout/island/minigames/soccer-tactics-data.mjs';
const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const tactics=JSON.parse(readFileSync(new URL('../workout/island/design/tactics/soccer.json',import.meta.url),'utf8'));
test('synchronous default tactics are generated from the actual design package without hand-tuned copies',()=>assert.deepEqual(SOCCER_TACTICS_DATA,soccerTacticsRuntimeData(tactics)));
test('soccer default extends each side by two with stable legacy IDs and unique tactical roles',()=>{
 const before=structuredClone(base),c=expandSoccerConfig(base);assert.equal(c.players.roster.length,12);
 assert.deepEqual(base,before);assert.deepEqual(c.players.roster.slice(0,8).map(({tacticalRole,...entry})=>entry),base.players.roster);
 for(const team of [0,1]){const members=c.players.roster.filter(p=>p.team===team);assert.equal(members.length,6);assert.equal(members.filter(p=>p.role==='keeper').length,1);assert.equal(new Set(members.map(p=>p.tacticalRole)).size,6);}
 assert.equal(c.players.roster[2].role,'keeper');assert.equal(c.players.roster[5].role,'keeper');assert.equal(expandSoccerConfig(c),c);
});
test('soccer extra-player config flag supports zero, one and two per side without mutating persisted cards',()=>{
 for(const n of [0,1,2]){const raw=structuredClone(base);raw.squad.extraPlayersPerTeam=n;const c=expandSoccerConfig(raw);assert.equal(c.players.roster.length,8+2*n);assert.equal(c.team.players.length,4);const save=initialSoccerRoster(c.team.players,null,c);assert.equal(save.players.length,4);}
 for(const n of [-1,3,NaN,1.1]){const raw=structuredClone(base);raw.squad.extraPlayersPerTeam=n;assert.throws(()=>expandSoccerConfig(raw),/extraPlayersPerTeam/);}
});
test('extra match players receive distinct numbers while using existing saved card skill totals',()=>{
 const c=expandSoccerConfig(base),cards=soccerMatchCards(c,c.team,rosterCards,null,1,'normal');
 for(const team of [0,1]){const rows=cards.filter(p=>p.team===team);assert.equal(new Set(rows.map(p=>p.number)).size,6);}
 assert.equal(cards[8].number,15);assert.equal(cards[10].number,18);
 assert.deepEqual(['pace','shot','pass','defense'].map(k=>cards[8][k]),['pace','shot','pass','defense'].map(k=>cards[1][k]));
 assert.equal(c.view.appearance.skin.length,12);assert.equal(c.view.athlete.profiles.length,12);
});
test('the actual soccer model uses six-a-side while retaining the saved four-card schema',()=>{
 const model=createSoccer({config:base,seed:42}),state=model.getState();assert.equal(state.players.length,12);
 for(const team of [0,1])assert.equal(state.players.filter(p=>p.team===team).length,6);
 assert.equal(state.players[8].tacticalRole,'LCB');assert.equal(state.players[10].tacticalRole,'RCB');
 assert.ok(Math.hypot(state.players[8].x-state.players[1].x,state.players[8].z-state.players[1].z)>1.5);
 assert.equal(initialSoccerRoster(base.team.players,null,base).players.length,4);
});
test('the actual model applies design tactics to the expanded players, beyond merely loading JSON',()=>{
 const model=createSoccer({config:base,seed:42}),state=model.getState();
 assert.equal(model.tacticalMetrics().formation,'4-3-3');const applied=model.setDesignTactics(tactics);
 assert.equal(applied.formation,'4-3-3');assert.equal(applied.teams.length,2);
 for(const p of state.players)if(p.team===1)p.recover=100;
 const defender=state.players[8],before={x:defender.x,z:defender.z};
 for(let i=0;i<90;i++)model.update(base.match.fixedStep,{});
 assert.ok(Math.hypot(defender.x-before.x,defender.z-before.z)>.5,'the extra defender actually follows an off-ball design target');
 const active=model.tacticalMetrics();assert.ok(active.plans>0);
 for(const team of active.teams){assert.equal(team.roles.length,6);assert.equal(new Set(team.roles.map(p=>p.role)).size,6);}
 assert.ok(['support','cover','mark','press','outlet','box-run','square'].includes(defender.duty));
});
