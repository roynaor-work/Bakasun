// Copies the tennis v7 files the game really loads from design/tennis-v7 into assets/tennis-v7 (the game never
// reads design/ for v7): the twelve GLBs minus the four characters (not connected, see
// verification/gpt-v7-ski-tennis-racing/tennis/TENNIS.md) and a compact copy of crowd-layout.json.
// design/ keeps the package whole (standalone.html, offline/, iterations, source); assets/ gets only runtime files.
// Usage: node workout/island/tools/tennis-v7-pack.mjs
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const from=path.join(root,'design/tennis-v7'),to=path.join(root,'assets/tennis-v7');
export const RUNTIME_GLBS=['court-hard','court-clay','court-grass','venue','net','ball','crowd-prototypes','crew'];
/** [x, y, z, yaw, row, section index] per spectator; the long keys of the original file cost 90 KB for 480 rows. */
export function compactLayout(layout){
 const sections=[...new Set(layout.instances.map(i=>i.section))];
 const r=v=>Math.round(v*1000)/1000;
 return {seed:layout.seed,count:layout.count,sections,instances:layout.instances.map(i=>[r(i.position[0]),r(i.position[1]),r(i.position[2]),r(i.yaw),i.row,sections.indexOf(i.section)])};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 await mkdir(to,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(from,'manifest.json'),'utf8')),out=[];
 for(const id of RUNTIME_GLBS){
  const src=path.join(from,'models',id+'.glb'),dst=path.join(to,id+'.glb');
  await copyFile(src,dst);
  const bytes=(await stat(dst)).size,sha=createHash('sha256').update(await readFile(dst)).digest('hex'),listed=manifest.assets.find(a=>a.file==='models/'+id+'.glb');
  if(listed&&(listed.bytes!==bytes||listed.sha256!==sha))throw Error(id+': does not match design/tennis-v7/manifest.json');
  out.push({file:id+'.glb',bytes,sha256:sha});
 }
 const layout=compactLayout(JSON.parse(await readFile(path.join(from,'crowd-layout.json'),'utf8')));
 await writeFile(path.join(to,'crowd.json'),JSON.stringify(layout)+'\n');
 out.push({file:'crowd.json',bytes:(await stat(path.join(to,'crowd.json'))).size});
 console.log(out.map(o=>o.file+' '+o.bytes).join('\n'),'\ntotal',out.reduce((n,o)=>n+o.bytes,0));
}
