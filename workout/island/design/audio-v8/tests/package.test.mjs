import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,stat,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,relative} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(directory) {
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(path));else result.push({path,bytes:(await stat(path)).size});
  }
  return result;
}
test('package stays below 60 MB with a single self-contained runtime module and light listening page',async t=>{
  const all=await files(root),bytes=all.reduce((sum,file)=>sum+file.bytes,0);
  assert.ok(bytes<=60000000,`${bytes} bytes exceeds 60 MB`);
  for(const file of all)assert.ok(/\.(?:mjs|md|css|html|webp|svg)$/.test(file.path),`unexpected file: ${relative(root,file.path)}`);
  const runtime=await readdir(join(root,'runtime'));assert.deepEqual(runtime,['sports-audio.mjs']);
  const source=await readFile(join(root,'runtime/sports-audio.mjs'),'utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|eval|setInterval)\s*\(/);
  assert.doesNotMatch(source,/^\s*import\s/m);
  assert.ok((await stat(join(root,'index.html'))).size<16000);
  assert.ok((await stat(join(root,'INTEGRATION.md'))).size>1000);
  const iterations=await readdir(join(root,'iterations'));assert.deepEqual(iterations.sort(),['05','06']);
  assert.equal(await readFile(join(root,'iterations/06/sports-audio.mjs'),'utf8'),source,'latest iteration must match the production module');
  t.diagnostic(`package=${bytes} bytes; runtime=${Buffer.byteLength(source)} bytes; files=${all.length}`);
});
