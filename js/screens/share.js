/* What arrived through the phone's share sheet: a contact card from WhatsApp, a receipt photo, a supplier's message.
   Each item gets the one or two places it can go. Nothing is done until she taps. */
import { t } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, toast, empty } from '../ui.js';
import Office from '../logic/office.js';
import { parseContactsFile } from '../logic/contacts.js';
import { importContacts } from '../contactsImport.js';
import { files } from '../files.js';
import { saveReceiptFiles } from './receipts.js';

export const noLive = true;
const CACHE = 'bakasun-share';

async function readIndex() {
  try { const c = await caches.open(CACHE); const r = await c.match('./share-index'); return r ? await r.json() : []; } catch (e) { return []; }
}
async function writeIndex(list) {
  try { const c = await caches.open(CACHE); await c.put('./share-index', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { /* */ }
}
async function fileOf(item) {
  const c = await caches.open(CACHE); const r = await c.match(item.key); if (!r) return null;
  const blob = await r.blob(); return new File([blob], item.name || 'file', { type: item.type || blob.type });
}
async function drop(item) {
  const list = (await readIndex()).filter(x => x.key !== item.key || x.text !== item.text);
  await writeIndex(list);
  if (item.key) { try { const c = await caches.open(CACHE); await c.delete(item.key); } catch (e) { /* */ } }
}

const isContacts = it => /vcard|csv/i.test(it.type) || /\.(vcf|csv)$/i.test(it.name || '');
const isImage = it => /^image\//i.test(it.type) || /pdf/i.test(it.type) || /\.(jpe?g|png|webp|pdf)$/i.test(it.name || '');

export async function render({ root }) {
  const list = await readIndex();
  root.innerHTML = `<header class="top"><a class="icon" href="#/today" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('shared'))}</h1></header>
    <div class="stack sec">${list.length ? list.map((it, i) => card(it, i)).join('') : empty(t('nothingShared'))}
    <p class="hint">${esc(t('sharedHint'))}</p></div>`;
  root.querySelectorAll('[data-i]').forEach(el => {
    const it = list[+el.dataset.i];
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-contacts]', async () => {
      const f = await fileOf(it); if (!f) { toast(t('fileMissing')); return; }
      const n = importContacts(parseContactsFile(f.name, await f.text()));
      toast(t('imported', { n }), 3000); await drop(it); render({ root });
    });
    on('[data-receipt]', async () => {
      const f = await fileOf(it); if (!f) { toast(t('fileMissing')); return; }
      await saveReceiptFiles([f]); await drop(it); location.hash = '#/receipts';
    });
    on('[data-library]', async () => {
      const f = await fileOf(it); if (!f) { toast(t('fileMissing')); return; }
      await files.put(f, { title: f.name.replace(/\.[a-z0-9]+$/i, '') }); toast(t('saved')); await drop(it); render({ root });
    });
    on('[data-lead]', async () => { sessionStorage.setItem('bakasun.leadText', it.text || ''); await drop(it); location.hash = '#/lead'; });
    on('[data-offer]', async () => { sessionStorage.setItem('bakasun.sqText', it.text || ''); await drop(it); location.hash = '#/assist/supplier-quote'; });
    on('[data-cmd]', async () => { sessionStorage.setItem('bakasun.ask', it.text || ''); await drop(it); location.hash = '#/assist/from-today'; });
    on('[data-note]', async () => { db.put('notes', { text: it.text || '', about: '', aboutId: '', aboutLabel: t('shared'), lang: 'he' }); toast(t('saved')); await drop(it); render({ root }); });
    on('[data-drop]', async () => { await drop(it); render({ root }); });
  });
}

function card(it, i) {
  const head = it.text ? `<div class="sub" style="white-space:pre-wrap">${esc(it.text.length > 400 ? it.text.slice(0, 400) + '…' : it.text)}</div>` : `<div class="title ltr">${esc(it.name || '')}</div><div class="sub">${esc(it.type || '')}${it.size ? ' · ' + Math.round(it.size / 1024) + ' KB' : ''}</div>`;
  let btns = '';
  if (it.text) btns = `<button class="btn primary" data-lead>${esc(t('asLead'))}</button><button class="btn" data-offer>${esc(t('asOffer'))}</button><button class="btn" data-cmd>${esc(t('asCommand'))}</button><button class="btn ghost" data-note>${esc(t('asNote'))}</button>`;
  else if (isContacts(it)) btns = `<button class="btn primary" data-contacts>${esc(t('toContacts'))}</button>`;
  else if (isImage(it)) btns = `<button class="btn primary" data-receipt>${esc(t('toReceipts'))}</button><button class="btn" data-library>${esc(t('toLibrary'))}</button>`;
  else btns = `<button class="btn primary" data-library>${esc(t('toLibrary'))}</button>`;
  return `<div class="card stack" data-i="${i}">${head}<div class="row">${btns}<button class="btn sm ghost" data-drop>${esc(t('discard'))}</button></div></div>`;
}
