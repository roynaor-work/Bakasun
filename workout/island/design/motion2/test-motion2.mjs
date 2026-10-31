#!/usr/bin/env node
// Asset-only fixture staging. The original viewer and all its limits run unchanged.
import {readFile,writeFile,mkdir,cp,mkdtemp} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const island=resolve(here,'../..');
const args=process.argv.slice(2);
const baseline=JSON.parse(await readFile(join(here,'source-baseline.json'),'utf8'));
for(const [file,expected] of Object.entries(baseline.gitBlobSha1)){
  const bytes=await readFile(join(island,file));
  // Git may check text out with CRLF on Windows. Compare its canonical blob.
  const canonical=/\.(glb|wasm)$/.test(file)?bytes:Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  const actual=createHash('sha1').update('blob '+canonical.length+'\0').update(canonical).digest('hex');
  if(actual!==expected)throw Error(file+': baseline differs from '+baseline.baseCommit);
}
const fixture=await mkdtemp(join(tmpdir(),'island-motion2-'));
const fixtureIsland=join(fixture,'workout/island');
const outputIndex=args.indexOf('--out');
if(outputIndex<0)args.push('--out',resolve(here,'verification'));
const output=resolve(args[args.indexOf('--out')+1]);
await mkdir(output,{recursive:true});
await mkdir(join(fixtureIsland,'design'),{recursive:true});
for(const part of ['vendor','design/viewer','design/characters'])await cp(join(island,part),join(fixtureIsland,part),{recursive:true});
await mkdir(join(fixtureIsland,'design/motion'),{recursive:true});
const manifest={schemaVersion:1,baseCommit:baseline.baseCommit,fixture,sourceGitBlobSha1:baseline.gitBlobSha1,sourceSha256:{},motion2Sha256:{},combinedSha256:{},newClips:{}};
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const game of ['soccer','hoops','alpine']){
  const baseBytes=await readFile(join(island,'design/motion',game+'.json'));
  const newBytes=await readFile(join(here,game+'.json'));
  const base=JSON.parse(baseBytes),extra=JSON.parse(newBytes);
  if(JSON.stringify(base.skeleton)!==JSON.stringify(extra.skeleton))throw Error(game+': skeleton differs');
  for(const name of Object.keys(extra.states))if(base.states[name])throw Error(game+': state collision '+name);
  const combined={...base,states:{...base.states,...extra.states},transitions:[...base.transitions,...extra.transitions],eventInputs:[...new Set([...base.eventInputs,...extra.eventInputs])]};
  const bytes=JSON.stringify(combined,null,2)+'\n';
  await writeFile(join(fixtureIsland,'design/motion',game+'.json'),bytes);
  manifest.sourceSha256['design/motion/'+game+'.json']=sha(baseBytes);
  manifest.motion2Sha256[game+'.json']=sha(newBytes);
  manifest.combinedSha256[game+'.json']=sha(bytes);
  manifest.newClips[game]=Object.keys(extra.states);
}
for(const file of ['viewer.html','viewer.js','animation.js','retarget.js','retarget-map.json','checks.js','test-viewer.mjs'])manifest.sourceSha256['design/viewer/'+file]=sha(await readFile(join(island,'design/viewer',file)));
await writeFile(join(output,'motion2-inputs.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Staged additive motion fixture: '+fixture);
const child=spawn(process.execPath,[join(fixtureIsland,'design/viewer/test-viewer.mjs'),...args],{stdio:'inherit',env:process.env});
child.on('error',e=>{console.error(e);process.exitCode=1});
child.on('exit',(code)=>{process.exitCode=code??1});
