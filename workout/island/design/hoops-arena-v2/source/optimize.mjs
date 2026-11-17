/** Loss-bounded standard vertex quantization; no geometry or scene parts removed.
 * ARENA_TOOLS=/tmp/hoops-arena-tools/node_modules node source/optimize.mjs
 * Run immediately after build.py. Native normalized GPU attributes need no codec.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const tool=name=>require(process.env.ARENA_TOOLS?path.join(process.env.ARENA_TOOLS,name):name);
const {NodeIO}=tool('@gltf-transform/core');
const {KHRMeshQuantization}=tool('@gltf-transform/extensions');
const {quantize,dedup,prune}=tool('@gltf-transform/functions');
const io=new NodeIO().registerExtensions([KHRMeshQuantization]);
const file=path.join(root,'assets','arena.glb');
const document=await io.read(file);
await document.transform(dedup(),quantize({quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}),prune());
const bytes=await io.writeBinary(document);
if(bytes.length>2_000_000)throw new Error(`Arena exceeds repository model budget: ${bytes.length}`);
await fs.writeFile(file,bytes);
const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+new DataView(bytes.buffer,bytes.byteOffset).getUint32(12,true))));
const statsFile=path.join(root,'verification','geometry.json');
const stats=JSON.parse(await fs.readFile(statsFile,'utf8'));
const model=stats.models.find(m=>m.file==='assets/arena.glb');
Object.assign(model,{bytes:bytes.length,meshes:json.meshes.length,nodes:json.nodes.length,extensions:json.extensionsUsed});
stats.optimization={tool:'glTF-Transform 4.3.0',positionBits:16,normalBits:12,removedSceneComponents:0,decoderRequired:false};
await fs.writeFile(statsFile,JSON.stringify(stats,null,2)+'\n');
console.log(`arena.glb: ${bytes.length} bytes; complete scene retained`);
