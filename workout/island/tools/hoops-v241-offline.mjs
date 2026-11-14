// Adds the v24.1 basketball runtime files (assets/hoops-v241/**) to offline-manifest.json games.hoops (after the existing entries, which keep
// their order) and drops entries that no longer exist under assets/hoops-v241. Run after changing what the v24.1 modules load:
// `node workout/island/tools/hoops-v241-offline.mjs`.
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIR='assets/hoops-v241';
const RUNTIME=/\.(?:glb|ogg|mp3|json|png|webp)$/;
// Kept online only, so the island's offline download stays under its 80 MB (tests/island-offline.test.mjs): the crowd's level 0 (only
// `?hoopsCrowd3d=full`, a comparison mode) and the v22 basketball bodies, which the v2 bodies replace (they stay the fallback, fetched if needed).
const ONLINE_ONLY=/^assets\/hoops-v241\/crowd\/runtime\/lod0\//;
const REPLACED=['assets/athlete-body-v22/models/guard.glb','assets/athlete-body-v22/models/wing.glb','assets/athlete-body-v22/models/center.glb'];
async function walk(rel){
  const out=[];
  for(const name of await readdir(path.join(root,rel)).catch(()=>[])){
    const child=rel+'/'+name;
    if((await stat(path.join(root,child))).isDirectory())out.push(...await walk(child));else if(RUNTIME.test(name))out.push(child);
  }
  return out;
}
const file=path.join(root,'offline-manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
const files=(await walk(DIR)).filter(p=>!ONLINE_ONLY.test(p)),keep=manifest.games.hoops.filter(p=>!p.startsWith(DIR+'/')&&!REPLACED.includes(p));
manifest.games.hoops=[...new Set([...keep,...files.sort()])];
await writeFile(file,JSON.stringify(manifest,null,1)+'\n');
console.log('hoops offline files:',manifest.games.hoops.length,'of which v24.1:',files.length);
