import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-v2-20261107-12';
import {stageInfo, equipmentFor, RIVALS, STAGE_COUNT} from '../minigames/alpine-league-core.mjs?v=island-v2-20261107-12';
import {stageGoals} from '../minigames/alpine-league-stages.mjs?v=island-v2-20261107-12';

/** Ski league theme page (review tool, not part of the app): the real session (engine, controls, view, HUD) on league stage `?stage=n`,
 * with the setup the island engine would hand it. Used by tools/alpine-league-browser.mjs to show each theme at full size, steered by real
 * touches. A league stage past the first theme cannot be opened in a fresh island without racing the stages before it, so the theme
 * screenshots come from here; the league flow itself (screens, a full stage, result, save, return) is proven in the island page.
 * Query: stage (1..30), seed, gear (0..5), quality=low. window.__theme = {session, ready, error}. */
const params = new URLSearchParams(location.search), doc = document, screen = doc.getElementById('screen');
const [config, strings] = await Promise.all([fetch('../data/config.json').then(r => r.json()), fetch('../data/strings.he.json').then(r => r.json())]);
const base = config.minigames.alpineRush, t = (key, vars) => String(strings[key] ?? key).replace(/{(\w+)}/g, (_, k) => vars?.[k] ?? `{${k}}`);
const n = Math.max(1, Math.min(STAGE_COUNT, Number(params.get('stage')) || 1)), gear = Math.max(0, Math.min(5, Number(params.get('gear')) || 0));
const info = stageInfo(n), equipment = equipmentFor({skis: gear, helmet: gear, goggles: gear});
const setup = Object.freeze({...info, equipment, best: null, firstPass: true, rivals: RIVALS.map(r => ({id: r.id, name: r.name, color: r.color})), goals: stageGoals(base, n), total: STAGE_COUNT});
screen.dataset.game = 'alpineRush';
const status = doc.createElement('p'); status.className = 'game-status';
const stage = doc.createElement('div'); stage.className = 'game-stage';
const canvas = doc.createElement('canvas'); canvas.className = 'minigame-canvas'; canvas.tabIndex = 0; stage.append(canvas);
const controls = doc.createElement('div'); controls.className = 'game-controls';
screen.append(status, stage, controls);
const memory = () => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }}; };
window.__theme = {ready: false, error: null, n, theme: info.theme, finished: null};
const session = runAlpineSession({balance: base, level: info.number, seed: Number(params.get('seed')) || 7, equipment, power: 1, alpineLeague: setup, canvas, controls, status, t, storage: memory(), sound() {},
  lite: params.get('quality') === 'low', finish: raw => { window.__theme.finished = raw; return {ok: true}; }, cancel() {}, onError(reason) { window.__theme.error = reason; }});
window.__theme.session = session;
const wait = () => { const s = session.snapshot; if (s.error) { window.__theme.error = s.error; return; } if (s.loaded) { window.__theme.ready = true; return; } requestAnimationFrame(wait); };
wait();
