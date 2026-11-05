/** Verify preserved controller segments, byte-identical prefix and full replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectMatrixCase} from './audit-matrix-protocol.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rowsFrom=bytes=>bytes.toString('utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function webpSize(bytes){
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error('Not a WebP image');
  for(let at=12;at+8<=bytes.length;){
    const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),start=at+8;
    if(start+length>bytes.length)throw Error('Truncated WebP chunk');
    if(kind==='VP8X'&&length>=10)return[1+bytes.readUIntLE(start+4,3),1+bytes.readUIntLE(start+7,3)];
    if(kind==='VP8 '&&length>=10&&bytes.toString('hex',start+3,start+6)==='9d012a')return[bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff];
    if(kind==='VP8L'&&length>=5&&bytes[start]===0x2f){const bits=bytes.readUInt32LE(start+1);return[1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];}
    at=start+length+(length%2);
  }
  throw Error('No WebP image dimensions');
}

export async function inspectMatrixContinuation({pack,report,cases,complete=false}){
  const errors=[],images=[],segments=report.controllerSegments??[],continuations=report.continuations??[];
  const check=(pass,message)=>{if(!pass)errors.push(message);return !!pass;};
  const local=file=>{const resolved=path.resolve(pack,file);if(!resolved.startsWith(pack+path.sep))throw Error('Path outside pack: '+file);return resolved;};
  const read=async file=>fs.readFile(local(file));
  const readJSON=async file=>JSON.parse((await read(file)).toString('utf8'));
  const journal=await readJSON('verification/matrix/run-state.json');
  const persistedMain=rowsFrom(await read('verification/matrix/cases.jsonl'));
  check(complete?same(persistedMain,cases):same(persistedMain.slice(0,cases.length),cases),'Reported main cases differ from persisted JSONL evidence');
  check(same(continuations,journal.continuations??[]),'Declared continuation metadata differs from persisted run journal');
  if(complete)check(same(segments,journal.controllerSegments),'Final controller segments differ from persisted run journal');
  const currentSource=await read('tools/matrix-soak.mjs');
  check(hash(currentSource)===report.toolSourceSHA256,'Current controller source differs from launch SHA');
  check(segments.length===continuations.length+1,'Controller segments do not match continuation count');
  let through=0;
  for(const [i,segment]of segments.entries()){
    check(segment.index===i+1&&segment.firstCase===through+1&&Number.isInteger(segment.lastCase)&&segment.lastCase>=segment.firstCase-1,'Controller segment ranges are not a contiguous case prefix');
    check(Number.isFinite(Date.parse(segment.startedAt))&&Date.parse(segment.startedAt)<=Date.now()+1000,'Controller segment start time invalid');
    try{check(hash(await read(segment.sourceFile))===segment.toolSourceSHA256,'Archived controller SHA mismatch: '+segment.sourceFile);}catch(error){errors.push(error.message);}
    through=segment.lastCase;
  }
  check(complete?through===cases.length:Math.abs(through-cases.length)<=1,'Controller segments do not cover every persisted main case');
  check(segments.at(-1)?.toolSourceSHA256===report.toolSourceSHA256,'Latest controller segment does not identify current source');
  if(!continuations.length)return{errors,segments:segments.length,replayCount:0,replayExpected:0,replayCases:[],images,preservedImages:0};
  if(!check(continuations.length===1&&segments.length===2,'Only the declared single continuation is supported'))return{errors,segments:segments.length,replayCount:0,replayExpected:33,replayCases:[],images,preservedImages:0};
  const continuation=continuations[0],archive=continuation.archiveDirectory;
  check(continuation.index===1&&continuation.completedPrefix===285&&continuation.incompleteCase==='286'&&continuation.replayStart===253&&continuation.replayEnd===285,'Continuation range differs from the preserved285-case checkpoint');
  check(report.screenshotTimeoutSeconds===90,'Continuation screenshot timeout must be recorded as90 seconds');
  const prefixBytes=await read(archive+'/cases.jsonl'),priorBytes=await read(archive+'/run-state.json'),logBytes=await read(archive+'/run.log'),sourceBytes=await read(archive+'/controller.mjs');
  const original=JSON.parse(priorBytes),prefix=rowsFrom(prefixBytes),mainBytes=await read('verification/matrix/cases.jsonl');
  check(hash(prefixBytes)===continuation.prefixSHA256&&mainBytes.subarray(0,prefixBytes.length).equals(prefixBytes),'Original285 main records were changed');
  check(hash(priorBytes)===continuation.previousJournalSHA256&&hash(logBytes)===continuation.previousLogSHA256&&hash(sourceBytes)===continuation.previousControllerSHA256,'Preserved journal, log or controller hash mismatch');
  check(continuation.previousControllerSHA256===original.toolSourceSHA256&&segments[0].toolSourceSHA256===original.toolSourceSHA256,'Original controller provenance differs across archive and segment');
  check(prefix.length===285&&original.caseCount===285&&original.lastCompletedId==='285'&&original.startedAt===report.startedAt&&segments[0].startedAt===report.startedAt,'Original checkpoint count or start time changed');
  check(prefix.every(row=>row.controllerSegment===undefined||row.controllerSegment===1)&&cases.slice(285).every(row=>row.controllerSegment===2),'Main records are not tied to their declared controller segment');
  check(original.sourceHTMLSHA256===report.sourceHTMLSHA256&&same(original.baselines,report.baselines),'Original HTML identity or two baselines changed');
  check(!original.errors?.length&&!original.externalRequests?.length&&original.dwellSeconds===report.dwellSeconds&&original.devicePixelRatio===report.devicePixelRatio&&same(original.execution,report.execution),'Original execution/protocol identity or error state changed');
  check(/page\.screenshot: Timeout 30000ms exceeded/.test(logBytes.toString()),'Original screenshot timeout evidence is missing');
  check(segments[1].firstCase===286&&segments[1].startedAt===continuation.resumedAt&&Date.parse(continuation.resumedAt)>=Date.parse(original.updatedAt),'Continuation controller start is inconsistent');
  const expectedPackage=report.baselines?.[0]?.snapshot?.bundleBuiltAt;
  for(const row of prefix)for(const error of inspectMatrixCase(row,{bundleBuiltAt:expectedPackage,minDwell:report.dwellSeconds,requireDiagnostics:true}).errors)errors.push('Preserved prefix '+error);

  // The independent observer hashed every original image before continuation.
  const imageProof=await readJSON(archive+'/matrix-observer.json');
  const oldImages=prefix.filter(c=>c.screenshot);
  check(imageProof.cases===285&&!imageProof.errors?.length&&imageProof.screenshots?.length===oldImages.length,'Pre-continuation independent image proof is incomplete');
  for(const row of oldImages){
    const filename='verification/matrix/'+row.screenshot,record=imageProof.screenshots?.find(s=>s.file===filename);
    try{check(!!record&&hash(await read(filename))===record.sha256,'Original main image changed: '+filename);}catch(error){errors.push(error.message);}
  }

  const replayFile=continuation.replayDirectory+'/cases.jsonl';
  const replayBytes=await read(replayFile),replayLines=replayBytes.toString('utf8').split('\n'),unfinishedReplayLine=replayLines.pop();
  const replays=replayLines.filter(Boolean).map(line=>JSON.parse(line));
  if(complete)check(!unfinishedReplayLine,'Replay JSONL has an unfinished record');
  check(replays.length<=33&&(!complete||replays.length===33),'Full33-case landscape replay is incomplete');
  if(report.replayCases)check(same(report.replayCases,replays),'Final replay array differs from persisted replay journal');
  const captureCheck=row=>{
    if(!row.screenshot)return;
    const attempts=row.captureAttempts??[];
    check(attempts.length>=1&&attempts.length<=2&&attempts.at(-1)?.passed===true,'Capture did not finish successfully: '+row.id);
    for(const [index,attempt]of attempts.entries()){
      check(attempt.attempt===index+1&&Number.isFinite(Date.parse(attempt.startedAt))&&Date.parse(attempt.startedAt)<=Date.now()+1000&&Number.isFinite(attempt.elapsedSeconds)&&attempt.elapsedSeconds>=0,'Capture timing evidence invalid: '+row.id);
      if(index<attempts.length-1)check(attempt.passed===false&&/Timeout/i.test(attempt.error??''),'Capture retried a non-timeout failure: '+row.id);
      if(index>0)check(Date.parse(attempt.startedAt)+2>=Date.parse(attempts[index-1].startedAt)+attempts[index-1].elapsedSeconds*1000,'Capture attempt timestamps overlap: '+row.id);
    }
    check(row.totalElapsedSeconds+0.01>=row.elapsedSeconds+(row.endProbe?.elapsedSeconds??0)+attempts.reduce((sum,a)=>sum+a.elapsedSeconds,0),'Capture durations do not fit recorded total time: '+row.id);
  };
  const imageName=row=>`${row.id}-${row.viewport.join('x')}-${row.configuration.environment}-${row.configuration.athlete}-${row.configuration.view}-${row.configuration.clip}.webp`;
  check(new Set(cases.filter(c=>c.screenshot).map(c=>c.screenshot)).size===cases.filter(c=>c.screenshot).length,'Main screenshots are aliased across cases');
  for(const row of cases)if(row.screenshot)check(row.screenshot===imageName(row),'Main image filename differs from case identity: '+row.id);
  check(new Set(replays.filter(c=>c.screenshot).map(c=>c.screenshot)).size===replays.filter(c=>c.screenshot).length,'Replay screenshots are aliased across cases');
  for(const [i,row]of replays.entries()){
    const originalRow=prefix[252+i];
    check(row.id===String(253+i).padStart(3,'0')&&row.replayOfId===row.id&&row.controllerSegment===2&&same(row.viewport,originalRow?.viewport)&&same(row.configuration,originalRow?.configuration),'Replay identity differs from the original landscape prefix');
    for(const error of inspectMatrixCase(row,{bundleBuiltAt:expectedPackage,minDwell:report.dwellSeconds,requireDiagnostics:true}).errors)errors.push('Replay '+error);
    captureCheck(row);
    if(['carve_left','ramp_jump','fall_roll'].includes(row.configuration.clip))check(typeof row.screenshot==='string','Prescribed replay image missing: '+row.id);
    if(row.screenshot){
      check(row.screenshot===path.basename(continuation.replayDirectory)+'/'+imageName(row),'Replay image filename differs from case identity: '+row.id);
      const file='verification/matrix/'+row.screenshot;
      check(local(file).startsWith(local(continuation.replayDirectory)+path.sep),'Replay image could overwrite original main evidence: '+row.id);
      try{const bytes=await read(file),size=webpSize(bytes);check(same(size,row.viewport),'Replay image dimensions differ from prescribed viewport: '+row.id);images.push({file,sha256:hash(bytes),bytes:bytes.length,width:size[0],height:size[1]});}catch(error){errors.push(error.message);}
    }
  }
  for(const row of cases.slice(285))captureCheck(row);
  const recovery=report.recoveryBaselines??[];
  if(replays.length||cases.length>285||complete){
    check(recovery.length===1,'Exactly one recovery baseline must accompany the continued landscape context');
    const baseline=recovery[0],s=baseline?.snapshot;
    check(baseline?.controllerSegment===2&&same(baseline.size,[844,390])&&same(s?.viewport,[844,390])&&same(s?.drawingBufferSize,[1266,585])&&s?.pixelRatio===1.5&&s?.bundleBuiltAt===expectedPackage,'Recovery baseline source, viewport or DPR differs');
    check(s?.bundleSources&&Object.entries(report.baselines[0].snapshot.bundleSources).every(([key,value])=>s.bundleSources[key]===value),'Recovery baseline module hashes differ');
    check(s?.loadedRecords===9&&s?.characterRoots===9&&s?.memory?.geometries<200&&s?.memory?.textures<64,'Recovery baseline resources exceed bounds');
    check(Date.parse(baseline?.observedAt)>=Date.parse(continuation.resumedAt),'Recovery baseline predates continuation');
  }
  check(journal.replayExpectedCount===33&&Number.isInteger(journal.replayCaseCount)&&Math.abs(journal.replayCaseCount-replays.length)<=1&&!journal.replayFailures?.length,'Replay progress journal is inconsistent or failed');
  if(complete)check(journal.replayCaseCount===33&&journal.replayLastId==='285'&&journal.pass===true,'Final journal does not confirm a complete passing replay');
  return{errors,segments:segments.length,replayCount:replays.length,replayExpected:33,replayCases:replays,images,preservedImages:oldImages.length};
}
