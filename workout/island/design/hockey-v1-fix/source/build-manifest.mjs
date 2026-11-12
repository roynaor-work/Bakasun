// SPDX-License-Identifier: CC0-1.0
// מקור: מיפוי מקורות וחתימות מקורי של חבילת התיקון.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const folder=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseCommit='dc99f03416ca279b549b7f2db927ef7a6ac401e0';
const sourceUrl='https://github.com/roynaor-work/Bakasun/tree/'+baseCommit+'/workout/island/design/hockey-v1';
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files.sort();}
const files=[];
for(const target of await walk(folder)){
 const name=path.relative(folder,target);if(name==='manifest.json')continue;
 const bytes=await readFile(target);
 const source=name.startsWith('sheets/')||name==='preview/gallery.png'?'source/render-sheets.mjs; GLB מקוריים ו-clips.json לפני/אחרי':name.includes('codex-qa/')?'run.mjs המקורי, PR 371, דרך source/qa-loader.mjs ו-source/qa-adapter.mjs':name.endsWith('clips.json')?'source/build-fix.mjs על תנועות CC0 של PR 414':name.startsWith('evidence/')?'תוצר הפקודות המתועדות ב-REPORT-fix.md':'יצירה מקורית של Codex או עיבוד מקור CC0 של PR 414; LICENSES.md';
 files.push({path:name,bytes:bytes.length,sha256:hash(bytes),license:'CC0-1.0',source});
}
const dependencyPaths=['clips.json','models/skater.glb','models/goalie.glb','models/stick.glb','source/qa-adapter-fetch.mjs'];
const dependencies=[];
for(const name of dependencyPaths){const bytes=await readFile(path.resolve(folder,'../hockey-v1',name));dependencies.push({path:'../hockey-v1/'+name,bytes:bytes.length,sha256:hash(bytes),license:'CC0-1.0',url:sourceUrl+'/'+name});}
const core=path.resolve(folder,'../../minigames/athletes-core.mjs');
dependencies.push({path:'../../minigames/athletes-core.mjs',sha256:hash(await readFile(core)),source:'חוזה השלד והתקן המקוריים בענף הבסיס, ללא שינוי'});
const result={schemaVersion:1,license:'CC0-1.0',source:sourceUrl,baseCommit,requestedBaseRef:'codex/hockey-v1',actualBaseRef:'codex/island-hockey-v1',branch:'codex/hockey-fix-v1',status:'טיוטה: 1 מ-15 התיקונים מוכן, 14 לא מוכנים לאחר 3 ניסיונות',files,dependencies};
const bytes=JSON.stringify(result,null,2)+'\n';await writeFile(path.join(folder,'manifest.json'),bytes);
console.log(JSON.stringify({files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0),manifestSha256:hash(bytes)}));
