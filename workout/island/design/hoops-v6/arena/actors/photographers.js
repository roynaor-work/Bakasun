/** Freeze the supplied fictional LOD1 athlete in a crouched photographer pose.
 * Geometry is baked once, then four operators share one InstancedMesh draw call.
 * The supplied GLTF and source materials remain unchanged.
 */
export function createPhotographers(THREE, gltf, clone) {
  const group = new THREE.Group(); group.name = 'courtside-photographers';
  const posed = clone(gltf.scene);
  const mixer = new THREE.AnimationMixer(posed);
  const idle = gltf.animations.find(clip => clip.name === 'idle');
  if (idle) { mixer.clipAction(idle).play(); mixer.setTime(.35); }
  // GLTFLoader sanitizes ':' from names before binding animation tracks.
  const bones = new Map(); posed.traverse(node => { if (node.isBone) bones.set(node.name.replace(/[^a-z0-9]/gi, '').toLowerCase(), node); });
  const boneFor = name => bones.get(('mixamorig' + name).toLowerCase());
  const rotate = (name, x, y = 0, z = 0) => {
    const bone = boneFor(name);
    if (bone) bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  };
  const hips = boneFor('Hips');
  if (hips) hips.position.y -= .58;
  rotate('Spine', .15); rotate('Head', -.12);
  // World-space targets account for the source skeleton's nonstandard local bone axes.
  const aim = (name, childName, target) => {
    const bone = boneFor(name), child = boneFor(childName); if (!bone || !child) return;
    posed.updateMatrixWorld(true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const current = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const desired = new THREE.Vector3(...target).sub(origin).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(world));
  };
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    aim(side + 'UpLeg', side + 'Leg', [sign * .13, .3, .42]);
    aim(side + 'Leg', side + 'Foot', [sign * .13, .065, .015]);
    aim(side + 'Arm', side + 'ForeArm', [sign * .23, .79, .22]);
    aim(side + 'ForeArm', side + 'Hand', [sign * .11, .69, .39]);
  }
  posed.updateMatrixWorld(true);
  let skin; posed.traverse(node => { if (node.isSkinnedMesh) skin = node; });
  if (!skin) return { group, stats: { count: 0, triangles: 0, drawCalls: 0 } };
  skin.skeleton.update();
  const geometry = skin.geometry.clone();
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const original = skin.geometry.attributes.position, normal = skin.geometry.attributes.normal;
  const point = new THREE.Vector3(), direction = new THREE.Vector3(), endpoint = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(original, i);
    direction.fromBufferAttribute(normal, i);
    endpoint.copy(point).add(direction);
    skin.applyBoneTransform(i, point); skin.applyBoneTransform(i, endpoint);
    direction.copy(endpoint).sub(point).normalize();
    positions.setXYZ(i, point.x, point.y, point.z);
    normals.setXYZ(i, direction.x, direction.y, direction.z);
  }
  geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
  // Recompute tangents after the pose deformation using the authored unified UV set.
  geometry.computeTangents(); geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.drawImage(skin.material.map.image, 0, 0, 1024, 1024);
  ctx.fillStyle = '#343b42'; ctx.fillRect(256, 512, 256, 256);
  ctx.fillStyle = '#171d24'; ctx.fillRect(512, 512, 256, 256);
  ctx.fillStyle = '#727a80'; ctx.fillRect(768, 512, 256, 256);
  const map = new THREE.CanvasTexture(canvas); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace;
  const material = skin.material.clone(); material.map = map; material.roughness = .8;
  const operators = new THREE.InstancedMesh(geometry, material, 4);
  operators.name = 'four-posed-courtside-camera-operators';
  const transform = new THREE.Object3D();
  [[-14.9, -4], [-14.9, 4], [14.9, -4], [14.9, 4]].forEach(([x, z], index) => {
    transform.position.set(x, .02, z);
    transform.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    transform.updateMatrix(); operators.setMatrixAt(index, transform.matrix);
  });
  operators.castShadow = false; operators.receiveShadow = true;
  group.add(operators); mixer.stopAllAction(); mixer.uncacheRoot(posed);
  return {
    group,
    stats: { count: 4, triangles: geometry.index.count / 3 * 4, drawCalls: 1, textureAtlas: [1024, 1024], pose: 'frozen crouch derived from source idle' },
    dispose() { geometry.dispose(); material.dispose(); map.dispose(); }
  };
}
