import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate} from '../workout/island/tools/hoops-gameplay-sim.mjs';

test('AI v2 (stage 3) keeps the sideways-pass fix and adds passes before the shot; v1 stays available', () => {
 const v1=simulate({games:20,ai:'v1',profile:'quick',seedBase:5200}),v2=simulate({games:20,ai:'v2',profile:'quick',seedBase:5200});
 assert.ok(v2.passing.contestedLateralPct<v1.passing.contestedLateralPct*0.5,`unprotected sideways ${v1.passing.contestedLateralPct} -> ${v2.passing.contestedLateralPct}`);
 assert.ok(v2.passing.passesBeforeShot>=1.9,`passes before the shot ${v2.passing.passesBeforeShot}`);
 assert.ok(v2.shooting.pointsPerTeamGame>8&&v2.shooting.fgPct>38&&v2.shooting.fgPct<58);
 assert.equal(v2.turnovers.doubleDribble,0);assert.equal(v2.turnovers.travel,0);
});
