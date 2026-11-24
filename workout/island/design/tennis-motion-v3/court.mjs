// SPDX-License-Identifier: CC0-1.0
import * as T from '../tennis-motion-v2/vendor/three.module.js';

function clayTexture() {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const ctx = tile.getContext('2d');
  const pixels = ctx.createImageData(tile.width, tile.height);
  let seed = 7;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grit = Math.round(((seed / 4294967296) - 0.5) * 26);
    pixels.data.set([180 + grit, 112 + grit, 78 + grit, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(tile);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(43, 58);
  texture.anisotropy = 4;
  return texture;
}

export function buildCourt(scene) {
  scene.background = new T.Color(0xd8dfcd);
  scene.fog = new T.FogExp2(0xdce0cd, 0.029);
  scene.add(new T.HemisphereLight(0xfff7e9, 0xc3a493, 1.8));
  const sun = new T.DirectionalLight(0xfff1d2, 2.3);
  sun.position.set(-1.8, 7, -1.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left:-4, right:4, top:4, bottom:-4, near:0.2, far:20});
  sun.shadow.normalBias = 0.012;
  sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xe0eeef, 1.45);
  fill.position.set(2, 3, 5);
  scene.add(fill);

  function box(x, y, z, width, height, depth, material) {
    const item = new T.Mesh(new T.BoxGeometry(width, height, depth), material);
    item.position.set(x, y, z);
    scene.add(item);
    return item;
  }
  const floor = new T.Mesh(
    new T.PlaneGeometry(39, 54),
    new T.MeshStandardMaterial({map: clayTexture(), roughness: 1})
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.014, 10);
  floor.receiveShadow = true;
  scene.add(floor);
  const paint = new T.MeshStandardMaterial({color: 0xf5e4c8, roughness: 1});
  function stripe(x, z, width, depth) {
    const mesh = new T.Mesh(new T.PlaneGeometry(width, depth), paint);
    mesh.position.set(x, -0.012, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const z of [-0.50, 23.27]) stripe(0, z, 10.97, 0.065);
  for (const x of [-5.48, -4.115, 4.115, 5.48]) stripe(x, 11.385, 0.05, 23.77);
  for (const z of [4.985, 17.785]) stripe(0, z, 8.23, 0.05);
  stripe(0, 11.385, 0.05, 12.8);
  stripe(0, -0.42, 0.05, 0.16);
  stripe(0, 23.19, 0.05, 0.16);

  const screen = new T.MeshStandardMaterial({color: 0x214c41, roughness: 1});
  const seam = new T.MeshStandardMaterial({color: 0x2a574b, roughness: 1});
  const frame = new T.MeshStandardMaterial({color: 0x819181, roughness: 0.8});
  const courtCentre = 11.385;
  const screens = [
    [0, -7.5, 0, 24], [0, 30.27, Math.PI, 24],
    [-12, courtCentre, Math.PI / 2, 37.77], [12, courtCentre, -Math.PI / 2, 37.77]
  ];
  for (const [x, z, yaw, width] of screens) {
    const wall = box(x, 1.5, z, width, 3, 0.05, screen);
    wall.rotation.y = yaw;
    const rail = box(x, 3.02, z, width, 0.04, 0.07, frame);
    rail.rotation.y = yaw;
    for (let offset = -width / 2; offset <= width / 2; offset += 3) {
      box(x + Math.cos(yaw) * offset, 1.54, z - Math.sin(yaw) * offset,
        0.06, 3.08, 0.06, seam);
    }
  }
  const net = new T.Group();
  const netWidth = 12.77;
  const netZ = courtCentre;
  const height = x => 0.914 + 0.155 * (Math.abs(x) / (netWidth / 2)) ** 2;
  const cord = [];
  function segment(x1, y1, x2, y2) { cord.push(x1, y1, netZ, x2, y2, netZ); }
  for (let i = 0; i <= 250; i++) {
    const x = netWidth * (i / 250 - 0.5);
    segment(x, 0.04, x, height(x));
  }
  for (let j = 1; j <= 20; j++) {
    for (let i = 0; i < 24; i++) {
      const x1 = netWidth * (i / 24 - 0.5), x2 = x1 + netWidth / 24;
      segment(x1, height(x1) * j / 20, x2, height(x2) * j / 20);
    }
  }
  const grid = new T.BufferGeometry();
  grid.setAttribute('position', new T.Float32BufferAttribute(cord, 3));
  net.add(new T.LineSegments(grid, new T.LineBasicMaterial({color: 0x274237, opacity: .65, transparent: true})));
  const tape = new T.MeshStandardMaterial({color: 0xe3e0cc});
  for (let i = 0; i < 24; i++) {
    const x = netWidth * ((i + .5) / 24 - .5);
    const band = box(x, height(x), netZ, netWidth / 24 + .001, .043, .019, tape);
    net.add(band);
  }
  for (const x of [-netWidth / 2, netWidth / 2]) net.add(box(x, .54, netZ, .065, 1.08, .065, screen));
  scene.add(net);
  return net;
}
