// Post-run evidence check; never changes animations, viewer code or test limits.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const island = resolve(here, '../../../..');
const repo = resolve(island, '../..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

export function compareFixtureSources(provenance, report) {
  const required = [
    'design/viewer/viewer.html', 'design/viewer/viewer.js', 'design/viewer/animation.js',
    'design/viewer/retarget.js', 'design/viewer/retarget-map.json', 'design/viewer/checks.js',
    'design/viewer/test-viewer.mjs', 'design/viewer/draco/DRACOLoader.js',
    'design/viewer/draco/draco_wasm_wrapper.js', 'design/viewer/draco/draco_decoder.wasm',
    'design/characters/rig.json',
    ...['soccer-player', 'goalkeeper', 'basketball-player', 'skier'].map(name => `design/characters/${name}.glb`),
    ...['soccer', 'hoops', 'alpine'].map(name => `design/motion/${name}.json`),
  ];
  const comparisons = [...new Set([...required, ...Object.keys(report.sourceSha256 || {})])].map(path => {
    const expected = path === 'design/motion/soccer.json' ? provenance.fixture.mergedSoccerSha256 : provenance.originalSourceSha256[path];
    const actual = report.sourceSha256?.[path];
    return { path, expected: expected || null, actual: actual || null, pass: Boolean(expected && actual && expected === actual), source: path === 'design/motion/soccer.json' ? 'isolated merged fixture' : 'unchanged repository input' };
  });
  return { pass: comparisons.every(item => item.pass), comparisons };
}

async function verify() {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : here;
  const provenance = await json(resolve(out, 'provenance.json'));
  const checks = { originalInputs: [], authoredPacks: [], runnerReports: [], contactSheetInputs: [] };
  for (const [path, expected] of Object.entries(provenance.originalSourceSha256)) {
    const actual = sha256(await readFile(resolve(island, path)));
    checks.originalInputs.push({ path, expected, actual, pass: expected === actual });
  }
  for (const pack of provenance.packs) {
    const actual = sha256(await readFile(resolve(repo, pack.path)));
    checks.authoredPacks.push({ path: pack.path, expected: pack.sha256, actual, pass: pack.sha256 === actual });
  }
  for (const character of ['soccer-player', 'goalkeeper']) {
    const path = resolve(out, character, 'report.json');
    const report = await json(path);
    report.fixtureSourceIntegrity = compareFixtureSources(provenance, report);
    const pass = report.pass && report.fixtureSourceIntegrity.pass;
    checks.runnerReports.push({ character, pass, fixtureSourceIntegrity: report.fixtureSourceIntegrity, casePasses: report.cases.map(item => ({ viewport: item.viewport, pass: item.pass, authoredCoverage: item.authoredCoverage })) });
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  }
  const sheetPath = resolve(out, 'contact-sheets/contact-sheets.json');
  const sheets = await json(sheetPath);
  for (const sheet of sheets.packs) {
    const pack = provenance.packs.find(pack => pack.path.endsWith(`/${sheet.file}`));
    checks.contactSheetInputs.push({ file: sheet.file, expected: pack?.sha256 || null, actual: sheet.sha256, pass: Boolean(pack && pack.sha256 === sheet.sha256) });
  }
  sheets.acceptanceProvenance = '../provenance.json';
  sheets.viewerSourceSha256 = Object.fromEntries(['design/viewer/viewer.html', 'design/viewer/viewer.js', 'design/viewer/animation.js', 'design/viewer/retarget.js', 'design/viewer/checks.js', 'design/viewer/retarget-map.json', 'design/characters/rig.json', 'design/motion/soccer.json', 'design/characters/soccer-player.glb', 'design/characters/goalkeeper.glb'].map(path => [path, provenance.originalSourceSha256[path]]));
  sheets.sourceNotes = 'Contact sheets stage baseline soccer plus authored states for direct clip selection. The acceptance fixture also includes authored transitions; source hashes and acceptance results are linked separately.';
  await writeFile(sheetPath, JSON.stringify(sheets, null, 2) + '\n');
  const result = {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    method: 'Post-run hash comparison of every original staged input, current authored packs, unchanged-runner source ledgers and contact-sheet pack ledgers. The staged soccer hash is compared with the merged fixture hash; all other runner evidence hashes must equal original repository input hashes.',
    checks, acceptancePass: provenance.pass,
    pass: provenance.pass && Object.values(checks).every(items => items.length && items.every(item => item.pass)),
  };
  await writeFile(resolve(out, 'evidence-integrity.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`${result.pass ? 'PASS' : 'FAIL'} evidence integrity: ${checks.originalInputs.length} original inputs, ${checks.authoredPacks.length} authored packs, ${checks.runnerReports.length} runner ledgers, ${checks.contactSheetInputs.length} visual ledgers`);
  process.exitCode = result.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verify();
