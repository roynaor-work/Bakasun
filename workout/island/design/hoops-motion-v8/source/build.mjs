#!/usr/bin/env node
/** Development-only, sequential asset pipeline. Runtime never imports this file. */
import { open, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildMotion } from './motion-author.mjs';
import { exportClips } from './export-glb.mjs';
import { auditMotion } from './audit-motion.mjs';
import { auditBodyClearance, bodyClearanceMarkdown } from './body-clearance.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lockPath = resolve(tmpdir(), 'hoops-motion-v8-' + hash(Buffer.from(root)).slice(0, 12) + '.lock');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch (error) { if (error.code === 'EEXIST') throw new Error(`An asset build is already running: ${lockPath}`); throw error; }
try {
  const started = new Date().toISOString();
  const sources = ['source/motion-author.mjs', 'source/export-glb.mjs', 'source/preview-model.mjs'];
  const before = new Map(await Promise.all(sources.map(async path => [path, hash(await readFile(resolve(root, path)))])));
  await buildMotion();
  const clips = await exportClips({ rebuildModel: process.argv.includes('--rebuild-model') });
  const motion = await auditMotion();
  if (!motion.pass) throw new Error('Canonical motion audit failed; see verification/MOTION.md');
  const body = await auditBodyClearance();
  await writeFile(resolve(root, 'verification/BODY.md'), bodyClearanceMarkdown(body));
  if (body.some(clip => !clip.passed)) throw new Error('Actual skinned body clearance failed; see verification/BODY.md');
  for (const [path, digest] of before) if (hash(await readFile(resolve(root, path))) !== digest) throw new Error(`Source edited during build: ${path}`);
  const model = await readFile(resolve(root, 'source/preview-model.glb'));
  const lines = ['# בניית הנכסים', '', `PASS. התחלה ${started}; סיום ${new Date().toISOString()}.`, '',
    'השלבים רצים ברצף תחת נעילת תהליך: חיבור תנועה → JSON דחוס → GLB → ביקורת FK → בדיקת כדור מול משולשי גוף. מקורות שנערכו באמצע הבנייה גורמים לכישלון. אין לערוך או לרנדר את הנכסים במקביל לבנייה.', '',
    `מודל תצוגה: ${model.length} בתים, SHA-256 \`${hash(model)}\`.`, '',
    '| מקור | SHA-256 |', '|---|---|', ...[...before].map(([path, digest]) => `| ${path} | \`${digest}\` |`), '',
    '| קליפ | בתים GLB | מפתחות | ערוצים | SHA-256 של GLB | SHA-256 של gzip |', '|---|---:|---:|---:|---|---|'];
  for (const clip of clips) {
    const [glb, gzip] = await Promise.all(['runtime/clips/' + clip.id + '.glb', 'runtime/keyframes/' + clip.id + '.json.gz'].map(path => readFile(resolve(root, path))));
    lines.push(`| ${clip.id} | ${glb.length} | ${clip.keys} | ${clip.channels} | \`${hash(glb)}\` | \`${hash(gzip)}\` |`);
  }
  await writeFile(resolve(root, 'verification/BUILD.md'), lines.join('\n') + '\n');
  console.log(`PASS sequential build: ${clips.length} clips; all contact/body audits passed`);
} finally { await lock.close(); await unlink(lockPath); }
