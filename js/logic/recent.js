/* The last things she asked for, so a tap repeats one (like the history in a voice recorder or a to-do app).
   Kept in the browser only, newest first, no duplicates, short list. Pure, tested (a Map-like storage is enough). */
import { trim } from './core.js';

const KEY = 'bakasun.recent';
const MAX = 8;

export function recentList(storage) {
  try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch (e) { return []; }
}

/** Adds one instruction on top; a repeat moves up; very short or very long texts are not kept. */
export function pushRecent(storage, text) {
  const x = trim(text).replace(/\s+/g, ' '); if (x.length < 4 || x.length > 120) return recentList(storage);
  const list = [x].concat(recentList(storage).filter(y => y !== x)).slice(0, MAX);
  try { storage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage full */ }
  return list;
}
