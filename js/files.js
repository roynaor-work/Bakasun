/* Files she keeps to send: the bank confirmation, the incorporation certificate, the logo, a signed contract.
   Stored in the browser's IndexedDB on this device (they are too big for localStorage); the cloud stage moves them to storage. */
const DB = 'bakasun-files', STORE = 'files';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) { return open().then(d => new Promise((res, rej) => { const t = d.transaction(STORE, mode); const s = t.objectStore(STORE); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); })); }
export const files = {
  async put(file, meta) { const id = meta.id || 'f' + Date.now().toString(36); await tx('readwrite', s => s.put(Object.assign({ id, name: file.name, type: file.type, size: file.size, blob: file, created: new Date().toISOString() }, meta, { id }))); return id; },
  get(id) { return tx('readonly', s => s.get(id)); },
  all() { return tx('readonly', s => s.getAll()); },
  remove(id) { return tx('readwrite', s => s.delete(id)); }
};
/** Shares a file through the phone's share sheet (WhatsApp, mail, Drive). Works on Android Chrome in the hosted app; returns false where it cannot. */
export async function shareFile(rec, text) {
  try {
    const f = new File([rec.blob], rec.name, { type: rec.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: text || '', title: rec.title || rec.name }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return true; }
  return false;
}
export function downloadFile(rec) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(rec.blob); a.download = rec.name; document.body.appendChild(a); a.click(); a.remove();
}
/** Text out of a PDF, page by page (pdf.js from cdnjs, loaded only when needed). */
export async function pdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i); const content = await page.getTextContent();
    // group by line (y position), keep reading order
    const rows = {};
    content.items.forEach(it => { const y = Math.round(it.transform[5]); (rows[y] = rows[y] || []).push(it); });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => { out.push(rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim()); });
  }
  return out.filter(Boolean).join('\n');
}
