// ענן משפחתי: הטלפון של הילד מעלה כל אימון שנגמר, הטלפון של אבא רואה. אותו פרויקט Supabase של באקה סאן, טבלה family_events.
// גישה עם המפתח הציבורי בלי התחברות, לפי קוד משפחה סודי. מקומי קודם: אם אין רשת, נשמר בתור ונשלח אחר כך.
import { CLOUD } from '../../js/data/cloudcfg.js?v=20261009-companion-1';

const Q_KEY = 'kidfit.cloud.queue';
let queue = []; try { queue = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch { queue = []; }
const saveQ = () => { try { localStorage.setItem(Q_KEY, JSON.stringify(queue)); } catch { /* מקום */ } };
export const status = { last: '', error: '', pending: () => queue.length };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newFamilyCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => ALPHABET[b % ALPHABET.length]).join('');
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

async function api(path, opts = {}) {
  const r = await fetch(CLOUD.url + path, {
    method: opts.method || 'GET',
    headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=minimal' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(`${r.status} ${t.slice(0, 160)}`); e.status = r.status; throw e; }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// שולח אירוע (upsert לפי id). אם נכשל, נשאר בתור.
export async function push(code, kind, id, payload) {
  code = normCode(code); if (code.length < 8) return false;
  queue = queue.filter(q => q.id !== id); queue.push({ code, kind, id, payload }); saveQ();
  return flush();
}
export async function flush() {
  if (!queue.length || !navigator.onLine) return false;
  const batch = queue.slice(0, 20);
  try {
    const code = batch[0].code; const rows = batch.filter(q => q.code === code);
    await api('/rest/v1/rpc/family_push', { method: 'POST', body: { code, rows: rows.map(q => ({ id: q.id, kind: q.kind, payload: q.payload })) } });
    queue = queue.filter(q => !rows.includes(q)); saveQ(); status.last = new Date().toISOString(); status.error = '';
    return queue.length ? flush() : true;
  } catch (e) { status.error = e.status === 404 ? 'הפונקציות בענן עוד לא נוצרו (family.sql)' : /unknown family code/.test(e.message) ? 'קוד המשפחה לא רשום בענן. בטלפון של הילד: הגדרות ← קוד משפחה ← "רישום"' : e.message; return false; }
}
export async function remove(code, id) {
  code = normCode(code);
  try { await api('/rest/v1/rpc/family_remove', { method: 'POST', body: { code, id } }); return true; } catch (e) { status.error = e.message; return false; }
}
export async function list(code, kind, limit = 200) {
  code = normCode(code); if (code.length < 8) return [];
  const rows = await api('/rest/v1/rpc/family_list', { method: 'POST', body: { code, kind, lim: limit }, prefer: 'return=representation' });
  status.last = new Date().toISOString(); status.error = '';
  return rows || [];
}
// רישום הקוד בענן (פעם אחת, מהטלפון שיצר אותו). בלי זה הענן דוחה כתיבה וקריאה.
export async function register(code) {
  code = normCode(code); if (code.length < 8) return false;
  try { const ok = await api('/rest/v1/rpc/family_register', { method: 'POST', body: { code }, prefer: 'return=representation' }); status.error = ''; return ok === true; }
  catch (e) { status.error = e.status === 404 ? 'הפונקציות בענן עוד לא נוצרו (family.sql)' : e.message; return false; }
}
window.addEventListener('online', () => flush());
