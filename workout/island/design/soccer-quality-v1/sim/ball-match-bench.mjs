// Existing production bot, fixed seeds: node ball-match-bench.mjs SOURCE_ROOT [runs=120]
// The same patched engine runs with these two features off/on. This records real
// possession outcomes and interceptions in addition to the helper calibration.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceRoot=resolve(process.argv[2]||process.env.SOCCER_QUALITY_SOURCE||'.');
const runs=Math.max(1,Number(process.argv[3])||120),baseSeed=1400;
const {loadConfig,runBench,summarize}=await import(pathToFileURL(resolve(sourceRoot,'workout/island/tools/soccer-pass-bench.mjs')).href);
const config=await loadConfig();
const measure=enabled=>summarize(runBench({...config,quality:{loft:enabled,passing:enabled}},{runs,baseSeed,scenarios:['clean','live'],kinds:['tap','short']}));
console.log(JSON.stringify({sourceRoot,runsPerScenario:runs,baseSeed,before:measure(false),after:measure(true)},null,2));
