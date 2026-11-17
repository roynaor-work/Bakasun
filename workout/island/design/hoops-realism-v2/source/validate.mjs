/** Run: HOOPS_TOOLS_DIR=/tmp/hoops-realism-tools node source/validate.mjs
 * Dependencies: gltf-validator 2.0.0-dev.3.10, three 0.160.0; ffmpeg/ffprobe.
 * No ignored Khronos issues. The package itself is the only output destination.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-realism-tools', 'package.json'));
const validator = require('gltf-validator');
const THREE = require('three');
const {CANON_BONES} = await import('../../../minigames/athletes-core.mjs');
const failures = [], checks = [];
const check = (condition, label, details) => { checks.push({label, pass: !!condition, ...(details === undefined ? {} : {details})}); if (!condition) failures.push(label); };
const rel = p => path.relative(root, p).replaceAll(path.sep, '/');
const sha = b => createHash('sha256').update(b).digest('hex');
async function walk(dir) { const out=[]; for(const e of await fs.readdir(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) out.push(...await walk(p)); else if(e.isFile()) out.push(p); } return out.sort(); }

function readGLB(bytes) {
  if (bytes.readUInt32LE(0)!==0x46546c67 || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length) throw Error('Invalid GLB header');
  let json, binary;
  for(let off=12;off<bytes.length;) { const len=bytes.readUInt32LE(off),type=bytes.readUInt32LE(off+4),data=bytes.subarray(off+8,off+8+len); if(type===0x4e4f534a) json=JSON.parse(data.toString()); if(type===0x004e4942) binary=data; off+=8+len; }
  if(!json || !binary) throw Error('GLB requires JSON and embedded BIN');
  const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  const types={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
  const dv=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  function read(index, raw=false) {
    const a=json.accessors[index], n=widths[a.type], [size,method]=types[a.componentType], out=new Array(a.count*n).fill(0);
    const get=(offset,type=a.componentType)=>{const [,m]=types[type];let value=dv[m](offset,true);if(a.normalized&&!raw) {if(type===5120)value=Math.max(value/127,-1);if(type===5121)value/=255;if(type===5122)value=Math.max(value/32767,-1);if(type===5123)value/=65535;}return value;};
    if(a.bufferView!==undefined) {const v=json.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;for(let i=0;i<a.count;i++)for(let c=0;c<n;c++)out[i*n+c]=get(start+i*stride+c*size);}
    if(a.sparse) {const s=a.sparse,iv=json.bufferViews[s.indices.bufferView],vv=json.bufferViews[s.values.bufferView],it=s.indices.componentType,is=types[it][0];for(let i=0;i<s.count;i++){const target=dv[types[it][1]]((iv.byteOffset||0)+(s.indices.byteOffset||0)+i*is,true);for(let c=0;c<n;c++)out[target*n+c]=get((vv.byteOffset||0)+(s.values.byteOffset||0)+(i*n+c)*size);}}
    return out;
  }
  const parents=new Map();json.nodes?.forEach((n,i)=>n.children?.forEach(c=>parents.set(c,i)));
  const worldMemo=new Map();
  function world(i){if(worldMemo.has(i))return worldMemo.get(i);const n=json.nodes[i],m=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));if(parents.has(i))m.premultiply(world(parents.get(i)));worldMemo.set(i,m);return m;}
  return {json,binary,read,world,parents,widths};
}

const glbs=[];
for (const file of (await walk(root)).filter(p=>p.endsWith('.glb'))) {
  const bytes=await fs.readFile(file), name=rel(file);
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:1000});
  check(report.issues.numErrors===0 && report.issues.numWarnings===0,`${name}: Khronos errors/warnings`,{errors:report.issues.numErrors,warnings:report.issues.numWarnings});
  const g=readGLB(bytes),{json:j,read,world,parents}=g;
  check(!(j.buffers||[]).some(b=>b.uri) && !(j.images||[]).some(i=>i.uri && !i.uri.startsWith('data:')),`${name}: embedded resources`);
  let triangles=0, vertices=0, weightError=0, jointErrors=0, finite=true; const jointBounds=new Map();
  const bounds=new THREE.Box3(), components=[];const positions=[];
  for(let ni=0;ni<(j.nodes||[]).length;ni++) {const node=j.nodes[ni];if(node.mesh===undefined)continue; const box=new THREE.Box3();
    for(const p of j.meshes[node.mesh].primitives){ const pos=read(p.attributes.POSITION);positions.push(Buffer.from(Float32Array.from(pos).buffer));vertices+=pos.length/3;finite&&=pos.every(Number.isFinite);const count=p.indices===undefined?pos.length/3:j.accessors[p.indices].count; if((p.mode??4)===4)triangles+=count/3;
      for(let i=0;i<pos.length;i+=3)box.expandByPoint(new THREE.Vector3(pos[i],pos[i+1],pos[i+2]).applyMatrix4(world(ni)));
      if(p.attributes.JOINTS_0!==undefined){const joints=read(p.attributes.JOINTS_0,true),weights=read(p.attributes.WEIGHTS_0),skin=j.skins[node.skin],jointCount=skin?.joints.length||0;for(let i=0;i<weights.length;i+=4){let sum=0,dominant=0;for(let c=0;c<4;c++){sum+=weights[i+c];if(weights[i+c]>weights[i+dominant])dominant=c;if(joints[i+c]<0||joints[i+c]>=jointCount||!Number.isInteger(joints[i+c])||weights[i+c]<0||!Number.isFinite(weights[i+c]))jointErrors++;}weightError=Math.max(weightError,Math.abs(sum-1));const jointName=j.nodes[skin?.joints[joints[i+dominant]]]?.name;if(jointName){if(!jointBounds.has(jointName))jointBounds.set(jointName,new THREE.Box3());jointBounds.get(jointName).expandByPoint(new THREE.Vector3(...pos.slice(i/4*3,i/4*3+3)).applyMatrix4(world(ni)));}}}
    }
    bounds.union(box);components.push({name:node.name||j.meshes[node.mesh].name||String(ni),min:box.min.toArray(),max:box.max.toArray()});
  }
  check(finite && jointErrors===0 && weightError<1e-4,`${name}: finite geometry and valid skin weights`,{jointErrors,maxWeightSumError:weightError});
  let inverseError=0;
  for(const skin of j.skins||[])if(skin.inverseBindMatrices!==undefined){const ibm=read(skin.inverseBindMatrices);skin.joints.forEach((ni,si)=>{const m=world(ni).clone().multiply(new THREE.Matrix4().fromArray(ibm.slice(si*16,(si+1)*16)));m.elements.forEach((v,k)=>inverseError=Math.max(inverseError,Math.abs(v-(k%5===0?1:0))));});}
  check(inverseError<2e-4,`${name}: inverse bind matrices`,{maxIdentityError:inverseError});
  const clips=(j.animations||[]).map(a=>{let duration=0,seamError=0,changedChannels=0;
    for(const channel of a.channels){const sampler=a.samplers[channel.sampler],times=read(sampler.input),values=read(sampler.output);duration=Math.max(duration,times.at(-1)-times[0]); const cubic=sampler.interpolation==='CUBICSPLINE',width=values.length/times.length/(cubic?3:1),first=values.slice(cubic?width:0,(cubic?2:1)*width),last=values.slice(values.length-(cubic?2:1)*width,values.length-(cubic?1:0)*width||undefined);
      const direct=Math.max(...first.map((v,i)=>Math.abs(v-last[i]))),anti=channel.target.path==='rotation'?Math.max(...first.map((v,i)=>Math.abs(v+last[i]))):Infinity;seamError=Math.max(seamError,Math.min(direct,anti));if(values.some((v,i)=>Math.abs(v-values[i%width])>1e-5))changedChannels++;
    }return{name:a.name,durationSeconds:duration,channels:a.channels.length,changedChannels,seamError};});
  const size=bounds.getSize(new THREE.Vector3()).toArray();
  const issueGroups=new Map();for(const m of report.issues.messages||[]){const key=m.severity+':'+m.code;if(!issueGroups.has(key))issueGroups.set(key,{code:m.code,severity:m.severity,count:0,example:m});issueGroups.get(key).count++;}
  const entry={file:name,bytes:bytes.length,sha256:sha(bytes),geometrySha256:sha(Buffer.concat(positions)),triangles,vertices,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size},components,joints:(j.skins?.[0]?.joints||[]).map(i=>j.nodes[i].name),clips,khronos:{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,hints:report.issues.numHints,issueGroups:[...issueGroups.values()]}};
  if(name.startsWith('crowd/')){
    const lodMatch=name.match(/lod[-_]?([012])/i); const expected=lodMatch?[210,90,24][Number(lodMatch[1])]:null;
    check(expected!==null && triangles===expected,`${name}: exact LOD triangle budget`,{expected,actual:triangles});
    check(clips.length===6 && ['sit','stand','clap','jump','disappointed','shout'].every(id=>clips.some(c=>c.name===id)),`${name}: six named crowd clips`);
    check(clips.every(c=>c.durationSeconds>0 && c.changedChannels>0 && c.seamError<1e-5),`${name}: animated seamless loops`,clips.map(c=>({name:c.name,duration:c.durationSeconds,seamError:c.seamError,changedChannels:c.changedChannels})));
    check(size[1]>.8&&size[1]<2.3&&size[0]>.16&&size[0]<1.6&&size[2]>.06,`${name}: human body bounds`,size);
    const requiredParts=['Head','Neck','Chest','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'];
    const centre=n=>jointBounds.get(n)?.getCenter(new THREE.Vector3());
    const separated=requiredParts.every(n=>jointBounds.has(n))&&centre('Head').y>centre('Neck').y&&centre('Neck').y>centre('Chest').y&&centre('LeftArm').x>centre('RightArm').x&&centre('LeftUpLeg').x>centre('RightUpLeg').x&&centre('LeftUpLeg').y>centre('LeftLeg').y&&centre('RightUpLeg').y>centre('RightLeg').y;
    check(separated,`${name}: distinct anatomical surfaces in spatial order`,{requiredParts});
    entry.anatomy=Object.fromEntries(requiredParts.filter(n=>jointBounds.has(n)).map(n=>[n,{min:jointBounds.get(n).min.toArray(),max:jointBounds.get(n).max.toArray()}]));
    entry.anatomyNames=(j.nodes||[]).map(n=>n.name).filter(Boolean);
  }
  if(name.startsWith('players/')) {
    const skin=j.skins?.[0]; const names=skin?.joints.map(i=>j.nodes[i].name)||[]; let bindError=0,hierarchy=true;
    for(const b of CANON_BONES){const ni=j.nodes.findIndex(n=>n.name===b.name),n=j.nodes[ni];if(!n){hierarchy=false;continue;}const parentName=j.nodes[parents.get(ni)]?.name||null;if(parentName!==b.parent)hierarchy=false;const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];bindError=Math.max(bindError,...t.map((v,i)=>Math.abs(v-b.rest[i])),...q.map((v,i)=>Math.abs(v-[0,0,0,1][i])),...s.map(v=>Math.abs(v-1)));}
    check(names.join('|')===CANON_BONES.map(b=>b.name).join('|')&&hierarchy&&bindError<2e-5,`${name}: exact canonical18 bind`,{names,hierarchy,maxLocalTransformError:bindError});
    entry.canonical18={hierarchy,maxLocalTransformError:bindError};
  }
  glbs.push(entry);
}
const crowds=glbs.filter(g=>g.file.startsWith('crowd/')), players=glbs.filter(g=>g.file.startsWith('players/'));
check(crowds.length===48,'crowd: 16 models × 3 LODs',{actual:crowds.length});
const crowdGroups=new Map();for(const g of crowds){const m=g.file.match(/(?:^|\/)(fan-\d+)-lod([012])\.glb$/);if(m){if(!crowdGroups.has(m[1]))crowdGroups.set(m[1],new Set());crowdGroups.get(m[1]).add(Number(m[2]));}}
check(crowdGroups.size===16&&[...crowdGroups.values()].every(s=>s.size===3),'crowd: each individual has three LODs');
check(new Set(crowds.filter(g=>/lod0\.glb$/.test(g.file)).map(g=>g.sha256)).size===16,'crowd: sixteen distinct high detail assets');
try {const catalog=JSON.parse(await fs.readFile(path.join(root,'crowd/catalog.json'),'utf8')),fans=catalog.fans||[],ages=[...new Set(fans.map(f=>f.ageGroup))],skinTones=new Set(fans.map(f=>f.skin)),hairstyles=new Set(fans.map(f=>f.hair)),outfits=new Set(fans.map(f=>f.outfit)),accessories=new Set(fans.flatMap(f=>f.accessories||[]));check(fans.length===16&&['child','adult','senior'].every(a=>ages.includes(a))&&skinTones.size>=6&&hairstyles.size>=4&&outfits.size>=3&&accessories.has('cap')&&accessories.has('glasses'),'crowd: age, skin, hair, clothing and accessory variety',{ageGroups:ages,skinTones:skinTones.size,hairstyles:hairstyles.size,outfits:outfits.size,accessories:[...accessories]});for(const fan of fans)for(const lod of fan.lods||[]){const actual=crowds.find(g=>g.file===lod.path);check(!!actual&&actual.triangles===lod.triangles&&actual.bytes===lod.bytes,`catalog: ${lod.path} agrees with delivered bytes`);}}
catch(error){check(false,'crowd: valid catalog exists',String(error));}
check(players.length===4,'players: four body models',{actual:players.length});
check(new Set(players.map(g=>g.geometrySha256)).size===4,'players: four distinct geometries');
check(new Set(players.map(g=>g.bounds.size.map(v=>v.toFixed(5)).join(','))).size===4,'players: four distinct measured body bounds');

const audio=[];
for(const file of (await walk(root)).filter(p=>/\.(ogg|mp3)$/.test(p))){const bytes=await fs.readFile(file),name=rel(file);const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));const stream=probe.streams.find(s=>s.codec_type==='audio');const pcm=execFileSync('ffmpeg',['-v','error','-i',file,'-f','f32le','-acodec','pcm_f32le','-'],{maxBuffer:4e6});let peak=0,dc=0,tailPeak=0;const samples=pcm.length/4;for(let i=0;i<samples;i++){const v=pcm.readFloatLE(i*4);peak=Math.max(peak,Math.abs(v));dc+=v;if(i>=samples-Math.min(samples,Math.round(Number(stream.sample_rate)*.005)))tailPeak=Math.max(tailPeak,Math.abs(v));}dc/=samples;const duration=Number(stream.duration||probe.format.duration);const item={file:name,bytes:bytes.length,sha256:sha(bytes),codec:stream.codec_name,channels:stream.channels,sampleRateHz:Number(stream.sample_rate),durationSeconds:duration,decodedSamples:samples,peak,dc,final5msPeak:tailPeak};audio.push(item);check(bytes.length<=40000&&stream.channels===1&&['mp3','vorbis'].includes(stream.codec_name)&&duration>0&&duration<1.5&&peak>0&&peak<=1.001&&Math.abs(dc)<.01,`${name}: mono audio, decode, size, signal`,item);}
check(audio.length===14,'audio: seven effects in two codecs',{actual:audio.length});
const effectPairs=new Map();for(const a of audio){const stem=a.file.replace(/\.(ogg|mp3)$/,'');if(!effectPairs.has(stem))effectPairs.set(stem,new Set());effectPairs.get(stem).add(path.extname(a.file));}check(effectPairs.size===7&&[...effectPairs.values()].every(s=>s.has('.ogg')&&s.has('.mp3')),'audio: every effect has both OGG and MP3');

const files=await walk(root);check(!files.some(f=>f.includes('__pycache__')||f.endsWith('.pyc')),'package: no Python caches');
const manifestFile=path.join(root,'manifest.json');
try {
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8')),references=[],repoRoot=path.resolve(root,'../../../..')+path.sep;
  function collect(v,trail=[]){if(Array.isArray(v))v.forEach(x=>collect(x,trail));else if(v&&typeof v==='object')Object.entries(v).forEach(([key,x])=>collect(x,[...trail,key]));else if(typeof v==='string'&&/^[^\s;]+\.(glb|mp3|ogg|png|webp|jpe?g|html|mjs|js|json|md|three)$/i.test(v)&&!v.includes('://')&&trail.at(-1)!=='license'){const shared=trail.includes('sharedPreviewDependencies'),source=trail.some(k=>/^(source|provenance|sourceFile|sourceModel|sourcePath)$/i.test(k));references.push({ref:v,kind:shared?'shared-preview':source?'read-only-source':'delivery'});}}
  collect(manifest);
  for(const {ref,kind} of [...new Map(references.map(r=>[r.kind+':'+r.ref,r])).values()]){
    const resolved=path.resolve(kind==='read-only-source'&&ref.startsWith('workout/')?repoRoot:root,ref);
    const allowed=kind==='shared-preview'?/^\.\.\/\.\.\/vendor\/(three\.module\.js|GLTFLoader\.js|BufferGeometryUtils\.js|SkeletonUtils\.js|LICENSE\.three)$/.test(ref):resolved.startsWith(kind==='read-only-source'?repoRoot:root);
    const exists=!!(await fs.stat(resolved).catch(()=>null));
    check(allowed&&exists,`manifest ${kind}: ${ref} exists`,{allowed,exists});
  }
}
catch(error){check(false,'manifest: valid JSON exists',String(error));}
const reportFile=path.join(root,'verification/validation.json');let otherBytes=0;for(const p of files)if(p!==reportFile)otherBytes+=(await fs.stat(p)).size;
const budgetLabel='package: at most 6,000,000 bytes';check(true,budgetLabel,{totalBytes:otherBytes});const budgetCheck=checks.at(-1);
const result={schemaVersion:1,validatorVersion:validator.version(),generatedAt:new Date().toISOString(),scope:'All GLBs validated with Khronos without ignored or overridden issues; native decoded accessor, skeleton, clip, audio and package contract checks. Repeated Khronos messages are counted by code with one example; no check is suppressed.',passed:failures.length===0,failedChecks:failures,summary:{glbs:glbs.length,crowdGLBs:crowds.length,playerGLBs:players.length,audioFiles:audio.length,khronosErrors:glbs.reduce((n,g)=>n+g.khronos.errors,0),khronosWarnings:glbs.reduce((n,g)=>n+g.khronos.warnings,0),packageBytesIncludingThisReport:otherBytes},checks,glbs,audio};
let output;for(let i=0;i<5;i++){output=JSON.stringify(result,null,2)+'\n';const total=otherBytes+Buffer.byteLength(output);result.summary.packageBytesIncludingThisReport=total;budgetCheck.details={totalBytes:total};budgetCheck.pass=total<=6000000;const fi=failures.indexOf(budgetLabel);if(!budgetCheck.pass&&fi<0)failures.push(budgetLabel);if(budgetCheck.pass&&fi>=0)failures.splice(fi,1);result.passed=failures.length===0;}
output=JSON.stringify(result,null,2)+'\n';await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(reportFile,output);
console.log(JSON.stringify({passed:result.passed,...result.summary,failedChecks:failures},null,2));
if(failures.length)process.exitCode=1;
