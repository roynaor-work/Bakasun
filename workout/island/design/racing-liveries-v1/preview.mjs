// Original CC0-1.0. Review surface only; no production imports point here.
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {loadPalettes, paintCar} from './apply-livery.mjs';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), status = $('#status');
const state = {ready: false, team: 'flame', view: 'front', spinning: false, errors: []};
window.liveryPreview = {state};

async function init() {
  const {manifest, teams} = await loadPalettes();
  const {scene: source} = await new GLTFLoader().loadAsync(new URL(manifest.model, import.meta.url).href);
  const renderer = new T.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.setClearColor('#18232e');
  stage.append(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color('#18232e');
  scene.add(new T.HemisphereLight('#e9f3ff', '#687377', 2.2));
  for (const [position, color, intensity] of [
    [[2, 7, 5], '#fff5e7', 3.3], [[-5, 4, -3], '#c4e0ff', 2.5], [[5, 3, -5], '#ffffff', 1.8],
  ]) {
    const light = new T.DirectionalLight(color, intensity);
    light.position.set(...position); scene.add(light);
  }
  const floor = new T.Mesh(new T.PlaneGeometry(200, 200),
    new T.MeshStandardMaterial({color: '#26323d', roughness: .93, metalness: .06}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.018; scene.add(floor);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 12, 64, 64, 64);
  gradient.addColorStop(0, '#000b'); gradient.addColorStop(.6, '#0005'); gradient.addColorStop(1, '#0000');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const shadowMaterial = new T.MeshBasicMaterial({map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false});
  const camera = new T.OrthographicCamera(-4, 4, 3, -3, .1, 100);
  const target = new T.Vector3(0, .38, 0);
  const pairs = new Map();
  // One renderer/context for the gallery and the interactive pair.
  for (const palette of teams) {
    const group = new T.Group();
    for (const [index, car] of palette.cars.entries()) {
      const painted = await paintCar(source, palette, car, manifest.mapping);
      const holder = new T.Group();
      holder.position.set(index === 0 ? -1.35 : 1.35, 0, index === 0 ? .30 : -.30);
      holder.add(painted.root);
      const shadow = new T.Mesh(new T.PlaneGeometry(2.8, 5.4), shadowMaterial);
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.009;
      holder.add(shadow); group.add(holder);
    }
    pairs.set(palette.id, group);
  }
  let active, azimuth = .52, elevation = .56, zoom = 1;
  function viewCamera(aspect) {
    const width = Math.max(7.4, 5.4 * aspect) / zoom;
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = width / aspect / 2; camera.bottom = -camera.top;
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * 14,
      .38 + Math.sin(elevation) * 14, Math.cos(azimuth) * Math.cos(elevation) * 14);
    camera.lookAt(target); camera.updateProjectionMatrix();
  }
  function draw() {
    const {width, height} = stage.getBoundingClientRect();
    renderer.setSize(width, height, false); viewCamera(width / height);
    renderer.render(scene, camera);
  }
  function select(id, render = true) {
    const index = teams.findIndex(team => team.id === id), team = teams[index];
    if (!team) return;
    if (active) scene.remove(active);
    active = pairs.get(id); scene.add(active); state.team = id;
    $('#team-name').textContent = team.name;
    $('#team-index').textContent = `קבוצה ${index + 1} מתוך 6`;
    $('.edition bdi').textContent = `${String(index + 1).padStart(2, '0')} / 06`;
    $('#stage-count').textContent = team.cars.map(car => `#${car.number}`).join(' / ');
    $('#pair-numbers').textContent = team.cars.map(car => `#${car.number}`).join(' + ');
    stage.setAttribute('aria-label', `קבוצת ${team.name}, רכבים ${team.cars.map(car => car.number).join(' ו־')}. חצים לסיבוב, פלוס ומינוס להתקרבות.`);
    document.documentElement.style.setProperty('--accent', team.primary);
    $('#swatches').replaceChildren(...[['גוף', team.primary], ['כנפיים', team.secondary], ['פס', team.stripe]].map(([label, color]) => {
      const swatch = document.createElement('div'); swatch.className = 'swatch';
      swatch.style.setProperty('--swatch', color);
      const bar = document.createElement('i'), name = document.createElement('span'), value = document.createElement('code');
      name.textContent = label; value.textContent = color.toUpperCase();
      swatch.append(bar, name, value); return swatch;
    }));
    $('#palette-link').href = `palettes/${id}.json`;
    $('#number-links').replaceChildren(...team.cars.map(car => {
      const link = document.createElement('a'); link.href = car.numberPlate; link.download = '';
      link.textContent = `PNG #${car.number}`; return link;
    }));
    document.querySelectorAll('.team-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.team === id)));
    if (render) draw();
  }
  function setView(view) {
    state.view = view; zoom = 1;
    [azimuth, elevation] = view === 'rear' ? [Math.PI + .5, .47] : view === 'top' ? [0, 1.56] : [.52, .56];
    $('#view-label').textContent = {front: 'מבט קדמי', rear: 'מבט אחורי', top: 'מבט על'}[view];
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    draw();
  }
  // Render every team on the exact same camera and lighting for direct comparison.
  renderer.setPixelRatio(1); renderer.setSize(864, 480, false); viewCamera(1.8);
  for (const [index, team] of teams.entries()) {
    select(team.id, false); renderer.render(scene, camera);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'team-card';
    button.dataset.team = team.id; button.style.setProperty('--team', team.primary);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${team.name}, רכבים ${team.cars.map(car => car.number).join(' ו־')}`);
    const image = document.createElement('img'); image.src = renderer.domElement.toDataURL('image/png');
    image.alt = `שני רכבי קבוצת ${team.name} על דגם הפורמולה`; image.width = 864; image.height = 480;
    const caption = document.createElement('span'); caption.className = 'card-caption';
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = team.name;
    const numbers = document.createElement('span'); numbers.className = 'card-numbers';
    numbers.textContent = team.cars.map(car => `#${car.number}`).join(' / ');
    caption.append(name, numbers); button.append(image, caption);
    button.addEventListener('click', () => {select(team.id);});
    $('#gallery').append(button);
    status.textContent = `מכין תצוגה ${index + 1} מתוך 6…`;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); select('flame');
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  let animationFrame, previous = 0;
  function spin(now) {
    if (!state.spinning) return;
    if (previous) azimuth += Math.min(.05, (now - previous) / 1000) * .3;
    previous = now; draw(); animationFrame = requestAnimationFrame(spin);
  }
  function stopSpin() {
    state.spinning = false; cancelAnimationFrame(animationFrame); previous = 0;
    $('#spin').setAttribute('aria-pressed', 'false'); $('#spin').textContent = 'סיבוב אוטומטי';
  }
  $('#spin').addEventListener('click', () => {
    if (state.spinning) return stopSpin();
    state.spinning = true; $('#spin').setAttribute('aria-pressed', 'true'); $('#spin').textContent = 'עצירת הסיבוב';
    animationFrame = requestAnimationFrame(spin);
  });
  document.addEventListener('visibilitychange', () => {if (document.hidden) stopSpin();});
  let pointer;
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stopSpin(); pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    azimuth -= (event.clientX - pointer.x) * .008;
    elevation = T.MathUtils.clamp(elevation + (event.clientY - pointer.y) * .006, .12, 1.56);
    pointer.x = event.clientX; pointer.y = event.clientY; draw();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(name, () => {pointer = null;});
  stage.addEventListener('wheel', event => {
    event.preventDefault(); zoom = T.MathUtils.clamp(zoom * Math.exp(-event.deltaY * .001), .75, 1.65); draw();
  }, {passive: false});
  stage.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault(); stopSpin();
    if (event.key === 'ArrowLeft') azimuth -= .12;
    if (event.key === 'ArrowRight') azimuth += .12;
    if (event.key === 'ArrowUp') elevation = Math.min(1.56, elevation + .1);
    if (event.key === 'ArrowDown') elevation = Math.max(.12, elevation - .1);
    if (['+', '=', '-'].includes(event.key)) zoom = T.MathUtils.clamp(zoom * (event.key === '-' ? .9 : 1.1), .75, 1.65);
    draw();
  });
  new ResizeObserver(draw).observe(stage);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); stopSpin(); state.ready = false;
    status.classList.add('error'); status.textContent = 'התצוגה התלת־ממדית נעצרה. רעננו את העמוד כדי לטעון אותה שוב.';
  });
  state.ready = true;
  state.teams = teams.map(team => ({id: team.id, primary: team.primary, numbers: team.cars.map(car => car.number)}));
  window.liveryPreview = {state, manifest, teams, source, pairs, renderer, select, setView};
  status.textContent = 'כל שש הקבוצות מוכנות · 12 רכבים · מדבקות המספר בגודל 512 × 512';
}

init().catch(error => {
  state.errors.push(error.message); status.classList.add('error');
  status.textContent = 'לא ניתן לטעון את התצוגה. פתחו אותה דרך שרת HTTP עם תמיכה ב־WebGL.';
  console.error(error);
});
