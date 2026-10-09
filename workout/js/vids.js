// סרטונים (או תמונות) לתרגילים: במקום ציור, סרטון קצר אמיתי בלופ. שלושה מקורות, לפי סדר:
// 1. מקומי: מה שצולם/נבחר בטלפון הזה (IndexedDB kidfit-vids). 2. ענן משפחתי: Supabase Storage, דלי kidfit-vids, נתיב <קוד משפחה>/<תרגיל>
// (רועי מצלם בטלפון שלו, מגיע לטלפון של הילד; נשמר גם במטמון מקומי). 3. קובץ vid/<id>.mp4 בריפו (VIDEO_IDS).
import { CLOUD } from '../../js/data/cloudcfg.js?v=20261009-weekly-1';
import { normCode } from './cloud.js?v=20261009-weekly-1';

export const VIDEO_IDS = new Set([]);
const DB = 'kidfit-vids', STORE = 'v', BUCKET = 'kidfit-vids', C_KEY = 'kidfit.cloudVids';
const local = new Set(); const urls = {}, kinds = {};
let cloud = {}; try { cloud = JSON.parse(localStorage.getItem(C_KEY) || '{}'); } catch { cloud = {}; }
export const vidStatus = { error: '', busy: '' };

function db() { return new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE)); t.oncomplete = () => res(req.result); t.onerror = () => rej(t.error); }));
const kindOf = mime => (mime || '').startsWith('image/') ? 'image' : 'video';
const dropUrl = id => { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; delete kinds[id]; } };

export async function refreshVideos() { try { const keys = await tx('readonly', s => s.getAllKeys()); local.clear(); keys.filter(k => !String(k).startsWith('c:')).forEach(k => local.add(k)); } catch { /* אין IndexedDB */ } return local; }
export const hasVideo = id => local.has(id) || !!cloud[id] || VIDEO_IDS.has(id);
export const localVideos = () => local;
export const cloudVideos = () => cloud;
export const sourceOf = id => local.has(id) ? 'local' : cloud[id] ? 'cloud' : VIDEO_IDS.has(id) ? 'repo' : null;

export async function saveVideo(id, blob) { await tx('readwrite', s => s.put(blob, id)); local.add(id); dropUrl(id); }
export async function deleteVideo(id) { await tx('readwrite', s => s.delete(id)); local.delete(id); dropUrl(id); }

// ---- ענן ----
const H = (extra = {}) => ({ apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, ...extra });
const objPath = (code, id) => `${BUCKET}/${normCode(code)}/${id}`;
export const publicUrl = (code, id, v = '') => `${CLOUD.url}/storage/v1/object/public/${objPath(code, id)}${v ? `?v=${encodeURIComponent(v)}` : ''}`;
const fail = async r => { const t = await r.text(); const e = new Error(r.status === 404 || r.status === 400 && /Bucket not found/i.test(t) ? 'הדלי בענן עוד לא נוצר (vids.sql)' : `${r.status} ${t.slice(0, 120)}`); e.status = r.status; throw e; };
// רשימת הסרטונים של המשפחה בענן → cloud[id] = { updated, mime }
export async function refreshCloud(code) {
  code = normCode(code); if (code.length < 8) return cloud;
  try {
    const r = await fetch(`${CLOUD.url}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: code + '/', limit: 200, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
    if (!r.ok) await fail(r);
    const rows = await r.json(); const next = {};
    for (const o of rows || []) { if (!o.name || !o.id) continue; next[o.name] = { updated: o.updated_at || o.created_at || '', mime: o.metadata?.mimetype || '' }; }
    cloud = next; try { localStorage.setItem(C_KEY, JSON.stringify(cloud)); } catch { /* */ }
    for (const id in cloud) if (!local.has(id)) dropUrl(id);
    vidStatus.error = '';
  } catch (e) { vidStatus.error = e.message; }
  return cloud;
}
export async function cloudUpload(code, id, blob) {
  code = normCode(code); if (code.length < 8) return false;
  vidStatus.busy = id;
  try {
    const r = await fetch(`${CLOUD.url}/storage/v1/object/${objPath(code, id)}`, { method: 'POST', headers: H({ 'Content-Type': blob.type || 'video/mp4', 'x-upsert': 'true' }), body: blob });
    if (!r.ok) await fail(r);
    cloud[id] = { updated: new Date().toISOString(), mime: blob.type || 'video/mp4' }; try { localStorage.setItem(C_KEY, JSON.stringify(cloud)); } catch { /* */ }
    vidStatus.error = ''; return true;
  } catch (e) { vidStatus.error = e.message; return false; } finally { vidStatus.busy = ''; }
}
export async function cloudDelete(code, id) {
  code = normCode(code); if (code.length < 8) return false;
  try { const r = await fetch(`${CLOUD.url}/storage/v1/object/${objPath(code, id)}`, { method: 'DELETE', headers: H() }); if (!r.ok) await fail(r); delete cloud[id]; try { localStorage.setItem(C_KEY, JSON.stringify(cloud)); } catch { /* */ } try { await tx('readwrite', s => s.delete('c:' + id)); } catch { /* */ } dropUrl(id); vidStatus.error = ''; return true; }
  catch (e) { vidStatus.error = e.message; return false; }
}

// מחזיר { url, kind: 'video' | 'image' } או null. סרטון מהענן נשמר במטמון המקומי אחרי הצפייה הראשונה (c:<id>), כדי לא להוריד שוב
export async function videoUrl(id, code = '') {
  if (local.has(id)) {
    if (!urls[id]) { const b = await tx('readonly', s => s.get(id)); if (!b) { local.delete(id); return videoUrl(id, code); } urls[id] = URL.createObjectURL(b); kinds[id] = kindOf(b.type); }
    return { url: urls[id], kind: kinds[id] };
  }
  if (cloud[id]) {
    const c = cloud[id], kind = kindOf(c.mime);
    if (urls[id]) return { url: urls[id], kind };
    try {
      const cached = await tx('readonly', s => s.get('c:' + id));
      if (cached && cached.updated === c.updated && cached.blob) { urls[id] = URL.createObjectURL(cached.blob); kinds[id] = kind; return { url: urls[id], kind }; }
    } catch { /* */ }
    const url = publicUrl(code, id, c.updated);
    if (code) fetch(url).then(r => r.ok ? r.blob() : null).then(b => { if (b) tx('readwrite', s => s.put({ blob: b, updated: c.updated }, 'c:' + id)).catch(() => {}); }).catch(() => {});
    return { url, kind };
  }
  return VIDEO_IDS.has(id) ? { url: `vid/${id}.mp4`, kind: 'video' } : null;
}
