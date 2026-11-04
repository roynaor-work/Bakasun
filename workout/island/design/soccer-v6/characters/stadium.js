import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/BufferGeometryUtils.js';

// Metres, Y up. The 36 × 56 playing area is centred on the character origin.
// No assets, network requests, frame-by-frame instance uploads, or camera changes.
export function createStadium(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'Evening football ground';
  scene.add(group);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const previous = { background: scene.background, fog: scene.fog, environment: scene.environment };
  let reflectionTarget = null, ownBackground = null;
  let seed = 20741;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const geom = g => { geometries.add(g); return g; };
  const mat = m => { materials.add(m); return m; };
  const texture = canvas => { const t = new THREE.CanvasTexture(canvas); textures.add(t); return t; };
  const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const add = (g, m, name, receive = false) => {
    const mesh = new THREE.Mesh(geom(g), m);
    mesh.name = name;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3();
  const unit = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const paint = (g, color) => {
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  };
  const batches = { concrete: [], steel: [], roof: [], trim: [], lamps: [], goals: [] };
  const box = (batch, x, y, z, w, h, d, color, ry = 0, rz = 0) => {
    const g = paint(new THREE.BoxGeometry(w, h, d), color);
    matrix.makeRotationFromEuler(new THREE.Euler(0, ry, rz));
    matrix.setPosition(x, y, z);
    g.applyMatrix4(matrix);
    batches[batch].push(g);
  };
  const tube = (batch, a, b, radius, color, segments = 6) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const g = paint(new THREE.CylinderGeometry(radius, radius, delta.length(), segments, 1, false), color);
    q.setFromUnitVectors(up, delta.normalize());
    matrix.compose(start.add(end).multiplyScalar(.5), q, unit);
    g.applyMatrix4(matrix);
    batches[batch].push(g);
  };

  // A broad, quiet sky is important at the low character camera angle.
  if (!scene.background) {
    const sky = canvas(64, 256), ctx = sky.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#07101f'); grad.addColorStop(.5, '#20364e');
    grad.addColorStop(.66, '#566475'); grad.addColorStop(.76, '#8b8790'); grad.addColorStop(1, '#344757');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 256);
    ownBackground = texture(sky);
    ownBackground.colorSpace = THREE.SRGBColorSpace;
    ownBackground.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = ownBackground;
  }
  if (!scene.fog) scene.fog = new THREE.FogExp2(0x263b50, .0068);
  const ownedFog = scene.fog !== previous.fog ? scene.fog : null;

  // Albedo has longitudinal leaf strokes, not a flat green or a chessboard.
  const turfCanvas = canvas(1024), ctx = turfCanvas.getContext('2d');
  const sx = 1024 / 44, sz = 1024 / 66;
  ctx.fillStyle = '#344e2d'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#34572d' : '#416235';
    ctx.fillRect(0, i * 1024 / 12, 1024, 1024 / 12 + 1);
  }
  for (let i = 0; i < 84000; i++) {
    const x = random() * 1024, y = random() * 1024, light = random();
    ctx.strokeStyle = light > .67 ? 'rgba(161,173,90,.19)' : light > .25 ? 'rgba(34,62,28,.19)' : 'rgba(212,201,117,.10)';
    ctx.lineWidth = .45 + random() * .7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - .5) * 1.3, y - .7 - random() * 3.3); ctx.stroke();
  }
  const px = x => (x + 22) * sx, pz = z => (z + 33) * sz;
  ctx.strokeStyle = 'rgba(226,230,211,.91)'; ctx.lineCap = 'butt';
  // Transform into metres so circles and line widths have the correct world size.
  ctx.save(); ctx.translate(px(0), pz(0)); ctx.scale(sx, sz); ctx.lineWidth = .105;
  ctx.strokeRect(-18, -28, 36, 56);
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e1e5ce';
  const dot = (x, z, r = .13) => { ctx.beginPath(); ctx.arc(x, z, r, 0, Math.PI * 2); ctx.fill(); };
  dot(0, 0);
  for (const sign of [-1, 1]) {
    ctx.strokeRect(-7, sign < 0 ? -28 : 21, 14, 7);
    ctx.strokeRect(-3.6, sign < 0 ? -28 : 25.5, 7.2, 2.5);
    dot(0, sign * 22);
    // Penalty arc outside the box, using the same five metre radius.
    ctx.beginPath();
    if (sign < 0) ctx.arc(0, -22, 5, Math.asin(1 / 5), Math.PI - Math.asin(1 / 5));
    else ctx.arc(0, 22, 5, Math.PI + Math.asin(1 / 5), Math.PI * 2 - Math.asin(1 / 5));
    ctx.stroke();
  }
  for (const x of [-18, 18]) for (const z of [-28, 28]) {
    const start = x < 0 ? (z < 0 ? 0 : -Math.PI / 2) : (z < 0 ? Math.PI / 2 : Math.PI);
    ctx.beginPath(); ctx.arc(x, z, .55, start, start + Math.PI / 2); ctx.stroke();
  }
  ctx.restore();
  const albedo = texture(turfCanvas); albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const normalCanvas = canvas(512), nc = normalCanvas.getContext('2d');
  nc.fillStyle = '#8080ff'; nc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 10000; i++) {
    const x = random() * 512, y = random() * 512;
    nc.strokeStyle = i % 2 ? 'rgba(98,156,244,.65)' : 'rgba(157,107,243,.55)';
    nc.lineWidth = .6 + random(); nc.beginPath(); nc.moveTo(x, y); nc.lineTo(x + (random() - .5) * 2, y - 2 - random() * 8); nc.stroke();
  }
  const normal = texture(normalCanvas); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.repeat.set(29, 44);
  normal.anisotropy = albedo.anisotropy;
  const grassMaterial = mat(new THREE.MeshStandardMaterial({ map: albedo, normalMap: normal, normalScale: new THREE.Vector2(.24, .24), roughness: .96, metalness: 0, color: 0xffffff }));
  const pitch = add(new THREE.PlaneGeometry(44, 66), grassMaterial, '36 × 56 metre pitch', true);
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = -.012;

  // Actual blades ground the boots in a close-up. One static instanced draw.
  const leafGeometry = geom(new THREE.BufferGeometry());
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.0035,0,0, .0035,0,0, -.002,.017,.002, .002,.017,.002, 0,.031,.006], 3));
  leafGeometry.setIndex([0,1,2, 1,3,2, 2,3,4]); leafGeometry.computeVertexNormals();
  const leavesMaterial = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive:0x536a3b, emissiveIntensity:.35, vertexColors: false, side: THREE.DoubleSide, roughness: 1 }));
  const bladeCount = 6000, leaves = new THREE.InstancedMesh(leafGeometry, leavesMaterial, bladeCount);
  leaves.name = 'Individual grass leaves'; leaves.receiveShadow = true;
  const color = new THREE.Color(), scale = new THREE.Vector3();
  for (let i = 0; i < bladeCount; i++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 2.7;
    pos.set(Math.cos(angle) * radius, -.009, Math.sin(angle) * radius);
    q.setFromAxisAngle(up, random() * Math.PI * 2);
    scale.set(.7 + random() * .65, (.65 + random() * .35) * Math.min(1, (2.7 - radius) * 2), 1);
    matrix.compose(pos, q, scale); leaves.setMatrixAt(i, matrix);
    color.setHSL(.255 + random() * .04, .26 + random() * .14, .10 + random() * .09);
    leaves.setColorAt(i, color);
  }
  leaves.instanceMatrix.needsUpdate = true; leaves.instanceColor.needsUpdate = true; group.add(leaves);

  // Covered stands start just outside the run-off. The same construction is
  // reused on all four sides, with aisles interrupting the rows and spectators.
  const seatTransforms = [], spectators = [];
  function stand(length, start, rotation, columns) {
    const sin = Math.sin(rotation), cos = Math.cos(rotation);
    const local = (x, y, depth) => [start[0] + x * cos + depth * sin, y, start[1] - x * sin + depth * cos];
    const b = (batch, x, y, depth, w, h, d, c) => { const p = local(x, y, depth); box(batch, ...p, w, h, d, c, rotation); };
    for (let row = 0; row < 9; row++) {
      const depth = row * .93, y = .62 + row * .62;
      b('concrete', 0, y * .5, depth, length, y, 1.06, row % 2 ? 0x68717a : 0x747a80);
      b('trim', 0, y + .025, depth - .44, length, .045, .055, 0xb7b8ad);
      for (let column = 0; column < columns; column++) {
        const x = -length * .5 + .45 + column * (length - .9) / (columns - 1);
        // Two generous concrete stair aisles, rather than a filled rectangle.
        if (Math.abs(x - length * .255) < .63 || Math.abs(x + length * .255) < .63) continue;
        const s = local(x, y + .25, depth);
        seatTransforms.push({ p: s, rotation });
        if (random() > .57) spectators.push({ p: local(x + (random() - .5) * .12, y + .24, depth - .04), rotation, height: .82 + random() * .2 });
      }
    }
    b('concrete', 0, 3.55, 8.1, length + .65, 7.1, .44, 0x35434f);
    b('roof', 0, 8.6, 4, length + 1.65, .21, 10.6, 0x3f4c58);
    for (let x = -length * .5; x < length * .5; x += 2.6) b('roof', x, 8.714, 4, .035, .018, 10.6, 0x65727b);
    b('steel', 0, 8.35, -.85, length + 1.5, .19, .19, 0xa5aeb4);
    b('steel', 0, 8.38, 8.8, length + 1.5, .24, .24, 0x81919b);
    for (let x = -length * .5 + 1.4; x <= length * .5; x += 5.3) {
      b('steel', x, 5.75, 8.5, .14, 5.5, .14, 0x84939e);
      const a = local(x, 8.3, -.6), c = local(x, 8.3, 8.5);
      tube('steel', a, c, .055, 0x82929c);
      b('lamps', x, 8.25, -.58, 2.1, .075, .19, 0xe6eff3);
    }
    // Low perimeter wall with restrained porcelain panels, no adverts or text.
    b('concrete', 0, .47, -1.45, length, .94, .26, 0x253c49);
    for (let x = -length * .5 + 1.6; x < length * .5; x += 3.25) b('trim', x, .61, -1.6, 3.08, .54, .055, (Math.floor(x / 3.25) & 1) ? 0xaab5b7 : 0x627f8e);
  }
  stand(43, [0, -32], Math.PI, 61);
  stand(43, [0, 32], 0, 61);
  stand(59, [-22, 0], -Math.PI / 2, 83);
  stand(59, [22, 0], Math.PI / 2, 83);

  const seatGeometry = geom(new THREE.BufferGeometry());
  seatGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.195,0,-.18,.195,0,-.18,-.195,0,.15,.195,0,.15,-.195,.35,.15,.195,.35,.15],3));
  seatGeometry.setIndex([0,2,1,1,2,3,2,4,3,3,4,5]); seatGeometry.computeVertexNormals();
  const seatMaterial = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, side:THREE.DoubleSide }));
  const seats = new THREE.InstancedMesh(seatGeometry, seatMaterial, seatTransforms.length); seats.name = 'Moulded stadium seats';
  seatTransforms.forEach((s, i) => {
    pos.set(...s.p); q.setFromAxisAngle(up, s.rotation); matrix.compose(pos, q, unit); seats.setMatrixAt(i, matrix);
    color.set(i % 19 < 2 ? 0x909d9d : i % 7 < 3 ? 0x38536a : 0x627a89); seats.setColorAt(i, color);
  });
  seats.instanceMatrix.needsUpdate = true; seats.instanceColor.needsUpdate = true; group.add(seats);

  // One human silhouette mesh, instanced. Shirts are coloured independently of
  // skin and trousers; per-instance phase animates cheering entirely on the GPU.
  const peopleParts = [];
  const personPart = (g, position, rotation, tint, shirt = 0, motion = 0) => {
    if (g.index) { const indexed = g; g = g.toNonIndexed(); indexed.dispose(); }
    matrix.makeRotationFromEuler(new THREE.Euler(...rotation)); matrix.setPosition(...position); g.applyMatrix4(matrix);
    paint(g, tint);
    const count = g.attributes.position.count;
    g.setAttribute('shirt', new THREE.Float32BufferAttribute(new Float32Array(count).fill(shirt), 1));
    g.setAttribute('movement', new THREE.Float32BufferAttribute(new Float32Array(count).fill(motion), 1));
    peopleParts.push(g);
  };
  personPart(new THREE.CylinderGeometry(.175, .145, .43, 4, 1, true), [0,.61,0], [0,0,0], 0xffffff, 1, .3);
  personPart(new THREE.IcosahedronGeometry(.12, 0), [0,.96,0], [0,0,0], 0x9d806a, 0, .45);
  for (const side of [-1, 1]) {
    personPart(new THREE.CylinderGeometry(.058,.048,.37,3,1,true), [side*.105,.22,.015], [.16,0,side*.05], 0x29333b, 0, .05);
    personPart(new THREE.CylinderGeometry(.051,.046,.40,3,1,true), [side*.235,.64,.015], [0,0,side*.28], 0xa58a73, 0, side);
  }
  const personGeometry = geom(mergeGeometries(peopleParts)); peopleParts.forEach(g => g.dispose());
  const phases = new Float32Array(spectators.length);
  for (let i = 0; i < phases.length; i++) phases[i] = random() * Math.PI * 2;
  personGeometry.setAttribute('crowdPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const crowdTime = { value: 0 };
  const crowdMaterial = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, side: THREE.FrontSide }));
  crowdMaterial.onBeforeCompile = shader => {
    shader.uniforms.crowdTime = crowdTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float crowdTime;\nattribute float crowdPhase;\nattribute float shirt;\nattribute float movement;');
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, shirt);\n if (shirt < .1 && color.r > .12) vColor.xyz *= .65 + .35 * fract(crowdPhase * 4.9);\n#endif');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float breath = sin(crowdTime * 1.7 + crowdPhase);
      transformed.y += breath * .018 * abs(movement);
      transformed.x += sin(crowdTime * .85 + crowdPhase) * .025 * abs(movement);
      float cheer = pow(max(0.0, sin(crowdTime * .57 + crowdPhase * 2.0)), 16.0);
      if (abs(movement) > .9) {
        vec2 pivot = vec2(sign(movement) * .18, .832);
        vec2 arm = transformed.xy - pivot;
        float a = sign(movement) * (cheer * 2.3 + sin(crowdPhase) * .12);
        transformed.xy = pivot + mat2(cos(a), sin(a), -sin(a), cos(a)) * arm;
      }`);
  };
  crowdMaterial.customProgramCacheKey = () => 'stadium-crowd-v1';
  const crowd = new THREE.InstancedMesh(personGeometry, crowdMaterial, spectators.length); crowd.name = 'Spectators with individual breathing and cheering phases';
  const shirtPalette = [0x557183,0x827e70,0x345466,0xb2b5b0,0x7a4746,0x41685d,0x38414c,0x9c8c6e];
  spectators.forEach((s, i) => {
    pos.set(...s.p); q.setFromAxisAngle(up, s.rotation); scale.set(1,s.height,1); matrix.compose(pos,q,scale); crowd.setMatrixAt(i,matrix);
    color.set(shirtPalette[Math.floor(random() * shirtPalette.length)]); crowd.setColorAt(i,color);
  });
  crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true; group.add(crowd);

  // Four ordinary steel floodlight masts. Fixture glass is one emissive batch;
  // lighting itself is supplied by two broad directional sources below.
  for (const x of [-25, 25]) for (const z of [-34, 34]) {
    tube('steel', [x,0,z], [x,17,z], .105, 0x6f8290, 8);
    box('steel', x, 16.8, z, 3.7, 1.35, .24, 0x4f5d66);
    for (let column = 0; column < 6; column++) for (let row = 0; row < 2; row++) {
      box('lamps', x - 1.5 + column * .6, 16.5 + row * .56, z + (z < 0 ? .17 : -.17), .47, .39, .055, 0xf1f2e8);
    }
  }

  // Small-sided five metre goals, square woven nets rather than triangular wireframes.
  const netCanvas = canvas(64), netCtx = netCanvas.getContext('2d');
  netCtx.clearRect(0,0,64,64); netCtx.strokeStyle = 'rgba(224,230,220,.76)'; netCtx.lineWidth = 1.25;
  netCtx.strokeRect(0,0,64,64);
  const netMap = texture(netCanvas); netMap.colorSpace = THREE.SRGBColorSpace; netMap.wrapS = netMap.wrapT = THREE.RepeatWrapping;
  const netParts = [];
  const netPlane = (w,h,x,y,z,rx,ry,u,v) => {
    const g = new THREE.PlaneGeometry(w,h); const uv = g.attributes.uv;
    for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*u,uv.getY(i)*v);
    matrix.makeRotationFromEuler(new THREE.Euler(rx,ry,0)); matrix.setPosition(x,y,z); g.applyMatrix4(matrix); netParts.push(g);
  };
  for (const sign of [-1,1]) {
    const z = sign * 28, back = sign * 29.6;
    tube('goals', [-2.5,.055,z], [-2.5,2.06,z], .055, 0xdce1dd, 10);
    tube('goals', [2.5,.055,z], [2.5,2.06,z], .055, 0xdce1dd, 10);
    tube('goals', [-2.5,2.06,z], [2.5,2.06,z], .055, 0xe7e9e0, 10);
    for (const x of [-2.5,2.5]) {
      tube('goals', [x,.055,z], [x,.055,back], .025, 0x9aa8a5);
      tube('goals', [x,2.06,z], [x,1.88,back], .022, 0x9aa8a5);
      tube('goals', [x,.055,back], [x,1.88,back], .022, 0x9aa8a5);
      netPlane(1.6,1.91,x,.98,(z+back)/2,0,Math.PI/2,12,15);
    }
    tube('goals', [-2.5,1.88,back], [2.5,1.88,back], .022, 0x9aa8a5);
    netPlane(5,1.9,0,.98,back,0,0,38,15);
    netPlane(5,1.6,0,1.98,(z+back)/2,-Math.PI/2,0,38,12);
  }
  const netGeometry = mergeGeometries(netParts); netParts.forEach(g => g.dispose());
  add(netGeometry, mat(new THREE.MeshStandardMaterial({ map: netMap, transparent: true, alphaTest: .12, depthWrite: false, side: THREE.DoubleSide, forceSinglePass:true, roughness: 1, opacity: .75 })), 'Woven goal nets');

  const concreteCanvas = canvas(256), cc = concreteCanvas.getContext('2d');
  cc.fillStyle = '#e6e7e3'; cc.fillRect(0,0,256,256);
  for (let i=0;i<19000;i++) {
    const tone = 183 + Math.floor(random()*68);
    cc.fillStyle = `rgba(${tone},${tone},${tone},.22)`;
    cc.fillRect(random()*256,random()*256,.6+random()*1.3,.6+random()*1.3);
  }
  const concreteMap = texture(concreteCanvas); concreteMap.colorSpace = THREE.SRGBColorSpace;
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  const batchMaterials = {
    concrete: mat(new THREE.MeshStandardMaterial({ vertexColors:true, map:concreteMap, bumpMap:concreteMap, bumpScale:.022, roughness:.94 })),
    steel: mat(new THREE.MeshStandardMaterial({ vertexColors:true, metalness:.65, roughness:.48 })),
    roof: mat(new THREE.MeshStandardMaterial({ vertexColors:true, metalness:.45, roughness:.68 })),
    trim: mat(new THREE.MeshStandardMaterial({ vertexColors:true, metalness:.15, roughness:.65 })),
    lamps: mat(new THREE.MeshStandardMaterial({ color:0xdde8e8, emissive:0xdde8e8, emissiveIntensity:3, vertexColors:true, roughness:.35, toneMapped:false })),
    goals: mat(new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.34, metalness:.15 }))
  };
  box('concrete',0,-.19,0,110,.2,130,0x29363d);
  for (const [name, pieces] of Object.entries(batches)) {
    if (!pieces.length) continue;
    const g = mergeGeometries(pieces); pieces.forEach(p => p.dispose());
    add(g, batchMaterials[name], `Batched stadium ${name}`);
  }

  const hemi = new THREE.HemisphereLight(0x9cb1c5, 0x3b4734, 1.5); group.add(hemi);
  const key = new THREE.DirectionalLight(0xf1f0e4, 3.1); key.position.set(-10,19,13); key.castShadow = true;
  key.shadow.mapSize.set(1024,1024); key.shadow.camera.left = -23; key.shadow.camera.right = 23;
  key.shadow.camera.top = 32; key.shadow.camera.bottom = -32; key.shadow.camera.near = 1; key.shadow.camera.far = 82;
  key.shadow.normalBias = .022; key.shadow.bias = -.00015; key.shadow.radius = 3;
  key.target.position.set(0,0,0); group.add(key,key.target);
  const rim = new THREE.DirectionalLight(0xc3d6ee, 1.25); rim.position.set(8,12,-17); group.add(rim);

  // A tiny procedural studio-like reflection scene gives skin, cloth and boots
  // readable PBR highlights even though this is a self-contained offline page.
  if (!scene.environment && renderer) {
    const reflectionScene = new THREE.Scene(); reflectionScene.background = new THREE.Color(.12,.17,.23);
    const reflectionGeometry = new THREE.PlaneGeometry(9,5);
    const reflectionMaterial = new THREE.MeshBasicMaterial({ color:new THREE.Color(2.6,2.7,2.8), side:THREE.DoubleSide });
    for (const [x,y,z] of [[-7,7,5],[8,9,-6],[0,13,0]]) {
      const panel = new THREE.Mesh(reflectionGeometry,reflectionMaterial); panel.position.set(x,y,z); panel.lookAt(0,1,0); reflectionScene.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    reflectionTarget = pmrem.fromScene(reflectionScene,.12,.1,60);
    scene.environment = reflectionTarget.texture;
    pmrem.dispose(); reflectionGeometry.dispose(); reflectionMaterial.dispose();
  }

  group.userData = { pitchWidth:36, pitchLength:56, crowdCount:spectators.length, grassBlades:bladeCount, materialDraws:12 };
  let disposed = false;
  return {
    group,
    pitchY: 0,
    matchCamera: { position:[0,50,38], target:[0,0,4], fov:54 },
    update(time) { if (!disposed) crowdTime.value = Number.isFinite(time) ? time : 0; },
    dispose() {
      if (disposed) return; disposed = true;
      scene.remove(group);
      if (ownBackground && scene.background === ownBackground) scene.background = previous.background;
      if (ownedFog && scene.fog === ownedFog) scene.fog = previous.fog;
      if (reflectionTarget && scene.environment === reflectionTarget.texture) scene.environment = previous.environment;
      reflectionTarget?.dispose();
      key.shadow.map?.dispose();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      leaves.dispose(); seats.dispose(); crowd.dispose();
    }
  };
}
