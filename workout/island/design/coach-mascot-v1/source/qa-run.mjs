// Run the pinned, unmodified upstream motion-qa-v1 tool on the delivered GLB.
// The pinned source is local; execution and temporary outputs are outside the repository.
import {mkdtemp,mkdir,writeFile,readFile,symlink,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(dir,'..');
const files={
  'run.mjs':'c8d88c91cf19b07bbe896c0587e1668f2c7b87dfe695f3ce5639f04afaa75056',
  'glb.mjs':'0e5763ad87754a94522e631036fa8c20c881bb9ff00e676087905f82c07400cc',
  'metrics.mjs':'bff64c9ff97798b466b4193962594d1554f684f3f19fa931d310d7432260fed7',
  'report.mjs':'14e0b4d2bf3f5493c7a736d60e735c517b27afcc4b3a57e533ed7ea27fb34def',
  'sheets.mjs':'968a4d80c386ba55e7930c1ff9e921c09bb9b4584dbf7821e1c3d354d7652ca7',
  'licenses.mjs':'2e6e998b72f663b140da248f2a53bbff3ea040b8e7b88eabac2fcc0f99249411'
};
const temp=await mkdtemp(path.join(tmpdir(),'coach-motion-qa-')), tool=path.join(temp,'motion-qa-v1');
await mkdir(tool);
for(const [name,expected] of Object.entries(files)) {
  const bytes=await readFile(path.join(dir,'qa-upstream',name)); const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==expected)throw Error(`${name}: checksum mismatch`);
  await writeFile(path.join(tool,name),bytes);
}
// Original sampler imports the existing, local three.js through its original relative path.
await mkdir(path.join(temp,'soccer-motion-v8','runtime'),{recursive:true});
await symlink(path.join(dir,'vendor'),path.join(temp,'soccer-motion-v8','runtime/vendor'));
const output=path.join(temp,'output');
const result=spawnSync(process.execPath,['--no-warnings','--experimental-loader',path.join(dir,'qa-loader.mjs'),path.join(tool,'run.mjs'),'--out',output,'--fps','60'],{env:{...process.env,COACH_QA_ROOT:tool},encoding:'utf8'});
if(result.status!==0)throw Error(`motion-qa-v1 failed\n${result.stdout}\n${result.stderr}`);
const report=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
await mkdir(path.join(root,'verification'),{recursive:true});
await copyFile(path.join(output,'report.json'),path.join(root,'verification','motion-qa.json'));
const clips=report.libraries.flatMap(l=>l.clips);
const adapterFiles={};
for(const name of ['qa-run.mjs','qa-loader.mjs','qa-sources.mjs','qa-input.json']) adapterFiles[`source/${name}`]=createHash('sha256').update(await readFile(path.join(dir,name))).digest('hex');
const summary={upstreamCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24',upstreamFiles:files,adapterFiles,fps:report.fps,model:report.libraries[0].source.inputs[0],clips:clips.length,minimum:Math.min(...clips.map(c=>c.score)),average:report.libraries[0].summary.average,minCoverage:Math.min(...clips.map(c=>c.coverage)),insufficientData:clips.flatMap(c=>Object.entries(c.metrics).filter(([,m])=>m.status==='insufficient-data').map(([metric])=>({clip:c.id,metric}))),limitations:report.limitations};
await writeFile(path.join(root,'verification','motion-qa-provenance.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
