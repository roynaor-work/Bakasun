import * as THREE from '../vendor/three.module.js';
import {navalWorldPoint} from './naval-camera.mjs?v=island-v2-20261107-23';
import {SINKING_BUBBLES, WATER_COLUMN} from './naval-visual-atlases.mjs?v=island-v2-20261107-23';

const MAX_SINKING_SHIPS = 3;
const NEAR_MISS_RADIUS = 6;

function createAtlasBillboards(scene, asset, capacity, textureLoader) {
  const {anchorX, anchorY, columns, frameWidth, frameHeight, gutter, width, height} = asset;
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(.5 - anchorX / frameWidth, anchorY / frameHeight - .5, 0);
  const frames = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  frames.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('effectFrame', frames);

  const material = new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, toneMapped: false});
  const frameScale = new THREE.Vector2((frameWidth - 1) / width, (frameHeight - 1) / height);
  material.onBeforeCompile = shader => {
    shader.uniforms.effectFrameScale = {value: frameScale};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 effectFrame; varying float vEffectOpacity; uniform vec2 effectFrameScale;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = effectFrame.xy + vMapUv * effectFrameScale;\n#endif\nvEffectOpacity = effectFrame.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEffectOpacity;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vEffectOpacity;');
  };
  material.customProgramCacheKey = () => 'naval-battle-atlas-billboards-v1';

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.noReflect = true;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  let ready = false;
  let disposed = false;
  let texture;

  async function load() {
    try {
      const loaded = await textureLoader.loadAsync(asset.source);
      if (disposed) {
        loaded.dispose();
        return;
      }
      texture = loaded;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      material.map = texture;
      material.needsUpdate = true;
      ready = true;
    } catch {
      // The regular water and damage effects remain visible if an atlas fails.
    }
  }
  void load();

  return {
    get ready() { return ready; },
    get count() { return mesh.count; },
    set(slot, frame, opacity, point, camera, size) {
      const left = (frame % columns) * (frameWidth + gutter * 2) + gutter;
      const top = Math.floor(frame / columns) * (frameHeight + gutter * 2) + gutter;
      frames.setXYZ(slot, (left + .5) / width, 1 - (top + frameHeight - .5) / height, opacity);
      dummy.position.set(point.x, .04, point.z);
      dummy.rotation.y = Math.atan2(camera.position.x - point.x, camera.position.z - point.z);
      dummy.scale.set(size, size * frameHeight / frameWidth, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
    },
    finish(count) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (count) mesh.instanceMatrix.needsUpdate = frames.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(mesh);
      mesh.count = 0;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}

function isNearHull(point, ships, balance) {
  return ships.some(ship => {
    if (ship.active === false || ship.hp <= 0 || ship.structure || ship.depth > 0) return false;
    const hull = navalWorldPoint(ship.x, ship.z, balance);
    return Math.hypot(point.x - hull.x, point.z - hull.z) <= NEAR_MISS_RADIUS;
  });
}

export function createNavalBattleVisuals(scene, model, balance, textureLoader = new THREE.TextureLoader()) {
  const bubbles = createAtlasBillboards(scene, SINKING_BUBBLES, MAX_SINKING_SHIPS, textureLoader);
  const column = createAtlasBillboards(scene, WATER_COLUMN, 1, textureLoader);
  const player = [model.playerShip];
  const ships = [model.playerShip, ...model.enemies];
  let lastBlast;
  let nearMiss;
  let disposed = false;

  return {
    update(camera) {
      if (disposed) return;
      let count = 0;
      if (bubbles.ready) {
        for (const ship of ships) {
          if (ship.structure || ship.hp > 0 || !Number.isFinite(ship.sunkAt)) continue;
          const progress = (model.time - ship.sunkAt) / balance.sinkSeconds;
          if (!(progress > 0 && progress < 1)) continue;
          const frame = Math.min(SINKING_BUBBLES.frameCount - 1, Math.floor(progress * SINKING_BUBBLES.frameCount));
          const opacity = .82 * Math.sin(Math.PI * progress);
          bubbles.set(count++, frame, opacity, navalWorldPoint(ship.x, ship.z, balance), camera, 3.5);
          if (count === MAX_SINKING_SHIPS) break;
        }
      }
      bubbles.finish(count);

      let showColumn = false;
      if (column.ready) {
        const blast = model.blast;
        if (blast.life > 0 && Number.isFinite(blast.at) &&
            (blast.at !== lastBlast?.at || blast.x !== lastBlast.x || blast.z !== lastBlast.z)) {
          lastBlast = {at: blast.at, x: blast.x, z: blast.z};
          if (!blast.hit && !blast.overDiver) {
            const point = navalWorldPoint(blast.x, blast.z, balance);
            if (isNearHull(point, blast.owner === 'player' ? model.enemies : player, balance)) {
              nearMiss = {at: blast.at, point};
            }
          }
        }
        const frame = nearMiss ? Math.floor((model.time - nearMiss.at) * WATER_COLUMN.fps + 1e-9) : -1;
        // The first and last authored frames are transparent.
        if (frame > 0 && frame < WATER_COLUMN.frameCount - 1) {
          column.set(0, frame, .78, nearMiss.point, camera, 3.6);
          showColumn = true;
        }
      }
      column.finish(Number(showColumn));
    },
    metrics() {
      return {bubbles: bubbles.count, waterColumns: column.count, bubblesReady: bubbles.ready, waterColumnReady: column.ready};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bubbles.dispose();
      column.dispose();
    },
  };
}
