import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {soccerCamera,soccerElevationDegrees,projectSoccerPoint} from '../workout/island/minigames/soccer-presentation.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const state=(ballX,playerX)=>({attackDir:1,controlled:0,charging:false,chargeKind:null,charge:0,ball:{x:ballX,z:0,y:.11,vx:0,vz:0,flight:null},players:[{id:0,x:playerX,z:0,fx:1,fz:0}]});
const landscape=844/390,portrait=390/844;

test('v3 camera: portrait frames the ball from a steeper, further start and lets a far player go to the edge arrow',()=>{
 const c=config.view.camera;
 assert.equal(soccerElevationDegrees(landscape,config),c.elevationDegrees);assert.equal(soccerElevationDegrees(portrait,config),c.portraitElevationDegrees);
 assert.ok(c.portraitElevationDegrees>c.elevationDegrees&&c.portraitNearDistance>c.nearDistance);
 const together=soccerCamera(state(0,0),portrait,config,null,0);
 assert.ok(Math.abs(together.distance-c.portraitNearDistance)<1e-9,'kick-off in portrait starts at the portrait near distance');
 assert.ok(Math.abs(soccerCamera(state(0,0),landscape,config,null,0).distance-c.nearDistance)<1e-9,'landscape is unchanged');
 const goal=soccerCamera(state(25,-1),portrait,config,null,0);
 assert.ok(Math.abs(goal.x-(config.pitch.length/2-3))<1e-9,'a ball in the net centres the camera at the goal line, not at a far player or in the stands');
 assert.ok(goal.distance<c.portraitNearDistance+c.speedZoom+6,`the camera stays close (${goal.distance.toFixed(1)} m)`);
 const landscapeGoal=soccerCamera(state(25,-1),landscape,config,null,0);
 assert.ok(Math.abs(landscapeGoal.x-12)<1e-9,'landscape still centres between ball and player');
 const near=soccerCamera(state(10,4),portrait,config,null,0);assert.ok(Math.abs(near.x-7)<1e-9,'a nearby player is still followed in portrait');
 // The ball projects inside the safe frame in both orientations.
 for(const [aspect,cam] of [[portrait,goal],[landscape,landscapeGoal]]){const p=projectSoccerPoint({x:25,z:0,y:.11},cam,aspect,config);assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,`ball inside the frame (${p.x.toFixed(2)},${p.y.toFixed(2)})`);}
});
