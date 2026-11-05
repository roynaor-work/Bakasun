/** Phone-sized action review of the actual local viewer, 20/50/80% per clip. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputName = process.env.MOTION_REVIEW_DIR || 'motion-review';
if (!/^motion-[a-z0-9-]+$/.test(outputName)) throw Error('Review output must remain in source/motion-*');
const output = path.join(root, 'source', outputName);
await fs.mkdir(path.join(output, 'captures'), { recursive: true });
await fs.mkdir(path.join(output, 'strips'), { recursive: true });
const sourceMotion = JSON.parse(await fs.readFile(path.join(root, 'animations.json'), 'utf8'));
const selectedClips = process.env.MOTION_CLIPS
  ? sourceMotion.clips.filter(c => process.env.MOTION_CLIPS.split(',').includes(c.id)) : sourceMotion.clips;
const phases = process.env.MOTION_PHASES ? process.env.MOTION_PHASES.split(',').map(Number) : [.2,.5,.8];
if (phases.length !== 3 || phases.some(phase => !Number.isFinite(phase) || phase < 0 || phase > 1)) throw Error('MOTION_PHASES requires three fractions between zero and one');
const hashes = {};
const frozenResponses = new Map();
for (const file of ['animations.json', 'asset-manifest.json', 'preview.js', 'source/props.js', 'source/motion-runtime.js', 'vendor/data.js', 'vendor/viewer-runtime.js']) {
  const bytes = await fs.readFile(path.join(root, file));
  hashes[file] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  frozenResponses.set('/'+file,bytes);
}
// A review must survive independent authoring of the next controller revision.
// Serve one complete immutable snapshot, including lazy model payload scripts.
for(const file of ['preview.html','preview.css',...new Set(JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8')).characters.flatMap(c=>(c.kits||[c]).flatMap(k=>[k.lod0,k.lod1])).map(model=>'offline/'+path.basename(model,'.glb')+'.js'))]){
  const bytes=await fs.readFile(path.join(root,file));frozenResponses.set('/'+file,bytes);
  hashes[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const errors = [], external = [], captures = [];
const mime = { '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep)) throw Error('Outside package');
    const bytes = frozenResponses.get(relative)||await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(String(error)));
await page.route(/^https?:/, route => {
  if (route.request().url().startsWith(origin + '/')) return route.continue();
  external.push(route.request().url()); return route.abort('blockedbyclient');
});
const startedAt = new Date().toISOString();
try {
  await page.goto(origin + '/preview.html?paused&clean', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => globalThis.soccerV7?.ready, { timeout: 60000 });
  await page.evaluate(() => soccerV7.ready);
  await page.evaluate(async () => { soccerV7.setPlaying(false); await soccerV7.setView('body'); soccerV7.setOrbit(.45); });
  const inventory = await page.evaluate(() => ({
    hashes: soccerV7.inspect().data.hashes,
    characters: soccerV7.inspect().data.manifest.characters.map(c => ({ id: c.id, role: c.role })),
    clips: [...soccerV7.inspect().clipMap.values()].map(c => ({ id: c.id, duration: c.duration, frames: c.frames.length })),
  }));
  for (const [liveKey, sourceFile] of [['motion','animations.json'],['manifest','asset-manifest.json'],['motionRuntime','source/motion-runtime.js']]) {
    if (inventory.hashes[liveKey] !== hashes[sourceFile].sha256) throw Error('Packed runtime hash is stale for ' + sourceFile);
  }
  for (const clip of selectedClips) {
    const live = inventory.clips.find(c => c.id === clip.id);
    if (!live || live.duration !== clip.duration || live.frames !== clip.frames.length) throw Error('Packed runtime is stale for ' + clip.id);
  }
  let selected = inventory.characters[0].id;
  for (const clip of selectedClips) {
    const role = clip.id.startsWith('keeper_') ? 'goalkeeper' : clip.id.startsWith('referee_') ? 'referee' : 'field';
    const character = inventory.characters.find(c => c.role === role) || inventory.characters[0];
    if (character.id !== selected) {
      await page.evaluate(async id => { await soccerV7.setCharacter(id); soccerV7.setOrbit(.45); }, character.id);
      selected = character.id;
    }
    await page.evaluate(id => soccerV7.setClip(id), clip.id);
    const images = [];
    for (const phase of phases) {
      await page.evaluate(phase => {
        // Inspect each clip from the same canonical heading. Gameplay turn
        // handoff persists heading between clips and is verified separately.
        for (const actor of soccerV7.inspect().actors) actor.baseYaw = 0;
        soccerV7.seek(phase);
      }, phase);
      const png = await page.screenshot({ type: 'png' });
      const file = 'captures/' + clip.id + '-' + Math.round(phase * 100) + '-390x844.webp';
      await sharp(png).webp({ quality: 88 }).toFile(path.join(output, file));
      images.push(png);
      captures.push({ clip: clip.id, phase, file, character: selected, expectedRole: role,
        exactRole: character.role === role, state: await page.evaluate(() => soccerV7.state()) });
    }
    await sharp({ create: { width: 1170, height: 844, channels: 3, background: '#1e292b' } })
      .composite(images.map((input, i) => ({ input, left: i * 390, top: 0 })))
      .webp({ quality: 88 }).toFile(path.join(output, 'strips', clip.id + '.webp'));
  }
  await fs.writeFile(path.join(output, 'capture.json'), JSON.stringify({ schemaVersion: 1, startedAt,
    finishedAt: new Date().toISOString(), viewport: { width: 390, height: 844 }, phases,
    offline: true, responsesFrozenInMemory:true, canonicalHeadingReset: true, external, errors, inventory, inputHashes: hashes, captures,
    limits: ['Paused samples establish visible pose/geometry, not smoothness, transition continuity, mobile framerate, or a motion-capture provenance claim.'] }, null, 2) + '\n');
  console.log(JSON.stringify({ clips: selectedClips.length, screenshots: captures.length,
    exactRoleScreenshots: captures.filter(c => c.exactRole).length,
    errors, external, output }));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
