// מקומי, ענן משפחתי פרטי עם גרסאות, ואז קובץ מובנה בריפו.
import { CLOUD } from '../../js/data/cloudcfg.js?v=20261010-camera-1';
import { createVideoCloud, videoCode, videoPath, videoVersion } from './vids-cloud.js?v=20261011-vids-signed-1';
export const VIDEO_IDS = new Set([]);
const DB = 'kidfit-vids', STORE = 'v', C_KEY = 'kidfit.cloudVids', VERSION = 2;
const local = new Set(), origins = new Map(), urls = new Map(), revisions = new Map();
const client = createVideoCloud({ baseUrl: CLOUD.url, publicKey: CLOUD.key });
let cloud = {}, family = null, epoch = 0, refresh = 0, cleanup = Promise.resolve(), saved;
export const vidStatus = { error: '', busy: '' };
try {
  saved = JSON.parse(localStorage.getItem(C_KEY) || 'null');
  if (saved?.version !== VERSION || !saved.code || !saved.videos) { saved = null; localStorage.removeItem(C_KEY); }
} catch { saved = null; }
function db() { return new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
  t.oncomplete = () => { d.close(); res(req?.result); }; t.onerror = t.onabort = () => { d.close(); rej(t.error); };
}));
const kindOf = mime => (mime || '').startsWith('image/') ? 'image' : 'video';
const dropUrl = id => { const entry = urls.get(id); if (entry) URL.revokeObjectURL(entry.url); urls.delete(id); };
const persist = () => { try { localStorage.setItem(C_KEY, JSON.stringify({ version: VERSION, code: family, videos: cloud })); } catch { /* full storage */ } };
const clearCache = (keepCode = '', keep = {}) => tx('readwrite', s => {
  const keys = s.getAllKeys();
  keys.onsuccess = () => keys.result.filter(k => String(k).startsWith('c:')).forEach(key => {
    const request = s.get(key);
    request.onsuccess = () => { const entry = request.result, expected = keep[String(key).slice(2)];
      if (entry?.version !== VERSION || entry.code !== keepCode || !expected || entry.path !== expected.path || entry.updated !== expected.updated) s.delete(key);
    };
  });
});
export function setVideoFamily(value) {
  let code = ''; try { code = videoCode(value); } catch { /* partial or empty code */ }
  if (code === family) return false;
  family = code; epoch++; refresh++; cloud = {}; vidStatus.error = ''; vidStatus.busy = '';
  for (const id of urls.keys()) dropUrl(id);
  try { localStorage.removeItem(C_KEY); } catch { /* unavailable storage */ }
  if (saved?.code === code) {
    try {
      for (const [id, entry] of Object.entries(saved.videos)) videoPath(code, entry.path, id);
      cloud = saved.videos; persist();
    } catch { cloud = {}; }
  }
  const keep = saved?.code === code ? cloud : {};
  saved = null;
  cleanup = cleanup.then(() => clearCache(code, keep)).catch(() => {});
  return true;
}
const useLocal = id => local.has(id) && (!cloud[id] || !origins.get(id) ||
  origins.get(id).code !== family || origins.get(id).path === cloud[id].path);
export async function refreshVideos() {
  try {
    const keys = await tx('readonly', s => s.getAllKeys());
    local.clear(); origins.clear();
    for (const key of keys) {
      const entry = await tx('readonly', s => s.get(key));
      if (String(key).startsWith('c:')) {
        if (entry?.version !== VERSION || entry.code !== family || entry.path !== cloud[String(key).slice(2)]?.path || entry.updated !== cloud[String(key).slice(2)]?.updated) await tx('readwrite', s => s.delete(key));
      } else { local.add(key); if (entry?.uploaded) origins.set(key, entry.uploaded); }
    }
  } catch { /* IndexedDB unavailable */ }
  return local;
}
export const hasVideo = id => local.has(id) || !!cloud[id] || VIDEO_IDS.has(id);
export const localVideos = () => local;
export const cloudVideos = () => cloud;
export const sourceOf = id => useLocal(id) ? 'local' : cloud[id] ? 'cloud' : VIDEO_IDS.has(id) ? 'repo' : null;
export async function saveVideo(id, blob) { revisions.set(id, (revisions.get(id) || 0) + 1); await tx('readwrite', s => s.put(blob, id)); local.add(id); origins.delete(id); dropUrl(id); }
// מחיקה מהטלפון בלבד: המקור בענן נשאר וניתן לצפות בו שוב.
export async function deleteVideo(id) {
  revisions.set(id, (revisions.get(id) || 0) + 1);
  await tx('readwrite', s => { s.delete('c:' + id); return s.delete(id); });
  local.delete(id); origins.delete(id); dropUrl(id);
}
export async function refreshCloud(code) {
  setVideoFamily(code); const generation = epoch, request = ++refresh;
  try {
    const rows = await client.catalog(code);
    if (generation !== epoch || request !== refresh) return cloud;
    const next = Object.fromEntries(rows.map(({ id, ...entry }) => [id, entry]));
    for (const [id, entry] of urls) if (entry.source === 'cloud' &&
      (next[id]?.path !== entry.path || next[id]?.updated !== entry.updated)) dropUrl(id);
    cloud = next; persist(); vidStatus.error = '';
  } catch (e) {
    if (generation === epoch && request === refresh) {
      vidStatus.error = e.message;
      // A rejected code cannot keep displaying previously authorized metadata.
      if (/לא רשום/.test(e.message)) { cloud = {}; persist(); for (const id of urls.keys()) dropUrl(id); cleanup = cleanup.then(() => clearCache()).catch(() => {}); }
    }
  }
  return cloud;
}
export async function cloudUpload(code, id, blob) {
  setVideoFamily(code); const generation = epoch, revision = revisions.get(id) || 0; vidStatus.busy = id;
  try {
    const entry = await client.upload(code, id, blob, videoVersion(cloud[id]?.path));
    if (generation !== epoch) return false;
    refresh++;
    if (videoVersion(entry.path) >= videoVersion(cloud[id]?.path)) cloud[id] = entry;
    persist(); dropUrl(id);
    // Track the uploaded local copy so another phone's newer version takes precedence.
    if (local.has(id) && revision === (revisions.get(id) || 0) && cloud[id]?.path === entry.path) {
      const uploaded = { code: family, path: entry.path };
      await tx('readwrite', s => { if (generation === epoch && revision === (revisions.get(id) || 0) && cloud[id]?.path === entry.path) return s.put({ blob, uploaded }, id); });
      if (generation === epoch && revision === (revisions.get(id) || 0)) origins.set(id, uploaded);
    }
    if (generation !== epoch) return false;
    vidStatus.error = ''; return true;
  } catch (e) { if (generation === epoch) vidStatus.error = e.message; return false; }
  finally { if (generation === epoch) vidStatus.busy = ''; }
}
export async function videoUrl(id, code = '') {
  setVideoFamily(code); const generation = epoch, revision = revisions.get(id) || 0;
  if (useLocal(id)) {
    const existing = urls.get(id); if (existing?.source === 'local') return existing;
    const entry = await tx('readonly', s => s.get(id)), blob = entry?.blob || entry;
    if (!blob) { local.delete(id); return videoUrl(id, code); }
    if (generation !== epoch || revision !== (revisions.get(id) || 0)) return null;
    dropUrl(id); const media = { url: URL.createObjectURL(blob), kind: kindOf(blob.type), source: 'local' }; urls.set(id, media); return media;
  }
  const entry = cloud[id];
  if (entry) {
    const current = () => generation === epoch && revision === (revisions.get(id) || 0) &&
      cloud[id]?.path === entry.path && cloud[id]?.updated === entry.updated;
    const existing = urls.get(id);
    if (existing?.source === 'cloud' && existing.code === family && existing.path === entry.path && existing.updated === entry.updated) return existing;
    try {
      videoPath(family, entry.path, id);
      await cleanup;
      const cached = await tx('readonly', s => s.get('c:' + id)).catch(() => null);
      let blob = cached?.version === VERSION && cached.code === family && cached.path === entry.path && cached.updated === entry.updated ? cached.blob : null;
      if (!blob) {
        blob = await client.download(code, entry.path);
        if (!current()) return null;
        await tx('readwrite', s => { if (current()) return s.put({ version: VERSION, code: family, path: entry.path, updated: entry.updated, blob }, 'c:' + id); }).catch(() => {});
      }
      if (!current()) return null;
      dropUrl(id); const media = { url: URL.createObjectURL(blob), kind: kindOf(entry.mime || blob.type), source: 'cloud', code: family, path: entry.path, updated: entry.updated };
      urls.set(id, media); vidStatus.error = ''; return media;
    } catch (e) { if (current()) vidStatus.error = e.message; return null; }
  }
  return VIDEO_IDS.has(id) ? { url: `vid/${id}.mp4`, kind: 'video' } : null;
}
