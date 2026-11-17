import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
const root=process.env.ASSET_ADAPTERS_PAYLOAD_ROOT;

for(const pack of catalog.packs) test(`${pack.id}: real copied payload passes the default loader`,{skip:!root},async()=>{
 const {create,metadata}=await import(`../src/${pack.id}.mjs`);
 let reads=0;
 const adapter=create({baseURL:`https://island.test/assets/${pack.id}/`,fetch:async url=>{
  const target=resolve(root,'.'+decodeURIComponent(new URL(url).pathname));
  assert.ok(target.startsWith(resolve(root)+sep));
  const bytes=await readFile(target);reads++;
  return new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream'}});
 }});
 assert.equal(await adapter.load(),pack.available,`${pack.id} body/format validity`);
 assert.equal(adapter.ready(),pack.available);
 assert.equal(reads,pack.available?metadata.assets.length:0);
 if(pack.available)for(const asset of metadata.assets){
  const value=adapter.get(asset.name);
  assert.ok(value!==null,asset.name);
  if(asset.type==='binary'||asset.type==='glb')assert.equal(value.byteLength,asset.bytes,asset.name);
 }
 adapter.dispose();
 assert.equal(adapter.ready(),false);
});
