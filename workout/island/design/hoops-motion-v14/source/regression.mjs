// SPDX-License-Identifier: CC0-1.0
// Record the existing repository suite without changing its tests or settings.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),repo=fileURLToPath(new URL('../../../../../',import.meta.url));
let logPath=process.argv[2],exitCode;
if(!logPath){
 const env={...process.env},systemChromium=env.CHROMIUM_PATH??'/usr/lib/chromium/chromium';
 // The existing Royiki test calls chromium.launch without executablePath. Give
 // its normal Playwright lookup the installed system browser in a temporary
 // cache; repository tests and their launch options remain unchanged.
 if(!env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(systemChromium)){
  env.PLAYWRIGHT_BROWSERS_PATH=await mkdtemp(path.join(tmpdir(),'hoops-v14-browsers-'));
  const setup=`import{mkdir,symlink}from'node:fs/promises';import path from'node:path';import{islandChromium}from${JSON.stringify(new URL('../../../../../tests/helpers/island-browser.mjs',import.meta.url).href)};const c=await islandChromium();const p=c.executablePath();const h=p.replace(/chromium-(\\d+)/,'chromium_headless_shell-$1').replace('/chrome-linux64/chrome','/chrome-headless-shell-linux64/chrome-headless-shell');for(const f of[p,h]){await mkdir(path.dirname(f),{recursive:true});await symlink(${JSON.stringify(systemChromium)},f);}`;
  const setupResult=spawnSync(process.execPath,['--input-type=module','-e',setup],{cwd:repo,env,encoding:'utf8'});
  if(setupResult.status!==0)throw Error('Could not configure existing system Chromium: '+setupResult.stderr);
 }
 const out=spawnSync('npm',['test'],{cwd:repo,env,encoding:'utf8',maxBuffer:64*1024*1024});
 if(out.error)throw out.error;exitCode=out.status;
 const temp=await mkdtemp(path.join(tmpdir(),'hoops-v14-regression-'));logPath=path.join(temp,'npm-test.log');
 await writeFile(logPath,out.stdout+'\n'+out.stderr);
}
const bytes=await readFile(logPath),log=bytes.toString('utf8').replace(/\x1b\[[0-9;]*m/g,'');
const fields={};
for(const match of log.matchAll(/^(?:ℹ|#)\s+(tests|suites|pass|fail|cancelled|skipped|duration_ms)\s+([0-9.]+)/gm))fields[match[1]]=Number(match[2]);
if(!Number.isFinite(fields.tests)||!Number.isFinite(fields.fail)||!Number.isFinite(fields.pass))throw Error('Suite log has no completion summary.');
const passed=(exitCode===undefined||exitCode===0)&&fields.fail===0&&(fields.cancelled??0)===0;
const failures=[...new Set([...log.matchAll(/^✖\s+(.+)$/gm)].map(m=>m[1]).filter(s=>s!=='failing tests:'))];
const result={schemaVersion:1,command:'npm test',baselineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),testFilesChanged:false,tests:fields.tests,suites:fields.suites,passedTests:fields.pass,failedTests:fields.fail,skippedTests:fields.skipped??0,cancelledTests:fields.cancelled??0,durationMilliseconds:fields.duration_ms,logSha256:createHash('sha256').update(bytes).digest('hex'),failures,passed};
if(process.argv[3]){
 const rerunBytes=await readFile(process.argv[3]),rerun=rerunBytes.toString('utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const count=key=>Number([...rerun.matchAll(new RegExp('^(?:ℹ|#)\\s+'+key+'\\s+([0-9.]+)','gm'))].at(-1)?.[1]);
 const expected='exercise screen shows the royiki animation, counts reps, falls back and the style choice persists';
 if(fields.fail!==1||(fields.cancelled??0)!==0||failures.length!==1||!failures[0].startsWith(expected)||count('fail')!==0||count('pass')!==5||!rerun.includes('✔ '+expected))throw Error('Targeted rerun does not account for the original suite failure.');
 result.initialSuite={passedTests:fields.pass,failedTests:fields.fail,skippedTests:fields.skipped,failures};
 result.rerun={command:'PLAYWRIGHT_BROWSERS_PATH=<temporary cache linked to installed /usr/lib/chromium/chromium> node --test tests/workout-royiki.test.mjs',tests:count('tests'),passedTests:count('pass'),failedTests:count('fail'),logSha256:createHash('sha256').update(rerunBytes).digest('hex'),reason:'The default Playwright browser binary was absent. The existing test opens its HTTP server before launch and only enters try/finally after launch; failed launch leaves that server open. The stalled worker was terminated after diagnosis; the unchanged file was rerun using installed system Chromium.'};
 result.passedTests++;result.failedTests=0;result.failures=[];result.passed=true;
}
await writeFile(new URL('verification/regression.json',base),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
