import * as THREE from './vendor/three.module.js';

/** One reusable opening celebration per building instance. Caller owns update/dispose. */
export function createOpeningEffect(parent, {anchor = [0, 2, 0], reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, seed = 23} = {}) {
  const count = 64, duration = 1.65;
  const geometry = new THREE.PlaneGeometry(.075, .115);
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, transparent: true});
  const particles = new THREE.InstancedMesh(geometry, material, count);
  particles.frustumCulled = false;
  particles.visible = false;
  particles.name = 'city-opening-confetti';
  const colors = ['#e9b75d', '#de7f69', '#71b9b5', '#eff1cf'];
  const dummy = new THREE.Object3D(), origin = new THREE.Vector3(...anchor);
  let state = seed >>> 0, elapsed = duration, active = false, disposed = false;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const velocities = Array.from({length: count}, (_, i) => {
    particles.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    const angle = random() * Math.PI * 2, spread = .6 + random() * 1.1;
    return {x: Math.cos(angle) * spread, y: 1.1 + random() * 1.6, z: Math.sin(angle) * spread, spin: random() * 8 - 4, phase: random() * Math.PI};
  });
  parent.add(particles);
  function draw() {
    const t = elapsed;
    for (let i = 0; i < count; i++) {
      const v = velocities[i];
      dummy.position.set(origin.x + v.x * t, origin.y + v.y * t - 2.1 * t * t, origin.z + v.z * t);
      dummy.rotation.set(v.phase + t * v.spin, t * v.spin * .7, v.phase + t * v.spin);
      dummy.scale.setScalar(.8 + (i % 3) * .15);
      dummy.updateMatrix(); particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;
    material.opacity = Math.min(1, Math.max(0, (duration - elapsed) / .42));
  }
  return {
    get active() { return active; },
    get age() { return elapsed; },
    particles, duration,
    play() {
      if (disposed) throw new Error('Opening effect has been disposed');
      // The UI gives a quiet completed-state announcement when motion is reduced.
      if (reducedMotion) return false;
      active = true; elapsed = 0; particles.visible = true; draw(); return true;
    },
    update(deltaSeconds) {
      if (!active || disposed) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, Math.min(.1, deltaSeconds)));
      draw();
      if (elapsed >= duration) { active = false; particles.visible = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; parent.remove(particles);
      geometry.dispose(); material.dispose(); particles.dispose();
    },
  };
}
