// Run after build/validation/browser audit. Optional repository evidence:
// node source/package-audit.mjs --repo-log /tmp/test.log --repo-exit 0
// Optional --retry-log /tmp/retry.log --retry-exit 0 records a browser setup retry.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(root,'../../../..'),prefix='workout/island/design/boars-world-v1/';
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'))),arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('branch','--show-current'),'codex/boars-world-v1');
assert.equal(git('ls-tree','-r','--name-only',manifest.baseCommit,'--',prefix),'','The destination folder must not exist at the base commit');
const diff=git('diff','--name-status',manifest.baseCommit).split('\n').filter(Boolean).map(l=>{const [status,file]=l.split('\t');return {status,file};});
for(const d of diff){assert.equal(d.status,'A',`Existing path was changed: ${JSON.stringify(d)}`);assert.ok(d.file.startsWith(prefix),'Change outside allowed folder');}
const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean);for(const file of untracked)assert.ok(file.startsWith(prefix),'Untracked file outside allowed folder: '+file);
execFileSync('git',['diff','--check',manifest.baseCommit],{cwd:repo,stdio:'pipe'});
const repositoryFile=path.join(root,'verification/repository.json');let tests;
try{tests=JSON.parse(await fs.readFile(repositoryFile)).tests;}catch{}
if(arg('--repo-log')){
  const log=await fs.readFile(path.resolve(arg('--repo-log')),'utf8'),count=key=>{const match=log.match(new RegExp('(?:ℹ|#)\\s+'+key+'\\s+(\\d+)'));return match?Number(match[1]):null;};
  tests={command:'npm test',exitCode:Number(arg('--repo-exit')),tests:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped'),
    environment:{node:process.version},log:'Authoring log stored outside the delivered package; this file retains the summary.'};
  assert.ok(arg('--repo-exit')!==null,'Pass the actual exit code');
  if(arg('--retry-log')){
    const retry=await fs.readFile(path.resolve(arg('--retry-log')),'utf8'),retryCount=key=>{const m=retry.match(new RegExp('(?:ℹ|#)\\s+'+key+'\\s+(\\d+)'));return m?Number(m[1]):null;};
    assert.ok(arg('--retry-exit')!==null,'Pass the actual retry exit code');
    tests.targetedRetry={file:'tests/workout-royiki.test.mjs',exitCode:Number(arg('--retry-exit')),tests:retryCount('tests'),passed:retryCount('pass'),failed:retryCount('fail'),skipped:retryCount('skipped'),
      command:'node --test --test-force-exit tests/workout-royiki.test.mjs (temporary NODE_OPTIONS preload selects installed Chromium)',
      executablePath:'/usr/bin/chromium',browser:'Chromium 151.0.7922.173',
      adjustment:'Test-only chromium.launch wrapper selected executablePath plus --no-sandbox and --enable-unsafe-swiftshader; test bodies and app source unchanged.'};
    if(/Executable doesn't exist.*chromium_headless_shell/.test(log)){
      tests.initialEnvironmentFailure='Bundled Playwright Chromium headless shell is not installed. The failed browser launch left its existing test HTTP server open; the idle worker was terminated after all other test modules completed.';
      tests.allNonSkippedCasesObservedPassingAcrossRuns=tests.failed===1&&tests.targetedRetry.exitCode===0&&tests.targetedRetry.failed===0&&tests.targetedRetry.passed===5;
      tests.uniqueNonSkippedCasesCovered=tests.tests-tests.skipped;
    }
  }
}
const repository={baseCommit:manifest.baseCommit,branch:git('branch','--show-current'),scope:prefix,existingFilesChanged:0,changesOnlyNewFilesInAllowedFolder:true,
  diffCheckPassed:true,addedTrackedPaths:diff.length,newUntrackedPaths:untracked.length,tests:tests||{status:'not recorded'}};
await fs.writeFile(repositoryFile,JSON.stringify(repository,null,2)+'\n');
async function walk(dir,relative=''){
  const files=[];for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    assert.ok(!e.isSymbolicLink(),'No symlinks');assert.notEqual(e.name,'node_modules','Keep authoring dependencies outside the package');
    const file=relative+e.name;if(e.isDirectory())files.push(...await walk(path.join(dir,e.name),file+'/'));else if(file!=='verification/package.json'){
      const bytes=await fs.readFile(path.join(dir,e.name));files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }return files;
}
const files=await walk(root),sum=files.reduce((n,f)=>n+f.bytes,0),self={file:'verification/package.json',bytes:0,sha256:null,note:'Self hash omitted to avoid recursion.'};
const report={schemaVersion:1,maximumBytes:4000000,totalBytes:0,totalFiles:files.length+1,underBudget:true,glbBytes:files.filter(f=>f.file.endsWith('.glb')).reduce((n,f)=>n+f.bytes,0),files:[...files,self]};
for(let i=0;i<20;i++){
  const size=Buffer.byteLength(JSON.stringify(report,null,2)+'\n');
  if(self.bytes===size&&report.totalBytes===sum+size)break;self.bytes=size;report.totalBytes=sum+size;
}
const serialized=JSON.stringify(report,null,2)+'\n';assert.equal(Buffer.byteLength(serialized),self.bytes);assert.equal(sum+self.bytes,report.totalBytes);
assert.ok(report.totalBytes<4000000,'Whole folder exceeds 4,000,000 bytes');
await fs.writeFile(path.join(root,'verification/package.json'),serialized);
console.log(JSON.stringify({totalBytes:report.totalBytes,totalFiles:report.totalFiles,glbBytes:report.glbBytes,existingFilesChanged:repository.existingFilesChanged,tests:repository.tests},null,2));
