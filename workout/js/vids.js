// סרטונים לתרגילים: במקום ציור, סרטון קצר אמיתי בלופ. מקור: קובץ vid/<id>.mp4 בריפו (VIDEO_IDS) או סרטון שרועי צילם/בחר מהטלפון ונשמר במכשיר (IndexedDB).
export const VIDEO_IDS = new Set([]); // מזהי תרגילים שיש להם vid/<id>.mp4 בריפו
const DB = 'kidfit-vids', STORE = 'v';
const local = new Set(); const urls = {};
function db() { return new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE)); t.oncomplete = () => res(req.result); t.onerror = () => rej(t.error); }));
export async function refreshVideos() { try { const keys = await tx('readonly', s => s.getAllKeys()); local.clear(); keys.forEach(k => local.add(k)); } catch { /* אין IndexedDB */ } return local; }
export const hasVideo = id => local.has(id) || VIDEO_IDS.has(id);
export const localVideos = () => local;
export async function saveVideo(id, blob) { await tx('readwrite', s => s.put(blob, id)); local.add(id); if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
export async function deleteVideo(id) { await tx('readwrite', s => s.delete(id)); local.delete(id); if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
export async function videoUrl(id) {
  if (local.has(id)) { if (!urls[id]) { const b = await tx('readonly', s => s.get(id)); if (!b) { local.delete(id); return VIDEO_IDS.has(id) ? `vid/${id}.mp4` : null; } urls[id] = URL.createObjectURL(b); } return urls[id]; }
  return VIDEO_IDS.has(id) ? `vid/${id}.mp4` : null;
}
