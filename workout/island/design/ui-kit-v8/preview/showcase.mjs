import { mountControls } from '../runtime/controls.mjs';
import { connectDialog } from '../runtime/dialog.mjs';

const parameters = new URLSearchParams(location.search);
const stage = document.querySelector('.iu-stage');
const toast = stage.querySelector('[data-toast]');
const mapLayer = stage.querySelector('.demo-map');
const mapKey = stage.querySelector('.demo-map-key');
const mapButton = document.querySelector('[data-map]');
const labels = { jump: 'קפיצה', swap: 'החלפה', boost: 'האצה' };
let timer;
let showingMap = false;

if (parameters.has('capture')) document.body.setAttribute('data-capture', '');
function notify(text) {
  clearTimeout(timer);
  toast.querySelector('span').textContent = text;
  toast.hidden = false;
  timer = setTimeout(() => { toast.hidden = true; }, 3000);
}
const controls = mountControls(stage, {
  onMove({ x, y, active }) {
    const player = stage.querySelector('.demo-player span');
    player.style.transform = `translate(${x * 10}px, ${y * 10}px)`;
    stage.toggleAttribute('data-moving', active);
  },
  onAction({ id, phase }) {
    if (phase === 'release') notify(`הדגמת פעולה: ${labels[id]}`);
  },
  onPause() { openScreen('pause'); },
});
const dialogs = new Map([...document.querySelectorAll('dialog')].map(dialog => [dialog.id,
  connectDialog(dialog, { controls, fallbackFocus: stage.querySelector('[data-iu-target="pause"]') })]));

function renderMap() {
  stage.toggleAttribute('data-demo-stacked', Boolean(controls.map?.stacked));
  if (!showingMap || !controls.map) return;
  mapLayer.replaceChildren();
  for (const target of controls.map.targets) {
    const box = document.createElement('div');
    box.className = 'demo-map__rect';
    box.dataset.side = ['joystick', 'pause'].includes(target.id) ? 'left' : 'right';
    box.dataset.target = target.id;
    Object.assign(box.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px` });
    const title = document.createElement('b');
    title.append(document.createTextNode(target.id));
    const dimensions = document.createElement('span');
    dimensions.textContent = `${Math.round(target.width)}×${Math.round(target.height)}`;
    title.append(dimensions);
    box.append(title); mapLayer.append(box);
  }
}
function setMap(value) {
  showingMap = value; mapLayer.hidden = !value; mapKey.hidden = !value;
  mapButton.setAttribute('aria-pressed', String(value)); renderMap();
}
function setView(name) {
  for (const button of document.querySelectorAll('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  }
}
function openScreen(name) {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  if (name === 'play') { controls.setEnabled(true); setView('play'); return; }
  const dialog = document.getElementById(`${name}-dialog`);
  if (!dialog) return;
  toast.hidden = true;
  setView(name);
  dialogs.get(dialog.id).open();
}
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => openScreen(button.dataset.view));
}
for (const dialog of document.querySelectorAll('dialog')) {
  for (const button of dialog.querySelectorAll('[data-close]')) button.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) setView('play');
  });
}
mapButton.addEventListener('click', () => setMap(!showingMap));
document.querySelector('[data-demo-toast]').addEventListener('click', () => {
  document.getElementById('library-dialog').close(); notify('ההגדרות נשמרו.');
});
const resizeObserver = new ResizeObserver(() => { requestAnimationFrame(renderMap); });
resizeObserver.observe(stage);
if (parameters.has('map')) setMap(true);
requestAnimationFrame(() => {
  if (parameters.get('screen')) openScreen(parameters.get('screen'));
});
// A small, documented preview hook supports reproducible browser verification.
window.islandPreview = { controls, openScreen, setMap, notify };
