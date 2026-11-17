import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,ISLAND,TARGETS,walk,slash,readOffline,saveJSON,save,mb} from './common.mjs';

export async function measure() {
  const offline=await readOffline(), selected=new Set(offline.paths), assets=[];
  for (const directory of ['assets','design']) for (const file of await walk(path.join(ISLAND,directory))) {
    const extension=path.extname(file).toLowerCase();
    if (!TARGETS.has(extension)) continue;
    const source=slash(path.relative(ISLAND,file));
    assets.push({source,extension,bytes:(await stat(file)).size,offline:selected.has(source),games:Object.entries(offline.manifest.games).filter(([,p])=>offline.close(p).includes(source)).map(([game])=>game)});
  }
  assets.sort((a,b)=>b.bytes-a.bytes||a.source.localeCompare(b.source,'en'));
  const sizes=new Map();
  for (const p of offline.paths) sizes.set(p,(await stat(path.join(ISLAND,p))).size);
  const total=paths=>paths.reduce((sum,p)=>sum+sizes.get(p),0);
  const groups=Object.fromEntries(Object.entries(offline.groups).map(([name,paths])=>[name,{files:new Set(paths).size,directBytes:total([...new Set(paths)]),closedBytes:total(offline.close(paths))}]));
  return {schema:1,offlineManifestSHA256:offline.sha256,units:'decimal MB = 1,000,000 bytes',scannedRoots:['assets','design'],excluded:['design/asset-compression-v1','node_modules','.git','.work'],totalScannedBytes:assets.reduce((s,a)=>s+a.bytes,0),groups,uniqueOfflineBytes:total(offline.direct),dependencyCompleteBytes:total(offline.paths),extraDependencies:offline.paths.filter(p=>!offline.direct.includes(p)),assets};
}
export async function writeMeasurement() {
  const inventory=await measure();
  await saveJSON(path.join(ROOT,'inventory.json'),inventory);
  await save(path.join(ROOT,'inventory.md'),`# סקר נכסים\n\nכל הגדלים במגה־בתים עשרוניים. הסקר אינו כולל את תיקיית התוצר.\n\n| קבוצה | במניפסט MB | עם תלויות GLB MB |\n|---|---:|---:|\n${Object.entries(inventory.groups).map(([k,v])=>`| ${k} | ${mb(v.directBytes)} | ${mb(v.closedBytes)} |`).join('\n')}\n\n## 60 הנכסים הגדולים\n\n| נכס | MB | בהורדת האפליקציה |\n|---|---:|---|\n${inventory.assets.slice(0,60).map(a=>`| ${a.source} | ${mb(a.bytes)} | ${a.offline?'כן':'לא'} |`).join('\n')}\n`);
  return inventory;
}
if (import.meta.url===pathToFileURL(process.argv[1]||'').href) {
  const result=await writeMeasurement();
  console.log(JSON.stringify({scanned:result.assets.length,offlineMB:mb(result.uniqueOfflineBytes),completeMB:mb(result.dependencyCompleteBytes),extraDependencies:result.extraDependencies.length}));
}
