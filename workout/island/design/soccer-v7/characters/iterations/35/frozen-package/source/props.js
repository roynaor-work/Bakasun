/** Generic local football/whistle context. Presentation only; no game outcomes. */
import { sampleClip } from './motion-runtime.js';

const PARENTS = {
  Root: null, Hips: 'Root', Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck',
  LeftArm: 'Chest', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightArm: 'Chest', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
};
const RADIUS = .11;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

function leatherNormal(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const dx = Math.sin(x * Math.PI / 4) * Math.cos(y * Math.PI / 4);
    const dy = Math.cos(x * Math.PI / 4) * Math.sin(y * Math.PI / 4);
    pixels.data[i] = 128 + 10 * dx;
    pixels.data[i + 1] = 128 + 10 * dy;
    pixels.data[i + 2] = 254;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}

function footballGeometry(THREE) {
  // The twelve pentagons are derived from a regular icosahedron, rather than
  // painted as a sponsor/club/brand mark. Curved patches follow a true sphere.
  const raw = new THREE.IcosahedronGeometry(1, 0);
  const p = raw.attributes.position;
  const vertices = [], neighbours = [];
  const unique = new Map();
  const faces = [];
  for (let i = 0; i < p.count; i += 3) {
    const face = [];
    for (let j = 0; j < 3; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i + j).normalize();
      const key = v.toArray().map(n => n.toFixed(5)).join(',');
      if (!unique.has(key)) { unique.set(key, vertices.length); vertices.push(v); neighbours.push(new Set()); }
      face.push(unique.get(key));
    }
    faces.push(face);
    for (let j = 0; j < 3; j++) {
      neighbours[face[j]].add(face[(j + 1) % 3]);
      neighbours[face[j]].add(face[(j + 2) % 3]);
    }
  }
  raw.dispose();
  const directed = (i, j) => vertices[i].clone().multiplyScalar(2).add(vertices[j]).normalize();
  const patches = [], normals = [], seams = [];
  const triangle = (a, b, c) => {
    for (const v of [a, b, c]) { patches.push(v.x * (RADIUS + .0003), v.y * (RADIUS + .0003), v.z * (RADIUS + .0003)); normals.push(v.x, v.y, v.z); }
  };
  const curvedTriangle = (a, b, c, depth) => {
    if (!depth) return triangle(a, b, c);
    const ab = a.clone().add(b).normalize(), bc = b.clone().add(c).normalize(), ca = c.clone().add(a).normalize();
    curvedTriangle(a, ab, ca, depth - 1); curvedTriangle(ab, b, bc, depth - 1);
    curvedTriangle(ca, bc, c, depth - 1); curvedTriangle(ab, bc, ca, depth - 1);
  };
  const seam = (a, b) => {
    let prior = a;
    for (let s = 1; s <= 4; s++) {
      const next = a.clone().lerp(b, s / 4).normalize();
      seams.push(prior.x * .1105, prior.y * .1105, prior.z * .1105, next.x * .1105, next.y * .1105, next.z * .1105);
      prior = next;
    }
  };
  for (let i = 0; i < vertices.length; i++) {
    const normal = vertices[i];
    const tangent = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    const points = [...neighbours[i]].map(j => directed(i, j));
    points.sort((a, b) => Math.atan2(a.dot(bitangent), a.dot(tangent)) - Math.atan2(b.dot(bitangent), b.dot(tangent)));
    for (let j = 0; j < points.length; j++) {
      curvedTriangle(normal, points[j], points[(j + 1) % points.length], 1);
      seam(points[j], points[(j + 1) % points.length]);
    }
  }
  // White hexagonal panel boundaries complete the characteristic topology.
  for (const [a, b, c] of faces) {
    const hex = [directed(a, b), directed(b, a), directed(b, c), directed(c, b), directed(c, a), directed(a, c)];
    for (let i = 0; i < 6; i++) seam(hex[i], hex[(i + 1) % 6]);
  }
  const black = new THREE.BufferGeometry();
  black.setAttribute('position', new THREE.Float32BufferAttribute(patches, 3));
  black.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(seams, 3));
  return { black, lines };
}

function referenceSample(THREE, clip, time) {
  if (time >= 0 || !clip.loop) return sampleClip(THREE, clip, Math.max(0, time));
  const shift = Math.ceil(-time / clip.duration);
  const sample = sampleClip(THREE, clip, time + shift * clip.duration);
  const a = clip.frames[0].referenceRootTranslationMeters;
  const b = clip.frames.at(-1).referenceRootTranslationMeters;
  sample.referenceRootTranslationMeters = sample.referenceRootTranslationMeters.map((v, i) => v - shift * (b[i] - a[i]));
  return sample;
}

export function createProps(THREE, scene) {
  const root = new THREE.Group(); root.name = 'Generic football action context'; scene.add(root);
  const ball = new THREE.Group(); ball.name = 'Unbranded synthetic football'; root.add(ball);
  const normal = leatherNormal(THREE);
  const white = new THREE.MeshStandardMaterial({ color: 0xe7e8e5, roughness: .68, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(.23, .23) });
  const black = new THREE.MeshStandardMaterial({ color: 0x171c1b, roughness: .74, metalness: 0, side: THREE.DoubleSide });
  const base = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 24, 16), white); base.castShadow = true; base.receiveShadow = true; ball.add(base);
  const polygons = footballGeometry(THREE);
  const panels = new THREE.Mesh(polygons.black, black); panels.castShadow = true; ball.add(panels);
  const seams = new THREE.LineSegments(polygons.lines, new THREE.LineBasicMaterial({ color: 0x6f7772, transparent: true, opacity: .42 })); ball.add(seams);
  const whistle = new THREE.Group(); whistle.name = 'Generic referee whistle'; root.add(whistle);
  const metal = new THREE.MeshStandardMaterial({ color: 0x242b2b, roughness: .43, metalness: .15 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .022, 10), metal); barrel.rotation.x = Math.PI / 2; barrel.castShadow = true; whistle.add(barrel);
  const mouthpiece = new THREE.Mesh(new THREE.BoxGeometry(.012, .006, .012), metal); mouthpiece.position.z = -.015; mouthpiece.castShadow = true; whistle.add(mouthpiece);
  root.visible = false;

  let actor, clip, now, frameQ, frameScale, frameOrigin, currentPose, cache;

  function poseFK(time, boneName, localPoint) {
    const pose = referenceSample(THREE, clip, time);
    const states = {};
    const visit = name => {
      if (states[name]) return states[name];
      const parent = PARENTS[name];
      const local = actor.rest?.[name]?.clone() || actor.bones[name].position.clone();
      if (name === 'Hips') local.add(new THREE.Vector3().fromArray(pose.hipsOffsetMeters));
      const q = new THREE.Quaternion().fromArray(pose.rotations[name]);
      if (!parent) return states[name] = { p: new THREE.Vector3(), q };
      const previous = visit(parent);
      return states[name] = { p: local.applyQuaternion(previous.q).add(previous.p), q: previous.q.clone().multiply(q) };
    };
    const state = visit(boneName);
    const point = new THREE.Vector3().fromArray(localPoint).applyQuaternion(state.q).add(state.p);
    point.multiply(frameScale).applyQuaternion(frameQ);
    const delta = new THREE.Vector3().fromArray(pose.referenceRootTranslationMeters)
      .sub(new THREE.Vector3().fromArray(currentPose.referenceRootTranslationMeters)).multiply(frameScale).applyQuaternion(frameQ);
    return point.add(frameOrigin).add(delta);
  }

  function pointAt(boneName, time, localPoint = [0, 0, 0]) {
    const key = boneName + '/' + time.toFixed(6) + '/' + localPoint.join(',');
    if (cache.has(key)) return cache.get(key).clone();
    const expectedNow = poseFK(now, boneName, localPoint);
    const actualNow = actor.bones[boneName].localToWorld(new THREE.Vector3().fromArray(localPoint));
    const point = poseFK(time, boneName, localPoint).add(actualNow.sub(expectedNow));
    cache.set(key, point);
    return point.clone();
  }

  const direction = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(frameQ);
  const forward = () => direction(0, 0, 1);
  const localSeconds = () => clip.loop ? ((now % clip.duration) + clip.duration) % clip.duration : clamp(now, 0, clip.duration);
  const eventTime = (pattern, fallback) => clip.events?.find(e => pattern.test(e.name))?.timeSeconds ?? fallback;
  const contactTime = (bonePattern, fallback) => {
    const c = clip.ballContacts?.find(c => bonePattern.test(c.bone));
    return c?.timeSeconds ?? c?.atSeconds ?? (c?.time != null ? c.time * clip.duration : fallback);
  };
  function handBall(time = now) {
    return pointAt('LeftHand', time, [0, -.05, .02]).lerp(pointAt('RightHand', time, [0, -.05, .02]), .5).addScaledVector(forward(), .04);
  }
  function footBall(bone, time) {
    const contact = clip.ballContacts?.find(c => c.bone === bone);
    const point = pointAt(bone, time, contact?.localPointMeters || [0, -.025, .13]);
    const centerY = Math.max(RADIUS, point.y);
    const horizontal = Math.sqrt(Math.max(0, RADIUS * RADIUS - Math.min(RADIUS, centerY - point.y) ** 2));
    return point.addScaledVector(forward(), horizontal).setY(centerY);
  }
  function outgoing(origin, seconds, speed, up) {
    const p = origin.clone().addScaledVector(forward(), speed * seconds);
    p.y += up * seconds - 4.905 * seconds * seconds;
    p.y = Math.max(RADIUS, p.y);
    return p;
  }

  function update(nextActor, nextClip, timeSeconds, view) {
    root.visible = Boolean(nextActor && nextClip && view === 'body');
    if (!root.visible) return;
    actor = nextActor; clip = nextClip; now = timeSeconds;
    ball.visible = false; whistle.visible = false;
    if (!actor.bones?.Root) return;
    frameQ = actor.bones.Root.getWorldQuaternion(new THREE.Quaternion());
    frameScale = actor.bones.Root.getWorldScale(new THREE.Vector3());
    frameOrigin = actor.bones.Root.getWorldPosition(new THREE.Vector3());
    currentPose = referenceSample(THREE, clip, now); cache = new Map();
    const id = clip.id, t = localSeconds();
    let position = null;

    if (id === 'referee_whistle') {
      const a = Math.sin(Math.PI * clamp(t / clip.duration));
      whistle.visible = a > .25;
      whistle.position.copy(actor.bones.RightHand.localToWorld(new THREE.Vector3(0, -.165, 0))).addScaledVector(forward(), .035);
      whistle.quaternion.copy(frameQ);
    } else if (id === 'dribble') {
      const d = clip.duration, cycle = Math.floor(now / d), a = .20 * d, b = .70 * d;
      const points = t < a ? [[(cycle - 1) * d + b, 'RightFoot'], [cycle * d + a, 'LeftFoot']]
        : t < b ? [[cycle * d + a, 'LeftFoot'], [cycle * d + b, 'RightFoot']]
          : [[cycle * d + b, 'RightFoot'], [(cycle + 1) * d + a, 'LeftFoot']];
      const w = clamp((now - points[0][0]) / (points[1][0] - points[0][0]));
      position = footBall(points[0][1], points[0][0]).lerp(footBall(points[1][1], points[1][0]), w);
      position.y += .025 * Math.sin(Math.PI * w);
    } else if (id === 'keeper_catch') {
      const contact = eventTime(/glove_ball_catch/, .4);
      const center = handBall(contact);
      position = t < contact ? center.clone().addScaledVector(forward(), 2.3 * (1 - t / contact)).add(new THREE.Vector3(0, .25 * (1 - t / contact), 0)) : handBall();
    } else if (id === 'keeper_throw') {
      const release = eventTime(/throw_release/, .56 * clip.duration);
      const held = time => pointAt('RightHand', time, [0, -.075, .025]).addScaledVector(forward(), .06);
      position = t <= release ? held(now) : outgoing(held(release), t - release, 7.5, 3.2);
    } else if (/^keeper_dive_/.test(id)) {
      const hit = contactTime(/Hand/, .5 * clip.duration);
      const metadata = clip.ballContacts?.find(c => /Hand/.test(c.bone));
      const side = metadata?.bone || (id.endsWith('right') ? 'RightHand' : 'LeftHand');
      const point = pointAt(side, hit, metadata?.localPointMeters || [0, -.025, .025]);
      const normal = metadata?.pointMeters && metadata?.ballCenterMeters
        ? new THREE.Vector3().fromArray(metadata.ballCenterMeters).sub(new THREE.Vector3().fromArray(metadata.pointMeters)).normalize().applyQuaternion(frameQ)
        : direction(id.endsWith('right') ? -1 : 1, .1, .2).normalize();
      const center = point.addScaledVector(normal, RADIUS);
      position = t < hit ? center.clone().addScaledVector(forward(), 2.0 * (1 - t / hit))
        : center.clone().addScaledVector(normal, 2.4 * (t - hit)).addScaledVector(forward(), .8 * (t - hit));
      position.y = Math.max(RADIUS, position.y);
    } else if (id === 'header') {
      const hit = contactTime(/Head/, .52 * clip.duration);
      // Canonical Head is the lower skull joint, not the forehead center.
      // Raise the collision cue above the eyes instead of striking the nose.
      const center = pointAt('Head', hit, [0, .18, .095]).addScaledVector(forward(), RADIUS);
      position = t < hit ? center.clone().addScaledVector(forward(), 1.3 * (1 - t / hit)).add(new THREE.Vector3(0, .5 * (1 - t / hit), 0))
        : outgoing(center, t - hit, 6.5, 1.7);
    } else if (['kick', 'short_pass', 'long_pass', 'slide_tackle', 'keeper_punt'].includes(id)) {
      const hit = contactTime(/Foot/, .43 * clip.duration);
      const contact = clip.ballContacts?.find(c => /Foot/.test(c.bone));
      const center = footBall(contact?.bone || 'RightFoot', hit);
      if (id === 'keeper_punt') {
        const release = eventTime(/ball_release/, .18 * clip.duration);
        if (t < release) position = handBall();
        else if (t < hit) {
          const w = clamp((t - release) / (hit - release));
          position = handBall(release).lerp(center, w);
          position.y += .12 * Math.sin(Math.PI * w);
        }
      }
      if (!position) position = t < hit ? center : outgoing(center, t - hit,
        id === 'short_pass' ? 4.8 : id === 'slide_tackle' ? 3.0 : id === 'long_pass' ? 8.0 : 10.0,
        id === 'long_pass' || id === 'keeper_punt' ? 4.0 : id === 'kick' ? 2.0 : .2);
    }
    if (position) {
      ball.visible = true; ball.position.copy(position);
      ball.quaternion.copy(frameQ);
      ball.rotateX((clip.speedMps || 4) * now / RADIUS);
      ball.rotateY(.12 * now);
    }
  }

  return {
    update,
    metrics: { ballRadiusMeters: RADIUS, ballTriangles: base.geometry.index.count / 3 + polygons.black.attributes.position.count / 3,
      ballDrawCalls: 3, whistleTriangles: barrel.geometry.index.count / 3 + mouthpiece.geometry.index.count / 3,
      whistleDrawCalls: 2, textureCount: 1, maxTextureDimension: 128, presentationOnly: true },
    dispose() {
      scene.remove(root);
      const geometries = new Set(), materials = new Set(), textures = new Set();
      root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
