import {applyEvent, createState, normalizeEvent, snapshot, updatePreferences} from './progress.mjs';

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

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error('storage'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('board');
      request.result.createObjectStore('events');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createStore({indexedDB = globalThis.indexedDB, now = Date.now} = {}) {
  let db;
  try {
    db = await openDatabase(indexedDB);
  } catch {
    return createMemoryStore(createState(), now);
  }
  db.onversionchange = () => db.close();

  // The two stores participate in one transaction, so a retry or another tab cannot
  // award the same event twice or exceed the praise budget across the two apps.
  function transaction(mode, eventId, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(eventId ? ['board', 'events'] : ['board'], mode);
      const board = tx.objectStore('board');
      const events = eventId ? tx.objectStore('events') : null;
      let result = null;
      let error;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error);
      const load = () => {
        const request = board.get('state');
        request.onsuccess = () => {
          try {
            const state = request.result ?? createState();
            result = action(state);
            if (mode === 'readwrite') board.put(state, 'state');
            if (events) events.add(1, eventId);
          } catch (cause) {
            error = cause;
            tx.abort();
          }
        };
      };
      if (!events) {
        load();
        return;
      }
      const duplicate = events.get(eventId);
      duplicate.onsuccess = () => { if (duplicate.result === undefined) load(); };
    });
  }

  return {
    persistent: true,
    read: () => transaction('readonly', null, state => snapshot(state, now())),
    preferences: (patch, onlyUnsetAge) => transaction('readwrite', null, state => updatePreferences(state, patch, onlyUnsetAge)),
    async record(input) {
      const event = normalizeEvent(input);
      if (!event) return null;
      return transaction('readwrite', event.id, state => applyEvent(state, event));
    },
  };
}
