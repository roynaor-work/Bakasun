// Scope, iteration evidence and final handoff checks. Does not edit existing files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const PACK=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO=path.resolve(PACK,'../../../..');
const VENDOR=path.resolve(PACK,'../../vendor');
const PREFIX=path.relative(REPO,PACK).replaceAll(path.sep,'/')+'/';
const args=process.argv.slice(2),option=(k,v)=>args.includes(k)?args[args.indexOf(k)+1]:v;
const require=createRequire(path.resolve(option('--modules','/tmp/alpine-v7-tools'),'package.json'));
const sharp=require('sharp');
const hash=b=>createHash('sha256').update(b).digest('hex');
const errors=[],warnings=[];
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function walk(dir){
  const entries=await fs.readdir(dir,{withFileTypes:true});
  return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat().sort();
}
const run=promisify(execFile);
const git=async(...a)=>(await run('git',a,{cwd:REPO,encoding:'utf8',maxBuffer:10*1024*1024})).stdout.trim();
const base=option('--base',await git('merge-base','HEAD','origin/main'));
const branch=await git('branch','--show-current');
if(branch!=='codex/alpine-v7-20261105')errors.push({file:'git branch',error:`Expected codex/alpine-v7-20261105; found ${branch}`});
const changedLines=[...(await git('diff','--name-status',base,'--')).split('\n'),...(await git('diff','--cached','--name-status','--')).split('\n')].filter(Boolean);
const scope=[];
for(const line of new Set(changedLines)){
  const [status,...files]=line.split('\t');
  for(const file of files){
    scope.push({file,status});
    if(status!=='A'||!file.startsWith(PREFIX))errors.push({file,error:`Scope violation: tracked change ${status}`});
  }
}
for(const file of (await git('ls-files','--others','--exclude-standard')).split('\n').filter(Boolean)){
  scope.push({file,status:'untracked'});
  if(!file.startsWith(PREFIX))errors.push({file,error:'New file outside authorized alpine-v7 directory'});
}
const forbidden=scope.filter(f=>/(^|\/)(CLAUDE\.md|release\.(json|mjs))$/.test(f.file)||f.file.startsWith('tests/'));
for(const f of forbidden)errors.push({file:f.file,error:'Protected file appears in task changes'});

const iterationRoot=path.join(PACK,'iterations');
const iterationNames=(await fs.readdir(iterationRoot,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d\d$/.test(e.name)).map(e=>e.name).sort();
const iterations=[];
for(const name of iterationNames){
  const dir=path.join(iterationRoot,name),files=await walk(dir),captures=[];
  for(const file of files.filter(f=>/\.(png|webp|jpe?g)$/i.test(f))){
    const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
    const basename=path.basename(file).toLowerCase();
    const distance=/(near|close|קרוב)/.test(basename)?'close':/(far|wide|רחוק)/.test(basename)?'far':null;
    const orientation=meta.width===390&&meta.height===844?'portrait':meta.width===844&&meta.height===390?'landscape':null;
    captures.push({file:path.relative(PACK,file),width:meta.width,height:meta.height,distance,orientation,bytes:bytes.length,sha256:hash(bytes)});
  }
  const critique=files.find(f=>/(critique|review|ביקורת).*\.md$/i.test(path.basename(f)));
  const missing=[];
  for(const distance of ['close','far'])for(const orientation of ['portrait','landscape'])if(!captures.some(c=>c.distance===distance&&c.orientation===orientation))missing.push(`${distance}/${orientation}`);
  if(!critique)missing.push('written self-critique');
  else if((await fs.readFile(critique,'utf8')).trim().length<80)missing.push('substantive self-critique (at least 80 characters)');
  if(missing.length)errors.push({file:'iterations/'+name,error:'Missing iteration evidence: '+missing.join(', ')});
  iterations.push({id:name,captures,critique:critique?path.relative(PACK,critique):null,missing});
}
if(iterations.length<6)errors.push({file:'iterations/',error:`At least 6 build/render/critique iterations required; found ${iterations.length}`});
for(const file of ['preview.html','REPORT.md','README.md'])if(!await exists(path.join(PACK,file)))errors.push({file,error:'Required handoff file is missing'});
const auditedReports={};
for(const file of ['verification/asset-audit.json','verification/motion-audit.json','verification/package-audit.json','motion/verification/dense-boundaries.json','motion/verification/json-playback.json']){
  if(!await exists(path.join(PACK,file))){errors.push({file,error:'Required independent audit is missing'});continue;}
  const data=JSON.parse(await fs.readFile(path.join(PACK,file),'utf8'));
  auditedReports[file]=data;
  if(data.allPassed!==true||(data.errors?.length??0)>0||(data.failures?.length??0)>0)errors.push({file,error:'Independent audit reports unresolved failures'});
  const entries=file.endsWith('asset-audit.json')||file.endsWith('package-audit.json')?data.assets:file.includes('motion-audit')||file.includes('dense-boundaries')?data.characters:[];
  for(const entry of entries??[]){
    try{
      const target=entry.file.startsWith('engine/')?path.join(VENDOR,'draco',entry.file.slice('engine/'.length)):path.join(PACK,entry.file);
      const actual=await fs.readFile(target);
      if(hash(actual)!==entry.sha256)errors.push({file:entry.file,error:`Stale file hash in ${file}`});
    }catch(error){errors.push({file:entry.file,error:`Cannot compare audit source: ${error.message}`});}
  }
  if((file.includes('motion-audit')||file.includes('dense-boundaries'))&&(data.allLODs!==true||data.characters?.length!==9))errors.push({file,error:'Final motion evidence must cover all 9 character/LOD files'});
  for(const [input,record]of Object.entries(data.inputs??{})){
    try{if(hash(await fs.readFile(path.join(PACK,input)))!==record.sha256)errors.push({file:input,error:`Stale input hash in ${file}`});}
    catch(error){errors.push({file:input,error:`Cannot compare audit input: ${error.message}`});}
  }
  if(file.endsWith('package-audit.json')){
    const modulePaths={three:path.join(VENDOR,'three.module.js'),geometry:path.join(VENDOR,'BufferGeometryUtils.js'),gltf:path.join(VENDOR,'GLTFLoader.js'),draco:path.join(VENDOR,'DRACOLoader.js'),world:path.join(PACK,'world/world.js'),preview:path.join(PACK,'preview-client.mjs'),motion:path.join(PACK,'motion/motion.mjs')};
    for(const module of data.modules??[]){
      try{if(!modulePaths[module.name]||hash(await fs.readFile(modulePaths[module.name]))!==module.sha256)errors.push({file:'module:'+module.name,error:`Stale module hash in ${file}`});}
      catch(error){errors.push({file:'module:'+module.name,error:`Cannot compare source module: ${error.message}`});}
    }
    for(const [input,sha]of [['preview-standalone.html',data.standalone?.sha256],['preview.css',data.standalone?.stylesheetSha256],['bootstrap.js',data.standalone?.bootstrapSha256]]){
      try{if(!sha||hash(await fs.readFile(path.join(PACK,input)))!==sha)errors.push({file:input,error:`Stale delivered page hash in ${file}`});}
      catch(error){errors.push({file:input,error:`Cannot compare delivered page: ${error.message}`});}
    }
  }
}

const supportFile='world/verification-rock-support.json';
if(await exists(path.join(PACK,supportFile))){
  const support=JSON.parse(await fs.readFile(path.join(PACK,supportFile),'utf8'));
  if(support.pass!==true||support.after?.rocks?.length!==18||support.after?.summary?.positiveSupportGaps!==0)errors.push({file:supportFile,error:'Final rock/terrain support evidence is incomplete or failed'});
  if(hash(await fs.readFile(path.join(PACK,'world/world.js')))!==support.after?.worldModuleSha256)errors.push({file:supportFile,error:'Rock support evidence uses a stale world module'});
  for(const [id,sha]of Object.entries(support.modelSha256??{}))if(hash(await fs.readFile(path.join(PACK,`world/models/${id}.glb`)))!==sha)errors.push({file:supportFile,error:`Rock support evidence uses stale ${id} geometry`});
}

let browserEvidence=null;
const browserFile='verification/browser-audit.json';
if(!await exists(path.join(PACK,browserFile)))errors.push({file:browserFile,error:'Final browser audit is missing'});
else{
  const data=JSON.parse(await fs.readFile(path.join(PACK,browserFile),'utf8'));
  if(data.pass!==true||data.errors?.length||data.consoleErrors?.length||data.externalRequests?.length)errors.push({file:browserFile,error:'Browser audit has unresolved errors or network requests'});
  const snapshots=[];
  const collect=value=>{if(!value||typeof value!=='object')return;if(value.bundleBuiltAt&&value.bundleSources)snapshots.push(value);for(const child of Object.values(value))if(child&&typeof child==='object')collect(child);};
  collect(data);
  const packaged=auditedReports['verification/package-audit.json'];
  const sources=Object.fromEntries((packaged?.modules??[]).map(m=>[m.name,m.sha256]));
  const staleSnapshots=snapshots.filter(snap=>snap.bundleBuiltAt!==packaged?.bundleBuiltAt||Object.entries(sources).some(([name,sha])=>snap.bundleSources[name]!==sha)).length;
  if(staleSnapshots)errors.push({file:browserFile,error:`${staleSnapshots} browser snapshots use a different package or source hash from the final package audit`});
  if(!snapshots.length)errors.push({file:browserFile,error:'Browser evidence contains no package/source hash snapshot'});
  browserEvidence={snapshots:snapshots.length,bundleBuiltAt:packaged?.bundleBuiltAt??null,pass:data.pass===true};
}

const allFiles=await walk(PACK),inventory=[];
for(const file of allFiles){
  const rel=path.relative(PACK,file).replaceAll(path.sep,'/');
  if(rel==='verification/delivery-audit.json'||rel==='verification/file-inventory.json')continue;
  const bytes=await fs.readFile(file);inventory.push({file:rel,bytes:bytes.length,MB:bytes.length/1000000,sha256:hash(bytes)});
}
inventory.sort((a,b)=>b.bytes-a.bytes||a.file.localeCompare(b.file));
const workLogFile=path.join(PACK,'verification/work-log.json');
let duration=null;
if(await exists(workLogFile)){
  const log=JSON.parse(await fs.readFile(workLogFile,'utf8'));
  const start=Date.parse(log.startedAt??log.start),end=Date.parse(log.completedAt??log.endedAt??log.end??new Date().toISOString());
  if(Number.isFinite(start)&&Number.isFinite(end))duration={startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),elapsedMinutes:(end-start)/60000,evidence:'recorded task clock times'};
}
if(!duration)warnings.push('No work-log.json clock record: minimum sustained-work duration cannot be audited.');
else if(duration.elapsedMinutes<120)errors.push({file:'verification/work-log.json',error:`Task clock duration is ${duration.elapsedMinutes.toFixed(1)} minutes; user requested at least a few hours of sustained work.`});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:errors.length===0,base,head:await git('rev-parse','HEAD'),branch,
  authorizedPrefix:PREFIX,scope,iterations,duration,browserEvidence,fileCount:inventory.length,totalBytes:inventory.reduce((sum,f)=>sum+f.bytes,0),largestFiles:inventory.slice(0,20),errors,warnings,
  limitations:['A timestamp duration and saved screenshots establish artifacts and elapsed task time. They do not prove uninterrupted attention or visual quality.','File hashes describe the current inspection. Rerun after changing delivered files.']};
await fs.writeFile(path.join(PACK,'verification/file-inventory.json'),JSON.stringify({schemaVersion:1,generatedAt:report.generatedAt,files:inventory},null,2)+'\n');
await fs.writeFile(path.join(PACK,'verification/delivery-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allPassed:report.allPassed,iterations:iterations.length,duration,fileCount:inventory.length,largestFiles:inventory.slice(0,5),errors,warnings},null,2));
if(errors.length)process.exitCode=1;
