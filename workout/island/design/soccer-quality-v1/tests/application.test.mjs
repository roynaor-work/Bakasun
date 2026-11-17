import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const apply=join(packageRoot,'apply.sh');
const ownRoot=spawnSync('git',['-C',packageRoot,'rev-parse','--show-toplevel'],{encoding:'utf8'}).stdout.trim();
const root=process.env.SOCCER_QUALITY_SOURCE,baseline=process.env.SOCCER_QUALITY_BASE;
if(!root||!baseline)throw Error('Set SOCCER_QUALITY_SOURCE and SOCCER_QUALITY_BASE');
const {soccerResult}=await import(pathToFileURL(resolve(root,'workout/island/minigames/soccer-result.mjs')));
const base=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;

test('apply refuses its own repository before touching source files',()=>{
  assert.ok(ownRoot);const result=spawnSync('bash',[apply,ownRoot,'--check'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.match(result.stderr,/separate clean Git copy/);
});

test('apply refuses dirty and mismatched destinations without changing their files',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'soccer-quality-apply-safety-'));
  try{
    assert.equal(spawnSync('git',['init','--quiet',temp]).status,0);
    const sentinel=join(temp,'sentinel.txt');await writeFile(sentinel,'retained content\n');
    assert.equal(spawnSync('git',['-C',temp,'add','sentinel.txt']).status,0);
    assert.equal(spawnSync('git',['-C',temp,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','test fixture']).status,0);
    const dirty=join(temp,'untracked.txt');await writeFile(dirty,'retained untracked\n');
    const rejected=spawnSync('bash',[apply,temp],{encoding:'utf8'});
    assert.equal(rejected.status,2);assert.match(rejected.stderr,/no tracked or untracked changes/);
    assert.equal(await readFile(dirty,'utf8'),'retained untracked\n');
    await rm(dirty);
    const mismatch=spawnSync('bash',[apply,temp],{encoding:'utf8'});
    assert.notEqual(mismatch.status,0);assert.equal(await readFile(sentinel,'utf8'),'retained content\n');
    assert.equal(spawnSync('git',['-C',temp,'status','--porcelain'],{encoding:'utf8'}).stdout,'');
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('result validation accepts the same duration selected by quality eleven and legacy URL overrides',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    for(const [search,duration] of [
      ['?soccerFull=0&soccerQuality11=1',180],
      ['?soccerTeams=6&soccerQuality=v1',180],
      ['?soccerFull=0&soccerQuality11=0',base.match.halfSeconds*2],
      ['?soccerFull=0&soccerQualityPass=1',base.match.halfSeconds*2]
    ]){
      Object.defineProperty(globalThis,'location',{value:{search},configurable:true});
      const soccer={won:true,goalsFor:1,goalsAgainst:0,stage:1,stars:3,seed:7,durationSeconds:duration,difficulty:'normal'};
      const result=soccerResult({outcome:'win',score:1,soccer},{level:1,seed:7,difficulty:'normal'},base);
      assert.equal(result?.outcome,'win',search);
      assert.equal(soccerResult({outcome:'win',score:1,soccer:{...soccer,durationSeconds:duration+1}},{level:1,seed:7,difficulty:'normal'},base),null);
    }
  }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
});
