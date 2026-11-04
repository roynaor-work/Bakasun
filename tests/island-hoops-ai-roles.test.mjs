import test from 'node:test';
import assert from 'node:assert/strict';
import {rolePreference,receiverBonus,offBallSag} from '../workout/island/minigames/hoops-ai.mjs';
import {playerAbilities} from '../workout/island/minigames/hoops-roles.mjs';

const card=(pos,r)=>({pos,abilities:playerAbilities({pos,r:{three:60,mid:60,release:60,dunk:60,vertical:60,rebound:60,strength:60,perimD:60,interiorD:60,block:60,steal:60,pass:60,handle:60,speed:60,stamina:60,...r}})});

test('the ball handler weighs his position and abilities: bigs drive, shooters shoot, point guards pass',()=>{
 const centre=rolePreference(card('C',{dunk:85,three:35})),shooter=rolePreference(card('SG',{three:88,mid:80,release:85})),point=rolePreference(card('PG',{pass:88,handle:84}));
 assert.ok(centre.three<shooter.three,'a centre is far less willing to launch a three');assert.ok(centre.drive>shooter.drive);
 assert.ok(shooter.three>rolePreference(card('SG',{three:45,mid:45,release:45})).three&&shooter.three<=1.03,'a shooter is a touch more willing, never more than the plain value');
 assert.ok(point.pass>centre.pass&&point.pass>shooter.pass,'the point guard looks for the pass first');
 for(const pref of [centre,shooter,point])for(const key of ['three','drive','pass','patience'])assert.ok(pref[key]>=0.5&&pref[key]<=1.25,key+' stays a mild tilt, never a rule');
});

test('pace changes how long a team waits for a better look, inside a narrow band',()=>{
 const p=card('SF',{});
 assert.ok(rolePreference(p,1).patience<rolePreference(p,0.5).patience&&rolePreference(p,0.5).patience<rolePreference(p,0).patience);
 assert.ok(rolePreference(p,0).patience<=1.15&&rolePreference(p,1).patience>=0.95);
});

test('an open shooter behind the arc and a rolling big draw the pass; a covered man does not',()=>{
 const shooter=card('SG',{three:90,mid:82,release:88}),big={...card('C',{dunk:88}),role:'roll'};
 assert.ok(receiverBonus(shooter,3,true)>0.05);assert.equal(receiverBonus(shooter,1,true),0,'covered: no shooter bonus');
 assert.ok(receiverBonus(big,1,false)>0);assert.equal(receiverBonus({...big,role:null},1,false),0);
 assert.ok(receiverBonus(shooter,9,true)<=0.2);
});

test('help-side defenders stay home on shooters and sag off non-shooters, within a fifth either way',()=>{
 const shooter=card('SG',{three:92,mid:86,release:90}),brick=card('C',{three:30,mid:35,release:40});
 assert.ok(offBallSag(shooter)<1&&offBallSag(shooter)>=0.8);assert.ok(offBallSag(brick)>1&&offBallSag(brick)<=1.2);assert.equal(offBallSag({}),1);
});
