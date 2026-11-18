import * as T from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { atLateral, inRange, runoffWidth, sampleLine, samplePit, smoothstep } from './course.mjs';

const baseRoad = new T.Color('#515664');
const marker = new T.Color('#e7e9e0');
const tau = Math.PI * 2;
const seaLevel = -3.8;
const mix = (a, b, t) => a + (b - a) * t;
const fracture = (n) => n - Math.floor(n);
const carUrl = new URL('../../assets/racing-formula-cars-v1/formula-lod1.glb', import.meta.url).href;

function makeNoiseTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 ** 2; i++) {
    const tone = 153 + Math.round(68 * fracture(Math.sin(i * 123.3499) * 43819.12));
    image.data.set([tone, tone, tone, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Build strips in arc-length order. Offsets follow the engine's horizontal normal.
function strips(ranges, edge, color, { step = 2.6, texture, roughness = 0.96, unlit = false } = {}) {
  const vertices = [], colors = [], uvs = [];
  for (const { from, to } of ranges) {
    const count = Math.ceil((to - from) / step);
    let a = edge(from);
    for (let i = 0; i < count; i++) {
      const s = mix(from, to, (i + 1) / count);
      const b = edge(s);
      const tint = typeof color === 'function' ? color((i + 0.5) * (to - from) / count + from) : color;
      for (const [p, u, v] of [[a[0],0,i], [b[0],0,i+1], [a[1],1,i], [a[1],1,i], [b[0],0,i+1], [b[1],1,i+1]]) {
        vertices.push(p.x, p.y, p.z);
        colors.push(tint.r, tint.g, tint.b);
        uvs.push(u * 2.5, mix(from, to, v / count) / 8);
      }
      a = b;
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const specs = { vertexColors: true, map: texture ?? null };
  const material = unlit ? new T.MeshBasicMaterial(specs) : new T.MeshStandardMaterial({ ...specs, roughness });
  return new T.Mesh(geometry, material);
}

function offsetEdges(track, low, high, y = 0) {
  return (s) => {
    const p = track.sample(s);
    return [low, high].map((offset) => {
      const m = typeof offset === 'function' ? offset(s) : offset;
      return { x: p.x + p.normal.x * m, y: p.y + y, z: p.z + p.normal.z * m };
    });
  };
}

function markers(length, step, size) {
  return Array.from({ length: Math.floor(length / step) }, (_, i) => ({ from: i * step, to: i * step + size }));
}

function bridgeChannel(track, span) {
  const p = track.sample((span.from + span.to) / 2);
  const width = (span.to - span.from) * 0.46;
  return { ...span, p, width, sideLength: 80 };
}

function createLandscape(track, channels) {
  const bounds = new T.Box3().setFromPoints(track.points.map(({ x, y, z }) => new T.Vector3(x, y, z)));
  const center = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  const cluster = Math.ceil(track.length / 5.5);
  const nearby = Array.from({ length: cluster }, (_, i) => track.sample(track.length * i / cluster));
  const isCoast = track.theme === 'coast';
  const isCity = track.theme === 'city-night';
  const palette = track.palette;
  const base = new T.Color(palette.terrain), verge = new T.Color(palette.verge), beach = new T.Color('#cbbb8e');
  const waves = isCity ? 0.8 : isCoast ? 2.4 : 7.4;

  function ground(x, z) {
    let nearest, distance2 = Infinity;
    for (const p of nearby) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < distance2) {
        nearest = p;
        distance2 = d;
      }
    }
    const d = Math.sqrt(distance2);
    const vergeDrop = smoothstep((d - 15) / 85);
    let y = nearest.y - 0.85 - 2.6 * vergeDrop;
    const relief = (0.5 + Math.sin(x * 0.039 + z * 0.029) * 0.42 + Math.cos(z * 0.047 - x * 0.024) * 0.42);
    y += vergeDrop * waves * relief;
    const shore = isCoast ? smoothstep((d - 27 + 5 * Math.sin(x * 0.038) * Math.cos(z * 0.043)) / 48) : 0;
    y = mix(y, seaLevel, shore);
    let water = shore > 0.75;
    for (const channel of channels) {
      const vx = x - channel.p.x, vz = z - channel.p.z;
      const along = Math.abs(vx * channel.p.tangent.x + vz * channel.p.tangent.z);
      const across = Math.abs(vx * channel.p.normal.x + vz * channel.p.normal.z);
      const bank = smoothstep((channel.width - along) / 9) * smoothstep((channel.sideLength + 8 - across) / 20);
      y = Math.min(y, mix(y, channel.underpassY - 0.55, bank));
      water ||= bank > 0.61 && channel.crossing !== 'wadi';
    }
    return { y, d, relief, water, shore };
  }

  const w = size.x + 450, h = size.z + 450;
  const geometry = new T.PlaneGeometry(w, h, Math.ceil(w / 6), Math.ceil(h / 6));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center.x, 0, center.z);
  const vertices = geometry.attributes.position;
  const tones = new Float32Array(vertices.count * 3), tone = new T.Color();
  const waterColor = new T.Color(palette.water);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    const { y, relief, water, shore } = ground(x, z);
    vertices.setY(i, y);
    tone.copy(base).lerp(verge, 0.25 + 0.22 * Math.sin(x * 0.13 + z * 0.08) + 0.10 * relief);
    if (isCoast) tone.lerp(beach, shore * 0.62);
    if (water) tone.lerp(waterColor, 0.87);
    tone.toArray(tones, i * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(tones, 3));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  return { mesh, ground, center, size };
}

function horizon(track, { center, size, ground }) {
  const object = new T.Group();
  const city = track.theme === 'city-night';
  const desert = track.theme === 'desert';
  const snow = track.theme === 'snow';
  const coast = track.theme === 'coast';
  const mountain = track.theme === 'mountain';
  const [radius, groundY] = [Math.max(size.x, size.z) * 0.62 + 115, center.y - 15];
  const farColor = new T.Color(track.palette.horizon);
  if (city) {
    const towers = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: farColor }), 76);
    const windows = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: '#6e839a' }), 76 * 4);
    const dummy = new T.Object3D();
    for (let i = 0; i < towers.count; i++) {
      const rng = fracture(Math.sin(i * 4.878 + 1.1) * 15197.74);
      const a = i / towers.count * tau;
      const r = radius - 35 + 78 * rng;
      const height = 15 + 88 * rng ** 1.65;
      const width = 18 + 15 * rng;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      dummy.rotation.y = -a + Math.PI / 2;
      dummy.position.set(x, groundY + height / 2, z);
      dummy.scale.set(width, height, 23);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
      for (let j = 0; j < 4; j++) {
        dummy.position.set(x - Math.cos(a) * 11.65, groundY + height * (0.38 + j * 0.125), z - Math.sin(a) * 11.65);
        dummy.scale.set(width * (0.5 + rng * 0.38), 0.45, 0.12);
        dummy.updateMatrix();
        windows.setMatrixAt(i * 4 + j, dummy.matrix);
      }
    }
    object.add(towers, windows);
  } else {
    const count = 128;
    const rows = [
      { scale: 1.25, height: mountain ? 160 : snow ? 125 : coast ? 20 : 58, shade: 0.91, seed: 0.8 },
      { scale: 0.92, height: mountain ? 109 : snow ? 87 : coast ? 12 : desert ? 48 : 33, shade: 0.69, seed: 2.2 },
    ];
    for (const row of rows) {
      const vertices = [], colors = [];
      const tops = Array.from({ length: count }, (_, i) => {
        const a = i / count * tau;
        const amplitude = 0.3 + 0.36 * (0.5 + 0.5 * Math.sin(a * 5 + row.seed))
          + 0.21 * Math.cos(a * 13 + row.seed) + 0.21 * Math.sin(a * 29 + row.seed * 1.7);
        const r = radius * row.scale + 31 * Math.sin(a * 11) + 16 * Math.cos(a * 8);
        return [center.x + Math.cos(a) * r, groundY + row.height * Math.max(0.10, amplitude), center.z + Math.sin(a) * r];
      });
      for (let i = 0; i < count; i++) {
        const a = tops[i], b = tops[(i + 1) % count];
        const a0 = [a[0] * 0.85 + center.x * 0.15, groundY - 9, a[2] * 0.85 + center.z * 0.15];
        const b0 = [b[0] * 0.85 + center.x * 0.15, groundY - 9, b[2] * 0.85 + center.z * 0.15];
        const bottom = farColor.clone().multiplyScalar(row.shade * 0.71);
        const top = farColor.clone().multiplyScalar(row.shade + Math.sin(i * 1.41) * 0.10);
        if (snow || mountain) top.lerp(new T.Color('#e2e8ee'), smoothstep((Math.max(a[1], b[1]) - groundY) / row.height) * 0.64);
        for (const [p, c] of [[a0,bottom], [a,top], [b,top], [a0,bottom], [b,top], [b0,bottom]]) {
          vertices.push(...p);
          colors.push(c.r, c.g, c.b);
        }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      object.add(new T.Mesh(geometry, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide })));
    }
  }
  if (track.theme === 'forest' || snow) {
    const grove = new T.InstancedMesh(new T.ConeGeometry(1.0, 1.0, 6), new T.MeshStandardMaterial({ roughness: 1 }), 410);
    const dummy = new T.Object3D(), needles = new T.Color(snow ? '#778c8d' : '#36564a');
    let count = 0;
    for (let i = 0; i < 205; i++) {
      const a = i * 2.39996, r = 95 + radius * 0.73 * fracture(i * 0.61803);
      const x = center.x + r * Math.cos(a), z = center.z + r * Math.sin(a);
      const site = ground(x, z);
      if (site.d < 37 || site.water || Math.abs(x - center.x) > size.x / 2 + 217
          || Math.abs(z - center.z) > size.z / 2 + 217) continue;
      const variant = fracture(Math.sin(i * 197.453) * 10278.2);
      const height = 4.2 + 9.1 * variant;
      for (const part of [0, 1]) {
        dummy.position.set(x, site.y + height * (0.49 + 0.29 * part), z);
        dummy.rotation.y = a;
        dummy.scale.set(height * (0.23 - 0.065 * part), height * (0.73 - 0.18 * part), height * (0.23 - 0.065 * part));
        dummy.updateMatrix();
        grove.setMatrixAt(count, dummy.matrix);
        grove.setColorAt(count, needles.clone().multiplyScalar(0.69 + 0.26 * part + variant * 0.26));
        count++;
      }
    }
    grove.count = count;
    object.add(grove);
  }
  return object;
}

function infrastructure(track, ground) {
  const objects = new T.Group();
  const concrete = new T.MeshStandardMaterial({ color: '#a8a9a5', roughness: 0.9 });
  const dark = new T.MeshStandardMaterial({ color: '#354756', roughness: 0.8 });
  const shell = new T.MeshStandardMaterial({ color: track.palette.kerb, roughness: 0.72 });
  const instances = new Map([[concrete, []], [dark, []], [shell, []]]);
  const dummy = new T.Object3D();
  function build(s, lateral, y, width, height, length, material) {
    const p = atLateral(track, s, lateral);
    dummy.position.set(p.x, y, p.z);
    dummy.scale.set(width, height, length);
    dummy.rotation.y = p.heading;
    dummy.updateMatrix();
    instances.get(material).push(dummy.matrix.clone());
  }

  const pit = track.pitLane;
  const side = Math.sign(pit.offset);
  const centre = pit.offset + side * (pit.width / 2 + 3.3);
  for (let s = 30; s >= Math.max(pit.limitFrom + 9, -58); s -= 11) {
    const { y } = track.sample(s);
    build(s, centre, y + 1.85, 4.8, 4.0, 10.85, dark);
    build(s, centre + side * 0.08, y + 3.94, 5.6, 0.22, 10.72, shell);
    build(s, centre - side * 2.42, y + 1.18, 0.14, 2.42, 6.8, concrete);
  }

  const inner = (pit.offset - side * pit.width / 2 + side * track.width / 2) / 2;
  for (let s = pit.limitFrom + 3; s < pit.limitTo - 3; s += 2.2) {
    const { y } = track.sample(s);
    build(s, inner, y + 0.39, 0.32, 0.80, 2.18, concrete);
  }

  for (const bridge of track.bridges) {
    const { from, to, deckWidthM, deckThicknessM } = bridge;
    const deck = deckWidthM / 2;
    const concreteColor = new T.Color('#707982');
    const lip = strips([bridge], offsetEdges(track, -deck, deck, -0.115), concreteColor);
    const floor = strips([bridge], offsetEdges(track, -deck, deck, -deckThicknessM), concreteColor);
    floor.material.side = T.DoubleSide;
    objects.add(lip, floor);
    for (const sign of [-1, 1]) {
      const edgePoint = offsetEdges(track, sign * deck, sign * deck, -0.115);
      const fascia = strips([bridge], (s) => {
        const [p] = edgePoint(s);
        return [p, { ...p, y: p.y + 0.115 - deckThicknessM }];
      }, concreteColor);
      fascia.material.side = T.DoubleSide;
      objects.add(fascia);
      const edge = sign * (deck - 0.24);
      objects.add(strips([bridge], offsetEdges(track, edge - 0.24, edge + 0.24, 0.72), concreteColor));
      for (let s = from; s <= to; s += 1.9) {
        const y = track.sample(s).y;
        build(s, edge, y + 0.33, 0.32, 0.92, 1.91, concrete);
      }
      for (const f of [0.23, 0.77]) {
        const s = mix(from, to, f);
        const p = atLateral(track, s, sign * deck * 0.63);
        const bottom = ground(p.x, p.z).y - 0.5;
        const top = p.y - deckThicknessM + 0.15;
        if (top > bottom) build(s, sign * deck * 0.63, (top + bottom) / 2, 1.4, top - bottom, 2.1, concrete);
      }
    }
  }
  const box = new T.BoxGeometry(1, 1, 1);
  for (const [material, matrices] of instances) {
    const mesh = new T.InstancedMesh(box, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    objects.add(mesh);
  }
  return objects;
}

function courseMesh(track, texture, channels) {
  const root = new T.Group();
  const landscape = createLandscape(track, channels);
  root.add(landscape.mesh, horizon(track, landscape));
  const whole = [{ from: 0, to: track.length }], half = track.width / 2;
  const bridgeRanges = [...track.bridges].sort((a, b) => a.from - b.from);
  const shoulders = bridgeRanges.map((bridge, i) => ({ from: bridgeRanges[i - 1]?.to ?? 0, to: bridge.from }));
  shoulders.push({ from: bridgeRanges.at(-1).to, to: track.length });
  root.add(strips(shoulders, offsetEdges(track, -half - 1.6, half + 1.6, -0.10), new T.Color(track.palette.verge)));
  const road = strips(whole, offsetEdges(track, -half, half), baseRoad, { texture });
  root.add(road);
  const pit = track.pitLane;
  const pitRange = [{ from: pit.entryS, to: pit.exitS }];
  const pitEdge = (s, l, r, height) => [l, r].map((offset) => {
    const p = samplePit(track, s, offset);
    return { ...p, y: p.y + height };
  });
  root.add(strips(pitRange, (s) => pitEdge(s, -pit.width / 2, pit.width / 2, -0.018), new T.Color('#515969'), { texture }));
  root.add(strips(pitRange, (s) => pitEdge(s, -pit.width / 2, -pit.width / 2 + 0.16, 0.017), marker));
  root.add(strips(pitRange, (s) => pitEdge(s, pit.width / 2 - 0.16, pit.width / 2, 0.017), marker));

  for (const zone of track.runoffs) {
    const boundary = zone.side * (half + 0.075);
    const outer = (s) => boundary + zone.side * runoffWidth(zone, s);
    root.add(strips([zone], offsetEdges(track, zone.side === 1 ? boundary : outer, zone.side === 1 ? outer : boundary, -0.045),
      new T.Color(zone.surface === 'gravel' ? '#c9ab7d' : '#52687b'), { texture }));
  }

  const kerb = new T.Color(track.palette.kerb);
  const alternate = (s) => Math.floor(s / 3.2) % 2 === 0 ? kerb : marker;
  for (const sign of [-1, 1]) {
    const edge = sign * half;
    root.add(strips(whole, offsetEdges(track, edge - 0.12, edge + 0.12, 0.035), marker));
    root.add(strips(track.corners, offsetEdges(track, edge - 0.58, edge + 0.58, 0.045), alternate, { step: 1.65 }));
    const drsLine = sign * (half - 0.95);
    root.add(strips(track.drsZones, offsetEdges(track, drsLine - 0.10, drsLine + 0.10, 0.047), new T.Color('#86d9a3')));
  }

  root.add(strips(markers(track.length, 22, 4.1), offsetEdges(track, -0.064, 0.064, 0.027), new T.Color('#777e84')));
  for (let i = 0; i < 14; i++) {
    const left = -half + track.width * i / 14, right = left + track.width / 14;
    const start = i % 2 ? -0.77 : 0;
    root.add(strips([{ from: start, to: start + 0.77 }], offsetEdges(track, left, right, 0.055), marker));
  }
  root.add(infrastructure(track, landscape.ground));
  return { root, ground: landscape.ground, road: road.material };
}

function dispose(root, keepTexture) {
  const geometries = new Set(), materials = new Set();
  root.traverse((node) => {
    if (node.isInstancedMesh) node.dispose();
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) materials.add(node.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    if (material.map !== keepTexture) material.map?.dispose();
    material.dispose();
  });
}

export function createChase(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.22, 2300);
  const haze = new T.Fog('#a4b9ce', 40, 1500);
  const ambient = new T.HemisphereLight('#c0d6eb', '#5a6171', 1.55);
  const sun = new T.DirectionalLight('#ffdeaa', 1.7);
  sun.position.set(-105, 82, 68);
  scene.fog = haze;
  const fill = new T.DirectionalLight('#edf6ff', 0.46);
  scene.add(ambient, sun, fill, fill.target);

  const loader = new GLTFLoader();
  const asphalt = makeNoiseTexture();
  const car = new T.Group();
  const shadow = new T.Mesh(new T.CircleGeometry(2.75, 21),
    new T.MeshBasicMaterial({ color: '#161b23', transparent: true, opacity: 0.40, depthWrite: false }));
  shadow.geometry.rotateX(-Math.PI / 2).scale(0.59, 1, 1);
  scene.add(car, shadow);
  let course, sky, track, current = 0;
  const wheels = [], frontSteer = [];
  const carReady = loader.loadAsync(carUrl).then(({ scene: model }) => {
    model.traverse((node) => {
      if (node.isMesh && node.material?.name === 'body_team') {
        node.material.color.set('#e55337');
        node.material.metalness = 0.14;
      }
      if (node.name.startsWith('wheel_')) wheels.push(node);
      if (node.name.startsWith('steer_f') && node.name !== 'steer_front') frontSteer.push(node);
    });
    car.add(model);
  });

  function setWeather(preset) {
    if (!track) return;
    const { palette } = track;
    haze.color.set(palette.fog).lerp(new T.Color(preset.tint), preset.cloudCover * 0.85);
    haze.near = Math.min(90, preset.visibilityM * 0.15);
    haze.far = preset.visibilityM * 1.12;
    if (!sky) scene.background = haze.color.clone();
    scene.backgroundIntensity = (track.theme === 'city-night' ? 1.10 : 1.02) * (1 - preset.cloudCover * 0.31);
    sun.color.set(palette.lightColor).lerp(new T.Color(preset.tint), preset.cloudCover * 0.68);
    sun.intensity = palette.light * (1.72 - preset.cloudCover * 1.18);
    ambient.color.set(track.theme === 'city-night' ? '#b4c5fa' : '#e3e8ec').lerp(new T.Color(preset.tint), 0.44 * preset.cloudCover);
    ambient.intensity = track.theme === 'city-night' ? 1.32 : 1.43;
    fill.intensity = 0.57 - preset.cloudCover * 0.16;
    course.road.color.setScalar(1 - preset.wetness * 0.24);
    course.road.roughness = 0.96 - preset.wetness * 0.69;
  }

  async function setCourse(next) {
    const request = ++current;
    if (course) {
      scene.remove(course.root);
      dispose(course.root, asphalt);
    }
    sky?.dispose();
    sky = null;
    track = next;
    course = courseMesh(track, asphalt, track.bridges.map((span) => bridgeChannel(track, span)));
    scene.add(course.root);
    setWeather(next.weather[0]);

    const skyTask = new T.TextureLoader().loadAsync(next.sky.asset).then((texture) => {
      if (request !== current) {
        texture.dispose();
        return;
      }
      texture.colorSpace = T.SRGBColorSpace;
      texture.mapping = T.EquirectangularReflectionMapping;
      sky = texture;
      scene.background = texture;
    });
    const propTasks = next.roadside.map(async (item) => {
      const { scene: model } = await loader.loadAsync(item.asset);
      if (request !== current) {
        dispose(model);
        return;
      }
      const p = atLateral(next, item.s, item.lateralM);
      const y = item.surface === 'water' ? seaLevel + 0.05 : course.ground(p.x, p.z).y - 0.12;
      model.position.set(p.x, y, p.z);
      model.rotation.y = p.heading + T.MathUtils.degToRad(item.yawDeg);
      course.root.add(model);
    });
    const results = await Promise.allSettled([carReady, skyTask, ...propTasks]);
    return results.every((result) => result.status === 'fulfilled');
  }

  function resize(width, height, scale) {
    renderer.setPixelRatio(Math.min(scale, 1.75));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function draw(s) {
    if (!track) return;
    const p = sampleLine(track, s);
    const behind = sampleLine(track, s - 2.6), ahead = sampleLine(track, s + 3.4);
    const heading = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    const lean = T.MathUtils.clamp((ahead.y - behind.y) / 6, -0.12, 0.12);
    car.position.set(p.x, p.y + 0.025, p.z);
    car.rotation.set(-lean, heading, 0, 'YXZ');
    shadow.position.set(p.x, p.y + 0.048, p.z);
    shadow.rotation.set(-lean, heading, 0, 'YXZ');
    wheels.forEach((wheel) => { wheel.rotation.x = (s / 0.34) % tau; });
    const turn = Math.sin(track.sample(s + 5).heading - track.sample(s - 4).heading);
    frontSteer.forEach((wheel) => { wheel.rotation.y = turn * 0.54; });

    const cos = Math.cos(heading), sin = Math.sin(heading);
    const focus = sampleLine(track, s + 23);
    camera.position.set(p.x - sin * 8.6 + cos * 0.9, p.y + 3.65, p.z - cos * 8.6 - sin * 0.9);
    camera.lookAt(focus.x, focus.y + 1.2, focus.z);
    fill.position.copy(camera.position).y += 9;
    fill.target.position.copy(car.position);
    renderer.render(scene, camera);
  }

  return { resize, draw, setCourse, setWeather };
}
