// racing-v24.7 with the address flags off (the circuits and flags are read when the modules load, so this file sets the address first; node --test runs each file
// in its own process): ?racingTracksV3=0 keeps the six v2 circuits on every stage and never loads the v3 data.
globalThis.location={search:'?racingTracksV3=0&racingAutoLift=1&racingAudioV6=0&racingTight=0'};
import test from 'node:test';
import assert from 'node:assert/strict';
const {TRACKS,TRACKS_V3,RACING_STAGES,createTrack,getRacingStage}=await import('../workout/island/minigames/racing-tracks.mjs');
const {racingV247Flags,v247PhysicsConfig,racingStageFeature}=await import('../workout/island/minigames/racing-v24-7.mjs');
test('?racingTracksV3=0: the v2 circuits on all 30 stages, with their light',()=>{
 assert.equal(TRACKS_V3.length,0);
 for(let i=0;i<30;i++)assert.equal(RACING_STAGES[i].trackId,TRACKS[i%6].id,'stage '+(i+1));
 assert.equal(getRacingStage(7).timeOfDay,'golden');assert.equal(getRacingStage(19).timeOfDay,'sunset');
 assert.equal(createTrack(10).id,'harbor');assert.equal(createTrack(10).v3,undefined);
 assert.equal(racingStageFeature(7,'מפרץ הדקלים · 2 הקפות · אור זהוב · יעד מקום 2'),'מפרץ הדקלים · 2 הקפות · אור זהוב · יעד מקום 2');
});
test('the other flags off: the v24.6 session configuration',()=>{
 const f=racingV247Flags();assert.deepEqual({autoLift:f.autoLift,tight:f.tight,audioV6:f.audioV6},{autoLift:true,tight:false,audioV6:false});
 assert.deepEqual(v247PhysicsConfig(f,true),{gears:true,brakeDown:false,tight:0});
});
