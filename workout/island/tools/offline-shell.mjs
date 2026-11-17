// Builds the "shell" part of offline-manifest.json and, since offline v25, the "files"
// map (path -> [sha256 prefix, bytes]) that lets a phone download only what changed
// between releases and verify every downloaded file. Also: every code, style and data file the
// island page can reach (static imports, dynamic import() literals, stylesheet links,
// new URL('literal', ...) references), so the app opens without a network after one
// download. Paths are bare (no ?v=): the cache ignores the query, so the central
// version bump never makes this list stale. Run `node tools/offline-shell.mjs` after
// adding a module; tests/island-offline.test.mjs fails when the list is out of date.
import {readFile,writeFile,access,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CODE=/\.(?:mjs|js|css|html|webmanifest)$/;
const SKIP=/^(?:tests|tools|verification|notes)\//;
const LITERAL=/(['"`])((?:\.{1,2}\/|[\w-]+\/)[^'"`\s${}]*?\.(?:mjs|js|css|json|svg|html|webmanifest))(?:\?[^'"`]*)?\1/g;
const CSS_URL=/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const managed=p=>/(?:^|\/)(?:design|assets)\/.+\.(?:glb|webp|jpg|png|svg|ogg|mp3|json|wasm)$/.test(p)||/^vendor\/draco\//.test(p);
const wanted=p=>!SKIP.test(p)&&!managed(p)&&(CODE.test(p)||/^data\/[^/]+\.json$/.test(p));
export async function buildShell(base=root){
  const seen=new Set(),queue=['index.html','manifest.webmanifest'];
  const rel=file=>path.relative(base,file).split(path.sep).join('/');
  while(queue.length){
    const current=queue.shift();if(seen.has(current))continue;
    const file=path.join(base,current);if(!await exists(file))continue;
    seen.add(current);if(!/\.(?:mjs|js|css|html)$|^data\/extensions\.json$/.test(current))continue;
    const text=await readFile(file,'utf8'),found=[];
    for(const m of text.matchAll(LITERAL))found.push(m[2]);
    if(current.endsWith('.html'))for(const m of text.matchAll(/(?:href|src)="([^"#?]+)/g))found.push(m[1]);
    if(current.endsWith('.css'))for(const m of text.matchAll(CSS_URL))found.push(m[1]);
    for(const literal of found){
      if(/^[a-z]+:/i.test(literal))continue;
      for(const from of [path.dirname(file),base]){
        const target=rel(path.resolve(from,literal));
        if(target.startsWith('..'))continue;
        if(wanted(target)&&await exists(path.join(base,target)))queue.push(target);
      }
    }
  }
  // engine/load-data.mjs reads data/*.json by name from a list, not by path literal, so the
  // scan cannot see them: every data file is part of the shell.
  for(const name of await readdir(path.join(base,'data')).catch(()=>[]))if(/\.json$/.test(name))seen.add('data/'+name);
  for(const name of await readdir(path.join(base,'episodes')).catch(()=>[]))if(/\.json$/.test(name))seen.add('episodes/'+name);
  return ['',...[...seen].sort()];
}
/** Hex prefix (16 chars = 64 bits) of the SHA-256 of a file: enough to tell "changed"
 * from "same" between two releases and to catch a truncated download; short enough for
 * 1,500 files to stay a small JSON. The page verifies with crypto.subtle (same algorithm). */
export const HASH_CHARS=16;
export async function hashFile(file){return createHash('sha256').update(await readFile(file)).digest('hex').slice(0,HASH_CHARS);}
/** Every path the manifest names (core, shell, games) -> [hash, bytes]. '' is the island root (index.html). */
export async function buildFiles(manifest,base=root){
  const paths=new Set([...(manifest.core||[]),...(manifest.shell||[]),...Object.values(manifest.games||{}).flat()]);
  paths.delete('offline-manifest.json');/* cannot carry its own hash */
  const files={};
  for(const p of [...paths].sort()){const file=path.join(base,p===''?'index.html':p);files[p]=[await hashFile(file),(await stat(file)).size];}
  return files;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=path.join(root,'offline-manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
  manifest.schema=2;manifest.shell=await buildShell();manifest.files=await buildFiles(manifest);
  const ordered={schema:manifest.schema,note:manifest.note,core:manifest.core,shell:manifest.shell,games:manifest.games,files:manifest.files};
  await writeFile(file,JSON.stringify(ordered,null,1)+'\n');
  console.log('shell files:',manifest.shell.length,'hashed files:',Object.keys(manifest.files).length);
}
