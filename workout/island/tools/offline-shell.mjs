// Builds the "shell" part of offline-manifest.json: every code, style and data file the
// island page can reach (static imports, dynamic import() literals, stylesheet links,
// new URL('literal', ...) references), so the app opens without a network after one
// download. Paths are bare (no ?v=): the cache ignores the query, so the central
// version bump never makes this list stale. Run `node tools/offline-shell.mjs` after
// adding a module; tests/island-offline.test.mjs fails when the list is out of date.
import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CODE=/\.(?:mjs|js|css|html|webmanifest)$/;
const SKIP=/^(?:tests|tools|verification|notes)\//;
const LITERAL=/(['"`])((?:\.{1,2}\/|[\w-]+\/)[^'"`\s${}]*?\.(?:mjs|js|css|json|svg|html|webmanifest))(?:\?[^'"`]*)?\1/g;
const CSS_URL=/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const managed=p=>/(?:^|\/)(?:design|assets)\/.+\.(?:glb|webp|jpg|png|svg|ogg|json|wasm)$/.test(p)||/^vendor\/draco\//.test(p);
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
  return ['',...[...seen].sort()];
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=path.join(root,'offline-manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
  manifest.shell=await buildShell();await writeFile(file,JSON.stringify(manifest,null,1)+'\n');
  console.log('shell files:',manifest.shell.length);
}
