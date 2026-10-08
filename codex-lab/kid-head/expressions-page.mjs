import * as T from './three.module.js';
import {expressionModel} from './expression-model.mjs';
import {EXPRESSION_LIST, EXPRESSIONS} from './expressions.mjs';

const query = new URLSearchParams(location.search);
const capture = query.get('capture') === '1';
const viewport = document.querySelector('#viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const views = {front: 0, frontRepeat: 0, threeQuarter: Math.PI / 4, side: Math.PI / 2, back: Math.PI};
const viewLabels = {front: 'חזית', frontRepeat: 'חזית נוספת', threeQuarter: 'שלושה רבעים', side: 'צד', back: 'גב'};
let selectedExpression = EXPRESSIONS[query.get('expression')] ? query.get('expression') : 'happy';
let selectedView = query.get('view') in views ? query.get('view') : 'front';
let blendAmount = 0;
let playing = false;
let elapsed = 0;
let lastFrame = performance.now();
let statsStart = lastFrame;
let statsFrames = 0;
let fps = 0;
let renderedTriangles = 0;
let bodyHidden = false;
let animationFrame;

if (capture) {
  document.body.classList.add('capture');
  const host = document.querySelector('.capture-host');
  host.hidden = false;
  host.append(viewport);
}

const from = document.querySelector('#from');
const to = document.querySelector('#to');
const slider = document.querySelector('#blend');
const playButton = document.querySelector('#play');
const comparisonView = document.querySelector('#comparison-view');
const buttons = document.querySelector('#expression-buttons');
const gallery = document.querySelector('#gallery');
const tableBody = document.querySelector('#expression-table-body');

EXPRESSION_LIST.forEach((expression, index) => {
  from.add(new Option(expression.label, expression.id));
  to.add(new Option(expression.label, expression.id));
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = expression.label;
  button.dataset.expression = expression.id;
  button.setAttribute('aria-pressed', String(expression.id === selectedExpression));
  buttons.append(button);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'expression-card';
  card.dataset.expression = expression.id;
  card.setAttribute('aria-pressed', String(expression.id === selectedExpression));
  card.setAttribute('aria-label', `הצגת הבעת ${expression.label} במודל החי`);
  const portrait = document.createElement('div');
  portrait.className = 'portrait';
  const image = new Image();
  if (!capture) image.src = `./shots/faces/${expression.id}/front.png`;
  image.alt = `הבעת ${expression.label}, חזית`;
  image.loading = 'lazy';
  image.width = 1024;
  image.height = 1024;
  portrait.append(image);
  const caption = document.createElement('div');
  caption.className = 'card-caption';
  const name = document.createElement('strong');
  name.textContent = expression.label;
  const number = document.createElement('span');
  number.textContent = String(index + 1).padStart(2, '0');
  caption.append(name, number);
  card.append(portrait, caption);
  gallery.append(card);
  const row = document.createElement('tr');
  const header = document.createElement('th');
  header.scope = 'row';
  const tableNumber = document.createElement('span');
  tableNumber.className = 'table-index';
  tableNumber.textContent = String(index + 1).padStart(2, '0');
  header.append(tableNumber, document.createTextNode(expression.label));
  const description = document.createElement('td');
  description.textContent = expression.description;
  const parameters = document.createElement('td');
  parameters.className = 'parameter-cell';
  const parameterKeys = {
    happy: ['eyeOpen', 'cheekLift', 'jawOpen', 'mouthOpen', 'smile'],
    effort: ['eyeOpen', 'browTilt', 'cheekPuff', 'chinTight', 'clench'],
    surprised: ['eyeOpen', 'browRaise', 'jawOpen', 'mouthOpen', 'mouthWidth'],
    victory: ['wink', 'browAsym', 'cheekLift', 'mouthWidth', 'smile'],
    tired: ['eyeOpen', 'gazeY', 'browRaise', 'mouthOpen', 'smile'],
    thinking: ['gazeX', 'gazeY', 'browAsym', 'mouthShift', 'smile'],
  };
  parameters.textContent = parameterKeys[expression.id].map(name => `${name}: ${expression.parameters[name]}`).join(' · ');
  row.append(header, description, parameters);
  tableBody.append(row);
});
from.value = selectedExpression;
to.value = 'surprised';
comparisonView.value = selectedView === 'frontRepeat' ? 'front' : selectedView;
if (reducedMotion.matches) document.querySelector('#motion-note').textContent = 'תנועה מופחתת פעילה. המעבר מתחיל רק בלחיצה; אפשר להשתמש בסרגל.';

function updateComparison() {
  if (capture) return;
  const view = comparisonView.value;
  const expression = EXPRESSIONS[selectedExpression];
  const before = document.querySelector('#before-image');
  before.src = `./shots/faces/baseline-r9/original/${view}.png`;
  before.alt = `סבב 9 המקורי, ${viewLabels[view]}`;
  const after = document.querySelector('#after-image');
  after.src = `./shots/faces/${selectedExpression}/${view}.png`;
  after.alt = `המודל החדש בהבעת ${expression.label}, ${viewLabels[view]}`;
  document.querySelector('#after-label').textContent = `אחרי · ${expression.label}`;
}

function updateReadout() {
  const expression = EXPRESSIONS[selectedExpression];
  const isBlended = blendAmount > 0 && blendAmount < 1;
  const label = isBlended ? `${EXPRESSIONS[from.value].label} ← ${EXPRESSIONS[to.value].label}` : expression.label;
  document.querySelector('#expression-label').textContent = label;
  document.querySelector('#current-title').textContent = isBlended ? `במעבר · ${Math.round(blendAmount * 100)}%` : expression.label;
  document.querySelector('#current-description').textContent = isBlended ? `שינוי רציף של פרמטרי הפנים בין ${EXPRESSIONS[from.value].label} ובין ${EXPRESSIONS[to.value].label}.` : expression.description;
  viewport.setAttribute('aria-label', `ראש ילד בתלת־ממד, ${label}, ${viewLabels[selectedView]}`);
  document.querySelectorAll('[data-expression]').forEach(button => button.setAttribute('aria-pressed', String(!isBlended && button.dataset.expression === selectedExpression)));
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === selectedView)));
}

function stopPlaying() {
  playing = false;
  cancelAnimationFrame(animationFrame);
  fps = 0;
  playButton.textContent = '▶ הפעלת מעבר';
  playButton.setAttribute('aria-pressed', 'false');
  document.querySelector('.current-readout').setAttribute('aria-live', 'polite');
  updateStatsText();
}

function updateStatsText() {
  const status = playing ? (fps ? `${Math.round(fps)} FPS` : 'המעבר פעיל') : 'האנימציה מושהית';
  const element = document.querySelector('#render-stats');
  element.textContent = `${renderedTriangles.toLocaleString('en-US')} משולשים · ${status}`;
  element.style.direction = 'rtl';
}

function setSlider(value) {
  blendAmount = T.MathUtils.clamp(Number(value) || 0, 0, 1);
  slider.value = String(Math.round(blendAmount * 100));
  document.querySelector('#blend-output').value = `${Math.round(blendAmount * 100)}%`;
}

try {
  const scene = new T.Scene();
  scene.background = new T.Color('#f1eee7');
  const camera = new T.OrthographicCamera(-2.25, 2.25, 2.25, -2.25, .1, 100);
  const renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  viewport.append(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff, 0x877f95, 2));
  const key = new T.DirectionalLight(0xffeed8, 3);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const fill = new T.DirectionalLight(0xc8d9ff, 1);
  fill.position.set(4, 2, -3);
  scene.add(fill);
  const model = expressionModel({expression: selectedExpression});
  model.root.position.y = .25;
  scene.add(model.root);
  let width = 0;
  let height = 0;

  function resize() {
    const nextWidth = Math.max(1, Math.round(viewport.clientWidth));
    const nextHeight = Math.max(1, Math.round(viewport.clientHeight));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    // Square comparison captures retain the exact r9 frame. Narrow phone
    // viewports retain at least 2.8 units horizontally to keep both ears in view.
    const span = Math.max(4.5, 2.8 / aspect);
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
  }

  function render() {
    resize();
    camera.position.set(Math.sin(views[selectedView]) * 8, .08 * 8, Math.cos(views[selectedView]) * 8);
    camera.lookAt(0, .13, 0);
    renderer.render(scene, camera);
    renderedTriangles = renderer.info.render.triangles;
    if (!playing) updateStatsText();
  }

  function setExpression(id) {
    if (!EXPRESSIONS[id]) throw new Error(`Unknown expression ${id}`);
    stopPlaying();
    selectedExpression = id;
    from.value = id;
    setSlider(0);
    model.setExpression(id);
    updateReadout();
    updateComparison();
    render();
  }

  function applyBlend(value, refreshReadout = true) {
    setSlider(value);
    model.setBlend(from.value, to.value, blendAmount);
    selectedExpression = blendAmount >= 1 ? to.value : from.value;
    if (refreshReadout) updateReadout();
    render();
  }

  function setBlend(fromId, toId, value) {
    if (!EXPRESSIONS[fromId] || !EXPRESSIONS[toId]) throw new Error('Unknown expression in blend');
    stopPlaying();
    from.value = fromId;
    to.value = toId;
    applyBlend(value);
    updateComparison();
  }

  function setView(view) {
    if (!(view in views)) throw new Error(`Unknown view ${view}`);
    selectedView = view;
    updateReadout();
    render();
  }

  window.faces = {
    ready: false,
    model,
    expressions: EXPRESSION_LIST,
    renderer,
    scene,
    camera,
    setExpression,
    setBlend,
    setView,
    headOnly(value = true) {
      bodyHidden = Boolean(value);
      model.body.forEach(object => { object.visible = !bodyHidden; });
      render();
    },
    render,
    getStats() {
      return {
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        fps: Math.round(fps * 10) / 10,
        width,
        height,
        pixelRatio: renderer.getPixelRatio(),
        cameraSpan: {horizontal: camera.right - camera.left, vertical: camera.top - camera.bottom},
        expression: selectedExpression,
        view: selectedView,
        blend: blendAmount,
        headOnly: bodyHidden,
        playing,
      };
    },
  };

  document.querySelectorAll('[data-expression]').forEach(button => button.addEventListener('click', () => setExpression(button.dataset.expression)));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  from.addEventListener('change', () => { stopPlaying(); applyBlend(blendAmount); updateComparison(); });
  to.addEventListener('change', () => { stopPlaying(); applyBlend(blendAmount); updateComparison(); });
  slider.addEventListener('input', () => { stopPlaying(); applyBlend(Number(slider.value) / 100); });
  playButton.addEventListener('click', () => {
    if (playing) { stopPlaying(); return; }
    // Inverse cosine easing preserves the visible slider position on restart.
    elapsed = Math.acos(1 - 2 * blendAmount) / Math.PI * 2400;
    playing = true;
    lastFrame = performance.now();
    statsStart = lastFrame;
    statsFrames = 0;
    fps = 0;
    playButton.textContent = 'Ⅱ עצירת מעבר';
    playButton.setAttribute('aria-pressed', 'true');
    document.querySelector('.current-readout').setAttribute('aria-live', 'off');
    updateStatsText();
    animationFrame = requestAnimationFrame(frame);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPlaying();
    lastFrame = performance.now();
    statsStart = lastFrame;
    statsFrames = 0;
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) stopPlaying();
  });
  const observer = new ResizeObserver(() => render());
  observer.observe(viewport);
  updateReadout();
  updateComparison();
  render();
  window.faces.ready = true;

  function frame(now) {
    if (!playing) return;
    const delta = Math.max(now - lastFrame, 0);
    lastFrame = now;
    elapsed += delta;
    const value = .5 - .5 * Math.cos((elapsed / 2400) * Math.PI);
    const previousPercent = Number(slider.value);
    applyBlend(value, Math.round(value * 100) !== previousPercent);
    statsFrames += 1;
    if (now - statsStart >= 1000) {
      fps = statsFrames * 1000 / (now - statsStart);
      statsFrames = 0;
      statsStart = now;
      updateStatsText();
    }
    animationFrame = requestAnimationFrame(frame);
  }
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    model.dispose?.();
    renderer.dispose();
  }, {once: true});
} catch (error) {
  const notice = document.querySelector('#error');
  notice.hidden = false;
  notice.textContent = 'התצוגה החיה לא נטענה. יש לפתוח את המעבדה דרך השרת המקומי עם תמיכה ב־WebGL.';
  document.querySelectorAll('.controls button,.controls select,.controls input').forEach(control => { control.disabled = true; });
  window.faces = {ready: false, error: error.message};
  console.error(error);
}

comparisonView.addEventListener('change', updateComparison);
const referenceInput = document.querySelector('#reference-input');
let referenceUrl;
referenceInput.addEventListener('change', () => {
  const file = referenceInput.files[0];
  if (!file) return;
  if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  referenceUrl = URL.createObjectURL(file);
  const image = document.querySelector('#reference-image');
  image.src = referenceUrl;
  image.hidden = false;
  document.querySelector('#reference-status').textContent = `${file.name} · השוואה חזותית בלבד, ללא חישוב מדדים`;
});
