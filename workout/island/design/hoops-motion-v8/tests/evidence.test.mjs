import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIP_IDS } from '../runtime/catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function evidence() {
  const entries = await readdir(new URL('../iterations/', import.meta.url), { withFileTypes: true });
  const rounds = entries.filter(e => e.isDirectory() && /^\d{2}$/.test(e.name)).map(e => e.name).sort();
  const captures = await Promise.all(rounds.map(async round => ({ round,
    data: JSON.parse(gunzipSync(await readFile(resolve(root, 'iterations', round, 'capture.json.gz')))) })));
  return { rounds, captures };
}

test('six or more documented render rounds retain only the last and previous round', async () => {
  const { rounds } = await evidence();
  assert.equal(rounds.length, 2);
  const latest = Number(rounds.at(-1));
  assert.ok(latest >= 6, `Only ${latest} rounds`);
  assert.equal(Number(rounds[0]), latest - 1);
  const history = await readFile(resolve(root, 'iterations/HISTORY.md'), 'utf8');
  const earlier = [...history.matchAll(/^(\d{2})\s*·/gm)].map(m => Number(m[1]));
  assert.deepEqual(earlier, Array.from({ length: latest - 2 }, (_, i) => i + 1));
});

test('each retained round contains all15 actual clips, eight frames and four phone/distance views', async () => {
  const { rounds, captures } = await evidence();
  for (const { round, data } of captures) {
    assert.equal(data.iteration, round);
    assert.deepEqual([...data.clips].sort(), [...CLIP_IDS].sort());
    assert.equal(data.framesPerClipPerView, 8);
    assert.equal(data.framing.length, CLIP_IDS.length * 8 * 4);
    // The previous round is retained precisely to document failures and fixes.
    // The final round must pass every loading, rendering and playback check.
    if (round === rounds.at(-1)) for (const key of ['errors', 'externalRequests', 'failedRequests', 'findings']) assert.deepEqual(data[key], [], `${round}: ${key}`);
    assert.ok(Date.parse(data.completedAtUTC) >= Date.parse(data.startedAtUTC));
    for (const id of CLIP_IDS) for (const viewport of ['390x844', '844x390']) for (const distance of ['near', 'far']) {
      const frames = data.framing.filter(f => f.clip === id && f.captureViewport === viewport && f.distance === distance);
      assert.deepEqual(frames.map(f => f.frame).sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
      for (const frame of frames) {
        assert.equal(frame.bodyInFrame, true, `${id} ${viewport} ${distance}: body`);
        if (distance === 'far') assert.equal(frame.ballInFrame, true, `${id} ${viewport}: ball`);
        assert.equal(frame.horizontalOverflow, false);
        assert.equal(frame.boneCount, 18);
        assert.ok(frame.tracks >= 20);
        assert.equal(frame.ballNode, 'Ball');
        assert.match(frame.source, /GLB.*AnimationMixer/);
      }
    }
    assert.equal(data.files.filter(f => f.kind === '8-frame-contact-sheet').length, CLIP_IDS.length * 4);
    assert.equal(data.files.filter(f => f.kind === 'full-page').length, 4);
    if (round === rounds.at(-1)) {
      assert.equal(data.playbackChecks.length, CLIP_IDS.length);
      for (const check of data.playbackChecks) assert.equal(check.pass, true, `${round}: ${check.id} playback`);
    }
  }
});

// WebP dimensions from the container headers; no external image decoder in Node.
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (tag === 'VP8X') return [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    if (tag === 'VP8 ') return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    if (tag === 'VP8L') {
      assert.equal(bytes[start], 0x2f);
      const bits = bytes.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + length + (length % 2);
  }
  throw new Error('Missing WebP image payload');
}

test('retained WebP bytes and full phone dimensions match the capture hashes', async () => {
  for (const { round, data } of (await evidence()).captures) for (const file of data.files) {
    assert.equal(file.file, basename(file.file));
    assert.match(file.file, /\.webp$/);
    const bytes = await readFile(resolve(root, 'iterations', round, file.file));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
    const size = webpSize(bytes);
    assert.ok(bytes.length <= 5_000_000);
    if (file.kind === 'full-page') assert.deepEqual(size, [file.viewport.width, file.viewport.height]);
    else assert.ok(size[0] >= 8 * 150 && size[1] >= 150);
  }
});

test('the final render used the exact currently delivered runtime and page bytes', async () => {
  const { captures } = await evidence();
  const final = captures.at(-1).data;
  for (const source of final.sources) {
    assert.ok(!source.file.includes('..'));
    const bytes = await readFile(resolve(root, source.file));
    assert.equal(bytes.length, source.bytes, `${source.file}: bytes changed after final render`);
    assert.equal(hash(bytes), source.sha256, `${source.file}: SHA changed after final render`);
  }
  for (const id of CLIP_IDS) for (const path of [`runtime/clips/${id}.glb`, `runtime/keyframes/${id}.json.gz`]) {
    assert.ok(final.sources.some(source => source.file === path), `Final rendering did not request ${path}`);
  }
});

test('final browser evidence enforces the exact game CSP and uses only static local Draco workers', async () => {
  const { captures } = await evidence(), final = captures.at(-1).data;
  const gameHTML = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  const policy = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(gameHTML)?.[1];
  assert.ok(policy, 'The source game must declare its CSP');
  assert.equal(final.csp.policy, policy);
  assert.deepEqual(final.csp.violations, []);
  assert.equal(final.csp.workerUrls.length, 2);
  for (const url of final.csp.workerUrls) assert.equal(url, '/runtime/vendor/draco/draco-worker.js');
});
