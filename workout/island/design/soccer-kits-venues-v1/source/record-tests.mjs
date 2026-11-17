// Usage: node source/record-tests.mjs /tmp/actual-test-log EXIT_CODE
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {writeJSON,sha} from './common.mjs';
const [file,code]=process.argv.slice(2);
assert.ok(file&&/^\d+$/.test(code||''),'Pass the real log and completed process exit code.');
const bytes=await fs.readFile(file),log=bytes.toString(),summary={};
for(const m of log.matchAll(/^[ℹ#]\s+(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)\s*$/gm))summary[m[1]]=Number(m[2]);
assert.ok(Number.isFinite(summary.tests)&&Number.isFinite(summary.fail),'Test process has not produced a complete summary.');
const passed=Number(code)===0&&summary.fail===0&&summary.cancelled===0;
await writeJSON('verification/repository.json',{schemaVersion:1,command:'npm test',exitCode:Number(code),passed,
  node:process.versions.node,summary,logBytes:bytes.length,logSha256:sha(bytes),
  environment:'PLAYWRIGHT_BROWSERS_PATH=/tmp/soccer-kits-browser-cache; expected browser binaries in that temporary cache point to the installed /usr/bin/chromium.',
  setupNote:'The initial run found no bundled Playwright browser and left a pre-existing test server open. That run was stopped; the full suite was rerun with the temporary browser mapping. No repository configuration was edited.',
});
console.log(JSON.stringify({passed,...summary}));
if(!passed)process.exitCode=1;
