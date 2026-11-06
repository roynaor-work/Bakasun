#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIP_IDS } from '../runtime/catalog.mjs';
const require = createRequire(resolve(process.env.HOOPS_VALIDATOR_DIR || '/tmp/hoops-motion-v8-validator', 'package.json'));
const validator = require('gltf-validator');
const root = fileURLToPath(new URL('../', import.meta.url));
const rows = [];
for (const id of CLIP_IDS) {
  const bytes = await readFile(resolve(root, 'runtime/clips', id + '.glb'));
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: id + '.glb', maxIssues: 2000 });
  rows.push({ id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), version: result.validatorVersion, ...result.issues });
  console.log(`${result.issues.numErrors || result.issues.numWarnings ? 'FAIL' : 'PASS'} ${id}: ${result.issues.numErrors} errors, ${result.issues.numWarnings} warnings, ${result.issues.numInfos} information messages`);
}
const pass = rows.every(row => row.numErrors === 0 && row.numWarnings === 0);
const report = `# בדיקת פורמט glTF\n\nתוצאה: **${pass ? 'PASS' : 'FAIL'}**. Khronos glTF Validator ${rows[0]?.version || '2.0.0-dev.3.10'}, כל ${rows.length} קובצי ה־GLB שנמסרים.\n\n` +
  `| קליפ | בתים | שגיאות | אזהרות | הודעות מידע | SHA-256 |\n|---|---:|---:|---:|---:|---|\n` +
  rows.map(row => `| ${row.id} | ${row.bytes} | ${row.numErrors} | ${row.numWarnings} | ${row.numInfos} | \`${row.sha256}\` |`).join('\n') +
  `\n\nהבודק מדווח הודעת מידע על KHR_draco_mesh_compression, שאינו מפוענח על ידו, ועל משאבים שעשויים להיות לא בשימוש. מידע זה אינו שגיאה או אזהרה. פענוח Draco בפועל, משקלי עור, טקסטורה בדפדפן ומסלולי אנימציה נבדקים בנפרד ב־node --test וברנדרי Chromium.\n\n` +
  `שחזור: node source/validate-gltf.mjs. כלי הפיתוח מותקן מחוץ לחבילה; ראו source/README.md.\n` +
  rows.filter(row => row.numErrors || row.numWarnings).map(row => `\n${row.id}:\n\n${row.messages.filter(m => m.severity < 2).map(m => `- ${m.code} ${m.pointer}: ${m.message}`).join('\n')}\n`).join('');
await writeFile(resolve(root, 'verification/GLTF.md'), report);
process.exitCode = pass ? 0 : 1;
