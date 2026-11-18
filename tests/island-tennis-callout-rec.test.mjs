// v24.5 recorded line calls (Roy, 18/11/2026: "it sounds a bit processed... like in a real tennis match... if needed we will record"):
// the hook that plays recorded takes from assets/tennis-callouts-rec (listed in takes.json) and keeps the synthesised call when there are none.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {tennisCalloutRecEnabled,recordedTakes,createTakeBag,loadRecordedCalls,CALLOUT_REC_LIST,CALLOUT_REC_DIR} from '../workout/island/minigames/tennis-callouts.mjs';
import {createTennisAudio} from '../workout/island/minigames/g4e-audio.mjs';
const island=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',island))).minigames.tennis;

test('callout rec: on by default, ?tennisCalloutRec=0 (or ?tennisCallouts=0) keeps the synthesised call',()=>{
 assert.equal(tennisCalloutRecEnabled(''),true);assert.equal(tennisCalloutRecEnabled('?tennisCalloutRec=0'),false);assert.equal(tennisCalloutRecEnabled('?tennisCallouts=0'),false);
});
test('callout rec: takes.json names map to takes 1..3 per call, the playable format first, bad names ignored',()=>{
 const names=['out-1.mp3','out-1.ogg','out-2.mp3','net-3.ogg','net-4.ogg','out-x.ogg','../evil.ogg','net-1.wav','out-1.ogg'];
 const ogg=recordedTakes(names,{ogg:true}),mp3=recordedTakes(names,{ogg:false});
 assert.deepEqual(ogg.out,[{take:1,files:[CALLOUT_REC_DIR+'out-1.ogg',CALLOUT_REC_DIR+'out-1.mp3']},{take:2,files:[CALLOUT_REC_DIR+'out-2.mp3']}]);
 assert.deepEqual(mp3.out[0].files,[CALLOUT_REC_DIR+'out-1.mp3',CALLOUT_REC_DIR+'out-1.ogg']);
 assert.deepEqual(ogg.net,[{take:3,files:[CALLOUT_REC_DIR+'net-3.ogg']}]);
 assert.deepEqual(recordedTakes(undefined),{out:[],net:[]});
});
test('callout rec: random takes without repeating the same take twice in a row, every take used',()=>{
 let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(const n of [2,3]){const bag=createTakeBag(n,random),seen=new Set();let last=-1;
  for(let i=0;i<300;i++){const k=bag.next();assert.ok(k>=0&&k<n);assert.notEqual(k,last,`take ${k} twice in a row`);last=k;seen.add(k);}assert.equal(seen.size,n);}
 assert.equal(createTakeBag(1).next(),0);assert.equal(createTakeBag(0).next(),-1);
});
const fakeFetch=(files)=>{const asked=[];const f=async url=>{const path=new URL(url).pathname.replace(/^.*\/workout\/island\//,'');asked.push(path);if(path===CALLOUT_REC_LIST)return {ok:true,json:async()=>({takes:files.list})};const body=files.bytes?.[path];return body?{ok:true,arrayBuffer:async()=>body}:{ok:false};};f.asked=asked;return f;};
const base=new URL('minigames/g4e-audio.mjs',island).href;
test('callout rec: the loader decodes the listed takes, falls back to the other format, and asks for nothing else',async()=>{
 const decoded=[],context={decodeAudioData:async b=>{if(b.bad)throw Error('bad');decoded.push(b.name);return {name:b.name};}};
 const fetcher=fakeFetch({list:['out-1.ogg','out-1.mp3','out-2.ogg','net-1.ogg','net-1.mp3'],bytes:{[CALLOUT_REC_DIR+'out-1.ogg']:{name:'o1'},[CALLOUT_REC_DIR+'out-2.ogg']:{bad:true},[CALLOUT_REC_DIR+'net-1.mp3']:{name:'n1mp3'}}});
 const r=await loadRecordedCalls(context,{base,fetcher,ogg:true});
 assert.deepEqual(r.out.map(b=>b.name),['o1']);assert.deepEqual(r.net.map(b=>b.name),['n1mp3'],'net-1.ogg is missing: the mp3 take is used');
 assert.ok(!fetcher.asked.includes(CALLOUT_REC_DIR+'out-1.mp3'),'a take that decoded is not fetched twice');
 const empty=fakeFetch({list:[]});assert.deepEqual(await loadRecordedCalls(context,{base,fetcher:empty}),{out:[],net:[]});assert.deepEqual(empty.asked,[CALLOUT_REC_LIST],'no takes listed: no file is requested');
 assert.deepEqual(await loadRecordedCalls(context,{base,fetcher:async()=>{throw Error('offline');}}),{out:[],net:[]});
});
function fakeContext(made){
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),Q:param(),connect(){},disconnect(){},start(){n.started=true;},stop(){}};made.push(n);return n;};
 return class{constructor(){this.state='running';this.currentTime=1;this.sampleRate=8000;this.destination={};}createGain(){return node('gain');}createOscillator(){return node('osc');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};}decodeAudioData(b){return Promise.resolve({take:b.take});}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
}
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,0));};
test('callout rec: a recorded take plays instead of the synthesised voice; with none (or ?tennisCalloutRec=0) the synth plays',async()=>{
 for(const [search,list,expectRec] of [['',['out-1.ogg','out-2.ogg','net-1.ogg'],true],['',[],false],['?tennisCalloutRec=0',['out-1.ogg','out-2.ogg','net-1.ogg'],false]]){
  globalThis.location={search};const made=[];
  const bytes={[CALLOUT_REC_DIR+'out-1.ogg']:{take:'o1'},[CALLOUT_REC_DIR+'out-2.ogg']:{take:'o2'},[CALLOUT_REC_DIR+'net-1.ogg']:{take:'n1'}};
  const fetcher=fakeFetch({list,bytes}),audio=createTennisAudio({config:config.audio,storage:{getItem:()=>'on'},AudioContext:fakeContext(made),fetcher});
  audio.unlock();await settle();made.length=0;
  assert.equal(audio.call('out'),true);
  const osc=made.filter(n=>n.kind==='osc').length,played=made.filter(n=>n.kind==='buffer'&&n.buffer?.take);
  if(expectRec){assert.equal(osc,0,'no synthesised voice');assert.equal(played.length,1);assert.ok(['o1','o2'].includes(played[0].buffer.take));assert.equal(audio.metrics().played['rec-out'],1);assert.deepEqual(audio.metrics().callouts.takes,{out:2,net:1});}
  else{assert.equal(osc,1,`synthesised voice (${search||'no takes'})`);assert.equal(played.length,0);assert.equal(audio.metrics().played['rec-out'],undefined);}
  assert.equal(audio.metrics().played['call-out'],1);
  if(search)assert.ok(!fetcher.asked.includes(CALLOUT_REC_LIST),'?tennisCalloutRec=0 does not even read the list');
  audio.dispose();
 }
 globalThis.location={search:''};
});
test('callout rec: takes.json ships (empty until Roy records), is in the offline tennis download, and every listed take exists and is offline too',async()=>{
 const list=JSON.parse(await readFile(new URL(CALLOUT_REC_LIST,island)));assert.ok(Array.isArray(list.takes));
 const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',island)));
 assert.ok(manifest.games.tennis.includes(CALLOUT_REC_LIST),'takes.json is in games.tennis');assert.ok(manifest.files[CALLOUT_REC_LIST],'takes.json is hashed');
 for(const name of list.takes){const path=CALLOUT_REC_DIR+name;await access(new URL(path,island));assert.ok(manifest.games.tennis.includes(path),`${path} must be in games.tennis`);assert.ok(manifest.files[path],`${path} must be hashed`);}
});
