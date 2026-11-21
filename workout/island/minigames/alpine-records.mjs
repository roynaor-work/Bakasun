import {leagueBalance} from './alpine-league-stages.mjs?v=island-v2-20261107-21';
import {GHOST_KEY} from './alpine-league-ghost.mjs?v=island-v2-20261107-21';

/** Alpine Rush personal records (best time per course) in their own local key.
 * The island save keeps stages, stars, wins and coins; this file never touches it.
 * Damaged data is copied aside once and never overwritten silently; a newer
 * format is left untouched and recording is skipped. */
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validBest = row => isObject(row) && Number.isSafeInteger(row.ms) && row.ms > 0 && Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 6;

export function emptyRecords(cfg) { return {version: cfg.version, best: {}, runs: []}; }

export function validRecords(data, cfg) {
  return isObject(data) && data.version === cfg.version && isObject(data.best) && Object.entries(data.best).every(([id, row]) => /^[a-z][a-z-]*$/.test(id) && validBest(row)) &&
    Array.isArray(data.runs) && data.runs.length <= cfg.runHistory && data.runs.every(id => typeof id === 'string' && id.length < 80);
}

/** Version 0 (no version field, best times only) is upgraded in memory. */
function migrate(data, cfg) {
  if (isObject(data) && data.version === undefined && isObject(data.best)) return {version: cfg.version, best: data.best, runs: []};
  return data;
}

export function loadRecords(storage, cfg) {
  let raw = null;
  try { raw = storage?.getItem(cfg.storageKey) ?? null; } catch { return {data: emptyRecords(cfg), status: 'unavailable', writable: false}; }
  if (raw === null) return {data: emptyRecords(cfg), status: 'empty', writable: true};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (isObject(parsed) && Number.isInteger(parsed.version) && parsed.version > cfg.version) return {data: emptyRecords(cfg), status: 'future', writable: false};
  const data = migrate(parsed, cfg);
  if (validRecords(data, cfg)) return {data, status: data === parsed ? 'ok' : 'migrated', writable: true};
  try { storage.setItem(cfg.storageKey + '.corrupt', raw); } catch {}
  return {data: emptyRecords(cfg), status: 'corrupt', writable: true};
}

/** Records one finished run once (runId). Returns whether it set a new best. */
export function recordRun(storage, cfg, state, result) {
  if (!result?.completed || !state.writable) return {recorded: false, newBest: false, best: state.data.best[result?.trackId] || null};
  const data = state.data;
  if (data.runs.includes(result.runId)) return {recorded: false, newBest: false, duplicate: true, best: data.best[result.trackId] || null};
  const previous = data.best[result.trackId], newBest = !previous || result.elapsedMs < previous.ms;
  const next = {version: cfg.version, best: {...data.best, ...(newBest ? {[result.trackId]: {ms: result.elapsedMs, rank: result.rank}} : {})}, runs: [...data.runs, result.runId].slice(-cfg.runHistory)};
  try { storage.setItem(cfg.storageKey, JSON.stringify(next)); state.data = next; } catch { return {recorded: false, newBest: false, error: true, best: previous || null}; }
  return {recorded: true, newBest, previous: previous || null, best: next.best[result.trackId]};
}

export function formatRaceTime(ms) {
  const total = Math.max(0, Math.round(ms / 10)), minutes = Math.floor(total / 6000), seconds = Math.floor(total / 100) % 60, hundredths = total % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** The session and league timing display must identify the same effective rules. */
export function alpineRunBalance(pageBalance, leagueN, search = globalThis.location?.search || '') {
  const baseBalance = leagueN ? leagueBalance(pageBalance, leagueN) : pageBalance;
  const q = new URLSearchParams(search), airOff = q.get('alpineAir') === '0', fallOff = q.get('alpineFall') === '0', obsOff = q.get('alpineObs') === '0';
  const b = (airOff && baseBalance.physics.airBoost) || (fallOff && baseBalance.physics.fall) ? {...baseBalance, physics: (({airBoost, fall, ...rest}) => ({...rest, ...(airOff ? {} : {airBoost}), ...(fallOff ? {} : {fall})}))(baseBalance.physics)} : baseBalance;
  return obsOff ? {...b, tracks: Object.fromEntries(Object.entries(b.tracks).map(([k, v]) => [k, (({narrow, ...rest}) => rest)(v)]))} : b;
}

/** Personal times and ghosts must describe the same physics and generated course.
 * This is a namespace, never a migration: old bytes remain available to rollback.
 * alpineV241=0 (no physics.v241) and ?alpineHistoryFix=0 use the original keys. */
export function alpineHistoryStorage(storage, balance, course, search = globalThis.location?.search || '') {
  if (!storage || !balance.physics.v241 || new URLSearchParams(search).get('alpineHistoryFix') === '0') return storage;
  // Two independent 32-bit lanes avoid large keys and run synchronously in browsers
  // without a crypto/WASM dependency. Include the generated geometry, not just its id.
  const identity = JSON.stringify({ruleset: 'alpine-v241-1', physics: balance.physics, course});
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < identity.length; i++) {
    const c = identity.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  const suffix = '.rules-v241-' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  const recordsKey = balance.records.storageKey;
  const keyFor = key => key === recordsKey || key === GHOST_KEY ? key + suffix : key === recordsKey + '.corrupt' ? recordsKey + suffix + '.corrupt' : key;
  return {
    getItem: key => storage.getItem(keyFor(key)),
    setItem: (key, value) => storage.setItem(keyFor(key), value),
  };
}
