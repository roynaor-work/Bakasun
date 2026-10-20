import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const library=new URL('../workout/island-library/',import.meta.url);

test('island library preserves all 27 original fa3b133 models by their documented size and SHA256',async()=>{
 const readme=await readFile(new URL('README.md',library),'utf8');
 assert.match(readme,/fa3b133880234a0d88d0226b61db011a0dfdb30b/);
 const rows=[...readme.matchAll(/^\| `([^`/]+\.glb)` \| (\d+) \| `([a-f0-9]{64})` \|$/gm)];
 assert.equal(rows.length,27,'all source models must have a checksum row');
 const names=rows.map(([,name])=>name);
 assert.equal(new Set(names).size,27,'checksum rows must be unique');
 assert.deepEqual((await readdir(new URL('models/',library))).sort(),names.sort(),'every library file must be audited');
 for(const [,name,size,sha256]of rows){
  const bytes=await readFile(new URL('models/'+name,library));
  assert.equal(bytes.length,Number(size),name+' size differs from fa3b133');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,name+' bytes differ from fa3b133');
 }
});
