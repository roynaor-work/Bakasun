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
