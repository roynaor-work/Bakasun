export function pose({ angle = 180, feet = 1, hands = .54, footConfidence = 1 } = {}) {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1, presence: 1 }));
  const set = (i, x, y) => Object.assign(p[i], { x, y });
  set(0, .5, .15); set(7, .46, .17); set(8, .54, .17);
  set(11, .4, .3); set(12, .6, .3); set(13, .38, .4); set(14, .62, .4);
  set(15, .36, hands); set(16, .64, hands); set(23, .44, .55); set(24, .56, .55);
  set(25, .44, .73); set(26, .56, .73);
  for (const i of [27, 29, 31]) set(i, .5 - .1 * feet, .92);
  for (const i of [28, 30, 32]) set(i, .5 + .1 * feet, .92);
  for (const i of [29, 30, 31, 32]) p[i].visibility = p[i].presence = footConfidence;
  const world = p.map(q => ({ ...q }));
  for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
    const x = world[h].x;
    world[h] = { x, y: .5, z: 0 }; world[k] = { x, y: .7, z: 0 };
    world[a] = { x, y: .7 - Math.cos(angle * Math.PI / 180) * .2, z: Math.sin(angle * Math.PI / 180) * .2 };
  }
  return { p, world };
}

export function floorPose({ elbow = 180, bridge = 115, badForm = false, farHidden = true, arch = false } = {}) {
  const sample = pose(), { p, world } = sample;
  const set = (i, x, y) => Object.assign(p[i], { x, y });
  set(0, .12, .5); set(7, .13, .5); set(8, .13, .51);
  for (const shift of [0, 1]) {
    set(11 + shift, .22, .6); set(13 + shift, .24, .72); set(15 + shift, .26, .85);
    set(23 + shift, .48, arch ? .42 : .6); set(25 + shift, .69, .6);
    for (const i of [27, 29, 31]) set(i + shift, .86, .65);
    world[11 + shift] = { x: 0, y: 0, z: 0 };
    world[13 + shift] = { x: 0, y: .2, z: 0 };
    world[15 + shift] = { x: Math.sin(elbow * Math.PI / 180) * .2, y: .2 - Math.cos(elbow * Math.PI / 180) * .2, z: 0 };
    world[23 + shift] = { x: .3, y: badForm ? .2 : 0, z: 0 };
    world[25 + shift] = { x: .3 + Math.cos((180 - bridge) * Math.PI / 180) * .25,
      y: Math.sin((180 - bridge) * Math.PI / 180) * .25, z: 0 };
    world[27 + shift] = { x: .75, y: 0, z: 0 };
  }
  if (farHidden) for (const i of [12, 14, 16, 24, 26, 28, 30, 32]) p[i].visibility = .1;
  return sample;
}

export function lungePose({ angle = 180, side = 'left', lean = false } = {}) {
  const sample = pose({ angle });
  const other = pose();
  for (const i of side === 'left' ? [24, 26, 28] : [23, 25, 27]) sample.world[i] = other.world[i];
  if (angle < 157) sample.world[side === 'left' ? 27 : 28].z *= -1;
  if (lean) for (const i of [11, 12]) sample.world[i].z -= .15;
  return sample;
}

export function person(sample, { x = .3, size = .7 } = {}) {
  const transform = p => ({ ...p, x: x + (p.x - .5) * size, y: .94 + (p.y - .92) * size });
  return { landmarks: sample.p.map(transform), world: structuredClone(sample.world) };
}
