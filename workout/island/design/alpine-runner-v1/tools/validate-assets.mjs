// SPDX-License-Identifier: CC0-1.0
// Independent checks against serialized delivery files, not authoring objects.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import * as THREE from "../../../vendor/three.module.js";
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(base, "../../../..");
const args = process.argv.slice(2),
  moduleRoot = args.includes("--modules")
    ? args[args.indexOf("--modules") + 1]
    : "/tmp/alpine-runner-qa-tools";
const require = createRequire(path.resolve(moduleRoot, "package.json"));
const validator = require("gltf-validator");
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPE = {
  5121: [1, "getUint8"],
  5123: [2, "getUint16"],
  5125: [4, "getUint32"],
  5126: [4, "getFloat32"],
};
const assert = (ok, message) => {
  if (!ok) throw Error(message);
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const checks = [],
  glbs = [];
function parse(bytes) {
  assert(
    bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2,
    "GLB header",
  );
  assert(bytes.readUInt32LE(8) === bytes.length, "GLB size header");
  const n = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.toString("utf8", 20, 20 + n));
  const binary = bytes.subarray(28 + n);
  function accessor(i) {
    const a = json.accessors[i],
      bv = json.bufferViews[a.bufferView],
      w = WIDTH[a.type],
      type = TYPE[a.componentType];
    assert(w && type && !a.sparse, "Expected native uncompressed accessor");
    const dv = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      ),
      result = [];
    for (let j = 0; j < a.count; j++) {
      const v = [];
      for (let k = 0; k < w; k++)
        v.push(
          dv[type[1]](
            (bv.byteOffset ?? 0) +
              (a.byteOffset ?? 0) +
              j * (bv.byteStride ?? w * type[0]) +
              k * type[0],
            true,
          ),
        );
      result.push(v);
    }
    return result;
  }
  return { json, binary, accessor };
}
async function files(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await files(p)));
    else result.push(p);
  }
  return result;
}
function worldMatrices(json) {
  const local = json.nodes.map((n) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(n.translation ?? [0, 0, 0]),
      new THREE.Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(n.scale ?? [1, 1, 1]),
    ),
  );
  const parents = new Map();
  json.nodes.forEach((n, i) =>
    (n.children ?? []).forEach((c) => parents.set(c, i)),
  );
  const result = new Map();
  function resolve(i) {
    if (!result.has(i))
      result.set(
        i,
        parents.has(i)
          ? resolve(parents.get(i)).clone().multiply(local[i])
          : local[i],
      );
    return result.get(i);
  }
  return json.nodes.map((_, i) => resolve(i));
}
const canonical = JSON.parse(
  await readFile(
    path.join(repo, "workout/island/design/motion2/alpine.json"),
    "utf8",
  ),
).skeleton.bones;
const character = JSON.parse(
  await readFile(path.join(base, "character-spec.json"), "utf8"),
);
const world = JSON.parse(
  await readFile(path.join(base, "world-spec.json"), "utf8"),
);
const fence = parse(
  await readFile(
    path.join(base, world.props.find((p) => p.id === "low_fence").path),
  ),
);
const fenceTop = Math.max(
  ...fence.json.meshes.flatMap((m) =>
    m.primitives.flatMap((p) =>
      fence.accessor(p.attributes.POSITION).map((v) => v[1]),
    ),
  ),
);
const beam = parse(
  await readFile(
    path.join(base, world.props.find((p) => p.id === "high_beam").path),
  ),
);
const beamBottom = Math.min(
  ...beam.json.meshes.flatMap((m) =>
    m.primitives
      .filter((p) => beam.json.materials[p.material]?.name === "Coral")
      .flatMap((p) => beam.accessor(p.attributes.POSITION).map((v) => v[1])),
  ),
);
const all = await files(base),
  deliveryBytes = (await Promise.all(all.map((p) => readFile(p)))).reduce(
    (n, b) => n + b.length,
    0,
  );
assert(deliveryBytes <= 8000000, `Whole folder exceeds 8MB: ${deliveryBytes}`);
for (const p of all.filter((p) => p.endsWith(".glb"))) {
  const bytes = await readFile(p),
    relative = path.relative(base, p);
  const khronos = await validator.validateBytes(new Uint8Array(bytes), {
    uri: relative,
    maxIssues: 0,
  });
  delete khronos.validatedAt;
  glbs.push({
    path: relative,
    bytes: bytes.length,
    sha256: hash(bytes),
    errors: khronos.issues.numErrors,
    warnings: khronos.issues.numWarnings,
    infos: khronos.issues.numInfos,
    messages: khronos.issues.messages,
  });
  assert(
    khronos.issues.numErrors === 0 && khronos.issues.numWarnings === 0,
    `Khronos ${khronos.issues.numErrors} errors/${khronos.issues.numWarnings} warnings in ${relative}: ${JSON.stringify(khronos.issues.messages.slice(0, 5))}`,
  );
}
const desired = [
  "glide",
  "lane_left",
  "lane_right",
  "jump_rise",
  "jump_apex",
  "jump_land",
  "slide",
  "fall_left",
  "fall_right",
  "fall_forward",
  "get_up",
  "celebrate",
  "turbo",
];
assert(character.suits.length === 3, "Exactly three suit colors");
assert(character.clips.length === 13, "Exactly 13 clips");
const skins = [];
for (const variant of character.suits) {
  const bytes = await readFile(path.join(base, variant.path)),
    { json, accessor } = parse(bytes);
  assert(json.skins?.length === 1, `${variant.path}: exactly one skin`);
  const skin = json.skins[0],
    joints = skin.joints.map((i) => json.nodes[i]),
    parents = new Map();
  json.nodes.forEach((n, i) =>
    (n.children ?? []).forEach((c) => parents.set(c, i)),
  );
  assert(
    joints.length === 18 &&
      joints.every((n, i) => n.name === canonical[i].name),
    `${variant.path}: canonical joint count/order`,
  );
  assert(
    joints.every(
      (n, i) =>
        (parents.has(skin.joints[i])
          ? json.nodes[parents.get(skin.joints[i])].name
          : null) === canonical[i].parent,
    ),
    `${variant.path}: canonical hierarchy`,
  );
  assert(
    joints.every(
      (n, i) =>
        distance(
          n.translation ?? [0, 0, 0],
          canonical[i].restTranslationMeters,
        ) < 1e-5,
    ),
    `${variant.path}: canonical rest offsets`,
  );
  const matrices = worldMatrices(json),
    ibms = accessor(skin.inverseBindMatrices);
  let maxBindError = 0,
    maxWeightError = 0,
    vertices = 0;
  for (const [i, index] of skin.joints.entries()) {
    const product = matrices[index]
      .clone()
      .multiply(new THREE.Matrix4().fromArray(ibms[i])).elements;
    maxBindError = Math.max(
      maxBindError,
      ...product.map((v, k) => Math.abs(v - (k % 5 === 0 ? 1 : 0))),
    );
  }
  assert(maxBindError < 1e-5, `${variant.path}: inverse bind matrices`);
  let triangles = 0;
  for (const mesh of json.meshes)
    for (const prim of mesh.primitives) {
      triangles +=
        (prim.indices === undefined
          ? json.accessors[prim.attributes.POSITION].count
          : json.accessors[prim.indices].count) / 3;
      const positions = accessor(prim.attributes.POSITION);
      vertices += positions.length;
      if (prim.attributes.JOINTS_0 === undefined) continue;
      const ids = accessor(prim.attributes.JOINTS_0),
        weights = accessor(prim.attributes.WEIGHTS_0);
      assert(
        ids.length === positions.length && weights.length === positions.length,
        "Skin attributes match vertex count",
      );
      ids.forEach((j) =>
        assert(
          j.every((n) => Number.isInteger(n) && n >= 0 && n < 18),
          "All joint indices within skin",
        ),
      );
      weights.forEach((w) => {
        assert(
          w.every((v) => v >= 0 && v <= 1),
          "Nonnegative normalized weights",
        );
        maxWeightError = Math.max(
          maxWeightError,
          Math.abs(w.reduce((s, v) => s + v, 0) - 1),
        );
      });
    }
  assert(
    triangles === 1200,
    `${variant.path}: ${triangles} triangles, required exactly 1200`,
  );
  assert(maxWeightError < 1e-5, `${variant.path}: normalized skin weights`);
  assert(
    JSON.stringify(json.animations.map((a) => a.name).sort()) ===
      JSON.stringify([...desired].sort()),
    `${variant.path}: exact requested clips`,
  );
  const animations = [];
  for (const animation of json.animations) {
    let frames = 0,
      duration = 0,
      maxQuaternionError = 0;
    for (const ch of animation.channels) {
      const sampler = animation.samplers[ch.sampler],
        times = accessor(sampler.input).map((v) => v[0]),
        values = accessor(sampler.output);
      assert(
        times.length === values.length && times.length >= 2,
        `${animation.name}: track sample counts`,
      );
      assert(
        times.every((t, i) => Math.abs(t - i / 30) < 1e-6),
        `${animation.name}: exactly 30Hz samples`,
      );
      assert(
        ch.target.path !== "scale",
        `${animation.name}: rigid bone lengths without scaling`,
      );
      assert(
        skin.joints.includes(ch.target.node),
        `${animation.name}: animation only targets canonical rig`,
      );
      if (ch.target.path === "rotation")
        for (const q of values)
          maxQuaternionError = Math.max(
            maxQuaternionError,
            Math.abs(Math.hypot(...q) - 1),
          );
      frames = Math.max(frames, times.length);
      duration = Math.max(duration, times.at(-1));
    }
    assert(maxQuaternionError < 1e-5, `${animation.name}: unit rotations`);
    const meta = character.clips.find((c) => c.name === animation.name);
    assert(meta, `${animation.name}: metadata present`);
    let maxLoopError = 0;
    if (meta.loop) {
      for (const ch of animation.channels) {
        const values = accessor(animation.samplers[ch.sampler].output),
          a = values[0],
          b = values.at(-1);
        maxLoopError = Math.max(
          maxLoopError,
          Math.min(
            distance(a, b),
            ch.target.path === "rotation"
              ? distance(
                  a,
                  b.map((v) => -v),
                )
              : Infinity,
          ),
        );
      }
      assert(maxLoopError < 1e-5, `${animation.name}: seamless loop endpoints`);
    }
    animations.push({
      name: animation.name,
      nativeHz: 30,
      frames,
      durationSeconds: duration,
      maxQuaternionError,
      maxLoopError,
    });
  }
  // Sweep every vertex of the actual skinned geometry, including equipment.
  // Linear 30Hz tracks are sampled at 120Hz, so between-key penetrations count.
  const geometry = json.nodes.flatMap((node, index) =>
    node.mesh === undefined
      ? []
      : json.meshes[node.mesh].primitives.map((p) => ({
          node: index,
          skin: node.skin,
          positions: accessor(p.attributes.POSITION),
          joints:
            p.attributes.JOINTS_0 === undefined
              ? null
              : accessor(p.attributes.JOINTS_0),
          weights:
            p.attributes.WEIGHTS_0 === undefined
              ? null
              : accessor(p.attributes.WEIGHTS_0),
        })),
  );
  const meshFloor = [];
  for (const animation of json.animations) {
    const tracks = animation.channels.map((ch) => {
      const s = animation.samplers[ch.sampler];
      return {
        node: ch.target.node,
        key: ch.target.path,
        times: accessor(s.input).map((v) => v[0]),
        values: accessor(s.output),
      };
    });
    const duration = Math.max(...tracks.map((t) => t.times.at(-1)));
    let minY = Infinity,
      worstTime = 0,
      samples = 0,
      vertexSamples = 0;
    const boundsTimeline = [];
    for (let frame = 0; frame <= Math.round(duration * 120); frame++) {
      const t = Math.min(duration, frame / 120),
        current = { ...json, nodes: json.nodes.map((n) => ({ ...n })) };
      for (const track of tracks) {
        let hi = track.times.findIndex((v) => v >= t);
        if (hi < 0) hi = track.times.length - 1;
        const lo = Math.max(0, hi - 1),
          alpha =
            hi === lo
              ? 0
              : (t - track.times[lo]) / (track.times[hi] - track.times[lo]);
        current.nodes[track.node][track.key] =
          track.key === "rotation"
            ? new THREE.Quaternion()
                .fromArray(track.values[lo])
                .slerp(
                  new THREE.Quaternion().fromArray(track.values[hi]),
                  alpha,
                )
                .toArray()
            : track.values[lo].map(
                (v, i) => v + (track.values[hi][i] - v) * alpha,
              );
      }
      const pose = worldMatrices(current),
        jointMatrices = skin.joints.map((index, i) =>
          pose[index].clone().multiply(new THREE.Matrix4().fromArray(ibms[i])),
        );
      let frameMinY = Infinity,
        frameMaxY = -Infinity;
      for (const geom of geometry)
        for (let i = 0; i < geom.positions.length; i++) {
          let y = 0;
          if (geom.skin !== undefined) {
            for (let k = 0; k < 4; k++) {
              const w = geom.weights[i][k];
              if (w)
                y +=
                  new THREE.Vector3()
                    .fromArray(geom.positions[i])
                    .applyMatrix4(jointMatrices[geom.joints[i][k]]).y * w;
            }
          } else
            y = new THREE.Vector3()
              .fromArray(geom.positions[i])
              .applyMatrix4(pose[geom.node]).y;
          if (y < minY) {
            minY = y;
            worstTime = t;
          }
          frameMinY = Math.min(frameMinY, y);
          frameMaxY = Math.max(frameMaxY, y);
          vertexSamples++;
        }
      samples++;
      boundsTimeline.push({ time: t, minY: frameMinY, maxY: frameMaxY });
    }
    assert(
      minY >= -0.001,
      `${variant.path}/${animation.name}: whole mesh penetrates floor ${minY}m at ${worstTime}s`,
    );
    meshFloor.push({
      clip: animation.name,
      minVertexY: minY,
      worstTime,
      samples,
      vertexSamples,
      minUpperBoundY: Math.min(...boundsTimeline.map((f) => f.maxY)),
      maxLowerBoundY: Math.max(...boundsTimeline.map((f) => f.minY)),
      belowBeam: boundsTimeline
        .filter((f) => f.maxY <= beamBottom - 0.02)
        .map((f) => f.time),
      aboveFence: boundsTimeline
        .filter((f) => f.minY >= fenceTop + 0.02)
        .map((f) => f.time),
    });
  }
  const safeWindow = (times) => {
    let longest = 0,
      start = null,
      previous = null,
      best = null;
    for (const t of times) {
      if (previous === null || t - previous > 1 / 120 + 1e-6) start = t;
      if (t - start > longest) {
        longest = t - start;
        best = { startSeconds: start, endSeconds: t };
      }
      previous = t;
    }
    return { durationSeconds: longest, ...best };
  };
  const slide = meshFloor.find((c) => c.clip === "slide");
  let offset = 0;
  const jumpTimes = [];
  for (const name of ["jump_rise", "jump_apex", "jump_land"]) {
    const c = meshFloor.find((c) => c.clip === name);
    jumpTimes.push(...c.aboveFence.map((t) => t + offset));
    offset += animations.find((c) => c.name === name).durationSeconds;
  }
  const slideWindow = safeWindow(slide.belowBeam),
    jumpWindow = safeWindow(jumpTimes);
  assert(
    slideWindow.durationSeconds >= 0.12,
    `${variant.path}: no useful full-mesh slide clearance window under beam ${beamBottom}m; lowest helmet/gear top ${slide.minUpperBoundY}m`,
  );
  assert(
    jumpWindow.durationSeconds >= 0.12,
    `${variant.path}: no useful full-mesh jump window over fence ${fenceTop}m`,
  );
  skins.push({
    path: variant.path,
    triangles,
    vertices,
    joints: 18,
    maxBindError,
    maxWeightError,
    animations,
    meshFloor,
    clearances: {
      beamUndersideY: beamBottom,
      fenceTopY: fenceTop,
      marginMeters: 0.02,
      slideWindow,
      jumpWindow,
      passed: true,
    },
  });
}
assert(world.tiles.length === 8, "Exactly eight track tiles");
assert(world.props.length === 15, "Exactly fifteen props");
const requiredTiles = [
  "straight",
  "gentle_turn",
  "slope",
  "bridge",
  "ice_tunnel",
  "village",
  "forest",
  "summit",
];
const requiredProps = [
  "tree",
  "rock",
  "low_fence",
  "high_beam",
  "cable_car",
  "ice_crevasse",
  "snowman",
  "penguin",
  "rolling_snowball",
  "star",
  "coin",
  "magnet",
  "shield",
  "turbo",
  "double_coin",
];
assert(
  JSON.stringify(world.tiles.map((t) => t.id).sort()) ===
    JSON.stringify(requiredTiles.sort()),
  "Exact eight requested tile themes",
);
assert(
  JSON.stringify(world.props.map((p) => p.id).sort()) ===
    JSON.stringify(requiredProps.sort()),
  "Exact nine obstacles, two collectibles and four power-ups",
);
const seams = [];
for (const tile of world.tiles) {
  const bytes = await readFile(path.join(base, tile.path));
  assert(bytes.length <= 150000, `${tile.id}: tile under 150KB`);
  const { json, accessor } = parse(bytes),
    matrices = worldMatrices(json);
  const index = json.nodes.findIndex(
    (n) => n.name === (tile.surfaceNode ?? `Tile_${tile.id}`),
  );
  assert(index >= 0, `${tile.id}: driveable surface mesh identified`);
  const mesh = json.meshes[json.nodes[index].mesh],
    ports = { start: [], end: [] };
  for (const prim of mesh.primitives.filter((p) =>
    ["Packed snow", "Fresh snow"].includes(json.materials[p.material]?.name),
  )) {
    const pts = accessor(prim.attributes.POSITION),
      normals =
        prim.attributes.NORMAL === undefined
          ? null
          : accessor(prim.attributes.NORMAL);
    pts.forEach((p, i) => {
      const v = new THREE.Vector3()
        .fromArray(p)
        .applyMatrix4(matrices[index])
        .toArray();
      for (const [port, z] of [
        ["start", 0],
        ["end", 30],
      ])
        if (Math.abs(v[2] - z) < 1e-5)
          ports[port].push({ position: [v[0], v[1], 0], normal: normals?.[i] });
    });
  }
  for (const k of ["start", "end"]) {
    const unique = new Map(
      ports[k].map((v) => [v.position.map((x) => x.toFixed(5)).join(","), v]),
    );
    ports[k] = [...unique.values()].sort(
      (a, b) => a.position[0] - b.position[0],
    );
    assert(ports[k].length >= 4, `${tile.id}: ${k} road edge samples`);
  }
  seams.push({ id: tile.id, bytes: bytes.length, ports });
}
let maxSeamPositionError = 0,
  maxSeamNormalError = 0;
for (const a of seams)
  for (const b of seams) {
    assert(
      a.ports.end.length === b.ports.start.length,
      `${a.id}->${b.id}: edge vertex count`,
    );
    a.ports.end.forEach((v, i) => {
      const next = b.ports.start[i];
      maxSeamPositionError = Math.max(
        maxSeamPositionError,
        distance(v.position, next.position),
      );
      if (v.normal && next.normal)
        maxSeamNormalError = Math.max(
          maxSeamNormalError,
          distance(v.normal, next.normal),
        );
    });
  }
assert(
  maxSeamPositionError < 1e-5 && maxSeamNormalError < 1e-4,
  "All 64 tile joins agree in actual edge positions and normals",
);
const report = {
  schemaVersion: 1,
  validator: validator.version(),
  wholeFolderBytesAtCheck: deliveryBytes,
  budgetBytes: 8000000,
  khronos: {
    assets: glbs.length,
    errors: glbs.reduce((n, g) => n + g.errors, 0),
    warnings: glbs.reduce((n, g) => n + g.warnings, 0),
    files: glbs,
  },
  characters: skins,
  track: {
    count: 8,
    orderedJoins: 64,
    maxSeamPositionErrorMeters: maxSeamPositionError,
    maxSeamNormalError,
    tiles: seams,
  },
  props: world.props.length,
  passed: true,
};
await mkdir(path.join(base, "verification"), { recursive: true });
await writeFile(
  path.join(base, "verification/assets.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      khronosAssets: glbs.length,
      khronosErrors: 0,
      khronosWarnings: 0,
      trianglesPerCharacter: 1200,
      clipsPerCharacter: 13,
      tiles: 8,
      joins: 64,
      maxSeamPositionError,
      folderBytes: deliveryBytes,
      passed: true,
    },
    null,
    2,
  ),
);
