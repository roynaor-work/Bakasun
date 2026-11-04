import {SoccerHUD, themes} from './hud.js';

const query = new URLSearchParams(location.search);
const hud = new SoccerHUD(document.getElementById('hud'), {theme: Object.hasOwn(themes, query.get('theme')) ? query.get('theme') : 'coast'});
const panel = document.getElementById('preview-panel');
const freeze = document.getElementById('freeze-clock');
freeze.checked = query.get('freeze') === '1';
const home = [[.05,.5],[.25,.21],[.28,.76],[.43,.38],[.62,.61],[.71,.29]];
const away = [[.95,.5],[.76,.23],[.75,.77],[.55,.17],[.58,.68],[.42,.8]];
let ball = [.65, .63];
const radar = () => hud.updateRadar({home, away, ball, active: 4});
radar();

function displayState(name) {
  hud.setPaused(false);
  hud.setClock(name === 'live' ? 2788 : 4020);
  hud.setScore(name === 'goal' || name === 'replay' ? 3 : 2, 1);
  if (name === 'substitution') hud.showSubstitution({duration: 0});
  else if (name === 'goal') hud.showGoal({home: 3, away: 1});
  else if (name === 'replay') hud.showReplay(query.get('freeze') === '1' ? {progress: .38} : {});
  else hud.setMode('live');
  panel.querySelectorAll('[data-state]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === hud.mode)));
}

document.getElementById('open-preview').addEventListener('click', () => {
  hud.releaseInputs();
  panel.querySelectorAll('[data-state]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === hud.mode)));
  panel.showModal();
});
panel.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => {
  displayState(button.dataset.state);
  panel.close();
}));
panel.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => {
  hud.setTheme(button.dataset.theme);
  updateThemeButtons();
}));
function updateThemeButtons() {
  panel.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === hud.theme)));
}
panel.addEventListener('click', event => {if (event.target === panel) {
  const box = panel.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) panel.close();
}});

document.getElementById('hud').addEventListener('soccer-hud:action', ({detail}) => {
  if (detail.phase !== 'activate') return;
  const labels = {pass: 'מסירה קצרה', through: 'מסירת עומק', shoot: 'בעיטה לשער'};
  if (labels[detail.action]) {
    hud.feedback(labels[detail.action]);
    if (detail.action !== 'shoot') {ball = detail.action === 'pass' ? [.45,.39] : [.75,.3]; radar();}
  }
});

// The preview updates energy at 20 Hz only while draining/recovering. No permanent RAF.
const timer = setInterval(() => {
  if (document.hidden || hud.paused || panel.open || ['goal','replay'].includes(hud.mode)) return;
  if (hud.sprintHeld) hud.setStamina(hud.stamina - .6);
  else if (hud.stamina < 82) hud.setStamina(Math.min(82, hud.stamina + .25));
}, 50);
const clock = setInterval(() => {
  if (!document.hidden && !freeze.checked && !panel.open && !hud.paused && ['live','substitution'].includes(hud.mode)) hud.setClock(hud.clockSeconds + 1);
}, 1000);
displayState(['live','substitution','goal','replay'].includes(query.get('state')) ? query.get('state') : 'live');
updateThemeButtons();
// Local review entry point for inspecting states and capturing the standalone preview.
window.soccerHUDPreview = {hud, displayState, radar};
window.addEventListener('pagehide', () => {clearInterval(timer); clearInterval(clock); hud.destroy();}, {once: true});
