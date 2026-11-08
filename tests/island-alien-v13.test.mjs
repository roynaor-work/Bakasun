import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {alienV13Enabled,fitScale,V13_SHIP_PATH,V13_AUDIO} from '../workout/island/minigames/alien-v13.mjs';
const root=new URL('../workout/island/',import.meta.url),config=JSON.parse(await readFile(new URL('data/config.json',root))).minigames.alienDefense;

test('v13 flag: on by default, ?alienV13=0 and the global switch restore v12',()=>{
 assert.equal(alienV13Enabled('',undefined),true);assert.equal(alienV13Enabled('?alienV13=0',undefined),false);assert.equal(alienV13Enabled('',false),false);
});
test('v13 ship GLB: valid binary glTF with the Vulcan nodes, no Draco, no external resources, small',async()=>{
 const buf=await readFile(new URL(V13_SHIP_PATH,root));
 assert.equal(buf.readUInt32LE(0),0x46546c67);assert.ok(buf.length<300000);
 const jsonLen=buf.readUInt32LE(12),json=JSON.parse(buf.slice(20,20+jsonLen).toString());
 const names=json.nodes.map(n=>n.name);for(const n of ['Barrel_L','Barrel_R','Muzzle_L','Muzzle_R'])assert.ok(names.includes(n),n);
 assert.ok(!(json.extensionsUsed||[]).includes('KHR_draco_mesh_compression'));assert.ok(!(json.buffers||[]).some(b=>b.uri&&!b.uri.startsWith('data:')));
 assert.deepEqual(fitScale({x:7.4,z:5.55}),1/7.4);
});
test('v13 Vulcan audio: four OGG files present, CC0 licence files shipped, total under 100 KB',async()=>{
 let total=0;for(const url of Object.values(V13_AUDIO)){const path=new URL(url).pathname,s=await stat(path);total+=s.size;const head=await readFile(path);assert.equal(head.slice(0,4).toString(),'OggS');}
 assert.ok(total<100000,`total ${total}`);
 for(const f of ['assets/alien-v13/LICENSES.md','assets/audio/alien-v13/LICENSES.md'])assert.match(await readFile(new URL(f,root),'utf8'),/CC0/);
});
test('v13 config and published-pack exclusion',async()=>{
 assert.ok(config.v13.cannonOffset>config.v12.cannonOffset&&config.v13.muzzleForward>0&&config.v13.shipScale>=1);
 const pages=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');assert.match(pages,/ship-chase-models-v1 sirens-vulcan-audio-v1/);
});
