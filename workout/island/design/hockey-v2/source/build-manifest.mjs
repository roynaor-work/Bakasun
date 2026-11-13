// SPDX-License-Identifier: CC0-1.0
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
function files(url,prefix=''){
 return readdirSync(url,{withFileTypes:true}).flatMap(e=>e.name==='manifest.json'?[]:e.isDirectory()?files(new URL(e.name+'/',url),prefix+e.name+'/'):[prefix+e.name]);
}
const entries=files(root).sort().map(path=>{const b=readFileSync(new URL(path,root));return{path,bytes:b.length,sha256:sha(b),license:'CC0-1.0'};});
const dependencies=['../hockey-v1/clips.json','../hockey-v1/models/skater.glb','../hockey-v1/models/goalie.glb','../hockey-v1/models/stick.glb','../hockey-v1-fix/clips.json',
 '../../minigames/athletes-core.mjs',...readdirSync(new URL('../motion-qa-v1/',root),{withFileTypes:true}).filter(e=>e.isFile()).map(e=>'../motion-qa-v1/'+e.name)].map(path=>{const b=readFileSync(new URL(path,root));return{path,bytes:b.length,sha256:sha(b)};});
writeFileSync(new URL('manifest.json',root),JSON.stringify({schemaVersion:1,license:'CC0-1.0',baseCommit:'d45575a8ac7f3f054aa9ddf80ad4593d7b5e6cee',branch:'codex/hockey-fix-v2',files:entries,dependencies},null,2)+'\n');
console.log(JSON.stringify({files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0)}));
