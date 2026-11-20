// v24.7 hygiene: the four Codex packages (kid UX, strings, test fixes, privacy) and the switches that put the previous behaviour back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {kidUxPolicy,kidUx,localHebrewVoices} from '../workout/island/kid-ux.mjs';
import {legacyPrivacy} from '../workout/js/privacy-flag.js';
import {createLearningVoice} from '../workout/island/learning/voice.mjs';
import {approvedUploadEndpoint,APPROVED_UPLOAD_ENDPOINTS} from '../workout/cam-lab/upload-endpoints.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const island=path.join(repo,'workout/island');
const read=file=>readFile(path.join(repo,file),'utf8');
const manifest=JSON.parse(await read('workout/island/offline-manifest.json'));
const ARABIC=/\p{Script_Extensions=Arabic}/u, EXCLAIM=/[!！﹗❗❕‼⁉]/u;

test('kid UX: on by default in a page, ?kidUx=0 restores the previous interface, single fixes can be kept or dropped',()=>{
 const on=kidUxPolicy('',true);assert.equal(on('005'),true);assert.equal(on(40),true,'numbers are padded');
 const off=kidUxPolicy('?kidUx=0',true);for(const id of ['001','005','027','040'])assert.equal(off(id),false);
 const only=kidUxPolicy('?kidUx=005,012',true);assert.equal(only('005'),true);assert.equal(only('012'),true);assert.equal(only('006'),false);
 const except=kidUxPolicy('?kidUxOff=021,022',true);assert.equal(except('021'),false);assert.equal(except('022'),false);assert.equal(except('023'),true);
 assert.equal(kidUxPolicy('?kidUx=0&kidUxOff=005',true)('006'),false,'0 wins');
 assert.equal(kidUxPolicy('?kidUx=junk',true)('005'),false,'an unknown value does not switch fixes on');
 assert.equal(kidUxPolicy('',false)('005'),false,'outside a page (unit tests of the games) nothing changes');
 assert.equal(kidUxPolicy('?kidUx=1',false)('005'),true);
 assert.equal(kidUx('005'),false,'this process has no page');
});

test('kid UX: all forty fixes are wired through the one switch and its modules are in the offline shell',async()=>{
 const used=new Set();
 for(const file of manifest.shell.filter(p=>/\.(mjs|js)$/.test(p))){
  for(const m of (await read('workout/island/'+file)).matchAll(/kidUx(?:Style)?\(\s*['"]?(\d{1,3})['"]?/g))used.add(m[1].padStart(3,'0'));
 }
 const all=Array.from({length:40},(_,i)=>String(i+1).padStart(3,'0'));
 assert.deepEqual(all.filter(id=>!used.has(id)),[],'every KUX id is read somewhere in the shipped code');
 for(const file of ['kid-ux.mjs','ui/kid-ux-help.mjs','ui/kid-ux-library.mjs','ui/kid-ux-result.mjs','minigames/catch-kid-practice.mjs','minigames/kid-hoops-pass-demo.mjs'])
  assert.ok(manifest.shell.includes(file),file+' is in the offline shell');
});

test('strings: no exclamation marks and no Arabic script in the catalog; ?strings=v246 overlays only changed keys',async()=>{
 const catalog=JSON.parse(await read('workout/island/data/strings.he.json')),previous=JSON.parse(await read('workout/island/data/strings.he.v246.json'));
 const bad=Object.entries(catalog).filter(([,v])=>typeof v==='string'&&(ARABIC.test(v)||EXCLAIM.test(v))).map(([k])=>k);
 assert.deepEqual(bad,[]);
 const keys=Object.keys(previous);assert.ok(keys.length>200,'the overlay holds the reworded keys');
 for(const key of keys){assert.ok(Object.hasOwn(catalog,key),key+' exists in the catalog');assert.notEqual(previous[key],catalog[key],key+' really differs');assert.ok(!ARABIC.test(previous[key])&&!EXCLAIM.test(previous[key]),key+': the restored wording has no Arabic script and no exclamation mark');}
 for(const key of ['equipment.nameRank','equipment.buyShort','equipment.ownedShort'])assert.ok(Object.hasOwn(catalog,key),key);
 const app=await read('workout/island/app.mjs');
 assert.match(app,/get\('strings'\) === 'v246'/);assert.match(app,/strings\.he\.v246\.json/);
 assert.ok(manifest.shell.includes('data/strings.he.v246.json')||manifest.core.includes('data/strings.he.v246.json'),'the overlay is available offline too');
});

test('strings: kid UX texts in the shipped modules carry no exclamation marks and no Arabic script',async()=>{
 const hits=[];
 for(const file of ['kid-ux.mjs','ui/kid-ux-help.mjs','ui/kid-ux-library.mjs','ui/kid-ux-result.mjs','minigames/catch-kid-practice.mjs','minigames/kid-hoops-pass-demo.mjs','learning/spoken-copy.mjs']){
  const source=await read('workout/island/'+file);
  for(const m of source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*[֐-׿](?:\\.|(?!\1)[^\\\n])*)\1/g)){
   const text=m[2].replace(/!\s*important/gi,'');
   if(ARABIC.test(text)||EXCLAIM.test(text))hits.push(file+': '+text.slice(0,60));
  }
 }
 assert.deepEqual(hits,[]);
});

test('privacy: only voices installed on the device read aloud; ?privacy=v246 restores network voices for one visit',()=>{
 const voices=[{lang:'en-US',localService:true},{lang:'he-IL',localService:false,name:'network'},{lang:'he-IL',localService:true,name:'device'},{lang:'iw',name:'unknown'}];
 const engine={getVoices:()=>voices};
 assert.deepEqual(localHebrewVoices(engine,'').map(v=>v.name),['device']);
 assert.deepEqual(localHebrewVoices(engine,'?privacy=v246').map(v=>v.name),['network','device','unknown']);
 assert.deepEqual(localHebrewVoices({getVoices(){throw Error('blocked');}},''),[]);
 assert.deepEqual(localHebrewVoices(undefined,''),[]);
 assert.equal(legacyPrivacy(''),false);assert.equal(legacyPrivacy('?privacy=v246'),true);assert.equal(legacyPrivacy('?privacy=1'),false);
 const spoken=[],network={getVoices:()=>[voices[1]],cancel(){},speak:u=>spoken.push(u),addEventListener(){},removeEventListener(){}};
 const Utterance=class{constructor(text){this.text=text;}};
 const strict=createLearningVoice({synthesis:network,Utterance});assert.equal(strict.available,false);assert.equal(strict.speak('שלום'),false);assert.equal(spoken.length,0,'a network voice gets no text');
 const legacy=createLearningVoice({synthesis:network,Utterance,legacyVoices:true});assert.equal(legacy.available,true);assert.equal(legacy.speak('שלום'),true);assert.equal(spoken.length,1);
});

test('privacy: camera upload has no approved destination, so nothing can be sent',()=>{
 assert.deepEqual([...APPROVED_UPLOAD_ENDPOINTS],[]);
 assert.equal(approvedUploadEndpoint('https://example.invalid/ingest'),null);
 assert.equal(approvedUploadEndpoint('https://example.invalid/ingest',['https://example.invalid/ingest']),'https://example.invalid/ingest');
 for(const bad of ['http://example.invalid/ingest','https://example.invalid/ingest?x=1','https://example.invalid/ingest#a','https://user@example.invalid/ingest',42,null])
  assert.equal(approvedUploadEndpoint(bad,['https://example.invalid/ingest','http://example.invalid/ingest']),null,String(bad));
});

test('privacy: the island loads nothing from another host (page policy and shipped code)',async()=>{
 const html=await read('workout/island/index.html');
 const csp=html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
 assert.doesNotMatch(csp,/https?:|wss?:|\*/,'the policy names no outside host');
 assert.match(csp,/connect-src 'self' blob:;/);assert.match(csp,/script-src 'self';/);
 assert.doesNotMatch(html,/(?:src|href)\s*=\s*["']https?:/i);
 const loaders=/(?:fetch|import|importScripts|new\s+(?:WebSocket|EventSource|Worker))\s*\(\s*['"`](?:https?:|wss?:)?\/\/|sendBeacon\s*\(|@import\s+(?:url\()?['"]?https?:|url\(\s*['"]?https?:/;
 const hits=[];
 for(const file of [...manifest.core,...manifest.shell].filter(p=>/\.(mjs|js|css|html)$/.test(p)&&!p.startsWith('vendor/')&&!/\/vendor\//.test(p))){
  if(loaders.test(await read('workout/island/'+file)))hits.push(file);
 }
 assert.deepEqual(hits,[]);
 for(const page of ['workout/island/minigames/boar-island/index.html','workout/voice-rec/index.html','workout/cam-lab/index.html']){
  const policy=(await read(page)).match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy,page+' has a policy');assert.doesNotMatch(policy,/https?:|wss?:/,page);
 }
 for(const page of ['workout/3d/index.html','workout/3d/sheet.html'])assert.doesNotMatch(await read(page),/fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/,page);
});

test('privacy: listening to the child is off until a parent turns it on and needs on-device recognition',async()=>{
 const count=await read('workout/js/count.js'),app=await read('workout/js/app.js');
 assert.match(count,/processLocally/);assert.match(count,/SR\.available\(\{ langs: \[lang\], processLocally: true \}\)/);
 assert.match(app,/legacyPrivacy\(\) \? store\.profile\.listen !== false : store\.profile\.listenLocal === true/);
 assert.match(app,/id="listen" \$\{p\.listenLocal === true \? 'checked' : ''\}/,'the setting starts unchecked');
});

test('privacy: the published site holds runtime files only (no evidence, tests, tools or review packages)',()=>{
 const listed=execFileSync('python3',['.github/scripts/stage-pages.py','--list'],{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024}).trim().split('\n');
 const set=new Set(listed);
 assert.ok(listed.length>2500,'the runtime is there: '+listed.length);
 const forbidden=/(^|\/)(verification|evidence|iterations|tests|tools|notes|docs|audit|source|snapshots?|private|node_modules)(\/|$)/i;
 assert.deepEqual(listed.filter(p=>forbidden.test(p)),[]);
 assert.deepEqual(listed.filter(p=>/-(audit|patches)-v1\//.test(p)),[],'audit and patch packages stay in the repository only');
 assert.deepEqual(listed.filter(p=>/\.(sql|csv|xlsx|bundle|py|sh|map|log|patch)$/i.test(p)),[]);
 assert.deepEqual(listed.filter(p=>/\.md$/i.test(p)&&!/licen[sc]e/i.test(path.basename(p))),[],'the only notes are licences');
 assert.deepEqual(listed.filter(p=>/^(ops|supabase|audit|codex-lab|design)\//.test(p)||/^(CLAUDE|AGENTS|NOTES)\.md$/.test(p)),[]);
 for(const p of [...manifest.core,...manifest.shell,...Object.values(manifest.games).flat()].filter(Boolean))assert.ok(set.has('workout/island/'+p),p+' is published');
 for(const p of ['index.html','sw.js','workout/index.html','workout/island/index.html','workout/island/kid-ux.mjs','workout/island/release.json','workout/island/offline-sw.js','workout/js/privacy-flag.js','workout/cam-lab/upload-endpoints.mjs','north/index.html',
  'workout/island/vendor/LICENSE.three','workout/island/minigames/boar-island/fonts/OFL.txt','workout/voice-rec/index.html','workout/3d/motion.html'])assert.ok(set.has(p),p+' is published');
 assert.ok(listed.some(p=>p.startsWith('workout/island/design/racing-audio-v3/')),'wired design packs outside the offline list stay reachable');
 assert.ok(!listed.some(p=>p.startsWith('workout/island/design/soccer-v7/')),'review packs stay out');
});

test('privacy: the business app caches its own shell only and reads PDF files without eval',async()=>{
 const sw=await read('sw.js');
 assert.match(sw,/!SHELL\.has\(e\.request\.url\)/);assert.match(sw,/private\|no-store/);assert.match(sw,/e\.request\.headers\.has\('Authorization'\)/);
 for(const file of ['js/files.js','js/pdfedit.js'])assert.match(await read(file),/isEvalSupported: false/,file);
});
