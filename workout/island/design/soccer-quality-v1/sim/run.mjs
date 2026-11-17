/** Reproduce Node evidence. Browser commands are separate to isolate frame timing. */
import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const source=process.env.SOCCER_QUALITY_SOURCE,baseline=process.env.SOCCER_QUALITY_BASE;
if(!source||!baseline)throw Error('Set SOCCER_QUALITY_SOURCE to a patched copy and SOCCER_QUALITY_BASE to the clean baseline');
const run=(args,output)=>{
  const result=spawnSync(process.execPath,args,{env:process.env,encoding:'utf8',maxBuffer:32*1024*1024});
  if(output)writeFileSync(resolve(packageRoot,'sim',output),result.stdout);
  else process.stdout.write(result.stdout||'');
  process.stderr.write(result.stderr||'');
  if(result.status!==0)throw Error(`Failed (${result.status}): ${args.join(' ')}`);
};
const tests=readdirSync(resolve(packageRoot,'tests')).filter(p=>p.endsWith('.test.mjs')).sort().map(p=>resolve(packageRoot,'tests',p));
run(['--test',...tests]);
run([resolve(packageRoot,'sim/ball-measure.mjs'),baseline],'ball-before.json');
run([resolve(packageRoot,'sim/ball-measure.mjs'),source,'--enabled'],'ball-after.json');
run([resolve(packageRoot,'sim/ball-match-bench.mjs'),source,'120'],'ball-match-bench.json');
run([resolve(packageRoot,'sim/keeper-run.mjs')]);
run([resolve(packageRoot,'sim/run-team.mjs')]);
run([resolve(packageRoot,'sim/all-features-bot.mjs')]);
