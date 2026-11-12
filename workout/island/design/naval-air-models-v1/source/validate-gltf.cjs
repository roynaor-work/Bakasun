// Optional Khronos validation; development dependency only. CC0-1.0.
// GLTF_VALIDATOR_MODULE=/absolute/path/to/gltf-validator node source/validate-gltf.cjs
const fs = require('node:fs');
const path = require('node:path');
const validator = require(process.env.GLTF_VALIDATOR_MODULE || 'gltf-validator');
const root = path.resolve(__dirname, '..');
(async () => {
  for (const name of ['plane', 'helicopter']) {
    const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(root, name + '.glb'))), { uri: name + '.glb', maxIssues: 100 });
    fs.writeFileSync(path.join(root, 'verification', name + '-gltf-validator.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(name, report.issues);
    if (report.issues.numErrors || report.issues.numWarnings) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
