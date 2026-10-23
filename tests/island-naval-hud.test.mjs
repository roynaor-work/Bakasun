import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drawNavalHud,navalDangerMarks} from '../workout/island/minigames/naval-hud.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames,balance=config.navalDuel;
const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const t=key=>strings[key]||key;
function paint(){
 const calls=[],state={font:'10px sans-serif',fillStyle:''};
 const p=new Proxy(state,{get(target,key){if(key==='measureText')return text=>({width:String(text).length*5});if(key in target)return target[key];return (...args)=>{calls.push({type:key,args,font:target.font,fill:target.fillStyle});};},set(target,key,value){target[key]=value;return true;}});
 return {p,calls,text:()=>calls.filter(c=>c.type==='fillText').map(c=>c.args[0])};
}
function fixture(extra={}){
 return {time:20,lives:8,maxLives:8,enemyFleetHp:5,maxEnemyFleet:5,aiming:false,selectedTargetIndex:1,lockedTargetIndex:null,rangeState:{inside:true},remaining:119.96,mission:{id:'fleet',title:'feature.naval.10'},missionState:{completed:1,total:4},enemies:[{index:0,x:310,z:-45,active:true,hp:2,maxHp:2},{index:1,x:345,z:45,active:true,hp:3,maxHp:3}],enemyShots:[],playerShip:{x:80,z:0,heading:0},aim:{x:345,z:45},wind:{x:1,z:1},...extra};
}
const project=(x,z,y=0)=>({x:370+z*1.3,y:250-(x-80)*.4-y*3,depth:2});
for(const [width,height]of [[844,390],[740,360],[1366,768]])test(`naval HUD shows live objective, readable clock and selected target at ${width}x${height}`,()=>{
 const record=paint();drawNavalHud(record.p,fixture(),{config:{...config,width,height},balance,art:{enemyNames:['first','second']},t},project);
 assert.ok(record.text().includes(strings['feature.naval.10']));assert.ok(record.text().includes('1/4'));assert.ok(record.text().includes('2:00'));assert.equal(record.text().includes('1:60'),false);
 assert.match(record.calls.find(call=>call.type==='fillText'&&call.args[0]==='second').font,/bold/);assert.doesNotMatch(record.calls.find(call=>call.type==='fillText'&&call.args[0]==='first').font,/bold/);
 const paths=record.calls.filter(call=>['moveTo','lineTo','roundRect'].includes(call.type));assert.ok(paths.every(call=>call.args.every(arg=>Number.isFinite(arg))));
});
test('naval lock temporarily overrides selection and never paints the former giant world range circle',()=>{
 const record=paint(),projected=[];drawNavalHud(record.p,fixture({aiming:true,lockedTargetIndex:0}),{config:{...config,width:844,height:390},balance,art:{enemyNames:['locked','selected']},t},(x,z,y)=>{projected.push({x,z});return project(x,z,y);});
 assert.match(record.calls.find(call=>call.type==='fillText'&&call.args[0]==='locked').font,/bold/);assert.doesNotMatch(record.calls.find(call=>call.type==='fillText'&&call.args[0]==='selected').font,/bold/);
 assert.ok(projected.length<20,'holding fire must not add a 96-point radius ring to the sea');
});
test('naval warning and travelling shot expose their announced landing point with a hull-sized footprint',()=>{
 const m=fixture({enemies:[{index:0,x:310,z:0,active:true,hp:2,maxHp:2,attack:{x:80,z:12,fireTime:21.8},warning:1.8}],enemyShots:[{targetX:100,targetZ:24,duration:1.2,age:.3}]});
 const marks=navalDangerMarks(m,balance,project,844,390);assert.equal(marks.length,2);assert.equal(marks[0].incoming,false);assert.ok(Math.abs(marks[0].seconds-1.8)<1e-9);assert.equal(marks[1].incoming,true);assert.ok(Math.abs(marks[1].seconds-.9)<1e-9);assert.deepEqual(marks[0].q,project(80,12,.1));
 for(const mark of marks)assert.ok(mark.points.every(point=>Math.hypot(point.x-mark.q.x,point.y-mark.q.y)<=32.0001));
 const record=paint();drawNavalHud(record.p,m,{config:{...config,width:844,height:390},balance,art:{},t},project);assert.ok(record.text().includes(strings['naval.hud.evade']));assert.ok(record.text().some(text=>String(text).startsWith('! ')));assert.ok(record.text().some(text=>String(text).startsWith('↓ ')));
});
test('naval landing footprint remains bounded at extreme close-up and excludes points behind the camera',()=>{
 const m=fixture({enemies:[{active:true,hp:1,attack:{x:80,z:0,fireTime:21}}]});
 const close=(x,z)=>({x:422+z*30,y:250-(x-80)*30,depth:1});const [mark]=navalDangerMarks(m,balance,close,844,390);assert.ok(mark.points.every(point=>Math.hypot(point.x-mark.q.x,point.y-mark.q.y)<=32.0001));
 assert.deepEqual(navalDangerMarks(m,balance,()=>({x:100,y:100,depth:-1}),844,390),[]);
});
test('naval combat feedback expires while resupply stays visible until stock arrives',()=>{
 for(const kind of ['hit','miss','damage','evaded','mine','repair','full','resupply']){
  const record=paint();drawNavalHud(record.p,fixture({lastFeedback:{kind,time:19,x:90,z:0}}),{config:{...config,width:844,height:390},balance,art:{},t},project);assert.ok(record.text().includes(strings['naval.feedback.'+kind]),kind);
 }
 const stale=paint();drawNavalHud(stale.p,fixture({lastFeedback:{kind:'hit',time:18}}),{config:{...config,width:844,height:390},balance,art:{},t},project);assert.equal(stale.text().includes(strings['naval.feedback.hit']),false);
 const supply=paint();drawNavalHud(supply.p,fixture({resupplyTime:.7,lastFeedback:{kind:'miss',time:0}}),{config:{...config,width:844,height:390},balance,art:{},t},project);assert.ok(supply.text().some(text=>String(text).includes(strings['naval.feedback.resupplying'])&&String(text).includes('1.3s')));
});
