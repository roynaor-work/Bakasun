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
