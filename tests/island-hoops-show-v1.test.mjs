// Basketball presentation M4 (11/11/2026, "hoopsShow"): the pure rules behind the automatic instant replay, its two-angle
// cut, the crowd reactions, the celebration casting and the away-score crowd sample. The view, the DOM and WebGL stay out.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {showEnabled,SHOW,replayTriggers,contactFrame,cutTimeline,segmentAt,skipWall,baselineCamera,chaseCamera,crowdReaction,castCelebration,scoreCrowdSample} from '../workout/island/minigames/hoops-show.mjs';
import {createCourt} from '../workout/island/minigames/hoops-court.mjs';

const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam,court=createCourt(cfg.court);
const score=(o={})=>({type:'score',team:0,points:2,playerId:'h1',shotType:'jump',shotId:7,score:[10,8],...o});
const snap=(o={})=>({clock:300,quarter:1,score:[10,8],dir:[1,-1],userTeam:0,players:[
 {id:'h1',team:0,x:12,z:0.5},{id:'h2',team:0,x:9,z:2},{id:'h3',team:0,x:4,z:-5},{id:'a1',team:1,x:12.8,z:0.9},{id:'a2',team:1,x:7,z:-3}],...o});

test('flag: on by default, ?hoopsShow=0 restores the previous presentation',()=>{
 assert.equal(showEnabled(new URLSearchParams('')),true);
 assert.equal(showEnabled(new URLSearchParams('hoopsShow=v1')),true);
 assert.equal(showEnabled(new URLSearchParams('hoopsShow=0')),false);
 assert.equal(showEnabled(null),true);
});

test('replay triggers: every dunk and alley-oop, a three at the buzzer or the three that wins; never a jumper or a free throw',()=>{
 assert.deepEqual(replayTriggers([score({shotType:'dunk'})],snap()).map(t=>t.reason),['dunk']);
 assert.deepEqual(replayTriggers([score({shotType:'layup',playerId:'h2'}),{type:'alleyoop',from:'h1',to:'h2',team:0,result:'score'}],snap()).map(t=>t.reason),['alleyoop']);
 assert.deepEqual(replayTriggers([score({shotType:'layup'}),{type:'alleyoop',from:'h1',to:'h2',team:0,result:'miss'}],snap()),[],'a missed alley-oop is not a replay');
 assert.deepEqual(replayTriggers([{type:'buzzer',inAir:true},score({points:3})],snap({clock:0})).map(t=>t.reason),['buzzer']);
 assert.deepEqual(replayTriggers([score({points:3})],snap({clock:0,quarter:2})).map(t=>t.reason),['buzzer'],'clock at zero after the make counts too');
 assert.deepEqual(replayTriggers([score({points:3,score:[61,60]})],snap({clock:12,quarter:4,score:[61,60]})).map(t=>t.reason),['winner']);
 assert.deepEqual(replayTriggers([score({points:3,score:[70,60]})],snap({clock:12,quarter:4,score:[70,60]})),[],'a three when already ahead is not the winner');
 assert.deepEqual(replayTriggers([score({points:3,score:[21,20]})],snap({clock:12,quarter:2,score:[21,20]})),[],'the lead in the second quarter wins nothing');
 assert.deepEqual(replayTriggers([score()],snap()),[]);
 assert.deepEqual(replayTriggers([score({shotType:'ft',points:1})],snap({clock:0})),[]);
 assert.deepEqual(replayTriggers([score({shotType:'dunk'}),score({shotType:'dunk',playerId:'a1',team:1,shotId:8})],snap()).map(t=>t.home),[true,false],'one trigger per score, home flag from the user team');
 assert.deepEqual(replayTriggers([],snap()),[]);
});

test('contact frame: the frame after the last recorded flight of the scoring shot, else one second before the end',()=>{
 const frames=Array.from({length:180},(_,i)=>({ball:{state:i>=120&&i<150?'shot':i>=150?'dead':'held',shotId:i>=120?7:null}}));
 assert.equal(contactFrame(frames,{shotId:7},30),150);
 assert.equal(contactFrame(frames,{shotId:99},30),149,'another shot id falls back');
 assert.equal(contactFrame(frames.map(f=>({ball:{state:'held'}})),{shotId:7},30),149);
 assert.equal(contactFrame([],{shotId:7},30),0);
});

test('cut timeline: baseline, slow-motion chase centred on the contact, blend back; 0.8 s of game time takes 1.6 s on screen',()=>{
 const tl=cutTimeline(5,6);
 assert.deepEqual(tl.segments.map(s=>s.cam),['baseline','chase','back']);
 assert.deepEqual(tl.segments.map(s=>[+s.from.toFixed(2),+s.to.toFixed(2),s.scale]),[[3,4.6,1],[4.6,5.4,0.5],[5.4,6,1]]);
 assert.deepEqual(tl.segments.map(s=>+s.wall.toFixed(2)),[1.6,1.6,0.6]);
 assert.equal(+tl.wall.toFixed(2),3.8);
 // the recording never runs past its ends
 const early=cutTimeline(0.5,6);assert.equal(early.segments[0].from,0);assert.ok(early.segments[0].to<=0.1+1e-9,'the baseline is only what the recording has before the contact');
 assert.ok(early.segments[2].to<=6);
 const late=cutTimeline(5.9,6);assert.equal(late.segments[2].to,6);assert.ok(late.segments[1].to<=6);
});

test('segmentAt: recorded time advances monotonically, half speed inside the chase, done at the end; a tap skips to the blend back',()=>{
 const tl=cutTimeline(5,6);
 let prev=-1;for(let w=0;w<=tl.wall+0.1;w+=0.05){const s=segmentAt(tl,w);assert.ok(s.t>=prev-1e-9,'monotonic');prev=s.t;}
 assert.equal(segmentAt(tl,0).cam,'baseline');assert.equal(+segmentAt(tl,0).t.toFixed(2),3);
 const chase=segmentAt(tl,1.6+0.8);assert.equal(chase.cam,'chase');assert.equal(+chase.t.toFixed(2),5,'the contact lands mid-chase');assert.equal(chase.scale,0.5);
 const back=segmentAt(tl,3.5);assert.equal(back.cam,'back');assert.ok(back.u>0&&back.u<1);
 assert.equal(segmentAt(tl,3.8).done,true);assert.equal(segmentAt(tl,3.79).done,false);
 assert.equal(+skipWall(tl,0.4).toFixed(2),3.2,'skip from the baseline lands on the blend back');
 assert.equal(skipWall(tl,3.5),3.5,'already blending back: nothing to skip');
});

test('replay cameras: the baseline angle sits beyond the attacked basket on the far side from the scorer, the chase sits behind him',()=>{
 const scorer={x:11.5,z:1.2},side=1;
 const base=baselineCamera(scorer,side,court);
 assert.ok(base.pos[0]>court.rimX&&base.pos[0]<court.hx+2.5,'past the rim, inside the hall');
 assert.ok(base.pos[1]<1.3,'low');assert.ok(base.pos[2]<0,'opposite the scorer');assert.equal(base.look[0],scorer.x);
 const mirrored=baselineCamera({x:-11.5,z:-1.2},-1,court);assert.ok(mirrored.pos[0]<-court.rimX&&mirrored.pos[2]>0);
 const chase=chaseCamera(scorer,side,court);
 assert.ok(chase.pos[0]<scorer.x,'behind the scorer, away from the rim');assert.ok(Math.hypot(chase.pos[0]-scorer.x,chase.pos[2]-scorer.z)>3,'a few metres back');
 assert.ok(chase.look[0]>scorer.x,'looking past him towards the basket');
 assert.ok(baselineCamera(scorer,side,court,{landscape:false}).fov>base.fov,'portrait opens the lens');
 assert.deepEqual(baselineCamera(null,1,court).look.map(v=>+v.toFixed(2)),[+court.rimX.toFixed(2),1.35,0],'no scorer: the rim');
});

test('crowd reactions: a cheer wave on a home score, standing on a home dunk/alley-oop/buzzer beater, a groan on an away score, nothing on free throws',()=>{
 assert.deepEqual(crowdReaction(score()),{cheer:1,groan:0,stand:0,wave:1});
 assert.deepEqual(crowdReaction(score({shotType:'dunk'})),{cheer:1,groan:0,stand:1,wave:1});
 assert.deepEqual(crowdReaction(score({points:3}),{triggers:[{playerId:'h1',reason:'buzzer'}]}).stand,1);
 assert.deepEqual(crowdReaction(score({points:3}),{triggers:[{playerId:'h1',reason:'winner'}]}).stand,0,'the winner has its own final');
 assert.deepEqual(crowdReaction(score({team:1,playerId:'a1'})),{cheer:0,groan:1,stand:0,wave:0});
 assert.deepEqual(crowdReaction(score({team:1,playerId:'a1',shotType:'dunk'})),{cheer:0,groan:1,stand:0,wave:0},'the home crowd does not stand for the visitors');
 assert.deepEqual(crowdReaction({type:'alleyoop',result:'score',team:0}),{cheer:1,groan:0,stand:1,wave:0});
 assert.equal(crowdReaction({type:'alleyoop',result:'score',team:1}),null);
 assert.deepEqual(crowdReaction({type:'final',won:true}),{cheer:1,groan:0,stand:1,wave:1});
 assert.deepEqual(crowdReaction({type:'final',won:false}),{cheer:0,groan:1,stand:0,wave:0});
 assert.equal(crowdReaction(score({shotType:'ft',points:1,team:1})),null);
 assert.equal(crowdReaction({type:'foul'}),null);
 assert.equal(crowdReaction(null),null);
});

test('crowd sample on a score: the excited layer at home, the calm crowd for the visitors, the old behaviour with the flag off',()=>{
 assert.equal(scoreCrowdSample(score()),'crowd');
 assert.equal(scoreCrowdSample(score({team:1})),'calm');
 assert.equal(scoreCrowdSample(score({team:1}),{show:false}),'crowd');
 assert.equal(scoreCrowdSample(score({team:0}),{userTeam:1}),'calm');
});

test('celebration casting: the nearest teammate reacts, the dunked-on defender inside 3.2 m is disappointed, the losers at the final',()=>{
 const s=snap();
 const jumper=castCelebration(score(),s);
 assert.deepEqual(jumper.map(c=>c.playerId),['h2'],'nearest teammate only on a jumper');
 assert.match(jumper[0].clip,/^celebrate_(fist|point)$/);
 const dunk=castCelebration(score({shotType:'dunk'}),s);
 assert.deepEqual(dunk.map(c=>[c.playerId,c.clip]).sort(),[['a1','disappointed'],['h2',jumper[0].clip]]);
 const far=castCelebration(score({shotType:'dunk'}),snap({players:s.players.map(p=>p.id==='a1'?{...p,x:20}:p)}));
 assert.deepEqual(far.map(c=>c.playerId),['h2'],'no defender near the dunk: nobody is disappointed');
 assert.deepEqual(castCelebration(score({shotType:'ft',points:1}),s),[]);
 const lost=castCelebration({type:'final',won:false},s);
 assert.deepEqual(lost.map(c=>c.playerId),['h1','h2','h3'],'the user team lost: its players react');
 assert.deepEqual([...new Set(lost.map(c=>c.clip))].sort(),['disappointed','hands_on_hips']);
 const won=castCelebration({type:'final',won:true},s);
 assert.deepEqual(won.map(c=>c.playerId),['a1','a2']);
 assert.deepEqual(castCelebration(score(),{players:[]}),[]);
 assert.deepEqual(castCelebration(null,s),[]);
});

test('constants: the replay waits less than the engine dead ball after a score, reactions stay within 2.5 s',()=>{
 assert.ok(SHOW.replayDelay<cfg.timing.afterScore,'the replay starts before the inbound');
 assert.ok(SHOW.celebrateSeconds<=2.5);
 assert.ok(SHOW.liveCut.hold+SHOW.liveCut.blend<SHOW.replayDelay,'the live cut is over before the replay cuts in');
 assert.equal(SHOW.cut.slowScale,0.5);
});
