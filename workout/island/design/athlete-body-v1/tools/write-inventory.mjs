/** Original CC0-1.0. Enumerate every delivered file, its source and its license.
 * Run after the builders and browser capture: node tools/write-inventory.mjs
 * Verify without writing: node tools/write-inventory.mjs --check
 * No third-party package or network access is required.
 */
import {readFile, writeFile, readdir, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = '5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad';
const upstreamPath = 'workout/island/design/motion-fix-v12';
const sourceURL = (commit, path) => `https://github.com/roynaor-work/Bakasun/blob/${commit}/${path}`;
const canonicalSource = {
  id: 'geometry:canonical-player-01',
  license: 'CC0-1.0',
  ref: 'codex/motion-fix-v12', commit: sourceCommit,
  path: `${upstreamPath}/runtime/models/canonical-player-01.glb`,
  sha256: 'd6c8ac7d103a51fb7a48875641a88623173e466c05e87c52cf1cec2b6366b122',
  url: sourceURL(sourceCommit, `${upstreamPath}/runtime/models/canonical-player-01.glb`),
  parent: {
    ref: 'codex/soccer-motion-v11',
    commit: '0c6b5877bd81d69bf389b1e3831e5c49b5feb770',
    path: 'workout/island/design/soccer-motion-v11/runtime/clips/celebrate_player.glb',
    sha256: 'b723711ad5c46afca7ef3651e80fba2effcf439f91639418f2527433250ea85a',
    license: 'CC0-1.0',
  },
  description: 'Existing fictional CC0 athlete: MakeHuman hm08/system anatomy; original unbranded garments. Native canonical 18-joint skin. Body/atlas edits are authored for this package.',
};

async function walk(dir) {
  const out = [];
  for (const entry of (await readdir(dir, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.name === 'node_modules' || entry.name === '.git') throw new Error(`Unexpected dependency/repository directory in delivery: ${join(dir, entry.name)}`);
    const path = join(dir, entry.name);
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Symlinks are not delivered: ${path}`);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isFile()) out.push(relative(root, path).replaceAll('\\', '/'));
  }
  return out;
}

async function optionalJSON(path) {
  try { return JSON.parse(await readFile(join(root, path), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

const motions = await optionalJSON('motion-manifest.json') || await optionalJSON('runtime/motion-manifest.json');
const motionByPath = new Map((motions?.clips || []).map(clip => [clip.path, clip]));
const relativeInput = value => value?.replace(/^.*?workout\/island\/design\/motion-fix-v12\//, `${upstreamPath}/`);

function origin(path) {
  const motion = motionByPath.get(path);
  if (motion) return {
    id: `motion:${motion.id}`,
    description: 'CC0 repaired catalog animation, retargeted to the canonical bind without changing rotation samples. No source character geometry is copied into this motion file.',
    generator: 'tools/build-motion.mjs',
    catalog: motions.catalog,
    commit: motion.sourceCommit || motions.catalog.commit,
    path: relativeInput(motion.sourcePath),
    sha256: motion.sourceSha256,
    bytes: motion.sourceBytes,
    catalogEntrySha256: motion.sourceCatalogEntrySha256,
    sourceKey: motion.sourceKey,
    originalSource: motion.originalSource || motion.sourceOriginal || null,
    license: 'CC0-1.0',
  };
  if (path.startsWith('runtime/motion/') && path.endsWith('.glb')) throw new Error(`Motion file has no provenance in motion-manifest.json: ${path}`);
  if (path.startsWith('runtime/hair/') && path.endsWith('.glb')) return {
    id: 'original:hair', description: 'Original unbranded hairstyle geometry authored for this package; shared athlete atlas; no downloaded hair mesh or real-person reference.',
    generator: 'tools/build-hair.py', input: canonicalSource.id, license: 'CC0-1.0',
  };
  if (path.endsWith('.glb') || /(?:atlas|texture).*\.(?:png|webp|jpg)$/i.test(path)) return {
    id: 'derived:body-and-atlas', description: 'Edited CC0 canonical-player-01 anatomy/garments/UV atlas; original body profile, region colors and sportswear adaptations for this package.',
    input: canonicalSource, license: 'CC0-1.0',
  };
  if (/\.(?:png|webp|jpg|jpeg|svg|mp4|webm)$/i.test(path)) return {
    id: 'original:render', description: 'Original browser render or measurement visualization of this package. Displayed CC0 geometry and animations retain the sources recorded in the model and motion manifests.',
    inputs: ['runtime/', 'motion-manifest.json', 'preview.html', 'preview.mjs'], license: 'CC0-1.0',
  };
  if (path === 'motion-manifest.json' || path === 'runtime/motion-manifest.json') return {
    id: 'original:motion-provenance', description: 'Original manifest recording pinned repaired CC0 catalog inputs, per-clip SHA-256 values and retargeting measurements.',
    generator: 'tools/build-motion.mjs', catalog: motions?.catalog || null, license: 'CC0-1.0',
  };
  if (path.startsWith('tools/')) return {
    id: 'original:tool', description: 'Original authoring, packaging or verification code written for athlete-body-v1. External development dependencies are installed separately and are not redistributed.',
    license: 'CC0-1.0',
  };
  if (path === 'manifest.json' || path === 'LICENSES.md') return {
    id: 'original:inventory', description: 'Original per-file license/provenance inventory generated by tools/write-inventory.mjs.',
    generator: 'tools/write-inventory.mjs', license: 'CC0-1.0',
  };
  if (/^preview(?:\.|\/)/.test(path) || path.endsWith('.mjs') || path.endsWith('.css') || path.endsWith('.html')) return {
    id: 'original:viewer', description: 'Original standalone review interface and body/material/animation adapter authored for athlete-body-v1. Existing repository Three.js/GLTFLoader dependencies are referenced externally and not copied.',
    license: 'CC0-1.0',
  };
  return {
    id: 'original:documentation-or-measurement', description: 'Original metadata, documentation or measured verification result authored/generated for athlete-body-v1; upstream CC0 inputs are identified by the model and motion provenance.',
    license: 'CC0-1.0',
  };
}

const paths = [...new Set([...(await walk(root)), 'LICENSES.md', 'manifest.json'])].sort();
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
function sourceLabel(path, source) {
  if (source.id.startsWith('motion:')) return `[קטלוג מתוקן: ${escape(source.sourceKey)}](${sourceURL(source.commit, source.path)}) · \`tools/build-motion.mjs\`; SHA-256 ומקור קודם ב־\`motion-manifest.json\``;
  if (source.id === 'derived:body-and-atlas') return `[canonical-player-01 CC0](${canonicalSource.url}) · התאמות מקוריות בחבילה זו`;
  if (source.id === 'original:hair') return '`tools/build-hair.py` · גאומטריית שיער מקורית ואטלס הגוף המשותף';
  if (source.id === 'original:render') return 'צילום/תרשים מקורי של הדמויות והתנועות בחבילה זו; מקורות CC0 כמתועד להלן';
  if (source.generator) return `יצירה מקורית: \`${escape(source.generator)}\``;
  if (source.id === 'original:tool') return 'קוד הפקה/אימות מקורי שנכתב למשימה זו';
  if (source.id === 'original:viewer') return 'קוד ועיצוב תצוגה מקוריים שנכתבו למשימה זו';
  return 'תיעוד, מטא־דאטה או תוצר מדידה מקורי של משימה זו';
}

const licenseText = `# רישיונות ומקור לכל קובץ

כל הקבצים הכלולים בחבילת **athlete-body-v1** — תוכן מקורי חדש ונגזרות של נכסי CC0 מתועדים — מוקדשים לנחלת הכלל ברישיון [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחברים מוותרים על זכויות היוצרים והזכויות הנלוות. הדמויות בדויות; אין בחבילה מותגים, סמלי מועדונים או דמות של אדם אמיתי.

## מקורות הגאומטריה והאטלס

קלט הגוף הוא [canonical-player-01.glb](${canonicalSource.url}), מתוך [motion-fix-v12](${sourceURL(sourceCommit, `${upstreamPath}/LICENSES.md`)}) בענף \`codex/motion-fix-v12\`, קומיט \`${sourceCommit}\`, SHA-256 \`${canonicalSource.sha256}\`. אותו קלט משותף לכל מבני הגוף והענפים.

הקלט הופק, ללא שינוי הגאומטריה או קשירת השלד, מ־[soccer-motion-v11 / celebrate_player.glb](${sourceURL(canonicalSource.parent.commit, canonicalSource.parent.path)}), קומיט \`${canonicalSource.parent.commit}\`, SHA-256 \`${canonicalSource.parent.sha256}\`. [רישיון v11](${sourceURL(canonicalSource.parent.commit, 'workout/island/design/soccer-motion-v11/LICENSES.md')}) מתעד CC0 ואת שרשרת v10/v8. [רישיון v8](${sourceURL(canonicalSource.parent.commit, 'workout/island/design/soccer-motion-v8/LICENSE.md')}) מפנה לטופולוגיית MakeHuman hm08 ולנכסי המערכת CC0 המתועדים ב־[ASSETS של soccer-v7](${sourceURL(canonicalSource.parent.commit, 'workout/island/design/soccer-v7/characters/ASSETS.md')}). נכסי המערכת כפופים להבהרת הרישוי הרשמית של MakeHuman מ־2020; כותרות ישנות אינן משנות את רישיון CC0 של הנכסים. אין כאן קוד תוכנה של MakeHuman.

התאמות הגוף, צביעת האזורים, תלבושות הספורט, אטלס הצבע המשותף ושמונה סגנונות השיער עובדו או נוצרו למשימה זו. גאומטריית השיער נוצרה ב־\`tools/build-hair.py\` ללא נכס שיער חיצוני. האטלס, גוף המקור ושינוייו נשארים CC0.

## מקורות התנועה

כל קובץ ב־\`runtime/motion/\` נגזר מקליפ מותר ב־[קטלוג motion-fix-v12](${sourceURL(sourceCommit, `${upstreamPath}/runtime/catalog.json`)}), קומיט \`${sourceCommit}\`, ברישיון CC0. \`motion-manifest.json\` מכיל לכל קליפ את מפתח הקטלוג, נתיב המקור, SHA-256 של הקלט, פרטי המקור הקודם כשזמינים והמרת ההזזה לשלד הקנוני. \`tools/build-motion.mjs\` שומר את דגימות הסיבוב המקוריות; קובצי התנועה במסירה אינם כוללים גאומטריית שחקן מהקליפ המקורי. שמות והורות 18 העצמות נגזרים מחוזה \`CANON_BONES\` ב־\`workout/island/minigames/athletes-core.mjs\`.

## תלויות חיצוניות

ספריות Three.js, GLTFLoader ו־SkeletonUtils קיימות במאגר מחוץ לחבילה ומקושרות על ידי התצוגה בלבד. רישיון MIT שלהן נשמר: [הודעת Three.js הקיימת](../../vendor/LICENSE.three). הן אינן מועתקות לתיקייה זו ואינן נכללות בהצהרת CC0. כלים מותקנים חיצונית לצורך בנייה ואימות (לרבות glTF Transform, Khronos glTF Validator, Playwright, NumPy ו־Pillow) אינם קבצי מסירה ואינם משנים את רישיון תוצרי הנכסים. אין מפענח Draco, meshopt או רכיב WebAssembly בחבילה.

## רשימת כל הקבצים

הרשימה הבאה מונה כל קובץ בנפרד, לרבות דוח זה והמניפסט. \`manifest.json\` מכיל משקל ו־SHA-256 לכל קובץ מלבד עצמו, כדי להימנע מתלות גיבוב מעגלית. רענון: \`node tools/write-inventory.mjs\`; בדיקה ללא שינוי: \`node tools/write-inventory.mjs --check\`.

| קובץ | רישיון | מקור |
|---|---|---|
${paths.map(path => `| [${escape(path)}](<${path}>) | CC0-1.0 | ${sourceLabel(path, origin(path))} |`).join('\n')}
`;

const licenseBytes = Buffer.from(licenseText);
const files = [];
for (const path of paths) {
  if (path === 'manifest.json') continue;
  const bytes = path === 'LICENSES.md' ? licenseBytes : await readFile(join(root, path));
  files.push({path, bytes: bytes.byteLength, sha256: hash(bytes), license: 'CC0-1.0', source: origin(path)});
}
const manifestText = JSON.stringify({
  schemaVersion: 1,
  package: 'athlete-body-v1',
  license: 'CC0-1.0',
  generator: 'tools/write-inventory.mjs',
  fileCount: paths.length,
  checksummedFileCount: files.length,
  totalBytesExcludingManifest: files.reduce((total, file) => total + file.bytes, 0),
  integrity: {algorithm: 'SHA-256', excludes: ['manifest.json'], reason: 'The manifest cannot include its own checksum without circular self-reference. LICENSES.md and all other files are checksummed.'},
  self: {path: 'manifest.json', license: 'CC0-1.0', source: origin('manifest.json')},
  geometryInput: canonicalSource,
  motionCatalog: motions?.catalog || null,
  files,
}, null, 2) + '\n';

if (check) {
  const current = await Promise.all(['LICENSES.md', 'manifest.json'].map(path => readFile(join(root, path), 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))));
  if (current[0] !== licenseText || current[1] !== manifestText) throw new Error('Inventory is stale: run node tools/write-inventory.mjs after all outputs are finalized.');
  console.log(`Inventory verified: ${paths.length} files; ${files.length} SHA-256 values; every file has a CC0 license and source.`);
} else {
  await writeFile(join(root, 'LICENSES.md'), licenseText);
  await writeFile(join(root, 'manifest.json'), manifestText);
  console.log(`Inventory written: ${paths.length} files; ${files.length} checksums; ${files.reduce((total, file) => total + file.bytes, 0)} bytes excluding manifest.`);
}
