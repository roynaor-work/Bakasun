// Final delivery audit: prevent stale reports, accidental files and out-of-scope edits.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const prefix='workout/island/design/characters2/';
const base='3853d282b6dd7719db49a864fec4286dc7b63cb0';
const models=['soccer-player','goalkeeper','basketball-player','skier'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const [gltf,variants,preview,viewer,regions,manifest,tests]=await Promise.all([
  'verification/gltf-validation.json','verification/variants.json','verification/preview.json',
  'verification/viewer-validation.json','regions.json','manifest.json','verification/repository-tests.json',
].map(read));
for(const [name,report] of Object.entries({gltf,variants,preview,viewer}))assert.equal(report.pass,true,`${name} report did not pass`);
assert.equal(viewer.scope.fullViewerChecks,true,'Diagnostic-only viewer report cannot certify delivery');
assert.equal(viewer.cases.length,12);
assert.equal(viewer.cases.reduce((sum,c)=>sum+c.deformation.clips.length,0),128);
for(const entry of viewer.cases){assert.equal(entry.pass,true);await fs.access(path.join(root,'verification',entry.contactSheet));}
assert.deepEqual(manifest.models,models);
assert.equal(variants.appearanceApplications,792);
assert.equal(variants.preparedOutfits.length,22);
assert.equal(preview.captures.length,12);
for(const model of models){
  const bytes=await fs.readFile(path.join(root,`${model}.glb`)),sha=hash(bytes);
  assert.ok(bytes.length<=300000);
  assert.equal(gltf.models.find(m=>m.model===model).sha256,sha,'Stale glTF report');
  assert.equal(regions.models[model].sha256,sha,'Stale wardrobe region map');
  assert.equal(preview.sourceSha256[model],sha,'Stale previews');
  assert.equal(viewer.sourceSha256[prefix+model+'.glb'],sha,'Stale motion evidence');
}
for(const [file,sha] of Object.entries(viewer.sourceSha256))assert.equal(hash(await fs.readFile(path.join(repo,file))),sha,`Motion input changed: ${file}`);
assert.equal(hash(await fs.readFile(path.join(root,'../variants/apply-variant.js'))),variants.applicationModuleSha256);
for(const capture of preview.captures)assert.equal(hash(await fs.readFile(path.join(root,capture.file))),capture.sha256);
for(const name of ['README.md','VALIDATION.md','LICENSES.md'])await fs.access(path.join(root,name));
const changed=execFileSync('git',['diff','--name-status',base],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const row of changed){const [status,file]=row.split('\t');assert.equal(status,'A','Existing files must remain untouched');assert.ok(file.startsWith(prefix));}
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const file of untracked)assert.ok(file.startsWith(prefix),`Unexpected untracked file: ${file}`);
async function collect(directory){
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(['__pycache__','node_modules','inventory.json'].includes(entry.name)||entry.name.endsWith('.pyc'))continue;
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await collect(target));
    else if(entry.isFile())result.push(target);
  }
  return result;
}
const files=[];
for(const file of (await collect(root)).sort()){
  const bytes=await fs.readFile(file),relative=path.relative(root,file);
  if(/\.(?:mjs|js|py|html|json|md|txt)$/.test(relative))assert.ok(!bytes.toString('utf8').includes('?'+'v='),`Version query in ${relative}`);
  files.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});
}
assert.deepEqual(files.filter(f=>f.path.endsWith('.glb')).map(f=>f.path).sort(),models.map(m=>m+'.glb').sort());
const inventory={baseCommit:base,assetChecksPass:true,repositoryTestsPass:tests.pass,
  repositoryTests:tests.counts,budgetBytesPerCharacter:300000,unchangedExistingFiles:true,
  totalPackageBytes:files.reduce((sum,file)=>sum+file.bytes,0),files};
await fs.writeFile(path.join(root,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
console.log(`PASS: ${files.length} new package files, all asset evidence current; repository tests ${tests.counts.fail} baseline failure(s).`);
