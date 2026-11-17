// Independently inspect the bytes in coach.glb, not build-summary.json.
// Usage: node source/validate.mjs [path-to-gltf-validator]
import {readFile, writeFile, readdir, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await readFile(join(root,'coach.glb'));
const errors=[], checks={};
function check(name,ok,detail){checks[name]={pass:!!ok,...(detail===undefined?{}:{detail})};if(!ok)errors.push(name);}
const eq=(a,b,e=1e-5)=>a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<=e);
if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB header');
const jlen=b.readUInt32LE(12);if(b.toString('ascii',16,20)!=='JSON')throw Error('Missing JSON chunk');
const gltf=JSON.parse(b.subarray(20,20+jlen).toString());const binOffset=20+jlen;
if(b.toString('ascii',binOffset+4,binOffset+8)!=='BIN\0'||binOffset+8+b.readUInt32LE(binOffset)!==b.length)throw Error('Invalid BIN chunk');
const bin=b.subarray(binOffset+8);
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const types={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function accessor(i){const a=gltf.accessors[i],v=gltf.bufferViews[a.bufferView];if(a.sparse||!v||v.buffer!==0)throw Error(`Unsupported accessor ${i}`);const [size,method]=types[a.componentType],n=comps[a.type],stride=v.byteStride??size*n,start=(v.byteOffset??0)+(a.byteOffset??0);if(start<0||start+(a.count-1)*stride+size*n>bin.length||start+(a.count-1)*stride+size*n>(v.byteOffset??0)+v.byteLength)throw Error(`Accessor ${i} out of bounds`);return Array.from({length:a.count},(_,k)=>Array.from({length:n},(_,c)=>bin[method](start+k*stride+c*size)));}
const names=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const parents=[-1,0,1,2,3,4,3,6,7,3,9,10,1,12,13,1,15,16];
const rest=[[0,0,0],[0,.86,0],[0,.2,0],[0,.18,0],[0,.1,0],[0,.13,0],[.16,.06,0],[0,-.27,0],[0,-.24,0],[-.16,.06,0],[0,-.27,0],[0,-.24,0],[.1,0,0],[0,-.41,0],[0,-.37,0],[-.1,0,0],[0,-.41,0],[0,-.37,0]];
const expressions=['happy','surprised','encouraging','thoughtful','proud','gently_disappointed','laughing','wink'];
const controls=['grip_left','grip_right','point_left','point_right'];
const targetsExpected=[...expressions,...controls];
const clips=['stand','wave','point_right','point_left','point_up','point_down','fist_pump','clap','joy_jump','shrug','nod','shake_head','air_hug','go_there','well_done','try_again','ready','rest_idle'];
check('embeddedOnly',gltf.buffers?.length===1&&!gltf.buffers[0].uri&&!(gltf.images||[]).some(x=>x.uri)&&!(gltf.extensionsUsed||[]).length&&!(gltf.extensionsRequired||[]).length);
check('sceneAndSkin',gltf.scene===0&&gltf.scenes?.length===1&&eq(gltf.scenes[0].nodes,[0,18],0)&&gltf.nodes?.length===19&&gltf.nodes[18].mesh===0&&gltf.nodes[18].skin===0&&gltf.meshes?.length===1&&gltf.skins?.length===1&&eq(gltf.skins[0].joints,Array.from({length:18},(_,i)=>i),0)&&gltf.skins[0].skeleton===0);
const actualParents=names.map((_,i)=>{const all=gltf.nodes.map((n,k)=>(n.children||[]).includes(i)?k:-1).filter(x=>x>=0);return all.length===0?-1:all.length===1?all[0]:-2;});
check('canonicalRestSkeleton',names.every((n,i)=>gltf.nodes[i]?.name===n&&actualParents[i]===parents[i]&&eq(gltf.nodes[i].translation??[0,0,0],rest[i])&&eq(gltf.nodes[i].rotation??[0,0,0,1],[0,0,0,1])&&eq(gltf.nodes[i].scale??[1,1,1],[1,1,1])&&!gltf.nodes[i].matrix));
const globals=rest.map((v,i)=>v.map((x,k)=>x+(parents[i]<0?0:globalsPlaceholder(i,k))));
function globalsPlaceholder(i,k){let sum=0,p=parents[i];while(p>=0){sum+=rest[p][k];p=parents[p];}return sum;}
const ibm=accessor(gltf.skins[0].inverseBindMatrices);
check('inverseBindMatrices',ibm.length===18&&ibm.every((m,i)=>eq(m,[1,0,0,0,0,1,0,0,0,0,1,0,-globals[i][0],-globals[i][1],-globals[i][2],1])));
const mesh=gltf.meshes[0],p=mesh.primitives[0];check('singleTrianglePrimitive',mesh.primitives.length===1&&(p.mode??4)===4);
const pos=accessor(p.attributes.POSITION),normal=accessor(p.attributes.NORMAL),joints=accessor(p.attributes.JOINTS_0),weights=accessor(p.attributes.WEIGHTS_0),indices=accessor(p.indices).map(x=>x[0]);
check('triangleCountAndIndices',indices.length===4500&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<pos.length),{triangles:indices.length/3,vertices:pos.length});
let degenerate=0,minArea=Infinity;for(let i=0;i<indices.length;i+=3){const [a,c,d]=indices.slice(i,i+3).map(k=>pos[k]);if(!a||!c||!d){degenerate++;continue;}const u=c.map((v,k)=>v-a[k]),v=d.map((x,k)=>x-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(...cross)/2;minArea=Math.min(minArea,area);if(!(area>1e-12))degenerate++;}
check('nondegenerateTriangles',degenerate===0,{degenerate,minArea});
check('unitNormals',normal.length===pos.length&&normal.every(n=>n.every(Number.isFinite)&&Math.abs(Math.hypot(...n)-1)<1e-4));
check('skinWeights',weights.length===pos.length&&joints.length===pos.length&&weights.every((w,i)=>w.every((x,k)=>Number.isFinite(x)&&x>=0&&Number.isInteger(joints[i][k])&&joints[i][k]>=0&&joints[i][k]<18&&(x!==0||joints[i][k]===0))&&Math.abs(w.reduce((a,x)=>a+x,0)-1)<1e-5));
const morphs=(p.targets||[]).map(t=>accessor(t.POSITION).flat());
const morphNonzero=morphs.map(m=>m.some(v=>Math.abs(v)>1e-7));
check('expressionAndHandControlMorphs',JSON.stringify(mesh.extras?.targetNames)===JSON.stringify(targetsExpected)&&morphs.length===12&&morphs.every(m=>m.length===pos.length*3)&&!morphNonzero[0]&&morphNonzero.slice(1).every(Boolean)&&morphs.every((m,i)=>morphs.slice(i+1).every(n=>m.some((v,k)=>Math.abs(v-n[k])>1e-7))),{nonzero:morphNonzero});
check('clipNames',JSON.stringify(gltf.animations?.map(a=>a.name))===JSON.stringify(clips));
let timing=0,quats=0,hemisphere=0,endpoints=0,rootMotion=0,tracks=0,shape=0;const durations={},baseline=new Map();
for(const anim of gltf.animations||[]){const targets=new Set();let duration=null;for(const channel of anim.channels){tracks++;const sampler=anim.samplers[channel.sampler],input=accessor(sampler.input).flat(),raw=accessor(sampler.output),path=channel.target.path,node=channel.target.node,key=`${node}:${path}`;const output=path==='weights'?Array.from({length:input.length},(_,i)=>raw.slice(i*targetsExpected.length,(i+1)*targetsExpected.length).flat()):raw;if(targets.has(key))shape++;targets.add(key);if(sampler.interpolation!=='LINEAR'||(path==='weights'?raw.length!==input.length*targetsExpected.length:input.length!==output.length)||input.length<2||input.some((t,i)=>!Number.isFinite(t)||Math.abs(t-i/30)>1e-5))timing++;const end=input.at(-1);if(duration===null)duration=end;else if(Math.abs(duration-end)>1e-5)timing++;if(!baseline.has(key))baseline.set(key,output[0]);if(!eq(output[0],baseline.get(key),1e-4)||!eq(output.at(-1),baseline.get(key),1e-4))endpoints++;if(path==='rotation'){for(let i=0;i<output.length;i++){if(Math.abs(Math.hypot(...output[i])-1)>1e-4)quats++;if(i&&output[i].reduce((a,v,k)=>a+v*output[i-1][k],0)<-1e-6)hemisphere++;}}else if(path==='translation'){if((node===6||node===9)&&(!eq(output[0],rest[node],1e-4)||!eq(output.at(-1),rest[node],1e-4)))endpoints++;if(node===0&&output.some(v=>Math.abs(v[0])>1e-6||Math.abs(v[2])>1e-6))rootMotion++;}else if(path==='weights'){if(output.some(w=>w.some(x=>!Number.isFinite(x)||x<0||x>1)))shape++;}else shape++;}if(targets.size!==(anim.name==='shrug'?22:20)||names.some((_,i)=>!targets.has(`${i}:rotation`))||!targets.has('0:translation')||!targets.has('18:weights')||(anim.name==='shrug'&&(!targets.has('6:translation')||!targets.has('9:translation'))))shape++;durations[anim.name]=duration;}
check('standExpressionDefaults',eq(baseline.get('18:weights')??[],[1,...Array(11).fill(0)]));
check('sampledAt30Hz',timing===0,{invalidTracks:timing,durations});check('unitQuaternionsAndHemisphere',quats===0&&hemisphere===0,{invalid:quats,hemisphereFlips:hemisphere});check('completeTracks',shape===0,{tracks,invalid:shape});check('sharedStandPoseAtEndpoints',endpoints===0,{invalidTracks:endpoints});check('noHorizontalRootMotion',rootMotion===0,{invalidTracks:rootMotion});
async function sizeTree(dir){let size=0;for(const d of await readdir(dir,{withFileTypes:true})){if(d.name==='__pycache__'||d.name==='.DS_Store')continue;const p=join(dir,d.name);if(d.isDirectory())size+=await sizeTree(p);else if(d.isFile())size+=(await stat(p)).size;}return size;}
// The output report itself changes size; include a conservative allowance when absent.
const bytes=await sizeTree(root);check('folderBudget',bytes<=6000000,{bytes,limit:6000000,excludes:['__pycache__','.DS_Store']});
const require=createRequire(import.meta.url),validator=require(process.argv[2]??'/tmp/coach-tools/node_modules/gltf-validator');
const khronos=await validator.validateBytes(new Uint8Array(b),{uri:'coach.glb',maxIssues:10000});
await writeFile(join(root,'verification/khronos.json'),JSON.stringify(khronos,null,2)+'\n');
check('khronos',khronos.issues.numErrors===0&&khronos.issues.numWarnings===0,{errors:khronos.issues.numErrors,warnings:khronos.issues.numWarnings,infos:khronos.issues.numInfos});
const report={asset:'coach.glb',sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length,checks,errors,pass:errors.length===0};
await writeFile(join(root,'verification/asset-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
