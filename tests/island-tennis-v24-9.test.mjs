// Tennis v24.9 (Roy on the phone, 22/11/2026: "in tennis, if words like NET and OUT can be found instead of my recordings, that is best").
// The first voice of a call is the generic spoken word set assets/tennis-callouts-v2; Roy's recordings are the fallback when the words do
// not load, then the Codex pack, then the Web Audio voice. ?tennisVoiceRec=1 = the recordings first, ?tennisCalloutWords=0 = no words.
// Nothing here listens: the tests check which file a call plays, and that the files decode with a sane length and level (ffmpeg).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {calloutVoiceOrder,pickCallVoice,tennisCalloutWordsEnabled,tennisVoiceRecFirst,recordedTakes,CALLOUT_WORDS_DIR,CALLOUT_REC_DIR,CALLOUT_VOICE_DIRS,CALLOUT_PACK,CALLOUT_PACK_DIR} from '../workout/island/minigames/tennis-callouts.mjs';
import {createTennisAudio} from '../workout/island/minigames/g4e-audio.mjs';
const island=new URL('../workout/island/',import.meta.url);
const read=async p=>readFile(new URL(p,island));
const config=JSON.parse(await read('data/config.json')).minigames.tennis;
const manifest=JSON.parse(await read('offline-manifest.json'));
const words=JSON.parse(await read(CALLOUT_WORDS_DIR+'takes.json')).takes,recs=JSON.parse(await read(CALLOUT_REC_DIR+'takes.json')).takes;

test('v24.9 order: words, then Roy\'s recordings, then the pack, then the Web Audio voice; the flags move or remove a voice',()=>{
 assert.deepEqual(calloutVoiceOrder(''),['words','rec','pack','synth']);
 assert.deepEqual(calloutVoiceOrder('?tennisVoiceRec=1'),['rec','words','pack','synth'],'?tennisVoiceRec=1 = his recordings first');
 assert.deepEqual(calloutVoiceOrder('?tennisVoiceRec=0'),['words','rec','pack','synth']);
 assert.deepEqual(calloutVoiceOrder('?tennisCalloutWords=0'),['rec','pack','synth'],'v24.8');
 assert.deepEqual(calloutVoiceOrder('?tennisCalloutRec=0'),['words','pack','synth']);
 assert.deepEqual(calloutVoiceOrder('?tennisCalloutPack=0'),['words','rec','synth']);
 assert.equal(tennisCalloutWordsEnabled(''),true);assert.equal(tennisCalloutWordsEnabled('?tennisCallouts=0'),false);assert.equal(tennisVoiceRecFirst(''),false);assert.equal(tennisVoiceRecFirst('?tennisVoiceRec=1'),true);
 assert.equal(CALLOUT_VOICE_DIRS.words,'assets/tennis-callouts-v2/');assert.equal(CALLOUT_VOICE_DIRS.rec,'assets/tennis-callouts-rec/');
});
test('v24.9 pick: the first voice in the order that has a take for this call',()=>{
 const both={words:{out:[1],net:[1]},rec:{out:[1],net:[1]}},order=calloutVoiceOrder(''),recFirst=calloutVoiceOrder('?tennisVoiceRec=1');
 for(const kind of ['out','net']){assert.equal(pickCallVoice(order,both,true,kind),'words');assert.equal(pickCallVoice(recFirst,both,true,kind),'rec');}
 assert.equal(pickCallVoice(order,{words:{out:[],net:[1]},rec:{out:[1],net:[1]}},true,'out'),'rec','no word take for OUT: his recording');
 assert.equal(pickCallVoice(order,{words:{out:[],net:[]},rec:{out:[],net:[]}},true,'net'),'pack');
 assert.equal(pickCallVoice(order,{words:{out:[],net:[]},rec:{out:[],net:[]}},false,'net'),'synth');
 assert.equal(pickCallVoice(recFirst,{words:{out:[1],net:[1]},rec:{out:[],net:[]}},true,'out'),'words');
});
test('v24.9 files: three OUT and three NET words, each as small Ogg Vorbis and MP3, listed, hashed and in the offline tennis download',async()=>{
 assert.deepEqual([...words].sort(),['net','out'].flatMap(k=>[1,2,3].flatMap(i=>[`${k}-${i}.mp3`,`${k}-${i}.ogg`])).sort());
 const takes=recordedTakes(words,{ogg:true,dir:CALLOUT_WORDS_DIR});
 for(const kind of ['out','net']){assert.equal(takes[kind].length,3);for(const t of takes[kind])assert.deepEqual(t.files,[`${CALLOUT_WORDS_DIR}${kind}-${t.take}.ogg`,`${CALLOUT_WORDS_DIR}${kind}-${t.take}.mp3`]);}
 assert.deepEqual(recordedTakes(words,{ogg:false,dir:CALLOUT_WORDS_DIR}).out[0].files,[CALLOUT_WORDS_DIR+'out-1.mp3',CALLOUT_WORDS_DIR+'out-1.ogg'],'a phone without Ogg takes the MP3 first');
 let total=0;
 for(const name of [...words,'takes.json']){const path=CALLOUT_WORDS_DIR+name,bytes=(await stat(new URL(path,island))).size;total+=bytes;
  assert.ok(manifest.games.tennis.includes(path),`${path} must be in games.tennis`);assert.equal(manifest.files[path][1],bytes,`${path} size in the manifest`);
  if(name==='takes.json')continue;assert.ok(bytes>2000&&bytes<9000,`${name} is ${bytes} bytes`);const head=await read(path);
  if(name.endsWith('.ogg')){assert.equal(head.subarray(0,4).toString('latin1'),'OggS');assert.ok(head.subarray(0,64).includes(Buffer.from('vorbis')),`${name} is Vorbis like the recorded takes`);}
  else assert.ok(head[0]===0xff&&(head[1]&0xe0)===0xe0,`${name} starts with an MPEG audio frame`);}
 assert.ok(total<80000,`the word set is ${total} bytes`);
 const sources=String(await read(CALLOUT_WORDS_DIR+'SOURCES.md'));assert.match(sources,/CC0 1\.0/);assert.match(sources,/nobody has listened/);
});
test('v24.9 files: Roy\'s recordings and the Codex pack stay in the repository and in the offline download',async()=>{
 assert.deepEqual([...recs].sort(),['net-1.mp3','net-1.ogg','net-2.mp3','net-2.ogg','net-3.mp3','net-3.ogg','out-1.mp3','out-1.ogg']);
 for(const name of recs){const path=CALLOUT_REC_DIR+name;assert.ok((await stat(new URL(path,island))).size>3000,path);assert.ok(manifest.games.tennis.includes(path),path);}
 assert.match(String(await read(CALLOUT_REC_DIR+'SOURCES.md')),/Recorded by Roy/);
 for(const path of Object.values(CALLOUT_PACK.files)){assert.ok((await stat(new URL(path,island))).size>10000,path);assert.ok(manifest.games.tennis.includes(path),path);}
});
const ffmpeg=spawnSync('ffmpeg',['-version']).status===0;
test('v24.9 files: every word decodes, lasts 0.3 to 0.8 s and is as loud as the recorded takes (measured, not heard)',{skip:!ffmpeg&&'ffmpeg is not installed'},()=>{
 const measure=path=>{const r=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',fileURLToPath(new URL(path,island)),'-af','volumedetect','-f','s16le','-ac','1','pipe:1'],{encoding:'buffer'});const err=String(r.stderr);assert.equal(r.status,0,path+' must decode');
  const num=re=>Number(re.exec(err)?.[1]),rate=num(/Audio: \w+.*?, (\d+) Hz/),samples=r.stdout.length/2;return {seconds:samples/rate,samples,mean:num(/mean_volume: (-?[\d.]+) dB/),max:num(/max_volume: (-?[\d.]+) dB/)};};
 const recMean=recs.filter(n=>n.endsWith('.ogg')).map(n=>measure(CALLOUT_REC_DIR+n).mean),low=Math.min(...recMean),high=Math.max(...recMean);
 for(const name of words){const m=measure(CALLOUT_WORDS_DIR+name);
  assert.ok(m.samples>5000,`${name} decodes to ${m.samples} samples`);assert.ok(m.seconds>=.3&&m.seconds<=.8,`${name} lasts ${m.seconds} s`);
  assert.ok(m.max<=-.5&&m.max>=-4,`${name} peaks at ${m.max} dB (no clipping, not quiet)`);assert.ok(m.mean>=low-3&&m.mean<=high+5,`${name} mean ${m.mean} dB against the recorded takes ${low}..${high} dB`);}
});

const fakeFetch=({lists={},bytes={}})=>{const asked=[];const f=async url=>{const path=new URL(url).pathname.replace(/^.*\/workout\/island\//,'');asked.push(path);if(lists[path])return {ok:true,json:async()=>({takes:lists[path]})};const body=bytes[path];return body?{ok:true,arrayBuffer:async()=>body}:{ok:false};};f.asked=asked;return f;};
function fakeContext(made){
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),Q:param(),connect(){},disconnect(){},start(...a){n.started=a;},stop(){}};made.push(n);return n;};
 return class{constructor(){this.state='running';this.currentTime=1;this.sampleRate=8000;this.destination={};}createGain(){return node('gain');}createOscillator(){return node('osc');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};}decodeAudioData(b){return b.bad?Promise.reject(Error('bad')):Promise.resolve({file:b.file,duration:b.duration??.5});}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
}
const settle=async()=>{for(let i=0;i<60;i++)await new Promise(r=>setTimeout(r,0));};
const LISTS={[CALLOUT_WORDS_DIR+'takes.json']:words,[CALLOUT_REC_DIR+'takes.json']:recs};
const BYTES=Object.fromEntries([...words.map(n=>CALLOUT_WORDS_DIR+n),...recs.map(n=>CALLOUT_REC_DIR+n),...Object.values(CALLOUT_PACK.files)].map(p=>[p,{file:p,duration:p.startsWith(CALLOUT_PACK_DIR)?8.677:.5}]));
/** One OUT and one NET call through the real tennis audio: returns the file each call played. */
async function run(search,{lists=LISTS,bytes=BYTES}={}){
 globalThis.location={search};const made=[],fetcher=fakeFetch({lists,bytes}),audio=createTennisAudio({config:config.audio,storage:{getItem:()=>'on'},AudioContext:fakeContext(made),fetcher}),played=[];
 try{audio.unlock();await settle();
  for(const kind of ['out','net']){const before=made.length;assert.equal(audio.call(kind),true,kind+' is called');const nodes=made.slice(before),source=nodes.find(n=>n.kind==='buffer'&&n.buffer?.file&&n.started);
   played.push({kind,file:source?.buffer.file??null,oscillator:nodes.some(n=>n.kind==='osc')});}
  return {played,metrics:audio.metrics(),asked:[...fetcher.asked]};
 }finally{audio.dispose();globalThis.location={search:''};}
}
const dirOf=file=>file?file.slice(0,file.lastIndexOf('/')+1):null;

test('v24.9 game: by default OUT and NET play a word file; Roy\'s recordings and the pack are not even downloaded',async()=>{
 const r=await run('');
 assert.deepEqual(r.played.map(p=>[p.kind,dirOf(p.file)]),[['out',CALLOUT_WORDS_DIR],['net',CALLOUT_WORDS_DIR]]);
 for(const p of r.played){assert.match(p.file,new RegExp(`/${p.kind}-[123]\\.(ogg|mp3)$`),'the OUT call plays an OUT word, the NET call a NET word');assert.equal(p.oscillator,false,'no Web Audio voice');}
 assert.equal(r.metrics.played['words-out'],1);assert.equal(r.metrics.played['words-net'],1);assert.equal(r.metrics.played['rec-out'],undefined);assert.equal(r.metrics.played['rec-net'],undefined);
 assert.deepEqual(r.metrics.callouts.words,{on:true,listLoaded:true,takes:{out:3,net:3}});assert.deepEqual(r.metrics.callouts.order,['words','rec','pack','synth']);
 assert.equal(r.asked.some(p=>p.startsWith(CALLOUT_REC_DIR)),false,'nothing asked from tennis-callouts-rec');assert.equal(r.asked.some(p=>p.startsWith(CALLOUT_PACK_DIR)),false,'nothing asked from the pack');
});
test('v24.9 game: when the word set does not load (missing list, missing files, or nothing decodes), Roy\'s recordings play',async()=>{
 const noList={...LISTS};delete noList[CALLOUT_WORDS_DIR+'takes.json'];
 const noFiles=Object.fromEntries(Object.entries(BYTES).filter(([p])=>!p.startsWith(CALLOUT_WORDS_DIR)));
 const badFiles=Object.fromEntries(Object.entries(BYTES).map(([p,b])=>[p,p.startsWith(CALLOUT_WORDS_DIR)?{...b,bad:true}:b]));
 for(const [name,options] of [['no list',{lists:noList}],['no files',{bytes:noFiles}],['bad files',{bytes:badFiles}]]){
  const r=await run('',options);
  assert.deepEqual(r.played.map(p=>[p.kind,dirOf(p.file)]),[['out',CALLOUT_REC_DIR],['net',CALLOUT_REC_DIR]],name);
  assert.equal(r.metrics.played['rec-out'],1,name);assert.equal(r.metrics.played['rec-net'],1,name);assert.equal(r.metrics.played['words-out'],undefined,name);
  assert.deepEqual(r.metrics.callouts.takes,{out:1,net:3},name);
 }
});
test('v24.9 game: a word set with only one of the calls keeps its word and takes the recording for the other',async()=>{
 const r=await run('',{bytes:Object.fromEntries(Object.entries(BYTES).filter(([p])=>!p.startsWith(CALLOUT_WORDS_DIR+'out-')))});
 assert.deepEqual(r.played.map(p=>[p.kind,dirOf(p.file)]),[['out',CALLOUT_REC_DIR],['net',CALLOUT_WORDS_DIR]]);
});
test('v24.9 game: ?tennisVoiceRec=1 plays Roy\'s recordings first and does not download the words',async()=>{
 const r=await run('?tennisVoiceRec=1');
 assert.deepEqual(r.played.map(p=>[p.kind,dirOf(p.file)]),[['out',CALLOUT_REC_DIR],['net',CALLOUT_REC_DIR]]);
 assert.match(r.played[0].file,/tennis-callouts-rec\/out-1\.(ogg|mp3)$/);assert.equal(r.asked.some(p=>p.startsWith(CALLOUT_WORDS_DIR)),false);
 const lost=await run('?tennisVoiceRec=1',{lists:{[CALLOUT_WORDS_DIR+'takes.json']:words}});
 assert.deepEqual(lost.played.map(p=>dirOf(p.file)),[CALLOUT_WORDS_DIR,CALLOUT_WORDS_DIR],'with the recordings first, the words are their fallback');
});
test('v24.9 game: ?tennisCalloutWords=0 is v24.8 (recordings, then the pack); with no word and no recording the pack, then the Web Audio voice',async()=>{
 const off=await run('?tennisCalloutWords=0');assert.deepEqual(off.played.map(p=>dirOf(p.file)),[CALLOUT_REC_DIR,CALLOUT_REC_DIR]);assert.equal(off.asked.some(p=>p.startsWith(CALLOUT_WORDS_DIR)),false);assert.equal(off.metrics.callouts.words.on,false);
 const pack=await run('',{lists:{}});assert.deepEqual(pack.played.map(p=>dirOf(p.file)),[CALLOUT_PACK_DIR,CALLOUT_PACK_DIR]);assert.equal(pack.metrics.played['pack-out'],1);
 const synth=await run('',{lists:{},bytes:{}});assert.deepEqual(synth.played.map(p=>[p.file,p.oscillator]),[[null,true],[null,true]]);
});
test('v24.9 game: the island sound switch still mutes the call',async()=>{
 globalThis.location={search:''};const made=[],audio=createTennisAudio({config:config.audio,storage:{getItem:()=>'off'},AudioContext:fakeContext(made),fetcher:fakeFetch({lists:LISTS,bytes:BYTES})});
 try{audio.unlock();await settle();assert.equal(audio.call('out'),false);assert.equal(made.some(n=>n.kind==='buffer'&&n.started),false);}finally{audio.dispose();}
});
