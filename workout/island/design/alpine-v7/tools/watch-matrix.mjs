/** Bounded read-only progress watch; no browser, GPU, network or file writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const pack=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(pack,'verification/matrix');
const args=process.argv.slice(2),index=args.indexOf('--wait');
const hold=args.includes('--hold');
const inline=args.find(arg=>/^--wait(?:=)?\d/.test(arg));
const requested=Number(index<0?(inline?.replace(/^--wait=?/,'')??0):args[index+1]);
const waitSeconds=Number.isFinite(requested)?Math.min(50,Math.max(0,requested)):0;

async function maybeRead(file){
  try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function maybeJSON(file,readErrors){
  const text=await maybeRead(file);if(text===null)return null;
  try{return JSON.parse(text);}catch(error){readErrors.push(path.basename(file)+': '+error.message);return null;}
}
async function state(){
  const readErrors=[];
  const journal=await maybeJSON(path.join(folder,'run-state.json'),readErrors);
  const source=await maybeRead(path.join(folder,'cases.jsonl'));
  const lines=(source??'').split('\n');lines.pop();
  const cases=[];
  for(const line of lines){if(!line)continue;try{cases.push(JSON.parse(line));}catch(error){readErrors.push('cases.jsonl: '+error.message);}}
  const pidText=await maybeRead(path.join(folder,'process-id'));
  const parsed=Number(pidText?.trim()),pid=Number.isInteger(parsed)&&parsed>1?parsed:null;
  let processAlive=false,processMatches=false;
  if(pid){
    try{process.kill(pid,0);processAlive=true;}catch(error){if(error.code==='EPERM')processAlive=true;else if(error.code!=='ESRCH')throw error;}
    if(processAlive){
      const command=await maybeRead(`/proc/${pid}/cmdline`);
      processMatches=!!command?.split('\0').some(arg=>arg.endsWith('/matrix-soak.mjs')||arg==='matrix-soak.mjs');
    }
  }
  const finalText=await maybeRead(path.join(pack,'verification/matrix-soak.json'));
  let final=null;
  if(finalText!==null){try{final=JSON.parse(finalText);}catch(error){readErrors.push('matrix-soak.json: '+error.message);}}
  const finalCurrent=!!final&&!!journal&&final.startedAt===journal.startedAt&&final.sourceHTMLSHA256===journal.sourceHTMLSHA256;
  const deadWithoutFinal=!!journal&&!!pid&&(!processAlive||!processMatches)&&!finalCurrent;
  const failures=cases.filter(c=>c.playbackPass!==true||c.resourcesPass!==true);
  const replayFailures=journal?.replayFailures??[];
  const last=cases.at(-1),errorCount=journal?.errors?.length??0,externalRequestCount=journal?.externalRequests?.length??0;
  return {
    observedAt:new Date().toISOString(),
    status:finalCurrent?(final.pass===true?'passed':'failed'):deadWithoutFinal?'dead without final':journal?'running':'waiting',
    completed:cases.length,expected:journal?.expectedCases??504,
    journalCompleted:journal?.caseCount??null,
    journalLag:journal?cases.length-journal.caseCount:null,
    startedAt:journal?.startedAt??null,
    secondsSinceJournalUpdate:journal?Math.max(0,(Date.now()-Date.parse(journal.updatedAt))/1000):null,
    lastId:last?.id??null,lastConfiguration:last?.configuration??null,lastViewport:last?.viewport??null,
    phase:(journal?.replayCaseCount??0)<(journal?.replayExpectedCount??0)?'replay':'main',
    replayCompleted:journal?.replayCaseCount??0,replayExpected:journal?.replayExpectedCount??0,replayLastId:journal?.replayLastId??null,
    failureCount:failures.length+replayFailures.length,failures:[...failures.map(c=>c.id),...replayFailures.map(id=>'replay:'+id)].slice(0,10),
    replayFailureCount:replayFailures.length,
    errorCount,externalRequestCount,pid,processAlive,processMatches,deadWithoutFinal,
    finalExists:finalText!==null,finalCurrent,finalPass:finalCurrent?final.pass:null,readErrors,
  };
}
const initial=await state(),deadline=Date.now()+waitSeconds*1000;
let current=initial;
while(waitSeconds>0&&Date.now()<deadline&&!current.deadWithoutFinal&&!current.finalCurrent&&!current.failureCount&&!current.errorCount&&!current.externalRequestCount){
  await new Promise(resolve=>setTimeout(resolve,Math.min(1000,deadline-Date.now())));
  current=await state();
  if(!hold&&(current.completed!==initial.completed||current.replayCompleted!==initial.replayCompleted))break;
}
console.log(JSON.stringify(current));
if(current.deadWithoutFinal||current.failureCount||current.errorCount||current.externalRequestCount||current.finalCurrent&&current.finalPass!==true)process.exitCode=1;
