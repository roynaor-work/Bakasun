/* The data layer. One interface, two backends: 'local' (this device) now, 'cloud' (Supabase) in the next stage.
   Screens never touch storage directly; they call db.* and subscribe to changes. */

const KEY = 'bakasun.v1';
const COLS = ['cases', 'clients', 'calls', 'tasks', 'quotes', 'suppliers', 'links', 'schedule', 'staff', 'payments', 'checks', 'groups', 'catalog', 'notes', 'approvals', 'team', 'contacts', 'print', 'receipts', 'participants', 'history', 'contracts', 'checklists', 'budget', 'runsheet', 'casefiles', 'workgroups', 'notifications'];
let onChange = null; // the cloud hooks in here
export function setChangeHook(fn) { onChange = fn; }
/* The activity history hooks in here: fn({col, id, before, after, deleted}) after every put/remove (never for 'history' itself). */
let onHistory = null;
export function setHistoryHook(fn) { onHistory = fn; }

const state = { settings: {}, meta: { backend: 'local' } };
COLS.forEach(c => { state[c] = []; });
const listeners = new Set();
let timer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    COLS.forEach(c => { if (Array.isArray(data[c])) state[c] = data[c]; });
    if (data.settings) state.settings = data.settings;
  } catch (e) { /* first run, or blocked storage: start empty */ }
}
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }, 150);
}
function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

let seq = 0;
export function newId(prefix) {
  seq = (seq + 1) % 1000;
  return (prefix || 'x') + Date.now().toString(36) + seq.toString(36);
}
export function nowIso() { return new Date().toISOString(); }
export function todayIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

export const db = {
  list(col, pred) { const a = state[col] || []; return pred ? a.filter(pred) : a.slice(); },
  get(col, id) { return (state[col] || []).find(x => x.id === id) || null; },
  put(col, obj) {
    if (!obj.id) obj.id = newId(col[0]);
    obj.updated = nowIso();
    if (!obj.created) obj.created = obj.updated;
    const a = state[col];
    const i = a.findIndex(x => x.id === obj.id);
    const before = i >= 0 ? a[i] : null;
    if (i >= 0) a[i] = Object.assign({}, a[i], obj); else a.push(obj);
    persist(); emit();
    if (onChange) onChange({ col, id: obj.id, data: i >= 0 ? a[i] : obj });
    if (onHistory && col !== 'history') { try { onHistory({ col, id: obj.id, before, after: i >= 0 ? a[i] : obj }); } catch (e) { /* history must never break a save */ } }
    return obj.id;
  },
  remove(col, id) {
    const gone = (state[col] || []).find(x => x.id === id);
    state[col] = state[col].filter(x => x.id !== id); persist(); emit();
    if (onChange && gone) onChange({ col, id, data: Object.assign({}, gone, { updated: nowIso() }), deleted: true });
    if (onHistory && gone && col !== 'history') { try { onHistory({ col, id, before: gone, after: null, deleted: true }); } catch (e) { /* see put */ } }
  },
  setting(k, v) { if (v === undefined) return state.settings[k]; state.settings[k] = v; persist(); emit(); if (onChange) onChange({ setting: k, value: v }); },
  /** Rows from the cloud: newer 'updated' wins; deleted rows are removed. Settings from the cloud fill in. */
  mergeRemote(rows, sets) {
    let changed = false;
    (rows || []).forEach(r => {
      if (!COLS.includes(r.col)) return;
      const a = state[r.col]; const i = a.findIndex(x => x.id === r.id);
      if (r.deleted) { if (i >= 0) { a.splice(i, 1); changed = true; } return; }
      const local = i >= 0 ? a[i] : null;
      if (!local || String(r.data.updated || '') > String(local.updated || '')) { if (i >= 0) a[i] = r.data; else a.push(r.data); changed = true; }
    });
    (sets || []).forEach(x => { if (state.settings[x.key] !== x.value && x.key !== 'lang') { state.settings[x.key] = x.value; changed = true; } });
    if (changed) { persist(); emit(); }
  },
  settings() { return Object.assign({}, state.settings); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  exportJson() { return JSON.stringify(state, null, 1); },
  /** A backup file is merged, never swapped in: records that are missing are added, newer ones replace older ones,
      and nothing that exists here is removed. There is no "delete everything" in this app, by design. Returns how many records changed. */
  importJson(text) {
    const data = JSON.parse(text); let n = 0;
    COLS.forEach(c => {
      if (!Array.isArray(data[c])) return;
      const a = state[c];
      data[c].forEach(r => {
        if (!r || !r.id) return;
        if (!r.updated) r.updated = nowIso(); // a backup row without a stamp would lose to any cloud copy forever
        const i = a.findIndex(x => x.id === r.id);
        if (i < 0) { a.push(r); n++; if (onChange) onChange({ col: c, id: r.id, data: r }); }
        else if (String(r.updated || '') > String(a[i].updated || '')) { a[i] = r; n++; if (onChange) onChange({ col: c, id: r.id, data: r }); }
      });
    });
    if (data.settings && typeof data.settings === 'object') Object.keys(data.settings).forEach(k => { if (state.settings[k] === undefined || state.settings[k] === '') state.settings[k] = data.settings[k]; if (onChange) onChange({ setting: k, value: data.settings[k] }); });
    persist(); emit(); return n;
  },
  snapshot() { return state; }
};

load();
