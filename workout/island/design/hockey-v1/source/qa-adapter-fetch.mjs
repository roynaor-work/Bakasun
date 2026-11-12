// SPDX-License-Identifier: CC0-1.0
// מקור: כלי שחזור מקורי לחבילת ההוקי; כלי QA עצמו נקרא מקומיט נעול ונשאר מחוץ למאגר.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const commit = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
export const repository = 'roynaor-work/Bakasun';
export const sourcePath = 'workout/island/design/motion-qa-v1';
export const hashes = {
  'glb.mjs':'0e5763ad87754a94522e631036fa8c20c881bb9ff00e676087905f82c07400cc',
  'licenses.mjs':'2e6e998b72f663b140da248f2a53bbff3ea040b8e7b88eabac2fcc0f99249411',
  'metrics.mjs':'bff64c9ff97798b466b4193962594d1554f684f3f19fa931d310d7432260fed7',
  'report.mjs':'14e0b4d2bf3f5493c7a736d60e735c517b27afcc4b3a57e533ed7ea27fb34def',
  'run.mjs':'c8d88c91cf19b07bbe896c0587e1668f2c7b87dfe695f3ce5639f04afaa75056',
  'sheets.mjs':'968a4d80c386ba55e7930c1ff9e921c09bb9b4584dbf7821e1c3d354d7652ca7',
  'sources.json':'3149b7707af749ae08654881b9c02854aab164f952b059481acce1d3f9dd3684',
  'sources.mjs':'3ac6509fee2767da7778bd5f7806b726fb6de9bc23cdb4717c90aab7d8789fb0',
};
export async function fetchTool(directory = '/tmp/hockey-qa') {
  await mkdir(directory, {recursive:true});
  for (const [name, expected] of Object.entries(hashes)) {
    const target = path.join(directory, name);
    let bytes;
    try {bytes = await readFile(target);} catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
      const response = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/contents/${sourcePath}/${name}?ref=${commit}`], {encoding:'utf8', maxBuffer:4e6}));
      bytes = Buffer.from(response.content, 'base64');
      if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error(`קובץ המקור אינו תואם לחתימה: ${name}`);
      await writeFile(target, bytes);
    }
  }
  return path.resolve(directory);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(await fetchTool(process.argv[2]));
}
