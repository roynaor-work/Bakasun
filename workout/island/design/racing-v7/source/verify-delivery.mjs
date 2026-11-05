// Read-only integrity check for the completed package and its embedded edition.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const execFileAsync=promisify(execFile);
const gitOutput=async args=>(await execFileAsync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:4*1024*1024})).stdout;
const prefix='workout/island/design/racing-v7/';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const failures=[];
const inventory=JSON.parse(await fs.readFile(path.join(root,'verification/inventory.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
for(const entry of inventory.files){
  const file=path.resolve(root,entry.file);
  if(!file.startsWith(root+path.sep)){failures.push('Inventory path escapes package: '+entry.file);continue;}
  const bytes=await fs.readFile(file);
  if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)failures.push('Inventory mismatch: '+entry.file);
}
for(const entry of manifest.runtimeFiles){
  const bytes=await fs.readFile(path.join(root,entry.file));
  if(digest(bytes)!==entry.sha256)failures.push('Runtime manifest mismatch: '+entry.file);
}

const html=await fs.readFile(path.join(root,'offline.html'),'utf8');
const encoded=html.match(/const compressed=Uint8Array\.from\(atob\('([A-Za-z0-9+/=]+)'\)/)?.[1];
if(!encoded)throw new Error('The standalone payload is absent');
const bundle=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
for(const [file,base64]of Object.entries(bundle.files)){
  const original=await fs.readFile(path.join(root,file));
  if(digest(Buffer.from(base64,'base64'))!==digest(original))failures.push('Stale embedded asset: '+file);
}
for(const [id,source]of Object.entries(bundle.modules)){
  const file=id.replace(/^racing\//,'');
  const original=await fs.readFile(path.join(root,file),'utf8');
  // Resolve the standalone edition's import aliases back to local specifiers.
  const restored=source.replace(/(from\s*|import\s*)(['"])(racing\/[^'"]+)\2/g,(all,head,quote,specifier)=>{
    const target=specifier.slice('racing/'.length);
    let relative=path.posix.relative(path.posix.dirname(file),target);
    if(!relative.startsWith('.'))relative='./'+relative;
    return head+quote+relative+quote;
  });
  if(restored!==original)failures.push('Stale embedded module: '+file);
}
const css=await fs.readFile(path.join(root,'style.css'),'utf8');
if(!html.includes('<style>'+css+'</style>'))failures.push('Stale embedded CSS');
for(const license of ['vendor/LICENSE.three','vendor/draco/LICENSE.draco']){
  const escaped=(await fs.readFile(path.join(root,license),'utf8')).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  if(!html.includes(escaped))failures.push('Missing standalone license: '+license);
}

const localReferences=[];
async function checkLinks(file){
  const source=await fs.readFile(path.join(root,file),'utf8');
  const references=file.endsWith('.html')?[...source.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]):[...source.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]);
  for(const target of references){
    if(/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target))continue;
    const clean=decodeURIComponent(target.split(/[?#]/)[0]);if(!clean)continue;
    const absolute=path.resolve(root,path.dirname(file),clean);
    if(!absolute.startsWith(root+path.sep)){failures.push('Local link escapes package: '+file+' → '+target);continue;}
    localReferences.push({file,target});
    if(!(await fs.stat(absolute).catch(()=>null)))failures.push('Missing local link: '+file+' → '+target);
  }
}
for(const entry of inventory.files)if(/\.(html|md)$/.test(entry.file))await checkLinks(entry.file);

const status=(await gitOutput(['status','--porcelain','--untracked-files=all'])).split('\n').filter(Boolean);
if(status.some(line=>!line.slice(3).startsWith(prefix)))failures.push('Working tree includes changes outside the authorized folder');
const base='5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275';
const original=(await gitOutput(['ls-tree','-r','--name-only',base,'--',prefix])).trim();
if(original)failures.push('Package paths overlap files from the base commit');
const changed=(await gitOutput(['diff','--name-status',base,'--'])).split('\n').filter(Boolean);
for(const line of changed){
  const [kind,file]=line.split('\t');
  if(kind!=='A'||!file.startsWith(prefix))failures.push('Change is not a new package file: '+line);
}
const branch=(await gitOutput(['branch','--show-current'])).trim();
if(branch!=='codex/racing-v7-20261105')failures.push('Wrong delivery branch: '+branch);
console.log(JSON.stringify({pass:failures.length===0,inventoriedFiles:inventory.files.length,runtimeFiles:manifest.runtimeFiles.length,embeddedAssets:Object.keys(bundle.files).length,embeddedModules:Object.keys(bundle.modules).length,localReferences:localReferences.length,branch,failures},null,2));
if(failures.length)process.exitCode=1;
