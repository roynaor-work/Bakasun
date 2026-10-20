import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,CURRENT_VERSION,STORAGE_KEY} from '../workout/island/engine/persistence.mjs';
import {STATIONS,initialLearning,validLearning,recordAnswer,dayKey,levelForAge,questionsForAge,roundsForAge} from '../workout/island/learning/state.mjs';
import {generateRound,createQuestion} from '../workout/island/learning/questions.mjs';
import {createLearningVoice} from '../workout/island/learning/voice.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const today=new Date(2026,9,20,12).getTime(),tomorrow=new Date(2026,9,21,12).getTime();
function fixture(){let now=today;const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},engine=createEngine(data,{storage,now:()=>now});return {engine,storage,values,setNow:t=>{now=t;}};}
function rng(seed){return ()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);}
function finishRound(e,id='math',miss=false){assert.ok(e.startLearning(id).ok);const total=e.learningRound().total;for(let i=0;i<total;i++){if(miss){assert.equal(e.answerLearning('__wrong__').resolved,false);assert.equal(e.answerLearning('__wrong__').resolved,true);}else assert.ok(e.answerLearning(e.learningRound().question.answer).correct);const r=e.nextLearning();if(i===total-1)return r;assert.equal(r.done,false);}}
for(const station of Object.keys(STATIONS))for(let level=1;level<=7;level++)test(`L1 ${station} level ${level}: one solution, varied rounds, bounded content`,()=>{
 const random=rng(level*29+station.length),one=generateRound(station,level,{rng:random}),two=generateRound(station,level,{rng:random,exclude:one.map(q=>q.id)});
 assert.equal(one.length,8);assert.equal(new Set([...one,...two].map(q=>q.id)).size,16);
 for(const q of [...one,...two]){
  assert.ok(q.voice.length>0);assert.ok(q.id.length<=2000);assert.ok(q.hint);
  if(q.kind==='choice'){assert.equal(q.options.length,3);assert.equal(new Set(q.options).size,3);assert.equal(q.options.filter(v=>v===q.answer).length,1);}
  if(q.kind==='word')assert.deepEqual([...q.answer].sort(),q.letters.slice().sort());
  if(q.kind==='jigsaw'){assert.equal(q.answer,Array.from({length:q.size*q.size},(_,i)=>i).join(','));assert.deepEqual(q.order.slice().sort((a,b)=>a-b),q.answer.split(',').map(Number));assert.notEqual(q.order.join(','),q.answer);}
  if(q.kind==='memory'){const counts=new Map();q.cards.forEach(c=>counts.set(c.icon,(counts.get(c.icon)||0)+1));assert.ok([...counts.values()].every(n=>n===2));assert.equal(q.answer,[...counts.keys()].sort().join('|'));assert.equal(q.cards.length,level<=2?6:level<=4?12:16);}
  if(level<=2){assert.ok(q.pictureOnly);if(q.options)assert.ok(q.options.every(v=>!/[\p{Letter}]/u.test(v)),JSON.stringify(q));assert.ok(q.voice.includes(' '));}
  if(level>=5){assert.doesNotMatch(q.prompt,/[\u0591-\u05c7]/);if(q.options)q.options.forEach(v=>assert.doesNotMatch(v,/[\u0591-\u05c7]/));}
 }
});
test('L1 medium words carry niqqud; puzzle sizes and all requested templates are age appropriate',()=>{
 for(const level of [3,4]){const qs=generateRound('language',level);assert.match(qs.find(q=>q.template==='picture').answer,/[\u0591-\u05c7]/);}
 for(let level=1;level<=7;level++){const q=generateRound('puzzles',level).find(q=>q.kind==='jigsaw');assert.equal(q.size,level===1?2:level<=3?3:level===4?4:5);}
 const high=generateRound('language',7).map(q=>q.template);for(const type of ['sentence','opposite','synonym'])assert.ok(high.includes(type));
 const math=generateRound('math',7).map(q=>q.template);for(const type of ['multiply','divide','picture'])assert.ok(math.includes(type));
 for(const [station,level]of [['missing',1],['math',0],['math',8]])assert.throws(()=>createQuestion(station,level));
});
test('L1 three first-try successes raise and two errors lower, with bounds and independent station streaks',()=>{
 const s=initialLearning(today).stations.language;for(let i=0;i<2;i++)assert.equal(recordAnswer(s,true),1);assert.equal(recordAnswer(s,true),2);assert.equal(s.successStreak,0);assert.equal(recordAnswer(s,false),2);assert.equal(recordAnswer(s,false),1);recordAnswer(s,false);recordAnswer(s,false);assert.equal(s.level,1);
 s.level=7;for(let i=0;i<3;i++)recordAnswer(s,true);assert.equal(s.level,7);recordAnswer(s,false);recordAnswer(s,true);assert.equal(s.errorStreak,0);
 const {engine:e}=fixture();e.setLearningAge(7);e.startLearning('math');e.answerLearning('__wrong__');e.answerLearning(e.learningRound().question.answer);assert.equal(e.state.learning.stations.math.errorStreak,1);assert.equal(e.state.learning.stations.language.errorStreak,0);
});
test('L1 parent age 4–10 sets starting level 1–7, persists, then adapts independently',()=>{
 const f=fixture(),e=f.engine;assert.equal(e.state.learning.age,4);assert.equal(e.setLearningRequired(false).ok,true);
 for(let age=4;age<=10;age++){assert.ok(e.setLearningAge(age).ok);assert.equal(levelForAge(age),age-3);for(const s of Object.values(e.state.learning.stations))assert.equal(s.level,age-3);const reload=createEngine(data,{storage:f.storage});assert.equal(reload.state.learning.age,age);assert.equal(reload.state.learning.required,false);}
 for(const invalid of [3,11,4.5,'6',null])assert.equal(e.setLearningAge(invalid).ok,false);
 e.setLearningAge(6);e.startLearning('language');for(let i=0;i<3;i++){e.answerLearning(e.learningRound().question.answer);e.nextLearning();}assert.equal(e.state.learning.stations.language.level,4);assert.equal(e.state.learning.stations.math.level,3);
});
test('L1 first day bypass, two eight-question rounds unlock age 6+, next local day relocks',()=>{
 const f=fixture(),e=f.engine;e.setLearningAge(6);assert.equal(e.learningStatus().locked,false);f.setNow(tomorrow);assert.equal(e.learningStatus().locked,true);
 assert.equal(questionsForAge(6),8);assert.equal(roundsForAge(6),2);finishRound(e);assert.equal(e.learningStatus().rounds,1);assert.equal(e.learningStatus().locked,true);finishRound(e,'language');assert.equal(e.learningStatus().locked,false);assert.equal(e.state.learning.lastMissionDate,dayKey(tomorrow));
 f.setNow(new Date(2026,9,22,0,1).getTime());assert.equal(e.learningStatus().rounds,0);assert.equal(e.learningStatus().locked,true);e.setLearningRequired(false);assert.equal(e.learningStatus().locked,false);e.setLearningRequired(true);assert.equal(e.learningStatus().locked,true);
});
test('L1 ages 4–5 need just one five-question round; incomplete/repeated submissions do not pay',()=>{
 for(const age of [4,5]){const f=fixture(),e=f.engine;e.setLearningAge(age);f.setNow(tomorrow);assert.equal(e.learningStatus().target,1);e.startLearning('animals');assert.equal(e.learningRound().total,5);const money=e.state.money;assert.equal(e.nextLearning().ok,false);e.cancelLearning();assert.equal(e.state.money,money);assert.equal(e.learningStatus().rounds,0);
 const result=finishRound(e,'math',true);assert.equal(result.result.total,5);assert.equal(result.result.stars,1);assert.equal(e.learningStatus().locked,false);assert.equal(e.state.money,money+result.result.money);assert.equal(e.nextLearning().ok,false);assert.equal(e.state.money,money+result.result.money);}
});
test('L1 fresh retries teach an answer, cancelled rounds retain level but no daily credit, recent questions reload',()=>{
 const f=fixture(),e=f.engine;e.startLearning('language');const q=e.learningRound().question;assert.equal(e.answerLearning('__wrong__').answer,null);const reveal=e.answerLearning('__wrong__');assert.equal(reveal.answer,q.answer);assert.equal(e.answerLearning(q.answer).ok,false);e.cancelLearning();const reloaded=createEngine(data,{storage:f.storage});assert.deepEqual(reloaded.state.learning,e.state.learning);assert.ok(validLearning(reloaded.state.learning));assert.ok(reloaded.state.learning.stations.language.recent.includes(q.id));
});
test('L1 authentic v15 fixture migrates additively to v16 and round-trips without losing any old field',async()=>{
 const old=JSON.parse(await readFile(new URL('./fixtures/save-v15.json',import.meta.url),'utf8')),before=structuredClone(old),f=fixture(),e=f.engine;
 assert.equal(old.version,15);assert.equal(CURRENT_VERSION,16);const result=migrateSave(old,data,e.registry);assert.ok(result.ok);assert.deepEqual(old,before);assert.deepEqual(result.state,{...old,version:16,learning:initialLearning(old.createdAt||old.updatedAt)});assert.ok(validateSave(result.state,data,e.registry).ok);
 f.storage.setItem(STORAGE_KEY,JSON.stringify(old));const reload=createEngine(data,{storage:f.storage});assert.equal(reload.state.version,16);assert.ok(reload.save().ok);const again=createEngine(data,{storage:f.storage});assert.deepEqual(again.state,reload.state);assert.ok(again.importJSON(old).ok);
 for(const change of [l=>l.age=11,l=>l.stations.math.level=8,l=>l.required='true',l=>l.roundsToday=-1,l=>l.missionDate='2026-02-30']){const s=structuredClone(result.state);change(s.learning);assert.equal(validateSave(s,data,e.registry).ok,false);}
});
test('L1 learning buildings have road access, costs, one-instance limits and opening order',()=>{
 const {engine:e}=fixture();e.state.money=10000;assert.equal(e.validatePlacement('mathLab',0,0).reason,'reason.learningOrder');
 for(const [id,s]of Object.entries(STATIONS)){const type=e.registry.buildings.get(s.building);assert.equal(type.learningStation,id);assert.ok(type.cost>0);assert.equal(type.levels.length,1);let placed=false;for(let z=0;z<16&&!placed;z++)for(let x=0;x<16&&!placed;x++)placed=e.place(s.building,x,z).ok;assert.ok(placed,s.building);assert.equal(e.validatePlacement(s.building,0,0).reason,'reason.learningUnique');}
 assert.ok(validateSave(e.state,data,e.registry).ok);
});
test('L1 voice adapter selects Hebrew, replays, reacts to late voices and stays quiet without Hebrew',()=>{
 let list=[],handler,cancelled=0;const spoken=[],synthesis={getVoices:()=>list,cancel:()=>cancelled++,speak:u=>spoken.push(u),addEventListener:(name,fn)=>handler=fn,removeEventListener:(name,fn)=>assert.equal(fn,handler)},Utterance=class{constructor(text){this.text=text;}};
 const voice=createLearningVoice({synthesis,Utterance});assert.equal(voice.available,false);assert.equal(voice.speak('שָׁלוֹם'),false);assert.deepEqual(spoken,[]);list=[{lang:'en-US'},{lang:'he-IL',localService:true}];handler();assert.ok(voice.available);voice.speak('שָׁלוֹם');voice.speak('שׁוּב');assert.equal(spoken.length,2);assert.equal(spoken[0].lang,'he-IL');assert.equal(spoken[0].voice.lang,'he-IL');assert.equal(cancelled,2);voice.dispose();assert.equal(cancelled,3);
});
test('L1 a device speech failure switches to the picture fallback without throwing',()=>{
 const synthesis={getVoices:()=>[{lang:'he-IL'}],cancel(){},speak(){throw Error('unavailable');}},voice=createLearningVoice({synthesis,Utterance:class{}}),changes=[];voice.subscribe(v=>changes.push(v));assert.equal(voice.available,true);assert.equal(voice.speak('שָׁלוֹם'),false);assert.equal(voice.available,false);assert.equal(voice.speak('שׁוּב'),false);assert.deepEqual(changes,[false]);voice.dispose();
});
test('L1 importing a pre-learning backup preserves an existing parent age and gate choice',async()=>{
 const {engine:e}=fixture(),old=await readFile(new URL('./fixtures/save-v15.json',import.meta.url),'utf8');e.setLearningAge(10);e.setLearningRequired(false);assert.ok(e.importJSON(old).ok);assert.equal(e.state.learning.age,10);assert.equal(e.state.learning.required,false);assert.equal(e.state.learning.stations.language.level,7);assert.equal(e.learningStatus().firstDay,true);
});
