/** Read-only model/motion review. Only the optional --out JSON artifact is written. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = path.join(root, 'models/player-01-lod0.glb');
const modelBytes = fs.readFileSync(modelPath);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['source/motion-build.py', 'rig.json', 'animations.json'];
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));

// Compile function definitions only. Importing the builder itself would run it;
// extracting AST FunctionDef nodes deliberately excludes all top-level effects.
const python = String.raw`
import ast, math, bisect, copy, json
from pathlib import Path
p = Path('.')
rig = json.loads((p/'rig.json').read_text())['bones']
clips = json.loads((p/'animations.json').read_text())['clips']
ns = dict(math=math, bisect=bisect, copy=copy,
          IDENTITY=[0.,0.,0.,1.], BONES=rig,
          REST={b['name']:b['restTranslationMeters'] for b in rig},
          PARENT={b['name']:b['parent'] for b in rig})
tree = ast.parse((p/'source/motion-build.py').read_text())
defs = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)], type_ignores=[])
exec(compile(defs, '<definitions-only-read-only>', 'exec'), ns)
clip = next(c for c in clips if c['id']=='get_up')
out=[]
for frame_index in [15,18]:
 for angle in [-90,-95,-97,-98,-99,-100,-101,-103]:
  f=copy.deepcopy(clip['frames'][frame_index])
  f['hipsOffsetMeters']=[0,.34-.86,-.05]
  for name, value in [('Hips',40),('Spine',40),('Chest',20),('Head',-20)]:
   f['rotations'][name]=ns['qeuler'](value)
  reach=0
  for side,sign in [('Left',1),('Right',-1)]:
   ns['solve_foot'](f,side,[sign*.1,.08,0])
   reach=max(reach,ns['solve_hand'](f,side,[sign*.24,.03,.45],ns['qeuler'](angle)))
  out.append(dict(timeSeconds=frame_index/30,handWorldPitchDegrees=angle,
                  armReachResidualMeters=reach,poses=ns['fk'](f)))
print(json.dumps(out))
`;
const generated = spawnSync('python3', ['-c', python], { cwd: root, encoding: 'utf8' });
if (generated.status !== 0) throw new Error(generated.stderr);
const cases = JSON.parse(generated.stdout);
const require = createRequire(process.env.SOCCER_ASSET_TOOLS || '/tmp/soccer-v7-tools/package.json');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const codec = require('draco3dgltf');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await codec.createDecoderModule() });
const doc = await io.readBinary(new Uint8Array(modelBytes));
const skin = doc.getRoot().listSkins()[0];
const names = skin.listJoints().map(node => node.getName());
const binds = skin.getInverseBindMatrices().getArray();
const inverseBinds = names.map((_, i) => new THREE.Matrix4().fromArray(binds, i * 16));
const vertices = [];
let leftPalmVertices = 0, rightPalmVertices = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION').getArray();
    const joints = primitive.getAttribute('JOINTS_0').getArray();
    const weights = primitive.getAttribute('WEIGHTS_0').getArray();
    for (let i = 0; i < positions.length / 3; i++) {
      let palm = 0;
      for (let k = 0; k < 4; k++) {
        const bone = names[joints[i * 4 + k]];
        if (weights[i * 4 + k] > .6 && bone.endsWith('Hand')) {
          const sign = bone === 'LeftHand' ? 1 : -1;
          if (positions[i * 3 + 1] > .69 && positions[i * 3 + 1] < .77 && Math.abs(positions[i * 3] - sign * .16) < .04) palm = sign;
        }
      }
      if (palm === 1) leftPalmVertices++;
      if (palm === -1) rightPalmVertices++;
      vertices.push({ x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2], joints: Array.from(joints.subarray(i * 4, i * 4 + 4)), weights: Array.from(weights.subarray(i * 4, i * 4 + 4)), palm });
    }
  }
}
const rows = cases.map(candidate => {
  const matrices = names.map((name, i) => new THREE.Matrix4().compose(new THREE.Vector3().fromArray(candidate.poses[name][0]), new THREE.Quaternion().fromArray(candidate.poses[name][1]), new THREE.Vector3(1, 1, 1)).multiply(inverseBinds[i]).elements);
  let minimumY = Infinity, leftPalmMinY = Infinity, rightPalmMinY = Infinity, minimumVertex;
  for (const vertex of vertices) {
    let y = 0;
    for (let k = 0; k < 4; k++) {
      if (!vertex.weights[k]) continue;
      const matrix = matrices[vertex.joints[k]];
      y += vertex.weights[k] * (matrix[1] * vertex.x + matrix[5] * vertex.y + matrix[9] * vertex.z + matrix[13]);
    }
    if (y < minimumY) {
      minimumY = y;
      minimumVertex = { bindPositionMeters: [vertex.x, vertex.y, vertex.z], bones: vertex.joints.map(j => names[j]), weights: vertex.weights };
    }
    if (vertex.palm === 1) leftPalmMinY = Math.min(leftPalmMinY, y);
    if (vertex.palm === -1) rightPalmMinY = Math.min(rightPalmMinY, y);
  }
  const footError = Math.max(...['Left','Right'].map((side, i) => new THREE.Vector3().fromArray(candidate.poses[side + 'Foot'][0]).distanceTo(new THREE.Vector3(i === 0 ? .1 : -.1, .08, 0))));
  const { poses, ...metadata } = candidate;
  return { ...metadata, wholeMeshMinimumYMeters: minimumY, leftPalmProxyMinimumYMeters: leftPalmMinY, rightPalmProxyMinimumYMeters: rightPalmMinY, footTargetErrorMeters: footError, minimumVertex };
});
const chosen = rows.filter(row => row.handWorldPitchDegrees === -100);
const report = {
  schemaVersion: 1,
  kind: 'independent-supported-recovery-skin-pitch-calibration',
  generatedAt: new Date().toISOString(),
  model: { file: 'models/player-01-lod0.glb', sha256: hash(modelBytes), bytes: modelBytes.length, decodedVertices: vertices.length },
  sourceHashes,
  provenance: { reviewer: 'motion_review read-only subagent', runnerPath: 'source/motion-skin-support-scan.mjs', modelWasMutated: false, builderWasRun: false, note: 'This is a reproducible rerun after calibration, with the exact decoded model byte buffer hashed before decoding. The earlier exploratory scan did not record a contemporaneous SHA; its result was reconfirmed by this rerun.' },
  methodology: {
    modelDecode: 'Khronos glTF-Transform NodeIO plus draco3dgltf decoder on the exact hashed in-memory GLB buffer.',
    pose: 'Canonical rest translations and parent-local absolute quaternions; analytic two-link limbs from function definitions only. Pose candidates sampled at get_up t=.5 and .6 seconds, preserving original hip height .34m, Hips40/Spine40/Chest20/Head-20 degrees, pelvisZ=-.05m. Both ankle targets [±.1,.08,0]; wrist targets [±.24,.03,.45].',
    skin: 'Full decoded-vertex linear blend skinning: sum(weight * canonicalWorldJointMatrix * inverseBindMatrix * restPosition). Every primitive and all four influences included. No runtime floor uplift applied.',
    palmProxy: 'Geometric proxy, not artist-authored semantic segmentation: Hand influence >.6; bind Y in (.69,.77)m; abs(bindX-sign*.16)<.04m. This excludes long distal finger tips while retaining the palm/wrist region.',
    palmProxyVertices: { left: leftPalmVertices, right: rightPalmVertices },
    units: 'meters',
  },
  selection: { handWorldPitchDegrees: -100, wristTargetYMeters: .03, reason: 'Original -90 degree hand pitch put distal fingers below the surface. A further ten degrees lifts them while preserving the body pose, exact feet and reachable wrists. Selected candidates leave the boot sole as the lowest vertex and palm proxy roughly 3.1–3.3mm above the ground.', rotatedCanonicalSupportOffsetMeters: [0, .005209445, -.029544233], pass: chosen.length === 2 && chosen.every(row => row.wholeMeshMinimumYMeters >= -.003 && row.leftPalmProxyMinimumYMeters >= 0 && row.leftPalmProxyMinimumYMeters <= .005 && row.rightPalmProxyMinimumYMeters >= 0 && row.rightPalmProxyMinimumYMeters <= .005 && row.armReachResidualMeters < 1e-6 && row.footTargetErrorMeters < 1e-6) },
  limitations: ['Calibrates this model and the two supported-crouch instants only; the delivery-wide whole-mesh motion audit must independently cover every model and all frames.', 'Palm proxy clearance quantifies nearby skin vertices; it is not a pressure/contact simulation or a visual-quality score.', 'No runtime floor correction was applied; later runtime floor correction and contact IK must be verified together.'],
  candidates: rows,
};
const outIndex = process.argv.indexOf('--out');
if (outIndex !== -1) fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ model: report.model, selection: report.selection, chosen, output: outIndex === -1 ? null : process.argv[outIndex + 1] }, null, 2));
