// Original CC0-1.0. Inventory of the exact bytes being delivered.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const BASE='43b27dc235387e3cb737aee9558cdf9d5fd5a262';
const prefix='workout/island/design/racing-podium-v1/';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function walk(dir){const out=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isSymbolicLink())throw Error(`Symlink prohibited: ${p}`);if(item.isDirectory())out.push(...await walk(p));else out.push(p);}return out.sort();}
function glbInfo(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header');
  const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const primitives=(j.meshes??[]).flatMap(m=>m.primitives);
  if((j.buffers??[]).some(b=>b.uri)||(j.images??[]).some(i=>i.uri))throw Error('GLB has external dependencies');
  return {triangles:primitives.reduce((s,p)=>s+(j.accessors[p.indices??p.attributes.POSITION].count/3),0),
    vertices:primitives.reduce((s,p)=>s+j.accessors[p.attributes.POSITION].count,0),
    meshes:j.meshes?.length??0,materials:j.materials?.length??0,
    joints:j.skins?.map(s=>s.joints.length)??[],clips:j.animations?.map(a=>({id:a.name,duration:a.extras?.duration??Math.max(...a.samplers.map(s=>j.accessors[s.input].max?.[0]??0)),loop:!!a.extras?.loop}))??[],
    vertexColors:primitives.every(p=>p.attributes.COLOR_0!==undefined),
    extensionsRequired:j.extensionsRequired??[],textures:j.textures?.length??0};
}
const files=[];for(const p of await walk(root)){if(path.basename(p)==='manifest.json')continue;const b=await fs.readFile(p),relative=path.relative(root,p).split(path.sep).join('/');files.push({path:relative,bytes:b.length,sha256:sha(b),...(relative.endsWith('.glb')?{glb:glbInfo(b)}:{})});}
const qa=JSON.parse(await fs.readFile(path.join(root,'verification/motion-qa-provenance.json')));
const browser=JSON.parse(await fs.readFile(path.join(root,'verification/browser.json')));
const khronos=JSON.parse(await fs.readFile(path.join(root,'verification/khronos.json')));
const glbs=files.filter(f=>f.glb);
if(khronos.files.length!==glbs.length)throw Error('Khronos report omits delivered GLBs');
for(const f of glbs){const validated=khronos.files.find(v=>v.file===f.path);if(!validated||validated.sha256!==f.sha256||!validated.passed)throw Error(`Missing, stale or failed Khronos result: ${f.path}`);}
for(const actor of qa.assets??[]){const delivered=files.find(f=>f.path===actor.path);if(!delivered||delivered.sha256!==actor.sha256)throw Error(`Stale motion QA: ${actor.path}`);}
for(const input of [qa.inputAdapter,qa.loader,qa.runner]){const delivered=files.find(f=>f.path===input?.file);if(!delivered||delivered.sha256!==input.sha256)throw Error(`Stale motion QA adapter: ${input?.file}`);}
for(const input of browser.inputs??[]){const delivered=files.find(f=>f.path===input.path);if(!delivered||delivered.sha256!==input.sha256)throw Error(`Stale browser QA: ${input.path}`);}
const changed=execFileSync('git',['diff','--name-status',BASE],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const row of changed){const [status,p]=row.split('\t');if(status!=='A'||!p.startsWith(prefix))throw Error(`Out-of-scope change: ${row}`);}
const status=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repo,encoding:'utf8'}).trimEnd().split('\n').filter(Boolean);
for(const row of status)if(!row.slice(3).startsWith(prefix))throw Error(`Out-of-scope working-tree file: ${row}`);
const reusedSourcePaths=['characters/rig.json','characters2/source/mesh.py','characters2/source/body.py','characters2/source/head_hands.py','characters2/source/gear.py','tennis-v7/source/characters.py','motion2/soccer.json'];
const reusedSources=[];for(const p of reusedSourcePaths){const b=await fs.readFile(path.resolve(root,'..',p));reusedSources.push({path:'../'+p,sha256:sha(b),bytes:b.length,access:'read-only',license:'CC0-1.0'});}
const manifest={schemaVersion:1,id:'racing-podium-v1',kind:'game-asset-pack',branch:'codex/racing-podium-v1',baseCommit:BASE,
  scope:'New files only under '+prefix,entryPoint:'preview.html',previewViewport:{width:844,height:390},license:'CC0-1.0',licenses:'LICENSES.md',report:'REPORT.md',
  coordinates:{units:'metres',up:'+Y',forward:'+Z',anatomicalLeft:'+X',floorY:0},rig:'rig.json',motions:'motions.json',props:'props.json',
  actors:['male','female'].map(g=>({id:'driver-'+g,sex:g,file:`assets/driver-${g}.glb`,canonicalJointCount:18,teamColors:'COLOR_0 plus _TEAM_MASK; see rig.json and preview.mjs',clips:['exit_car','helmet_lift','wave','victory_dance','disappointment','handshake','podium_idle','trophy_lift']})),
  dependencies:{runtime:['three.module.js','GLTFLoader.js','SkeletonUtils.js','BufferGeometryUtils.js'].map(name=>({path:'../racing-v7/vendor/'+name,license:'MIT'})),reusedSources,networkRequests:'local repository files only',glbExternalDependencies:0},
  validation:{motionQA:{report:'verification/motion-qa.json',provenance:'verification/motion-qa-provenance.json',minimumExclusive:88,minimumObserved:qa.minimumObserved,passed:qa.passed},khronos:{report:'verification/khronos.json',passed:khronos.passed},browser:{report:'verification/browser.json',passed:browser.passed}},
  budget:{maximumBytes:4_000_000,includes:'Entire new folder: runtime assets, sources, documentation, screenshots and verification',totalBytes:0,remainingBytes:0},files};
for(let n=0;n<12;n++){const ownBytes=Buffer.byteLength(JSON.stringify(manifest,null,2)+'\n');const total=files.reduce((s,f)=>s+f.bytes,0)+ownBytes;if(total===manifest.budget.totalBytes)break;manifest.budget.totalBytes=total;manifest.budget.remainingBytes=4_000_000-total;}
if(manifest.budget.totalBytes>=4_000_000)throw Error(`Package too large: ${manifest.budget.totalBytes}`);
if(!(qa.passed&&qa.minimumObserved>88&&browser.passed&&khronos.passed))throw Error('Verification gates failed');
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:files.length+1,glbs:files.filter(f=>f.glb).length,budget:manifest.budget,scope:'new folder only'},null,2));
