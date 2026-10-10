/** CPU equivalent of three r160 morph/skin vertex and normal shader stages.
 * Shared by Node verification and browser roundtrip checks; no renderer state.
 */
import { Vector3, Matrix3, Matrix4 } from './vendor/three.module.js';

const morph = new Vector3(), base = new Vector3();
const skin = new Matrix4(), bone = new Matrix4(), skinNormal = new Matrix3();
const worldNormal = new Matrix3();

export function deformedVertex(mesh, index, target = new Vector3(), world = true) {
  // getVertexPosition applies morphs first and, for SkinnedMesh, skinning next.
  mesh.getVertexPosition(index, target);
  return world ? target.applyMatrix4(mesh.matrixWorld) : target;
}

export function deformedNormal(mesh, index, target = new Vector3(), world = true) {
  const geometry = mesh.geometry, normal = geometry.attributes.normal;
  if (!normal) return target.set(0, 0, 0);
  target.fromBufferAttribute(normal, index); base.copy(target);
  const targets = geometry.morphAttributes.normal || [];
  for (let j = 0; j < targets.length; j++) {
    const weight = mesh.morphTargetInfluences?.[j] || 0;
    if (!weight) continue;
    morph.fromBufferAttribute(targets[j], index);
    if (!geometry.morphTargetsRelative) morph.sub(base);
    target.addScaledVector(morph, weight);
  }
  if (mesh.isSkinnedMesh) {
    skin.elements.fill(0);
    const indices = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    for (let slot = 0; slot < 4; slot++) {
      const weight = weights.array[index * 4 + slot];
      if (!weight) continue;
      bone.fromArray(mesh.skeleton.boneMatrices, indices.array[index * 4 + slot] * 16);
      for (let k = 0; k < 16; k++) skin.elements[k] += weight * bone.elements[k];
    }
    skin.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    target.applyMatrix3(skinNormal.setFromMatrix4(skin));
  }
  if (world) target.applyMatrix3(worldNormal.getNormalMatrix(mesh.matrixWorld));
  return target.normalize();
}
