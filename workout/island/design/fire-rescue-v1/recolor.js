// Original work, CC0-1.0. Source and dedication: LICENSES.md.
import {Color} from '../../vendor/three.module.js';

const originals = new WeakMap();
const slots = ['uniform_primary', 'uniform_secondary'];

/** Repaint COLOR_0 using exported per-vertex masks; retain one shared material.
 * Pass the loaded girl glTF scene and two sRGB hex colors. Omitted slots reset
 * to their authored colors. Skin, hair, face and shoes retain their base colors.
 */
export function applyUniform(scene, palette = {}) {
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.hasAttribute('_uniform_primary')) return;
    const geometry = mesh.geometry;
    const colors = geometry.getAttribute('color');
    if (!originals.has(geometry)) originals.set(geometry, colors.array.slice());
    colors.array.set(originals.get(geometry));
    for (const slot of slots) {
      if (!palette[slot]) continue;
      const color = new Color(palette[slot]); // sRGB input -> linear COLOR_0.
      const mask = geometry.getAttribute(`_${slot}`);
      for (let i = 0; i < colors.count; i++) {
        if (mask.getX(i) > .5) colors.setXYZ(i, color.r, color.g, color.b);
      }
    }
    colors.needsUpdate = true;
  });
}
