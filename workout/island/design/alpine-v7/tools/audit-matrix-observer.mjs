/** Read-only observation of the running rendering matrix. Never launches a browser. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectMatrixCase} from './audit-matrix-protocol.mjs';
import {inspectMatrixContinuation} from './audit-matrix-continuation.mjs';

const pack=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
const modules=argument('--modules','/tmp/alpine-v7-tools');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async file=>JSON.parse(await fs.readFile(path.join(pack,file),'utf8'));
const clips=['glide','carve_left','carve_right','crouch','accelerate','ramp_jump','trick_180','trick_360','trick_shifty','trick_tail_grab','trick_backflip','fall_roll','get_up','celebrate'];
const observedAt=new Date().toISOString(),errors=[],checks={};
const check=(name,pass)=>{checks[name]=!!pass;if(!pass)errors.push(name);};
const caseFile=path.join(pack,'verification/matrix/cases.jsonl');
let text;
try{text=await fs.readFile(caseFile,'utf8');}catch(error){
  if(error.code!=='ENOENT')throw error;
  console.log(JSON.stringify({observedAt,status:'waiting',cases:0,reason:'Matrix has not created cases.jsonl'}));
  process.exit(0);
}
// appendFile writes newline-terminated records. An unfinished final line is not
// treated as a complete case while the other process is appending it.
const lines=text.split('\n'),unfinishedFinalLine=lines.pop();
const cases=[];
for(const [index,line]of lines.entries()){
  if(!line)continue;
  try{cases.push(JSON.parse(line));}catch(error){errors.push(`Malformed completed line ${index+1}: ${error.message}`);}
}
const packageAudit=await readJSON('verification/package-audit.json');
const journal=await readJSON('verification/matrix/run-state.json');
check('current standalone matches independent package audit',sha(await fs.readFile(path.join(pack,'preview-standalone.html')))===packageAudit.standalone.sha256);
check('journal source and exact run protocol',journal.schemaVersion===2&&journal.sourceHTMLSHA256===packageAudit.standalone.sha256&&journal.expectedCases===504&&journal.dwellSeconds===10&&journal.devicePixelRatio===1.5&&journal.minimumProgressTimeoutSeconds===45&&journal.endProbeTimeoutSeconds===45);
check('journal records CPU execution environment',journal.execution?.cpuAffinity==='0-2'&&typeof journal.execution.cpuQuota==='string'&&typeof journal.execution.node==='string');
check('launch tool source SHA remains current',journal.toolSourceSHA256===sha(await fs.readFile(path.join(pack,'tools/matrix-soak.mjs'))));
check('journal and completed line counts agree within one atomic write',Number.isInteger(journal.caseCount)&&Math.abs(journal.caseCount-cases.length)<=1);
const expected=[];
for(const viewport of [[390,844],[844,390]])for(const environment of ['sunset','fog','night-floodlit'])for(let athlete=0;athlete<3;athlete++)for(const view of ['close','wide'])for(const clip of clips)expected.push({viewport,configuration:{environment,athlete,view,clip}});
const identity=c=>[c.viewport?.join('x'),c.configuration?.environment,c.configuration?.athlete,c.configuration?.view,c.configuration?.clip].join('|');
check('case count does not exceed 504',cases.length<=504);
check('case identities are unique',new Set(cases.map(identity)).size===cases.length);
check('ordered exact configuration prefix',cases.every((c,i)=>identity(c)===identity(expected[i])&&c.id===String(i+1).padStart(3,'0')));
check('every recorded case used at least ten seconds',cases.every(c=>Number.isFinite(c.elapsedSeconds)&&c.elapsedSeconds>=10));
check('all observed pixel ratios are 1.5',cases.every(c=>c.snapshot?.pixelRatio===1.5));
check('all cases use final frozen package',cases.every(c=>c.snapshot?.bundleBuiltAt===packageAudit.bundleBuiltAt));
check('every recorded playback assertion passes',cases.every(c=>c.playbackPass===true));
check('every recorded resource assertion passes',cases.every(c=>c.resourcesPass===true));
check('independent resource bounds',cases.every(c=>c.snapshot?.memory?.geometries<200&&c.snapshot?.memory?.textures<64&&c.snapshot?.loadedRecords===c.snapshot?.characterRoots));
const protocol=cases.map(c=>inspectMatrixCase(c,{bundleBuiltAt:packageAudit.bundleBuiltAt,requireDiagnostics:true}));
check('independent schema2 playback and end protocol',protocol.every(c=>!c.errors.length));
for(const result of protocol)errors.push(...result.errors);
const sharp=(await import(pathToFileURL(path.join(modules,'node_modules/sharp/lib/index.js')).href)).default;
const screenshots=[];
check('every prescribed image was captured',cases.every(c=>!['carve_left','ramp_jump','fall_roll'].includes(c.configuration?.clip)||typeof c.screenshot==='string'));
for(const c of cases){
  if(!c.screenshot)continue;
  const safe=path.basename(c.screenshot)===c.screenshot;
  check('safe screenshot path '+c.id,safe);if(!safe)continue;
  try{
    const bytes=await fs.readFile(path.join(pack,'verification/matrix',c.screenshot)),metadata=await sharp(bytes).metadata();
    check('screenshot dimensions '+c.id,metadata.width===c.viewport[0]&&metadata.height===c.viewport[1]);
    screenshots.push({case:c.id,file:'verification/matrix/'+c.screenshot,bytes:bytes.length,sha256:sha(bytes),width:metadata.width,height:metadata.height});
  }catch(error){errors.push(`Screenshot ${c.id}: ${error.message}`);}
}
const numbers=key=>cases.map(c=>key(c)).filter(Number.isFinite);
const range=values=>values.length?{minimum:Math.min(...values),maximum:Math.max(...values)}:null;
let finalReport=null;
try{finalReport=await readJSON('verification/matrix-soak.json');}catch(error){if(error.code!=='ENOENT')throw error;}
const complete=cases.length===504&&finalReport?.cases?.length===504;
let continuationProof=null;
try{
  continuationProof=await inspectMatrixContinuation({pack,report:complete?finalReport:journal,cases,complete});
  check('independent controller segment and replay proof',!continuationProof.errors.length);
  errors.push(...continuationProof.errors);
}catch(error){errors.push('Continuation proof: '+error.message);}
if(complete){
  check('completed journal identifies the same full run',journal.startedAt===finalReport.startedAt&&journal.completedAt===finalReport.completedAt&&journal.caseCount===504&&journal.lastCompletedId==='504'&&journal.pass===true);
  check('completed matrix uses explicit schema2 protocol',finalReport.schemaVersion===2&&typeof finalReport.playbackProtocol==='string'&&finalReport.playbackProtocol.length>30);
  check('completed matrix passes with no errors or external requests',finalReport.pass===true&&!finalReport.errors?.length&&!finalReport.externalRequests?.length);
  check('completed report cases equal persisted records',JSON.stringify(finalReport.cases)===JSON.stringify(cases));
  check('completed report source hash is current',finalReport.sourceHTMLSHA256===packageAudit.standalone.sha256);
}
const observation={observedAt,startedAt:journal.startedAt,execution:journal.execution,toolSourceSHA256:journal.toolSourceSHA256,status:errors.length?'failed':complete?'passed':'incomplete',complete,cases:cases.length,expectedCases:504,continuation:continuationProof?{controllerSegments:continuationProof.segments,replayCount:continuationProof.replayCount,replayExpected:continuationProof.replayExpected,preservedImages:continuationProof.preservedImages,replayImages:continuationProof.images}:null,unfinishedFinalLine:!!unfinishedFinalLine,checks,errors,lastCase:cases.at(-1)?.id??null,lastConfiguration:cases.at(-1)?.configuration??null,playback:{looping:cases.filter(c=>c.looping).length,naturallyCompletedOneShots:cases.filter(c=>!c.looping&&c.naturalEnd===true).length,seekAssistedEndProbes:cases.filter(c=>c.endProbe).length},ranges:{geometries:range(numbers(c=>c.snapshot.memory.geometries)),textures:range(numbers(c=>c.snapshot.memory.textures)),javascriptHeapBytes:range(numbers(c=>c.jsHeap?.used)),observedFPS:range(numbers(c=>c.snapshot.fps)),cpuSubmissionMedianMilliseconds:range(numbers(c=>c.snapshot.renderTimingMilliseconds?.median)),elapsedSeconds:range(numbers(c=>c.elapsedSeconds)),totalElapsedSeconds:range(numbers(c=>c.totalElapsedSeconds)),maximumRAFGapMilliseconds:range(numbers(c=>c.progressObservation?.maximumRAFGapMilliseconds))},screenshots,limitations:'CPU-only review of persisted observations and image files; no browser launch, GPU work or physical-phone performance claim. Ten-second playback is distinct from optional seek-assisted completion.'};
await fs.writeFile(path.join(pack,'verification/matrix-observer.json'),JSON.stringify(observation,null,2)+'\n');
await fs.appendFile(path.join(pack,'verification/matrix-observer.jsonl'),JSON.stringify({observedAt,startedAt:journal.startedAt,status:observation.status,complete,cases:cases.length,replayCases:continuationProof?.replayCount??0,lastCase:observation.lastCase,ranges:observation.ranges,screenshots:screenshots.length,errors})+'\n');
console.log(JSON.stringify({...observation,checks:undefined,screenshots:screenshots.length},null,2));
if(errors.length)process.exitCode=1;
