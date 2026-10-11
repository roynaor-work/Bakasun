// סרטונים (או תמונות) לתרגילים: במקום ציור, סרטון קצר אמיתי בלופ. שלושה מקורות, לפי סדר:
// 1. מקומי: מה שצולם/נבחר בטלפון הזה (IndexedDB kidfit-vids). 2. ענן משפחתי: Supabase Storage, דלי kidfit-vids, נתיב <קוד משפחה>/<תרגיל>
// (רועי מצלם בטלפון שלו, מגיע לטלפון של הילד דרך קישור חתום קצר). 3. קובץ vid/<id>.mp4 בריפו (VIDEO_IDS).
import { CLOUD } from '../../js/data/cloudcfg.js?v=20261010-camera-1';
import { normCode } from './cloud.js?v=20261010-camera-1';
import { createVideoCloud } from './vids-cloud.js?v=20261011-private-vids-1';

export const VIDEO_IDS = new Set([]);
const DB = 'kidfit-vids', STORE = 'v';
const local = new Set(); const urls = {}, kinds = {};
let cloud = {}, activeCode = '';
const client = createVideoCloud({ baseUrl: CLOUD.url, publicKey: CLOUD.key });
// Ignore the old unscoped catalog/cache. Signed URLs and cloud bytes are never
// persisted; every cloud playback obtains a new server authorization.
try { localStorage.removeItem('kidfit.cloudVids'); } catch { /* */ }
export function setVideoFamily(code) {
  code = normCode(code);
  if (activeCode !== code) { activeCode = code; cloud = {}; vidStatus.error = ''; }
}
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
// מטא-נתונים דרך RPC מאומת בלבד → cloud[id] = { updated, mime }
export async function refreshCloud(code) {
  code = normCode(code); setVideoFamily(code); if (code.length < 8) return cloud;
  try {
    const rows = await client.catalog(code); if (code !== activeCode) return cloud;
    const next = {};
    for (const o of rows || []) { if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(o.id)) continue; next[o.id] = { updated: o.updated || '', mime: o.mime || '' }; }
    cloud = next;
    vidStatus.error = '';
  } catch (e) { if (code === activeCode) { cloud = {}; vidStatus.error = e.message; } }
  return cloud;
}
export async function cloudUpload(code, id, blob) {
  code = normCode(code); setVideoFamily(code); if (code.length < 8) return false;
  vidStatus.busy = id;
  try {
    await client.upload(code, id, blob);
    if (code !== activeCode) return true;
    cloud[id] = { updated: new Date().toISOString(), mime: blob.type || 'video/mp4' };
    vidStatus.error = ''; return true;
  } catch (e) { vidStatus.error = e.message; return false; } finally { vidStatus.busy = ''; }
}
export async function cloudDelete(code, id) {
  code = normCode(code); setVideoFamily(code); if (code.length < 8) return false;
  try { await client.remove(code, id); if (code !== activeCode) return true; delete cloud[id]; vidStatus.error = ''; return true; }
  catch (e) { vidStatus.error = e.message; return false; }
}

// מחזיר { url, kind: 'video' | 'image' } או null. ענן תמיד דורש הרשאה חדשה.
export async function videoUrl(id, code = '') {
  code = normCode(code); setVideoFamily(code);
  if (local.has(id)) {
    if (!urls[id]) { const b = await tx('readonly', s => s.get(id)); if (!b) { local.delete(id); return videoUrl(id, code); } urls[id] = URL.createObjectURL(b); kinds[id] = kindOf(b.type); }
    return { url: urls[id], kind: kinds[id] };
  }
  if (cloud[id]) {
    const kind = kindOf(cloud[id].mime);
    try {
      const url = await client.download(code, id);
      return code === activeCode ? { url, kind } : null;
    } catch (e) { if (code === activeCode) vidStatus.error = e.message; return null; }
  }
  return VIDEO_IDS.has(id) ? { url: `vid/${id}.mp4`, kind: 'video' } : null;
}
