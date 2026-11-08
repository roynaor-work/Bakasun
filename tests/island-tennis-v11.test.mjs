import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fanSlots} from '../workout/island/minigames/tennis-v11-stadium.mjs';
import {statSync} from 'node:fs';
import {createTennisAudio} from '../workout/island/minigames/g4e-audio.mjs';

const root=new URL('../workout/island/',import.meta.url);
test('tennis v11: no top text, only the board, the bar and the buttons',async()=>{
  const session=await readFile(new URL('minigames/tennis-session.mjs',root),'utf8'),css=await readFile(new URL('minigames/tennis.css',root),'utf8');
  assert.ok(!session.includes("'tennis-feedback'")&&!session.includes('tennis-stage-label'),'the feedback box and the stage title are gone');
  assert.ok(!session.includes('tennisLiveFeedback')&&!session.includes('tennisEventFeedback'));
  assert.ok(css.includes(".tennis-board::before{content:none;display:none;"),'the board has no title');
  assert.ok(session.includes("powerMeter.hidden=Boolean(hm)||"),'the second bar is hidden while the single bar is on');
});

test('tennis v11: fan slots fill the gaps between neighbours of one row only',()=>{
  const row=[0,1,2,3].map(i=>({id:i,x:i*.9,y:1,z:0,yaw:0,sec:0,row:0})),far=[{id:9,x:20,y:1,z:0,yaw:0,sec:0,row:0}];
  const slots=fanSlots([...row,...far]);
  assert.equal(slots.length,3,'three gaps in a row of four, none towards a distant seat');
  assert.deepEqual(slots.map(s=>+s.x.toFixed(2)),[.45,1.35,2.25]);
  assert.equal(fanSlots([{id:1,x:0,y:1,z:0,yaw:0,sec:0,row:0},{id:2,x:.9,y:2,z:0,yaw:0,sec:0,row:1}]).length,0,'different rows are not neighbours');
});

test('tennis v12: the eight Codex crowd sounds are wired, each under 200KB, all together under 400KB',async()=>{
  const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.tennis,names=['applauseShort','applauseMedium','applauseLarge','crowdBed','crowdOoh','crowdAw','crowdHush','matchCheer'];
  let total=0;
  for(const name of names){const path=config.audio.samples[name];assert.ok(path,name+' is in the config');const size=statSync(new URL(path,root)).size;assert.ok(size>5000&&size<=200000,`${name} ${size}`);total+=size;}
  assert.ok(total<=400000,'crowd sounds total '+total);
  for(const gone of ['applauseSoft','applauseBig'])assert.equal(config.audio.samples[gone],undefined,gone+' (the v11 synthesis) is replaced');
});

test('tennis v11: audio plays a sample at a controlled gain and ambient loops ease in without a jump',async()=>{
  const log=[];class Gain{constructor(){this.gain={value:1};}connect(){}disconnect(){}}
  class Source{connect(){}disconnect(){}start(){log.push('start');}stop(){}}
  class Ctx{constructor(){this.state='running';this.currentTime=0;this.destination={};}createGain(){return new Gain();}createBufferSource(){const s=new Source();log.push(s);return s;}createBiquadFilter(){return {frequency:{},Q:{},connect(){},disconnect(){}};}decodeAudioData(){return Promise.resolve({});}suspend(){return Promise.resolve();}resume(){return Promise.resolve();}close(){return Promise.resolve();}}
  const audio=createTennisAudio({config:{volume:.3,samples:{applauseSoft:'a.ogg',crowdBed:'b.ogg'}},storage:{getItem:()=>null},AudioContext:Ctx,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});
  audio.unlock();await new Promise(r=>setTimeout(r,20));
  assert.equal(typeof audio.ambient,'function');
  audio.play('applauseSoft',{gain:.5});audio.ambient('crowdBed',.4);audio.ambient('crowdBed',.4);
  assert.ok(audio.metrics().loaded.includes('applauseSoft'));audio.dispose();
});
