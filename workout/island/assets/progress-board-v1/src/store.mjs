import {applyEvent, createState, normalizeEvent, snapshot, updatePreferences} from './progress.mjs?v=island-v2-20261107-21';

export const DB_NAME = 'bakasun-progress-board-v1';

export function createMemoryStore(initial = createState(), now = Date.now) {
  const events = new Set();
  return {
    persistent: false,
    async read() { return snapshot(structuredClone(initial), now()); },
    async preferences(patch, onlyUnsetAge) { return updatePreferences(initial, patch, onlyUnsetAge); },
    async record(input) {
      const event = normalizeEvent(input);
      if (!event || events.has(event.id)) return null;
      const result = applyEvent(initial, event);
      events.add(event.id);
      return result;
    },
  };
}

const EVENT_LIMIT = 400;

function storageOf(candidate) {
  try {
    const storage = candidate ?? globalThis.localStorage;
    const probe = DB_NAME + ':probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * The board lives in localStorage only (one JSON value under DB_NAME): counters, personal
 * results and the IDs of the latest events, so a repeated result is never counted twice.
 * Nothing leaves the device. Without storage the board works until the page closes.
 */
export async function createStore({storage, now = Date.now} = {}) {
  const local = storageOf(storage);
  if (!local) return createMemoryStore(createState(), now);

  const load = () => {
    let saved = null;
    try { saved = JSON.parse(local.getItem(DB_NAME)); } catch { /* a damaged value starts a new board */ }
    const fresh = createState();
    const state = saved?.state && typeof saved.state === 'object' && !Array.isArray(saved.state) ? saved.state : null;
    const valid = state && Object.keys(fresh).every(key => typeof state[key] === typeof fresh[key] && state[key] !== null);
    return {
      state: valid ? state : fresh,
      events: Array.isArray(saved?.events) ? saved.events.filter(id => typeof id === 'string').slice(-EVENT_LIMIT) : [],
    };
  };
  const save = record => local.setItem(DB_NAME, JSON.stringify(record));

  return {
    persistent: true,
    async read() { return snapshot(load().state, now()); },
    async preferences(patch, onlyUnsetAge) {
      const record = load();
      const result = updatePreferences(record.state, patch, onlyUnsetAge);
      save(record);
      return result;
    },
    async record(input) {
      const event = normalizeEvent(input);
      if (!event) return null;
      const record = load();
      if (record.events.includes(event.id)) return null;
      const result = applyEvent(record.state, event);
      record.events = [...record.events, event.id].slice(-EVENT_LIMIT);
      save(record);
      return result;
    },
  };
}
