import {createLeague,validLeague,VERSION} from './alpine-league-core.mjs?v=island-v2-20261107-12';

/** Ski league v23 save: its own local key, so the island save (island.v1) never changes. Same rules as the ski records
 * (alpine-records.mjs): damaged data is copied aside once under `.corrupt` and the league starts fresh; a newer format is left untouched
 * and the league runs in memory without writing over it; no storage = in memory. Nothing else in localStorage is read or written. */
export const LEAGUE_KEY = 'island.alpine.league.v1';

export function loadLeague(storage) {
  let raw = null;
  try { raw = storage?.getItem(LEAGUE_KEY) ?? null; } catch { return {state: createLeague(), status: 'unavailable', writable: false}; }
  if (!storage) return {state: createLeague(), status: 'memory', writable: false};
  if (raw === null) return {state: createLeague(), status: 'empty', writable: true};
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (parsed && typeof parsed === 'object' && Number.isInteger(parsed.version) && parsed.version > VERSION) return {state: createLeague(), status: 'future', writable: false};
  if (validLeague(parsed)) return {state: parsed, status: 'ok', writable: true};
  try { if (storage.getItem(LEAGUE_KEY + '.corrupt') === null) storage.setItem(LEAGUE_KEY + '.corrupt', raw); } catch {}
  return {state: createLeague(), status: 'corrupt', writable: true};
}
export function saveLeague(storage, state) {
  if (!validLeague(state)) return {ok: false, reason: 'invalid'};
  try { storage.setItem(LEAGUE_KEY, JSON.stringify(state)); return {ok: true}; } catch { return {ok: false, reason: 'storage'}; }
}
/** Loaded on first use (the league is not read at boot), saved after every change. */
export function createLeagueStore(storage) {
  let loaded = null;
  const load = () => loaded ??= loadLeague(storage);
  return {
    get state() { return load().state; },
    get status() { return load().status; },
    save() { const l = load(); if (!l.writable) return {ok: false, reason: l.status}; return saveLeague(storage, l.state); },
    /** Reads the key again (another tab, a test): a valid saved league replaces the one in memory. */
    reload() { loaded = null; return load().status; }
  };
}
