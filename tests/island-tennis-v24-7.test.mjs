// Tennis v24.7: (1) Roy's recorded happy crowd is the applause and the match cheer (?tennisCrowdRec=0 puts the synthesised ones back);
// (2) the Codex callout pack (codex/tennis-callouts-v1): the club plaque is the call sign and the pack voice replaces the Web Audio voice only
// for a call with no recorded take (?tennisCalloutPack=0 or ?tennisCallouts=0 off). Roy's OUT/NET recordings always win.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {tennisCalloutPackEnabled,loadCalloutPack,playPackCall,CALLOUT_PACK,CALLOUT_PACK_DIR,CALLOUT_REC_LIST,CALLOUT_REC_DIR} from '../workout/island/minigames/tennis-callouts.mjs';
import {createTennisAudio,tennisCrowdRecEnabled,tennisSamples,CROWD_SAMPLES} from '../workout/island/minigames/g4e-audio.mjs';
const island=new URL('../workout/island/',import.meta.url);
const read=async p=>readFile(new URL(p,island));
const config=JSON.parse(await read('data/config.json')).minigames.tennis;
const manifest=JSON.parse(await read('offline-manifest.json'));
const REC='assets/tennis-crowd-rec/',SWAPPED=['applause','applauseShort','applauseMedium','applauseLarge','matchCheer'];

test('v24.7 crowd: applause and the match cheer are Roy\'s recording, the other samples are untouched',()=>{
 for(const name of SWAPPED){assert.ok(config.audio.samples[name].startsWith(REC),`${name} -> ${config.audio.samples[name]}`);assert.ok(CROWD_SAMPLES.includes(name),`${name} goes through the crowd bus (ducked under a call)`);}
 assert.equal(config.audio.samples.matchCheer,REC+'cheer.ogg');assert.equal(config.audio.samples.applauseLarge,REC+'cheer.ogg');
 assert.equal(config.audio.samples.applauseMedium,REC+'cheer-medium.ogg');assert.equal(config.audio.samples.applauseShort,REC+'cheer-short.ogg');
 for(const [name,path] of Object.entries({hit:'racket',bounce:'bounce',net:'net',crowdBed:'stadium-bed',crowdOoh:'near-point-oh',crowdAw:'mistake-aw',crowdHush:'pre-serve-hush'}))assert.equal(config.audio.samples[name],`assets/audio/g4e/${path}.ogg`);
});
test('v24.7 crowd: ?tennisCrowdRec=0 loads the synthesised applause and cheer of v24.6 instead',()=>{
 assert.equal(tennisCrowdRecEnabled(''),true);assert.equal(tennisCrowdRecEnabled('?tennisCrowdRec=0'),false);assert.equal(tennisCrowdRecEnabled('?tennisCallouts=0'),true,'the callout flag does not touch the crowd');
 assert.deepEqual(Object.keys(config.audio.samplesSynth).sort(),[...SWAPPED].sort());
 assert.deepEqual(tennisSamples(config.audio,''),config.audio.samples);
 const off=tennisSamples(config.audio,'?tennisCrowdRec=0');
 assert.deepEqual(Object.keys(off),Object.keys(config.audio.samples),'the same sample names either way');
 for(const name of SWAPPED)assert.ok(off[name].startsWith('assets/audio/g4e/'),name);
 assert.equal(off.matchCheer,'assets/audio/g4e/match-cheer.ogg');assert.equal(off.hit,config.audio.samples.hit);
 assert.deepEqual(tennisSamples({samples:{a:'a.ogg'}},'?tennisCrowdRec=0'),{a:'a.ogg'},'a config without samplesSynth is unchanged');
});
test('v24.7 crowd: the recorded files are small Ogg Vorbis, and both sets are in the offline tennis download',async()=>{
 let total=0;
 for(const path of new Set([...Object.values(config.audio.samples),...Object.values(config.audio.samplesSynth)])){
  assert.ok(manifest.games.tennis.includes(path),`${path} must be in games.tennis`);const bytes=(await stat(new URL(path,island))).size;assert.equal(manifest.files[path][1],bytes,`${path} size in the manifest`);
  if(!path.startsWith(REC))continue;total+=bytes;const head=await read(path);assert.equal(head.subarray(0,4).toString('latin1'),'OggS');assert.ok(head.subarray(0,64).includes(Buffer.from('vorbis')),`${path} is Vorbis like the other tennis samples`);
 }
 assert.ok(total>20000&&total<100000,`recorded crowd is ${total} bytes (under 100 KB for the three cuts)`);
 assert.match(String(await read(REC+'SOURCES.md')),/Recorded by Roy/);
});
const fakeFetch=({list=[],bytes={}})=>{const asked=[];const f=async url=>{const path=new URL(url).pathname.replace(/^.*\/workout\/island\//,'');asked.push(path);if(path===CALLOUT_REC_LIST)return {ok:true,json:async()=>({takes:list})};const body=bytes[path];return body?{ok:true,arrayBuffer:async()=>body}:{ok:false};};f.asked=asked;return f;};
function fakeContext(made){
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),Q:param(),connect(){},disconnect(){},start(...a){n.started=a;},stop(){}};made.push(n);return n;};
 return class{constructor(){this.state='running';this.currentTime=1;this.sampleRate=8000;this.destination={};}createGain(){return node('gain');}createOscillator(){return node('osc');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};}decodeAudioData(b){return b.bad?Promise.reject(Error('bad')):Promise.resolve({take:b.take,duration:b.duration??1});}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
}
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,0));};
const sprite={take:'pack',duration:8.677};

test('v24.7 pack: on by default, off with ?tennisCalloutPack=0 and with ?tennisCallouts=0',()=>{
 assert.equal(tennisCalloutPackEnabled(''),true);assert.equal(tennisCalloutPackEnabled('?tennisCalloutPack=0'),false);assert.equal(tennisCalloutPackEnabled('?tennisCallouts=0'),false);assert.equal(tennisCalloutPackEnabled('?tennisCalloutRec=0'),true);
});
test('v24.7 pack: the sprite ranges and the sign data are the ones in the Codex manifest',async()=>{
 const design=JSON.parse(await read('design/tennis-callouts-v1/manifest.json'));
 for(const kind of ['out','net'])assert.deepEqual(CALLOUT_PACK.takes[kind].map(([start,seconds])=>[Math.round(start*1000),Math.round(seconds*1000)]),design.audio.events[kind].takes.map(t=>[t.startMs,t.durationMs]),kind);
 assert.deepEqual([...CALLOUT_PACK.textAnchor],design.visuals.styles.club.textAnchor);assert.deepEqual({...CALLOUT_PACK.labelColors},design.visuals.styles.club.labelColors);
});
test('v24.7 pack: the runtime copies are byte-identical to the design package, live under assets/ and are in the offline download',async()=>{
 const design=JSON.parse(await read('design/tennis-callouts-v1/manifest.json')),sha=async p=>createHash('sha256').update(await read(p)).digest('hex');
 const want={[CALLOUT_PACK.files.ogg]:design.audio.formats.ogg.sha256,[CALLOUT_PACK.files.mp3]:design.audio.formats.mp3.sha256,[CALLOUT_PACK.signs.out]:design.visuals.styles.club.signs.out.svg.sha256,[CALLOUT_PACK.signs.net]:design.visuals.styles.club.signs.net.svg.sha256};
 for(const [path,hash] of Object.entries(want)){assert.ok(path.startsWith(CALLOUT_PACK_DIR)&&CALLOUT_PACK_DIR.startsWith('assets/'));assert.equal(await sha(path),hash,path);assert.ok(manifest.games.tennis.includes(path),`${path} must be in games.tennis`);assert.ok(manifest.files[path],`${path} must be hashed`);}
 for(const path of [...manifest.shell,...Object.values(manifest.games).flat()])assert.ok(!path.includes('design/tennis-callouts-v1'),`${path}: nothing is downloaded from the design package`);
 for(const file of ['minigames/tennis-callouts.mjs','minigames/g4e-audio.mjs','minigames/tennis-session.mjs','minigames/tennis.css'])assert.ok(!/design\/tennis-callouts-v1\/(?!manifest\.json)[\w./-]+\.(?:ogg|mp3|svg|png|js|css)/.test(String(await read(file))),`${file} loads nothing from design/`);
 assert.match(String(await readFile(new URL('../.github/workflows/pages.yml',import.meta.url))),/ tennis-callouts-v1 /,'the design package is not published');
});
test('v24.7 pack: the loader takes the playable format first and falls back to the other',async()=>{
 const context={decodeAudioData:async b=>{if(b.bad)throw Error('bad');return {name:b.name};}},base=new URL('minigames/g4e-audio.mjs',island).href;
 let f=fakeFetch({bytes:{[CALLOUT_PACK.files.ogg]:{name:'ogg'},[CALLOUT_PACK.files.mp3]:{name:'mp3'}}});
 assert.equal((await loadCalloutPack(context,{base,fetcher:f,opus:true})).name,'ogg');assert.deepEqual(f.asked,[CALLOUT_PACK.files.ogg]);
 assert.equal((await loadCalloutPack(context,{base,fetcher:f,opus:false})).name,'mp3');
 f=fakeFetch({bytes:{[CALLOUT_PACK.files.ogg]:{bad:true},[CALLOUT_PACK.files.mp3]:{name:'mp3'}}});assert.equal((await loadCalloutPack(context,{base,fetcher:f,opus:true})).name,'mp3');
 assert.equal(await loadCalloutPack(context,{base,fetcher:fakeFetch({}),opus:true}),null);assert.equal(await loadCalloutPack(context,{base,fetcher:async()=>{throw Error('offline');}}),null);
});
test('v24.7 pack: one take plays from its own range of the sprite',()=>{
 const made=[],Ctx=fakeContext(made),context=new Ctx();
 assert.equal(playPackCall(context,{},sprite,'net',1),.489);const source=made.find(n=>n.kind==='buffer');assert.deepEqual(source.started,[0,2.534,.489]);assert.equal(source.buffer,sprite);
 assert.equal(playPackCall(context,{},sprite,'out',4),.543,'the index wraps');
 assert.equal(playPackCall(context,{},sprite,'good',0),0,'only OUT and NET are connected');assert.equal(playPackCall(context,{},null,'out',0),0);
 assert.equal(playPackCall(context,{},{duration:1},'net',0),0,'a sprite shorter than the range (a wrong file) is not played');
});
test('v24.7 pack: Roy\'s recordings win; the pack voice is only for a call with no recorded take; the flag keeps the Web Audio voice',async()=>{
 const recBytes={[CALLOUT_REC_DIR+'out-1.ogg']:{take:'o1'},[CALLOUT_REC_DIR+'net-1.ogg']:{take:'n1'}},packBytes={[CALLOUT_PACK.files.ogg]:sprite,[CALLOUT_PACK.files.mp3]:sprite};
 const run=async(search,list)=>{globalThis.location={search};const made=[],fetcher=fakeFetch({list,bytes:{...recBytes,...packBytes}}),audio=createTennisAudio({config:config.audio,storage:{getItem:()=>'on'},AudioContext:fakeContext(made),fetcher});
  audio.unlock();await settle();made.length=0;const out={};
  for(const kind of ['out','net']){made.length=0;assert.equal(audio.call(kind),true);const buffers=made.filter(n=>n.kind==='buffer'&&n.buffer?.take).map(n=>n.buffer.take);out[kind]=made.some(n=>n.kind==='osc')?'synth':buffers[0];}
  const metrics=audio.metrics(),asked=fetcher.asked.some(p=>p.startsWith(CALLOUT_PACK_DIR));audio.dispose();globalThis.location={search:''};return {...out,metrics,asked};};
 let r=await run('',['out-1.ogg','net-1.ogg']);assert.deepEqual([r.out,r.net],['o1','n1']);assert.equal(r.asked,false,'both calls recorded: the sprite is not downloaded');assert.equal(r.metrics.callouts.pack.loaded,false);
 r=await run('',['net-1.ogg']);assert.deepEqual([r.out,r.net],['pack','n1'],'OUT has no take: the pack voice; NET stays the recording');assert.equal(r.metrics.played['pack-out'],1);assert.equal(r.metrics.played['rec-net'],1);assert.equal(r.metrics.played['pack-net'],undefined);
 r=await run('?tennisCalloutRec=0',['out-1.ogg','net-1.ogg']);assert.deepEqual([r.out,r.net],['pack','pack']);
 r=await run('?tennisCalloutPack=0',['net-1.ogg']);assert.deepEqual([r.out,r.net],['synth','n1']);assert.equal(r.asked,false,'flag off: the sprite is not requested');
 r=await run('?tennisCalloutPack=0&tennisCalloutRec=0',[]);assert.deepEqual([r.out,r.net],['synth','synth'],'v24.4 exactly');
});
test('v24.7 pack: the shipped takes.json still gives Roy\'s takes for both calls, so the pack voice is a reserve only',async()=>{
 const list=JSON.parse(await read(CALLOUT_REC_LIST)).takes;assert.ok(list.some(n=>/^out-\d\.ogg$/.test(n))&&list.some(n=>/^net-\d\.ogg$/.test(n)));
 for(const name of list)assert.ok((await stat(new URL(CALLOUT_REC_DIR+name,island))).size>1000,name);
});
test('v24.7 pack: the session shows the club plaque behind the flag and keeps the v24.4 plate without it',async()=>{
 const session=String(await read('minigames/tennis-session.mjs')),css=String(await read('minigames/tennis.css'));
 assert.match(session,/callPack=callouts&&tennisCalloutPackEnabled\(\)/);assert.match(session,/if\(callPack\)\{outSign\.style\.backgroundImage=.*CALLOUT_PACK\.signs\[call\].*\}else callIcon\.style\.backgroundImage=.*tennis-ui-v2\/fx-\$\{call\}\.svg/);
 assert.match(css,/\.tennis-out-sign\.tennis-call\.tennis-call-plaque/);assert.match(css,/\.tennis-call-plaque \.tennis-call-icon\{display:none\}/);
});
