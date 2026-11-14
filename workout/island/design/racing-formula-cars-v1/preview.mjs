// Original CC0-1.0. Source and dedication: ./LICENSES.md.
import * as T from '../../vendor/three.module.js';
import {TEAM_COLORS, TEAM_ACCENTS, createFormulaCar, loadFormulaTemplates} from './model.mjs';

const $ = selector => document.querySelector(selector);
const status = $('#status');
const state = {color: 0, angle: 'front', yaw: 0, pitch: .40, zoom: 1, distance: 0,
  steering: 0, explosion: 0, rolling: false, rollover: false, equal: false, fleetMode: 'auto'};
const accents = i => TEAM_ACCENTS[Math.floor(i / 2) % TEAM_ACCENTS.length];
let dirty = true;
let renderer, environment, templates;
const views = [], hero = [], fleet = [];
const localGeometries = new Set(), localMaterials = new Set();
const keepGeometry = value => (localGeometries.add(value), value);
const keepMaterial = value => (localMaterials.add(value), value);
const number = value => value.toLocaleString('en-US');

function studio() {
  const scene = new T.Scene();
  scene.background = new T.Color('#12191f');
  scene.environment = environment.texture;
  scene.add(new T.HemisphereLight('#d8e8ff', '#575044', 2.0));
  const key = new T.DirectionalLight('#fff1d8', 3.0);
  key.position.set(4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left: -7, right: 7, top: 7, bottom: -7, near: .2, far: 35});
  key.shadow.bias = -.0005;
  key.shadow.normalBias = .018;
  scene.add(key);
  const rim = new T.DirectionalLight('#b9d9ff', 1.6);
  rim.position.set(-5, 4, -5);
  scene.add(rim);
  const floor = new T.Mesh(keepGeometry(new T.PlaneGeometry(220, 220)),
    keepMaterial(new T.MeshStandardMaterial({color: '#19232c', roughness: .90, metalness: .05})));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.012;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new T.GridHelper(100, 100, '#35424e', '#293641');
  grid.material.transparent = true;
  grid.material.opacity = .28;
  grid.position.y = -.009;
  localGeometries.add(grid.geometry);
  localMaterials.add(grid.material);
  scene.add(grid);
  return scene;
}

function makeEnvironment() {
  const room = new T.Scene();
  room.background = new T.Color('#6f7c89');
  const panels = [[0, 8, 0, Math.PI / 2, 0, 14, 10],
    [0, 3, -10, 0, 0, 10, 4], [8, 3, 0, 0, -Math.PI / 2, 5, 8],
    [-8, 4, 0, 0, Math.PI / 2, 6, 10]];
  for (const [x, y, z, rx, ry, w, h] of panels) {
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({color: '#eef3fc', side: T.DoubleSide}));
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0);
    room.add(mesh);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, .06, .1, 100);
  pmrem.dispose();
  room.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
  return target;
}

function setHeroCameras() {
  for (let i = 0; i < 3; i++) {
    const view = views[i];
    const distance = (state.equal ? 8.8 : [8.8, 15, 24][i]) * state.zoom;
    let yaw = .67 + state.yaw;
    let elevation = state.pitch;
    if (state.angle === 'rear') yaw += Math.PI;
    if (state.angle === 'side') yaw = Math.PI / 2 + state.yaw;
    if (state.angle === 'top') { yaw = state.yaw; elevation = 1.52; }
    view.camera.position.set(Math.sin(yaw) * Math.cos(elevation) * distance,
      .44 + Math.sin(elevation) * distance, Math.cos(yaw) * Math.cos(elevation) * distance);
    view.camera.lookAt(0, .44, 0);
    $(`[data-distance="${i}"]`).textContent = `${distance.toFixed(1)} m`;
  }
}

function fleetLevel(index) {
  if (state.fleetMode !== 'auto') return Number(state.fleetMode);
  const point = new T.Vector3((index % 3 - 1) * 3.6, 0, 6 - Math.floor(index / 3) * 7.4);
  const distance = views[3].camera.position.distanceTo(point);
  // Preview grid thresholds are wider than the suggested chase-camera thresholds.
  return distance < 23 ? 0 : distance < 31 ? 1 : 2;
}

function updateFleet() {
  for (let i = 0; i < 12; i++) {
    const level = fleetLevel(i);
    if (fleet[i]?.level === level) continue;
    fleet[i]?.rig.dispose();
    const rig = createFormulaCar(templates[level], {color: TEAM_COLORS[i], accent: accents(i)});
    rig.root.position.set((i % 3 - 1) * 3.6, 0, 6 - Math.floor(i / 3) * 7.4);
    views[3].scene.add(rig.root);
    fleet[i] = {rig, level};
  }
  const counts = [0, 0, 0];
  let triangles = 0;
  for (const {rig, level} of fleet) { counts[level]++; triangles += rig.triangles; }
  $('#fleet-count').textContent = `${number(triangles)} משולשים במכוניות`;
  $('#fleet-levels').textContent = counts.map((count, i) => `LOD${i} × ${count}`).join('  /  ');
}

function updatePose() {
  for (const rig of [...hero, ...fleet.map(car => car.rig)]) {
    rig.motion(state.distance, state.steering * Math.PI / 180);
    rig.explode(state.explosion / 100);
    rig.root.rotation.z = state.rollover ? 2.15 : 0;
    rig.root.position.y = state.rollover ? 1.15 : 0;
  }
}

function bindControls() {
  const names = ['אדום', 'טורקיז', 'זהב', 'כחול', 'כסף', 'כתום', 'ירוק', 'סגול', 'חול', 'פלדה', 'גרפיט', 'שנהב'];
  TEAM_COLORS.forEach((color, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.setProperty('--swatch', color);
    button.title = `${names[i]} · ${color}`;
    button.setAttribute('aria-label', `צבע ${i + 1}: ${names[i]}`);
    button.setAttribute('aria-pressed', String(i === 0));
    button.addEventListener('click', () => {
      state.color = i;
      for (const rig of hero) rig.paint({color, accent: accents(i)});
      for (const [index, child] of [...$('#palette').children].entries()) child.setAttribute('aria-pressed', String(index === i));
      dirty = true;
    });
    $('#palette').append(button);
  });
  for (const button of document.querySelectorAll('[data-angle]')) {
    button.addEventListener('click', () => {
      state.angle = button.dataset.angle;
      state.yaw = 0;
      for (const candidate of document.querySelectorAll('[data-angle]')) candidate.setAttribute('aria-pressed', String(candidate === button));
      setHeroCameras(); dirty = true;
    });
  }
  for (const name of ['steering', 'explosion']) {
    $(`#${name}`).addEventListener('input', event => {
      state[name] = Number(event.target.value);
      $(`#${name}-value`).textContent = state[name] + (name === 'steering' ? '°' : '%');
      dirty = true;
    });
  }
  for (const name of ['rolling', 'rollover']) $(`#${name}`).addEventListener('change', event => {
    state[name] = event.target.checked; dirty = true;
  });
  $('#equal-scale').addEventListener('change', event => {
    state.equal = event.target.checked; setHeroCameras(); dirty = true;
  });
  $('#fleet-lod').addEventListener('change', event => {
    state.fleetMode = event.target.value; updateFleet(); dirty = true;
  });
  $('#reset').addEventListener('click', () => {
    Object.assign(state, {steering: 0, explosion: 0, rolling: false, rollover: false, distance: 0,
      yaw: 0, pitch: .40, zoom: 1, equal: false, angle: 'front', fleetMode: 'auto'});
    for (const name of ['steering', 'explosion']) { $(`#${name}`).value = '0'; $(`#${name}-value`).textContent = name === 'steering' ? '0°' : '0%'; }
    for (const id of ['rolling', 'rollover', 'equal-scale']) $(`#${id}`).checked = false;
    for (const button of document.querySelectorAll('[data-angle]')) button.setAttribute('aria-pressed', String(button.dataset.angle === 'front'));
    $('#fleet-lod').value = 'auto';
    updateFleet(); setHeroCameras(); dirty = true;
  });
  for (const view of views.slice(0, 3)) {
    let drag = null;
    view.element.addEventListener('pointerdown', event => {
      drag = {x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch};
      view.element.setPointerCapture(event.pointerId);
    });
    view.element.addEventListener('pointermove', event => {
      if (!drag) return;
      state.yaw = drag.yaw + (event.clientX - drag.x) * .008;
      state.pitch = Math.max(.05, Math.min(1.4, drag.pitch + (event.clientY - drag.y) * .006));
      setHeroCameras(); dirty = true;
    });
    const stop = () => { drag = null; };
    view.element.addEventListener('pointerup', stop);
    view.element.addEventListener('pointercancel', stop);
    view.element.addEventListener('wheel', event => {
      // Ctrl/cmd+wheel remains browser zoom; ordinary scrolling over the model adjusts distance.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      state.zoom = Math.max(.65, Math.min(1.8, state.zoom * Math.exp(event.deltaY * .001)));
      setHeroCameras(); dirty = true;
    }, {passive: false});
    view.element.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') state.yaw -= .13;
      if (event.key === 'ArrowRight') state.yaw += .13;
      if (event.key === 'ArrowUp') state.pitch = Math.min(1.4, state.pitch + .1);
      if (event.key === 'ArrowDown') state.pitch = Math.max(.05, state.pitch - .1);
      if (event.key === '+' || event.key === '=') state.zoom = Math.max(.65, state.zoom * .9);
      if (event.key === '-') state.zoom = Math.min(1.8, state.zoom / .9);
      setHeroCameras(); dirty = true;
    });
  }
}

let previous = 0, frame = 0, stopped = false;
function draw(time) {
  if (stopped) return;
  frame = requestAnimationFrame(draw);
  const dt = previous ? Math.min((time - previous) / 1000, .05) : 0;
  previous = time;
  if (document.hidden || (!dirty && !state.rolling)) return;
  dirty = false;
  if (state.rolling) state.distance += dt * 2.5;
  updatePose();
  renderer.setScissorTest(false);
  renderer.setClearColor(0, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const view of views) {
    const rect = view.element.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.width <= 0) continue;
    view.camera.aspect = rect.width / rect.height;
    if (view !== views[3]) view.camera.fov = rect.width / rect.height < 1 ? 50 : 35;
    view.camera.updateProjectionMatrix();
    renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    renderer.setScissor(left, innerHeight - bottom, right - left, bottom - top);
    renderer.render(view.scene, view.camera);
  }
}

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  dirty = true;
}

async function start() {
  try {
    renderer = new T.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'});
    renderer.domElement.className = 'render-surface';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.append(renderer.domElement);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    environment = makeEnvironment();
    templates = await loadFormulaTemplates();
    for (let i = 0; i < 3; i++) {
      const scene = studio(), camera = new T.PerspectiveCamera(35, 1, .1, 300);
      const rig = createFormulaCar(templates[i]);
      scene.add(rig.root);
      hero.push(rig);
      views.push({scene, camera, element: $(`[data-view="${i}"]`)});
      $(`[data-count="${i}"]`).textContent = number(rig.triangles);
    }
    const scene = studio(), camera = new T.PerspectiveCamera(31, 1, .1, 300);
    camera.position.set(9, 13, 24);
    camera.lookAt(0, 0, -5.5);
    // Wider coverage keeps all twelve cars and their shadows in the shared view.
    scene.traverse(node => {
      if (!node.isDirectionalLight || !node.castShadow) return;
      node.position.set(6, 16, 7);
      node.target.position.set(0, 0, -5);
      scene.add(node.target);
      Object.assign(node.shadow.camera, {left: -21, right: 21, top: 21, bottom: -21, near: .2, far: 65});
      node.shadow.camera.updateProjectionMatrix();
    });
    const lines = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const x = (col - 1) * 3.6, z = 6 - row * 7.4;
      lines.push(x - 1.25, .003, z + 2.85, x + 1.25, .003, z + 2.85,
        x - 1.25, .003, z + 2.85, x - 1.25, .003, z - 2.6,
        x + 1.25, .003, z + 2.85, x + 1.25, .003, z - 2.6);
    }
    const lineGeo = keepGeometry(new T.BufferGeometry());
    lineGeo.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
    scene.add(new T.LineSegments(lineGeo, keepMaterial(new T.LineBasicMaterial({color: '#6d7a83', transparent: true, opacity: .42}))));
    views.push({scene, camera, element: $('[data-view="fleet"]')});
    // Fit the whole grid in portrait screens without changing the model scale.
    function frameFleet() {
      if (innerWidth < 600) {
        camera.position.set(9, 21, 33);
        camera.lookAt(0, 0, -1.5);
        camera.fov = 33;
      } else {
        camera.position.set(9, 13, 24);
        camera.lookAt(0, 0, -1.5);
        camera.fov = 31;
      }
      camera.updateProjectionMatrix();
      updateFleet();
    }
    frameFleet();
    bindControls(); setHeroCameras(); resize();
    window.addEventListener('resize', () => { frameFleet(); resize(); });
    window.addEventListener('scroll', () => { dirty = true; }, {passive: true});
    document.addEventListener('visibilitychange', () => { previous = 0; dirty = true; });
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); stopped = true;
      status.textContent = 'תצוגת התלת־ממד נעצרה. רענון הדף יטען אותה מחדש.';
      status.classList.add('error');
    });
    status.textContent = 'שלוש הרמות נטענו · גרירה לסיבוב · ללא טקסט או מותגים על המכוניות';
    window.formulaPreview = Object.freeze({
      snapshot: () => ({ready: true, triangles: hero.map(rig => rig.triangles),
        distances: views.slice(0, 3).map(view => view.camera.position.distanceTo(new T.Vector3(0, .44, 0))),
        materialNames: [...hero[0].materials.keys()],
        heroColor: hero.map(rig => `#${rig.materials.get('body_team').color.getHexString()}`),
        fleet: fleet.map(({rig, level}, i) => ({level, triangles: rig.triangles, color: TEAM_COLORS[i],
          renderedColor: `#${rig.materials.get('body_team').color.getHexString()}`})),
        steering: hero.map(rig => ['steer_fl', 'steer_fr'].map(name => rig.root.getObjectByName(name).rotation.y)),
        wheelPositions: hero.map(rig => rig.wheels.map(wheel => wheel.getWorldPosition(new T.Vector3()).toArray())),
        wheelSpin: hero.map(rig => rig.wheels.map(wheel => wheel.rotation.x)),
        explosion: state.explosion, rollover: state.rollover, rolling: state.rolling,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures}),
    });
    frame = requestAnimationFrame(draw);
    window.addEventListener('pagehide', event => {
      if (event.persisted) return;
      stopped = true; cancelAnimationFrame(frame);
      for (const rig of [...hero, ...fleet.map(car => car.rig)]) rig.dispose();
      const geometries = new Set();
      for (const template of templates) template.traverse(node => { if (node.isMesh) geometries.add(node.geometry); });
      for (const geo of [...geometries, ...localGeometries]) geo.dispose();
      for (const material of localMaterials) material.dispose();
      for (const template of templates) template.traverse(node => {
        if (!node.isMesh) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
      });
      for (const view of views) view.scene.traverse(node => { if (node.isLight) node.dispose?.(); });
      environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    }, {once: true});
  } catch (error) {
    status.textContent = 'התצוגה לא נטענה. יש לפתוח דרך שרת HTTP עם תמיכת WebGL.';
    status.classList.add('error');
    console.error('Formula preview:', error);
  }
}
start();
