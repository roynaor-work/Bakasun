// Original CC0-1.0. Source and dedication: ./LICENSES.md.
// Uses the repository's existing, unmodified Three.js r160 runtime (MIT).
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

export const TEAM_COLORS = Object.freeze([
  '#d93228', '#18b6bd', '#d6aa3b', '#566bd1', '#b7c2ca', '#e07b39',
  '#7ac05a', '#a05fc4', '#e0c3a1', '#4b6a88', '#2b2f36', '#e8e6d2',
]);
export const TEAM_ACCENTS = Object.freeze([
  '#f4f5f2', '#14181c', '#ffd166', '#06d6a0', '#ef476f', '#8ecae6',
]);
export const LOD_DISTANCES = Object.freeze([0, 18, 42]);
const WHEELS = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
const OFFSETS = Object.freeze({
  wing_front: [0, .55, 1.05],
  wheel_fl: [.72, .48, .20], wheel_fr: [-.72, .48, .20],
  wheel_rl: [.72, .40, -.20], wheel_rr: [-.72, .40, -.20],
  mirror_l: [.48, .73, .15], mirror_r: [-.48, .73, .15],
});

export function countTriangles(object) {
  let count = 0;
  object.traverse(part => {
    if (part.isMesh) count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
  });
  return count;
}

export async function loadFormulaTemplates() {
  const loader = new GLTFLoader(); // Plain GLB: no decoder, textures or external buffers.
  return Promise.all([0, 1, 2].map(async level => {
    const {scene} = await loader.loadAsync(new URL(`./assets/formula-lod${level}.glb`, import.meta.url).href);
    return scene.getObjectByName('formula_car');
  }));
}

/** One clone owns its seven material instances; geometry remains shared with the template. */
export function createFormulaCar(template, {color = TEAM_COLORS[0], accent = TEAM_ACCENTS[0]} = {}) {
  const root = template.clone(true);
  const materials = new Map();
  root.traverse(part => {
    if (!part.isMesh) return;
    const clone = original => {
      if (!materials.has(original.name)) materials.set(original.name, original.clone());
      return materials.get(original.name);
    };
    part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
    part.castShadow = true;
    part.receiveShadow = true;
  });
  const wheels = WHEELS.map(name => root.getObjectByName(name));
  const steering = root.getObjectByName('steer_front');
  const spindles = ['steer_fl', 'steer_fr'].map(name => steering.getObjectByName(name));
  const debris = Object.entries(OFFSETS).map(([name, vector]) => {
    const node = root.getObjectByName(name);
    return {node, vector, rest: node.position.clone()};
  });
  let disposed = false;
  const api = {
    root, materials, steering, wheels, triangles: countTriangles(root),
    /** Accepts {color} from league TEAMS, optionally {accent} from the appearance palette. */
    paint(team) {
      if (team.color != null) materials.get('body_team').color.set(team.color);
      if (team.accent != null) materials.get('wing_team').color.set(team.accent);
      if (team.secondary != null) materials.get('secondary').color.set(team.secondary);
    },
    /** Metres travelled and steering in radians. Two local spindle pivots prevent axle orbit. */
    motion(distance = 0, steer = 0) {
      const angle = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, steer));
      steering.userData.angle = angle;
      for (const spindle of spindles) spindle.rotation.y = angle;
      for (const wheel of wheels) wheel.rotation.x = distance / wheel.userData.radius;
    },
    /** Reversible rigid-part demonstration. For actual crashes, detach with scene.attach(node). */
    explode(amount = 0) {
      const t = Math.max(0, Math.min(1, amount));
      for (const {node, vector, rest} of debris) {
        node.position.copy(rest);
        node.position.x += vector[0] * t;
        node.position.y += vector[1] * t;
        node.position.z += vector[2] * t;
        node.rotation.z = vector[0] * t * .7;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of materials.values()) material.dispose();
      root.removeFromParent();
    },
  };
  api.paint({color, accent});
  return api;
}
