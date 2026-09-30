/* Files and documents of an event (קבצי האירוע): quotes, contracts, menus, permits, insurance, invoices, photos, plans.
   A tab on the event card, a full screen per event (#/files/<caseId>) and the list of every file (#/files).
   Every file is saved on the device at once (IndexedDB through js/files.js) with its metadata in 'casefiles';
   when the cloud is on it is uploaded to the 'receipts' bucket and marked, and what failed is retried on the next render.
   Nothing is sent by the app: the share sheet, WhatsApp and the mail open and she taps send. Deleting asks, one file at a time. */
import { t, lang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, confirmDialog, toast, empty, section, openWhatsAppPick, openMail, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { files, shareFile, downloadFile, pdfText } from '../files.js';
import * as cloud from '../cloud.js';
import { registerCaseTab } from '../caseTabs.js';
import { KINDS, BUCKET, guessKind, humanSize, sortFiles, filterFiles, cloudPathFor, cloudEligible, missingKinds, attachShared, eventLine } from '../logic/caseFiles.js';

const ui = { q: '', kind: '' }; // filters of the all-files screen survive re-renders
const lastTry = {}; // fileId → time of the last upload attempt, so a failing upload is not hammered on every render
const kindLabel = k => t('k_' + (KINDS.includes(k) ? k : 'other'));
const BACK = href => `<a class="icon" href="${href}" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;
const ICON = {
  quote: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6', contract: 'M6 3h9l5 5v13H6zM14 3v6h6M9 16l2 2 4-4', menu: 'M7 3v18M7 3c-2 0-3 2-3 4s1 4 3 4M17 3v7a3 3 0 0 0 0 6v5',
  permit: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4', insurance: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', invoice: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h4',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 9h6M9 13h3', photo: 'M4 6h16v13H4zM8 15l3-4 3 3 2-2 3 3M8 10h.01', plan: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4', other: 'M6 3h9l5 5v13H6zM14 3v6h6'
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k] || ICON.other}"/></svg>`;
const supName = id => { const s = id && db.get('suppliers', id); return s ? s.name : ''; };
const caseLine = c => eventLine(c, Office.fmt);

/* ---------------- the screens ---------------- */
export function render({ root, id }) {
  if (id) return renderCase(root, id);
  renderAll(root);
}
function renderCase(root, id) {
  const c = db.get('cases', id);
  if (!c) { root.innerHTML = `<header class="top">${BACK('#/cases')}<h1>${esc(t('cfTitle'))}</h1></header>` + empty(t('noResults')); return; }
  root.innerHTML = `<header class="top">${BACK('#/case/' + esc(id) + '/files')}<h1>${esc(t('cfTitle'))} · ${esc(c.client || t('unknownClient'))}</h1></header>
    <div class="sub">${esc(caseLine(c))}</div><div class="stack sec cf-wide" id="cfbody"></div>`;
  draw(root.querySelector('#cfbody'), c, db.settings(), true);
}
function renderAll(root) {
  const all = sortFiles(db.list('casefiles'));
  const lookup = { caseOf: cid => db.get('cases', cid), supplierOf: sid => db.get('suppliers', sid) };
  const shown = filterFiles(all, { q: ui.q, kind: ui.kind }, lookup);
  const counts = {}; all.forEach(f => { counts[f.kind || 'other'] = (counts[f.kind || 'other'] || 0) + 1; });
  root.innerHTML = `<header class="top">${BACK('#/cases')}<h1>${esc(t('cfAll'))}</h1><span class="badge muted"><span class="count">${all.length}</span></span></header>
    <div class="stack sec cf-wide cf-body">
      <input class="cf-search" id="cfq" type="search" value="${esc(ui.q)}" placeholder="${esc(t('cfSearchPh'))}" aria-label="${esc(t('search'))}">
      <div class="chips cf-filters"><button type="button" class="chip ${!ui.kind ? 'on' : ''}" data-k="">${esc(t('all'))}</button>${KINDS.filter(k => counts[k]).map(k => `<button type="button" class="chip ${ui.kind === k ? 'on' : ''}" data-k="${k}">${esc(kindLabel(k))} <span class="count">${counts[k]}</span></button>`).join('')}</div>
      <div class="list" id="cfrows">${all.length ? (shown.length ? shown.map(f => row(f, true)).join('') : empty(t('cfNoMatch'))) : empty(t('cfNone'))}</div>
    </div>`;
  const q = root.querySelector('#cfq');
  q.oninput = () => { ui.q = q.value; const box = root.querySelector('#cfrows'); const list = filterFiles(all, { q: ui.q, kind: ui.kind }, lookup); box.innerHTML = list.length ? list.map(f => row(f, true)).join('') : empty(t('cfNoMatch')); wireRows(box, null); };
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { ui.kind = b.dataset.k; renderAll(root); });
  wireRows(root.querySelector('#cfrows'), null);
}

/* ---------------- the tab on the event card ---------------- */
registerCaseTab({ key: 'files', label: () => t('tFiles'), render(body, c, s) { draw(body, c, s, false); } });

function draw(body, c, s, full) {
  body.classList.add('cf-body');
  const list = sortFiles(db.list('casefiles', f => f.caseId === c.id));
  const links = db.list('links', l => l.caseId === c.id);
  const missing = missingKinds(c, list, links, { suppliers: db.list('suppliers'), contracts: db.list('contracts', x => x.caseId === c.id) });
  const pending = list.filter(f => !f.cloudOk && cloudEligible(f));
  const groups = KINDS.map(k => [k, list.filter(f => (f.kind || 'other') === k)]).filter(g => g[1].length);
  body.innerHTML = `
    <div class="row"><label class="btn primary sm">${esc(t('cfAdd'))}<input type="file" id="cfPick" multiple hidden></label>
      <label class="btn sm">${esc(t('cfSnap'))}<input type="file" id="cfSnap" accept="image/*" capture="environment" hidden></label>
      ${full ? '' : `<a class="btn sm ghost" href="#/files/${esc(c.id)}">${esc(t('cfFull'))}</a>`}<a class="btn sm ghost" href="#/files">${esc(t('cfAll'))}</a></div>
    <div class="cf-drop" id="cfDrop">${esc(t('cfDrop'))}</div>
    ${!cloud.isOn() ? `<p class="hint">${esc(t('cfCloudOff'))}</p>` : pending.length ? `<p class="warnbox">${esc(t('cfCloudPending', { n: pending.length }))} <button type="button" class="btn sm" id="cfRetry">${esc(t('retry'))}</button></p>` : ''}
    ${links.some(l => /אושר|הוזמן/.test(String(l.status || ''))) || /נסגר|בוצע/.test(String(c.status || '')) ? section(t('cfMissing'), `<div class="list cf-missing">${missing.length ? missing.map((m, i) => `<div class="card"><div class="row"><span>${icon(m.kind)} ${esc(t(m.why, { who: m.who }))}</span><button type="button" class="btn sm" data-miss="${i}">${esc(t('cfAddMissing'))}</button></div></div>`).join('') : `<p class="okbox">${esc(t('cfMissingOk'))}</p>`}</div>`) : ''}
    ${groups.length ? groups.map(([k, fs]) => `<div class="cf-kind"><h3>${icon(k)} ${esc(kindLabel(k))} <span class="count">${fs.length}</span></h3><div class="list">${fs.map(f => row(f, false)).join('')}</div></div>`).join('') : empty(t('cfEmpty'))}`;

  body.querySelector('#cfPick').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; addFiles(c, fs); };
  body.querySelector('#cfSnap').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; addFiles(c, fs, { kind: 'photo' }, true); };
  const drop = body.querySelector('#cfDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (fs.length) addFiles(c, fs); });
  const rt = body.querySelector('#cfRetry'); if (rt) rt.onclick = () => { pending.forEach(f => { delete lastTry[f.id]; }); syncPending(pending); };
  body.querySelectorAll('[data-miss]').forEach(b => b.onclick = () => {
    const m = missing[+b.dataset.miss]; if (!m) return;
    const inp = body.querySelector('#cfPick');
    inp.onchange = e => { const fs = [...e.target.files]; e.target.value = ''; inp.onchange = ev => { const l = [...ev.target.files]; ev.target.value = ''; addFiles(c, l); }; addFiles(c, fs, { kind: m.kind, supplierId: m.supplierId || '' }); };
    inp.click();
  });
  wireRows(body, c);
  if (cloud.isOn() && pending.length) syncPending(pending);
}

function row(f, withEvent) {
  const c = db.get('cases', f.caseId);
  const shareText = [f.name, c ? caseLine(c) : ''].filter(Boolean).join(' · ');
  const sub = [humanSize(f.size), f.addedAt ? Office.fmt(f.addedAt.slice(0, 10)) : '', supName(f.supplierId), f.note, (f.tags || []).join(', ')].filter(Boolean);
  const cloudBadge = f.cloudOk ? `<span class="badge ok cf-cloud">${esc(t('cfSynced'))}</span>` : `<span class="badge muted cf-cloud" title="${esc(cloudEligible(f) ? t('cfLocal') : t('cfLocalType'))}">${esc(t('cfLocal'))}</span>`;
  return `<div class="card cf-row" data-f="${esc(f.id)}"><span class="cf-icon" data-thumb="${/^image\//.test(f.type || '') ? '1' : ''}">${icon(f.kind)}</span>
    <div class="cf-main"><div class="row between"><span class="title">${esc(f.name)}</span>${cloudBadge}</div>
      ${withEvent && c ? `<a class="cf-event" href="#/case/${esc(c.id)}/files">${esc(caseLine(c))}</a>` : ''}
      <div class="sub">${withEvent ? esc(kindLabel(f.kind)) + (sub.length ? ' · ' : '') : ''}${sub.map(esc).join(' · ')}</div>
      <div class="cf-acts"><button type="button" class="btn sm" data-share>${esc(t('cfShare'))}</button><button type="button" class="btn sm wa" data-wa>${esc(t('whatsapp'))}</button><button type="button" class="btn sm" data-mail>${esc(t('email'))}</button><button type="button" class="btn sm ghost" data-edit>${esc(t('cfEdit'))}</button>${copyBtn(shareText, { icon: true })}</div></div></div>`;
}
function wireRows(box, c) {
  box.querySelectorAll('.cf-row').forEach(el => {
    const f = db.get('casefiles', el.dataset.f); if (!f) return;
    const cs = c || db.get('cases', f.caseId) || {};
    el.onclick = e => { if (e.target.closest('button,a')) return; preview(f, cs); };
    el.querySelector('[data-share]').onclick = () => share(f, cs);
    el.querySelector('[data-wa]').onclick = () => whatsapp(f, cs);
    el.querySelector('[data-mail]').onclick = () => mail(f, cs);
    el.querySelector('[data-edit]').onclick = () => edit(f);
    const th = el.querySelector('[data-thumb="1"]');
    if (th) files.get(f.fileId).then(rec => { if (rec && rec.blob) { const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(rec.blob); img.onload = () => URL.revokeObjectURL(img.src); th.innerHTML = ''; th.appendChild(img); } }).catch(() => {});
  });
}

/* ---------------- saving: on the device first, then the cloud ---------------- */
/** A camera photo is shrunk to ~2000px JPEG so it uploads in a second; picked files are kept as they are. */
async function shrink(file) {
  if (!/^image\//.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 2 * 1024 * 1024) return file;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}
/** The first text of a PDF, for the kind guess; gives up after a few seconds (pdf.js comes from the network). */
function pdfHead(file) {
  return Promise.race([pdfText(file).then(x => String(x || '').slice(0, 800)), new Promise(res => setTimeout(() => res(''), 5000))]).catch(() => '');
}
/** Saves the files to this event: IndexedDB at once, metadata, then the cloud in the background. Returns the ids. */
export async function addFiles(c, list, preset, fromCamera) {
  const ids = [];
  for (let f of list || []) {
    if (fromCamera) f = await shrink(f);
    const name = f.name || (t('k_photo') + ' ' + Office.fmt(todayIso()) + '.jpg');
    let text = '';
    if (!(preset && preset.kind) && /pdf/i.test(f.type) && guessKind(name, f.type) === 'other') { toast(t('cfReading')); text = await pdfHead(f); }
    const fileId = await files.put(f, { title: name, kind: 'case', caseId: c.id });
    const meta = attachShared(c.id, { id: fileId, name, type: f.type, size: f.size, text }, m => db.put('casefiles', m), preset || {});
    ids.push(meta.id);
    upload(db.get('casefiles', meta.id));
  }
  if (ids.length) toast(ids.length === 1 ? t('cfSaved') : t('cfSavedN', { n: ids.length }));
  return ids;
}
async function upload(f) {
  if (!f || f.cloudOk || !cloud.isOn() || !cloudEligible(f)) return false;
  lastTry[f.id] = Date.now();
  const rec = await files.get(f.fileId).catch(() => null); if (!rec || !rec.blob) return false;
  const path = cloudPathFor(f.caseId, f, cloud.orgId());
  const ok = await cloud.uploadFile(BUCKET, path, rec.blob).catch(() => false);
  if (ok) db.put('casefiles', { id: f.id, cloudPath: BUCKET + '/' + path, cloudOk: true, uploadedAt: todayIso() });
  return ok;
}
/** Files that did not reach the cloud (offline, an error) go up on the next render, at most once a minute each. */
async function syncPending(list) {
  for (const f of list) { if (Date.now() - (lastTry[f.id] || 0) > 60000) await upload(f); }
}

/* ---------------- the file's bytes: device first, cloud second ---------------- */
async function blobOf(f) {
  const rec = await files.get(f.fileId).catch(() => null);
  if (rec && rec.blob) return rec.blob;
  if (f.cloudPath && cloud.isOn()) { const i = f.cloudPath.indexOf('/'); return cloud.downloadFileBlob(f.cloudPath.slice(0, i), f.cloudPath.slice(i + 1)).catch(() => null); }
  return null;
}
async function recOf(f) { const blob = await blobOf(f); return blob ? { blob, name: f.name, type: f.type || blob.type, title: f.name } : null; }

async function preview(f, c) {
  const rec = await recOf(f); if (!rec) { toast(t('cfOnDevice'), 3500); return; }
  const isImg = /^image\//.test(rec.type), isPdf = /pdf/i.test(rec.type) || /\.pdf$/i.test(f.name);
  if (!isImg && !isPdf) { downloadFile(rec); toast(t('cfNoPreview'), 3000); return; }
  const url = URL.createObjectURL(rec.blob);
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-card cf-preview"><div class="cf-head"><b>${esc(f.name)}</b><button type="button" class="btn sm ghost" data-x="cancel" aria-label="${esc(t('close'))}">✕</button></div>
    ${isImg ? `<img src="${url}" alt="${esc(f.name)}">` : `<iframe src="${url}" title="${esc(f.name)}"></iframe>`}
    <div class="row"><button type="button" class="btn sm primary" data-share>${esc(t('cfShare'))}</button><button type="button" class="btn sm" data-dl>${esc(t('cfDownload'))}</button><span class="sub">${esc([kindLabel(f.kind), humanSize(f.size), supName(f.supplierId)].filter(Boolean).join(' · '))}</span></div></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.dataset.x === 'cancel') close(); });
  wrap.querySelector('[data-share]').onclick = () => share(f, c, rec);
  wrap.querySelector('[data-dl]').onclick = () => downloadFile(rec);
}

/* ---------------- sending: she taps send, always ---------------- */
async function share(f, c, rec) {
  rec = rec || await recOf(f); if (!rec) { toast(t('cfOnDevice'), 3500); return; }
  if (!(await shareFile(rec, caseLine(c)))) { downloadFile(rec); toast(t('shareFallback'), 4000); }
}
/** The share sheet with the file (WhatsApp is on it); where the phone has no share sheet the file downloads and WhatsApp opens for her to pick the chat. */
async function whatsapp(f, c) {
  const rec = await recOf(f); if (!rec) { toast(t('cfOnDevice'), 3500); return; }
  if (await shareFile(rec, caseLine(c))) return;
  downloadFile(rec); toast(t('cfWaHint'), 5000);
  openWhatsAppPick([f.name, caseLine(c)].filter(Boolean).join(' · '));
}
async function mail(f, c) {
  const sp = f.supplierId ? db.get('suppliers', f.supplierId) : null;
  const to = (sp && sp.email) || c.email || '';
  const subject = [f.name, caseLine(c)].filter(Boolean).join(' · ');
  const body = t('cfMailBody', { file: f.name, event: caseLine(c) }) + '\n' + (db.setting('signer') || '');
  const r = await dialog(t('email'), `${field('to', t('cfMailTo'), to, { ltr: true, inputmode: 'email' })}${field('subject', t('cfMailSubject'), subject)}${field('text', t('cfMailText'), body, { type: 'textarea', rows: 6 })}
    <p class="hint">${esc(t('cfMailHint'))}</p><div class="row"><button type="button" class="btn sm" id="cfMailDl">${esc(t('cfDownload'))}</button>${copyOf('[name=text]')}</div>`, { ok: t('email') });
  const dl = document.querySelector('.modal #cfMailDl'); if (dl) dl.onclick = async () => { const rec = await recOf(f); if (rec) downloadFile(rec); else toast(t('cfOnDevice'), 3500); };
  const res = await r; if (!res) return;
  openMail(res.to, res.subject, res.text);
}

/* ---------------- edit and delete ---------------- */
async function edit(f) {
  const c = db.get('cases', f.caseId) || {};
  const linked = new Set(db.list('links', l => l.caseId === f.caseId).map(l => l.supplierId));
  const sups = db.list('suppliers').sort((a, b) => (linked.has(b.id) - linked.has(a.id)) || String(a.name).localeCompare(String(b.name), lang()));
  const r = dialog(f.name, `${field('name', t('cfName'), f.name)}<div class="grid2">${field('kind', t('cfKind'), f.kind || 'other', { type: 'select', options: KINDS.map(k => [k, kindLabel(k)]) })}${field('supplierId', t('supplier'), f.supplierId || '', { type: 'select', options: [['', t('cfNoSupplier')]].concat(sups.map(x => [x.id, x.name + (linked.has(x.id) ? ' ★' : '')])) })}</div>
    ${field('note', t('cfNote'), f.note || '')}${field('tags', t('cfTags'), (f.tags || []).join(', '))}
    <div class="sub">${esc([c.client, kindLabel(f.kind), humanSize(f.size), f.type].filter(Boolean).join(' · '))}</div>
    <div class="row end"><button type="button" class="btn danger sm" id="cfDel">${esc(t('delete'))}</button></div>`);
  // deleting: one file, one confirmation; the copy on the device goes, the cloud copy stays and the question says so
  const del = document.querySelector('.modal #cfDel');
  if (del) del.onclick = async () => {
    const modal = del.closest('.modal');
    if (!(await confirmDialog(t('cfDeleteQ', { name: f.name })))) return;
    if (modal) modal.remove();
    await files.remove(f.fileId).catch(() => {});
    db.remove('casefiles', f.id);
    toast(t('cfDeleted'), 3000);
  };
  const res = await r; if (!res) return;
  if (!db.get('casefiles', f.id)) return; // deleted meanwhile
  res.tags = String(res.tags || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean);
  res.name = String(res.name || '').trim() || f.name;
  db.put('casefiles', { id: f.id, name: res.name, kind: res.kind, supplierId: res.supplierId, note: res.note, tags: res.tags });
  toast(t('saved'));
}

/* ---------------- for the share target and other modules ---------------- */
/** Attaches a file to an event: an IndexedDB record from js/files.js ({id, blob, name...}), or a File/Blob that is stored first. */
export async function attachToCase(caseId, fileRec, extra) {
  let rec = fileRec;
  if (!rec.id || !rec.blob) { const id = await files.put(rec, { title: rec.name, kind: 'case', caseId }); rec = { id, name: rec.name, type: rec.type, size: rec.size }; }
  let text = '';
  if (/pdf/i.test(rec.type || '') && guessKind(rec.name, rec.type) === 'other') text = await pdfHead(rec.blob || rec);
  const meta = attachShared(caseId, { id: rec.id, name: rec.name, type: rec.type, size: rec.size, text }, m => db.put('casefiles', m), extra);
  upload(db.get('casefiles', meta.id));
  return meta;
}
/** A dialog that lists the active events; the file goes to the chosen one. Resolves with the metadata, or null. */
export async function pickCaseAndAttach(fileRec) {
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!cases.length) { toast(t('cfNoCases'), 3500); return null; }
  const r = await dialog(t('cfPickCase'), `<div class="sub ltr">${esc(fileRec.name || '')}</div>${field('caseId', t('cfEvent'), cases[0].id, { type: 'select', options: cases.map(c => [c.id, caseLine(c)]) })}${field('note', t('cfNote'), '')}`, { ok: t('cfAttach') });
  if (!r || !r.caseId) return null;
  const meta = await attachToCase(r.caseId, fileRec, { note: r.note || '' });
  toast(t('cfAttached'), 3000);
  return meta;
}
