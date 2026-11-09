/** Original CC0-1.0. Extract existing fictional CC0 actors without changing their bind skeletons.
 * Optional offline Draco decoder is a development dependency; output never requires it.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),repo=resolve(root,'../../../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pinned={main:'ae09529bc8fc9ff42f6aa76b8e79e7f760992f62','codex/soccer-motion-v11':'0c6b5877bd81d69bf389b1e3831e5c49b5feb770','codex/soccer-motion-v10':'57c536e1291803161e069eff97987295c6194466','codex/hoops-motion-v9':'6dd1675ded8ef2c9d361821aa1642ab75de90541','codex/tennis-motion-v1':'e1338bbc0998768fa654f551d50b71c298cb6542','codex/hoops-tall-v1':'cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa'};
const selections=[
 ['canonical-player-01','שחקן 1','codex/soccer-motion-v11','soccer-motion-v11/runtime/clips/celebrate_player.glb','canonical18','field'],
 ['canonical-player-02','שחקן 2','main','soccer-v7/characters/models/player-02-lod1.glb','canonical18','field'],
 ['canonical-player-03','שחקן 3','main','soccer-v7/characters/models/player-03-lod1.glb','canonical18','field'],
 ['canonical-keeper','שוער','codex/soccer-motion-v10','soccer-motion-v10/runtime/clips/goalkeeper_hand_roll.glb','canonical18','keeper'],
 ['canonical-hoops','שחקן כדורסל','codex/hoops-motion-v9','hoops-motion-v9/runtime/clips/basket_cut_left.glb','canonical18','hoops'],
 ['tennis','שחקן טניס ומחבט','codex/tennis-motion-v1','tennis-motion-v1/runtime/clips/backhand_flat_long.glb','canonical18','tennis'],
 ...['guard','wing','center'].map(id=>[`tall-${id}`,id,'codex/hoops-tall-v1',`hoops-tall-v1/runtime/${id}.glb`,id,'hoops']),
];
function parse(b){const n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n).toString()),bin:b.subarray(28+n)};}
function pack(j,b){const bytes=Buffer.from(JSON.stringify(j)),padding=(4-bytes.length%4)%4,jb=Buffer.concat([bytes,Buffer.alloc(padding,32)]),bp=(4-b.length%4)%4,bb=Buffer.concat([b,Buffer.alloc(bp)]),out=Buffer.alloc(28+jb.length+bb.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jb.length,12);out.writeUInt32LE(0x4e4f534a,16);jb.copy(out,20);out.writeUInt32LE(bb.length,20+jb.length);out.writeUInt32LE(0x004e4942,24+jb.length);bb.copy(out,28+jb.length);return out;}
function rigDescriptor(j){const parents=new Map();j.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));const joints=[...new Set((j.skins??[]).flatMap(s=>s.joints))];return joints.map(i=>{const n=j.nodes[i];return {name:n.name,parent:parents.has(i)?j.nodes[parents.get(i)].name:null,translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1]};}).sort((a,b)=>a.name.localeCompare(b.name));}
let io;
async function decode(b){if(!io){const deps=process.env.MOTION_MODEL_DEPS??'/tmp/motion-model-deps/node_modules';const core=await import(pathToFileURL(join(deps,'@gltf-transform/core/dist/index.js')).href),ext=await import(pathToFileURL(join(deps,'@gltf-transform/extensions/dist/index.js')).href),draco=await import(pathToFileURL(join(deps,'draco3dgltf/draco3dgltf.js')).href);io=new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.default.createDecoderModule()});}
 const doc=await io.readBinary(new Uint8Array(b));for(const a of doc.getRoot().listAnimations())a.dispose();for(const e of doc.getRoot().listExtensionsUsed())if(e.extensionName==='KHR_draco_mesh_compression')e.dispose();return Buffer.from(await io.writeBinary(doc));}
const models=[],provenance={schemaVersion:1,generator:'source-models.mjs',license:'CC0-1.0',models:[]};
await mkdir(join(root,'runtime/models'),{recursive:true});await mkdir(join(root,'data'),{recursive:true});
for(const [id,label,ref,shortPath,profile,role] of selections){const commit=pinned[ref],path=`workout/island/design/${shortPath}`,source=execFileSync('git',['show',`${commit}:${path}`],{cwd:repo,maxBuffer:20*1024*1024}),original=parse(source),compressed=original.json.extensionsRequired?.includes('KHR_draco_mesh_compression');let output=compressed?await decode(source):source;let {json,bin}=parse(output);delete json.animations;
 // A basketball is an independent animated prop, supplied by clip metadata in the viewer.
 // Keep its node index and remove its static mesh so it cannot appear as a frozen second ball.
 if(id==='canonical-hoops')for(const n of json.nodes)if(n.name==='Ball')delete n.mesh;
 json.asset={...json.asset,copyright:'CC0-1.0; existing fictional actor. Source and SHA-256 in data/models-provenance.json.',generator:'motion-fix-v12 source-models.mjs; native geometry, unchanged bind skeleton'};
 output=pack(json,bin);const sourceRig=rigDescriptor(original.json),outputRig=rigDescriptor(json),sourceNames=sourceRig.map(r=>r.name);if(sourceNames.join()!==outputRig.map(r=>r.name).join())throw new Error(`Rig name changed: ${id}`);let maximumTransformError=0;for(let i=0;i<sourceRig.length;i++)for(const key of ['translation','rotation','scale'])sourceRig[i][key].forEach((v,k)=>maximumTransformError=Math.max(maximumTransformError,Math.abs(v-outputRig[i][key][k])));if(maximumTransformError>1e-7)throw new Error(`Bind skeleton changed: ${id}: ${maximumTransformError}`);
 const target=`runtime/models/${id}.glb`,rigFingerprint=sha(JSON.stringify(outputRig)),record={id,label,path:target,profile,role,rigFingerprint,rig:outputRig,bytes:output.length,sha256:sha(output),source:{commit,ref,path,sha256:sha(source),license:'CC0-1.0'},processing:compressed?'Offline Draco decode; animation removed; bind skeleton unchanged.':'Animation removed; native source geometry and bind skeleton preserved.',maximumTransformError};await writeFile(join(root,target),output);models.push(record);provenance.models.push(record);console.log(`${id}: ${output.length} bytes; bind error ${maximumTransformError}; ${compressed?'decoded offline':'native'}`);}
await writeFile(join(root,'data/models.json'),JSON.stringify({schemaVersion:1,models},null,2)+'\n');await writeFile(join(root,'data/models-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
