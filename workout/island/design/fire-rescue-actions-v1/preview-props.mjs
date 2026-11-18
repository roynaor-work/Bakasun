// Local 3D stand-ins for catalog attachment transforms.
import * as T from 'three';
import { clone as cloneSkeleton } from '../../vendor/SkeletonUtils.js';

const materialCache = new Map();
const radians = T.MathUtils.degToRad;

function material(color, roughness = .8, metalness = 0) {
  const key = [color, roughness, metalness].join('/');
  if (!materialCache.has(key)) {
    materialCache.set(key, new T.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return materialCache.get(key);
}

export function box(parent, size, position, color, metalness = 0) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size), material(color, .8, metalness));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function tube(parent, radius, from, to, color, metalness = 0) {
  const start = new T.Vector3(...from);
  const end = new T.Vector3(...to);
  const axis = end.clone().sub(start);
  const mesh = new T.Mesh(
    new T.CylinderGeometry(radius, radius, axis.length(), 8),
    material(color, .65, metalness),
  );
  mesh.position.copy(start).lerp(end, .5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function crate(group) {
  const wood = ['#927354', '#b0845a', '#a38460', '#8b6a4b'];
  box(group, [.57, .67, .39], [0, .35, 0], '#735a43');
  for (let row = 0; row < 4; row++) {
    const y = .1 + row * .164;
    for (const side of [-1, 1]) {
      box(group, [.59, .145, .026], [0, y, side * .201], wood[row]);
      box(group, [.024, .145, .39], [side * .29, y, 0], wood[3 - row]);
    }
  }
  for (const y of [.035, .701]) {
    box(group, [.604, .062, .43], [0, y, 0], '#825d3f');
  }
  for (const x of [-.16, .16]) {
    box(group, [.107, .040, .021], [x, .68, -.218], '#25333a');
    tube(group, .014, [x - .035, .68, -.241], [x + .035, .68, -.241], '#bac4b6', .26);
  }
}

function door(group) {
  box(group, [.775, 1.873, .06], [.39, .947, 0], '#3d6b73');
  box(group, [.65, .74, .009], [.39, .458, -.032], '#426068');
  box(group, [.43, .36, .015], [.39, 1.51, -.031], '#203a44');
  box(group, [.36, .29, .017], [.39, 1.51, -.034], '#638985', .28);
  box(group, [.775, .105, .083], [.39, .098, 0], '#56676e', .28);
  for (const z of [-.047, .047]) {
    box(group, [.075, .15, .020], [.59, 1, z], '#899b9c', .4);
    tube(group, .023, [.55, 1, z * 1.67], [.655, 1, z * 1.67], '#d6e0d8', .5);
  }
  for (const y of [.28, 1.61]) tube(group, .022, [0, y - .08, 0], [0, y + .08, 0], '#899b9c', .4);
}

function doorFrame(group) {
  const color = '#50656d';
  for (const x of [-.051, .831]) {
    box(group, [.105, 1.99, .147], [x, .995, .018], color);
    box(group, [.117, .068, .159], [x, .034, .018], '#b08c48');
  }
  box(group, [.985, .106, .151], [.39, 1.946, .018], color);
}

function cutter(group) {
  box(group, [.15, .157, .189], [.005, -.012, .12], '#d97949');
  box(group, [.173, .10, .063], [.01, -.018, .062], '#bf5834');
  box(group, [.083, .076, .125], [0, -.024, -.031], '#26363c');
  tube(group, .023, [.038, -.036, .11], [.17, -.036, .10], '#35434a');
  tube(group, .022, [.171, -.036, .058], [.171, .027, .14], '#879297', .3);
  tube(group, .051, [.012, 0, .18], [.026, 0, .27], '#8a949b', .45);
  for (const side of [-1, 1]) {
    const root = new T.Group();
    root.position.set(.026, side * .047, .245);
    box(root, [.080, .036, .124], [0, side * .013, .044], '#b4c2c6', .55);
    box(root, [.080, .052, .029], [0, side * -.012, .112], '#8c9da1', .57);
    group.add(root);
  }
  box(group, [.025, .024, .102], [-.075, .05, .108], '#f3c36c');
}

function bar(group) {
  box(group, [.25, .044, .26], [0, .022, 0], '#4a5961', .34);
  tube(group, .029, [0, .042, 0], [0, .977, 0], '#a1b1b4', .48);
  tube(group, .033, [0, .957, 0], [0, .979, 0], '#e4b974', .34);
}

function barTop(group) {
  tube(group, .029, [0, 0, 0], [0, .355, 0], '#a1b1b4', .48);
  tube(group, .030, [0, 0, 0], [0, .029, 0], '#e4b974', .34);
}

function cage(group) {
  const frame = '#858b82';
  box(group, [.66, .048, .72], [0, .024, 0], '#65716d', .15);
  box(group, [.66, .051, .72], [0, .535, 0], '#82908b', .22);
  for (const x of [-.31, .31]) {
    for (let index = 0; index < 9; index++) {
      const z = -.34 + index * .085;
      tube(group, .012, [x, .044, z], [x, .519, z], frame, .38);
    }
    box(group, [.041, .033, .72], [x, .32, 0], '#72817e', .23);
  }
  for (let index = -3; index <= 3; index++) {
    const x = index * .088;
    tube(group, .01, [x, .044, .34], [x, .52, .34], frame, .32);
  }
  tube(group, .036, [-.14, .577, 0], [.14, .577, 0], '#3d5157');
}

function cageGate(group) {
  const frame = '#a6aaa0';
  for (const y of [.058, .517]) {
    box(group, [.64, .035, .033], [.32, y, 0], frame, .36);
  }
  for (let index = 0; index < 8; index++) {
    const x = .015 + index * .087;
    tube(group, .012, [x, .06, 0], [x, .524, 0], frame, .32);
  }
  box(group, [.104, .087, .032], [.57, .46, -.015], '#4d6163');
  tube(group, .015, [.53, .46, -.04], [.614, .46, -.04], '#e7bd67', .33);
}

function table(group) {
  box(group, [.95, .064, .85], [0, .668, 0], '#8b6e52');
  box(group, [.966, .018, .866], [0, .708, 0], '#a78c70');
  for (const x of [-.425, .425]) {
    for (const z of [-.374, .374]) {
      box(group, [.058, .663, .061], [x, .332, z], '#576361');
      box(group, [.074, .049, .078], [x, .025, z], '#353e3c');
    }
    box(group, [.042, .083, .78], [x, .615, 0], '#70563f');
  }
  box(group, [.86, .090, .029], [0, .615, .388], '#70563f');
}

function mat(group) {
  box(group, [.72, .042, .75], [0, .022, 0], '#b56e4a');
  box(group, [.67, .010, .70], [0, .048, 0], '#be875e');
  for (const x of [-.355, .355]) {
    box(group, [.025, .012, .72], [x, .048, 0], '#efd28c');
  }
  for (const z of [-.369, .369]) {
    box(group, [.69, .012, .022], [0, .049, z], '#efd28c');
  }
}

function seat(group) {
  box(group, [.442, .033, .351], [0, .018, 0], '#364c4f');
  box(group, [.469, .237, .373], [0, .144, 0], '#57867c');
  box(group, [.48, .030, .38], [0, .27, 0], '#82a495');
  for (const x of [-.202, .202]) {
    box(group, [.021, .012, .338], [x, .28, 0], '#abc1a3');
  }
}

function radio(group) {
  box(group, [.074, .122, .038], [0, 0, 0], '#2c3e4a');
  box(group, [.054, .096, .008], [0, .004, .020], '#465962');
  box(group, [.043, .024, .007], [0, .035, .025], '#a1ba92');
  box(group, [.017, .037, .020], [.039, .014, .002], '#bf7649');
  for (const y of [-.006, -.017, -.028]) {
    box(group, [.036, .004, .005], [0, y, .025], '#273940');
  }
  tube(group, .007, [-.023, .056, 0], [-.026, .115, 0], '#263740');
  tube(group, .01, [.026, .056, 0], [.026, .073, 0], '#607078');
}

function blanket(group) {
  const width = 24;
  const height = 8;
  const geometry = new T.PlaneGeometry(1, 1, width, height);
  const points = geometry.getAttribute('position');
  const colors = [];
  const center = new T.Color('#ab5644');
  const hem = new T.Color('#efb779');
  const stripe = new T.Color('#c87958');
  for (let row = 0; row <= height; row++) {
    for (let col = 0; col <= width; col++) {
      const edge = Math.min(col, width - col, row, height - row);
      const color = edge === 0 ? hem : (col % 5 === 0 ? stripe : center);
      colors.push(color.r, color.g, color.b);
    }
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const cloth = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({ side: T.DoubleSide, vertexColors: true, roughness: .94 }),
  );
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.frustumCulled = false;
  group.add(cloth);
  return ({ blend }) => {
    for (let row = 0; row <= height; row++) {
      for (let col = 0; col <= width; col++) {
        const u = 2 * col / width - 1;
        const v = .5 - row / height;
        const angle = u * 2.68;
        const fold = Math.sin(col * 1.7 + row * .23);
        const x = T.MathUtils.lerp(.16 * u, .245 * Math.sin(angle), blend) + fold * .008;
        const y = v * T.MathUtils.lerp(.23, .66, blend) - .025 * Math.abs(u);
        const z = T.MathUtils.lerp(.02 * fold, .179 * Math.cos(angle), blend) + fold * .004;
        points.setXYZ(row * (width + 1) + col, x, y, z);
      }
    }
    points.needsUpdate = true;
    geometry.computeVertexNormals();
  };
}

const primitives = new Map(Object.entries({
  obstacle: crate,
  door,
  'door-frame': doorFrame,
  cutter,
  bar,
  'bar-top': barTop,
  cage,
  'cage-gate': cageGate,
  table,
  mat,
  seat,
  radio,
  blanket,
}));
const instances = new Map();

function markVisibleMeshes(scene) {
  scene.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      if (['hose', 'extinguisher'].includes(node.userData.category)) node.visible = false;
    }
  });
}

export function firefighterScene(source) {
  const scene = cloneSkeleton(source.scene);
  scene.getObjectByName('Character').scale.setScalar(1);
  markVisibleMeshes(scene);
  return scene;
}

function reach(subject, side, target) {
  const upper = subject.getObjectByName(side + 'Arm');
  const lower = subject.getObjectByName(side + 'ForeArm');
  const shoulder = upper.getWorldPosition(new T.Vector3());
  const parent = upper.parent.getWorldQuaternion(new T.Quaternion());
  const localDown = new T.Vector3(0, -1, 0);
  const direction = target.clone().sub(shoulder);
  const first = .27;
  const second = .24;
  const length = T.MathUtils.clamp(direction.length(), .06, first + second - .002);
  direction.normalize();
  const projection = (first ** 2 - second ** 2 + length ** 2) / (2 * length);
  const height = Math.sqrt(first ** 2 - projection ** 2);
  const elbowBias = new T.Vector3(side === 'Left' ? 1 : -1, -.9, 0).applyQuaternion(parent);
  elbowBias.addScaledVector(direction, -elbowBias.dot(direction)).normalize();
  const elbow = direction.clone().multiplyScalar(projection).addScaledVector(elbowBias, height);
  const lowerAxis = direction.clone().multiplyScalar(length).sub(elbow).normalize();
  const upperRotation = new T.Quaternion().setFromUnitVectors(localDown, elbow.normalize());
  const lowerRotation = new T.Quaternion().setFromUnitVectors(localDown, lowerAxis);
  upper.quaternion.copy(parent.invert().multiply(upperRotation));
  lower.quaternion.copy(upperRotation.invert().multiply(lowerRotation));
}

function actor(scene, model) {
  const object = cloneSkeleton(scene);
  const character = object.getObjectByName('Character');
  const hips = object.getObjectByName('Hips');
  if (!model.startsWith('child')) character.scale.setScalar(1);
  object.updateMatrixWorld(true);
  object.position.sub(hips.getWorldPosition(new T.Vector3()));
  markVisibleMeshes(object);

  const boneNames = [
    'Hips', 'Spine', 'Chest', 'Head', 'LeftArm', 'RightArm',
    'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg',
    'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot',
  ];
  const bones = Object.fromEntries(boneNames.map(name => [name, object.getObjectByName(name)]));
  function set(name, x = 0, y = 0, z = 0) {
    bones[name].rotation.set(radians(x), radians(y), radians(z), 'XYZ');
  }
  if (model === 'medic') {
    const white = '#e1e8dc';
    const red = '#d75b52';
    const vest = new T.Group();
    vest.position.set(0, .055, .067);
    box(vest, [.245, .19, .14], [0, 0, 0], '#8aa6a1');
    for (const x of [-.076, .076]) {
      box(vest, [.021, .182, .012], [x, .002, .075], white);
    }
    box(vest, [.194, .026, .016], [0, -.045, .082], white);
    box(vest, [.055, .057, .018], [0, .026, .082], red);
    box(vest, [.013, .034, .008], [0, .026, .094], white);
    box(vest, [.032, .012, .008], [0, .026, .094], white);
    bones.Chest.add(vest);
  }

  let pose;
  if (model.startsWith('child')) {
    const shoulder = model === 'child-shoulder';
    pose = ({ blend }) => {
      set('Spine', shoulder ? 17 : T.MathUtils.lerp(10, 3, blend));
      set('Head', shoulder ? 21 : 7 * blend);
      set('LeftArm', shoulder ? 72 : T.MathUtils.lerp(-33, -20, blend), 0, 12);
      set('RightArm', shoulder ? 76 : T.MathUtils.lerp(-32, -19, blend), 0, -12);
      set('LeftForeArm', shoulder ? -16 : T.MathUtils.lerp(-39, -62, blend));
      set('RightForeArm', shoulder ? -12 : T.MathUtils.lerp(-41, -54, blend));
      set('LeftUpLeg', shoulder ? 34 : T.MathUtils.lerp(-85, -42, blend), 0, 9);
      set('RightUpLeg', shoulder ? 37 : T.MathUtils.lerp(-81, -39, blend), 0, -8);
      set('LeftLeg', shoulder ? 44 : T.MathUtils.lerp(73, 75, blend));
      set('RightLeg', shoulder ? 46 : T.MathUtils.lerp(72, 73, blend));
    };
  } else if (model === 'adult-assisted') {
    pose = ({ blend }) => {
      const phase = blend * Math.PI * 2;
      const swing = Math.sin(phase);
      set('Spine', 8, 0, 13);
      set('Head', 7, -10, -7);
      set('RightArm', -13, 0, -83);
      set('RightForeArm', -15, 0, -12);
      set('LeftArm', swing * -14 - 6, 0, 12);
      set('LeftForeArm', -23);
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        const stride = swing * sign;
        const knee = 11 + 19 * Math.max(0, stride);
        const thigh = -6 - 18 * stride;
        set(side + 'UpLeg', thigh, 0, 2 * sign);
        set(side + 'Leg', knee);
        set(side + 'Foot', -(thigh + knee));
      }
    };
  } else if (model === 'adult-pulled') {
    pose = ({ blend }) => {
      set('Head', 12 * blend);
      set('RightArm', -17, 0, -20);
      set('LeftArm', -20, 0, 20);
      set('RightForeArm', -30);
      set('LeftForeArm', -32);
      set('LeftUpLeg', -18 * blend);
      set('RightUpLeg', -14 * blend);
      set('LeftLeg', 24 * blend);
      set('RightLeg', 19 * blend);
    };
  } else if (model === 'medic') {
    pose = ({ blend, handoffChild }) => {
      set('Spine', 5 + 7 * blend);
      set('Chest', 4 * blend);
      set('Head', 12 * blend);
      for (const [side, sign, offset] of [
        ['Left', 1, [.057, -.172, .109]],
        ['Right', -1, [.055, .200, .082]],
      ]) {
        set(side + 'Arm', -13, 0, 7 * sign);
        set(side + 'ForeArm', -24);
        const neutral = object.getObjectByName(side + 'Hand').getWorldPosition(new T.Vector3());
        const contact = handoffChild.localToWorld(new T.Vector3(...offset));
        reach(object, side, neutral.lerp(contact, blend));
      }
    };
  } else if (model === 'adult') {
    pose = ({ blend }) => {
      set('Spine', 7 + 5 * blend);
      set('Head', 13 - 17 * blend);
      set('LeftArm', -17 - 9 * blend, 0, 11);
      set('RightArm', -13 - 11 * blend, 0, -11);
      set('LeftForeArm', -35 - 6 * blend);
      set('RightForeArm', -34 - 7 * blend);
      for (const side of ['Left', 'Right']) {
        set(side + 'UpLeg', -12);
        set(side + 'Leg', 24);
        set(side + 'Foot', -12);
      }
    };
  }
  return { object, pose };
}

export function makeProp(model, sources) {
  if (instances.has(model)) return instances.get(model);
  const object = new T.Group();
  let pose;
  if (primitives.has(model)) {
    pose = primitives.get(model)(object);
  } else if (model === 'cat' || model === 'cat-cradle') {
    const cat = sources.cat.scene.clone(true);
    if (model === 'cat') cat.rotation.y = -Math.PI / 2;
    markVisibleMeshes(cat);
    object.add(cat);
    const tail = cat.getObjectByName('cat_tail');
    const head = cat.getObjectByName('cat_head');
    pose = ({ time }) => {
      tail.rotation.z = .104 * Math.sin(time * 4.5);
      head.rotation.y = .08 * Math.sin(time * 3.4);
    };
  } else {
    const known = ['child', 'child-shoulder', 'adult', 'adult-assisted', 'adult-pulled', 'medic'];
    if (!known.includes(model)) throw new Error('Unknown preview model ' + model);
    const source = model.startsWith('child') ? sources.child : sources.adult;
    const subject = actor(source.scene, model);
    object.add(subject.object);
    pose = subject.pose;
  }
  object.name = model;
  const instance = { object, pose };
  instances.set(model, instance);
  return instance;
}
