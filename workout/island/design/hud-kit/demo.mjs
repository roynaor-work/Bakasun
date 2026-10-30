import * as HUD from './index.mjs';
const slot = name => document.querySelector('[data-slot="' + name + '"]');
const theme = document.querySelector('#theme'), screen = document.querySelector('#screen');
const note = document.querySelector('#input-note');
export const states = {
  score: { home: 2, away: 1, homeLabel: 'גלי האי', awayLabel: 'ברקי החוף', timeMs: 84000, period: 'מחצית שנייה', shotSeconds: null },
  stick: { x: 0, y: 0 }, primary: { label: 'בעיטה', icon: 'shot', charge: 0, loading: false },
  secondary: { label: 'מסירה', icon: 'pass' }, third: { label: 'ספרינט', icon: 'boost' },
  power: { value: 0, visible: false }, speed: { kmh: 72 }, pause: {},
  pausePanel: { visible: false },
  result: { visible: false, outcome: 'win', value: '3 : 1', stars: 2, stats: [{ label: 'שערים', value: '3' }, { label: 'מטבעות', value: '24' }] },
  event: { kind: 'goal', visible: true, detail: 'רגע טוב על המגרש' }
};
let charging = false, chargeStart = 0, frozen = new URLSearchParams(location.search).has('static'), frame = 0;
function show(mode) {
  screen.value = mode;
  states.pausePanel.visible = mode === 'pause'; states.result.visible = mode === 'result';
  if (mode !== 'live') { charging = false; states.primary.loading = states.power.visible = false; }
  render();
}
export const components = {
  score: HUD.scoreboard.create(slot('score')),
  stick: HUD.joystick.create(slot('stick'), { onChange(x, y, active) { note.textContent = active ? 'תנועה: ' + x + ', ' + y : 'הסטיק שוחרר'; } }),
  primary: HUD.actionButton.create(slot('primary'), { primary: true,
    onPress() { charging = true; chargeStart = performance.now(); states.primary.loading = states.power.visible = true; render(); },
    onRelease(cancelled) { charging = false; states.primary.loading = states.power.visible = false; note.textContent = cancelled ? 'הפעולה בוטלה' : 'הפעולה שוחררה'; render(); }
  }),
  secondary: HUD.actionButton.create(slot('secondary'), { onActivate() {
    const defending = states.primary.icon !== 'block';
    states.primary.label = defending ? 'חסימה' : 'בעיטה'; states.primary.icon = defending ? 'block' : 'shot'; render();
  } }),
  third: HUD.actionButton.create(slot('third'), { onActivate() { states.speed.kmh = states.speed.kmh === 72 ? 84 : 72; render(); } }),
  power: HUD.powerMeter.create(slot('power')),
  speed: HUD.speedMeter.create(slot('speed')),
  pause: HUD.pauseButton.create(slot('pause'), { onPause() { show('pause'); } }),
  pausePanel: HUD.pausePanel.create(slot('panels'), { onResume() { show('live'); }, onMenu() { show('result'); } }),
  result: HUD.resultScreen.create(slot('panels'), { onReplay() { show('live'); }, onMenu() { show('live'); } }),
  event: HUD.eventBanner.create(slot('event'))
};
const keys = Object.keys(components);
export function render() { for (let i = 0; i < keys.length; i++) components[keys[i]].update(states[keys[i]]); }
theme.addEventListener('change', () => {
  document.body.dataset.theme = theme.value;
  const hoops = theme.value === 'hoops', alpine = theme.value === 'alpine';
  states.score.home = alpine ? 2 : hoops ? 24 : 2; states.score.away = alpine ? 6 : hoops ? 19 : 1;
  states.score.homeLabel = alpine ? 'מיקום' : hoops ? 'ניצוצי האי' : 'גלי האי';
  states.score.awayLabel = alpine ? 'גולשים' : hoops ? 'שביטי המפרץ' : 'ברקי החוף';
  states.score.period = alpine ? 'שער 8 מתוך 14' : hoops ? 'רבע רביעי' : 'מחצית שנייה';
  states.score.shotSeconds = hoops ? 12 : null;
  states.primary.label = alpine ? 'האצה' : hoops ? 'זריקה' : 'בעיטה'; states.primary.icon = alpine ? 'boost' : 'shot'; render();
});
screen.addEventListener('change', () => show(screen.value));
document.querySelector('#event').addEventListener('change', e => { states.event.kind = e.target.value; render(); });
document.querySelector('#direction').addEventListener('click', e => {
  document.documentElement.dir = document.documentElement.dir === 'rtl' ? 'ltr' : 'rtl';
  e.target.textContent = document.documentElement.dir === 'rtl' ? 'LTR' : 'RTL';
});
function animate(now) {
  if (!frozen && screen.value === 'live') {
    if (charging) { states.primary.charge = states.power.value = Math.min(1, (now - chargeStart) / 1200); }
    states.score.timeMs = 84000 + now;
    render();
  }
  frame = requestAnimationFrame(animate);
}
export function stop() { frozen = true; cancelAnimationFrame(frame); }
export function destroy() { stop(); for (let i = 0; i < keys.length; i++) components[keys[i]].destroy(); }
render(); if (!frozen) frame = requestAnimationFrame(animate);
window.addEventListener('pagehide', destroy, { once: true });
