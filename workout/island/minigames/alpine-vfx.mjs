import * as THREE from '../vendor/three.module.js';

const ROOT = new URL('../design/vfx/', import.meta.url);
const IDS = ['snow-dust', 'ski-scrape', 'landing-dust', 'speed-lines'];
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const smoother = x => { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const json = async path => { const response = await fetch(new URL(path, ROOT)); if (!response.ok) throw new Error(`alpine.vfx.${response.status}`); return response.json(); };

/** Authored flipbooks only: three pooled quads and exactly 3 MiB of non-mipmapped
 * texture storage. Snow and landing retain 128px frames. Scrape and speed use
 * 64px frames packed together; their source images are released after preload.
 * No physics events are consumed: only transitions in the displayed frame matter. */
export async function createAlpineVfx({scene, worldPoint, surfaceHeight = () => 0, frameAt, reducedMotion = false, crashSeconds = 1.8} = {}) {
  if (!scene || !worldPoint || !frameAt) throw new Error('alpine.vfx.course');
  const imageLoader = new THREE.ImageLoader();
  const [specs, images, fall] = await Promise.all([
    Promise.all(IDS.map(id => json(`atlases/${id}.json`))),
    Promise.all(IDS.map(id => imageLoader.loadAsync(new URL(`atlases/${id}.webp`, ROOT).href))),
    json('cameras/ski-fall.json'),
  ]);
  const packed = document.createElement('canvas'); packed.width = packed.height = 512;
  const ctx = packed.getContext('2d');
  if (!ctx) throw new Error('alpine.vfx.canvas');
  ctx.drawImage(images[1], 0, 0, 256, 256); ctx.drawImage(images[3], 256, 0, 256, 256);
  const textures = [new THREE.Texture(images[0]), new THREE.Texture(images[2]), new THREE.CanvasTexture(packed)];
  for (const tex of textures) {
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  }
  // Do not retain decoded, full-size scrape/speed images after packing.
  images[1] = images[3] = null;
  const layouts = [
    {texture: textures[0], x: 0, y: 0, cell: 128},
    {texture: textures[2], x: 0, y: 0, cell: 64},
    {texture: textures[1], x: 0, y: 0, cell: 128},
    {texture: textures[2], x: 256, y: 0, cell: 64},
  ];
  const group = new THREE.Group(); group.name = 'alpine-design-vfx'; scene.add(group);
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.attributes.uv.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({map: textures[0], transparent: true, opacity: 0, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide});
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `alpine-flipbook-${i}`;
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 8; group.add(mesh);
    slots.push({mesh, type: 0, start: -10, frame: -1, size: 1, rotation: 0, active: false});
  }
  const forward = new THREE.Vector3(), delta = new THREE.Vector3();
  const lastEmit = new Float64Array([-10, -10, -10, -10]);
  let disposed = false, previousTime = -1, wasAirborne = false, wasLanding = false, wasBoosting = false;
  let spawned = 0, activeCount = 0, warmed = false;
  function uvFrame(slot, index) {
    if (slot.frame === index) return;
    slot.frame = index;
    const layout = layouts[slot.type], cell = layout.cell, inset = .5;
    const x = layout.x + (index % 4) * cell, y = layout.y + Math.floor(index / 4) * cell;
    const u0 = (x + inset) / 512, u1 = (x + cell - inset) / 512;
    const v0 = 1 - (y + cell - inset) / 512, v1 = 1 - (y + inset) / 512;
    const uv = slot.mesh.geometry.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true;
  }
  function opacityAt(spec, age) {
    const points = spec.opacityEnvelope;
    if (age <= points[0].time) return points[0].opacity;
    for (let i = 1; i < points.length; i++) if (age <= points[i].time) {
      const a = points[i - 1], b = points[i]; return a.opacity + (b.opacity - a.opacity) * smooth((age - a.time) / (b.time - a.time));
    }
    return 0;
  }
  function emit(type, now, player, size, rotation = 0, force = false) {
    if (!force && now - lastEmit[type] < (type === 1 ? .22 : type === 0 ? .25 : .65)) return;
    let same = 0;
    for (const slot of slots) if (slot.active && slot.type === type) same++;
    if (same >= specs[type].lowEnd.maxInstances) return;
    let chosen = null;
    for (const slot of slots) if (!slot.active) { chosen = slot; break; }
    // A landing is the strongest contact cue and can replace a lingering scrape.
    if (!chosen && type === 2) for (const slot of slots) if (slot.type === 1) { chosen = slot; break; }
    if (!chosen) return;
    chosen.type = type; chosen.start = now; chosen.size = size; chosen.rotation = rotation; chosen.frame = -1; chosen.active = true;
    chosen.mesh.material.map = layouts[type].texture;
    chosen.mesh.material.depthTest = type !== 3;
    const s = player.s ?? 0, x = player.x ?? 0;
    worldPoint(s - (type === 1 ? .15 : .45), x, surfaceHeight(x) + size * .22 + .04, chosen.mesh.position);
    lastEmit[type] = now; spawned++;
  }
  function resetEffects() {
    for (const slot of slots) { slot.active = false; slot.mesh.visible = false; slot.frame = -1; }
    lastEmit.fill(-10); activeCount = 0; wasAirborne = wasLanding = wasBoosting = false;
  }
  function update(state, camera) {
    if (disposed || state.phase === 'paused') return;
    const now = (state.timeMs || 0) / 1000, player = state.player;
    if (now < previousTime) { resetEffects(); resetCamera(); }
    previousTime = now;
    const racing = state.phase === 'racing';
    if (racing && player) {
      const landed = (wasAirborne && !player.airborne && !player.crashed) || (!!player.landing && !wasLanding);
      if (landed) {
        emit(2, now, player, reducedMotion ? .75 : 1.6, 0, true);
        if (!reducedMotion) emit(0, now, player, 1.65, 0, true);
      }
      const lean = player.lean || 0, speed = state.speedKmh || 0;
      if (!player.airborne && !player.crashed && speed > 20 && Math.abs(lean) > .28) {
        emit(0, now, player, reducedMotion ? .55 : 1.25, -lean * .45);
        if (!reducedMotion && Math.abs(lean) > .52) emit(1, now, player, .85, Math.sign(lean) * -.55);
      }
      if (!reducedMotion && (player.boosting || speed > 95)) emit(3, now, player, 1, 0, !!player.boosting && !wasBoosting);
      wasAirborne = !!player.airborne; wasLanding = !!player.landing; wasBoosting = !!player.boosting;
    }
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    activeCount = 0;
    for (const slot of slots) {
      const age = now - slot.start, spec = specs[slot.type];
      if (!slot.active || !racing || age >= (reducedMotion ? Math.min(.3, spec.durationSeconds) : spec.durationSeconds)) {
        slot.active = false; slot.mesh.visible = false; continue;
      }
      slot.mesh.visible = true; activeCount++;
      const sampleAge = reducedMotion ? age * spec.durationSeconds / .3 : age;
      uvFrame(slot, Math.min(spec.frameCount - 1, Math.floor(sampleAge * spec.fps)));
      slot.mesh.material.opacity = opacityAt(spec, sampleAge) * (reducedMotion ? .28 : slot.type === 3 ? .45 : .68);
      slot.mesh.quaternion.copy(camera.quaternion); slot.mesh.rotateZ(slot.rotation);
      const viewHeightAtOne = 2 * Math.tan(camera.fov * Math.PI / 360);
      if (slot.type === 3) {
        // A single, small peripheral panel: bounded to 15% screen and never over
        // the central rider. HTML HUD stays above the WebGL canvas.
        const viewHeight = viewHeightAtOne * 2, viewWidth = viewHeight * camera.aspect;
        slot.mesh.position.set(-viewWidth * .39, -viewHeight * .04, -2).applyQuaternion(camera.quaternion).add(camera.position);
        slot.mesh.scale.setScalar(viewHeight * Math.sqrt(.12 * camera.aspect));
      } else {
        delta.subVectors(slot.mesh.position, camera.position);
        const depth = Math.max(.1, delta.dot(forward));
        const maxSize = viewHeightAtOne * depth * Math.sqrt(spec.lowEnd.maxScreenFractionPerInstance * camera.aspect);
        slot.mesh.scale.setScalar(Math.min(slot.size * (1 + Math.min(1, age / spec.durationSeconds) * .3), maxSize));
      }
    }
  }

  // A fall does not pause or replay the simulation. Its authored Hermite path is
  // sampled inside the existing crash window and blends out as control returns.
  const anchor = new THREE.Vector3(), capturedPos = new THREE.Vector3(), capturedTarget = new THREE.Vector3();
  const pathPos = new THREE.Vector3(), pathTarget = new THREE.Vector3(), releasePos = new THREE.Vector3(), releaseTarget = new THREE.Vector3();
  const livePos = new THREE.Vector3(), liveTarget = new THREE.Vector3(), ground = new THREE.Vector3(), frame = {};
  let cameraActive = false, wasCrashed = false, crashAt = -10, releaseAt = -10, capturedFov = 60, releaseFov = 60, anchorSin = 0, anchorCos = 1, anchorS = 0, anchorX = 0;
  const cameraDuration = Math.max(.6, Number(crashSeconds) || 1.8);
  const entryDuration = Math.min(fall.entry.durationSeconds, cameraDuration * .22);
  const exitDuration = Math.min(fall.exit.durationSeconds, cameraDuration * .22);
  const pathDuration = Math.max(.1, cameraDuration - entryDuration - exitDuration);
  let cameraRuns = 0;
  function hermite(a, b, ma, mb, u, span) {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * ma * span + (-2 * u3 + 3 * u2) * b + (u3 - u2) * mb * span;
  }
  function samplePath(seconds) {
    const points = fall.points;
    let index = 0;
    while (index < points.length - 2 && seconds > points[index + 1].time) index++;
    const a = points[index], b = points[index + 1], span = b.time - a.time, u = Math.max(0, Math.min(1, (seconds - a.time) / span));
    for (let axis = 0; axis < 3; axis++) {
      pathPos.setComponent(axis, hermite(a.position[axis], b.position[axis], a.positionTangent[axis], b.positionTangent[axis], u, span));
      pathTarget.setComponent(axis, hermite(a.target[axis], b.target[axis], a.targetTangent[axis], b.targetTangent[axis], u, span));
    }
    const x = pathPos.x, z = pathPos.z;
    pathPos.set(anchor.x + x * anchorCos - z * anchorSin, anchor.y + pathPos.y, anchor.z + x * anchorSin + z * anchorCos);
    worldPoint(anchorS - z, anchorX + x, surfaceHeight(anchorX + x) + .65, ground);
    pathPos.y = Math.max(pathPos.y, ground.y);
    const tx = pathTarget.x, tz = pathTarget.z;
    pathTarget.set(anchor.x + tx * anchorCos - tz * anchorSin, anchor.y + pathTarget.y, anchor.z + tx * anchorSin + tz * anchorCos);
    return hermite(a.fov, b.fov, a.fovTangent, b.fovTangent, u, span);
  }
  function resetCamera() { cameraActive = wasCrashed = false; releaseAt = -10; }
  function applyCamera(state, camera, target) {
    if (disposed || reducedMotion || state.phase === 'paused') return false;
    const now = (state.timeMs || 0) / 1000, player = state.player;
    if (state.phase !== 'racing' || !player) { resetCamera(); return false; }
    const crashed = !!player.crashed;
    if (crashed && !wasCrashed) {
      crashAt = now; releaseAt = -10; cameraActive = true; cameraRuns++;
      capturedPos.copy(camera.position); capturedTarget.copy(target); capturedFov = camera.fov;
      anchorS = player.s ?? 0; anchorX = player.x ?? 0;
      worldPoint(anchorS, anchorX, surfaceHeight(anchorX), anchor);
      frameAt(anchorS, frame); anchorSin = Math.sin(frame.theta); anchorCos = Math.cos(frame.theta);
    }
    // The source track is a replay. In live play leave it softly as soon as the
    // moving rider would leave its anchored frame, even if recovery is not over.
    if (cameraActive && releaseAt < 0 && ((!crashed && wasCrashed) || Math.abs((player.s ?? 0) - anchorS) > 6)) releaseAt = now;
    wasCrashed = crashed;
    if (!cameraActive) return false;
    livePos.copy(camera.position); liveTarget.copy(target); const liveFov = camera.fov;
    if (releaseAt >= 0) {
      const a = smoother((now - releaseAt) / Math.min(.35, exitDuration));
      camera.position.lerpVectors(releasePos, livePos, a); target.lerpVectors(releaseTarget, liveTarget, a); camera.fov = releaseFov + (liveFov - releaseFov) * a;
      if (a >= 1) cameraActive = false;
    } else {
      const age = now - crashAt;
      const pathTime = smoother((age - entryDuration) / pathDuration) * fall.pathDurationSeconds;
      const pathFov = samplePath(pathTime);
      if (age < entryDuration) {
        const a = smoother(age / entryDuration); camera.position.lerpVectors(capturedPos, pathPos, a); target.lerpVectors(capturedTarget, pathTarget, a); camera.fov = capturedFov + (pathFov - capturedFov) * a;
      } else if (age > cameraDuration - exitDuration) {
        const a = smoother((age - cameraDuration + exitDuration) / exitDuration); camera.position.lerpVectors(pathPos, livePos, a); target.lerpVectors(pathTarget, liveTarget, a); camera.fov = pathFov + (liveFov - pathFov) * a;
        if (a >= 1) cameraActive = false;
      } else { camera.position.copy(pathPos); target.copy(pathTarget); camera.fov = pathFov; }
      releasePos.copy(camera.position); releaseTarget.copy(target); releaseFov = camera.fov;
    }
    camera.updateProjectionMatrix(); return cameraActive;
  }
  return {
    update, applyCamera,
    warmUp() {
      if (disposed) return;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]; slot.type = i; slot.frame = -1; slot.mesh.material.map = layouts[i].texture;
        slot.mesh.material.opacity = .01; slot.mesh.visible = true; worldPoint(3 + i, 0, .5, slot.mesh.position); uvFrame(slot, 1);
      }
      warmed = true;
    },
    reset() { resetEffects(); resetCamera(); previousTime = -1; },
    metrics: () => ({active: activeCount, capacity: 3, textures: 3, textureBytes: 3 * 512 * 512 * 4, spawned, cameraActive, cameraRuns, cameraDuration, sourceCameraDuration: fall.durationSeconds, warmed, disposed}),
    dispose() {
      if (disposed) return; disposed = true; group.removeFromParent();
      for (const slot of slots) { slot.mesh.geometry.dispose(); slot.mesh.material.dispose(); }
      for (const texture of textures) texture.dispose();
      packed.width = packed.height = 1;
    },
  };
}
