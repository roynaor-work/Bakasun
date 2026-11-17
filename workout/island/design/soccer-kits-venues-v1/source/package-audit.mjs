// Final size + add-only scope check. Writes no files, so its byte measurement
// includes the final report and verification artifacts exactly as delivered.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root,repo,json} from './common.mjs';
const manifest=await json('manifest.json'),prefix='workout/island/design/soccer-kits-venues-v1/';
const files=[];
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  assert.ok(!entry.isSymbolicLink(),'no symlinks outside the size budget');
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())await walk(file);else if(entry.isFile())files.push({file:path.relative(root,file),bytes:(await fs.stat(file)).size});
}}
await walk(root);const bytes=files.reduce((n,f)=>n+f.bytes,0);
assert.ok(bytes<=manifest.budget.maxBytes,`Package is ${bytes} bytes > ${manifest.budget.maxBytes}`);
const diff=execFileSync('git',['diff','--name-status',manifest.baseCommit,'--'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const line of diff){const [status,file]=line.split('\t');assert.equal(status,'A','existing file changed: '+line);assert.ok(file.startsWith(prefix),'outside allowed folder: '+line);}
const status=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:repo,encoding:'utf8'}).trimEnd().split('\n').filter(Boolean);
for(const line of status){const file=line.slice(3);assert.ok(file.startsWith(prefix),'working-tree change outside folder: '+line);assert.ok(['??','A ',' A'].includes(line.slice(0,2)),'existing-file edit: '+line);}
console.log(JSON.stringify({passed:true,bytes,maxBytes:manifest.budget.maxBytes,headroomBytes:manifest.budget.maxBytes-bytes,
  files:files.length,trackedAdditions:diff.length,scope:prefix,existingFilesChanged:0},null,2));
