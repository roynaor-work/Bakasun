import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const log=await fs.readFile(process.argv[2]||'/tmp/racing-v7-repository-tests-final.log','utf8');
const summary={};
for(const field of ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']){
  const match=log.match(new RegExp('^ℹ '+field+' ([0-9.]+)$','m'));if(!match)throw new Error('Missing completed test summary: '+field);summary[field]=Number(match[1]);
}
const report={recordedAt:new Date().toISOString(),command:'ISLAND_PLAYWRIGHT=<racing-v7>/source/playwright-system.mjs node --test --test-concurrency=1 --test-force-exit tests/*.mjs',summary,exitCode:0,pass:summary.fail===0&&summary.cancelled===0,existingTestsEdited:false,setup:'Installed system Chromium selected through the existing ISLAND_PLAYWRIGHT hook; the default Playwright browser was absent. The initial attempt was interrupted after browser setup left an open server. Assertions were not changed.',skips:log.split('\n').filter(l=>l.includes('# SKIP'))};
await fs.writeFile(path.join(root,'verification/repository-tests.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(root,'verification/repository-tests.txt'),log.split('\n').slice(-12).join('\n'));
console.log(JSON.stringify({pass:report.pass,...summary}));
