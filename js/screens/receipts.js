/* "צלם חשבונית": one tap opens the camera, the photo is shrunk, saved on the device and sent to the cloud, filed by month.
   At month end everything goes to the accountant in one mail (links) or through the share sheet (files). */
import { t, lang as uiLang } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, section, empty, dialog, toast, openMail, confirmDialog } from '../ui.js';
import Office from '../logic/office.js';
import { files, shareFile } from '../files.js';
import * as cloud from '../cloud.js';
import { monthOf, monthLabel, receiptPath, receiptsOf, receiptsTotal } from '../logic/receipts.js';
import { DEFAULTS } from '../data/defaults.js';

let month = '';
const BUCKET = 'receipts';

export function render(ctx) {
  const { root, id } = ctx;
  const s = db.settings();
  const all = db.list('receipts');
  const months = [...new Set(all.map(r => r.month || monthOf(r.date)))].sort().reverse();
  month = id && /^\d{4}-\d{2}$/.test(id) ? id : (month || months[0] || monthOf(new Date()));
  if (!months.includes(month)) months.unshift(month);
  const list = receiptsOf(all, month);
  const pending = all.filter(r => !r.cloudPath && r.localId).length;
  root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('receipts'))}</h1></header>
    <div class="card row">
      <label class="btn primary grow" id="snapBtn"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-5px"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg> ${esc(t('snapReceipt'))}<input type="file" id="snap" accept="image/*,application/pdf" capture="environment" hidden></label>
      <label class="btn" id="pickBtn">${esc(t('fromGallery'))}<input type="file" id="pick" accept="image/*,application/pdf" multiple hidden></label>
    </div>
    ${!cloud.isOn() ? `<p class="warnbox">${esc(t('receiptsLocal'))}</p>` : pending ? `<p class="warnbox">${esc(t('receiptsPending', { n: pending }))} <button class="btn sm" id="retry">${esc(t('retry'))}</button></p>` : ''}
    <div class="row"><select id="month" class="grow">${months.map(m => `<option value="${esc(m)}"${m === month ? ' selected' : ''}>${esc(monthLabel(m, uiLang()))}</option>`).join('')}</select><span class="badge muted"><span class="count">${list.length}</span> · ${esc(Office.money(receiptsTotal(list)))}</span></div>
    ${section(monthLabel(month, uiLang()), `<div class="list">${list.length ? list.map(r => `<div class="card" data-r="${esc(r.id)}"><div class="row between"><span class="title">${esc(r.supplier || t('receipt'))}</span><span class="ltr big">${r.amount ? esc(Office.money(r.amount)) : ''}</span></div>
      <div class="sub">${[r.date ? Office.fmt(r.date) : '', r.note, r.caseId ? (db.get('cases', r.caseId) || {}).client : '', r.cloudPath ? '☁' : (r.localId ? t('onDevice') : '')].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="row"><button class="btn sm" data-view>${esc(t('open'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-del>✕</button></div></div>`).join('') : empty(t('noReceipts'))}</div>
      <div class="row"><a class="btn" href="#/money">${esc(t('monthForAccountant'))}</a></div>`)}`;

  root.querySelector('#month').onchange = e => { month = e.target.value; render(ctx); };
  root.querySelector('#snap').onchange = e => addFiles([...e.target.files], ctx);
  root.querySelector('#pick').onchange = e => addFiles([...e.target.files], ctx);
  const rt = root.querySelector('#retry'); if (rt) rt.onclick = () => syncPending().then(() => render(ctx));
  root.querySelectorAll('.card[data-r]').forEach(el => {
    const r = db.get('receipts', el.dataset.r);
    el.querySelector('[data-view]').onclick = () => viewReceipt(r);
    el.querySelector('[data-edit]').onclick = () => editReceipt(r).then(ok => { if (ok) render(ctx); });
    el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { if (r.localId) files.remove(r.localId).catch(() => {}); db.remove('receipts', r.id); render(ctx); } };
  });
  if (ctx.query && ctx.query[0] === 'snap') { setTimeout(() => root.querySelector('#snap').click(), 200); }
  if (cloud.isOn() && pending) syncPending().then(n => { if (n) render(ctx); });
}

/** Shrinks a photo to ~1600px JPEG so it uploads in a second and stays readable. PDFs pass as they are. */
async function shrink(file) {
  if (!/^image\//.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    return blob ? new File([blob], (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}

/** Photos or PDFs → receipts: shrunk, saved on the device, details asked, uploaded. Returns the ids saved. Also used for files shared from other apps. */
export async function saveReceiptFiles(list, onUploaded) {
  const ids = [];
  for (const f of list) {
    const small = await shrink(f);
    const r = { date: todayIso(), month: monthOf(new Date()), supplier: '', amount: '', note: '', ext: /pdf/.test(small.type) ? '.pdf' : '.jpg', size: small.size };
    const id = db.put('receipts', r); r.id = id;
    const localId = await files.put(small, { id: 'rcpt-' + id, title: t('receipt') + ' ' + Office.fmt(r.date), kind: 'receipt' });
    db.put('receipts', { id, localId });
    r.localId = localId;
    const ok = await editReceipt(db.get('receipts', id), true);
    if (ok === false) { files.remove(localId).catch(() => {}); db.remove('receipts', id); continue; }
    ids.push(id);
    upload(db.get('receipts', id)).then(() => { if (onUploaded) onUploaded(); });
  }
  return ids;
}
async function addFiles(list, ctx) {
  await saveReceiptFiles(list, () => render(ctx));
  render(ctx);
}

/** Supplier, amount, note, event. Suppliers and contacts complete as she types. Voice comes from the keyboard's mic. */
async function editReceipt(r, isNew) {
  const names = [...new Set(db.list('suppliers').map(x => x.name).concat(db.list('contacts').map(x => x.name)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status) || c.id === r.caseId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const res = await dialog(isNew ? t('snapReceipt') : t('edit'), `<label class="f"><span>${esc(t('supplier'))}</span><input name="supplier" list="rcptNames" value="${esc(r.supplier || '')}" autocomplete="off"><datalist id="rcptNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
    <div class="grid2">${field('amount', t('amountGross'), r.amount || '', { type: 'number', inputmode: 'decimal' })}${field('date', t('date'), r.date || todayIso(), { type: 'date' })}</div>
    ${field('caseId', t('forCase'), r.caseId || '', { type: 'select', options: [['', '']].concat(cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')])) })}${field('note', t('note'), r.note || '')}`, { ok: t('save'), cancel: isNew ? t('delete') : t('cancel') });
  if (!res) return false;
  res.id = r.id; res.month = monthOf(res.date || r.date);
  const sp = db.list('suppliers').find(x => x.name === res.supplier); if (sp) res.supplierId = sp.id;
  db.put('receipts', res); return true;
}

async function upload(r) {
  if (!cloud.isOn() || !r.localId) return false;
  const rec = await files.get(r.localId); if (!rec) return false;
  const path = receiptPath(cloud.orgId(), r);
  const ok = await cloud.uploadFile(BUCKET, path, rec.blob).catch(() => false);
  if (ok) db.put('receipts', { id: r.id, cloudPath: path, uploadedAt: todayIso() });
  return ok;
}
/** Anything photographed offline goes up when the cloud is back. */
export async function syncPending() {
  let n = 0;
  for (const r of db.list('receipts', x => !x.cloudPath && x.localId)) { if (await upload(r)) n++; }
  return n;
}

async function viewReceipt(r) {
  let blob = null;
  if (r.localId) { const rec = await files.get(r.localId); blob = rec && rec.blob; }
  if (!blob && r.cloudPath) blob = await cloud.downloadFileBlob(BUCKET, r.cloudPath);
  if (!blob) { toast(t('fileMissing'), 3000); return; }
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-card" style="padding:8px"><div class="row between"><b>${esc(r.supplier || t('receipt'))}${r.amount ? ' · ' + esc(Office.money(r.amount)) : ''}</b><button type="button" class="btn sm ghost" data-x="cancel">✕</button></div>${/pdf/.test(blob.type) ? `<iframe src="${url}" style="width:100%;height:70vh;border:0"></iframe>` : `<img src="${url}" style="width:100%;border-radius:10px">`}<div class="row"><button type="button" class="btn sm" data-share>${esc(t('shareFile'))}</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.dataset.x === 'cancel') { wrap.remove(); URL.revokeObjectURL(url); } });
  wrap.querySelector('[data-share]').onclick = () => shareFile({ blob, name: 'receipt-' + (r.date || '') + (r.ext || '.jpg'), type: blob.type, title: r.supplier || t('receipt') }, [r.supplier, r.amount ? Office.money(r.amount) : '', r.note].filter(Boolean).join(' · '));
}

/** The month to the accountant: the report with a link to every receipt (cloud), or the files through the share sheet. */
export async function sendMonth(ym, reportText, subject, to) {
  const list = receiptsOf(db.list('receipts'), ym);
  const links = [];
  if (cloud.isOn()) { for (const r of list) { if (!r.cloudPath) await upload(r); const rr = db.get('receipts', r.id); links.push(rr.cloudPath ? await cloud.signedUrl(BUCKET, rr.cloudPath, 30 * 24 * 3600).catch(() => '') : ''); } }
  const { receiptsMailText } = await import('../logic/receipts.js');
  const text = receiptsMailText(ym, list, links, reportText);
  const r = await dialog(t('monthForAccountant') + ' · ' + monthLabel(ym, uiLang()), `${field('to', t('fEmail'), to || '', { ltr: true, inputmode: 'email' })}<textarea name="text" rows="12">${esc(text)}</textarea>
    <p class="hint">${esc(cloud.isOn() ? t('monthLinksHint') : t('monthFilesHint'))}</p>${list.length ? `<div class="row"><button type="button" class="btn sm" id="shareFiles">${esc(t('shareFiles', { n: list.length }))}</button></div>` : ''}`, { ok: t('email') });
  const sf = document.querySelector('.modal #shareFiles'); if (sf) sf.onclick = async () => {
    const fs = []; for (const x of list) { const rec = x.localId ? await files.get(x.localId) : null; const blob = rec ? rec.blob : (x.cloudPath ? await cloud.downloadFileBlob(BUCKET, x.cloudPath) : null); if (blob) fs.push(new File([blob], (x.date || '') + '-' + (x.supplier || 'receipt').replace(/[^\w֐-׿]+/g, '-') + (x.ext || '.jpg'), { type: blob.type })); }
    try { if (navigator.canShare && navigator.canShare({ files: fs })) await navigator.share({ files: fs, title: subject, text: subject }); else toast(t('shareFallback'), 4000); } catch (e) { /* closed */ }
  };
  const res = await r; if (!res) return false;
  if (res.to && !db.setting('accountantEmail')) db.setting('accountantEmail', res.to);
  if (openMail(res.to, subject, res.text)) { const sent = JSON.parse(db.setting('monthsSent') || '[]'); if (!sent.includes(ym)) { sent.push(ym); db.setting('monthsSent', JSON.stringify(sent)); } return true; }
  return false;
}
