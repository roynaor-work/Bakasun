#!/usr/bin/env node
/** Measured session ledger. A preflight alone is not a completed review round. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectedCandidateFrames} from './review-frames.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const startedAt='2026-11-04T20:09:35+00:00';
const observedAt=new Date().toISOString();
const exists=async p=>!!(await fs.stat(path.join(root,p)).catch(()=>null));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8').catch(()=>'null'));
const rounds=[];
for(const n of (await fs.readdir(path.join(root,'iterations'))).filter(n=>/^\d{2}$/.test(n)).sort()){
  const prefix='iterations/'+n;
  const selected=await selectedCandidateFrames(root,n);
  const metadata=await read(prefix+'/capture.json')||await read(prefix+'/roster/capture.json')||await read(prefix+'/preflight/roster/capture.json')||selected[0]?.metadata;
  const requiredCoreFrames=[];
  for(const view of ['face','body'])for(const size of ['390x844','844x390']){
    const options=[prefix+'/'+view+'-'+size+'.png',prefix+'/roster/player-01-'+view+'-'+size+'.webp',prefix+'/preflight/roster/player-01-'+(view==='face'?'face-front':'body-near')+'-'+size+'.png'];
    const matches=await Promise.all(options.map(exists));requiredCoreFrames.push({view,size,path:matches.includes(true)?options[matches.indexOf(true)]:selected.find(f=>f.id==='player-01'&&f.view===view&&f.size===size)?.file||null});
  }
  const files=await fs.readdir(path.join(root,prefix));
  const roster=await fs.readdir(path.join(root,prefix,'roster')).catch(()=>[]),preflightRoster=await fs.readdir(path.join(root,prefix,'preflight/roster')).catch(()=>[]);
  const coreFrameSetPresent=requiredCoreFrames.every(f=>f.path);
  const reviewPresent=await exists(prefix+'/REVIEW.md');
  rounds.push({round:n,renderScope:selected.length?(Number(n)<=21?'historical candidate with later actual core supplements':'staged candidate with paired real renders'):preflightRoster.length?'full-roster staged candidate':'actual packaged viewer',requiredCoreFrames,coreFrameSetPresent,reviewPresent,completeReviewRound:coreFrameSetPresent&&reviewPresent,mainImages:files.filter(f=>/\.(png|webp)$/.test(f)).length,rosterFrames:roster.filter(f=>/\.(png|webp)$/.test(f)).length,preflightRosterFrames:preflightRoster.filter(f=>/\.(png|webp)$/.test(f)).length,startedAt:metadata?.startedAt||null,finishedAt:metadata?.finishedAt||metadata?.generatedAt||null,deviceScaleFactor:metadata?.deviceScaleFactor||null,runtimeSha256:metadata?.runtimeSha256||null});
}
const completeReviewRounds=rounds.filter(r=>r.completeReviewRound).length;
const closed=process.argv.includes('--close');
if(closed&&completeReviewRounds<6)throw Error('Cannot close before six complete phone review sets');
const report={kind:'measured-authoring-session',startedAt,observedAt,closedAt:closed?observedAt:null,elapsedSeconds:(Date.parse(observedAt)-Date.parse(startedAt))/1000,completeReviewRounds,initialSequentialMainRounds:rounds.filter(r=>Number(r.round)<=15&&r.completeReviewRound).length,historicalSupplementInterpretation:'Rounds16–21 include later real core renders of their immutable historical candidates; these are not claimed as newly rebuilt sequential production rounds. The initial15 main rounds preserve their original chronological capture/review evidence.',minimumSixReached:completeReviewRounds>=6,status:closed?'authoring session closed; acceptance and limitations are recorded separately in REPORT.md':'in-progress; visual and combined-controller acceptance remain open',rounds};
await fs.writeFile(path.join(root,'verification/work-session.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({elapsedHours:report.elapsedSeconds/3600,completeReviewRounds,status:report.status}));
