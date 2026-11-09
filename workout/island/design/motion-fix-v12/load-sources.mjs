/** Original v12 loader; CC0-1.0. QA source/metric mathematics are pinned in qa/provenance.json. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadLibraries,SOURCES} from './qa/sources.mjs';
const execute=promisify(execFile);
export const base=path.dirname(fileURLToPath(import.meta.url));
export const repoRoot=path.resolve(base,'../../../..');
export const sourceCache='/tmp/motion-fix-cache';
export async function loadAll({fps=60,only}={}){
  const libraries=await loadLibraries({repoRoot,cacheRoot:sourceCache,fps,only});
  if(!only?.length||only.includes('tennis-v1')){
    const source={id:'tennis-v1',sport:'tennis',version:'v1',ref:'codex/tennis-motion-v1',commit:'e1338bbc0998768fa654f551d50b71c298cb6542',path:'workout/island/design/tennis-motion-v1',catalog:'runtime/catalog.json',kind:'tennis'};
    const records=[];
    async function bytes(relative){
      const target=path.join(sourceCache,source.commit,source.path,relative);let buffer;
      try{buffer=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;buffer=(await execute('git',['show',`${source.commit}:${source.path}/${relative}`],{cwd:repoRoot,encoding:'buffer',maxBuffer:80*1024*1024})).stdout;await mkdir(path.dirname(target),{recursive:true});await writeFile(target,buffer);}
      const gitBlob=(await execute('git',['rev-parse',`${source.commit}:${source.path}/${relative}`],{cwd:repoRoot})).stdout.trim();
      const actual=createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
      if(actual!==gitBlob)throw new Error(`Tennis cache integrity mismatch: ${relative}`);
      records.push({path:`${source.path}/${relative}`,commit:source.commit,gitBlob,sha256:createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length});return buffer;
    }
    const {loadTennis}=await import('./qa/tennis.mjs');
    const library=await loadTennis({source,bytes,json:async p=>JSON.parse((await bytes(p)).toString()),fps});
    library.sources=records;for(const c of library.clips)c.sourceAsset={commit:source.commit,path:`${source.path}/runtime/${c.metadata.file}`,cachePath:path.join(sourceCache,source.commit,source.path,'runtime',c.metadata.file)};
    libraries.push(library);
  }
  // v11 delivers action expansions without idle tracks; compare to the identical source-rig idle,
  // never the action itself. Existing seven-library references retain original QA behavior.
  const soccer10=libraries.find(l=>l.id==='soccer-v10'),soccer9=libraries.find(l=>l.id==='soccer-v9');
  const soccer11=libraries.find(l=>l.id==='soccer-v11');
  if(soccer11)soccer11.idleClips=[...(soccer10?.clips.filter(c=>/idle/.test(c.id))??[]),...(soccer9?.clips.filter(c=>/goalkeeper_ready/.test(c.id))??[])];
  const hoops10=libraries.find(l=>l.id==='hoops-v10'),hoops11=libraries.find(l=>l.id==='hoops-v11');
  if(hoops11)hoops11.idleClips=hoops10?.clips.filter(c=>/idle|ready|stance/.test(c.id))??[];
  return libraries;
}
export {SOURCES};
