// CC0-1.0. Input adapter for the unchanged, pinned motion-qa-v1 CLI.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = 'racing-pit-sequence-v2';
export const SOURCES = Object.freeze([{ id: LIBRARY }]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function rotate([x, y, z, w], [a, b, c]) {
  const tx = 2 * (y * c - z * b);
  const ty = 2 * (z * a - x * c);
  const tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}

export async function loadLibraries({ fps = 60 } = {}) {
  if (!process.env.PIT_QA_ROOT) throw new Error('PIT_QA_ROOT must name the untouched pinned upstream QA directory.');
  const { parseGLB, sampleGLB } = await import(pathToFileURL(path.join(process.env.PIT_QA_ROOT, 'glb.mjs')));
  const file = 'clips/pit-actions.glb';
  const bytes = await readFile(path.join(assetRoot, file));
  const glb = parseGLB(bytes);
  const clips = [];
  for (const animation of glb.json.animations) {
    const authored = animation.extras ?? {};
    // A real role-specific ready/idle clip supplies the upstream continuity
    // reference. No sampled joint, root, rotation, or support is rewritten.
    const role = authored.role ?? (/jack|signal/.test(animation.name) ? 'jack_operator' : 'wheel_mechanic');
    const profile = authored.profile ?? 'canonical18';
    const metadata = {
      ...authored,
      role,
      profile,
      sourceLibrary: LIBRARY,
      floorProbeKind: 'four actual v1 shoe-sole corners per shoe plus all canonical joint centers',
      coordinateSpace: 'decoded GLB world; actual game-speed seconds; baked root applied once',
    };
    const extraTimes = [
      ...(metadata.supports ?? []).flatMap(support => [support.start, support.end]),
      ...(metadata.events ?? []).map(event => event.time),
    ];
    const sampled = sampleGLB(glb, { animation: animation.name, fps, extraTimes });
    for (const frame of sampled.frames) {
      frame.floorPoints = [];
      for (const bone of ['LeftFoot', 'RightFoot']) {
        for (const x of [-.082, .082]) {
          for (const z of [-.085, .175]) {
            const delta = rotate(frame.rotations[bone], [x, -.08, z]);
            frame.floorPoints.push({ bone, position: frame.joints[bone].map((value, axis) => value + delta[axis]) });
          }
        }
      }
    }
    clips.push({
      id: animation.name,
      motionId: animation.name,
      role,
      profile,
      height: 1.6675,
      duration: sampled.duration,
      frames: sampled.frames,
      metadata,
      source: { file, sha256: hash(bytes), animation: animation.name },
    });
  }
  return [{
    id: LIBRARY,
    sport: 'racing-pit',
    version: 2,
    title: 'Canonical eighteen-bone, game-speed staged pit actions',
    clips,
    source: {
      ref: 'codex/racing-pit-sequence-v2',
      commit: process.env.PIT_ASSET_COMMIT ?? 'working-tree',
      path: 'workout/island/design/racing-pit-sequence-v2',
      inputs: [{ path: file, bytes: bytes.length, sha256: hash(bytes) }],
      geometryDecoded: false,
      adapter: 'source/qa-sources.mjs; upstream sampler, metric definitions, thresholds, weights, and scoring unchanged',
    },
  }];
}
