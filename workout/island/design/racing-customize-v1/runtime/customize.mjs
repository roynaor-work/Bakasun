// CC0-1.0. Dependency injection keeps this adapter compatible with local Three.
// Run before the game's mergeFormula(), which erases FrontWing/RearWing/Helmet.
export function createCustomizer({T, car, manifest, loadGLB, DecalGeometry, stripeTexture, decalTexture}) {
  const profile = manifest.compatibility, root = car.getObjectByName(profile.root);
  if (!root || !root.getObjectByName('Body')) throw new Error('Expected the original named Formula scene');
  for (const name of ['FrontWing', 'RearWing', 'Helmet', ...profile.mounts.wheels.instances.map(x => x.node)]) {
    if (!root.getObjectByName(name)) throw new Error(`Missing original Formula node: ${name}`);
  }
  const items = new Map(manifest.items.map(i => [i.id, i])), equipped = {}, mounts = {}, hidden = new Map(), generated = [];
  const revisions = {}, cache = new Map(), createdMounts = [], wheelNodes = [];
  const originalBindings = new Map(), carPaints = new Map();
  let disposed = false, stripeMeshes = [], decalMeshes = [], effectRoot = null;
  const state = {bodyPaint: manifest.defaults.bodyPaint, stripePaint: manifest.defaults.stripePaint};
  const eachMaterial = (object, action) => object.traverse(o => {if (o.isMesh) for (const m of [].concat(o.material)) action(m);});

  function getItem(id, slot) {
    const item = items.get(id);
    if (!item || item.slot !== slot || !item.compatibility.includes(profile.profile)) throw new Error(`Incompatible ${slot}: ${id}`);
    return item;
  }
  root.traverse(o => {
    if (!o.isMesh) return;
    const list = [].concat(o.material);
    if (!list.some(m => m.name === profile.paintMaterial)) return;
    originalBindings.set(o, o.material);
    const copies = list.map(m => {
      if (m.name !== profile.paintMaterial) return m;
      if (!carPaints.has(m)) carPaints.set(m, m.clone());
      return carPaints.get(m);
    });
    o.material = Array.isArray(o.material) ? copies : copies[0];
  });
  for (const slot of ['frontWing', 'rearWing', 'helmet', 'effect']) {
    const binding = profile.mounts[slot];
    let mount = root.getObjectByName(binding.node);
    if (!mount) {mount = new T.Group(); mount.name = binding.node; mount.position.fromArray(binding.translation); root.add(mount); createdMounts.push(mount);}
    mounts[slot] = mount;
  }
  for (const instance of profile.mounts.wheels.instances) {
    const mount = new T.Group(); mount.name = instance.node + '_custom';
    mount.position.fromArray(instance.translation); mount.scale.fromArray(instance.scale); mount.rotation.order = 'YXZ';
    root.add(mount); createdMounts.push(mount); wheelNodes.push(mount);
  }

  function hideOriginal(name) {
    const node = root.getObjectByName(name);
    if (!hidden.has(node)) hidden.set(node, node.visible);
    node.visible = false;
  }
  function tint() {
    const body = getItem(state.bodyPaint, 'paint').body, stripe = getItem(state.stripePaint, 'paint').body;
    eachMaterial(root, mat => {
      if (mat.name === profile.paintMaterial) {mat.color.set(body); mat.metalness = .48; mat.roughness = .25;}
      if (mat.name === 'Paint Stripes') mat.color.set(stripe);
    });
  }

  // Project in the Formula's local frame even if a race moves/rotates the car.
  function project(texture, position, size, name, color) {
    if (!DecalGeometry || !texture) return [];
    root.updateWorldMatrix(true, true);
    const inverse = new T.Matrix4().copy(root.matrixWorld).invert(), meshes = [];
    root.getObjectByName('Body').traverse(surface => {
      if (!surface.isMesh) return;
      const proxy = new T.Mesh(surface.geometry);
      proxy.matrixWorld.multiplyMatrices(inverse, surface.matrixWorld);
      const geometry = new DecalGeometry(proxy, new T.Vector3().fromArray(position),
        new T.Euler().fromArray([...manifest.paint.orientation, 'XYZ']), new T.Vector3().fromArray(size));
      if (!geometry.attributes.position.count) {geometry.dispose(); return;}
      const material = new T.MeshStandardMaterial({name, color, map: texture, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, roughness: .32, metalness: .2});
      const mesh = new T.Mesh(geometry, material); mesh.name = name; mesh.renderOrder = name === 'Paint Stripes' ? 1 : 2;
      root.add(mesh); meshes.push(mesh);
    });
    return meshes;
  }
  function removeOverlays(list) {for (const mesh of list) {mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose();}}
  function stripeLayer() {
    removeOverlays(stripeMeshes);
    stripeMeshes = manifest.paint.projectors.flatMap(p => project(stripeTexture, p.position, p.size, 'Paint Stripes', '#ffffff'));
    tint();
  }
  stripeLayer();

  async function equip(slot, id) {
    if (disposed) throw new Error('Customizer disposed');
    const item = getItem(id, slot), revision = revisions[slot] = (revisions[slot] || 0) + 1;
    if (slot === 'decal') {
      const texture = await decalTexture(item.asset);
      if (disposed || revisions[slot] !== revision) return false;
      removeOverlays(decalMeshes);
      const def = manifest.decals;
      decalMeshes = [def, ...def.secondaryProjectors].flatMap(p => project(texture, p.position, p.size, 'Decal', '#fff8dc'));
      state.decal = id; return true;
    }
    if (!cache.has(id)) cache.set(id, Promise.resolve().then(() => loadGLB(item.asset)).catch(error => {cache.delete(id); throw error;}));
    const source = await cache.get(id);
    if (disposed || revisions[slot] !== revision) return false;
    if (!source.getObjectByName('Mount')) throw new Error(`Asset missing Mount: ${id}`);
    const copies = [];
    for (const mount of slot === 'wheels' ? wheelNodes : [mounts[slot]]) {
      const instance = source.clone(true), cloned = new Map();
      eachMaterial(instance, material => {if (!cloned.has(material)) cloned.set(material, material.clone());});
      instance.traverse(o => {if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => cloned.get(m)) : cloned.get(o.material);});
      mount.add(instance); copies.push(instance);
      generated.push(instance);
    }
    for (const old of equipped[slot] || []) {
      old.removeFromParent(); eachMaterial(old, m => m.dispose());
      const index = generated.indexOf(old); if (index >= 0) generated.splice(index, 1);
    }
    equipped[slot] = copies;
    for (const name of slot === 'wheels' ? profile.mounts.wheels.instances.map(x => x.node) : profile.mounts[slot].replace) hideOriginal(name);
    if (slot === 'effect') effectRoot = copies[0];
    state[slot] = id; tint(); return true;
  }

  function setPaint(layer, id) {
    if (disposed) throw new Error('Customizer disposed');
    if (!['body', 'stripes'].includes(layer)) throw new Error('Expected body or stripes paint layer');
    getItem(id, 'paint'); state[layer === 'body' ? 'bodyPaint' : 'stripePaint'] = id; tint();
  }
  function animateWheels(spin, steer = 0) {
    for (const wheel of wheelNodes) {wheel.rotation.x = spin; if (wheel.name.startsWith('WheelFront')) wheel.rotation.y = steer;}
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    removeOverlays(stripeMeshes); removeOverlays(decalMeshes);
    for (const obj of generated) {obj.removeFromParent(); eachMaterial(obj, m => m.dispose());}
    for (const mount of createdMounts) mount.removeFromParent();
    for (const [node, visible] of hidden) node.visible = visible;
    for (const [mesh, material] of originalBindings) mesh.material = material;
    for (const material of carPaints.values()) material.dispose();
    cache.clear();
  }
  return {equip, setPaint, animateWheels, dispose, snapshot: () => ({...state}),
    effectRoot: () => effectRoot, wheels: wheelNodes,
    metrics: () => ({mountedObjects: generated.length, stripeMeshes: stripeMeshes.length, decalMeshes: decalMeshes.length,
      hiddenOriginals: [...hidden.keys()].map(o => o.name), disposed})};
}
