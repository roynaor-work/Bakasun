import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const git = (root,...args) => execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024}).toString().trim();

/** Copy the tracked workout text/code dependencies, including dynamically loaded
 * design contracts, vendor code and boar HTML. No game imports the working tree.
 * Binary art/audio isn't needed by the headless models (boars generate assets).
 * Never runs npm install or writes into the original game directories. */
export async function createSnapshot(repoRoot) {
  repoRoot=resolve(repoRoot);
  const prefix='workout/island/design/balance-sim-v1/';
  const tracked=git(repoRoot,'ls-files','-z').split('\0').filter(Boolean);
  const changed=git(repoRoot,'diff','--name-only','HEAD').split('\n').filter(p=>p&&!p.startsWith(prefix));
  if(changed.length)throw new Error(`Source has existing-file changes: ${changed.join(', ')}`);
  const files=tracked.filter(p=>(p==='package.json'||p.startsWith('workout/'))&&/\.(?:mjs|js|json|html|css)$/.test(p)&&!p.startsWith(prefix));
  const sourceRoot=await mkdtemp(join(tmpdir(),'bakasun-balance-v1-'));
  const hashes={};
  for(const path of files){
    const bytes=await readFile(join(repoRoot,path));hashes[path]=sha256(bytes);
    await mkdir(dirname(join(sourceRoot,path)),{recursive:true});
    await writeFile(join(sourceRoot,path),bytes);
  }
  const manifest={baseCommit:git(repoRoot,'rev-parse','HEAD'),node:process.version,fileCount:files.length,hashes,sourceDigest:sha256(JSON.stringify(hashes))};
  return {sourceRoot,manifest,async verify(){
    for(const [path,hash] of Object.entries(hashes))if(sha256(await readFile(join(repoRoot,path)))!==hash)throw new Error(`Original source changed: ${path}`);
    if(git(repoRoot,'diff','--name-only','HEAD').split('\n').some(p=>p&&!p.startsWith(prefix)))throw new Error('Existing files changed during simulation');
    return true;
  },async cleanup(){await rm(sourceRoot,{recursive:true,force:true});}};
}

/** Freeze the new controller tools as well: a concurrent editor cannot change an
 * adapter halfway through a run. These hashes are separate from game source. */
export async function copyTools(repoRoot,sourceRoot) {
  const relative='workout/island/design/balance-sim-v1/tools',hashes={};
  async function walk(part=''){
    for(const entry of await readdir(join(repoRoot,relative,part),{withFileTypes:true})){
      const name=join(part,entry.name);
      if(entry.isDirectory())await walk(name);
      else if(entry.name.endsWith('.mjs')){
        const bytes=await readFile(join(repoRoot,relative,name));hashes[name]=sha256(bytes);
        await mkdir(dirname(join(sourceRoot,relative,name)),{recursive:true});await writeFile(join(sourceRoot,relative,name),bytes);
      }
    }
  }
  await walk();return hashes;
}
